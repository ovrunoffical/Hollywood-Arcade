package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Achievement providers. Each one is read-only and uses the person's own key; nothing is shared or sent anywhere else.
var (
	steamAPIURL = "https://api.steampowered.com"
	steamComURL = "https://steamcommunity.com"
	raURL       = "https://retroachievements.org"
	raMediaURL  = "https://media.retroachievements.org"
	xblURL      = "https://xbl.io"
)

type achItem struct {
	ID     string  `json:"i"`
	Name   string  `json:"n"`
	Desc   string  `json:"d,omitempty"`
	Icon   string  `json:"ic,omitempty"`
	Got    bool    `json:"u,omitempty"`
	Time   int64   `json:"t,omitempty"`
	Rarity float64 `json:"r,omitempty"`
	Hidden bool    `json:"h,omitempty"`
	Points int     `json:"p,omitempty"`
}

type achSet struct {
	OK       bool      `json:"ok"`
	Provider string    `json:"provider"`
	Title    string    `json:"title,omitempty"`
	Items    []achItem `json:"items,omitempty"`
	Unlocked int       `json:"unlocked"`
	Total    int       `json:"total"`
	Err      string    `json:"error,omitempty"`
}

func (s *achSet) tally() {
	s.Total = len(s.Items)
	s.Unlocked = 0
	for _, it := range s.Items {
		if it.Got {
			s.Unlocked++
		}
	}
	sort.SliceStable(s.Items, func(i, j int) bool {
		if s.Items[i].Got != s.Items[j].Got {
			return s.Items[i].Got
		}
		return s.Items[i].Time > s.Items[j].Time
	})
	s.OK = s.Total > 0
}

// ---- small helpers for loosely shaped JSON
func jm(v any) map[string]any { m, _ := v.(map[string]any); return m }
func ja(v any) []any          { a, _ := v.([]any); return a }
func js(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	}
	return ""
}
func jnum(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	}
	return 0
}
func jb(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		return t == "1" || strings.EqualFold(t, "true")
	}
	return false
}

// ---- Steam
func steamAch(key, steamID, appid string) achSet {
	out := achSet{Provider: "Steam"}
	if appid == "" || steamID == "" {
		out.Err = "Add your Steam ID in Settings first."
		return out
	}
	// the public profile page works without a key; the official API is used when there is one
	if key == "" {
		return steamAchXML(steamID, appid)
	}
	var schema map[string]any
	q := url.Values{"key": {key}, "appid": {appid}, "l": {"english"}}
	if err := getJSON(steamAPIURL+"/ISteamUserStats/GetSchemaForGame/v2/?"+q.Encode(), nil, &schema); err != nil {
		out.Err = "Steam couldn't be reached, or the key was refused."
		return out
	}
	list := ja(jm(jm(schema["game"])["availableGameStats"])["achievements"])
	if len(list) == 0 {
		out.Err = "This game has no Steam achievements."
		return out
	}
	got := map[string]int64{}
	var player map[string]any
	pq := url.Values{"key": {key}, "steamid": {steamID}, "appid": {appid}, "l": {"english"}}
	if err := getJSON(steamAPIURL+"/ISteamUserStats/GetPlayerAchievements/v0001/?"+pq.Encode(), nil, &player); err == nil {
		ps := jm(player["playerstats"])
		for _, a := range ja(ps["achievements"]) {
			m := jm(a)
			if jb(m["achieved"]) {
				got[js(m["apiname"])] = int64(jnum(m["unlocktime"]))
			}
		}
	} else {
		out.Err = "Steam wouldn't share your achievements. Set your Steam profile's game details to Public."
		return out
	}
	rare := map[string]float64{}
	var gl map[string]any
	if getJSON(steamAPIURL+"/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid="+url.QueryEscape(appid), nil, &gl) == nil {
		for _, a := range ja(jm(gl["achievementpercentages"])["achievements"]) {
			m := jm(a)
			rare[js(m["name"])] = jnum(m["percent"])
		}
	}
	for _, a := range list {
		m := jm(a)
		id := js(m["name"])
		t, ok := got[id]
		icon := js(m["icon"])
		if !ok {
			icon = js(m["icongray"])
			if icon == "" {
				icon = js(m["icon"])
			}
		}
		out.Items = append(out.Items, achItem{ID: id, Name: js(m["displayName"]), Desc: js(m["description"]), Icon: icon, Got: ok, Time: t, Rarity: rare[id], Hidden: jb(m["hidden"]), Points: rarityPoints(rare[id])})
	}
	out.tally()
	return out
}

type steamXML struct {
	Game struct {
		Name string `xml:"gameName"`
	} `xml:"game"`
	Err   string `xml:"error"`
	Items []struct {
		Closed string `xml:"closed,attr"`
		Icon   string `xml:"iconClosed"`
		Open   string `xml:"iconOpen"`
		Name   string `xml:"name"`
		API    string `xml:"apiname"`
		Desc   string `xml:"description"`
		Time   int64  `xml:"unlockTimestamp"`
	} `xml:"achievements>achievement"`
}

func steamAchXML(steamID, appid string) achSet {
	out := achSet{Provider: "Steam"}
	base := steamComURL + "/profiles/" + url.PathEscape(steamID)
	if _, err := strconv.ParseUint(steamID, 10, 64); err != nil {
		base = steamComURL + "/id/" + url.PathEscape(steamID)
	}
	req, _ := http.NewRequest("GET", base+"/stats/"+url.PathEscape(appid)+"/?xml=1", nil)
	req.Header.Set("User-Agent", "HollywoodArcade/2.1")
	resp, err := httpc.Do(req)
	if err != nil {
		out.Err = "Steam couldn't be reached."
		return out
	}
	defer resp.Body.Close()
	var x steamXML
	if resp.StatusCode != 200 || xml.NewDecoder(resp.Body).Decode(&x) != nil {
		out.Err = "Couldn't read your public Steam profile. Add a Steam Web API key in Settings for a more reliable result."
		return out
	}
	if len(x.Items) == 0 {
		if x.Err != "" {
			out.Err = x.Err
		} else {
			out.Err = "No achievements found. Make your Steam game details public, or add a Steam Web API key in Settings."
		}
		return out
	}
	out.Title = x.Game.Name
	for _, a := range x.Items {
		got := a.Closed == "1"
		icon := a.Open
		if got {
			icon = a.Icon
		}
		out.Items = append(out.Items, achItem{ID: a.API, Name: a.Name, Desc: a.Desc, Icon: icon, Got: got, Time: a.Time})
	}
	out.tally()
	return out
}

// ---- RetroAchievements
var (
	raMu    sync.Mutex
	raLists = map[string][]map[string]any{}
	raAt    = map[string]time.Time{}
)

func raGet(path string, q url.Values, v any) error {
	return getJSON(raURL+"/API/"+path+"?"+q.Encode(), nil, v)
}

func raAch(user, key, title, console string) achSet {
	out := achSet{Provider: "RetroAchievements"}
	if user == "" || key == "" {
		out.Err = "Add your RetroAchievements name and key in Settings first."
		return out
	}
	if console == "" {
		out.Err = "RetroAchievements doesn't cover this console."
		return out
	}
	lk := console + "|" + user
	raMu.Lock()
	list, ok := raLists[lk], time.Since(raAt[lk]) < 6*time.Hour
	raMu.Unlock()
	if !ok || len(list) == 0 {
		var l []map[string]any
		if err := raGet("API_GetGameList.php", url.Values{"z": {user}, "y": {key}, "i": {console}, "f": {"1"}, "h": {"1"}}, &l); err != nil {
			out.Err = "RetroAchievements couldn't be reached, or the key was refused."
			return out
		}
		list = l
		raMu.Lock()
		raLists[lk], raAt[lk] = l, time.Now()
		raMu.Unlock()
	}
	nm := metaName(title)
	if nm == "" {
		nm = title
	}
	best, bs := map[string]any(nil), 0.0
	for _, g := range list {
		if s := titleScore(reParen.ReplaceAllString(js(g["Title"]), ""), nm); s > bs {
			best, bs = g, s
		}
	}
	if best == nil || bs < 0.75 {
		out.Err = "No RetroAchievements set found for this title."
		return out
	}
	var gi map[string]any
	if err := raGet("API_GetGameInfoAndUserProgress.php", url.Values{"z": {user}, "y": {key}, "u": {user}, "g": {js(best["ID"])}, "a": {"1"}}, &gi); err != nil {
		out.Err = "RetroAchievements couldn't be reached."
		return out
	}
	out.Title = js(gi["Title"])
	players := jnum(gi["NumDistinctPlayers"])
	if players == 0 {
		players = jnum(gi["NumDistinctPlayersCasual"])
	}
	for _, a := range jm(gi["Achievements"]) {
		m := jm(a)
		earned := js(m["DateEarnedHardcore"])
		if earned == "" {
			earned = js(m["DateEarned"])
		}
		var t int64
		if earned != "" {
			if tt, err := time.Parse("2006-01-02 15:04:05", earned); err == nil {
				t = tt.Unix()
			}
		}
		r := 0.0
		if players > 0 {
			r = jnum(m["NumAwarded"]) / players * 100
		}
		badge := js(m["BadgeName"])
		icon := ""
		if badge != "" {
			icon = raMediaURL + "/Badge/" + badge + ".png"
			if earned == "" {
				icon = raMediaURL + "/Badge/" + badge + "_lock.png"
			}
		}
		out.Items = append(out.Items, achItem{ID: js(m["ID"]), Name: js(m["Title"]), Desc: js(m["Description"]), Icon: icon, Got: earned != "", Time: t, Rarity: r, Points: int(jnum(m["Points"]))})
	}
	out.tally()
	return out
}

// ---- Xbox (OpenXBL, a free third-party service that reads Xbox Live)
var (
	xblMu    sync.Mutex
	xblTitle []any
	xblAt    time.Time
)

func xblAch(key, title string) achSet {
	out := achSet{Provider: "Xbox"}
	if key == "" {
		out.Err = "Add your OpenXBL key in Settings first."
		return out
	}
	hdr := map[string]string{"X-Authorization": key, "Accept": "application/json"}
	xblMu.Lock()
	list, fresh := xblTitle, time.Since(xblAt) < 10*time.Minute
	xblMu.Unlock()
	if !fresh {
		var r map[string]any
		if err := getJSON(xblURL+"/api/v2/achievements", hdr, &r); err != nil {
			out.Err = "OpenXBL couldn't be reached, or the key was refused."
			return out
		}
		list = ja(r["titles"])
		xblMu.Lock()
		xblTitle, xblAt = list, time.Now()
		xblMu.Unlock()
	}
	nm := metaName(title)
	if nm == "" {
		nm = title
	}
	var id string
	bs := 0.0
	for _, t := range list {
		m := jm(t)
		if s := titleScore(js(m["name"]), nm); s > bs {
			bs, id = s, js(m["titleId"])
		}
	}
	if id == "" || bs < 0.75 {
		out.Err = "This game isn't in your Xbox achievements."
		return out
	}
	var r map[string]any
	if err := getJSON(xblURL+"/api/v2/achievements/title/"+url.PathEscape(id), hdr, &r); err != nil {
		out.Err = "OpenXBL couldn't be reached."
		return out
	}
	out.Title = title
	for _, a := range ja(r["achievements"]) {
		m := jm(a)
		pts := 0
		for _, rw := range ja(m["rewards"]) {
			if x := jm(rw); strings.EqualFold(js(x["type"]), "Gamerscore") {
				pts = int(jnum(x["value"]))
			}
		}
		var t int64
		if tt, err := time.Parse(time.RFC3339, js(jm(m["progression"])["timeUnlocked"])); err == nil && tt.Year() > 1970 {
			t = tt.Unix()
		}
		icon := ""
		if ma := ja(m["mediaAssets"]); len(ma) > 0 {
			icon = js(jm(ma[0])["url"])
		}
		out.Items = append(out.Items, achItem{ID: js(m["id"]), Name: js(m["name"]), Desc: js(m["description"]), Icon: icon, Got: strings.EqualFold(js(m["progressState"]), "Achieved"), Time: t, Rarity: jnum(jm(m["rarity"])["currentPercentage"]), Hidden: jb(m["isSecret"]), Points: pts})
	}
	out.tally()
	return out
}

// rarity -> points for providers that have none (rarer is worth more)
func rarityPoints(r float64) int {
	switch {
	case r <= 0:
		return 10
	case r < 2:
		return 50
	case r < 10:
		return 30
	case r < 30:
		return 15
	}
	return 10
}

func registerAch(mux *http.ServeMux) {
	mux.HandleFunc("/api/ach", func(w http.ResponseWriter, r *http.Request) {
		var o map[string]string
		readJSON(r, &o)
		var res achSet
		switch o["provider"] {
		case "steam":
			res = steamAch(o["key"], o["steamId"], o["appid"])
		case "ra":
			res = raAch(o["user"], o["key"], o["title"], o["console"])
		case "xbox":
			res = xblAch(o["key"], o["title"])
		default:
			res = achSet{Err: "Unknown provider"}
		}
		if res.Title == "" {
			res.Title = o["title"]
		}
		writeJSON(w, res)
	})
}

var _ = fmt.Sprintf
