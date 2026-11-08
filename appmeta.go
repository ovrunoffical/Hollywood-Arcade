package main

import (
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type appMeta struct {
	Icon    string   `json:"icon,omitempty"`
	Desc    string   `json:"desc,omitempty"`
	Tagline string   `json:"tagline,omitempty"`
	Site    string   `json:"site,omitempty"`
	Sources []string `json:"sources,omitempty"`
	Log     []string `json:"log,omitempty"`
}

var (
	reTagAttr = regexp.MustCompile(`([A-Za-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
	reMetaTag = regexp.MustCompile(`(?is)<(meta|link)\b[^>]*>`)
	reTitle   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
)

func tagAttrs(tag string) map[string]string {
	m := map[string]string{}
	for _, a := range reTagAttr.FindAllStringSubmatch(tag, -1) {
		v := a[2]
		if v == "" {
			v = a[3]
		}
		m[strings.ToLower(a[1])] = html.UnescapeString(v)
	}
	return m
}

type iconCand struct {
	url   string
	score int
}

// pageInfo reads a web page's own description and icon list (no key needed).
func pageInfo(raw string) (desc, title string, icons []iconCand) {
	base, err := url.Parse(raw)
	if err != nil {
		return
	}
	req, _ := http.NewRequest("GET", raw, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HollywoodArcade/1.0")
	req.Header.Set("Accept", "text/html,*/*;q=0.8")
	resp, err := httpc.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 600<<10))
	s := string(b)
	if i := strings.Index(strings.ToLower(s), "</head>"); i > 0 {
		s = s[:i]
	}
	if m := reTitle.FindStringSubmatch(s); m != nil {
		title = strings.TrimSpace(html.UnescapeString(reTags.ReplaceAllString(m[1], "")))
	}
	var ogd, d string
	for _, t := range reMetaTag.FindAllString(s, -1) {
		a := tagAttrs(t)
		if strings.HasPrefix(strings.ToLower(t), "<meta") {
			k := strings.ToLower(a["name"] + a["property"])
			switch k {
			case "description":
				d = a["content"]
			case "og:description":
				ogd = a["content"]
			}
			continue
		}
		rel := strings.ToLower(a["rel"])
		if !strings.Contains(rel, "icon") || a["href"] == "" {
			continue
		}
		ref, err := url.Parse(a["href"])
		if err != nil {
			continue
		}
		sc := 32
		if strings.Contains(rel, "apple-touch") {
			sc = 180
		}
		if sz := strings.Split(strings.ToLower(a["sizes"]), "x"); len(sz) == 2 {
			if n, e := strconv.Atoi(sz[0]); e == nil && n > 0 {
				sc = n
			}
		}
		if strings.HasSuffix(strings.ToLower(ref.Path), ".svg") || strings.Contains(a["type"], "svg") {
			sc = 400
		}
		icons = append(icons, iconCand{base.ResolveReference(ref).String(), sc})
	}
	desc = strings.TrimSpace(d)
	if desc == "" {
		desc = strings.TrimSpace(ogd)
	}
	sort.SliceStable(icons, func(i, j int) bool { return icons[i].score > icons[j].score })
	return
}

// sameSite lets an icon come from the page's own host (or a sibling like cdn.example.com).
func sameSite(page, img string) bool {
	a, e1 := url.Parse(page)
	b, e2 := url.Parse(img)
	if e1 != nil || e2 != nil || (b.Scheme != "https" && b.Scheme != "http") {
		return false
	}
	ha, hb := strings.ToLower(a.Hostname()), strings.ToLower(b.Hostname())
	if ha == hb {
		return true
	}
	root := func(h string) string {
		p := strings.Split(h, ".")
		if len(p) > 2 {
			p = p[len(p)-2:]
		}
		return strings.Join(p, ".")
	}
	return strings.Contains(ha, ".") && root(ha) == root(hb)
}

// downloadIcon saves an app icon (png, svg, ico, jpg, webp, gif).
func downloadIcon(u, id, page string) string {
	u = bigThumb(u)
	if !okImageHost(u) && !(page != "" && sameSite(page, u)) {
		return ""
	}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HollywoodArcade/1.0")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")
	resp, err := httpc.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if resp.StatusCode != 200 || !(strings.HasPrefix(ct, "image/") || ct == "binary/octet-stream") {
		return ""
	}
	ext := ".png"
	pl := strings.ToLower(u)
	switch {
	case strings.Contains(ct, "svg") || strings.Contains(pl, ".svg"):
		ext = ".svg"
	case strings.Contains(ct, "icon") || strings.Contains(pl, ".ico"):
		ext = ".ico"
	case strings.Contains(ct, "webp"):
		ext = ".webp"
	case strings.Contains(ct, "gif"):
		ext = ".gif"
	case strings.Contains(ct, "jpeg") || strings.Contains(ct, "jpg"):
		ext = ".jpg"
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil || len(b) < 100 {
		return ""
	}
	dir := filepath.Join(cfgDir, "art")
	os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, "app_"+reSafe.ReplaceAllString(id, "_")+ext)
	for _, e := range []string{".png", ".svg", ".ico", ".webp", ".gif", ".jpg"} {
		if e != ext {
			os.Remove(strings.TrimSuffix(p, ext) + e)
		}
	}
	if os.WriteFile(p, b, 0o644) != nil {
		return ""
	}
	return p
}

var reParen = regexp.MustCompile(`\s*\(.*\)\s*$`)

// wikiApp finds the Wikipedia article for a program or website.
func wikiApp(name string) (title, extract, tagline, page, thumb string) {
	var s struct {
		Query struct {
			Search []struct {
				Title string `json:"title"`
			} `json:"search"`
		} `json:"query"`
	}
	for _, q := range []string{name + " software", name + " application", name} {
		s.Query.Search = nil
		if getJSON(wikiURL+"/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch="+url.QueryEscape(q), nil, &s) != nil {
			continue
		}
		for _, r := range s.Query.Search {
			if titleScore(reParen.ReplaceAllString(r.Title, ""), name) < .6 {
				continue
			}
			var sum struct {
				Type        string `json:"type"`
				Extract     string `json:"extract"`
				Description string `json:"description"`
				Thumbnail   struct {
					Source string `json:"source"`
				} `json:"thumbnail"`
				URLs struct {
					Desktop struct {
						Page string `json:"page"`
					} `json:"desktop"`
				} `json:"content_urls"`
			}
			t := strings.ReplaceAll(url.PathEscape(r.Title), "%20", "_")
			if getJSON(wikiURL+"/api/rest_v1/page/summary/"+t, nil, &sum) != nil || strings.Contains(sum.Type, "disambiguation") || sum.Extract == "" {
				continue
			}
			return r.Title, sum.Extract, sum.Description, sum.URLs.Desktop.Page, sum.Thumbnail.Source
		}
	}
	return
}

func trimDesc(t string, n int) string {
	t = strings.TrimSpace(html.UnescapeString(t))
	if len(t) > n {
		cut := strings.LastIndexAny(t[:n], ".!? ")
		if cut < n/2 {
			cut = n
		}
		t = strings.TrimSpace(t[:cut]) + "…"
	}
	return t
}

func fetchAppMeta(id, name, kind, target string) appMeta {
	var m appMeta
	nm := metaName(name)
	if nm == "" {
		nm = name
	}
	page := ""
	if u, err := url.Parse(target); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" {
		page = target
		h := u.Hostname()
		local := h == "localhost" || h == "127.0.0.1" || strings.HasPrefix(h, "192.168.") || strings.HasPrefix(h, "10.") || !strings.Contains(h, ".")
		if !local {
			m.Site = u.Scheme + "://" + u.Host
		}
		desc, _, icons := pageInfo(target)
		if desc != "" {
			m.Desc = trimDesc(desc, 500)
			m.Sources = append(m.Sources, "its website")
		} else {
			m.Log = append(m.Log, "website: no description on the page")
		}
		if !local && (len(icons) == 0 || icons[0].score < 96) {
			if p := downloadIcon("https://www.google.com/s2/favicons?sz=256&domain="+url.QueryEscape(u.Hostname()), id, "https://www.google.com/"); p != "" {
				m.Icon = p
			}
		}
		for _, ic := range icons {
			if m.Icon != "" {
				break
			}
			if p := downloadIcon(ic.url, id, page); p != "" {
				m.Icon = p
				break
			}
		}
		if m.Icon == "" {
			if p := downloadIcon(u.Scheme+"://"+u.Host+"/favicon.ico", id, page); p != "" {
				m.Icon = p
			}
		}
		if m.Icon == "" && !local {
			if p := downloadIcon("https://www.google.com/s2/favicons?sz=256&domain="+url.QueryEscape(u.Hostname()), id, "https://www.google.com/"); p != "" {
				m.Icon = p
			}
		}
		if m.Icon != "" {
			m.Sources = append(m.Sources, "site icon")
		} else {
			m.Log = append(m.Log, "website: no icon found")
		}
	}
	if kind == "exe" || kind == "rom" {
		if p := exeIcon(target, id); p != "" {
			m.Icon = p
			m.Sources = append(m.Sources, "program icon")
		}
	}
	title, ex, tag, wpage, thumb := wikiApp(nm)
	if title == "" {
		m.Log = append(m.Log, "Wikipedia: no article for \""+nm+"\"")
	} else {
		if m.Desc == "" {
			m.Desc = trimDesc(ex, 600)
		}
		if tag != "" {
			m.Tagline = tag
		}
		if m.Site == "" {
			m.Site = wpage
		}
		if m.Icon == "" && thumb != "" {
			m.Icon = downloadIcon(thumb, id, "")
		}
		m.Sources = append(m.Sources, "Wikipedia")
	}
	return m
}

// exeIcon pulls the program's own icon out of the .exe (Windows only).
func exeIcon(exe, id string) string {
	if !fileExists(exe) || !strings.EqualFold(filepath.Ext(exe), ".exe") {
		return ""
	}
	if _, err := exec.LookPath("powershell"); err != nil {
		return ""
	}
	dir := filepath.Join(cfgDir, "art")
	os.MkdirAll(dir, 0o755)
	out := filepath.Join(dir, "app_"+reSafe.ReplaceAllString(id, "_")+".png")
	script := `Add-Type -AssemblyName System.Drawing; Add-Type -MemberDefinition '[DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern uint PrivateExtractIcons(string f,int n,int w,int h,IntPtr[] ic,int[] id,uint c,uint fl);[DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);' -Name HI -Namespace W; $h=New-Object IntPtr[] 1; $d=New-Object int[] 1; if(([W.HI]::PrivateExtractIcons($env:HA_EXE,0,256,256,$h,$d,1,0) -gt 0) -and $h[0] -ne [IntPtr]::Zero){ $ic=[System.Drawing.Icon]::FromHandle($h[0]); $bm=$ic.ToBitmap(); $bm.Save($env:HA_OUT,[System.Drawing.Imaging.ImageFormat]::Png); exit 0 }; $i=[System.Drawing.Icon]::ExtractAssociatedIcon($env:HA_EXE); $b=New-Object System.Drawing.Bitmap 256,256; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($i.ToBitmap(),0,0,256,256); $b.Save($env:HA_OUT,[System.Drawing.Imaging.ImageFormat]::Png)`
	c := exec.Command("powershell", psArgs(script)...)
	c.Env = append(os.Environ(), "HA_EXE="+exe, "HA_OUT="+out)
	hide(c)
	if c.Run() != nil || !fileExists(out) {
		return ""
	}
	return out
}

func registerAppMeta(mux *http.ServeMux) {
	mux.HandleFunc("/api/appmeta", func(w http.ResponseWriter, r *http.Request) {
		var raw map[string]string
		readJSON(r, &raw)
		if raw["id"] == "" || raw["name"] == "" {
			writeJSON(w, result{false, "missing app"})
			return
		}
		m := fetchAppMeta(raw["id"], raw["name"], raw["kind"], raw["target"])
		writeJSON(w, map[string]any{"ok": len(m.Sources) > 0, "meta": m})
	})
}

var reThumbPx = regexp.MustCompile(`/(\d+)px-`)

// bigThumb asks Wikimedia for a large copy instead of the tiny default thumbnail.
func bigThumb(u string) string {
	if strings.Contains(u, "upload.wikimedia.org") && strings.Contains(u, "/thumb/") {
		return reThumbPx.ReplaceAllString(u, "/1000px-")
	}
	return u
}
