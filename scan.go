package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type game = map[string]string

type scanOut struct {
	items     []game
	okSources []string // launchers that were found and read successfully
	skipped   []string
}

func normName(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func psOutput(script string, timeout time.Duration) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", psArgs("try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }; "+script)...)
	hide(cmd)
	return cmd.Output()
}

// regBlocks runs `reg query <key> /s` and returns one map of values per sub key ("_key" holds the key name).
func regBlocks(key string) []map[string]string {
	cmd := exec.Command("reg", "query", key, "/s")
	hide(cmd)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	valRe := regexp.MustCompile(`^\s+(.+?)\s{2,}REG_\w+(?:\s{2,}(.*))?$`)
	var blocks []map[string]string
	var cur map[string]string
	for _, line := range strings.Split(strings.ReplaceAll(string(out), "\r", ""), "\n") {
		if strings.HasPrefix(line, "HKEY_") {
			cur = map[string]string{"_key": strings.TrimSpace(line)}
			blocks = append(blocks, cur)
		} else if cur != nil {
			if m := valRe.FindStringSubmatch(line); m != nil {
				cur[m[1]] = strings.TrimSpace(m[2])
			}
		}
	}
	return blocks
}

// ---------------- Steam ----------------

var (
	reStateFlags = regexp.MustCompile(`"StateFlags"\s+"(\d+)"`)
	reLastOwner  = regexp.MustCompile(`"LastOwner"\s+"(\d+)"`)
	reMostRecent = regexp.MustCompile(`(?is)"(\d{17})"\s*\{[^{}]*?"MostRecent"\s+"1"`)
	reSteamName  = regexp.MustCompile(`"name"\s+"([^"]+)"`)
	reSteamFile  = regexp.MustCompile(`^appmanifest_(\d+)\.acf$`)
	reSteamPath  = regexp.MustCompile(`"path"\s+"([^"]+)"`)
	steamSkip    = regexp.MustCompile(`(?i)Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR|\bSDK\b|Dedicated Server|Soundtrack`)
)

func steamScan(custom string) func() scanOut {
	return func() scanOut {
		roots := steamRoots(custom)
		if len(roots) == 0 {
			return scanOut{}
		}
		// The Steam account that is signed in. Games installed by a different account
		// on this PC give the "no licenses" error when launched, so they are left out.
		cur := ""
		if b, err := os.ReadFile(filepath.Join(roots[0], "config", "loginusers.vdf")); err == nil {
			if m := reMostRecent.FindSubmatch(b); m != nil {
				cur = string(m[1])
			}
		}
		libs := map[string]string{}
		add := func(p string) {
			k := strings.ToLower(filepath.Clean(filepath.FromSlash(p)))
			if _, ok := libs[k]; !ok {
				libs[k] = p
			}
		}
		add(roots[0])
		if b, err := os.ReadFile(filepath.Join(roots[0], "steamapps", "libraryfolders.vdf")); err == nil {
			for _, m := range reSteamPath.FindAllSubmatch(b, -1) {
				add(strings.ReplaceAll(string(m[1]), `\\`, `\`))
			}
		}
		out := scanOut{okSources: []string{"Steam"}}
		seen := map[string]bool{}
		for _, lib := range libs {
			dir := filepath.Join(lib, "steamapps")
			ents, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, e := range ents {
				m := reSteamFile.FindStringSubmatch(e.Name())
				if m == nil || seen[m[1]] {
					continue
				}
				b, err := os.ReadFile(filepath.Join(dir, e.Name()))
				if err != nil {
					continue
				}
				nm := reSteamName.FindSubmatch(b)
				if nm == nil || steamSkip.Match(nm[1]) {
					continue
				}
				if sf := reStateFlags.FindSubmatch(b); sf != nil {
					if v, _ := strconv.Atoi(string(sf[1])); v&4 == 0 { // not fully installed
						continue
					}
				}
				seen[m[1]] = true
				if lo := reLastOwner.FindSubmatch(b); lo != nil && cur != "" {
					if o := string(lo[1]); o != "0" && o != cur {
						out.skipped = append(out.skipped, string(nm[1]))
						continue
					}
				}
				out.items = append(out.items, game{
					"id": "steam-" + m[1], "name": string(nm[1]), "kind": "uri",
					"target": "steam://rungameid/" + m[1], "source": "Steam", "appid": m[1],
				})
			}
		}
		return out
	}
}

// ---------------- Epic Games ----------------

type epicManifest struct {
	AppName              string
	DisplayName          string
	InstallLocation      string
	LaunchExecutable     string
	CatalogNamespace     string
	CatalogItemId        string
	AppCategories        []string
	BIsIncompleteInstall bool
}

func epicScan() scanOut {
	pd := os.Getenv("ProgramData")
	if pd == "" {
		pd = `C:\ProgramData`
	}
	ents, err := os.ReadDir(filepath.Join(pd, "Epic", "EpicGamesLauncher", "Data", "Manifests"))
	if err != nil {
		return scanOut{}
	}
	out := scanOut{okSources: []string{"Epic"}}
	for _, e := range ents {
		if !strings.EqualFold(filepath.Ext(e.Name()), ".item") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(pd, "Epic", "EpicGamesLauncher", "Data", "Manifests", e.Name()))
		if err != nil {
			continue
		}
		var m epicManifest
		if json.Unmarshal(b, &m) != nil || m.DisplayName == "" || m.AppName == "" || m.BIsIncompleteInstall {
			continue
		}
		if len(m.AppCategories) > 0 {
			isGame := false
			for _, c := range m.AppCategories {
				if c == "games" {
					isGame = true
				}
			}
			if !isGame {
				continue
			}
		}
		g := game{"id": "epic-" + m.AppName, "name": m.DisplayName, "source": "Epic"}
		if m.CatalogNamespace != "" && m.CatalogItemId != "" {
			g["kind"] = "uri"
			g["target"] = fmt.Sprintf("com.epicgames.launcher://apps/%s%%3A%s%%3A%s?action=launch&silent=true",
				m.CatalogNamespace, m.CatalogItemId, m.AppName)
		} else if m.LaunchExecutable != "" {
			g["kind"] = "exe"
			g["target"] = filepath.Join(m.InstallLocation, m.LaunchExecutable)
		} else {
			continue
		}
		out.items = append(out.items, g)
	}
	return out
}

// ---------------- GOG ----------------

func gogScan() scanOut {
	blocks := regBlocks(`HKLM\SOFTWARE\WOW6432Node\GOG.com\Games`)
	if len(blocks) == 0 {
		return scanOut{}
	}
	out := scanOut{okSources: []string{"GOG"}}
	for _, b := range blocks {
		if b["gameName"] == "" || b["exe"] == "" {
			continue
		}
		id := b["gameID"]
		if id == "" {
			id = filepath.Base(b["_key"])
		}
		out.items = append(out.items, game{"id": "gog-" + id, "name": b["gameName"], "kind": "exe", "target": b["exe"], "source": "GOG"})
	}
	return out
}

// ---------------- Ubisoft Connect ----------------

func ubiScan() scanOut {
	blocks := regBlocks(`HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs`)
	if len(blocks) == 0 {
		return scanOut{}
	}
	out := scanOut{okSources: []string{"Ubisoft"}}
	for _, b := range blocks {
		dir := b["InstallDir"]
		id := b["_key"][strings.LastIndex(b["_key"], `\`)+1:]
		if dir == "" || id == "" || id == "Installs" {
			continue
		}
		name := filepath.Base(strings.TrimRight(filepath.FromSlash(dir), `\/`))
		out.items = append(out.items, game{"id": "ubi-" + id, "name": name, "kind": "uri", "target": "uplay://launch/" + id + "/0", "source": "Ubisoft"})
	}
	return out
}

// ---------------- Xbox / Game Pass ----------------

type startApp struct{ Name, AppID string }

func decodeStartApps(out []byte) []startApp {
	out = []byte(strings.TrimPrefix(strings.TrimSpace(string(out)), "\ufeff"))
	var arr []startApp
	if json.Unmarshal(out, &arr) != nil {
		var one startApp
		if json.Unmarshal(out, &one) == nil && one.Name != "" {
			arr = []startApp{one}
		}
	}
	return arr
}

func xboxScan() scanOut {
	script := `$ErrorActionPreference='SilentlyContinue'; $start = Get-StartApps; ` +
		`Get-AppxPackage | Where-Object { $_.InstallLocation -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object { ` +
		`$pfn = $_.PackageFamilyName; $a = $start | Where-Object { $_.AppID -like ($pfn + '!*') } | Select-Object -First 1; ` +
		`if ($a) { [pscustomobject]@{ Name = $a.Name; AppID = $a.AppID } } } | ConvertTo-Json -Compress`
	raw, err := psOutput(script, 40*time.Second)
	if err != nil {
		return scanOut{}
	}
	out := scanOut{okSources: []string{"Game Pass"}}
	for _, a := range decodeStartApps(raw) {
		out.items = append(out.items, game{"id": "xbox-" + a.AppID, "name": a.Name, "kind": "uri", "target": `shell:AppsFolder\` + a.AppID, "source": "Game Pass"})
	}
	return out
}

// ---------------- well-known launchers that don't expose a game list ----------------

var launcherRe = regexp.MustCompile(`(?i)^(Minecraft.*|Riot Client|Battle\.net|Rockstar Games Launcher|Roblox|Roblox Player)$`)

func launcherScan() scanOut {
	raw, err := psOutput(`Get-StartApps | ConvertTo-Json -Compress`, 40*time.Second)
	if err != nil {
		return scanOut{}
	}
	out := scanOut{okSources: []string{"Launcher"}}
	for _, a := range decodeStartApps(raw) {
		if launcherRe.MatchString(strings.TrimSpace(a.Name)) {
			out.items = append(out.items, game{"id": "sm-" + a.AppID, "name": a.Name, "kind": "uri", "target": `shell:AppsFolder\` + a.AppID, "source": "Launcher"})
		}
	}
	return out
}

// ---------------- folders: EA app, Rockstar, plain "Games" folders... ----------------

var badExe = regexp.MustCompile(`(?i)unins|uninstall|crash|setup|redist|vcredist|dxsetup|updater|installer|prereq|dotnet|vc_|helper|cefsub|diagnos|bugreport|report|eac|battleye|easyanticheat|anticheat`)
var skipDir = regexp.MustCompile(`(?i)^(_?common ?redist|redist|__installer|support|engine|ea desktop|launcher|crashpad|cef|directx)$`)

// findGameExe picks the most likely game program inside a game's install folder.
func findGameExe(dir string) string {
	folder := normName(filepath.Base(dir))
	best, bestScore := "", -1
	var bestSize int64
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		depth := 0
		if rel != "." {
			depth = strings.Count(rel, string(filepath.Separator))
		}
		if d.IsDir() {
			if p != dir && (skipDir.MatchString(d.Name()) || depth >= 2) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.EqualFold(filepath.Ext(p), ".exe") || badExe.MatchString(d.Name()) {
			return nil
		}
		score := (3 - depth) * 2
		n := normName(strings.TrimSuffix(d.Name(), filepath.Ext(d.Name())))
		if n != "" && folder != "" && (strings.Contains(folder, n) || strings.Contains(n, folder)) {
			score += 10
		}
		info, _ := d.Info()
		var size int64
		if info != nil {
			size = info.Size()
		}
		if score > bestScore || (score == bestScore && size > bestSize) {
			best, bestScore, bestSize = p, score, size
		}
		return nil
	})
	return best
}

// scanFolderGames treats each sub folder of dir as one game.
func scanFolderGames(dir, source string) []game {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []game
	for _, e := range ents {
		if !e.IsDir() || skipDir.MatchString(e.Name()) {
			continue
		}
		if exe := findGameExe(filepath.Join(dir, e.Name())); exe != "" {
			out = append(out, game{"id": "exe|" + strings.ToLower(exe), "name": cleanName(e.Name()), "kind": "exe", "target": exe, "source": source})
		}
	}
	return out
}

func rootsScan() scanOut {
	roots := []struct{ path, source string }{
		{`\Program Files\EA Games`, "EA"}, {`\Program Files (x86)\EA Games`, "EA"}, {`\Program Files (x86)\Origin Games`, "EA"}, {`\EA Games`, "EA"},
		{`\Program Files\Rockstar Games`, "Rockstar"}, {`\Rockstar Games`, "Rockstar"},
		{`\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games`, "Ubisoft"}, {`\Program Files\Ubisoft\Ubisoft Game Launcher\games`, "Ubisoft"},
		{`\GOG Games`, "GOG"}, {`\Games`, "Games folder"}, {`\Program Files\Epic Games`, "Epic"},
	}
	out := scanOut{}
	okSet := map[string]bool{}
	for d := 'C'; d <= 'Z'; d++ {
		drive := string(d) + `:`
		if _, err := os.Stat(drive + `\`); err != nil {
			continue
		}
		for _, r := range roots {
			dir := drive + r.path
			if st, err := os.Stat(dir); err != nil || !st.IsDir() {
				continue
			}
			okSet[r.source] = true
			out.items = append(out.items, scanFolderGames(dir, r.source)...)
		}
	}
	for s := range okSet {
		out.okSources = append(out.okSources, s)
	}
	return out
}

// ---------------- everything together ----------------

func scanAll(steamPath string) map[string]any {
	jobs := []func() scanOut{steamScan(steamPath), epicScan, gogScan, ubiScan, xboxScan, launcherScan, rootsScan}
	res := make([]scanOut, len(jobs))
	var wg sync.WaitGroup
	for i, j := range jobs {
		wg.Add(1)
		go func(i int, j func() scanOut) {
			defer wg.Done()
			defer func() { recover() }()
			res[i] = j()
		}(i, j)
	}
	wg.Wait()

	items := []game{}
	counts := map[string]int{}
	sources := []string{}
	skipped := []string{}
	seenName, seenTarget := map[string]bool{}, map[string]bool{}
	for _, r := range res { // earlier launchers win when the same title shows up twice
		sources = append(sources, r.okSources...)
		skipped = append(skipped, r.skipped...)
		for _, it := range r.items {
			n, t := normName(it["name"]), strings.ToLower(it["target"])
			if n == "" || seenName[n] || seenTarget[t] {
				continue
			}
			seenName[n], seenTarget[t] = true, true
			it["category"] = "game"
			items = append(items, it)
			counts[it["source"]]++
		}
	}
	sort.Slice(items, func(i, j int) bool { return strings.ToLower(items[i]["name"]) < strings.ToLower(items[j]["name"]) })
	return map[string]any{"ok": true, "items": items, "sources": sources, "counts": counts, "skipped": skipped}
}

// ---------------- Apple Music (and any other app) via Windows media controls ----------------

const smtcScript = `try {
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`1" + `' })[0]
function Await($op, $type) { $m = $asTask.MakeGenericMethod($type); $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $null
foreach ($x in $mgr.GetSessions()) { if ($x.SourceAppUserModelId -match 'Apple') { $s = $x; break } }
if (-not $s) { $s = $mgr.GetCurrentSession() }
if (-not $s) { '{"ok":false,"error":"nosession"}'; exit }
$ok = $false
switch ('__ACTION__') {
  'next' { $ok = Await ($s.TrySkipNextAsync()) ([bool]) }
  'play' { $ok = Await ($s.TryPlayAsync()) ([bool]) }
  'pause' { $ok = Await ($s.TryPauseAsync()) ([bool]) }
  'prev' { $ok = Await ($s.TrySkipPreviousAsync()) ([bool]) }
  'playpause' { $ok = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
}
if ($ok) { '{"ok":true}' } else { '{"ok":false,"error":"refused"}' }
} catch { '{"ok":false,"error":"script"}' }`

// smtcControl talks to the app that owns the Windows media session (Apple Music if it has one),
// without launching anything. handled=false means "couldn't tell, fall back to media keys".
func smtcControl(action string) (result, bool) {
	out, err := psOutput(strings.ReplaceAll(smtcScript, "__ACTION__", action), 12*time.Second)
	if err != nil {
		return result{}, false
	}
	lines := strings.Split(strings.TrimSpace(strings.ReplaceAll(string(out), "\r", "")), "\n")
	var r struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if json.Unmarshal([]byte(strings.TrimPrefix(strings.TrimSpace(lines[len(lines)-1]), "\ufeff")), &r) != nil {
		return result{}, false
	}
	if r.OK {
		return result{OK: true}, true
	}
	if r.Error == "nosession" {
		return result{false, "Nothing is playing yet. Start a song in the Apple Music app first."}, true
	}
	return result{}, false
}

var _ = url.QueryEscape
