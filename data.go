package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

// ---- rolling automatic backups of library.json (at most one per 30 minutes, newest 8 kept)
func backupDir() string { return filepath.Join(cfgDir, "backups") }

func rotateBackup() {
	defer func() { recover() }()
	src := filepath.Join(cfgDir, "library.json")
	b, err := os.ReadFile(src)
	if err != nil || len(b) < 20 {
		return
	}
	os.MkdirAll(backupDir(), 0o700)
	names := backupNames()
	if len(names) > 0 {
		if st, err := os.Stat(filepath.Join(backupDir(), names[0])); err == nil && time.Since(st.ModTime()) < 30*time.Minute {
			return
		}
	}
	name := "library-" + time.Now().Format("20060102-150405") + ".json"
	if os.WriteFile(filepath.Join(backupDir(), name), b, 0o600) != nil {
		return
	}
	names = backupNames()
	for i := 8; i < len(names); i++ {
		os.Remove(filepath.Join(backupDir(), names[i]))
	}
}

// newest first
func backupNames() []string {
	es, _ := os.ReadDir(backupDir())
	var n []string
	for _, e := range es {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "library-") && strings.HasSuffix(e.Name(), ".json") {
			n = append(n, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(n)))
	return n
}

var reSecretKey = regexp.MustCompile(`(?i)(key|secret|token|password)$`)

// stripSecrets blanks every API key, token and password in a library file so a shared backup is safe.
func stripSecrets(b []byte) []byte {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return b
	}
	var walk func(x any)
	walk = func(x any) {
		switch t := x.(type) {
		case map[string]any:
			for k, e := range t {
				if reSecretKey.MatchString(k) {
					if _, isStr := e.(string); isStr {
						t[k] = ""
						continue
					}
				}
				walk(e)
			}
		case []any:
			for _, e := range t {
				walk(e)
			}
		}
	}
	walk(v)
	out, err := json.Marshal(v)
	if err != nil {
		return b
	}
	return out
}

// redact removes the Windows user name and home folder from text people may paste into a bug report.
func redact(s string) string {
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		s = strings.ReplaceAll(s, h, "~")
		s = strings.ReplaceAll(s, strings.ReplaceAll(h, `\`, "/"), "~")
	}
	if u := os.Getenv("USERNAME"); len(u) > 2 {
		s = strings.ReplaceAll(s, u, "user")
	}
	if u := os.Getenv("USER"); len(u) > 2 && runtime.GOOS != "windows" {
		s = strings.ReplaceAll(s, u, "user")
	}
	return s
}

func healthReport() []map[string]any {
	chk := func(name string, ok bool, detail string) map[string]any {
		return map[string]any{"name": name, "ok": ok, "detail": detail}
	}
	var out []map[string]any
	b := findBrowser()
	out = append(out, chk("Microsoft Edge", b != "", map[bool]string{true: "Found", false: "Not found. The Arcade window needs Edge or Chrome."}[b != ""]))
	f := filepath.Join(cfgDir, "library.json")
	ok := false
	if st, err := os.Stat(f); err == nil && st.Size() > 0 {
		ok = true
	}
	out = append(out, chk("Library file", ok, map[bool]string{true: "Readable", false: "Not saved yet"}[ok]))
	test := filepath.Join(cfgDir, ".write-test")
	werr := os.WriteFile(test, []byte("x"), 0o600)
	os.Remove(test)
	out = append(out, chk("Can save changes", werr == nil, map[bool]string{true: "Yes", false: "The settings folder isn't writable"}[werr == nil]))
	n := len(backupNames())
	out = append(out, chk("Automatic backups", n > 0, map[bool]string{true: "Keeping recent copies of your library", false: "None yet. One is made after your next change."}[n > 0]))
	if _, err := os.Stat(`C:\Windows\System32\tar.exe`); runtime.GOOS == "windows" {
		out = append(out, chk("7z support (tar.exe)", err == nil, map[bool]string{true: "Available", false: "Missing, so a few emulator downloads can't unpack"}[err == nil]))
	}
	return out
}

const exampleRetro = `{
  "_help": "Add your own retro games. Each system has a name, and games with a name and a download file name. Restart the Arcade to load changes.",
  "systems": [
    { "id": "example", "name": "Example system", "games": [ { "name": "Example Game", "file": "Example Game.zip", "year": 1999 } ] }
  ]
}
`
const exampleEmu = `{
  "_help": "Add emulators for the Store. 'repo' is a GitHub owner/name; 'exe' is the program's file name.",
  "emulators": [
    { "id": "example", "name": "Example Emulator", "repo": "owner/name", "exe": "example.exe", "exts": "iso, bin", "args": "\"{rom}\"", "systems": ["Example system"] }
  ]
}
`

func registerData(mux *http.ServeMux) {
	mux.HandleFunc("/api/backups", func(w http.ResponseWriter, r *http.Request) {
		type e struct {
			Name string `json:"name"`
			Time int64  `json:"time"`
			Size int64  `json:"size"`
		}
		list := []e{}
		for _, n := range backupNames() {
			if st, err := os.Stat(filepath.Join(backupDir(), n)); err == nil {
				list = append(list, e{n, st.ModTime().Unix(), st.Size()})
			}
		}
		writeJSON(w, map[string]any{"backups": list})
	})
	mux.HandleFunc("/api/backups/restore", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Name string `json:"name"`
		}
		readJSON(r, &o)
		ok := false
		for _, n := range backupNames() {
			ok = ok || n == o.Name
		}
		if !ok {
			writeJSON(w, result{false, "No such backup"})
			return
		}
		b, err := os.ReadFile(filepath.Join(backupDir(), o.Name))
		if err != nil || !json.Valid(b) {
			writeJSON(w, result{false, "That backup can't be read"})
			return
		}
		rotateBackupForce()
		tmp := filepath.Join(cfgDir, "library.json.tmp")
		if os.WriteFile(tmp, b, 0o600) == nil {
			os.Rename(tmp, filepath.Join(cfgDir, "library.json"))
		}
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"checks": healthReport(), "version": appVersion, "os": runtime.GOOS + "/" + runtime.GOARCH})
	})
	mux.HandleFunc("/api/redact", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Text string `json:"text"`
		}
		readJSON(r, &o)
		writeJSON(w, map[string]string{"text": redact(o.Text)})
	})
	// user-editable data files: retro lists and emulator presets that load on top of the built-in ones
	mux.HandleFunc("/api/userdata", func(w http.ResponseWriter, r *http.Request) {
		dir := filepath.Join(cfgDir, "data")
		out := map[string]any{}
		for _, n := range []string{"retro.json", "emulators.json"} {
			var v any
			if b, err := os.ReadFile(filepath.Join(dir, n)); err == nil && json.Unmarshal(b, &v) == nil {
				out[strings.TrimSuffix(n, ".json")] = v
			}
		}
		writeJSON(w, out)
	})
	mux.HandleFunc("/api/opendata", func(w http.ResponseWriter, r *http.Request) {
		dir := filepath.Join(cfgDir, "data")
		os.MkdirAll(dir, 0o700)
		for n, c := range map[string]string{"retro.json": exampleRetro, "emulators.json": exampleEmu} {
			p := filepath.Join(dir, n)
			if _, err := os.Stat(p); err != nil {
				os.WriteFile(p, []byte(c), 0o600)
			}
		}
		writeJSON(w, start("explorer.exe", []string{dir}, ""))
	})
}

func rotateBackupForce() {
	b, err := os.ReadFile(filepath.Join(cfgDir, "library.json"))
	if err != nil {
		return
	}
	os.MkdirAll(backupDir(), 0o700)
	os.WriteFile(filepath.Join(backupDir(), "library-"+time.Now().Format("20060102-150405")+"-before-restore.json"), b, 0o600)
}
