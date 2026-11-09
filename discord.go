package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ---- settings Arcade's Go side needs (the page stores everything in library.json) ----

var (
	setMu    sync.Mutex
	setCache map[string]any
	setAt    time.Time
)

// readSetting returns one string setting from library.json (cached for a few seconds).
func readSetting(key string) string {
	setMu.Lock()
	defer setMu.Unlock()
	if setCache == nil || time.Since(setAt) > 3*time.Second {
		setCache = map[string]any{}
		if b, err := os.ReadFile(filepath.Join(cfgDir, "library.json")); err == nil {
			var d struct {
				Settings map[string]any `json:"settings"`
			}
			if json.Unmarshal(b, &d) == nil && d.Settings != nil {
				setCache = d.Settings
			}
		}
		setAt = time.Now()
	}
	switch v := setCache[key].(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return fmt.Sprint(v)
	case bool:
		if v {
			return "on"
		}
		return "off"
	}
	return ""
}

// ---- what is being played, as far as the Discord status goes ----

var nowPlaying struct {
	sync.Mutex
	name, source string
	since        time.Time
}

func setNowPlaying(it Item) {
	if it.Kind != "exe" && it.Kind != "rom" {
		return
	}
	nowPlaying.Lock()
	nowPlaying.name, nowPlaying.source, nowPlaying.since = it.Name, it.Source, time.Now()
	nowPlaying.Unlock()
}

// currentPlay says what to show: the game Arcade launched, while its window is still there.
func currentPlay() (name, source string, since time.Time, ok bool) {
	nowPlaying.Lock()
	name, source, since = nowPlaying.name, nowPlaying.source, nowPlaying.since
	nowPlaying.Unlock()
	if name == "" {
		return
	}
	if os.Getenv("HA_FAKEPLAY") != "" {
		return name, source, since, true
	}
	if _, running := gameState(); !running {
		// some games open their window late, or hand over to another process; give a launch 90 seconds
		return name, source, since, time.Since(since) < 90*time.Second
	}
	return name, source, since, true
}

// ---- Discord's local connection ----

const (
	opHandshake = 0
	opFrame     = 1
)

func discordDial() (io.ReadWriteCloser, error) {
	var last error
	for i := 0; i < 10; i++ {
		if runtime.GOOS == "windows" {
			f, err := os.OpenFile(fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i), os.O_RDWR, 0)
			if err == nil {
				return f, nil
			}
			last = err
			continue
		}
		for _, dir := range []string{os.Getenv("XDG_RUNTIME_DIR"), os.Getenv("TMPDIR"), "/tmp"} {
			if dir == "" {
				continue
			}
			c, err := net.DialTimeout("unix", filepath.Join(dir, fmt.Sprintf("discord-ipc-%d", i)), time.Second)
			if err == nil {
				return c, nil
			}
			last = err
		}
	}
	return nil, last
}

func dcWrite(w io.Writer, op uint32, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, op)
	binary.Write(&buf, binary.LittleEndian, uint32(len(b)))
	buf.Write(b)
	_, err = w.Write(buf.Bytes())
	return err
}

// dcReadT reads one reply, giving up after a few seconds so a stuck Discord can never hang Arcade.
func dcReadT(c io.ReadWriteCloser) (uint32, []byte, error) {
	type res struct {
		op uint32
		b  []byte
		e  error
	}
	ch := make(chan res, 1)
	go func() { op, b, e := dcRead(c); ch <- res{op, b, e} }()
	select {
	case r := <-ch:
		return r.op, r.b, r.e
	case <-time.After(5 * time.Second):
		c.Close()
		return 0, nil, fmt.Errorf("Discord did not answer")
	}
}

func dcRead(r io.Reader) (uint32, []byte, error) {
	var h [8]byte
	if _, err := io.ReadFull(r, h[:]); err != nil {
		return 0, nil, err
	}
	op, n := binary.LittleEndian.Uint32(h[:4]), binary.LittleEndian.Uint32(h[4:])
	if n > 1<<20 {
		return op, nil, fmt.Errorf("unexpected reply size")
	}
	b := make([]byte, n)
	_, err := io.ReadFull(r, b)
	return op, b, err
}

// presenceLoop keeps the Discord status in step with the game being played. It does nothing until the
// person has typed an Application ID in Settings, and stops talking to Discord as soon as that is removed.
func presenceLoop() {
	var conn io.ReadWriteCloser
	var connID string
	var shown string // what we last sent, so we only talk when it changes
	hadErr := false
	every := 15 * time.Second
	if os.Getenv("HA_FAKEPLAY") != "" {
		every = time.Second // tests
	}
	drop := func() {
		if conn != nil {
			conn.Close()
		}
		conn, connID, shown = nil, "", ""
	}
	for {
		time.Sleep(every)
		id := strings.TrimSpace(readSetting("discordAppId"))
		if id == "" || readSetting("discordPresence") == "off" {
			drop()
			continue
		}
		if conn != nil && connID != id {
			drop()
		}
		if conn == nil {
			c, err := discordDial()
			if err != nil {
				if !hadErr {
					arcLog("Discord status: Discord is not running or not reachable (" + err.Error() + ")")
					hadErr = true
				}
				continue
			}
			conn, connID = c, id
			err = dcWrite(c, opHandshake, map[string]any{"v": 1, "client_id": id})
			if err == nil {
				_, _, err = dcReadT(c)
			}
			if err != nil {
				arcLog("Discord status: Discord did not accept the connection: " + err.Error())
				drop()
				continue
			}
			hadErr = false
			arcLog("Discord status: connected")
		}
		name, src, since, ok := currentPlay()
		want := ""
		var act any
		if ok {
			state := "on " + src
			if src == "" {
				state = "via Hollywood Arcade"
			}
			a := map[string]any{"details": name, "state": state, "timestamps": map[string]any{"start": since.Unix()}}
			if readSetting("discordHeadline") != "app" {
				a["status_display_type"] = 2 // show the game title as the headline
			}
			act, want = a, name+"|"+src
		}
		if want == shown {
			continue
		}
		nonce := fmt.Sprintf("%d", time.Now().UnixNano())
		args := map[string]any{"pid": os.Getpid()}
		if act != nil {
			args["activity"] = act
		}
		if err := dcWrite(conn, opFrame, map[string]any{"cmd": "SET_ACTIVITY", "args": args, "nonce": nonce}); err != nil {
			arcLog("Discord status: lost the connection: " + err.Error())
			drop()
			continue
		}
		if _, b, err := dcReadT(conn); err != nil {
			drop()
			continue
		} else if bytes.Contains(b, []byte(`"evt":"ERROR"`)) {
			arcLog("Discord status: Discord refused the status: " + string(b))
		}
		shown = want
		if ok {
			arcLog("Discord status: showing " + name)
		} else {
			arcLog("Discord status: cleared")
		}
	}
}
