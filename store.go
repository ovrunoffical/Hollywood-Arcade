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
}

var (
	storeMu    sync.Mutex
	storeCache = map[string]struct {
		at    time.Time
		items []storeItem
	}{}
	reAppID = regexp.MustCompile(`/apps/(\d+)/`)
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

func gamePass() ([]storeItem, error) {
	var ids []struct {
		ID string `json:"id"`
	}
	if err := getJSON(gpListURL+"/sigls/v2?id=fdd9e2a7-0fee-49f6-ad69-4354098401ff&language=en-us&market=US", nil, &ids); err != nil {
		return nil, err
	}
	var list []string
	for _, x := range ids {
		if x.ID != "" && len(list) < 80 {
			list = append(list, x.ID)
		}
	}
	if len(list) == 0 {
		return nil, errors.New("Game Pass list was empty")
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	found := map[string]storeItem{}
	for i := 0; i < len(list); i += 20 {
		end := i + 20
		if end > len(list) {
			end = len(list)
		}
		wg.Add(1)
		go func(batch []string) {
			defer wg.Done()
			var r struct {
				Products []struct {
					ProductID string `json:"ProductId"`
					Props     []struct {
						Title  string `json:"ProductTitle"`
						Images []struct {
							Purpose string `json:"ImagePurpose"`
							URI     string `json:"Uri"`
						} `json:"Images"`
					} `json:"LocalizedProperties"`
				} `json:"Products"`
			}
			if getJSON(dcURL+"/v7.0/products?market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp%2BF.1&bigIds="+strings.Join(batch, ","), nil, &r) != nil {
				return
			}
			for _, p := range r.Products {
				if len(p.Props) == 0 || p.Props[0].Title == "" {
					continue
				}
				img := ""
				for _, want := range []string{"Poster", "BoxArt", "Tile", "Logo"} {
					for _, im := range p.Props[0].Images {
						if im.Purpose == want && im.URI != "" && img == "" {
							img = im.URI
						}
					}
				}
				if strings.HasPrefix(img, "//") {
					img = "https:" + img
				}
				mu.Lock()
				found[p.ProductID] = storeItem{ID: p.ProductID, Name: p.Props[0].Title, Price: "Game Pass", Img: img, Src: "gp"}
				mu.Unlock()
			}
		}(list[i:end])
	}
	wg.Wait()
	var out []storeItem
	for _, id := range list {
		if it, ok := found[id]; ok {
			out = append(out, it)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("couldn't read the Game Pass catalog")
	}
	return out, nil
}

func registerStore(mux *http.ServeMux) {
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
		case cat == "gamepass":
			items, err = gamePass()
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
