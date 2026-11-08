package main

import (
	"bytes"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// The Guide's System blade: a thin, console-style front for a few Windows settings.

var reSSID = regexp.MustCompile(`^[\w .\-'()&@+]{1,32}$`)

var powerPlans = map[string]string{
	"balanced": "381b4222-f694-41f0-9685-ff5bb260df2e",
	"saver":    "a1841308-3541-4fab-bc81-f71556f20b4a",
	"high":     "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
}

func runOut(name string, args ...string) (string, error) {
	c := exec.Command(name, args...)
	hide(c)
	var b bytes.Buffer
	c.Stdout, c.Stderr = &b, &b
	err := c.Run()
	return b.String(), err
}

func wifiProfiles() []string {
	out, err := runOut("netsh", "wlan", "show", "profiles")
	if err != nil {
		return nil
	}
	var names []string
	for _, l := range strings.Split(out, "\n") {
		if i := strings.Index(l, ":"); i > 0 && strings.Contains(strings.ToLower(l[:i]), "profile") {
			if n := strings.TrimSpace(l[i+1:]); n != "" {
				names = append(names, n)
			}
		}
	}
	return names
}

var reCurSSID = regexp.MustCompile(`(?m)^\s*SSID\s*:\s*(.+?)\s*$`)

func wifiCurrent() string {
	out, _ := runOut("netsh", "wlan", "show", "interfaces")
	if m := reCurSSID.FindStringSubmatch(out); m != nil {
		return m[1]
	}
	return ""
}

func activePlan() string {
	out, _ := runOut("powercfg", "/getactivescheme")
	for k, g := range powerPlans {
		if strings.Contains(strings.ToLower(out), g) {
			return k
		}
	}
	return ""
}

func brightnessGet() int {
	c := exec.Command("powershell.exe", psArgs("try{(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select -First 1).CurrentBrightness}catch{''}")...)
	hide(c)
	o, _ := c.Output()
	n, err := strconv.Atoi(strings.TrimSpace(string(o)))
	if err != nil {
		return -1
	}
	return n
}

func brightnessSet(p int) bool {
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	c := exec.Command("powershell.exe", psArgs(fmt.Sprintf("try{Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=%d} | Out-Null; 'ok'}catch{''}", p))...)
	hide(c)
	o, _ := c.Output()
	return strings.TrimSpace(string(o)) == "ok"
}

func registerSystem(mux *http.ServeMux) {
	mux.HandleFunc("/api/system", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"wifi": wifiProfiles(), "current": wifiCurrent(), "plan": activePlan(), "brightness": brightnessGet(),
		})
	})
	mux.HandleFunc("/api/system/do", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Do    string `json:"do"`
			Arg   string `json:"arg"`
			Value int    `json:"value"`
		}
		readJSON(r, &o)
		switch o.Do {
		case "open": // ms-settings pages only
			if !reSettings.MatchString(o.Arg) {
				writeJSON(w, result{false, "Not allowed"})
				return
			}
			writeJSON(w, start("cmd", []string{"/c", "start", "", o.Arg}, ""))
		case "wifi":
			if !reSSID.MatchString(o.Arg) {
				writeJSON(w, result{false, "Odd network name"})
				return
			}
			out, err := runOut("netsh", "wlan", "connect", "name="+o.Arg)
			if err != nil {
				writeJSON(w, result{false, strings.TrimSpace(out)})
				return
			}
			writeJSON(w, result{OK: true})
		case "plan":
			g, ok := powerPlans[o.Arg]
			if !ok {
				writeJSON(w, result{false, "Unknown plan"})
				return
			}
			if out, err := runOut("powercfg", "/setactive", g); err != nil {
				writeJSON(w, result{false, strings.TrimSpace(out)})
				return
			}
			writeJSON(w, result{OK: true})
		case "brightness":
			if !brightnessSet(o.Value) {
				writeJSON(w, result{false, "This display doesn't support brightness control from here."})
				return
			}
			writeJSON(w, result{OK: true})
		default:
			writeJSON(w, result{false, "Unknown"})
		}
	})
}
