package main

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Read-only window onto the user's own Jellyfin server (ErsatzTV channels show up there as Live TV).
var jf struct {
	sync.Mutex
	base, key string
}

var jfc = &http.Client{Timeout: 12 * time.Second}

var jfAllowed = []string{"/Users", "/Items", "/Shows", "/LiveTv", "/System/Info/Public"}

func jfRequest(p string) (*http.Response, error) {
	jf.Lock()
	base, key := jf.base, jf.key
	jf.Unlock()
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, http.ErrNotSupported
	}
	ok := false
	for _, a := range jfAllowed {
		if strings.HasPrefix(p, a) {
			ok = true
		}
	}
	if !ok || strings.Contains(p, "..") || !strings.HasPrefix(p, "/") {
		return nil, http.ErrNotSupported
	}
	req, _ := http.NewRequest("GET", strings.TrimRight(base, "/")+p, nil)
	if key != "" {
		req.Header.Set("X-Emby-Token", key)
		req.Header.Set("Authorization", `MediaBrowser Token="`+key+`"`)
	}
	req.Header.Set("User-Agent", "HollywoodArcade/2.0")
	return jfc.Do(req)
}

func registerJellyfin(mux *http.ServeMux) {
	mux.HandleFunc("/api/jfconfig", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Base string `json:"base"`
			Key  string `json:"key"`
		}
		readJSON(r, &o)
		jf.Lock()
		jf.base, jf.key = strings.TrimSpace(o.Base), strings.TrimSpace(o.Key)
		jf.Unlock()
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/jf", func(w http.ResponseWriter, r *http.Request) {
		resp, err := jfRequest(r.URL.Query().Get("p"))
		if err != nil {
			writeJSON(w, map[string]any{"error": "Couldn't reach Jellyfin. Check the address in Settings."})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			writeJSON(w, map[string]any{"error": "Jellyfin refused the API key. Make a new one in Dashboard, API Keys."})
			return
		}
		if resp.StatusCode != 200 {
			writeJSON(w, map[string]any{"error": "Jellyfin answered with an error (" + resp.Status + ")."})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, io.LimitReader(resp.Body, 8<<20))
	})
	mux.HandleFunc("/api/jfimg", func(w http.ResponseWriter, r *http.Request) {
		resp, err := jfRequest(r.URL.Query().Get("p"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer resp.Body.Close()
		ct := resp.Header.Get("Content-Type")
		if resp.StatusCode != 200 || !strings.HasPrefix(ct, "image/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=600")
		io.Copy(w, io.LimitReader(resp.Body, 12<<20))
	})
}
