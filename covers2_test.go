package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLbParse(t *testing.T) {
	x := `<LaunchBox>
<Game><Name>The Simpsons: Hit &amp; Run</Name><DatabaseID>11</DatabaseID><Platform>Nintendo GameCube</Platform></Game>
<Game><Name>Madden NFL 27</Name><DatabaseID>12</DatabaseID><Platform>Windows</Platform></Game>
<GameImage><DatabaseID>11</DatabaseID><FileName>a-eu.jpg</FileName><Type>Box - Front</Type><Region>Europe</Region></GameImage>
<GameImage><DatabaseID>11</DatabaseID><FileName>a-us.jpg</FileName><Type>Box - Front</Type><Region>North America</Region></GameImage>
<GameImage><DatabaseID>11</DatabaseID><FileName>back.jpg</FileName><Type>Box - Back</Type></GameImage>
<GameImage><DatabaseID>12</DatabaseID><FileName>m.jpg</FileName><Type>Box - Front</Type></GameImage>
</LaunchBox>`
	idx := lbParse(strings.NewReader(x))
	if r := idx[lbNorm("Simpsons Hit & Run")]; len(r) != 1 || r[0].File != "a-us.jpg" {
		t.Fatalf("simpsons: %+v", r)
	}
	if r := idx[lbNorm("Madden NFL 27")]; len(r) != 1 || r[0].Plat != "Windows" {
		t.Fatalf("madden: %+v", r)
	}
	p := t.TempDir() + "/x.idx"
	lbSave(p, idx)
	back := lbLoad(p)
	if len(back) != len(idx) {
		t.Fatalf("roundtrip %d != %d", len(back), len(idx))
	}
}

func TestTgdbFronts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("apikey") != "k" {
			http.Error(w, "no", 403)
			return
		}
		w.Write([]byte(`{"data":{"games":[{"id":7,"game_name":"Hades"}]},"include":{"boxart":{"base_url":{"original":"https://cdn.thegamesdb.net/images/original/"},"data":{"7":[{"type":"boxart","side":"back","filename":"b.jpg"},{"type":"boxart","side":"front","filename":"boxart/front/7-1.jpg"}]}}}}`))
	}))
	defer srv.Close()
	old := tgdbURL
	tgdbURL = srv.URL
	defer func() { tgdbURL = old }()
	got := tgdbFronts("Hades", "k")
	if len(got) != 1 || got[0] != "https://cdn.thegamesdb.net/images/original/boxart/front/7-1.jpg" {
		t.Fatalf("got %v", got)
	}
	if tgdbFronts("Hades", "") != nil || tgdbFronts("Hades", "bad") != nil {
		t.Fatal("expected nothing without a good key")
	}
}
