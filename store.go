package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Steam's public storefront data (no key): what's popular, what's free, and search.

type storeItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Price string `json:"price"`
	Off   int    `json:"off,omitempty"`
	Img   string `json:"img,omitempty"`
	Src   string `json:"src,omitempty"`
	Desc  string `json:"desc,omitempty"`
}

var (
	storeMu    sync.Mutex
	storeCache = map[string]struct {
		at    time.Time
		items []storeItem
	}{}
	reAppID   = regexp.MustCompile(`/apps/(\d+)/`)
	infoCache = map[string]struct {
		at   time.Time
		info storeInfo
	}{}
)

func money(cents int, cur string) string {
	if cents <= 0 {
		return "Free"
	}
	sym := "$"
	switch cur {
	case "EUR":
		sym = "€"
	case "GBP":
		sym = "£"
	}
	return fmt.Sprintf("%s%d.%02d", sym, cents/100, cents%100)
}

func steamFeatured(cat string) ([]storeItem, error) {
	// the reply mixes objects with plain numbers (like "status"), so decode each section on its own
	var all map[string]json.RawMessage
	if err := getJSON(steamStoreURL+"/api/featuredcategories?cc=us&l=english", nil, &all); err != nil {
		return nil, err
	}
	var sec struct {
		Items []struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			Final    int    `json:"final_price"`
			Discount int    `json:"discount_percent"`
			Currency string `json:"currency"`
		} `json:"items"`
	}
	if raw, ok := all[cat]; ok {
		json.Unmarshal(raw, &sec)
	}
	var out []storeItem
	for _, it := range sec.Items {
		if it.ID != 0 && it.Name != "" {
			out = append(out, storeItem{ID: fmt.Sprint(it.ID), Name: it.Name, Price: money(it.Final, it.Currency), Off: it.Discount})
		}
	}
	return out, nil
}

var (
	reFreeApp  = regexp.MustCompile(`data-ds-appid="(\d+)"[\s\S]*?<span class="title">([^<]+)</span>`)
	reUnescape = strings.NewReplacer("&amp;", "&", "&#39;", "'", "&quot;", `"`, "&lt;", "<", "&gt;", ">", "&trade;", "", "&reg;", "")
)

func steamFree() ([]storeItem, error) {
	var r struct {
		Items []struct {
			Name string `json:"name"`
			Logo string `json:"logo"`
		} `json:"items"`
		HTML string `json:"results_html"`
	}
	u := steamStoreURL + "/search/results/?query&start=0&count=48&maxprice=free&category1=998&filter=topsellers&cc=us&l=english&infinite=1&json=1"
	if err := getJSON(u, nil, &r); err != nil {
		return nil, err
	}
	var out []storeItem
	seen := map[string]bool{}
	for _, it := range r.Items {
		if m := reAppID.FindStringSubmatch(it.Logo); m != nil && it.Name != "" && !seen[m[1]] {
			seen[m[1]] = true
			out = append(out, storeItem{ID: m[1], Name: it.Name, Price: "Free"})
		}
	}
	for _, m := range reFreeApp.FindAllStringSubmatch(r.HTML, -1) {
		if !seen[m[1]] {
			seen[m[1]] = true
			out = append(out, storeItem{ID: m[1], Name: strings.TrimSpace(reUnescape.Replace(m[2])), Price: "Free"})
		}
	}
	return out, nil
}

func steamSearch(term string) ([]storeItem, error) {
	var r struct {
		Items []struct {
			ID    int    `json:"id"`
			Name  string `json:"name"`
			Type  string `json:"type"`
			Price struct {
				Final    int    `json:"final"`
				Currency string `json:"currency"`
			} `json:"price"`
		} `json:"items"`
	}
	if err := getJSON(steamStoreURL+"/api/storesearch/?l=english&cc=US&term="+url.QueryEscape(term), nil, &r); err != nil {
		return nil, err
	}
	var out []storeItem
	for _, it := range r.Items {
		if (it.Type == "" || it.Type == "app") && !reBadTitle.MatchString(it.Name) {
			out = append(out, storeItem{ID: fmt.Sprint(it.ID), Name: it.Name, Price: money(it.Price.Final, it.Price.Currency)})
		}
	}
	return out, nil
}

// ---------- Game Pass catalog (Microsoft's public list of what's included; titles and art only) ----------

var (
	gpListURL = "https://catalog.gamepass.com"
	dcURL     = "https://displaycatalog.mp.microsoft.com"
)

// Microsoft's public Game Pass lists (ids only), by what they hold.
var gpLists = map[string]string{
	"gamepass":   "fdd9e2a7-0fee-49f6-ad69-4354098401ff", // everything on PC
	"gp_console": "f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e", // everything on console
	"gp_new":     "eab7757c-ff70-45af-bfa6-79d3cfb2bec4", // recently added
	"gp_popular": "e7590b22-e299-44db-ae22-25c61405454c", // most popular
	"gp_soon":    "95d20d3a-8b0d-4ea1-8736-83c3cdb7e5ad", // coming soon
	"gp_leaving": "393f05bf-e596-4ef6-9487-6d4fa0eab987", // leaving soon
	"gp_ea":      "b8900d09-a491-44cc-916e-32b5acae621b", // EA Play
}

func gpIDs(list string) ([]string, error) {
	var ids []struct {
		ID string `json:"id"`
	}
	if err := getJSON(gpListURL+"/sigls/v2?id="+list+"&language=en-us&market=US", nil, &ids); err != nil {
		return nil, err
	}
	var out []string
	seen := map[string]bool{}
	for _, x := range ids {
		if x.ID != "" && !seen[x.ID] && len(out) < 2000 {
			seen[x.ID] = true
			out = append(out, x.ID)
		}
	}
	return out, nil
}

type dcProduct struct {
	ProductID string `json:"ProductId"`
	Props     []struct {
		Title     string `json:"ProductTitle"`
		Short     string `json:"ShortDescription"`
		Long      string `json:"ProductDescription"`
		Developer string `json:"DeveloperName"`
		Images    []struct {
			Purpose string `json:"ImagePurpose"`
			URI     string `json:"Uri"`
		} `json:"Images"`
	} `json:"LocalizedProperties"`
	Market []struct {
		Released string `json:"OriginalReleaseDate"`
	} `json:"MarketProperties"`
	Properties struct {
		Category string `json:"Category"`
	} `json:"Properties"`
}

func dcFetch(batch []string) []dcProduct {
	var r struct {
		Products []dcProduct `json:"Products"`
	}
	if getJSON(dcURL+"/v7.0/products?market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp%2BF.1&bigIds="+strings.Join(batch, ","), nil, &r) != nil {
		return nil
	}
	return r.Products
}

func dcImage(p dcProduct, purposes ...string) string {
	if len(p.Props) == 0 {
		return ""
	}
	for _, want := range purposes {
		for _, im := range p.Props[0].Images {
			if im.Purpose == want && im.URI != "" {
				if strings.HasPrefix(im.URI, "//") {
					return "https:" + im.URI
				}
				return im.URI
			}
		}
	}
	return ""
}

func gamePass(kind string) ([]storeItem, error) {
	list, ok := gpLists[kind]
	if !ok {
		return nil, errors.New("unknown Game Pass list")
	}
	ids, err := gpIDs(list)
	if err != nil {
		return nil, err
	}
	// "recently added" and "most popular" also list console-only games: keep just what runs on PC
	if kind == "gp_new" || kind == "gp_popular" {
		if pc, err := gpIDs(gpLists["gamepass"]); err == nil && len(pc) > 0 {
			on := map[string]bool{}
			for _, id := range pc {
				on[id] = true
			}
			var keep []string
			for _, id := range ids {
				if on[id] {
					keep = append(keep, id)
				}
			}
			ids = keep
		}
	}
	if len(ids) == 0 {
		return nil, errors.New("Game Pass list was empty")
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)
	found := map[string]storeItem{}
	for i := 0; i < len(ids); i += 20 {
		end := i + 20
		if end > len(ids) {
			end = len(ids)
		}
		wg.Add(1)
		go func(batch []string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			for _, p := range dcFetch(batch) {
				if len(p.Props) == 0 || p.Props[0].Title == "" {
					continue
				}
				d := p.Props[0].Short
				if d == "" {
					d = p.Props[0].Long
				}
				if len(d) > 280 {
					d = d[:280] + "…"
				}
				mu.Lock()
				found[p.ProductID] = storeItem{ID: p.ProductID, Name: p.Props[0].Title, Price: "Game Pass", Img: dcImage(p, "Poster", "BoxArt", "Tile", "Logo"), Src: "gp", Desc: d}
				mu.Unlock()
			}
		}(ids[i:end])
	}
	wg.Wait()
	var out []storeItem
	for _, id := range ids {
		if it, ok := found[id]; ok {
			out = append(out, it)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("couldn't read the Game Pass catalog")
	}
	return out, nil
}

// storeInfo: the longer description, genres, screenshots and so on for one store item.
type storeInfo struct {
	Desc   string   `json:"desc"`
	Genres []string `json:"genres,omitempty"`
	Date   string   `json:"date,omitempty"`
	Dev    string   `json:"dev,omitempty"`
	Shots  []string `json:"shots,omitempty"`
	Score  int      `json:"score,omitempty"`
	Price  string   `json:"price,omitempty"`
}

var reStoreID = regexp.MustCompile(`^[0-9A-Za-z]{3,20}$`)

func fetchStoreInfo(src, id string) (storeInfo, error) {
	var out storeInfo
	if !reStoreID.MatchString(id) {
		return out, errors.New("bad id")
	}
	if src == "gp" {
		ps := dcFetch([]string{id})
		if len(ps) == 0 || len(ps[0].Props) == 0 {
			return out, errors.New("not found")
		}
		p := ps[0]
		out.Desc = p.Props[0].Long
		if out.Desc == "" {
			out.Desc = p.Props[0].Short
		}
		if len(out.Desc) > 900 {
			out.Desc = out.Desc[:900] + "…"
		}
		out.Dev = p.Props[0].Developer
		if p.Properties.Category != "" {
			out.Genres = strings.Split(p.Properties.Category, ",")
		}
		if len(p.Market) > 0 && len(p.Market[0].Released) >= 10 {
			out.Date = p.Market[0].Released[:10]
		}
		for _, im := range p.Props[0].Images {
			if im.Purpose == "Screenshot" && im.URI != "" && len(out.Shots) < 4 {
				u := im.URI
				if strings.HasPrefix(u, "//") {
					u = "https:" + u
				}
				out.Shots = append(out.Shots, u)
			}
		}
		return out, nil
	}
	var r map[string]struct {
		Success bool `json:"success"`
		Data    struct {
			Short  string   `json:"short_description"`
			Devs   []string `json:"developers"`
			Genres []struct {
				D string `json:"description"`
			} `json:"genres"`
			Release struct {
				Date string `json:"date"`
			} `json:"release_date"`
			Shots []struct {
				Full string `json:"path_full"`
			} `json:"screenshots"`
			Meta struct {
				Score int `json:"score"`
			} `json:"metacritic"`
			Price struct {
				Final string `json:"final_formatted"`
			} `json:"price_overview"`
		} `json:"data"`
	}
	if err := getJSON(steamStoreURL+"/api/appdetails?appids="+id+"&l=english&cc=us", nil, &r); err != nil {
		return out, err
	}
	d := r[id]
	if !d.Success {
		return out, errors.New("not found")
	}
	out.Desc = strings.TrimSpace(reUnescape.Replace(d.Data.Short))
	if len(d.Data.Devs) > 0 {
		out.Dev = d.Data.Devs[0]
	}
	for _, g := range d.Data.Genres {
		out.Genres = append(out.Genres, g.D)
	}
	out.Date = d.Data.Release.Date
	for _, sh := range d.Data.Shots {
		if len(out.Shots) < 4 {
			out.Shots = append(out.Shots, sh.Full)
		}
	}
	out.Score, out.Price = d.Data.Meta.Score, d.Data.Price.Final
	return out, nil
}

func registerStore(mux *http.ServeMux) {
	mux.HandleFunc("/api/storeinfo", func(w http.ResponseWriter, r *http.Request) {
		src, id := r.URL.Query().Get("src"), r.URL.Query().Get("id")
		key := "info|" + src + "|" + id
		storeMu.Lock()
		if c, ok := infoCache[key]; ok && time.Since(c.at) < time.Hour {
			storeMu.Unlock()
			writeJSON(w, map[string]any{"ok": true, "info": c.info})
			return
		}
		storeMu.Unlock()
		info, err := fetchStoreInfo(src, id)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false})
			return
		}
		storeMu.Lock()
		infoCache[key] = struct {
			at   time.Time
			info storeInfo
		}{time.Now(), info}
		storeMu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "info": info})
	})
	mux.HandleFunc("/api/store", func(w http.ResponseWriter, r *http.Request) {
		cat := r.URL.Query().Get("cat")
		term := strings.TrimSpace(r.URL.Query().Get("q"))
		key := cat + "|" + term
		storeMu.Lock()
		if c, ok := storeCache[key]; ok && time.Since(c.at) < 20*time.Minute {
			storeMu.Unlock()
			writeJSON(w, map[string]any{"ok": true, "items": c.items})
			return
		}
		storeMu.Unlock()
		var items []storeItem
		var err error
		switch {
		case term != "":
			items, err = steamSearch(term)
		case cat == "free":
			items, err = steamFree()
		case gpLists[cat] != "":
			items, err = gamePass(cat)
		case cat == "top_sellers" || cat == "new_releases" || cat == "specials" || cat == "coming_soon":
			items, err = steamFeatured(cat)
		default:
			writeJSON(w, map[string]any{"ok": false, "items": []storeItem{}})
			return
		}
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Couldn't load this store page (" + err.Error() + ")", "items": []storeItem{}})
			return
		}
		if items == nil {
			items = []storeItem{}
		}
		storeMu.Lock()
		storeCache[key] = struct {
			at    time.Time
			items []storeItem
		}{time.Now(), items}
		storeMu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "items": items})
	})
}
