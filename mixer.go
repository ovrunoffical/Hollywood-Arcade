package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// A small helper (PowerShell + the Windows Core Audio API) that stays running so volume changes are instant.
const mixerScript = `$src = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int a, int b, out IntPtr c); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice dev); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out int n);
  int SetMasterVolumeLevel(float l, ref Guid c); int SetMasterVolumeLevelScalar(float l, ref Guid c);
  int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
  int SetChannelVolumeLevel(uint i, float l, ref Guid c); int SetChannelVolumeLevelScalar(uint i, float l, ref Guid c);
  int GetChannelVolumeLevel(uint i, out float l); int GetChannelVolumeLevelScalar(uint i, out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid c); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int GetAudioSessionControl(IntPtr a, int b, out IntPtr c); int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
  int GetSessionEnumerator(out IAudioSessionEnumerator e);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int s); int GetDisplayName(out IntPtr s); int SetDisplayName(IntPtr s, ref Guid c); int GetIconPath(out IntPtr s); int SetIconPath(IntPtr s, ref Guid c);
  int GetGroupingParam(out Guid g); int SetGroupingParam(ref Guid g, ref Guid c); int RegisterAudioSessionNotification(IntPtr p); int UnregisterAudioSessionNotification(IntPtr p);
  int GetSessionIdentifier(out IntPtr s); int GetSessionInstanceIdentifier(out IntPtr s); int GetProcessId(out uint pid); int IsSystemSoundsSession(); int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool d);
}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float l, ref Guid c); int GetMasterVolume(out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid c); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}

public static class Mixer {
  static Guid none = Guid.Empty;
  static IMMDevice Dev() { var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom()); IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static T Act<T>(Guid iid) { object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o); return (T)o; }
  static IAudioEndpointVolume Ep() { return Act<IAudioEndpointVolume>(typeof(IAudioEndpointVolume).GUID); }
  static IAudioSessionEnumerator Sess() { IAudioSessionEnumerator e; Act<IAudioSessionManager2>(typeof(IAudioSessionManager2).GUID).GetSessionEnumerator(out e); return e; }
  public static void SetMaster(int v) { var ep = Ep(); ep.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, v)) / 100f, ref none); if (v > 0) ep.SetMute(false, ref none); }
  public static void ToggleMute() { var ep = Ep(); bool m; ep.GetMute(out m); ep.SetMute(!m, ref none); }
  public static void SetSess(int pid, int v) {
    var e = Sess(); int n; e.GetCount(out n);
    for (int i = 0; i < n; i++) { IAudioSessionControl2 c; e.GetSession(i, out c); uint p; c.GetProcessId(out p); if (p == (uint)pid) ((ISimpleAudioVolume)c).SetMasterVolume(Math.Max(0, Math.Min(100, v)) / 100f, ref none); }
  }
  public static string List() {
    var ep = Ep(); float mv; bool mm; ep.GetMasterVolumeLevelScalar(out mv); ep.GetMute(out mm);
    var sb = new StringBuilder();
    sb.Append("{\"ok\":true,\"master\":{\"vol\":" + (int)Math.Round(mv * 100) + ",\"mute\":" + (mm ? "true" : "false") + "},\"apps\":[");
    var e = Sess(); int n; e.GetCount(out n); bool first = true;
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 c; e.GetSession(i, out c); uint p; c.GetProcessId(out p);
      if (p == 0) continue;
      string name = "app"; try { name = Process.GetProcessById((int)p).ProcessName; } catch { }
      string id = ""; try { IntPtr ip; c.GetSessionIdentifier(out ip); if (ip != IntPtr.Zero) { id = Marshal.PtrToStringUni(ip); Marshal.FreeCoTaskMem(ip); } } catch { }
      id = id.Replace("\\", "/").Replace("\"", "");
      var sv = (ISimpleAudioVolume)c; float v; bool m; sv.GetMasterVolume(out v); sv.GetMute(out m);
      if (!first) sb.Append(","); first = false;
      sb.Append("{\"pid\":" + p + ",\"name\":\"" + name.Replace("\\", "").Replace("\"", "") + "\",\"id\":\"" + id + "\",\"vol\":" + (int)Math.Round(v * 100) + ",\"mute\":" + (m ? "true" : "false") + "}");
    }
    sb.Append("]}"); return sb.ToString();
  }
}
'@
Add-Type -TypeDefinition $src
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
'{"ok":true,"ready":true}'
[Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($null -eq $l) { break }
  try {
    $p = $l.Trim().Split(' ')
    if ($p[0] -eq 'list') { [Mixer]::List() }
    elseif ($p[0] -eq 'sess') { [Mixer]::SetSess([int]$p[1], [int]$p[2]); '{"ok":true}' }
    elseif ($p[0] -eq 'master') { [Mixer]::SetMaster([int]$p[1]); '{"ok":true}' }
    elseif ($p[0] -eq 'mute') { [Mixer]::ToggleMute(); '{"ok":true}' }
    else { '{"ok":false}' }
  } catch { '{"ok":false,"error":"audio"}' }
  [Console]::Out.Flush()
}`

var (
	mixMu   sync.Mutex
	mixCmd  *exec.Cmd
	mixIn   io.WriteCloser
	mixOut  *bufio.Reader
	mixLine = make(chan string, 4)
)

func mixerStop() {
	if mixCmd != nil && mixCmd.Process != nil {
		mixCmd.Process.Kill()
		mixCmd.Wait()
	}
	mixCmd, mixIn, mixOut = nil, nil, nil
}

func mixerStart() error {
	cmd := exec.Command("powershell.exe", psArgs(mixerScript)...)
	hide(cmd)
	in, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	mixCmd, mixIn, mixOut = cmd, in, bufio.NewReader(out)
	// wait for the "ready" line (compiling the helper takes a couple of seconds)
	line, err := readLineTimeout(25 * time.Second)
	if err != nil || !strings.Contains(line, "ready") {
		mixerStop()
		return errors.New("audio helper didn't start")
	}
	return nil
}

func readLineTimeout(d time.Duration) (string, error) {
	type res struct {
		s   string
		err error
	}
	ch := make(chan res, 1)
	r := mixOut
	go func() {
		for {
			s, err := r.ReadString('\n')
			s = strings.TrimSpace(strings.TrimPrefix(s, "\xef\xbb\xbf"))
			if err != nil || strings.HasPrefix(s, "{") {
				ch <- res{s, err}
				return
			}
		}
	}()
	select {
	case x := <-ch:
		return x.s, x.err
	case <-time.After(d):
		return "", errors.New("timeout")
	}
}

func mixerCall(line string) (string, error) {
	mixMu.Lock()
	defer mixMu.Unlock()
	if mixCmd == nil {
		if err := mixerStart(); err != nil {
			return "", err
		}
	}
	if _, err := io.WriteString(mixIn, line+"\n"); err != nil {
		mixerStop()
		return "", err
	}
	s, err := readLineTimeout(8 * time.Second)
	if err != nil {
		mixerStop()
		return "", err
	}
	return s, nil
}

type mixApp struct {
	PID   int    `json:"pid"`
	Name  string `json:"name"`
	Vol   int    `json:"vol"`
	Mute  bool   `json:"mute"`
	Group string `json:"group"`
	ID    string `json:"id"`
	Tag   string `json:"tag,omitempty"`
}

var (
	tagMu   sync.Mutex
	tagMap  map[string]string
	tagFile string
)

func loadTags() {
	if tagMap != nil {
		return
	}
	tagMap = map[string]string{}
	tagFile = filepath.Join(cfgDir, "mixer-groups.json")
	if b, err := os.ReadFile(tagFile); err == nil {
		json.Unmarshal(b, &tagMap)
	}
}

func setTag(name, group string) {
	tagMu.Lock()
	defer tagMu.Unlock()
	loadTags()
	name = strings.ToLower(name)
	if group == "" || group == "auto" {
		delete(tagMap, name)
	} else {
		tagMap[name] = group
	}
	b, _ := json.Marshal(tagMap)
	os.WriteFile(tagFile, b, 0o644)
}

func classify(name, id string) (group, tag string) {
	tagMu.Lock()
	loadTags()
	t := tagMap[strings.ToLower(name)]
	tagMu.Unlock()
	if t != "" {
		return t, t
	}
	n := strings.ToLower(name + " " + id)
	has := func(list ...string) bool {
		for _, s := range list {
			if strings.Contains(n, s) {
				return true
			}
		}
		return false
	}
	switch {
	case has("apple", "itunes", "spotify", "music", "tidal", "foobar", "vlc", "musicbee", "amplibrary", "youtube music", "deezer"):
		return "music", ""
	case has("discord", "teamspeak", "ts3client", "zoom", "teams", "slack", "mumble", "skype"):
		return "chat", ""
	case has("msedge", "chrome", "firefox", "explorer", "audiodg", "svchost", "searchhost", "runtimebroker", "widgets"):
		return "other", ""
	}
	return "games", ""
}

func mixerState() map[string]any {
	s, err := mixerCall("list")
	if err != nil {
		return map[string]any{"ok": false, "error": "Couldn't reach Windows audio. " + err.Error()}
	}
	var st struct {
		OK     bool `json:"ok"`
		Master struct {
			Vol  int  `json:"vol"`
			Mute bool `json:"mute"`
		} `json:"master"`
		Apps []mixApp `json:"apps"`
	}
	if json.Unmarshal([]byte(s), &st) != nil || !st.OK {
		return map[string]any{"ok": false, "error": "Windows audio didn't answer"}
	}
	groups := map[string]map[string]int{"music": {"vol": 0, "n": 0}, "chat": {"vol": 0, "n": 0}, "games": {"vol": 0, "n": 0}}
	for i := range st.Apps {
		g, tg := classify(st.Apps[i].Name, st.Apps[i].ID)
		st.Apps[i].Group, st.Apps[i].Tag = g, tg
		if gg, ok := groups[g]; ok {
			gg["n"]++
			if st.Apps[i].Vol > gg["vol"] {
				gg["vol"] = st.Apps[i].Vol
			}
		}
	}
	return map[string]any{"ok": true, "master": st.Master, "apps": st.Apps, "groups": groups}
}

func registerMixer(mux *http.ServeMux) {
	mux.HandleFunc("/api/mixer", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, mixerState())
	})
	mux.HandleFunc("/api/mixer/tag", func(w http.ResponseWriter, r *http.Request) {
		var o struct{ Name, Group string }
		var raw map[string]string
		readJSON(r, &raw)
		o.Name, o.Group = raw["name"], raw["group"]
		if o.Name == "" {
			writeJSON(w, result{false, "missing app"})
			return
		}
		setTag(o.Name, o.Group)
		writeJSON(w, result{OK: true})
	})
	mux.HandleFunc("/api/mixer/set", func(w http.ResponseWriter, r *http.Request) {
		var o struct {
			Group string `json:"group"`
			PID   int    `json:"pid"`
			Vol   int    `json:"vol"`
			Mute  bool   `json:"mute"`
		}
		readJSON(r, &o)
		if o.Vol < 0 {
			o.Vol = 0
		}
		if o.Vol > 100 {
			o.Vol = 100
		}
		var err error
		switch {
		case o.Mute:
			_, err = mixerCall("mute")
		case o.Group == "master":
			_, err = mixerCall("master " + itoa(o.Vol))
		case o.PID > 0:
			_, err = mixerCall("sess " + itoa(o.PID) + " " + itoa(o.Vol))
		case o.Group != "":
			st := mixerState()
			apps, _ := st["apps"].([]mixApp)
			for _, a := range apps {
				if a.Group == o.Group {
					if _, e := mixerCall("sess " + itoa(a.PID) + " " + itoa(o.Vol)); e != nil {
						err = e
					}
				}
			}
		default:
			writeJSON(w, result{false, "nothing to set"})
			return
		}
		if err != nil {
			writeJSON(w, result{false, err.Error()})
			return
		}
		writeJSON(w, result{OK: true})
	})
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
