package main

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var appleURL = "https://itunes.apple.com"

type appleSong struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album"`
	Art    string `json:"art"`
	Link   string `json:"link"`
}

// appleSearch uses Apple's public catalog search (no key). Links open in the Apple Music app.
func appleSearch(term string, limit int) []appleSong {
	var r struct {
		Results []struct {
			TrackID   int64  `json:"trackId"`
			TrackName string `json:"trackName"`
			Artist    string `json:"artistName"`
			Album     string `json:"collectionName"`
			Art       string `json:"artworkUrl100"`
			TrackView string `json:"trackViewUrl"`
			Kind      string `json:"kind"`
		} `json:"results"`
	}
	out := []appleSong{}
	if term == "" {
		return out
	}
	if getJSON(appleURL+"/search?media=music&entity=song&limit="+itoa(limit)+"&term="+url.QueryEscape(term), nil, &r) != nil {
		return out
	}
	for _, x := range r.Results {
		if x.TrackName == "" || x.TrackView == "" {
			continue
		}
		out = append(out, appleSong{x.TrackID, x.TrackName, x.Artist, x.Album, strings.Replace(x.Art, "100x100", "600x600", 1), x.TrackView})
	}
	return out
}

// musicLink turns a web link into one the Apple Music app opens directly.
func musicLink(web string) string {
	u, err := url.Parse(web)
	if err != nil || !strings.HasSuffix(u.Hostname(), "apple.com") {
		return ""
	}
	q := u.Query()
	q.Del("uo")
	q.Set("app", "music")
	return "music://" + u.Host + u.Path + "?" + q.Encode()
}

func applePlay(link, term string) result {
	if link == "" && term != "" {
		if s := appleSearch(term, 1); len(s) > 0 {
			link = s[0].Link
		}
	}
	ml := musicLink(link)
	if ml == "" {
		return result{false, "Couldn't find that song in Apple Music."}
	}
	if os.Getenv("HA_TESTHOST") == "" {
		start("rundll32.exe", []string{"url.dll,FileProtocolHandler", ml}, "")
	}
	if readSetting("applePlay") == "off" {
		go appleBackground()
	} else {
		go appleAutoPlay()
	}
	go func() {
		// give the app a moment to load the song, then make sure it is actually playing
		for _, d := range []time.Duration{3500 * time.Millisecond, 3 * time.Second} {
			time.Sleep(d)
			smtcControl("play")
		}
	}()
	return result{OK: true}
}

func appleFolders() []string {
	home, _ := os.UserHomeDir()
	var out []string
	for _, p := range []string{
		filepath.Join(home, "Music", "iTunes", "iTunes Media", "Music"),
		filepath.Join(home, "Music", "iTunes", "iTunes Media"),
		filepath.Join(home, "Music", "Apple Music"),
		filepath.Join(home, "Music"),
	} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			out = append(out, p)
		}
	}
	return out
}

func registerApple(mux *http.ServeMux) {
	mux.HandleFunc("/api/apple/search", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "songs": appleSearch(strings.TrimSpace(r.URL.Query().Get("term")), 25)})
	})
	mux.HandleFunc("/api/apple/play", func(w http.ResponseWriter, r *http.Request) {
		var o struct{ Link, Term string }
		var raw map[string]string
		readJSON(r, &raw)
		o.Link, o.Term = raw["link"], raw["term"]
		writeJSON(w, applePlay(o.Link, o.Term))
	})
	mux.HandleFunc("/api/apple/folders", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "folders": appleFolders()})
	})
	mux.HandleFunc("/api/cover", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("p")
		if _, ok := audioExt[strings.ToLower(filepath.Ext(p))]; !ok {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		_, pic := readTags(p, true)
		ct := sniffImage(pic)
		if ct == "" {
			if fa := folderArt(filepath.Dir(p)); fa != "" {
				w.Header().Set("Cache-Control", "max-age=86400")
				http.ServeFile(w, r, fa)
				return
			}
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "max-age=86400")
		w.Write(pic)
	})
}

// appleBackground minimises the Apple Music window as soon as it appears, so a song or the app starts
// playing behind Arcade instead of pulling you away from it.
func appleBackground() {
	if os.Getenv("HA_TESTHOST") != "" {
		return
	}
	psOutput(`Add-Type -Name W -Namespace HA -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);'
$done = 0
for ($i = 0; $i -lt 40 -and $done -lt 3; $i++) {
  Start-Sleep -Milliseconds 400
  $ps = Get-Process | Where-Object { $_.ProcessName -match '^(AppleMusic|iTunes)' -and $_.MainWindowHandle -ne 0 }
  foreach ($p in $ps) { [HA.W]::ShowWindowAsync($p.MainWindowHandle, 7) | Out-Null; $done++ }
}`, 30*time.Second)
}

// appleAutoPlay is the experimental "press play for me": once the song's page is up it brings Apple Music
// forward, sends the configured keys (Enter by default), then sends it to the background again.
func appleAutoPlay() {
	keys := readSetting("applePlayKeys")
	if keys == "" {
		keys = "{ENTER}"
	}
	delay := 3000
	if d := readSetting("applePlayDelay"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n >= 0 && n <= 15000 {
			delay = n
		}
	}
	arcLog("Apple Music: pressing " + keys + " after " + strconv.Itoa(delay) + " ms")
	driveWindow("^(AppleMusic|iTunes)", keys, delay, true)
}

// driveWindow waits for a program's window, optionally sends it keystrokes, and optionally minimises it.
// pattern is a regular expression for the process name, keys uses the .NET SendKeys syntax.
func driveWindow(pattern, keys string, delayMs int, minimize bool) {
	if os.Getenv("HA_TESTHOST") != "" {
		return
	}
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	if len(keys) > 60 {
		keys = keys[:60]
	}
	min := "$false"
	if minimize {
		min = "$true"
	}
	psOutput(`Add-Type -Name W -Namespace HA -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);'
$re = `+q(pattern)+`; $keys = `+q(keys)+`; $min = `+min+`
$p = $null
for ($i = 0; $i -lt 50 -and -not $p; $i++) {
  Start-Sleep -Milliseconds 300
  $p = Get-Process | Where-Object { $_.ProcessName -match $re -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if (-not $p) { exit }
Start-Sleep -Milliseconds `+strconv.Itoa(delayMs)+`
if ($keys) {
  $sh = New-Object -ComObject WScript.Shell
  $null = $sh.AppActivate($p.Id)
  Start-Sleep -Milliseconds 400
  $sh.SendKeys($keys)
  Start-Sleep -Milliseconds 800
}
if ($min) { [HA.W]::ShowWindowAsync($p.MainWindowHandle, 7) | Out-Null }`, 45*time.Second)
}
