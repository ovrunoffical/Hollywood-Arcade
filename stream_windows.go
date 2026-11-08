//go:build windows

package main

import (
	"sync/atomic"
	"time"
	"unsafe"
)

var streamH atomic.Uintptr

// setStreamTarget waits for the new streaming window to appear and remembers it, so the controller
// only turns into a keyboard while that window is the one in front.
func setStreamTarget(before map[uintptr]bool) {
	go func() {
		defer func() { recover() }()
		for i := 0; i < 40; i++ {
			time.Sleep(250 * time.Millisecond)
			for _, w := range topWindows() {
				pb := procBase(w.pid)
				if !before[w.h] && w.title != "" && (pb == "msedge.exe" || pb == "chrome.exe") {
					streamH.Store(w.h)
					foreground(w.h)
					return
				}
			}
		}
	}()
}

func keyTap(vk byte, ext bool) {
	var f uintptr
	if ext {
		f = 1
	}
	pKeybd.Call(uintptr(vk), 0, f, 0)
	pKeybd.Call(uintptr(vk), 0, f|2, 0)
}

func streamInFront() bool {
	h := streamH.Load()
	if h == 0 {
		return false
	}
	if r, _, _ := pIsWin.Call(h); r == 0 {
		streamH.Store(0)
		return false
	}
	fg, _, _ := pFgWin.Call()
	return fg == h
}

type padKey struct {
	vk    byte
	ext   bool
	rep   bool
	until time.Time
	down  bool
}

// startPadKeys turns the controller into arrow keys, Enter, Esc and friends while a streaming window is in front.
func startPadKeys() {
	go func() {
		defer func() { recover() }()
		sony := map[int]bool{}
		for id := 0; id < 16; id++ {
			var c joyCaps
			if r, _, _ := pJoyCaps.Call(uintptr(id), uintptr(unsafe.Pointer(&c)), unsafe.Sizeof(c)); r == 0 {
				if c.Mid == 0x054c {
					sony[id] = true
				}
			}
		}
		keys := map[string]*padKey{}
		def := map[string]padKey{
			"up": {vk: 0x26, ext: true, rep: true}, "down": {vk: 0x28, ext: true, rep: true},
			"left": {vk: 0x25, ext: true, rep: true}, "right": {vk: 0x27, ext: true, rep: true},
			"a": {vk: 0x0D}, "b": {vk: 0x1B}, "x": {vk: 0x20}, "y": {vk: 0x46},
			"l1": {vk: 0x4A}, "r1": {vk: 0x4C}, "back": {vk: 0xA6},
		}
		for k, v := range def {
			c := v
			keys[k] = &c
		}
		for {
			time.Sleep(40 * time.Millisecond)
			if !streamInFront() {
				for _, k := range keys {
					k.down = false
				}
				continue
			}
			on := map[string]bool{}
			for i := 0; i < 4; i++ {
				var st xstate
				if xinputState(i, &st) {
					b := st.Buttons
					on["up"] = on["up"] || b&1 != 0 || st.LY > 16000
					on["down"] = on["down"] || b&2 != 0 || st.LY < -16000
					on["left"] = on["left"] || b&4 != 0 || st.LX < -16000
					on["right"] = on["right"] || b&8 != 0 || st.LX > 16000
					on["a"] = on["a"] || b&0x1000 != 0
					on["b"] = on["b"] || b&0x2000 != 0
					on["x"] = on["x"] || b&0x4000 != 0 || b&0x10 != 0
					on["y"] = on["y"] || b&0x8000 != 0
					on["l1"] = on["l1"] || b&0x100 != 0
					on["r1"] = on["r1"] || b&0x200 != 0
					on["back"] = on["back"] || b&0x20 != 0
				}
			}
			for id := range sony {
				ji := joyInfoEx{Flags: 0xFF}
				ji.Size = uint32(unsafe.Sizeof(ji))
				if r, _, _ := pJoyPos.Call(uintptr(id), uintptr(unsafe.Pointer(&ji))); r == 0 {
					b := ji.Buttons
					p := ji.POV
					on["up"] = on["up"] || p == 0 || p == 4500 || p == 31500 || ji.Y < 16000
					on["right"] = on["right"] || (p >= 4500 && p <= 13500) || ji.X > 48000
					on["down"] = on["down"] || (p >= 13500 && p <= 22500) || (ji.Y > 48000 && ji.Y != 65535)
					on["left"] = on["left"] || (p >= 22500 && p <= 31500) || ji.X < 16000
					on["a"] = on["a"] || b&(1<<1) != 0
					on["b"] = on["b"] || b&(1<<2) != 0
					on["x"] = on["x"] || b&(1<<0) != 0 || b&(1<<9) != 0
					on["y"] = on["y"] || b&(1<<3) != 0
					on["l1"] = on["l1"] || b&(1<<4) != 0
					on["r1"] = on["r1"] || b&(1<<5) != 0
					on["back"] = on["back"] || b&(1<<8) != 0
				}
			}
			now := time.Now()
			for name, k := range keys {
				if !on[name] {
					k.down = false
					continue
				}
				if !k.down {
					k.down = true
					keyTap(k.vk, k.ext)
					k.until = now.Add(420 * time.Millisecond)
				} else if k.rep && now.After(k.until) {
					keyTap(k.vk, k.ext)
					k.until = now.Add(110 * time.Millisecond)
				}
			}
		}
	}()
}
