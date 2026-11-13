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

// findArt fills in the cover, clear logo, disc and fanart from TheGamesDB and LaunchBox. Wikipedia runs after this in fetchMeta.
func findArt(m *gameMeta, id, name, tgdbKey string) {
	if name == "" {
		return
	}
	get := func(u, suffix string) string {
		if u == "" {
			return ""
		}
		return downloadArt(u, id+suffix)
	}
	for _, r := range lbRows(name) {
		if m.Cover == "" && r.Front != "" {
			if m.Cover = get(lbImgURL+"/"+r.Front, ""); m.Cover != "" {
				addSrc(m, "LaunchBox")
			}
		}
		if m.Logo == "" && r.Logo != "" {
			m.Logo = get(lbImgURL+"/"+r.Logo, "-logo")
		}
		if m.Disc == "" && r.Disc != "" {
			m.Disc = get(lbImgURL+"/"+r.Disc, "-disc")
		}
		if m.Fan == "" && r.Fan != "" {
			m.Fan = get(lbImgURL+"/"+r.Fan, "-fan")
		}
	}
	if tgdbKey != "" && (m.Cover == "" || m.Logo == "" || m.Fan == "") {
		t := tgdbArt(name, tgdbKey)
		if m.Cover == "" {
			for _, u := range t.Fronts {
				if m.Cover = get(u, ""); m.Cover != "" {
					addSrc(m, "TheGamesDB")
					break
				}
			}
		}
		if m.Logo == "" {
			m.Logo = get(t.Logo, "-logo")
		}
		if m.Fan == "" {
			m.Fan = get(t.Fan, "-fan")
		}
	}
	if !lbReady() {
		m.Retry = true
	}
	if m.Cover == "" {
		if !lbReady() {
			m.note("LaunchBox: the game list is still downloading, try again in a few minutes")
		} else {
			m.note("No cover found for \"" + name + "\" on LaunchBox or TheGamesDB")
		}
	}
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

type tgdbSet struct {
	Fronts    []string
	Logo, Fan string
}

// tgdbArt returns front box art plus, when the site has them, a clear logo and fanart.
func tgdbArt(name, key string) tgdbSet {
	out := tgdbSet{Fronts: tgdbFronts(name, key)}
	if key == "" || name == "" {
		return out
	}
	var r struct {
		Data struct {
			Games []struct {
				ID   int    `json:"id"`
				Name string `json:"game_name"`
			} `json:"games"`
		} `json:"data"`
	}
	if getJSON(tgdbURL+"/v1/Games/ByGameName?apikey="+url.QueryEscape(key)+"&name="+url.QueryEscape(name), nil, &r) != nil {
		return out
	}
	best, id := 0.0, 0
	for _, g := range r.Data.Games {
		if sc := titleScore(metaName(g.Name), name); sc > best && sc >= .7 {
			best, id = sc, g.ID
		}
	}
	if id == 0 {
		return out
	}
	var im struct {
		Data struct {
			Base struct {
				Original string `json:"original"`
			} `json:"base_url"`
			Images map[string][]struct {
				Type     string `json:"type"`
				Filename string `json:"filename"`
			} `json:"images"`
		} `json:"data"`
	}
	if getJSON(fmt.Sprintf("%s/v1/Games/Images?apikey=%s&games_id=%d&filter%%5Btype%%5D=clearlogo,fanart", tgdbURL, url.QueryEscape(key), id), nil, &im) != nil {
		return out
	}
	for _, x := range im.Data.Images[fmt.Sprint(id)] {
		switch x.Type {
		case "clearlogo":
			if out.Logo == "" {
				out.Logo = im.Data.Base.Original + x.Filename
			}
		case "fanart":
			if out.Fan == "" {
				out.Fan = im.Data.Base.Original + x.Filename
			}
		}
	}
	return out
}

// ---------- LaunchBox ----------

type lbRow struct{ Plat, Front, Logo, Disc, Fan string }

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

func lbPath() string { return filepath.Join(cfgDir, "launchbox2.idx") }

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

// lbRows finds a game's rows in the index, PC entries first.
func lbRows(name string) []lbRow {
	lbEnsure()
	lbMu.Lock()
	idx := lbIdx
	lbMu.Unlock()
	if idx == nil {
		return nil
	}
	tries := lbVariants(name)
	for _, t := range tries {
		rows := idx[lbNorm(t)]
		if len(rows) == 0 {
			continue
		}
		return lbOrder(rows)
	}
	// last resort: an index title that starts with ours (a longer subtitle) once ours is long enough to be specific
	if n := lbNorm(name); len(n) >= 8 {
		var best string
		for k := range idx {
			if strings.HasPrefix(k, n) && len(k)-len(n) <= 14 && (best == "" || len(k) < len(best)) {
				best = k
			}
		}
		if best != "" {
			return lbOrder(idx[best])
		}
	}
	return nil
}

// lbFronts lists box-front picture links for a game (used by the cover picker).
func lbFronts(name string) []string {
	var out []string
	for _, r := range lbRows(name) {
		if r.Front != "" {
			out = append(out, lbImgURL+"/"+r.Front)
		}
	}
	return out
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
	best := map[string]map[string]image{} // database id -> kind -> best picture
	kinds := map[string]string{"Box - Front": "front", "Clear Logo": "logo", "Disc": "disc", "Fanart - Background": "fan"}
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
			if dec.DecodeElement(&im, &se) != nil || im.FileName == "" {
				continue
			}
			k, ok := kinds[im.Type]
			if !ok {
				continue
			}
			if best[im.DatabaseID] == nil {
				best[im.DatabaseID] = map[string]image{}
			}
			if cur, have := best[im.DatabaseID][k]; !have || rank(im.Region) < rank(cur.Region) {
				best[im.DatabaseID][k] = im
			}
		}
	}
	out := map[string][]lbRow{}
	for id, byKind := range best {
		if g, ok := games[id]; ok {
			k := lbNorm(g.Name)
			if k != "" {
				out[k] = append(out[k], lbRow{g.Platform, byKind["front"].FileName, byKind["logo"].FileName, byKind["disc"].FileName, byKind["fan"].FileName})
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
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n", k, r.Plat, r.Front, r.Logo, r.Disc, r.Fan)
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
		p := strings.Split(sc.Text(), "\t")
		if len(p) == 6 {
			out[p[0]] = append(out[p[0]], lbRow{p[1], p[2], p[3], p[4], p[5]})
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// lbOrder puts Windows rows first.
func lbOrder(rows []lbRow) []lbRow {
	var out []lbRow
	for _, r := range rows {
		if strings.EqualFold(r.Plat, "Windows") {
			out = append(out, r)
		}
	}
	for _, r := range rows {
		if !strings.EqualFold(r.Plat, "Windows") {
			out = append(out, r)
		}
	}
	return out
}

var reLbParen = regexp.MustCompile(`\s*[\(\[][^)\]]*[\)\]]`)
var reLbEdition = regexp.MustCompile(`(?i)\s+(deluxe|standard|ultimate|gold|complete|definitive|special|collector'?s|game of the year|goty|digital)\b.*$`)

// lbVariants lists the spellings of a game's name worth looking up, best first.
func lbVariants(name string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s != "" && !seen[lbNorm(s)] {
			seen[lbNorm(s)] = true
			out = append(out, s)
		}
	}
	base := []string{name}
	n := strings.NewReplacer("™", "", "®", "", "©", "").Replace(name)
	base = append(base, n, reLbParen.ReplaceAllString(n, ""), reLbEdition.ReplaceAllString(reLbParen.ReplaceAllString(n, ""), ""))
	for _, b := range base {
		add(b)
		for _, p := range []string{"EA SPORTS ", "EA Sports ", "EA "} {
			if strings.HasPrefix(b, p) {
				add(strings.TrimPrefix(b, p))
			}
		}
	}
	for _, b := range append([]string{}, out...) {
		for _, sep := range []string{": ", " - "} {
			if i := strings.Index(b, sep); i > 0 {
				add(b[:i])
			}
		}
	}
	return out
}
