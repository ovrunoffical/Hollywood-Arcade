package main

// Hollywood Arcade 3.2: cover art comes from three places only: Wikipedia, TheGamesDB (the person's own key)
// and LaunchBox (its public Metadata.zip, boiled down once into a small local index).

import (
	"archive/zip"
	"bufio"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	tgdbURL   = "https://api.thegamesdb.net"
	lbMetaURL = "https://gamesdb.launchbox-app.com/Metadata.zip"
	lbImgURL  = "https://images.launchbox-app.com"
	// the metadata file is big, so it gets its own patient client
	lbClient = &http.Client{Timeout: 20 * time.Minute}
)

// findCover tries TheGamesDB, then LaunchBox. Wikipedia runs after this in fetchMeta.
func findCover(m *gameMeta, id, name, rom, tgdbKey string) string {
	if name == "" {
		return ""
	}
	if tgdbKey != "" {
		for _, u := range tgdbFronts(name, tgdbKey) {
			if c := downloadArt(u, id); c != "" {
				addSrc(m, "TheGamesDB")
				return c
			}
		}
		m.note("TheGamesDB: no cover for \"" + name + "\"")
	}
	for _, u := range lbFronts(name) {
		if c := downloadArt(u, id); c != "" {
			addSrc(m, "LaunchBox")
			return c
		}
	}
	if !lbReady() {
		m.note("LaunchBox: the game list is still downloading, try again in a few minutes")
	} else {
		m.note("LaunchBox: no cover for \"" + name + "\"")
	}
	return ""
}

// ---------- TheGamesDB ----------

func tgdbFronts(name, key string) []string {
	if key == "" || name == "" {
		return nil
	}
	var r struct {
		Data struct {
			Games []struct {
				ID   int    `json:"id"`
				Name string `json:"game_name"`
			} `json:"games"`
		} `json:"data"`
		Include struct {
			Boxart struct {
				Base struct {
					Original string `json:"original"`
					Large    string `json:"large"`
				} `json:"base_url"`
				Data map[string][]struct {
					Type     string `json:"type"`
					Side     string `json:"side"`
					Filename string `json:"filename"`
				} `json:"data"`
			} `json:"boxart"`
		} `json:"include"`
	}
	q := tgdbURL + "/v1/Games/ByGameName?include=boxart&apikey=" + url.QueryEscape(key) + "&name=" + url.QueryEscape(name)
	if getJSON(q, nil, &r) != nil {
		return nil
	}
	base := r.Include.Boxart.Base.Original
	if base == "" {
		base = r.Include.Boxart.Base.Large
	}
	if base == "" {
		return nil
	}
	var out []string
	best := 0.0
	var bestID string
	for _, g := range r.Data.Games {
		if sc := titleScore(metaName(g.Name), name); sc > best && sc >= .7 {
			best, bestID = sc, fmt.Sprint(g.ID)
		}
	}
	if bestID == "" {
		return nil
	}
	for _, b := range r.Include.Boxart.Data[bestID] {
		if b.Type == "boxart" && b.Side == "front" && b.Filename != "" {
			out = append(out, base+b.Filename)
		}
	}
	return out
}

// ---------- LaunchBox ----------

type lbRow struct{ Plat, File string }

var (
	lbMu       sync.Mutex
	lbIdx      map[string][]lbRow
	lbLoaded   time.Time
	lbBuilding bool
	reNorm     = regexp.MustCompile(`[^a-z0-9]+`)
)

func lbNorm(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.TrimPrefix(s, "the ")
	return reNorm.ReplaceAllString(s, "")
}

func lbPath() string { return filepath.Join(cfgDir, "launchbox.idx") }

func lbReady() bool {
	lbMu.Lock()
	defer lbMu.Unlock()
	return lbIdx != nil
}

// lbEnsure loads the saved index, and rebuilds it in the background when it is missing or two weeks old.
func lbEnsure() {
	lbMu.Lock()
	if lbIdx == nil {
		if idx := lbLoad(lbPath()); idx != nil {
			lbIdx = idx
			if st, err := os.Stat(lbPath()); err == nil {
				lbLoaded = st.ModTime()
			}
		}
	}
	stale := lbIdx == nil || time.Since(lbLoaded) > 14*24*time.Hour
	if !stale || lbBuilding {
		lbMu.Unlock()
		return
	}
	lbBuilding = true
	lbMu.Unlock()
	go func() {
		defer func() { recover() }()
		idx, err := lbBuild(lbMetaURL)
		lbMu.Lock()
		defer lbMu.Unlock()
		lbBuilding = false
		if err != nil || len(idx) == 0 {
			return
		}
		lbSave(lbPath(), idx)
		lbIdx, lbLoaded = idx, time.Now()
	}()
}

func lbFronts(name string) []string {
	lbEnsure()
	lbMu.Lock()
	idx := lbIdx
	lbMu.Unlock()
	if idx == nil {
		return nil
	}
	tries := []string{name}
	for _, sep := range []string{": ", " - "} {
		if i := strings.Index(name, sep); i > 0 {
			tries = append(tries, name[:i])
		}
	}
	for _, t := range tries {
		rows := idx[lbNorm(t)]
		if len(rows) == 0 {
			continue
		}
		var out []string
		for _, r := range rows { // PC first, then the rest
			if strings.EqualFold(r.Plat, "Windows") {
				out = append(out, lbImgURL+"/"+r.File)
			}
		}
		for _, r := range rows {
			if !strings.EqualFold(r.Plat, "Windows") {
				out = append(out, lbImgURL+"/"+r.File)
			}
		}
		return out
	}
	return nil
}

func lbBuild(src string) (map[string][]lbRow, error) {
	tmp, err := os.CreateTemp("", "lbmeta*.zip")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmp.Name())
	req, _ := http.NewRequest("GET", src, nil)
	req.Header.Set("User-Agent", "HollywoodArcade/1.0 (game launcher)")
	resp, err := lbClient.Do(req)
	if err != nil {
		tmp.Close()
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		tmp.Close()
		return nil, fmt.Errorf("LaunchBox: HTTP %d", resp.StatusCode)
	}
	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		return nil, err
	}
	tmp.Close()
	zr, err := zip.OpenReader(tmp.Name())
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	for _, f := range zr.File {
		if strings.HasSuffix(strings.ToLower(f.Name), ".xml") {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return lbParse(rc), nil
		}
	}
	return nil, fmt.Errorf("LaunchBox: no XML in the download")
}

// lbParse streams Metadata.xml: <Game> rows give names, <GameImage> rows give front box art file names.
func lbParse(r io.Reader) map[string][]lbRow {
	type game struct {
		Name       string `xml:"Name"`
		DatabaseID string `xml:"DatabaseID"`
		Platform   string `xml:"Platform"`
	}
	type image struct {
		DatabaseID string `xml:"DatabaseID"`
		FileName   string `xml:"FileName"`
		Type       string `xml:"Type"`
		Region     string `xml:"Region"`
	}
	games := map[string]game{}
	best := map[string]image{}
	rank := func(region string) int {
		switch strings.ToLower(region) {
		case "north america", "united states":
			return 0
		case "world", "":
			return 1
		}
		return 2
	}
	dec := xml.NewDecoder(bufio.NewReaderSize(r, 1<<20))
	dec.Strict = false
	for {
		t, err := dec.Token()
		if err != nil {
			break
		}
		se, ok := t.(xml.StartElement)
		if !ok {
			continue
		}
		switch se.Name.Local {
		case "Game":
			var g game
			if dec.DecodeElement(&g, &se) == nil && g.DatabaseID != "" && g.Name != "" {
				games[g.DatabaseID] = g
			}
		case "GameImage":
			var im image
			if dec.DecodeElement(&im, &se) == nil && im.Type == "Box - Front" && im.FileName != "" {
				if cur, have := best[im.DatabaseID]; !have || rank(im.Region) < rank(cur.Region) {
					best[im.DatabaseID] = im
				}
			}
		}
	}
	out := map[string][]lbRow{}
	for id, im := range best {
		if g, ok := games[id]; ok {
			k := lbNorm(g.Name)
			if k != "" {
				out[k] = append(out[k], lbRow{g.Platform, im.FileName})
			}
		}
	}
	return out
}

func lbSave(path string, idx map[string][]lbRow) {
	os.MkdirAll(filepath.Dir(path), 0o755)
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return
	}
	w := bufio.NewWriter(f)
	for k, rows := range idx {
		for _, r := range rows {
			fmt.Fprintf(w, "%s\t%s\t%s\n", k, r.Plat, r.File)
		}
	}
	w.Flush()
	f.Close()
	os.Rename(tmp, path)
}

func lbLoad(path string) map[string][]lbRow {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	out := map[string][]lbRow{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<16), 1<<20)
	for sc.Scan() {
		p := strings.SplitN(sc.Text(), "\t", 3)
		if len(p) == 3 {
			out[p[0]] = append(out[p[0]], lbRow{p[1], p[2]})
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
