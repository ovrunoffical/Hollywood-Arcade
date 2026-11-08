package main

import (
	"archive/zip"
	"encoding/json"
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
