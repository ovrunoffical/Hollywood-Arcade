package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf16"
)

// ---------------- Now playing (Windows media session, long-running helper) ----------------

const nowScript = `try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`1" + `' })[0]
function Await($op, $type) { $m = $asTask.MakeGenericMethod($type); $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
while ($true) {
  try {
    $s = $null
    foreach ($x in $mgr.GetSessions()) { if ($x.SourceAppUserModelId -match 'Apple') { $s = $x; break } }
    if (-not $s) { $s = $mgr.GetCurrentSession() }
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $t = $s.GetTimelineProperties(); $i = $s.GetPlaybackInfo()
      [pscustomobject]@{ active = $true; title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle; status = [string]$i.PlaybackStatus; pos = [int]$t.Position.TotalSeconds; dur = [int]($t.EndTime - $t.StartTime).TotalSeconds; app = [string]$s.SourceAppUserModelId } | ConvertTo-Json -Compress
    } else {
      $w = ''
      try { $w = [string](Get-Process | Where-Object { $_.ProcessName -match 'AppleMusic|iTunes' -and $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle } catch { }
      [pscustomobject]@{ active = $false; win = $w } | ConvertTo-Json -Compress
    }
  } catch { [pscustomobject]@{ active = $false; error = [string]$_.Exception.Message } | ConvertTo-Json -Compress }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`

var (
	npMu   sync.Mutex
	npLast = []byte(`{"active":false}`)
	npOnce sync.Once
)

func startNowPlaying() {
	go func() {
		for {
			cmd := exec.Command("powershell.exe", psArgs(nowScript)...)
			hide(cmd)
			out, err := cmd.StdoutPipe()
			if err == nil && cmd.Start() == nil {
				sc := bufio.NewScanner(out)
				sc.Buffer(make([]byte, 64*1024), 1<<20)
				for sc.Scan() {
					line := strings.TrimPrefix(strings.TrimSpace(sc.Text()), "\xef\xbb\xbf")
					if json.Valid([]byte(line)) {
						npMu.Lock()
						npLast = []byte(line)
						npMu.Unlock()
					}
				}
				cmd.Process.Kill()
				cmd.Wait()
			}
			npMu.Lock()
			npLast = []byte(`{"active":false,"error":"The Windows media helper stopped. Retrying."}`)
			npMu.Unlock()
			time.Sleep(10 * time.Second)
		}
	}()
}

// ---------------- Game info + cover art ----------------

type gameMeta struct {
	Cover     string   `json:"cover,omitempty"`
	Desc      string   `json:"desc,omitempty"`
	Genres    []string `json:"genres,omitempty"`
	Year      string   `json:"year,omitempty"`
	Developer string   `json:"dev,omitempty"`
	Rating    float64  `json:"rating,omitempty"`
	Score     int      `json:"score,omitempty"`
	Hero      string   `json:"hero,omitempty"`
	Logo      string   `json:"logo,omitempty"`
	Disc      string   `json:"disc,omitempty"`
	Fan       string   `json:"fan,omitempty"`
	Shots     []string `json:"shots,omitempty"`
	Sources   []string `json:"sources,omitempty"`
	Log       []string `json:"log,omitempty"`
	Retry     bool     `json:"retry,omitempty"` // art lists were not ready yet: ask again later
}

func (m *gameMeta) note(s string) { m.Log = append(m.Log, s) }

var (
	steamStoreURL = "https://store.steampowered.com"
	steamCDN      = "https://cdn.akamai.steamstatic.com"
	rawgURL       = "https://api.rawg.io"
	sgdbURL       = "https://www.steamgriddb.com"
	igdbURL       = "https://api.igdb.com"
	igdbImgURL    = "https://images.igdb.com"
	twitchURL     = "https://id.twitch.tv"
	wikiURL       = "https://en.wikipedia.org"
	gogURL        = "https://catalog.gog.com"
	libretroURL   = "https://thumbnails.libretro.com"
	httpc         = &http.Client{Timeout: 15 * time.Second}
	reTags        = regexp.MustCompile(`<[^>]*>`)
	reSafe        = regexp.MustCompile(`[^A-Za-z0-9_-]+`)
)

func init() {
	if b := os.Getenv("HA_TEST_API"); b != "" {
		steamStoreURL, steamCDN, rawgURL, sgdbURL, igdbURL, igdbImgURL, twitchURL, wikiURL, appleURL, gogURL, libretroURL, epicURL, gpListURL, dcURL, tgdbURL, lbMetaURL, lbImgURL = b, b, b, b, b, b, b, b, b, b, b, b, b, b, b, b+"/Metadata.zip", b
		steamAPIURL, steamComURL, raURL, raMediaURL, xblURL, ghAPIURL = b, b, b, b, b, b
	}
}

func okImageHost(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if th := os.Getenv("HA_TESTHOST"); th != "" && u.Hostname() == th {
		return true
	}
	if u.Scheme != "https" {
		return false
	}
	h := strings.ToLower(u.Hostname())
	for _, s := range []string{"steamstatic.com", "steampowered.com", "akamaihd.net", "rawg.io", "steamgriddb.com", "igdb.com", "wikimedia.org", "wikipedia.org", "gog-statics.com", "gog.com", "libretro.com", "thegamesdb.net", "launchbox-app.com", "mzstatic.com", "apple.com", "epicgames.com", "unrealengine.com"} {
		if h == s || strings.HasSuffix(h, "."+s) {
			return true
		}
	}
	return false
}

func getJSON(u string, hdr map[string]string, v any) error {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/1.0")
	for k, val := range hdr {
		req.Header.Set(k, val)
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(v)
}

// downloadArt saves an image into the app's art folder and returns the local path.
func downloadArt(u, id string) string {
	u = bigThumb(u)
	if !okImageHost(u) {
		return ""
	}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/1.0 (game launcher; https://github.com)")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")
	resp, err := httpc.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	ct := resp.Header.Get("Content-Type")
	if resp.StatusCode != 200 || !(strings.HasPrefix(ct, "image/") || ct == "binary/octet-stream") {
		return ""
	}
	ext := ".jpg"
	if strings.Contains(ct, "png") {
		ext = ".png"
	} else if strings.Contains(ct, "webp") {
		ext = ".webp"
	}
	dir := filepath.Join(cfgDir, "art")
	os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, reSafe.ReplaceAllString(id, "_")+ext)
	f, err := os.Create(p)
	if err != nil {
		return ""
	}
	n, err := io.Copy(f, io.LimitReader(resp.Body, 12<<20))
	f.Close()
	if err != nil || n < 1000 {
		os.Remove(p)
		return ""
	}
	return p
}

func addSrc(m *gameMeta, s string) { m.Sources = append(m.Sources, s) }

func fetchMeta(id, name, appid, rawgKey, sgdbKey, igdbID, igdbSecret, rom, tgdbKey string) gameMeta {
	var m gameMeta
	orig := name
	name = metaName(name)
	if name == "" {
		name = orig
	}
	// a game that is not "from Steam" may still be sold on Steam: look it up by name (no key needed)
	if appid == "" && rom == "" {
		appid = steamSearchID(name)
		if appid == "" {
			m.note("Steam: no store match for \"" + name + "\"")
		}
	}
	// 1) Steam store (no key needed) for Steam games
	if appid != "" {
		var r map[string]struct {
			Success bool `json:"success"`
			Data    struct {
				Short  string   `json:"short_description"`
				Header string   `json:"header_image"`
				Devs   []string `json:"developers"`
				Genres []struct {
					Description string `json:"description"`
				} `json:"genres"`
				Release struct {
					Date string `json:"date"`
				} `json:"release_date"`
				Meta struct {
					Score int `json:"score"`
				} `json:"metacritic"`
				Shots []struct {
					Thumb string `json:"path_thumbnail"`
				} `json:"screenshots"`
			} `json:"data"`
		}
		if getJSON(steamStoreURL+"/api/appdetails?appids="+url.QueryEscape(appid)+"&l=english", nil, &r) == nil && r[appid].Success {
			d := r[appid].Data
			m.Desc = strings.TrimSpace(reTags.ReplaceAllString(d.Short, ""))
			if len(d.Devs) > 0 {
				m.Developer = d.Devs[0]
			}
			for _, g := range d.Genres {
				m.Genres = append(m.Genres, g.Description)
			}
			if mm := regexp.MustCompile(`(19|20)\d\d`).FindString(d.Release.Date); mm != "" {
				m.Year = mm
			}
			m.Score = d.Meta.Score
			for i, sh := range d.Shots {
				if i < 4 && okImageHost(sh.Thumb) {
					m.Shots = append(m.Shots, sh.Thumb)
				}
			}
			m.Hero = steamArt(appid, "library_hero.jpg", id+"-hero")
			addSrc(&m, "Steam")
		} else {
			m.note("Steam: store page " + appid + " unavailable (region/age gate or offline)")
		}
	}
	_ = sgdbKey // cover art now comes only from TheGamesDB, LaunchBox and Wikipedia
	// 3) RAWG (needs the person's free key): description, genres, year for anything
	if rawgKey != "" && name != "" && (m.Desc == "" || len(m.Genres) == 0) {
		var s struct {
			Results []struct {
				ID       int     `json:"id"`
				Image    string  `json:"background_image"`
				Released string  `json:"released"`
				Rating   float64 `json:"rating"`
				Genres   []struct {
					Name string `json:"name"`
				} `json:"genres"`
			} `json:"results"`
		}
		if getJSON(rawgURL+"/api/games?page_size=1&search_precise=true&key="+url.QueryEscape(rawgKey)+"&search="+url.QueryEscape(name), nil, &s) == nil && len(s.Results) > 0 {
			r := s.Results[0]
			if m.Year == "" && len(r.Released) >= 4 {
				m.Year = r.Released[:4]
			}
			if len(m.Genres) == 0 {
				for _, g := range r.Genres {
					m.Genres = append(m.Genres, g.Name)
				}
			}
			m.Rating = r.Rating
			if m.Desc == "" {
				var d struct {
					Raw string `json:"description_raw"`
				}
				if getJSON(fmt.Sprintf("%s/api/games/%d?key=%s", rawgURL, r.ID, url.QueryEscape(rawgKey)), nil, &d) == nil {
					t := strings.TrimSpace(d.Raw)
					if len(t) > 600 {
						t = t[:600] + "…"
					}
					m.Desc = t
				}
			}
			addSrc(&m, "RAWG")
		}
	}
	// 4) IGDB (free Twitch app id + secret): good descriptions, scores and screenshots
	if igdbID != "" && igdbSecret != "" && name != "" && (m.Desc == "" || len(m.Shots) == 0 || m.Score == 0) {
		if tok := igdbToken(igdbID, igdbSecret); tok != "" {
			q := `search "` + strings.NewReplacer(`"`, ``, `\`, ``).Replace(name) + `"; fields name,summary,first_release_date,genres.name,total_rating,involved_companies.developer,involved_companies.company.name,cover.image_id,screenshots.image_id; limit 1;`
			req, _ := http.NewRequest("POST", igdbURL+"/v4/games", strings.NewReader(q))
			req.Header.Set("Client-ID", igdbID)
			req.Header.Set("Authorization", "Bearer "+tok)
			var rs []struct {
				Summary string  `json:"summary"`
				First   int64   `json:"first_release_date"`
				Total   float64 `json:"total_rating"`
				Genres  []struct {
					Name string `json:"name"`
				} `json:"genres"`
				Cover struct {
					ID string `json:"image_id"`
				} `json:"cover"`
				Shots []struct {
					ID string `json:"image_id"`
				} `json:"screenshots"`
				Cos []struct {
					Dev     bool `json:"developer"`
					Company struct {
						Name string `json:"name"`
					} `json:"company"`
				} `json:"involved_companies"`
			}
			if resp, err := httpc.Do(req); err == nil {
				if resp.StatusCode == 200 {
					json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&rs)
				}
				resp.Body.Close()
			}
			if len(rs) > 0 {
				r := rs[0]
				if m.Desc == "" {
					m.Desc = r.Summary
				}
				if m.Score == 0 && r.Total > 0 {
					m.Score = int(r.Total + .5)
				}
				if m.Year == "" && r.First > 0 {
					m.Year = fmt.Sprint(time.Unix(r.First, 0).UTC().Year())
				}
				if len(m.Genres) == 0 {
					for _, g := range r.Genres {
						m.Genres = append(m.Genres, g.Name)
					}
				}
				if m.Developer == "" {
					for _, c := range r.Cos {
						if c.Dev {
							m.Developer = c.Company.Name
							break
						}
					}
				}
				if len(m.Shots) == 0 {
					for i, s := range r.Shots {
						if i < 4 {
							m.Shots = append(m.Shots, igdbImgURL+"/igdb/image/upload/t_screenshot_med/"+s.ID+".jpg")
						}
					}
				}
				addSrc(&m, "IGDB")
			}
		}
	}
	// 5a) GOG catalog (no key)
	if name != "" && rom == "" && m.Desc == "" {
		var g struct {
			Products []struct {
				Title  string   `json:"title"`
				Cover  string   `json:"coverVertical"`
				Horiz  string   `json:"coverHorizontal"`
				Date   string   `json:"releaseDate"`
				Devs   []string `json:"developers"`
				Genres []struct {
					Name string `json:"name"`
				} `json:"genres"`
			} `json:"products"`
		}
		if err := getJSON(gogURL+"/v1/catalog?limit=5&countryCode=US&locale=en-US&currencyCode=USD&query=like%3A"+url.QueryEscape(name), nil, &g); err != nil {
			m.note("GOG: " + err.Error())
		} else {
			for _, p := range g.Products {
				if titleScore(metaName(p.Title), name) < .7 {
					continue
				}
				if m.Year == "" && len(p.Date) >= 4 {
					m.Year = p.Date[:4]
				}
				if m.Developer == "" && len(p.Devs) > 0 {
					m.Developer = p.Devs[0]
				}
				if len(m.Genres) == 0 {
					for _, x := range p.Genres {
						m.Genres = append(m.Genres, x.Name)
					}
				}
				addSrc(&m, "GOG")
				break
			}
		}
	}
	// 5c) Epic Games Store (no key): tall box art, description and developer for Epic games (Fortnite and friends)
	if name != "" && rom == "" && m.Desc == "" {
		if hits := epicSearch(name); len(hits) > 0 {
			h := hits[0]
			if m.Desc == "" && h.Desc != "" {
				m.Desc = h.Desc
			}
			if m.Developer == "" {
				m.Developer = h.Dev
			}
			addSrc(&m, "Epic")
		} else {
			m.note("Epic: no store listing for \"" + name + "\"")
		}
	}
	// 5b) cover art: TheGamesDB (the person's key), then LaunchBox, then Wikipedia below
	findArt(&m, id, name, tgdbKey)
	// 5) Wikipedia (no key): last-resort description + picture for anything with an article
	if name != "" && (m.Desc == "" || m.Cover == "") {
		var s struct {
			Query struct {
				Search []struct {
					Title string `json:"title"`
				} `json:"search"`
			} `json:"query"`
		}
		for _, q := range []string{name + " video game", name + " game", name} {
			s.Query.Search = nil
			if getJSON(wikiURL+"/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch="+url.QueryEscape(q), nil, &s) != nil || len(s.Query.Search) == 0 {
				continue
			}
			var sum struct {
				Extract   string `json:"extract"`
				Thumbnail struct {
					Source string `json:"source"`
				} `json:"thumbnail"`
			}
			if titleScore(regexp.MustCompile(`\s*\(.*\)\s*$`).ReplaceAllString(s.Query.Search[0].Title, ""), name) < .5 {
				continue // a different article, not this game
			}
			title := strings.ReplaceAll(url.PathEscape(s.Query.Search[0].Title), "%20", "_")
			if getJSON(wikiURL+"/api/rest_v1/page/summary/"+title, nil, &sum) == nil && strings.Contains(strings.ToLower(sum.Extract), "game") {
				if m.Desc == "" {
					t := sum.Extract
					if len(t) > 600 {
						t = t[:600] + "…"
					}
					m.Desc = t
				}
				if m.Cover == "" && sum.Thumbnail.Source != "" {
					m.Cover = downloadArt(sum.Thumbnail.Source, id)
				}
				addSrc(&m, "Wikipedia")
				break
			}
		}
	}
	if len(m.Sources) == 0 {
		m.note("Wikipedia: no matching article")
	}
	return m
}

var (
	igdbMu  sync.Mutex
	igdbTok string
	igdbExp time.Time
)

func igdbToken(id, secret string) string {
	igdbMu.Lock()
	defer igdbMu.Unlock()
	if igdbTok != "" && time.Now().Before(igdbExp) {
		return igdbTok
	}
	resp, err := httpc.Post(twitchURL+"/oauth2/token?grant_type=client_credentials&client_id="+url.QueryEscape(id)+"&client_secret="+url.QueryEscape(secret), "application/json", nil)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var t struct {
		Tok string `json:"access_token"`
		Exp int    `json:"expires_in"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&t) != nil {
		return ""
	}
	igdbTok, igdbExp = t.Tok, time.Now().Add(time.Duration(t.Exp-300)*time.Second)
	return igdbTok
}

// ---------------- Power, shell mode ----------------

var exiting atomic.Bool

func readSettingBool(key string) bool {
	b, err := os.ReadFile(filepath.Join(cfgDir, "library.json"))
	if err != nil {
		return false
	}
	var d struct {
		Settings map[string]any `json:"settings"`
	}
	json.Unmarshal(b, &d)
	v, _ := d.Settings[key].(bool)
	return v
}

const winlogon = `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`

const restoreCmd = "@echo off\r\nreg delete \"HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\" /v Shell /f >nul 2>&1\r\nstart \"\" explorer.exe\r\n"

func setShell(on bool) {
	var cmd *exec.Cmd
	if on {
		exe, _ := os.Executable()
		os.WriteFile(filepath.Join(cfgDir, "Restore-Windows-Desktop.cmd"), []byte(restoreCmd), 0o755)
		os.WriteFile(filepath.Join(filepath.Dir(exe), "Restore-Windows-Desktop.cmd"), []byte(restoreCmd), 0o755)
		cmd = exec.Command("reg", "add", winlogon, "/v", "Shell", "/t", "REG_SZ", "/d", `"`+exe+`"`, "/f")
	} else {
		cmd = exec.Command("reg", "delete", winlogon, "/v", "Shell", "/f")
	}
	hide(cmd)
	cmd.Run()
}

func startExplorer() { start("explorer.exe", nil, "") }

func powerAction(a string) result {
	run := func(n string, args ...string) result {
		c := exec.Command(n, args...)
		hide(c)
		if err := c.Start(); err != nil {
			return result{false, err.Error()}
		}
		return result{OK: true}
	}
	switch a {
	case "restart":
		return run("shutdown", "/r", "/t", "0")
	case "shutdown":
		return run("shutdown", "/s", "/t", "0")
	case "signout":
		return run("shutdown", "/l")
	case "sleep":
		return run("rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0")
	case "desktop":
		startExplorer()
		return result{OK: true}
	case "explorer":
		return run("explorer.exe", "shell:MyComputerFolder")
	case "taskmgr":
		return run("taskmgr.exe")
	case "closegame":
		if !closeGame() {
			return result{false, "No game to close"}
		}
		return result{OK: true}
	case "exit":
		exiting.Store(true)
		if readSettingBool("shellMode") {
			startExplorer() // never leave the person with an empty screen
		}
		go func() { time.Sleep(400 * time.Millisecond); killOverlay(); os.Exit(0) }()
		return result{OK: true}
	}
	return result{false, "unknown action"}
}

func registerExtras(mux *http.ServeMux) {
	registerMixer(mux)
	registerUpdate(mux)
	registerVoice(mux)
	registerPlugins(mux)
	registerToast(mux)
	mux.HandleFunc("/api/nowplaying", func(w http.ResponseWriter, r *http.Request) {
		npOnce.Do(startNowPlaying)
		npMu.Lock()
		b := npLast
		npMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/api/metadata", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			ID, Name, AppID, RawgKey, SgdbKey string
		}
		var raw map[string]string
		readJSON(r, &raw)
		o.ID, o.Name, o.AppID, o.RawgKey, o.SgdbKey = raw["id"], raw["name"], raw["appid"], raw["rawgKey"], raw["sgdbKey"]
		if o.ID == "" || o.Name == "" {
			writeJSON(w, result{false, "missing game"})
			return
		}
		m := fetchMeta(o.ID, o.Name, o.AppID, o.RawgKey, o.SgdbKey, raw["igdbId"], raw["igdbSecret"], raw["rom"], raw["tgdbKey"])
		writeJSON(w, map[string]any{"ok": len(m.Sources) > 0 || m.Cover != "", "meta": m})
	})
	registerApple(mux)
	registerMeta2(mux)
	registerStore(mux)
	registerAppMeta(mux)
	registerV2(mux)
	registerJellyfin(mux)
	registerAch(mux)
	registerInstall(mux)
	registerSystem(mux)
	registerStream(mux)
	registerData(mux)
	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, map[string]any{"version": appVersion}) })
	mux.HandleFunc("/api/essentials", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, essentials()) })
	mux.HandleFunc("/api/frameCheck", func(w http.ResponseWriter, r *http.Request) {
		ok, why := frameCheck(r.URL.Query().Get("url"))
		writeJSON(w, map[string]any{"ok": ok, "reason": why})
	})
	mux.HandleFunc("/api/hotkey", func(w http.ResponseWriter, r *http.Request) {
		l, _ := hotkeyLabel.Load().(string)
		writeJSON(w, map[string]any{"ok": true, "label": l})
	})
	mux.HandleFunc("/api/power", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Action string `json:"action"`
		}
		readJSON(r, &o)
		writeJSON(w, powerAction(o.Action))
	})
}

// psArgs passes a script to PowerShell as -EncodedCommand so quotes and line breaks can never be mangled.
func psArgs(script string, extra ...string) []string {
	return psEnc(script, true, extra...)
}

func psEnc(script string, nonInteractive bool, extra ...string) []string {
	u := utf16.Encode([]rune(script))
	b := make([]byte, 0, len(u)*2)
	for _, c := range u {
		b = append(b, byte(c), byte(c>>8))
	}
	args := append([]string{}, extra...)
	args = append(args, "-NoProfile")
	if nonInteractive {
		args = append(args, "-NonInteractive")
	}
	return append(args, "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64.StdEncoding.EncodeToString(b))
}

func fileExists(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }

// frameCheck says whether a web app allows itself to be shown inside another page.
func frameCheck(raw string) (bool, string) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false, "That isn't a web address."
	}
	c := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("GET", raw, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/1.0")
	resp, err := c.Do(req)
	if err != nil {
		return false, "Couldn't reach it (is it running?)."
	}
	defer resp.Body.Close()
	if xf := strings.ToUpper(resp.Header.Get("X-Frame-Options")); strings.Contains(xf, "DENY") || strings.Contains(xf, "SAMEORIGIN") {
		return false, "This app doesn't allow being shown inside other apps."
	}
	for _, csp := range resp.Header.Values("Content-Security-Policy") {
		for _, d := range strings.Split(csp, ";") {
			d = strings.TrimSpace(d)
			if strings.HasPrefix(strings.ToLower(d), "frame-ancestors") {
				if !strings.Contains(d, "*") && !strings.Contains(d, "127.0.0.1") && !strings.Contains(d, "localhost") {
					return false, "This app doesn't allow being shown inside other apps."
				}
			}
		}
	}
	return true, ""
}

// essentials finds the everyday programs on this PC and returns ready-to-add launchers.
func essentials() map[string]any {
	items := []map[string]any{}
	missing := []string{}
	add := func(id, name, kind, target, args string) {
		items = append(items, map[string]any{"id": id, "name": name, "category": "app", "kind": kind, "target": target, "args": args, "source": "Windows"})
	}
	win := os.Getenv("WINDIR")
	if win == "" {
		win = `C:\Windows`
	}
	add("ess-explorer", "File Explorer", "exe", filepath.Join(win, "explorer.exe"), "shell:MyComputerFolder")
	first := func(paths ...string) string {
		for _, p := range paths {
			if p != "" && fileExists(p) {
				return p
			}
		}
		return ""
	}
	pf, pf86, la := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	if ff := first(filepath.Join(pf, "Mozilla Firefox", "firefox.exe"), filepath.Join(pf86, "Mozilla Firefox", "firefox.exe"), filepath.Join(la, "Mozilla Firefox", "firefox.exe")); ff != "" {
		add("ess-firefox", "Firefox", "exe", ff, "")
	} else {
		missing = append(missing, "Firefox")
	}
	if up := filepath.Join(la, "Discord", "Update.exe"); la != "" && fileExists(up) {
		add("ess-discord", "Discord", "exe", up, "--processStart Discord.exe")
	} else {
		items = append(items, map[string]any{"id": "ess-discord", "name": "Discord", "category": "app", "kind": "url", "target": "https://discord.com/app", "source": "Media"})
		missing = append(missing, "Discord desktop app (added the web version)")
	}
	// Apple Music (and iTunes) live in the Start menu as Store apps
	found := false
	if out, err := psOutput(`Get-StartApps | Where-Object { $_.Name -match '^(Apple Music|iTunes)$' } | Select-Object -First 1 | ConvertTo-Json -Compress`, 15*time.Second); err == nil {
		var a struct{ Name, AppID string }
		if json.Unmarshal([]byte(strings.TrimPrefix(strings.TrimSpace(string(out)), "\xef\xbb\xbf")), &a) == nil && a.AppID != "" {
			add("ess-applemusic", a.Name, "uri", `shell:AppsFolder\`+a.AppID, "")
			found = true
		}
	}
	if !found {
		missing = append(missing, "Apple Music")
	}
	items = append(items,
		map[string]any{"id": "preset-jellyfin", "name": "Jellyfin", "category": "app", "kind": "url", "target": "http://localhost:8096", "source": "Media"},
		map[string]any{"id": "preset-ersatztv", "name": "ErsatzTV", "category": "app", "kind": "url", "target": "http://localhost:8409", "source": "Media"})
	return map[string]any{"ok": true, "items": items, "missing": missing}
}

var stopWords = map[string]bool{"the": true, "edition": true, "remastered": true, "definitive": true, "deluxe": true, "goty": true, "complete": true, "of": true, "year": true, "game": true, "a": true, "and": true}

func words(s string) []string {
	var out []string
	cur := ""
	flush := func() {
		if cur != "" && !stopWords[cur] {
			out = append(out, cur)
		}
		cur = ""
	}
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			cur += string(r)
		} else {
			flush()
		}
	}
	flush()
	return out
}

// titleScore is 1 for the same title and falls toward 0 as the titles differ.
func titleScore(a, b string) float64 {
	wa, wb := words(a), words(b)
	if len(wa) == 0 || len(wb) == 0 {
		return 0
	}
	if strings.Join(wa, "") == strings.Join(wb, "") {
		return 1
	}
	set := map[string]bool{}
	for _, w := range wa {
		set[w] = true
	}
	inter, union := 0, len(set)
	seen := map[string]bool{}
	for _, w := range wb {
		if seen[w] {
			continue
		}
		seen[w] = true
		if set[w] {
			inter++
		} else {
			union++
		}
	}
	return float64(inter) / float64(union)
}

var reBadTitle = regexp.MustCompile(`(?i)soundtrack|\bdlc\b|\bdemo\b|artbook|season pass|bundle|upgrade`)

func steamSearchID(name string) string {
	tries := nameVariants(name)
	name = tries[0]

	for _, t := range tries {
		var r struct {
			Items []struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"items"`
		}
		if getJSON(steamStoreURL+"/api/storesearch/?l=english&cc=US&term="+url.QueryEscape(t), nil, &r) != nil {
			continue
		}
		best, bs := 0, 0.0
		for _, it := range r.Items {
			if it.Type != "" && it.Type != "app" || reBadTitle.MatchString(it.Name) {
				continue
			}
			if s := titleScore(it.Name, name); s > bs {
				best, bs = it.ID, s
			}
		}
		if best != 0 && bs >= .7 {
			return fmt.Sprint(best)
		}
	}
	return ""
}

var libretroSystems = map[string][]string{
	".nes": {"Nintendo - Nintendo Entertainment System"}, ".sfc": {"Nintendo - Super Nintendo Entertainment System"}, ".smc": {"Nintendo - Super Nintendo Entertainment System"},
	".n64": {"Nintendo - Nintendo 64"}, ".z64": {"Nintendo - Nintendo 64"}, ".v64": {"Nintendo - Nintendo 64"},
	".gb": {"Nintendo - Game Boy"}, ".gbc": {"Nintendo - Game Boy Color"}, ".gba": {"Nintendo - Game Boy Advance"}, ".nds": {"Nintendo - Nintendo DS"},
	".3ds": {"Nintendo - Nintendo 3DS"}, ".md": {"Sega - Mega Drive - Genesis"}, ".gen": {"Sega - Mega Drive - Genesis"}, ".smd": {"Sega - Mega Drive - Genesis"},
	".sms": {"Sega - Master System - Mark III"}, ".gg": {"Sega - Game Gear"}, ".pce": {"NEC - PC Engine - TurboGrafx 16"},
	".gcm": {"Nintendo - GameCube"}, ".rvz": {"Nintendo - GameCube", "Nintendo - Wii"}, ".gcz": {"Nintendo - GameCube"}, ".wbfs": {"Nintendo - Wii"},
	".iso": {"Sony - PlayStation 2", "Sony - PlayStation", "Nintendo - GameCube", "Nintendo - Wii", "Sony - PlayStation Portable"},
	".cue": {"Sony - PlayStation", "Sony - PlayStation 2"}, ".chd": {"Sony - PlayStation", "Sony - PlayStation 2"}, ".bin": {"Sony - PlayStation"},
	".cso": {"Sony - PlayStation Portable"}, ".pbp": {"Sony - PlayStation Portable"},
}

var reLibBad = strings.NewReplacer("&", "_", "*", "_", "/", "_", ":", "_", "`", "_", "<", "_", ">", "_", "?", "_", "\\", "_", "|", "_", `"`, "_")

func libretroArt(id, name, rom string) string {
	ext := strings.ToLower(filepath.Ext(rom))
	systems := libretroSystems[ext]
	if len(systems) == 0 {
		return ""
	}
	base := strings.TrimSuffix(filepath.Base(rom), filepath.Ext(rom))
	names := []string{base, name + " (USA)", name + " (World)", name + " (Europe)", name}
	for _, sys := range systems {
		for _, n := range names {
			for _, kind := range []string{"Named_Boxarts", "Named_Titles", "Named_Snaps"} {
				u := libretroURL + "/" + url.PathEscape(sys) + "/" + kind + "/" + url.PathEscape(reLibBad.Replace(n)) + ".png"
				if c := downloadArt(u, id); c != "" {
					return c
				}
			}
		}
	}
	return ""
}
