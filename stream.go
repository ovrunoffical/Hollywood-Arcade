package main

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
)

// Streaming services open in their own app window with a separate browser profile, so sign-ins are
// remembered and nothing touches the person's normal browsing.
func streamLaunch(u string) result {
	pu, err := url.Parse(u)
	if err != nil || pu.Scheme != "https" || pu.Host == "" {
		return result{false, "Only https addresses can be opened."}
	}
	b := findBrowser()
	if b == "" {
		return result{false, "Microsoft Edge wasn't found."}
	}
	dir := filepath.Join(cfgDir, "stream-profile")
	os.MkdirAll(dir, 0o700)
	before := windowSnapshot()
	res := start(b, []string{"--app=" + u, "--user-data-dir=" + dir, "--start-fullscreen",
		"--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check"}, "")
	if res.OK {
		setStreamTarget(before)
	}
	return res
}

var reSettings = regexp.MustCompile(`^ms-settings:[a-z0-9\-]+$|^ms-availablenetworks:$`)

func registerStream(mux *http.ServeMux) {
	mux.HandleFunc("/api/stream", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			URL string `json:"url"`
		}
		readJSON(r, &o)
		writeJSON(w, streamLaunch(o.URL))
	})
}
