package main

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var ghAPIURL = "https://api.github.com"

// Emulators the Arcade knows how to fetch. Asset names change between releases, so matching is by keywords.
// These are best-effort and shown as experimental in the UI.
type instSpec struct {
	Repo  string
	Need  []string // every word must be in the asset name
	Skip  []string // none may be
	Exe   string   // main executable to look for after extracting
	Label string
}

var instSpecs = map[string]instSpec{
	"xenia":       {"xenia-canary/xenia-canary-releases", []string{"windows"}, []string{"linux", "debug"}, "xenia_canary.exe", "Xenia Canary"},
	"rpcs3":       {"RPCS3/rpcs3-binaries-win", []string{"win64"}, []string{"arm"}, "rpcs3.exe", "RPCS3"},
	"azahar":      {"azahar-emu/azahar", []string{"windows"}, []string{"installer", "msvc-pdb", "arm"}, "azahar.exe", "Azahar"},
	"pcsx2":       {"PCSX2/pcsx2", []string{"windows", "64"}, []string{"symbols", "arm", "installer"}, "pcsx2-qt.exe", "PCSX2"},
	"duckstation": {"stenzek/duckstation", []string{"windows", "x64"}, []string{"arm", "symbols"}, "duckstation-qt-x64-ReleaseLTCG.exe", "DuckStation"},
	"melonds":     {"melonDS-emu/melonDS", []string{"win", "x86_64"}, []string{"arm", "linux", "mac"}, "melonDS.exe", "melonDS"},
	"mgba":        {"mgba-emu/mgba", []string{"win64"}, []string{"installer", "debug"}, "mGBA.exe", "mGBA"},
	"cemu":        {"cemu-project/Cemu", []string{"windows", "x64"}, []string{"installer", "arm"}, "Cemu.exe", "Cemu"},
	"flycast":     {"flyinghead/flycast", []string{"win", "x86_64"}, []string{"debug", "arm"}, "flycast.exe", "Flycast"},
}

func hostOK(u string) bool {
	p, err := url.Parse(u)
	if err != nil {
		return false
	}
	h := strings.ToLower(p.Hostname())
	if b, err := url.Parse(ghAPIURL); err == nil && h == b.Hostname() {
		return true
	}
	return h == "github.com" || strings.HasSuffix(h, ".github.com") || strings.HasSuffix(h, ".githubusercontent.com")
}

func pickAsset(assets []any, sp instSpec) (name, dl string) {
	for _, a := range assets {
		m := jm(a)
		n := strings.ToLower(js(m["name"]))
		if !(strings.HasSuffix(n, ".zip") || strings.HasSuffix(n, ".7z")) {
			continue
		}
		ok := true
		for _, w := range sp.Need {
			if !strings.Contains(n, strings.ToLower(w)) {
				ok = false
			}
		}
		for _, w := range sp.Skip {
			if strings.Contains(n, strings.ToLower(w)) {
				ok = false
			}
		}
		if ok {
			return js(m["name"]), js(m["browser_download_url"])
		}
	}
	return "", ""
}

func installEmu(id string) map[string]any {
	sp, ok := instSpecs[id]
	if !ok {
		return map[string]any{"ok": false, "error": "Unknown emulator"}
	}
	var rel map[string]any
	if err := getJSON(ghAPIURL+"/repos/"+sp.Repo+"/releases/latest", map[string]string{"Accept": "application/vnd.github+json"}, &rel); err != nil {
		return map[string]any{"ok": false, "error": "Couldn't reach GitHub. Try again, or download it from the emulator's site."}
	}
	name, dl := pickAsset(ja(rel["assets"]), sp)
	if dl == "" || !hostOK(dl) {
		return map[string]any{"ok": false, "error": "Couldn't find a Windows download in the latest release. Use the Website button instead."}
	}
	dest := filepath.Join(cfgDir, "emulators", id)
	tmp := filepath.Join(cfgDir, "emulators", id+".download")
	if err := os.MkdirAll(filepath.Dir(dest), 0o700); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	cl := &http.Client{Timeout: 15 * time.Minute, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if !hostOK(r.URL.String()) || len(via) > 6 {
			return fmt.Errorf("redirect refused")
		}
		return nil
	}}
	resp, err := cl.Get(dl)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return map[string]any{"ok": false, "error": "The download failed."}
	}
	defer resp.Body.Close()
	f, err := os.Create(tmp)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	_, err = io.Copy(f, io.LimitReader(resp.Body, 800<<20))
	f.Close()
	defer os.Remove(tmp)
	if err != nil {
		return map[string]any{"ok": false, "error": "The download was interrupted."}
	}
	os.RemoveAll(dest)
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if strings.HasSuffix(strings.ToLower(name), ".zip") {
		err = unzipSafe(tmp, dest)
	} else {
		// Windows 10/11 ship a tar.exe (bsdtar) that can read 7z
		c := exec.Command("tar", "-xf", tmp, "-C", dest)
		hide(c)
		if out, e := c.CombinedOutput(); e != nil {
			err = fmt.Errorf("couldn't unpack the .7z (%s)", strings.TrimSpace(string(out)))
		}
	}
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	exe := findExe(dest, sp.Exe)
	if exe == "" {
		return map[string]any{"ok": false, "error": "Unpacked, but couldn't find the program inside. Look in " + dest, "dir": dest}
	}
	return map[string]any{"ok": true, "exe": exe, "dir": dest, "version": js(rel["tag_name"])}
}

func findExe(dir, want string) string {
	var hit, any string
	filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		n := strings.ToLower(d.Name())
		if n == strings.ToLower(want) && hit == "" {
			hit = p
		}
		if any == "" && strings.HasSuffix(n, ".exe") && !strings.Contains(n, "unins") && !strings.Contains(n, "crash") {
			any = p
		}
		return nil
	})
	if hit != "" {
		return hit
	}
	return any
}

func unzipSafe(src, dest string) error {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return fmt.Errorf("the download wasn't a valid zip")
	}
	defer zr.Close()
	root, _ := filepath.Abs(dest)
	var total int64
	for _, f := range zr.File {
		p := filepath.Join(root, filepath.FromSlash(f.Name))
		if p != root && !strings.HasPrefix(p, root+string(os.PathSeparator)) {
			continue
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(p, 0o700)
			continue
		}
		total += int64(f.UncompressedSize64)
		if total > 3<<30 {
			return fmt.Errorf("the archive is too large")
		}
		os.MkdirAll(filepath.Dir(p), 0o700)
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o700)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, io.LimitReader(rc, 3<<30))
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func registerInstall(mux *http.ServeMux) {
	mux.HandleFunc("/api/install", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			ID string `json:"id"`
		}
		readJSON(r, &o)
		writeJSON(w, installEmu(o.ID))
	})
	mux.HandleFunc("/api/installable", func(w http.ResponseWriter, r *http.Request) {
		ids := []string{}
		for k := range instSpecs {
			ids = append(ids, k)
		}
		writeJSON(w, map[string]any{"ids": ids})
	})
}
