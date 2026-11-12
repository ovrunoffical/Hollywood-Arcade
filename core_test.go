package main

import (
	"archive/zip"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVersionCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"v2.2.3", "2.2.2", true}, {"2.2.2", "2.2.2", false}, {"v2.2.1", "2.2.2", false},
		{"v2.10.0", "2.9.9", true}, {"v3.0.0", "2.99.99", true}, {"v2.2.3-beta", "2.2.2", true}, {"", "2.2.2", false},
	}
	for _, c := range cases {
		if got := verNewerGo(c.a, c.b); got != c.want {
			t.Errorf("verNewerGo(%q,%q)=%v want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestWriteFileSafe(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "library.json")
	for _, s := range []string{`{"a":1}`, `{"a":2,"b":[1,2,3]}`} {
		if err := writeFileSafe(p, []byte(s)); err != nil {
			t.Fatal(err)
		}
		if b, _ := os.ReadFile(p); string(b) != s {
			t.Fatalf("got %q want %q", b, s)
		}
	}
	if _, err := os.Stat(p + ".tmp"); err == nil {
		t.Error("temp file left behind")
	}
	if err := writeFileSafe(filepath.Join(d, "missing", "x.json"), []byte("{}")); err == nil {
		t.Error("expected an error writing into a missing folder")
	}
}

func TestUnzipRefusesEscapes(t *testing.T) {
	d := t.TempDir()
	zp := filepath.Join(d, "evil.zip")
	f, _ := os.Create(zp)
	zw := zip.NewWriter(f)
	for _, n := range []string{"../escape.txt", "ok/inside.txt"} {
		w, _ := zw.Create(n)
		w.Write([]byte("x"))
	}
	zw.Close()
	f.Close()
	dest := filepath.Join(d, "out")
	os.MkdirAll(dest, 0o700)
	if err := unzipSafe(zp, dest); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(d, "escape.txt")); err == nil {
		t.Error("a file escaped the destination folder")
	}
	if _, err := os.Stat(filepath.Join(dest, "ok", "inside.txt")); err != nil {
		t.Error("a normal file was not extracted")
	}
}

func TestGuardRejectsStrangers(t *testing.T) {
	token, port = "secret", 5555
	h := guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) }))
	do := func(host, cookie string) int {
		r := httptest.NewRequest("GET", "http://"+host+"/api/x", nil)
		r.Host = host
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: "ha", Value: cookie})
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if c := do("127.0.0.1:5555", "secret"); c != 200 {
		t.Errorf("good request got %d", c)
	}
	if c := do("127.0.0.1:5555", ""); c != 403 {
		t.Errorf("no cookie got %d", c)
	}
	if c := do("127.0.0.1:5555", "wrong"); c != 403 {
		t.Errorf("wrong cookie got %d", c)
	}
	if c := do("evil.example:5555", "secret"); c != 403 {
		t.Errorf("foreign host got %d", c)
	}
}

func TestLibraryFallsBackToBackup(t *testing.T) {
	cfgDir = t.TempDir()
	os.MkdirAll(backupDir(), 0o700)
	good := `{"items":[{"id":"x"}],"settings":{"arcAch":{"lib10":1}}}`
	os.WriteFile(filepath.Join(backupDir(), "library-20260101-000000.json"), []byte(good), 0o600)
	os.WriteFile(filepath.Join(cfgDir, "library.json"), []byte(`{"items":[`), 0o600)
	mux := buildMux()
	r := httptest.NewRequest("GET", "/api/load", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	var v map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil || !strings.Contains(w.Body.String(), "lib10") {
		t.Fatalf("expected the backup back, got %q", w.Body.String())
	}
}

func TestVoiceLink(t *testing.T) {
	ok := map[string]string{
		"https://discord.com/channels/123/456":     "discord://-/channels/123/456",
		"https://discordapp.com/channels/123/456/": "discord://-/channels/123/456",
		"discord://-/channels/123/456":             "discord://-/channels/123/456",
	}
	for in, want := range ok {
		if got := voiceLink(in); got != want {
			t.Errorf("voiceLink(%q)=%q want %q", in, got, want)
		}
	}
	for _, bad := range []string{"", "https://evil.example/channels/1/2", "https://discord.com.evil.example/channels/1/2", "calc.exe", "https://discord.com/invite/abc", "discord://-/channels/1/2; calc"} {
		if got := voiceLink(bad); got != "" {
			t.Errorf("voiceLink(%q) should be refused, got %q", bad, got)
		}
	}
}

func TestAppIconHelpers(t *testing.T) {
	for in, want := range map[string]string{"Jellyfin": "jellyfin.org", "Proton VPN": "protonvpn.com", "Apple Music": "music.apple.com", "Discord": "discord.com", "My Random Tool": ""} {
		if got := knownAppDomain(in); got != want {
			t.Errorf("knownAppDomain(%q)=%q want %q", in, got, want)
		}
	}
	if !logoLooking("https://upload.wikimedia.org/x/Jellyfin_logo.svg.png") || logoLooking("https://upload.wikimedia.org/x/Jellyfin_10.8_screenshot.png") {
		t.Error("logoLooking mistook a screenshot for a logo, or the other way round")
	}
}

func TestPluginHostRules(t *testing.T) {
	for _, h := range []string{"127.0.0.1", "localhost", "10.0.0.5", "foo", "a b.com", "x.local", "evil.internal", "", "http://a.com", "a.com/path"} {
		if validPluginHost(h) {
			t.Errorf("%q should not be a usable plugin host", h)
		}
	}
	for _, h := range []string{"api.example.com", "retroachievements.org", "a-b.co.uk"} {
		if !validPluginHost(h) {
			t.Errorf("%q should be usable", h)
		}
	}
	if !hostAllowed("api.example.com", []string{"example.com"}) || hostAllowed("evilexample.com", []string{"example.com"}) || hostAllowed("example.com.evil.net", []string{"example.com"}) {
		t.Error("hostAllowed matches the wrong sites")
	}
}

func TestPublicIP(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.5", "172.16.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1"} {
		if publicIP(net.ParseIP(s)) {
			t.Errorf("%s must not count as public", s)
		}
	}
	if !publicIP(net.ParseIP("93.184.216.34")) {
		t.Error("a public address was refused")
	}
}

func TestPluginManifestChecks(t *testing.T) {
	cfgDir = t.TempDir()
	mk := func(id, js string) {
		os.MkdirAll(filepath.Join(pluginsDir(), id), 0o755)
		os.WriteFile(filepath.Join(pluginsDir(), id, "plugin.json"), []byte(js), 0o644)
	}
	mk("ok", `{"name":"Ok","permissions":["ui","net"],"net":["example.com"]}`)
	mk("launch", `{"name":"L","permissions":["launch"]}`)
	mk("unknown", `{"name":"U","permissions":["root"]}`)
	mk("nonet", `{"name":"N","permissions":["net"]}`)
	mk("path", `{"name":"P","main":"../x.js"}`)
	mk("Bad Name", `{"name":"B"}`)
	if _, bad := readManifest("ok"); bad != "" {
		t.Errorf("a good manifest was refused: %s", bad)
	}
	for _, id := range []string{"launch", "unknown", "nonet", "path", "Bad Name", "missing"} {
		if _, bad := readManifest(id); bad == "" {
			t.Errorf("%s should have been refused", id)
		}
	}
	if g := grantedPerms([]string{"ui"}, []string{"ui", "library.read"}); len(g) != 1 || g[0] != "ui" {
		t.Errorf("a plugin must not get permissions its manifest does not ask for: %v", g)
	}
	// off by default, and a request is refused until it is switched on
	if _, err := pluginFetch("ok", "https://example.com/"); err == nil {
		t.Error("a plugin that was never switched on could fetch")
	}
	st := map[string]pluginState{"ok": {On: true, Perms: []string{"ui"}}}
	savePluginState(st)
	if _, err := pluginFetch("ok", "https://example.com/"); err == nil {
		t.Error("fetch worked without the net permission")
	}
	st["ok"] = pluginState{On: true, Perms: []string{"ui", "net"}}
	savePluginState(st)
	for _, u := range []string{"http://example.com/", "https://other.com/", "https://127.0.0.1/", "https://example.com:8080/", "https://user@example.com/"} {
		if _, err := pluginFetch("ok", u); err == nil {
			t.Errorf("%s should have been refused", u)
		}
	}
}

func TestExamplePluginsAreValid(t *testing.T) {
	cfgDir = t.TempDir()
	n, err := installExamples()
	if err != nil || n < 2 {
		t.Fatalf("examples: %d, %v", n, err)
	}
	for _, p := range listPlugins() {
		if p.Error != "" {
			t.Errorf("example %s is invalid: %s", p.ID, p.Error)
		}
	}
}
