package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

var (
	reTrackNo  = regexp.MustCompile(`^\s*(\d{1,3})\s*[-._)]\s*`)
	reArtTitle = regexp.MustCompile(`^(.{2,60}?)\s+[-\x{2013}]\s+(.+)$`)
)

// fillFromPath guesses missing tags from the file name and folder layout (Artist/Album/01 - Title.mp3).
func fillFromPath(t *tagInfo, p string) {
	base := strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
	base = strings.ReplaceAll(base, "_", " ")
	album := filepath.Base(filepath.Dir(p))
	artist := filepath.Base(filepath.Dir(filepath.Dir(p)))
	if t.Title == "" {
		name := reTrackNo.ReplaceAllString(base, "")
		if m := reArtTitle.FindStringSubmatch(name); m != nil && t.Artist == "" {
			t.Artist, name = strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
			if reTrackNo.MatchString(m[1]) {
				t.Artist = ""
			}
		}
		if name == "" {
			name = base
		}
		t.Title = name
	}
	if t.Album == "" && album != "" && album != "." && !strings.HasSuffix(album, ":\\") && album != string(filepath.Separator) {
		t.Album = album
	}
	if t.Artist == "" {
		if artist != "" && artist != "." && artist != string(filepath.Separator) && !strings.HasSuffix(artist, ":\\") {
			t.Artist = artist
		} else {
			t.Artist = album
		}
	}
}

var folderArtNames = []string{"cover", "folder", "front", "album", "albumart", "albumartsmall", "artwork"}

// folderArt finds cover.jpg / folder.jpg style pictures next to the songs.
var faCache sync.Map

func folderArt(dir string) string {
	if v, ok := faCache.Load(dir); ok {
		return v.(string)
	}
	r := folderArtScan(dir)
	faCache.Store(dir, r)
	return r
}

func folderArtScan(dir string) string {
	for _, n := range folderArtNames {
		for _, e := range []string{".jpg", ".jpeg", ".png"} {
			for _, v := range []string{n + e, strings.ToUpper(n[:1]) + n[1:] + e} {
				if st, err := os.Stat(filepath.Join(dir, v)); err == nil && !st.IsDir() {
					return filepath.Join(dir, v)
				}
			}
		}
	}
	return ""
}
