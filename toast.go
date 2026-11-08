package main

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// A small always-on-top pop-up for things that happen while a game covers Arcade (an achievement unlocking).
// It is a second Edge window like the Guide, kept hidden until there is something to show.

const toastTitle = "Hollywood Toast"

var (
	toastQ        = make(chan map[string]string, 16)
	toastMu       sync.Mutex
	toastCmd      *exec.Cmd
	toastSpawning bool
)

func killToast() {
	toastMu.Lock()
	defer toastMu.Unlock()
	if toastCmd != nil && toastCmd.Process != nil {
		toastCmd.Process.Kill()
	}
}

func ensureToastWindow() {
	toastMu.Lock()
	defer toastMu.Unlock()
	if toastSpawning || findWindow(toastTitle, true) != 0 {
		return
	}
	br := findBrowser()
	if br == "" {
		return
	}
	u := "http://127.0.0.1:" + itoa(port) + "/toast.html?k=" + token
	cmd := exec.Command(br, "--app="+u, "--user-data-dir="+filepath.Join(cfgDir, "profile-toast"),
		"--no-first-run", "--autoplay-policy=no-user-gesture-required", "--window-size=420,130", "--disable-features=Translate,HardwareMediaKeyHandling,MediaSessionService")
	if err := cmd.Start(); err != nil {
		arcLog("Toast: could not start the window: " + err.Error())
		return
	}
	toastCmd = cmd
	toastSpawning = true
	go func() {
		defer func() { toastMu.Lock(); toastSpawning = false; toastMu.Unlock() }()
		for i := 0; i < 80; i++ {
			time.Sleep(250 * time.Millisecond)
			if h := findWindow(toastTitle, true); h != 0 {
				toastPrepare(h)
				hideWindow(h)
				return
			}
		}
		arcLog("Toast: the window never appeared")
	}()
}

func registerToast(mux *http.ServeMux) {
	mux.HandleFunc("/api/toast/push", func(w http.ResponseWriter, r *http.Request) {
		var o struct{ Title, Text, Icon string }
		readJSON(r, &o)
		if o.Title == "" {
			writeJSON(w, result{false, "empty"})
			return
		}
		select {
		case toastQ <- map[string]string{"title": o.Title, "text": o.Text, "icon": o.Icon}:
		default:
		}
		go ensureToastWindow()
		writeJSON(w, result{OK: true})
	})
	// the pop-up window asks for the next message; wait=0 answers at once
	mux.HandleFunc("/api/toast/next", func(w http.ResponseWriter, r *http.Request) {
		wait := 25 * time.Second
		if r.URL.Query().Get("wait") == "0" {
			wait = 0
		}
		if wait == 0 {
			select {
			case m := <-toastQ:
				writeJSON(w, m)
			default:
				writeJSON(w, map[string]string{})
			}
			return
		}
		select {
		case m := <-toastQ:
			writeJSON(w, m)
		case <-time.After(wait):
			writeJSON(w, map[string]string{})
		case <-r.Context().Done():
		}
	})
	mux.HandleFunc("/api/toast/show", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			On bool `json:"on"`
		}
		json.NewDecoder(r.Body).Decode(&o)
		if h := findWindow(toastTitle, true); h != 0 {
			showToastWindow(h, o.On)
		}
		writeJSON(w, result{OK: true})
	})
}
