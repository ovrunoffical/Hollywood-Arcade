//go:build windows

package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

var (
	user32    = syscall.NewLazyDLL("user32.dll")
	pKeybd    = user32.NewProc("keybd_event")
	pRegHot   = user32.NewProc("RegisterHotKey")
	pGetMsg   = user32.NewProc("GetMessageW")
	pEnum     = user32.NewProc("EnumWindows")
	pGetText  = user32.NewProc("GetWindowTextW")
	pVisible  = user32.NewProc("IsWindowVisible")
	pSetPos   = user32.NewProc("SetWindowPos")
	pForegrnd = user32.NewProc("SetForegroundWindow")
	pShowWin  = user32.NewProc("ShowWindow")

	enumMu    sync.Mutex
	enumWant  string
	enumFound uintptr
	enumHid   bool
	enumCb    = syscall.NewCallback(func(h, _ uintptr) uintptr {
		if v, _, _ := pVisible.Call(h); v == 0 && !enumHid {
			return 1
		}
		buf := make([]uint16, 256)
		n, _, _ := pGetText.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
		if n > 0 && strings.HasPrefix(string(utf16.Decode(buf[:n])), enumWant) {
			enumFound = h
			return 0
		}
		return 1
	})
)

// pressKey sends a media / volume key to Windows (acts on whatever app owns the media session).
func pressKey(vk byte) {
	pKeybd.Call(uintptr(vk), 0, 1, 0)   // key down (extended)
	pKeybd.Call(uintptr(vk), 0, 1|2, 0) // key up
}

type winMsg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	ptX     int32
	ptY     int32
}

// startHotkey registers a system-wide shortcut for the in-game panel. It tries Ctrl+Alt+H first and
// falls back to other combinations if another program already owns it.
func startHotkey(onPress func()) {
	go func() {
		defer func() { recover() }()
		runtime.LockOSThread()
		const modAlt, modCtrl, modShift, modNoRepeat = 0x1, 0x2, 0x4, 0x4000
		for _, c := range []struct {
			mod  uintptr
			key  uintptr
			name string
		}{{modAlt | modCtrl, 'H', "Ctrl+Alt+H"}, {modAlt | modCtrl, 'M', "Ctrl+Alt+M"}, {modCtrl | modShift, 0x78, "Ctrl+Shift+F9"}} {
			if ok, _, _ := pRegHot.Call(0, 1, c.mod|modNoRepeat, c.key); ok != 0 {
				hotkeyLabel.Store(c.name)
				break
			}
		}
		if l, _ := hotkeyLabel.Load().(string); l == "" {
			hotkeyLabel.Store("none")
			return
		}
		var m winMsg
		for {
			r, _, _ := pGetMsg.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if int32(r) <= 0 {
				return
			}
			if m.message == 0x0312 { // WM_HOTKEY
				onPress()
			}
		}
	}()
}

func findWindow(title string, includeHidden bool) uintptr {
	defer func() { recover() }()
	enumMu.Lock()
	defer enumMu.Unlock()
	enumWant, enumFound, enumHid = title, 0, includeHidden
	pEnum.Call(enumCb, 0)
	return enumFound
}

func windowVisible(h uintptr) bool { v, _, _ := pVisible.Call(h); return v != 0 }
func hideWindow(h uintptr)         { pShowWin.Call(h, 0) }

// showOnTop shows the window above everything (including borderless games) and gives it focus.
func showOnTop(h uintptr) {
	defer func() { recover() }()
	pShowWin.Call(h, 5)
	centerWindow(h)
	const swpNoSize, swpNoMove, swpShow = 0x1, 0x2, 0x40
	pSetPos.Call(h, ^uintptr(0), 0, 0, 0, 0, swpNoSize|swpNoMove|swpShow) // HWND_TOPMOST
	pKeybd.Call(0x12, 0, 0, 0)                                            // a tap of Alt lets us take focus from a game
	pKeybd.Call(0x12, 0, 2, 0)
	pForegrnd.Call(h)
}

var (
	pGetRect = user32.NewProc("GetWindowRect")
	pMetrics = user32.NewProc("GetSystemMetrics")
)

// centerWindow puts a window in the middle of the primary screen (the Guide).
func centerWindow(h uintptr) {
	var rc [4]int32
	if r, _, _ := pGetRect.Call(h, uintptr(unsafe.Pointer(&rc))); r == 0 {
		return
	}
	sw, _, _ := pMetrics.Call(0)
	sh, _, _ := pMetrics.Call(1)
	w, ht := int(rc[2]-rc[0]), int(rc[3]-rc[1])
	if sw == 0 || sh == 0 || w <= 0 || ht <= 0 {
		return
	}
	x, y := (int(sw)-w)/2, (int(sh)-ht)/2
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	const swpNoSize, swpShow = 0x1, 0x40
	pSetPos.Call(h, ^uintptr(0), uintptr(x), uintptr(y), 0, 0, swpNoSize|swpShow)
}

// bringToFront makes the window with this title stay on top of games and takes focus.
func bringToFront(title string) {
	defer func() { recover() }()
	enumMu.Lock()
	defer enumMu.Unlock()
	for i := 0; i < 60; i++ {
		enumWant, enumFound = title, 0
		pEnum.Call(enumCb, 0)
		if enumFound != 0 {
			const swpNoSize, swpNoMove, swpShow = 0x1, 0x2, 0x40
			pSetPos.Call(enumFound, ^uintptr(0), 0, 0, 0, 0, swpNoSize|swpNoMove|swpShow) // HWND_TOPMOST
			pForegrnd.Call(enumFound)
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

var (
	pCreateMutex = syscall.NewLazyDLL("kernel32.dll").NewProc("CreateMutexW")
	mutexHandle  uintptr
)

// singleInstance is false when another Hollywood Arcade is already running for this Windows session.
func singleInstance() bool {
	name, _ := syscall.UTF16PtrFromString(`Local\HollywoodArcadeSingleton`)
	h, _, err := pCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return true
	}
	mutexHandle = h
	return err != syscall.Errno(183) // ERROR_ALREADY_EXISTS
}

// ---------- bring a launched program in front of Arcade ----------

var (
	pGetWindow  = user32.NewProc("GetWindow")
	pGetExStyle = user32.NewProc("GetWindowLongW")
	pGetPid     = user32.NewProc("GetWindowThreadProcessId")
	pIsIconic   = user32.NewProc("IsIconic")
	pToTop      = user32.NewProc("BringWindowToTop")
	kernel32    = syscall.NewLazyDLL("kernel32.dll")
	pOpenProc   = kernel32.NewProc("OpenProcess")
	pCloseH     = kernel32.NewProc("CloseHandle")
	pImageName  = kernel32.NewProc("QueryFullProcessImageNameW")

	listMu  sync.Mutex
	listOut []winInfo
	listCb  = syscall.NewCallback(func(h, _ uintptr) uintptr {
		if v, _, _ := pVisible.Call(h); v == 0 {
			return 1
		}
		if o, _, _ := pGetWindow.Call(h, 4); o != 0 { // GW_OWNER: skip dialogs owned by another window
			return 1
		}
		if ex, _, _ := pGetExStyle.Call(h, ^uintptr(19)); ex&0x80 != 0 { // GWL_EXSTYLE, WS_EX_TOOLWINDOW
			return 1
		}
		buf := make([]uint16, 256)
		n, _, _ := pGetText.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
		if n == 0 {
			return 1
		}
		var pid uint32
		pGetPid.Call(h, uintptr(unsafe.Pointer(&pid)))
		listOut = append(listOut, winInfo{h, string(utf16.Decode(buf[:n])), pid})
		return 1
	})
)

type winInfo struct {
	h     uintptr
	title string
	pid   uint32
}

func topWindows() []winInfo {
	defer func() { recover() }()
	listMu.Lock()
	defer listMu.Unlock()
	listOut = nil
	pEnum.Call(listCb, 0)
	return append([]winInfo(nil), listOut...)
}

func windowSnapshot() map[uintptr]bool {
	m := map[uintptr]bool{}
	for _, w := range topWindows() {
		m[w.h] = true
	}
	return m
}

func procBase(pid uint32) string {
	h, _, _ := pOpenProc.Call(0x1000, 0, uintptr(pid)) // PROCESS_QUERY_LIMITED_INFORMATION
	if h == 0 {
		return ""
	}
	defer pCloseH.Call(h)
	buf := make([]uint16, 520)
	n := uint32(len(buf))
	if r, _, _ := pImageName.Call(h, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n))); r == 0 {
		return ""
	}
	p := string(utf16.Decode(buf[:n]))
	if i := strings.LastIndexAny(p, `\/`); i >= 0 {
		p = p[i+1:]
	}
	return strings.ToLower(p)
}

func foreground(h uintptr) {
	defer func() { recover() }()
	if r, _, _ := pIsIconic.Call(h); r != 0 {
		pShowWin.Call(h, 9) // SW_RESTORE
	}
	pKeybd.Call(0x12, 0, 0, 0) // a tap of Alt lets us take focus from the full-screen Arcade window
	pKeybd.Call(0x12, 0, 2, 0)
	pToTop.Call(h)
	pForegrnd.Call(h)
}

// raiseLaunched finds the window a program just opened (or one it already had open) and puts it in front.
func raiseLaunched(before map[uintptr]bool, name, target string) {
	defer func() { recover() }()
	exe := strings.ToLower(filepath.Base(target))
	if !strings.HasSuffix(exe, ".exe") {
		exe = ""
	}
	nameL := strings.ToLower(strings.TrimSpace(name))
	deadline := time.Now().Add(14 * time.Second)
	raised := uintptr(0)
	for time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		ws := topWindows()
		var pick uintptr
		for _, w := range ws {
			if strings.HasPrefix(w.title, "Hollywood Arcade") || w.title == "Program Manager" {
				continue
			}
			if !before[w.h] {
				pick = w.h
				break
			}
		}
		if pick == 0 && time.Until(deadline) < 10*time.Second { // nothing new: the program was probably already running
			for _, w := range ws {
				if strings.HasPrefix(w.title, "Hollywood Arcade") {
					continue
				}
				if (nameL != "" && strings.Contains(strings.ToLower(w.title), nameL)) || (exe != "" && procBase(w.pid) == exe) {
					pick = w.h
					break
				}
			}
		}
		if pick != 0 {
			for _, w := range ws {
				if w.h == pick {
					setLastGame(name, w.h, w.pid)
				}
			}
			if raised == 0 {
				foreground(pick)
				raised = pick
				continue // raise once more shortly, in case a splash screen was replaced
			}
			foreground(pick)
			return
		}
	}
}

// ---------- controller shortcut that works inside games ----------

var (
	winmm       = syscall.NewLazyDLL("winmm.dll")
	pJoyPos     = winmm.NewProc("joyGetPosEx")
	pJoyCaps    = winmm.NewProc("joyGetDevCapsW")
	pFgWin      = user32.NewProc("GetForegroundWindow")
	xinput      = syscall.NewLazyDLL("xinput1_4.dll")
	xinputOld   = syscall.NewLazyDLL("xinput1_3.dll")
	chordActive atomic.Bool
)

type joyInfoEx struct {
	Size, Flags, X, Y, Z, R, U, V, Buttons, ButtonNo, POV, R1, R2 uint32
}

type joyCaps struct {
	Mid, Pid uint16
	Pname    [32]uint16
	Rest     [19]uint32
	RegKey   [32]uint16
	OEMVxD   [260]uint16
}

type xstate struct {
	Packet         uint32
	Buttons        uint16
	LT, RT         uint8
	LX, LY, RX, RY int16
}

func xinputState(i int, st *xstate) bool {
	for _, d := range []*syscall.LazyDLL{xinput, xinputOld} {
		p := d.NewProc("XInputGetState")
		if p.Find() != nil {
			continue
		}
		r, _, _ := p.Call(uintptr(i), uintptr(unsafe.Pointer(st)))
		return r == 0
	}
	return false
}

func arcadeInFront() bool {
	h, _, _ := pFgWin.Call()
	if h == 0 {
		return false
	}
	buf := make([]uint16, 256)
	n, _, _ := pGetText.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
	t := string(utf16.Decode(buf[:n]))
	return strings.HasPrefix(t, "Hollywood Arcade") && !strings.Contains(t, "Overlay")
}

var (
	pIsWin   = user32.NewProc("IsWindow")
	lastGame struct {
		sync.Mutex
		name string
		h    uintptr
	}
	padRawX atomic.Uint32
	padRawJ atomic.Uint32
)

func setLastGame(name string, h uintptr, pid uint32) {
	lastGame.Lock()
	lastGame.name, lastGame.h = name, h
	lastGame.Unlock()
}

// gameState says which program Arcade last launched and whether its window is still open.
func gameState() (string, bool) {
	lastGame.Lock()
	defer lastGame.Unlock()
	if lastGame.h == 0 {
		return "", false
	}
	r, _, _ := pIsWin.Call(lastGame.h)
	return lastGame.name, r != 0
}

func resumeGame() bool {
	lastGame.Lock()
	h := lastGame.h
	lastGame.Unlock()
	if h == 0 {
		return false
	}
	if r, _, _ := pIsWin.Call(h); r == 0 {
		return false
	}
	foreground(h)
	return true
}

func raiseArcade() {
	for _, w := range topWindows() {
		if strings.HasPrefix(w.title, "Hollywood Arcade") && !strings.Contains(w.title, "Overlay") {
			foreground(w.h)
			return
		}
	}
}

func padRaw() (uint32, uint32) { return padRawX.Load(), padRawJ.Load() }

// startPadChord watches every controller in the background (it works while a game has focus) and calls
// onChord when the Guide trigger for the current game is held: L3+R3 (or Create+Options), the touchpad, or the PS button.
func startPadChord(onChord func()) {
	go func() {
		defer func() { recover() }()
		runtime.LockOSThread()
		isSony := map[int]bool{}
		scanSony := func() { // controllers can be plugged in or switched on after Arcade starts, so this repeats
			found := map[int]bool{}
			for id := 0; id < 16; id++ {
				var c joyCaps
				if r, _, _ := pJoyCaps.Call(uintptr(id), uintptr(unsafe.Pointer(&c)), unsafe.Sizeof(c)); r == 0 {
					n := strings.ToLower(string(utf16.Decode(c.Pname[:])))
					if strings.Contains(n, "wireless controller") || strings.Contains(n, "dualsense") || strings.Contains(n, "dualshock") || c.Mid == 0x054c {
						found[id] = true
					}
				}
			}
			if len(found) != len(isSony) {
				arcLog(fmt.Sprintf("Controllers: %d PlayStation pad(s) detected", len(found)))
			}
			isSony = found
		}
		scanSony()
		tick := 0
		var last time.Time
		var heldSince time.Time
		fired := false
		for {
			time.Sleep(40 * time.Millisecond)
			if tick++; tick%75 == 0 {
				scanSony()
			}
			var chord, touch, ps bool
			var rawX, rawJ uint32
			for i := 0; i < 4; i++ { // Xbox pads and anything Steam/DS4Windows turns into one
				var st xstate
				if xinputState(i, &st) {
					b := st.Buttons
					rawX |= uint32(b)
					chord = chord || (b&0x40 != 0 && b&0x80 != 0) || (b&0x20 != 0 && b&0x10 != 0)
				}
			}
			for id := range isSony { // PlayStation pads show up as plain joysticks
				ji := joyInfoEx{Flags: 0xFF}
				ji.Size = uint32(unsafe.Sizeof(ji))
				if r, _, _ := pJoyPos.Call(uintptr(id), uintptr(unsafe.Pointer(&ji))); r == 0 {
					b := ji.Buttons // bit n = button n+1: Create 9, Options 10, L3 11, R3 12, PS 13, touchpad 14
					rawJ |= b
					chord = chord || (b&(1<<10) != 0 && b&(1<<11) != 0) || (b&(1<<8) != 0 && b&(1<<9) != 0)
					touch = touch || b&(1<<uint(touchBit.Load())) != 0
					ps = ps || b&(1<<uint(psBit.Load())) != 0
				}
			}
			padRawX.Store(rawX)
			padRawJ.Store(rawJ)
			hit, hold := false, time.Duration(0)
			mode := currentBind()
			if len(isSony) == 0 && (mode == "touch" || mode == "ps") {
				mode = "chord" // Xbox and other pads have no touchpad or PS button, so hold L3 + R3 instead
			}
			switch mode {
			case "touch":
				hit, hold = touch, 450*time.Millisecond
			case "ps":
				hit, hold = ps, 0
			case "any":
				hit, hold = chord || touch || ps, 450*time.Millisecond
			default:
				hit, hold = chord, 320*time.Millisecond
			}
			if !hit {
				heldSince, fired = time.Time{}, false
				continue
			}
			if heldSince.IsZero() {
				heldSince = time.Now()
			}
			if !fired && time.Since(heldSince) >= hold && time.Since(last) > 900*time.Millisecond && !arcadeInFront() {
				fired = true
				last = time.Now()
				arcLog("Guide shortcut held (" + mode + "), game window: " + fgTitle())
				onChord()
			}
		}
	}()
}

// fgTitle is the title of the window in front, for the log.
func fgTitle() string {
	h, _, _ := pFgWin.Call()
	if h == 0 {
		return "(none)"
	}
	buf := make([]uint16, 256)
	n, _, _ := pGetText.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
	return strings.TrimSpace(string(utf16.Decode(buf[:n])))
}
