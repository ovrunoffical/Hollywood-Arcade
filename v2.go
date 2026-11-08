package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Guide-button settings and small hand-off endpoints used by the Guide, Resume tile and controller test.
var (
	bindMu   sync.Mutex
	bindMode = "chord"
	psBit    atomic.Int32
	touchBit atomic.Int32

	navCh = make(chan string, 4)
)

func init() { psBit.Store(12); touchBit.Store(13) }

// arcLog appends one line to the same error log the app and the health report use.
func arcLog(msg string) {
	p := filepath.Join(cfgDir, "arcade.log")
	if st, err := os.Stat(p); err == nil && st.Size() > 400<<10 {
		os.Remove(p)
	}
	if f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		f.WriteString(time.Now().Format("2006-01-02 15:04:05") + "  " + msg + "\n")
		f.Close()
	}
}

func currentBind() string { bindMu.Lock(); defer bindMu.Unlock(); return bindMode }

func registerV2(mux *http.ServeMux) {
	// which button opens the Guide for the game that is running (chord, touch, ps, any)
	mux.HandleFunc("/api/guidebind", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Bind  string `json:"bind"`
			PS    *int   `json:"ps"`
			Touch *int   `json:"touch"`
		}
		readJSON(r, &o)
		switch o.Bind {
		case "chord", "touch", "ps", "any":
			bindMu.Lock()
			bindMode = o.Bind
			bindMu.Unlock()
		}
		if o.PS != nil && *o.PS >= 0 && *o.PS < 32 {
			psBit.Store(int32(*o.PS))
		}
		if o.Touch != nil && *o.Touch >= 0 && *o.Touch < 32 {
			touchBit.Store(int32(*o.Touch))
		}
		writeJSON(w, map[string]any{"ok": true, "bind": currentBind()})
	})
	// raw button bits as Windows sees them, for the controller test screen
	mux.HandleFunc("/api/padraw", func(w http.ResponseWriter, r *http.Request) {
		x, j := padRaw()
		writeJSON(w, map[string]any{"xinput": x, "joy": j})
	})
	mux.HandleFunc("/api/running", func(w http.ResponseWriter, r *http.Request) {
		n, ok := gameState()
		writeJSON(w, map[string]any{"name": n, "running": ok})
	})
	mux.HandleFunc("/api/resume", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": resumeGame()})
	})
	mux.HandleFunc("/api/front", func(w http.ResponseWriter, r *http.Request) {
		go raiseArcade()
		writeJSON(w, map[string]any{"ok": true})
	})
	// the Guide (a separate window while a game is running) asks the main Arcade window to go somewhere.
	// The Arcade page holds a long request open here so it hears about it at once even when a game covers it.
	mux.HandleFunc("/api/nav", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var o struct {
				Go string `json:"go"`
			}
			readJSON(r, &o)
			select {
			case navCh <- o.Go:
			default:
				select { // drop the oldest if nobody is listening
				case <-navCh:
				default:
				}
				navCh <- o.Go
			}
			writeJSON(w, map[string]any{"ok": true})
			return
		}
		select {
		case g := <-navCh:
			writeJSON(w, map[string]any{"go": g})
		case <-time.After(25 * time.Second):
			writeJSON(w, map[string]any{"go": ""})
		case <-r.Context().Done():
		}
	})

	// ---- error log
	mux.HandleFunc("/api/log", func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(cfgDir, "arcade.log")
		if r.Method == http.MethodPost {
			var o struct {
				Msg string `json:"msg"`
			}
			readJSON(r, &o)
			if len(o.Msg) > 4000 {
				o.Msg = o.Msg[:4000]
			}
			if st, err := os.Stat(p); err == nil && st.Size() > 400<<10 {
				os.Remove(p) // keep it small
			}
			if f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
				f.WriteString(time.Now().Format("2006-01-02 15:04:05") + "  " + strings.ReplaceAll(o.Msg, "\n", " | ") + "\n")
				f.Close()
			}
			writeJSON(w, result{OK: true})
			return
		}
		b, _ := os.ReadFile(p)
		if len(b) > 40<<10 {
			b = b[len(b)-40<<10:]
		}
		writeJSON(w, map[string]any{"log": redact(string(b)), "version": appVersion})
	})

	// ---- backup and restore: library, settings and downloaded covers in one zip
	mux.HandleFunc("/api/backup", func(w http.ResponseWriter, r *http.Request) {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		add := func(name, path string) {
			b, err := os.ReadFile(path)
			if err != nil {
				return
			}
			if f, err := zw.Create(name); err == nil {
				f.Write(b)
			}
		}
		if r.URL.Query().Get("keys") == "1" {
			add("library.json", filepath.Join(cfgDir, "library.json"))
		} else if lb, err := os.ReadFile(filepath.Join(cfgDir, "library.json")); err == nil {
			if f, err := zw.Create("library.json"); err == nil {
				f.Write(stripSecrets(lb))
			}
		}
		var total int64
		filepath.Walk(filepath.Join(cfgDir, "art"), func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || total > 300<<20 {
				return nil
			}
			total += info.Size()
			rel, _ := filepath.Rel(cfgDir, p)
			add(filepath.ToSlash(rel), p)
			return nil
		})
		zw.Close()
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="HollywoodArcade-backup-`+time.Now().Format("2006-01-02")+`.zip"`)
		w.Write(buf.Bytes())
	})
	mux.HandleFunc("/api/restore", func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(io.LimitReader(r.Body, 600<<20))
		if err != nil {
			writeJSON(w, result{false, "Couldn't read that file."})
			return
		}
		zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
		if err != nil {
			writeJSON(w, result{false, "That isn't a Hollywood Arcade backup."})
			return
		}
		ok := false
		for _, f := range zr.File {
			name := filepath.ToSlash(filepath.Clean(f.Name))
			if strings.Contains(name, "..") || strings.HasPrefix(name, "/") || f.FileInfo().IsDir() {
				continue
			}
			if name != "library.json" && !strings.HasPrefix(name, "art/") {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				continue
			}
			data, _ := io.ReadAll(io.LimitReader(rc, 80<<20))
			rc.Close()
			if name == "library.json" {
				if !json.Valid(data) {
					writeJSON(w, result{false, "The library file inside is damaged."})
					return
				}
				ok = true
			}
			dst := filepath.Join(cfgDir, filepath.FromSlash(name))
			os.MkdirAll(filepath.Dir(dst), 0o755)
			os.WriteFile(dst, data, 0o644)
		}
		if !ok {
			writeJSON(w, result{false, "That backup has no library in it."})
			return
		}
		writeJSON(w, result{OK: true})
	})

	// ---- update check: reads a small version.json from a link the user provides
	mux.HandleFunc("/api/updatecheck", func(w http.ResponseWriter, r *http.Request) {
		raw := r.URL.Query().Get("url")
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			writeJSON(w, map[string]any{"error": "Not a web address."})
			return
		}
		var v map[string]any
		if err := getJSON(raw, nil, &v); err != nil {
			writeJSON(w, map[string]any{"error": "Couldn't read the update file."})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "info": v, "current": appVersion})
	})
}
