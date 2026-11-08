package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// In-app updates. The release page of the project's GitHub repository is the only source. A download is
// installed only after its SHA-256 matches the checksum file published next to it, and if the new version
// cannot stay running the old one is put back automatically.

const updateRepo = "ovrunoffical/Hollywood-Arcade"

var updMu sync.Mutex

type relInfo struct {
	Tag, Notes, URL, SumURL, Page string
	Size                          int64
	Newer                         bool
}

func verParts(v string) [3]int {
	var o [3]int
	for i, p := range strings.SplitN(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(v)), "v"), ".", 3) {
		n, _ := strconv.Atoi(strings.TrimFunc(p, func(r rune) bool { return r < '0' || r > '9' }))
		o[i] = n
	}
	return o
}

func verNewerGo(a, b string) bool {
	x, y := verParts(a), verParts(b)
	for i := 0; i < 3; i++ {
		if x[i] != y[i] {
			return x[i] > y[i]
		}
	}
	return false
}

func latestRelease() (relInfo, error) {
	var rel map[string]any
	if err := getJSON(ghAPIURL+"/repos/"+updateRepo+"/releases/latest", map[string]string{"Accept": "application/vnd.github+json"}, &rel); err != nil {
		return relInfo{}, errors.New("Couldn't reach GitHub")
	}
	ri := relInfo{Tag: js(rel["tag_name"]), Notes: js(rel["body"]), Page: js(rel["html_url"])}
	if len(ri.Notes) > 1500 {
		ri.Notes = ri.Notes[:1500] + "…"
	}
	assets, _ := rel["assets"].([]any)
	for _, a := range assets {
		m := jm(a)
		n := strings.ToLower(js(m["name"]))
		switch {
		case n == "hollywoodarcade.exe":
			ri.URL = js(m["browser_download_url"])
			if f, ok := m["size"].(float64); ok {
				ri.Size = int64(f)
			}
		case n == "hollywoodarcade.exe.sha256":
			ri.SumURL = js(m["browser_download_url"])
		}
	}
	ri.Newer = ri.Tag != "" && verNewerGo(ri.Tag, appVersion)
	return ri, nil
}

func updClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 6 || !hostOK(req.URL.String()) {
			return errors.New("blocked redirect")
		}
		return nil
	}}
}

func fetchBytes(u string, limit int64) ([]byte, error) {
	if !hostOK(u) {
		return nil, errors.New("blocked address")
	}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/"+appVersion)
	resp, err := updClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

func updDir() string { d := filepath.Join(cfgDir, "update"); os.MkdirAll(d, 0o755); return d }

type updPending struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Attempts int    `json:"attempts"`
}

func readPending() (updPending, bool) {
	var p updPending
	b, err := os.ReadFile(filepath.Join(updDir(), "pending.json"))
	if err != nil || json.Unmarshal(b, &p) != nil {
		return p, false
	}
	return p, true
}

func writePending(p updPending) {
	b, _ := json.Marshal(p)
	os.WriteFile(filepath.Join(updDir(), "pending.json"), b, 0o644)
}

// installUpdate downloads, verifies and swaps in the new program file, then restarts.
func installUpdate() (string, error) {
	updMu.Lock()
	defer updMu.Unlock()
	ri, err := latestRelease()
	if err != nil {
		return "", err
	}
	if !ri.Newer {
		return "", errors.New("You already have the latest version")
	}
	if ri.URL == "" || ri.SumURL == "" {
		return "", errors.New("This release has no program file or checksum yet")
	}
	sumTxt, err := fetchBytes(ri.SumURL, 4096)
	if err != nil {
		return "", errors.New("Couldn't download the checksum")
	}
	want := ""
	if f := strings.Fields(string(sumTxt)); len(f) > 0 {
		want = strings.ToLower(f[0])
	}
	if len(want) != 64 {
		return "", errors.New("The checksum file looks wrong")
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if r, e := filepath.EvalSymlinks(exe); e == nil {
		exe = r
	}
	data, err := fetchBytes(ri.URL, 120<<20)
	if err != nil {
		return "", errors.New("Download failed: " + err.Error())
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != want {
		arcLog("Update: checksum mismatch, nothing installed")
		return "", errors.New("The download didn't match its checksum, so it was not installed")
	}
	if len(data) < 1<<20 || (runtime.GOOS == "windows" && string(data[:2]) != "MZ") {
		return "", errors.New("The download doesn't look like a program")
	}
	newp, oldp := exe+".new", exe+".old"
	if err := os.WriteFile(newp, data, 0o755); err != nil {
		return "", errors.New("Can't write next to Hollywood Arcade. Move it out of Program Files and try again")
	}
	os.Remove(oldp)
	if err := os.Rename(exe, oldp); err != nil {
		os.Remove(newp)
		return "", errors.New("Couldn't replace the program: " + err.Error())
	}
	if err := os.Rename(newp, exe); err != nil {
		os.Rename(oldp, exe) // put the old one back
		return "", errors.New("Couldn't put the new program in place: " + err.Error())
	}
	writePending(updPending{From: appVersion, To: strings.TrimPrefix(ri.Tag, "v")})
	arcLog("Update: installed " + ri.Tag + " over " + appVersion + ", restarting")
	go restartSelf(exe)
	return strings.TrimPrefix(ri.Tag, "v"), nil
}

// restartSelf closes Arcade's windows and starts the new program file. The old copy stays alive (invisible) for
// half a minute: if the new one crashes in that time, the old one is put back and started again.
func restartSelf(exe string) {
	time.Sleep(600 * time.Millisecond)
	exiting.Store(true)
	killOverlay()
	closeMainWindows()
	releaseSingleton()
	time.Sleep(1200 * time.Millisecond)
	c := exec.Command(exe, "--updated")
	hide(c)
	if err := c.Start(); err != nil {
		arcLog("Update: could not restart: " + err.Error())
		rollbackUpdate(exe)
		return
	}
	done := make(chan error, 1)
	go func() { done <- c.Wait() }()
	select {
	case err := <-done:
		var ee *exec.ExitError
		if errors.As(err, &ee) && ee.ExitCode() != 0 {
			arcLog(fmt.Sprintf("Update: the new version crashed on start (code %d)", ee.ExitCode()))
			rollbackUpdate(exe)
			return
		}
	case <-time.After(30 * time.Second):
	}
	os.Exit(0)
}

// rollbackUpdate puts the previous program file back and starts it.
func rollbackUpdate(exe string) {
	os.Remove(exe + ".bad")
	os.Rename(exe, exe+".bad")
	if err := os.Rename(exe+".old", exe); err != nil {
		arcLog("Update: could not restore the old version: " + err.Error())
		return
	}
	os.Remove(filepath.Join(updDir(), "pending.json"))
	c := exec.Command(exe)
	hide(c)
	c.Start()
	time.Sleep(300 * time.Millisecond)
	os.Exit(0)
}

// updateStartup runs first thing at launch. It restores the previous version if a fresh update keeps failing,
// and confirms a good update once the new version has stayed up for a while.
func updateStartup() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	if r, e := filepath.EvalSymlinks(exe); e == nil {
		exe = r
	}
	os.Remove(exe + ".new")
	p, ok := readPending()
	if !ok {
		os.Remove(exe + ".old") // nothing pending: an old copy is no longer needed
		return
	}
	p.Attempts++
	writePending(p)
	if p.Attempts > 3 && fileExists(exe+".old") {
		arcLog("Update: " + p.To + " kept failing to start, going back to " + p.From)
		rollbackUpdate(exe)
		return
	}
	go func() {
		time.Sleep(25 * time.Second)
		os.Remove(filepath.Join(updDir(), "pending.json"))
		os.Remove(exe + ".old")
		arcLog("Update: " + p.To + " is running fine")
	}()
}

func registerUpdate(mux *http.ServeMux) {
	mux.HandleFunc("/api/update/check", func(w http.ResponseWriter, r *http.Request) {
		ri, err := latestRelease()
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error(), "current": appVersion})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "current": appVersion, "latest": strings.TrimPrefix(ri.Tag, "v"), "newer": ri.Newer, "notes": ri.Notes, "page": ri.Page,
			"canInstall": ri.URL != "" && ri.SumURL != "", "size": ri.Size})
	})
	mux.HandleFunc("/api/update/install", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		v, err := installUpdate()
		if err != nil {
			writeJSON(w, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "version": v})
	})
}
