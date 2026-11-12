package main

// Plugins: a folder inside <config>/plugins/<id>/ holds plugin.json and the script it names (main.js by default).
// A plugin never runs in Arcade's own page. The page runs it inside a sandbox that has no network and no access to
// Arcade, and the plugin can only ask the page for things it was approved for. This file is the server half:
// it lists plugins, remembers what was approved, serves the script, and does the web requests plugins are allowed
// to make (only to the sites listed in its manifest, never to this PC or the home network).

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed sampleplugins
var samplePlugins embed.FS

// permissions a plugin may ask for. "launch" is recognised but not available yet: a plugin that asks for it cannot be switched on.
var pluginPerms = map[string]string{
	"ui":           "Add a shelf to Home, a page to the sidebar and pop-up messages",
	"library.read": "Read your game and app list (names, sources, play time, achievements)",
	"events":       "Know when you start or close a game",
	"net":          "Fetch information from the websites it lists",
	"storage":      "Keep a small file of its own settings",
}

var pluginIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,47}$`)

type pluginManifest struct {
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description"`
	Author      string   `json:"author"`
	Main        string   `json:"main"`
	Permissions []string `json:"permissions"`
	Net         []string `json:"net"`
}

type pluginInfo struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description"`
	Author      string   `json:"author"`
	Permissions []string `json:"permissions"`
	Net         []string `json:"net"`
	On          bool     `json:"on"`
	Granted     []string `json:"granted"`
	Error       string   `json:"error,omitempty"`
}

type pluginState struct {
	On    bool     `json:"on"`
	Perms []string `json:"perms"`
}

var (
	pluginMu    sync.Mutex
	pluginsFile = func() string { return filepath.Join(cfgDir, "plugins.json") }
	pluginsDir  = func() string { return filepath.Join(cfgDir, "plugins") }
	pluginData  = func() string { return filepath.Join(cfgDir, "plugin-data") }
)

func loadPluginState() map[string]pluginState {
	m := map[string]pluginState{}
	if b, err := os.ReadFile(pluginsFile()); err == nil {
		json.Unmarshal(b, &m)
	}
	return m
}

func savePluginState(m map[string]pluginState) error {
	b, _ := json.MarshalIndent(m, "", "  ")
	return writeFileSafe(pluginsFile(), b)
}

// readManifest reads and checks one plugin's manifest. A problem is reported in Error and the plugin cannot be enabled.
func readManifest(id string) (pluginManifest, string) {
	var m pluginManifest
	if !pluginIDRe.MatchString(id) {
		return m, "The folder name must be lowercase letters, numbers, dots, dashes or underscores."
	}
	b, err := os.ReadFile(filepath.Join(pluginsDir(), id, "plugin.json"))
	if err != nil {
		return m, "plugin.json is missing."
	}
	if len(b) > 64<<10 {
		return m, "plugin.json is too big."
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, "plugin.json is not valid: " + err.Error()
	}
	if strings.TrimSpace(m.Name) == "" {
		m.Name = id
	}
	if m.Main == "" {
		m.Main = "main.js"
	}
	if strings.ContainsAny(m.Main, `/\`) || !strings.HasSuffix(strings.ToLower(m.Main), ".js") {
		return m, `"main" must be a .js file inside the plugin folder.`
	}
	seen := map[string]bool{}
	for _, p := range m.Permissions {
		if p == "launch" {
			return m, `Asks to launch programs ("launch"), which this version of Arcade does not allow plugins to do.`
		}
		if _, ok := pluginPerms[p]; !ok {
			return m, "Asks for an unknown permission: " + p
		}
		seen[p] = true
	}
	if seen["net"] && len(m.Net) == 0 {
		return m, `Asks for "net" but lists no websites in "net".`
	}
	for _, h := range m.Net {
		if !validPluginHost(h) {
			return m, "Not a usable website name in \"net\": " + h
		}
	}
	return m, ""
}

var hostRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)

// validPluginHost accepts plain website names only (no addresses, no localhost, no ports or paths).
func validPluginHost(h string) bool {
	h = strings.ToLower(h)
	if net.ParseIP(h) != nil || !hostRe.MatchString(h) {
		return false
	}
	return !strings.HasSuffix(h, ".local") && !strings.HasSuffix(h, ".internal") && !strings.HasSuffix(h, ".lan")
}

// hostAllowed says whether a request to host may be made for a plugin that listed hosts (the site itself or a subdomain of it).
func hostAllowed(host string, hosts []string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, h := range hosts {
		h = strings.ToLower(h)
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

func listPlugins() []pluginInfo {
	pluginMu.Lock()
	defer pluginMu.Unlock()
	st := loadPluginState()
	out := []pluginInfo{}
	ents, _ := os.ReadDir(pluginsDir())
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		id := e.Name()
		m, bad := readManifest(id)
		pi := pluginInfo{ID: id, Name: m.Name, Version: m.Version, Description: m.Description, Author: m.Author, Permissions: m.Permissions, Net: m.Net, Error: bad, Granted: []string{}}
		if pi.Name == "" {
			pi.Name = id
		}
		if pi.Permissions == nil {
			pi.Permissions = []string{}
		}
		if s, ok := st[id]; ok && bad == "" {
			pi.On, pi.Granted = s.On, grantedPerms(m.Permissions, s.Perms)
		}
		out = append(out, pi)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// grantedPerms keeps only permissions that the manifest still asks for (so an updated plugin cannot sneak in new ones).
func grantedPerms(asked, granted []string) []string {
	out := []string{}
	for _, g := range granted {
		for _, a := range asked {
			if g == a {
				out = append(out, g)
				break
			}
		}
	}
	return out
}

func pluginReady(id string, need string) (pluginManifest, error) {
	m, bad := readManifest(id)
	if bad != "" {
		return m, errors.New(bad)
	}
	s, ok := loadPluginState()[id]
	if !ok || !s.On {
		return m, errors.New("this plugin is off")
	}
	if need != "" {
		has := false
		for _, g := range grantedPerms(m.Permissions, s.Perms) {
			if g == need {
				has = true
			}
		}
		if !has {
			return m, errors.New("this plugin was not given the \"" + need + "\" permission")
		}
	}
	return m, nil
}

// publicDialer refuses to connect to this PC or anything on a home or private network.
var publicDialer = &net.Dialer{
	Timeout: 10 * time.Second,
	Control: func(network, address string, c syscall.RawConn) error {
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		if !publicIP(net.ParseIP(host)) {
			return errors.New("that address is not on the public internet")
		}
		return nil
	},
}

func publicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	return !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() || ip.Equal(net.IPv4bcast) || isCGNAT(ip))
}

func isCGNAT(ip net.IP) bool {
	_, n, _ := net.ParseCIDR("100.64.0.0/10")
	return n.Contains(ip)
}

func pluginFetch(id, raw string) (map[string]any, error) {
	m, err := pluginReady(id, "net")
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return nil, errors.New("only https addresses can be fetched")
	}
	if u.Port() != "" && u.Port() != "443" {
		return nil, errors.New("only the standard https port is allowed")
	}
	if !hostAllowed(u.Hostname(), m.Net) {
		return nil, errors.New(u.Hostname() + " is not in this plugin's \"net\" list")
	}
	cl := &http.Client{
		Timeout:   15 * time.Second,
		Transport: &http.Transport{DialContext: publicDialer.DialContext, Proxy: http.ProxyFromEnvironment},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 4 || req.URL.Scheme != "https" || !hostAllowed(req.URL.Hostname(), m.Net) {
				return errors.New("redirected somewhere this plugin may not go")
			}
			return nil
		},
	}
	req, _ := http.NewRequest("GET", u.String(), nil)
	req.Header.Set("User-Agent", "HollywoodArcade-plugin/"+id)
	resp, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	return map[string]any{"status": resp.StatusCode, "text": string(b)}, nil
}

func installExamples() (int, error) {
	n := 0
	ents, err := samplePlugins.ReadDir("sampleplugins")
	if err != nil {
		return 0, err
	}
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		dst := filepath.Join(pluginsDir(), e.Name())
		if _, err := os.Stat(dst); err == nil {
			continue // never overwrite a plugin that is already there
		}
		files, _ := samplePlugins.ReadDir("sampleplugins/" + e.Name())
		os.MkdirAll(dst, 0o755)
		for _, f := range files {
			b, _ := samplePlugins.ReadFile("sampleplugins/" + e.Name() + "/" + f.Name())
			if err := os.WriteFile(filepath.Join(dst, f.Name()), b, 0o644); err != nil {
				return n, err
			}
		}
		n++
	}
	return n, nil
}

func registerPlugins(mux *http.ServeMux) {
	mux.HandleFunc("/api/plugins", func(w http.ResponseWriter, r *http.Request) {
		os.MkdirAll(pluginsDir(), 0o755)
		writeJSON(w, map[string]any{"dir": pluginsDir(), "plugins": listPlugins(), "perms": pluginPerms})
	})
	mux.HandleFunc("/api/plugins/set", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			ID    string   `json:"id"`
			On    bool     `json:"on"`
			Perms []string `json:"perms"`
		}
		readJSON(r, &o)
		m, bad := readManifest(o.ID)
		if bad != "" {
			writeJSON(w, result{false, bad})
			return
		}
		pluginMu.Lock()
		defer pluginMu.Unlock()
		st := loadPluginState()
		st[o.ID] = pluginState{On: o.On, Perms: grantedPerms(m.Permissions, o.Perms)}
		if err := savePluginState(st); err != nil {
			writeJSON(w, result{false, err.Error()})
			return
		}
		arcLog(fmt.Sprintf("Plugin %s switched %v", o.ID, map[bool]string{true: "on", false: "off"}[o.On]))
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/plugins/code", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		pluginMu.Lock()
		m, err := pluginReady(id, "")
		pluginMu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		b, err := os.ReadFile(filepath.Join(pluginsDir(), id, m.Main))
		if err != nil || len(b) > 1<<20 {
			http.Error(w, "script missing or too big", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(b)
	})
	mux.HandleFunc("/api/plugins/fetch", func(w http.ResponseWriter, r *http.Request) {
		var o struct{ ID, URL string }
		readJSON(r, &o)
		pluginMu.Lock()
		res, err := pluginFetch(o.ID, o.URL)
		pluginMu.Unlock()
		if err != nil {
			writeJSON(w, result{false, err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "status": res["status"], "text": res["text"]})
	})
	mux.HandleFunc("/api/plugins/storage", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			ID   string `json:"id"`
			Data any    `json:"data"`
			Set  bool   `json:"set"`
		}
		readJSON(r, &o)
		pluginMu.Lock()
		defer pluginMu.Unlock()
		if _, err := pluginReady(o.ID, "storage"); err != nil {
			writeJSON(w, result{false, err.Error()})
			return
		}
		p := filepath.Join(pluginData(), o.ID+".json")
		if o.Set {
			b, _ := json.Marshal(o.Data)
			if len(b) > 256<<10 {
				writeJSON(w, result{false, "too much data (the limit is 256 KB)"})
				return
			}
			os.MkdirAll(pluginData(), 0o755)
			if err := writeFileSafe(p, b); err != nil {
				writeJSON(w, result{false, err.Error()})
				return
			}
			writeJSON(w, result{OK: true})
			return
		}
		var v any
		if b, err := os.ReadFile(p); err == nil {
			json.Unmarshal(b, &v)
		}
		writeJSON(w, map[string]any{"ok": true, "data": v})
	})
	mux.HandleFunc("/api/plugins/examples", func(w http.ResponseWriter, r *http.Request) {
		os.MkdirAll(pluginsDir(), 0o755)
		n, err := installExamples()
		if err != nil {
			writeJSON(w, result{false, err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "added": n})
	})
	mux.HandleFunc("/api/plugins/folder", func(w http.ResponseWriter, r *http.Request) {
		os.MkdirAll(pluginsDir(), 0o755)
		if runtime.GOOS == "windows" {
			exec.Command("explorer", pluginsDir()).Start()
		}
		writeJSON(w, result{OK: true})
	})
}
