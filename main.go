package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const appVersion = "3.2.0-test3"

//go:embed web
var webFS embed.FS

var (
	token    string
	port     int
	cfgDir   string
	lastPing atomic.Int64
)

type Item struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
	Rom    string `json:"rom"`
	Args   string `json:"args"`
	Name   string `json:"name"`
	Source string `json:"source"`
}

type result struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

var argRe = regexp.MustCompile(`"([^"]*)"|(\S+)`)

func splitArgs(s string) []string {
	var out []string
	for _, m := range argRe.FindAllStringSubmatch(s, -1) {
		if m[2] != "" {
			out = append(out, m[2])
		} else {
			out = append(out, m[1])
		}
	}
	return out
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, v any) error {
	b, err := io.ReadAll(io.LimitReader(r.Body, 20<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func start(name string, args []string, dir string) result {
	cmd := exec.Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return result{false, err.Error()}
	}
	go cmd.Wait()
	return result{OK: true}
}

func findBrowser() string {
	var c []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		c = append(c,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
	}
	for _, p := range c {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func profileDir() string { return filepath.Join(cfgDir, "profile") }

// openApp opens a web address (Jellyfin, ErsatzTV...) in its own app window.
func openApp(u string) result {
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return result{false, "Web address must start with http:// or https://"}
	}
	// Discord: use the installed desktop app instead of a browser window when it is there
	if strings.Contains(strings.ToLower(u), "discord.com") {
		if la := os.Getenv("LOCALAPPDATA"); la != "" {
			if up := filepath.Join(la, "Discord", "Update.exe"); fileExists(up) {
				return start(up, []string{"--processStart", "Discord.exe"}, "")
			}
		}
	}
	if br := findBrowser(); br != "" {
		return start(br, []string{"--app=" + u, "--user-data-dir=" + profileDir(), "--no-first-run", "--window-size=1280,800", "--autoplay-policy=no-user-gesture-required", "--disable-features=HardwareMediaKeyHandling,MediaSessionService"}, "")
	}
	return start("rundll32.exe", []string{"url.dll,FileProtocolHandler", u}, "")
}

func launch(it Item) result {
	switch it.Kind {
	case "url":
		return openApp(it.Target)
	case "uri":
		if strings.HasPrefix(strings.ToLower(it.Target), "shell:") {
			if t := strings.ToLower(it.Target + " " + it.Name); strings.Contains(t, "applemusic") || strings.Contains(t, "apple music") {
				go appleBackground()
			}
			return start("explorer.exe", []string{it.Target}, "")
		}
		if t := strings.ToLower(it.Target + " " + it.Name); strings.Contains(t, "applemusic") || strings.Contains(t, "apple music") {
			go appleBackground()
		}
		return start("rundll32.exe", []string{"url.dll,FileProtocolHandler", it.Target}, "")
	case "exe", "rom":
		if _, err := os.Stat(it.Target); err != nil {
			return result{false, "Program not found: " + it.Target}
		}
		a := it.Args
		if it.Kind == "rom" {
			if it.Rom == "" {
				return result{false, "No game file set"}
			}
			if _, err := os.Stat(it.Rom); err != nil {
				return result{false, "Game file not found: " + it.Rom}
			}
			if a == "" {
				a = `"{rom}"`
			}
		}
		args := splitArgs(a)
		for i := range args {
			args[i] = strings.ReplaceAll(args[i], "{rom}", it.Rom)
		}
		return start(it.Target, args, filepath.Dir(it.Target))
	}
	return result{false, "Unknown launch type"}
}

func steamRoots(custom string) []string {
	var c []string
	if custom != "" {
		c = append(c, custom)
	}
	reg := exec.Command("reg", "query", `HKCU\Software\Valve\Steam`, "/v", "SteamPath")
	hide(reg)
	if out, err := reg.Output(); err == nil {
		if m := regexp.MustCompile(`SteamPath\s+REG_SZ\s+(.+)`).FindSubmatch(out); m != nil {
			c = append(c, filepath.FromSlash(strings.TrimSpace(string(m[1]))))
		}
	}
	c = append(c, `C:\Program Files (x86)\Steam`, `C:\Program Files\Steam`)
	var ok []string
	for _, r := range c {
		if st, err := os.Stat(filepath.Join(r, "steamapps")); err == nil && st.IsDir() {
			ok = append(ok, r)
		}
	}
	return ok
}

func scanSteam(custom string) map[string]any {
	roots := steamRoots(custom)
	if len(roots) == 0 {
		return map[string]any{"ok": false, "error": "Couldn't find Steam. Set its folder in Settings."}
	}
	libs := map[string]string{}
	addLib := func(p string) {
		k := strings.ToLower(filepath.Clean(filepath.FromSlash(p)))
		if _, ok := libs[k]; !ok {
			libs[k] = p
		}
	}
	addLib(roots[0])
	if b, err := os.ReadFile(filepath.Join(roots[0], "steamapps", "libraryfolders.vdf")); err == nil {
		for _, m := range regexp.MustCompile(`"path"\s+"([^"]+)"`).FindAllSubmatch(b, -1) {
			addLib(strings.ReplaceAll(string(m[1]), `\\`, `\`))
		}
	}
	skip := regexp.MustCompile(`(?i)Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR`)
	nameRe := regexp.MustCompile(`"name"\s+"([^"]+)"`)
	fileRe := regexp.MustCompile(`^appmanifest_(\d+)\.acf$`)
	items := []map[string]string{}
	seen := map[string]bool{}
	for _, lib := range libs {
		dir := filepath.Join(lib, "steamapps")
		ents, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range ents {
			m := fileRe.FindStringSubmatch(e.Name())
			if m == nil {
				continue
			}
			b, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil {
				continue
			}
			nm := nameRe.FindSubmatch(b)
			if nm == nil || skip.Match(nm[1]) {
				continue
			}
			if seen[m[1]] {
				continue
			}
			seen[m[1]] = true
			items = append(items, map[string]string{
				"id": "steam-" + m[1], "name": string(nm[1]), "category": "game", "kind": "uri",
				"target": "steam://rungameid/" + m[1], "source": "Steam", "appid": m[1],
			})
		}
	}
	return map[string]any{"ok": true, "items": items}
}

func startApps() map[string]any {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command",
		"try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }; Get-StartApps | Sort-Object Name | ConvertTo-Json -Compress")
	hide(cmd)
	out, err := cmd.Output()
	if err != nil {
		return map[string]any{"ok": false, "error": "Start menu import only works on Windows.", "apps": []any{}}
	}
	out = bytes.TrimPrefix(bytes.TrimSpace(out), []byte("\xef\xbb\xbf"))
	type sa struct{ Name, AppID string }
	var arr []sa
	if json.Unmarshal(out, &arr) != nil {
		var one sa
		if json.Unmarshal(out, &one) == nil && one.Name != "" {
			arr = []sa{one}
		}
	}
	apps := []map[string]string{}
	for _, a := range arr {
		apps = append(apps, map[string]string{"name": a.Name, "id": a.AppID})
	}
	return map[string]any{"ok": true, "apps": apps}
}

func pick(mode, kind string) string {
	filter := "All files (*.*)|*.*"
	switch kind {
	case "exe":
		filter = "Programs (*.exe;*.bat;*.cmd)|*.exe;*.bat;*.cmd|All files (*.*)|*.*"
	case "image":
		filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.gif|All files (*.*)|*.*"
	}
	var body string
	if mode == "folder" {
		body = `$d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog($t) -eq 'OK') { $d.SelectedPath }`
	} else {
		body = fmt.Sprintf(`$d = New-Object System.Windows.Forms.OpenFileDialog; $d.Filter = '%s'; if ($d.ShowDialog($t) -eq 'OK') { $d.FileName }`, filter)
	}
	script := `try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }; Add-Type -AssemblyName System.Windows.Forms; ` +
		`$t = New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; ` + body
	cmd := exec.Command("powershell.exe", psEnc(script, false, "-STA")...)
	hide(cmd)
	out, _ := cmd.Output()
	return strings.TrimSpace(strings.TrimPrefix(string(out), "\ufeff"))
}

var audioExt = map[string]string{
	".mp3": "audio/mpeg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
	".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/ogg",
}
var imageExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".gif": true, ".svg": true, ".ico": true}

func scanMusic(folder string) []map[string]string {
	var paths []string
	root := filepath.Clean(folder)
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			rel, _ := filepath.Rel(root, p)
			if rel != "." && strings.Count(rel, string(filepath.Separator)) >= 6 {
				return filepath.SkipDir
			}
			return nil
		}
		if len(paths) >= 8000 {
			return filepath.SkipAll
		}
		if _, ok := audioExt[strings.ToLower(filepath.Ext(p))]; ok {
			paths = append(paths, p)
		}
		return nil
	})
	out := make([]map[string]string, len(paths))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for i, p := range paths {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, p string) {
			defer wg.Done()
			defer func() { <-sem }()
			t, _ := readTags(p, false)
			fillFromPath(&t, p)
			e := map[string]string{"title": t.Title, "artist": t.Artist, "album": t.Album, "url": "/file?p=" + url.QueryEscape(p)}
			if t.HasArt || folderArt(filepath.Dir(p)) != "" {
				e["cover"] = "/api/cover?p=" + url.QueryEscape(p)
			}
			out[i] = e
		}(i, p)
	}
	wg.Wait()
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if x, y := strings.ToLower(a["artist"]), strings.ToLower(b["artist"]); x != y {
			return x < y
		}
		if x, y := strings.ToLower(a["album"]), strings.ToLower(b["album"]); x != y {
			return x < y
		}
		return strings.ToLower(a["title"]) < strings.ToLower(b["title"])
	})
	return out
}

func setBoot(on bool) {
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	var cmd *exec.Cmd
	if on {
		exe, _ := os.Executable()
		cmd = exec.Command("reg", "add", key, "/v", "HollywoodArcade", "/t", "REG_SZ", "/d", `"`+exe+`"`, "/f")
	} else {
		cmd = exec.Command("reg", "delete", key, "/v", "HollywoodArcade", "/f")
	}
	hide(cmd)
	cmd.Run()
}

func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != fmt.Sprintf("127.0.0.1:%d", port) && r.Host != fmt.Sprintf("localhost:%d", port) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if (r.URL.Path == "/" || r.URL.Path == "/overlay.html" || r.URL.Path == "/toast.html") && r.URL.Query().Get("k") == token {
			http.SetCookie(w, &http.Cookie{Name: "ha", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			http.Redirect(w, r, r.URL.Path, http.StatusFound)
			return
		}
		if c, err := r.Cookie("ha"); err != nil || c.Value != token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func buildMux() *http.ServeMux {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(webFS, "web")
	static := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		static.ServeHTTP(w, r)
	}))

	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().Unix())
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/load", func(w http.ResponseWriter, r *http.Request) {
		libMu.Lock()
		b, err := os.ReadFile(filepath.Join(cfgDir, "library.json"))
		if err == nil && !json.Valid(b) {
			// the file is damaged: use the newest good backup instead of starting from an empty library
			arcLog("library.json could not be read, looking for a backup")
			b = nil
			for _, n := range backupNames() {
				if bb, e := os.ReadFile(filepath.Join(backupDir(), n)); e == nil && json.Valid(bb) {
					b = bb
					arcLog("Restored the library from backup " + n)
					break
				}
			}
		}
		libMu.Unlock()
		if err != nil || b == nil {
			b = []byte("null")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/api/save", func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(io.LimitReader(r.Body, 20<<20))
		if err != nil || !json.Valid(b) {
			writeJSON(w, result{false, "bad data"})
			return
		}
		libMu.Lock()
		defer libMu.Unlock()
		rotateBackup()
		if err := writeFileSafe(filepath.Join(cfgDir, "library.json"), b); err != nil {
			arcLog("Saving the library failed: " + err.Error())
			writeJSON(w, result{false, "Couldn't save: " + err.Error()})
			return
		}
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/launch", func(w http.ResponseWriter, r *http.Request) {
		var it Item
		if err := readJSON(r, &it); err != nil {
			writeJSON(w, result{false, "bad request"})
			return
		}
		before := windowSnapshot()
		res := launch(it)
		if res.OK {
			setNowPlaying(it)
			go raiseLaunched(before, it.Name, it.Target)
		}
		writeJSON(w, res)
	})
	mux.HandleFunc("/api/pick", func(w http.ResponseWriter, r *http.Request) {
		var o struct{ Mode, Kind string }
		readJSON(r, &o)
		writeJSON(w, map[string]string{"path": pick(strings.ToLower(o.Mode), strings.ToLower(o.Kind))})
	})
	mux.HandleFunc("/api/scanSteam", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, scanSteam(r.URL.Query().Get("path")))
	})
	mux.HandleFunc("/api/startApps", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, startApps()) })
	mux.HandleFunc("/api/scanMusic", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, scanMusic(r.URL.Query().Get("folder")))
	})
	mux.HandleFunc("/api/applySettings", func(w http.ResponseWriter, r *http.Request) {
		var s struct {
			StartWithWindows bool  `json:"startWithWindows"`
			ShellMode        *bool `json:"shellMode"`
		}
		readJSON(r, &s)
		setBoot(s.StartWithWindows)
		if s.ShellMode != nil {
			setShell(*s.ShellMode)
		}
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/scanAll", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, scanAll(r.URL.Query().Get("path")))
	})
	mux.HandleFunc("/api/scanFolder", func(w http.ResponseWriter, r *http.Request) {
		res := scanFolderGames(r.URL.Query().Get("path"), "My games")
		if res == nil {
			res = []game{}
		}
		writeJSON(w, res)
	})
	mux.HandleFunc("/api/scanRoms", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, scanRoms(r.URL.Query().Get("folder"), r.URL.Query().Get("exts")))
	})
	mux.HandleFunc("/api/media", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Action string `json:"action"`
			N      int    `json:"n"`
		}
		readJSON(r, &o)
		if o.Action == "next" || o.Action == "prev" || o.Action == "playpause" {
			if res, handled := smtcControl(o.Action); handled {
				writeJSON(w, res)
				return
			}
		}
		vk, ok := mediaKeys[o.Action]
		if !ok {
			writeJSON(w, result{false, "unknown action"})
			return
		}
		if o.N < 1 {
			o.N = 1
		}
		if o.N > 20 {
			o.N = 20
		}
		for i := 0; i < o.N; i++ {
			pressKey(vk)
			time.Sleep(15 * time.Millisecond)
		}
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/overlay", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Action string `json:"action"`
		}
		readJSON(r, &o)
		switch o.Action {
		case "back": // dismissed (B, Esc, the Guide button): go back to what was in front before
			toggleOverlayTo(true, true)
		case "close": // closed because something was chosen: stay where that choice took us
			toggleOverlayTo(true, false)
		default:
			toggleOverlayTo(false, true)
		}
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/file", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("p")
		ext := strings.ToLower(filepath.Ext(p))
		ct, isAudio := audioExt[ext]
		if !isAudio && !imageExt[ext] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			http.NotFound(w, r)
			return
		}
		if isAudio {
			w.Header().Set("Content-Type", ct)
		}
		http.ServeFile(w, r, p)
	})
	registerExtras(mux)
	return mux
}

var mediaKeys = map[string]byte{
	"playpause": 0xB3, "next": 0xB0, "prev": 0xB1, "stop": 0xB2,
	"mute": 0xAD, "voldown": 0xAE, "volup": 0xAF,
}

var (
	overlayMu       sync.Mutex
	overlayCmd      *exec.Cmd
	overlaySpawning bool
	hotkeyLabel     atomic.Value
)

// toggleOverlay opens (or closes) the small always-on-top music/volume panel.
const overlayTitle = "Hollywood Arcade Overlay"

func killOverlay() {
	overlayMu.Lock()
	defer overlayMu.Unlock()
	if overlayCmd != nil && overlayCmd.Process != nil {
		overlayCmd.Process.Kill()
	}
	go killToast()
}

func toggleOverlay(closeOnly bool) { toggleOverlayTo(closeOnly, true) }

// toggleOverlayTo is toggleOverlay with a choice about whether closing hands the screen back to the game.
func toggleOverlayTo(closeOnly, back bool) {
	overlayMu.Lock()
	defer overlayMu.Unlock()
	// the panel window stays alive hidden, so showing it is instant and nothing gets launched twice
	if h := findWindow(overlayTitle, true); h != 0 {
		if windowVisible(h) {
			hideWindow(h)
			arcLog("Guide: closed")
			if back {
				go returnToGame()
			}
		} else if !closeOnly {
			noteForeground()
			showOnTop(h)
			arcLog("Guide: shown")
		}
		return
	}
	if closeOnly || overlaySpawning {
		return
	}
	spawnOverlay(true)
}

// spawnOverlay starts the Guide window. With show false it is hidden again as soon as it exists, so the
// first button press later is instant (starting a browser takes a few seconds).
func spawnOverlay(show bool) {
	br := findBrowser()
	if br == "" {
		arcLog("Guide: no Edge or Chrome found to draw it")
		return
	}
	u := fmt.Sprintf("http://127.0.0.1:%d/overlay.html?k=%s", port, token)
	args := []string{"--app=" + u, "--user-data-dir=" + filepath.Join(cfgDir, "profile-overlay"),
		"--no-first-run", "--autoplay-policy=no-user-gesture-required", "--window-size=1060,640", "--disable-features=Translate,HardwareMediaKeyHandling,MediaSessionService"}
	if !show {
		// get ready in the background: open far off-screen so it can never flash up before it is hidden
		args = append(args, "--window-position=-32000,-32000")
	}
	cmd := exec.Command(br, args...)
	if err := cmd.Start(); err != nil {
		arcLog("Guide: could not start the window: " + err.Error())
		return
	}
	overlayCmd = cmd
	overlaySpawning = true
	go func() {
		defer func() { overlayMu.Lock(); overlaySpawning = false; overlayMu.Unlock() }()
		for i := 0; i < 1000; i++ { // wait for the window to exist (checked often, so a hidden one is gone at once)
			time.Sleep(20 * time.Millisecond)
			if h := findWindow(overlayTitle, true); h != 0 {
				if show {
					noteForeground()
					showOnTop(h)
					arcLog("Guide: window opened")
				} else {
					hideWindow(h)
				}
				return
			}
		}
		arcLog("Guide: the window never appeared after 20 seconds")
	}()
}

// prewarmOverlay readies the Guide window in the background a few seconds after start-up.
func prewarmOverlay() {
	time.Sleep(6 * time.Second)
	overlayMu.Lock()
	defer overlayMu.Unlock()
	if findWindow(overlayTitle, true) != 0 || overlaySpawning {
		return
	}
	spawnOverlay(false)
}

var tagRe = regexp.MustCompile(`\s*[\(\[][^\)\]]*[\)\]]`)

func cleanName(base string) string {
	n := strings.TrimSpace(tagRe.ReplaceAllString(strings.ReplaceAll(base, "_", " "), ""))
	if n == "" {
		return base
	}
	return n
}

func scanRoms(folder, exts string) []map[string]string {
	want := map[string]bool{}
	for _, e := range strings.Split(exts, ",") {
		e = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(e), "."))
		if e != "" {
			want["."+e] = true
		}
	}
	out := []map[string]string{}
	if len(want) == 0 || folder == "" {
		return out
	}
	root := filepath.Clean(folder)
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			rel, _ := filepath.Rel(root, p)
			if rel != "." && strings.Count(rel, string(filepath.Separator)) >= 7 {
				return filepath.SkipDir
			}
			return nil
		}
		if len(out) >= 10000 {
			return filepath.SkipAll
		}
		if want[strings.ToLower(filepath.Ext(p))] {
			out = append(out, map[string]string{"path": p, "name": cleanName(strings.TrimSuffix(d.Name(), filepath.Ext(d.Name())))})
		}
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i]["name"]) < strings.ToLower(out[j]["name"]) })
	return out
}

func wantsFullscreen() bool {
	b, err := os.ReadFile(filepath.Join(cfgDir, "library.json"))
	if err != nil {
		return false
	}
	var d struct {
		Settings struct {
			Fullscreen bool `json:"fullscreen"`
			ShellMode  bool `json:"shellMode"`
		} `json:"settings"`
	}
	json.Unmarshal(b, &d)
	return d.Settings.Fullscreen || d.Settings.ShellMode
}

func main() {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	cfgDir = filepath.Join(base, "HollywoodArcade")
	os.MkdirAll(cfgDir, 0o755)
	for _, a := range os.Args[1:] {
		switch a {
		case "--restore-shell":
			setShell(false)
			startExplorer()
			return
		case "--desktop":
			startExplorer()
			return
		}
	}

	if !singleInstance() {
		ok := false
		for _, a := range os.Args[1:] {
			if a == "--updated" { // the old copy is still shutting down: give it a moment
				for i := 0; i < 30 && !ok; i++ {
					time.Sleep(500 * time.Millisecond)
					ok = singleInstance()
				}
			}
		}
		if !ok {
			return // already running: never open a second copy
		}
	}
	updateStartup()

	raw := make([]byte, 16)
	rand.Read(raw)
	token = hex.EncodeToString(raw)

	addr := "127.0.0.1:0"
	if p := os.Getenv("HA_PORT"); p != "" {
		addr = "127.0.0.1:" + p
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		os.Exit(1)
	}
	port = ln.Addr().(*net.TCPAddr).Port
	go http.Serve(ln, guard(buildMux()))
	startHotkey(func() { toggleOverlay(false) })
	startPadChord(func() { toggleOverlay(false) })
	startPadKeys()
	if os.Getenv("HA_NOWINDOW") == "" {
		go prewarmOverlay()
	}
	go presenceLoop()

	u := fmt.Sprintf("http://127.0.0.1:%d/?k=%s", port, token)
	if os.Getenv("HA_NOWINDOW") != "" {
		fmt.Println(u)
		select {}
	}

	began := time.Now()
	if br := findBrowser(); br != "" {
		args := []string{"--app=" + u, "--user-data-dir=" + profileDir(), "--no-first-run", "--window-size=1440,900",
			"--autoplay-policy=no-user-gesture-required", "--disable-features=Translate,HardwareMediaKeyHandling,MediaSessionService"}
		if wantsFullscreen() {
			args = append(args, "--start-fullscreen")
		}
		quick := 0
		for {
			began = time.Now()
			cmd := exec.Command(br, args...)
			cmd.Run()
			// Acting as the Windows shell: the window closing must never leave an empty screen.
			if readSettingBool("shellMode") && !exiting.Load() {
				if time.Since(began) >= 5*time.Second {
					quick = 0
					continue // the person closed the window: bring it back
				}
				// Returned at once: Edge handed the window to a copy that is already running.
				// Wait until that window stops checking in instead of opening more.
				quick++
				if quick >= 3 {
					startExplorer() // something is wrong: make sure there is always a desktop
					os.Exit(0)
				}
				for i := 0; i < 24; i++ {
					time.Sleep(5 * time.Second)
					if lp := lastPing.Load(); lp != 0 && time.Now().Unix()-lp < 30 {
						i = 0
					}
				}
				continue
			}
			break
		}
		if time.Since(began) > 5*time.Second {
			killOverlay()
			os.Exit(0)
		}
	} else {
		start("rundll32.exe", []string{"url.dll,FileProtocolHandler", u}, "")
	}

	// Fallback: stay alive until the window stops checking in.
	for {
		time.Sleep(5 * time.Second)
		lp := lastPing.Load()
		now := time.Now().Unix()
		if (lp != 0 && now-lp > 150) || (lp == 0 && time.Since(began) > 90*time.Second) {
			killOverlay()
			os.Exit(0)
		}
	}
}
