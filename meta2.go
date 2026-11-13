package main

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	reBrackets = regexp.MustCompile(`\s*[\(\[][^\)\]]*[\)\]]`)
	reEdition  = regexp.MustCompile(`(?i)\s*[:\-\x{2013}\x{2014}]?\s*(the\s+)?(game of the year|goty|definitive|deluxe|ultimate|complete|standard|gold|premium|enhanced|digital|collector'?s|special|legendary|anniversary|director'?s cut|launch)\s+(edition|version|cut|bundle)\s*$`)
	reTrail    = regexp.MustCompile(`(?i)\s+(for windows|windows edition|pc edition|pc version|x64|x86|launcher|beta|early access)\s*$`)
	reCamel    = regexp.MustCompile(`([a-z])([A-Z])`)
	reSpaces   = regexp.MustCompile(`\s+`)
)

// metaName strips store noise (trademark signs, editions, brackets, underscores) so titles match catalogs.
func metaName(n string) string {
	n = strings.NewReplacer("™", "", "®", "", "©", "", "_", " ").Replace(n)
	if !strings.Contains(n, " ") {
		n = reCamel.ReplaceAllString(strings.ReplaceAll(n, ".", " "), "$1 $2")
	}
	n = reBrackets.ReplaceAllString(n, "")
	for i := 0; i < 2; i++ {
		n = reEdition.ReplaceAllString(n, "")
		n = reTrail.ReplaceAllString(n, "")
	}
	return strings.TrimSpace(reSpaces.ReplaceAllString(n, " "))
}

// nameVariants lists the titles worth searching for, best first.
func nameVariants(n string) []string {
	c := metaName(n)
	if c == "" {
		c = strings.TrimSpace(n)
	}
	out := []string{c}
	if i := strings.IndexAny(c, ":–—"); i > 3 {
		out = append(out, strings.TrimSpace(c[:i]))
	} else if i := strings.Index(c, " - "); i > 3 {
		out = append(out, strings.TrimSpace(c[:i]))
	}
	if strings.HasPrefix(strings.ToLower(c), "the ") && len(c) > 8 {
		out = append(out, c[4:])
	}
	return out
}

// steamArt tries each Steam image host in turn (they move around) and saves the first hit.
func steamArt(appid, file, id string) string {
	bases := []string{steamCDN}
	if steamCDN == "https://cdn.akamai.steamstatic.com" {
		bases = append(bases, "https://cdn.cloudflare.steamstatic.com", "https://shared.akamai.steamstatic.com")
	}
	for _, base := range bases {
		if c := downloadArt(base+"/steam/apps/"+appid+"/"+file, id); c != "" {
			return c
		}
	}
	return ""
}

// ---------------- music metadata (Apple's public catalog, no key) ----------------

type songMeta struct {
	OK     bool   `json:"ok"`
	Art    string `json:"art,omitempty"`
	Title  string `json:"title,omitempty"`
	Artist string `json:"artist,omitempty"`
	Album  string `json:"album,omitempty"`
	Genre  string `json:"genre,omitempty"`
	Year   string `json:"year,omitempty"`
}

var (
	songMu    sync.Mutex
	songCache = map[string]songMeta{}
)

var reSongNoise = regexp.MustCompile(`(?i)\s*[\(\[](feat\.?|ft\.?|with|remaster(ed)?|live|explicit|deluxe)[^\)\]]*[\)\]]`)

func cleanSong(t string) string { return strings.TrimSpace(reSongNoise.ReplaceAllString(t, "")) }

func songLookup(title, artist, album string) songMeta {
	key := strings.ToLower(title + "|" + artist)
	songMu.Lock()
	if v, ok := songCache[key]; ok && (v.Art == "" || fileExists(v.Art)) {
		songMu.Unlock()
		return v
	}
	songMu.Unlock()
	var r struct {
		Results []struct {
			Track  string `json:"trackName"`
			Artist string `json:"artistName"`
			Album  string `json:"collectionName"`
			Art    string `json:"artworkUrl100"`
			Genre  string `json:"primaryGenreName"`
			Date   string `json:"releaseDate"`
		} `json:"results"`
	}
	m := songMeta{}
	t := cleanSong(title)
	term := strings.TrimSpace(artist + " " + t)
	if err := getJSON(appleURL+"/search?media=music&entity=song&limit=8&term="+url.QueryEscape(term), nil, &r); err == nil {
		best, bs := -1, 0.0
		for i, x := range r.Results {
			s := titleScore(x.Track, t)
			if artist != "" {
				la, lx := strings.ToLower(artist), strings.ToLower(x.Artist)
				s = s*.7 + titleScore(x.Artist, artist)*.3
				if strings.Contains(lx, la) || strings.Contains(la, lx) {
					s += .15
				}
			}
			if album != "" && titleScore(x.Album, album) > .6 {
				s += .1
			}
			if s > bs {
				best, bs = i, s
			}
		}
		if best >= 0 && bs >= .6 {
			x := r.Results[best]
			m = songMeta{OK: true, Title: x.Track, Artist: x.Artist, Album: x.Album, Genre: x.Genre}
			if len(x.Date) >= 4 {
				m.Year = x.Date[:4]
			}
			if x.Art != "" {
				sum := sha1.Sum([]byte(strings.ToLower(x.Album + "|" + x.Artist)))
				m.Art = downloadArt(strings.Replace(x.Art, "100x100", "600x600", 1), "song-"+hex.EncodeToString(sum[:6]))
			}
		}
	}
	songMu.Lock()
	songCache[key] = m
	songMu.Unlock()
	return m
}

// ---------------- endpoints ----------------

func registerMeta2(mux *http.ServeMux) {
	registerCovers(mux)
	mux.HandleFunc("/api/songmeta", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		t := strings.TrimSpace(q.Get("title"))
		if t == "" {
			writeJSON(w, songMeta{})
			return
		}
		writeJSON(w, songLookup(t, strings.TrimSpace(q.Get("artist")), strings.TrimSpace(q.Get("album"))))
	})
	mux.HandleFunc("/api/nettest", func(w http.ResponseWriter, r *http.Request) {
		type chk struct{ Name, URL string }
		list := []chk{
			{"Steam store", steamStoreURL + "/api/storesearch/?term=portal&cc=US&l=english"},
			{"Steam images", steamCDN + "/steam/apps/620/header.jpg"},
			{"GOG catalog", gogURL + "/v1/catalog?limit=1&query=like%3Awitcher"},
			{"Wikipedia", wikiURL + "/api/rest_v1/page/summary/Portal_(video_game)"},
			{"Libretro art", libretroURL + "/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(World).png"},
			{"Epic store", epicURL + "/"},
			{"Game Pass catalog", gpListURL + "/sigls/v2?id=fdd9e2a7-0fee-49f6-ad69-4354098401ff&language=en-us&market=US"},
			{"Apple music search", appleURL + "/search?media=music&entity=song&limit=1&term=daft+punk"},
		}
		out := make([]map[string]any, len(list))
		var wg sync.WaitGroup
		for i, c := range list {
			wg.Add(1)
			go func(i int, c chk) {
				defer wg.Done()
				cl := &http.Client{Timeout: 8 * time.Second}
				req, _ := http.NewRequest("GET", c.URL, nil)
				req.Header.Set("User-Agent", "HollywoodArcade/1.0")
				resp, err := cl.Do(req)
				e := map[string]any{"name": c.Name}
				if err != nil {
					e["ok"], e["detail"] = false, "can't reach it (internet, VPN, firewall or DNS)"
				} else {
					resp.Body.Close()
					e["ok"] = resp.StatusCode < 400 || resp.StatusCode == 404
					e["detail"] = fmt.Sprintf("HTTP %d", resp.StatusCode)
				}
				out[i] = e
			}(i, c)
		}
		wg.Wait()
		writeJSON(w, map[string]any{"ok": true, "checks": out})
	})
}

// ---------------- Epic Games Store (no key): tall box art for Epic-only games like Fortnite ----------------

var epicURL = "https://store.epicgames.com"

type epicHit struct {
	Title, Desc, Dev, Tall, Wide, Thumb string
}

func epicSearch(name string) []epicHit {
	q := `query s($k:String,$c:String!,$l:String){Catalog{searchStore(keywords:$k,country:$c,locale:$l,count:6){elements{title description developerDisplayName keyImages{type url}}}}}`
	body, _ := json.Marshal(map[string]any{"query": q, "variables": map[string]string{"k": name, "c": "US", "l": "en-US"}})
	req, _ := http.NewRequest("POST", epicURL+"/graphql", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "HollywoodArcade/1.0")
	resp, err := httpc.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var r struct {
		Data struct {
			Catalog struct {
				SearchStore struct {
					Elements []struct {
						Title     string `json:"title"`
						Desc      string `json:"description"`
						Dev       string `json:"developerDisplayName"`
						KeyImages []struct {
							Type string `json:"type"`
							URL  string `json:"url"`
						} `json:"keyImages"`
					} `json:"elements"`
				} `json:"searchStore"`
			} `json:"Catalog"`
		} `json:"data"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&r) != nil {
		return nil
	}
	var out []epicHit
	for _, e := range r.Data.Catalog.SearchStore.Elements {
		if titleScore(metaName(e.Title), name) < .7 {
			continue
		}
		h := epicHit{Title: e.Title, Desc: e.Desc, Dev: e.Dev}
		for _, k := range e.KeyImages {
			switch k.Type {
			case "OfferImageTall", "DieselStoreFrontTall":
				if h.Tall == "" {
					h.Tall = k.URL
				}
			case "OfferImageWide", "DieselStoreFrontWide":
				if h.Wide == "" {
					h.Wide = k.URL
				}
			case "Thumbnail":
				h.Thumb = k.URL
			}
		}
		out = append(out, h)
	}
	return out
}

// ---------------- cover choices ----------------

type coverOpt struct {
	URL    string `json:"url"`
	Source string `json:"source"`
	Kind   string `json:"kind"`
}

func headOK(u string) bool {
	if !okImageHost(u) {
		return false
	}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/1.0")
	req.Header.Set("Range", "bytes=0-0")
	resp, err := httpc.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return (resp.StatusCode == 200 || resp.StatusCode == 206) && strings.HasPrefix(resp.Header.Get("Content-Type"), "image/")
}

// coverCandidates gathers every picture the free sources have for a game so the person can choose.
func coverCandidates(name, tgdbKey string) []coverOpt {
	name = metaName(name)
	var mu sync.Mutex
	var out []coverOpt
	seen := map[string]bool{}
	add := func(u, src, kind string) {
		if u == "" || !okImageHost(u) {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if !seen[u] {
			seen[u] = true
			out = append(out, coverOpt{u, src, kind})
		}
	}
	var wg sync.WaitGroup
	run := func(f func()) {
		wg.Add(1)
		go func() { defer wg.Done(); defer func() { recover() }(); f() }()
	}
	run(func() { // Wikipedia
		var s struct {
			Query struct {
				Search []struct {
					Title string `json:"title"`
				} `json:"search"`
			} `json:"query"`
		}
		for _, q := range []string{name + " video game", name} {
			if getJSON(wikiURL+"/w/api.php?action=query&list=search&format=json&srlimit=2&srsearch="+url.QueryEscape(q), nil, &s) != nil {
				continue
			}
			for _, r := range s.Query.Search {
				if titleScore(regexp.MustCompile(`\s*\(.*\)\s*$`).ReplaceAllString(r.Title, ""), name) < .5 {
					continue
				}
				var sum struct {
					Extract string                  `json:"extract"`
					Thumb   struct{ Source string } `json:"thumbnail"`
					Orig    struct{ Source string } `json:"originalimage"`
				}
				if getJSON(wikiURL+"/api/rest_v1/page/summary/"+strings.ReplaceAll(url.PathEscape(r.Title), "%20", "_"), nil, &sum) == nil && strings.Contains(strings.ToLower(sum.Extract), "game") {
					add(sum.Thumb.Source, "Wikipedia", "portrait")
					return
				}
			}
		}
	})
	run(func() { // TheGamesDB (the person's key)
		for _, u := range tgdbFronts(name, tgdbKey) {
			add(u, "TheGamesDB", "portrait")
		}
	})
	run(func() { // LaunchBox
		for _, u := range lbFronts(name) {
			add(u, "LaunchBox", "portrait")
		}
	})
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(25 * time.Second):
	}
	mu.Lock()
	defer mu.Unlock()
	sort.SliceStable(out, func(i, j int) bool { return out[i].Kind == "portrait" && out[j].Kind != "portrait" })
	return append([]coverOpt(nil), out...)
}

func registerCovers(mux *http.ServeMux) {
	time.AfterFunc(25*time.Second, lbEnsure) // fetch the LaunchBox game list in the background
	mux.HandleFunc("/api/covers", func(w http.ResponseWriter, r *http.Request) {
		var raw map[string]string
		readJSON(r, &raw)
		if raw["name"] == "" {
			writeJSON(w, map[string]any{"ok": false, "covers": []coverOpt{}})
			return
		}
		c := coverCandidates(raw["name"], raw["tgdbKey"])
		if c == nil {
			c = []coverOpt{}
		}
		writeJSON(w, map[string]any{"ok": true, "covers": c})
	})
	mux.HandleFunc("/api/setcover", func(w http.ResponseWriter, r *http.Request) {
		var raw map[string]string
		readJSON(r, &raw)
		if raw["id"] == "" || raw["url"] == "" {
			writeJSON(w, result{false, "missing"})
			return
		}
		sum := sha1.Sum([]byte(raw["url"]))
		p := downloadArt(raw["url"], raw["id"]+"-"+hex.EncodeToString(sum[:4]))
		if p == "" {
			writeJSON(w, result{false, "Couldn't download that picture."})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "path": p})
	})
}
