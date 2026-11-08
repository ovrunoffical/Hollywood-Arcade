package main

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
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
func coverCandidates(name, appid, rom, rawgKey, sgdbKey, igdbID, igdbSecret string) []coverOpt {
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
	run(func() { // Steam
		id := appid
		if id == "" && rom == "" {
			id = steamSearchID(name)
		}
		if id == "" {
			return
		}
		base := steamCDN + "/steam/apps/" + id + "/"
		for _, f := range [][2]string{{"library_600x900_2x.jpg", "portrait"}, {"library_600x900.jpg", "portrait"}, {"header.jpg", "wide"}, {"capsule_616x353.jpg", "wide"}, {"library_hero.jpg", "wide"}} {
			f := f
			run(func() {
				if headOK(base + f[0]) {
					add(base+f[0], "Steam", f[1])
				}
			})
		}
	})
	run(func() { // Epic
		for i, h := range epicSearch(name) {
			if i > 2 {
				break
			}
			add(h.Tall, "Epic", "portrait")
			add(h.Wide, "Epic", "wide")
		}
	})
	run(func() { // GOG
		var g struct {
			Products []struct {
				Title string `json:"title"`
				Cover string `json:"coverVertical"`
				Horiz string `json:"coverHorizontal"`
			} `json:"products"`
		}
		if getJSON(gogURL+"/v1/catalog?limit=5&countryCode=US&locale=en-US&currencyCode=USD&query=like%3A"+url.QueryEscape(name), nil, &g) != nil {
			return
		}
		for _, p := range g.Products {
			if titleScore(metaName(p.Title), name) >= .7 {
				add(p.Cover, "GOG", "portrait")
				add(p.Horiz, "GOG", "wide")
			}
		}
	})
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
	if sgdbKey != "" {
		run(func() { // SteamGridDB: many community covers
			h := map[string]string{"Authorization": "Bearer " + sgdbKey}
			var s struct {
				Data []struct {
					ID int `json:"id"`
				} `json:"data"`
			}
			if getJSON(sgdbURL+"/api/v2/search/autocomplete/"+url.PathEscape(name), h, &s) != nil || len(s.Data) == 0 {
				return
			}
			var g struct {
				Data []struct {
					URL string `json:"url"`
				} `json:"data"`
			}
			if getJSON(fmt.Sprintf("%s/api/v2/grids/game/%d?dimensions=600x900,342x482", sgdbURL, s.Data[0].ID), h, &g) == nil {
				for i, x := range g.Data {
					if i < 14 {
						add(x.URL, "SteamGridDB", "portrait")
					}
				}
			}
		})
	}
	if rawgKey != "" {
		run(func() {
			var s struct {
				Results []struct {
					Image string `json:"background_image"`
				} `json:"results"`
			}
			if getJSON(rawgURL+"/api/games?page_size=2&search_precise=true&key="+url.QueryEscape(rawgKey)+"&search="+url.QueryEscape(name), nil, &s) == nil {
				for _, r := range s.Results {
					add(r.Image, "RAWG", "wide")
				}
			}
		})
	}
	if igdbID != "" && igdbSecret != "" {
		run(func() {
			tok := igdbToken(igdbID, igdbSecret)
			if tok == "" {
				return
			}
			q := `search "` + strings.NewReplacer(`"`, ``, `\`, ``).Replace(name) + `"; fields cover.image_id,screenshots.image_id,artworks.image_id; limit 1;`
			req, _ := http.NewRequest("POST", igdbURL+"/v4/games", strings.NewReader(q))
			req.Header.Set("Client-ID", igdbID)
			req.Header.Set("Authorization", "Bearer "+tok)
			resp, err := httpc.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			var rs []struct {
				Cover struct {
					ID string `json:"image_id"`
				} `json:"cover"`
				Shots []struct {
					ID string `json:"image_id"`
				} `json:"screenshots"`
				Art []struct {
					ID string `json:"image_id"`
				} `json:"artworks"`
			}
			if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&rs) != nil || len(rs) == 0 {
				return
			}
			if rs[0].Cover.ID != "" {
				add(igdbImgURL+"/igdb/image/upload/t_cover_big_2x/"+rs[0].Cover.ID+".jpg", "IGDB", "portrait")
			}
			for i, s := range rs[0].Shots {
				if i < 3 {
					add(igdbImgURL+"/igdb/image/upload/t_screenshot_big/"+s.ID+".jpg", "IGDB", "wide")
				}
			}
			for i, s := range rs[0].Art {
				if i < 2 {
					add(igdbImgURL+"/igdb/image/upload/t_1080p/"+s.ID+".jpg", "IGDB", "wide")
				}
			}
		})
	}
	if rom != "" {
		run(func() {
			ext := strings.ToLower(filepath.Ext(rom))
			base := strings.TrimSuffix(filepath.Base(rom), filepath.Ext(rom))
			for _, sys := range libretroSystems[ext] {
				for _, n := range []string{base, name + " (USA)", name + " (World)", name + " (Europe)", name} {
					for _, k := range [][2]string{{"Named_Boxarts", "portrait"}, {"Named_Titles", "wide"}, {"Named_Snaps", "wide"}} {
						u := libretroURL + "/" + url.PathEscape(sys) + "/" + k[0] + "/" + url.PathEscape(reLibBad.Replace(n)) + ".png"
						if headOK(u) {
							add(u, "Libretro", k[1])
						}
					}
				}
			}
		})
	}
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
	mux.HandleFunc("/api/covers", func(w http.ResponseWriter, r *http.Request) {
		var raw map[string]string
		readJSON(r, &raw)
		if raw["name"] == "" {
			writeJSON(w, map[string]any{"ok": false, "covers": []coverOpt{}})
			return
		}
		c := coverCandidates(raw["name"], raw["appid"], raw["rom"], raw["rawgKey"], raw["sgdbKey"], raw["igdbId"], raw["igdbSecret"])
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
