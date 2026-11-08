package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf16"
)

type tagInfo struct {
	Title, Artist, Album string
	HasArt               bool
}

func clean(s string) string { return strings.TrimSpace(strings.Trim(s, "\x00")) }

func decodeText(enc byte, b []byte) string {
	switch enc {
	case 1, 2:
		if len(b) >= 2 {
			bo := binary.ByteOrder(binary.LittleEndian)
			if enc == 2 {
				bo = binary.BigEndian
			}
			if b[0] == 0xFF && b[1] == 0xFE {
				b = b[2:]
			} else if b[0] == 0xFE && b[1] == 0xFF {
				bo = binary.BigEndian
				b = b[2:]
			}
			u := make([]uint16, 0, len(b)/2)
			for i := 0; i+1 < len(b); i += 2 {
				u = append(u, bo.Uint16(b[i:]))
			}
			return clean(string(utf16.Decode(u)))
		}
		return ""
	case 0:
		r := make([]rune, len(b))
		for i, c := range b {
			r[i] = rune(c)
		}
		return clean(string(r))
	}
	return clean(string(b))
}

func syncsafe(b []byte) int {
	return int(b[0]&0x7f)<<21 | int(b[1]&0x7f)<<14 | int(b[2]&0x7f)<<7 | int(b[3]&0x7f)
}

// readID3 returns the tags and (optionally) the embedded picture bytes.
func readID3(f *os.File, wantArt bool) (tagInfo, []byte) {
	var t tagInfo
	h := make([]byte, 10)
	if _, err := io.ReadFull(f, h); err != nil || string(h[:3]) != "ID3" {
		return t, nil
	}
	ver := h[3]
	size := syncsafe(h[6:10])
	if size <= 0 || size > 16<<20 {
		return t, nil
	}
	body := make([]byte, size)
	n, _ := io.ReadFull(f, body)
	body = body[:n]
	var pic []byte
	idLen, hdr := 4, 10
	if ver == 2 {
		idLen, hdr = 3, 6
	}
	for p := 0; p+hdr <= len(body); {
		id := string(body[p : p+idLen])
		if id[0] == 0 {
			break
		}
		var fs int
		switch {
		case ver == 2:
			fs = int(body[p+3])<<16 | int(body[p+4])<<8 | int(body[p+5])
		case ver == 4:
			fs = syncsafe(body[p+4 : p+8])
		default:
			fs = int(binary.BigEndian.Uint32(body[p+4 : p+8]))
		}
		start := p + hdr
		if fs <= 0 || start+fs > len(body) {
			break
		}
		d := body[start : start+fs]
		switch id {
		case "TIT2", "TT2":
			t.Title = decodeText(d[0], d[1:])
		case "TPE1", "TP1":
			t.Artist = decodeText(d[0], d[1:])
		case "TALB", "TAL":
			t.Album = decodeText(d[0], d[1:])
		case "APIC", "PIC":
			t.HasArt = true
			if wantArt && len(d) > 4 {
				enc := d[0]
				i := 1
				if id == "PIC" {
					i = 5
				} else {
					for i < len(d) && d[i] != 0 {
						i++
					}
					i += 2 // terminator + picture type
				}
				if i < len(d) {
					if enc == 1 || enc == 2 { // utf16 description ends with a double zero
						for i+1 < len(d) && !(d[i] == 0 && d[i+1] == 0) {
							i += 2
						}
						i += 2
					} else {
						for i < len(d) && d[i] != 0 {
							i++
						}
						i++
					}
					if i < len(d) {
						pic = d[i:]
					}
				}
			}
		}
		p = start + fs
	}
	return t, pic
}

func readU32(b []byte) int { return int(binary.BigEndian.Uint32(b)) }

// walk the children of an MP4 atom region
func mp4Find(b []byte, path ...string) []byte {
	for len(path) > 0 {
		var next []byte
		for p := 0; p+8 <= len(b); {
			sz := readU32(b[p:])
			name := string(b[p+4 : p+8])
			if sz < 8 || p+sz > len(b) {
				break
			}
			if name == path[0] {
				next = b[p+8 : p+sz]
				if name == "meta" && len(next) >= 4 {
					next = next[4:]
				}
				break
			}
			p += sz
		}
		if next == nil {
			return nil
		}
		b = next
		path = path[1:]
	}
	return b
}

func readMP4(f *os.File, wantArt bool) (tagInfo, []byte) {
	var t tagInfo
	st, err := f.Stat()
	if err != nil {
		return t, nil
	}
	var moov []byte
	var off int64
	for off+8 <= st.Size() {
		h := make([]byte, 8)
		if _, err := f.ReadAt(h, off); err != nil {
			break
		}
		sz := int64(readU32(h))
		if sz == 1 {
			ext := make([]byte, 8)
			f.ReadAt(ext, off+8)
			sz = int64(binary.BigEndian.Uint64(ext))
		} else if sz == 0 {
			sz = st.Size() - off
		}
		if sz < 8 {
			break
		}
		if string(h[4:8]) == "moov" {
			if sz > 24<<20 {
				return t, nil
			}
			moov = make([]byte, sz-8)
			f.ReadAt(moov, off+8)
			break
		}
		off += sz
	}
	ilst := mp4Find(moov, "udta", "meta", "ilst")
	if ilst == nil {
		return t, nil
	}
	var pic []byte
	for p := 0; p+8 <= len(ilst); {
		sz := readU32(ilst[p:])
		if sz < 8 || p+sz > len(ilst) {
			break
		}
		name := ilst[p+4 : p+8]
		item := ilst[p+8 : p+sz]
		if dat := mp4Find(item, "data"); len(dat) > 8 {
			val := dat[8:]
			switch string(name) {
			case "\xa9nam":
				t.Title = clean(string(val))
			case "\xa9ART":
				t.Artist = clean(string(val))
			case "aART":
				if t.Artist == "" {
					t.Artist = clean(string(val))
				}
			case "\xa9alb":
				t.Album = clean(string(val))
			case "covr":
				t.HasArt = true
				if wantArt {
					pic = val
				}
			}
		}
		p += sz
	}
	return t, pic
}

func readFLAC(f *os.File, wantArt bool) (tagInfo, []byte) {
	var t tagInfo
	h := make([]byte, 4)
	if _, err := io.ReadFull(f, h); err != nil || string(h) != "fLaC" {
		return t, nil
	}
	var pic []byte
	for {
		bh := make([]byte, 4)
		if _, err := io.ReadFull(f, bh); err != nil {
			break
		}
		last := bh[0]&0x80 != 0
		typ := bh[0] & 0x7f
		sz := int(bh[1])<<16 | int(bh[2])<<8 | int(bh[3])
		if sz > 16<<20 {
			break
		}
		data := make([]byte, sz)
		if _, err := io.ReadFull(f, data); err != nil {
			break
		}
		switch typ {
		case 4:
			if len(data) < 4 {
				break
			}
			p := 4 + int(binary.LittleEndian.Uint32(data))
			if p+4 > len(data) {
				break
			}
			cnt := int(binary.LittleEndian.Uint32(data[p:]))
			p += 4
			for i := 0; i < cnt && p+4 <= len(data); i++ {
				l := int(binary.LittleEndian.Uint32(data[p:]))
				p += 4
				if p+l > len(data) {
					break
				}
				kv := string(data[p : p+l])
				p += l
				if eq := strings.IndexByte(kv, '='); eq > 0 {
					switch strings.ToUpper(kv[:eq]) {
					case "TITLE":
						t.Title = clean(kv[eq+1:])
					case "ARTIST":
						t.Artist = clean(kv[eq+1:])
					case "ALBUM":
						t.Album = clean(kv[eq+1:])
					}
				}
			}
		case 6:
			t.HasArt = true
			if wantArt && len(data) > 32 {
				p := 4
				ml := readU32(data[p:])
				p += 4 + ml
				dl := readU32(data[p:])
				p += 4 + dl + 16
				if p+4 <= len(data) {
					pl := readU32(data[p:])
					p += 4
					if p+pl <= len(data) {
						pic = data[p : p+pl]
					}
				}
			}
		}
		if last {
			break
		}
	}
	return t, pic
}

func readTags(path string, wantArt bool) (tagInfo, []byte) {
	defer func() { recover() }()
	f, err := os.Open(path)
	if err != nil {
		return tagInfo{}, nil
	}
	defer f.Close()
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp3":
		return readID3(f, wantArt)
	case ".m4a", ".m4b", ".mp4", ".aac":
		return readMP4(f, wantArt)
	case ".flac":
		return readFLAC(f, wantArt)
	}
	return tagInfo{}, nil
}

func sniffImage(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG")):
		return "image/png"
	case bytes.HasPrefix(b, []byte("\xff\xd8")):
		return "image/jpeg"
	}
	return ""
}
