package main

import (
	"net/http"
	"regexp"
)

var voiceRe = regexp.MustCompile(`^(?:https://(?:www\.)?(?:discord|discordapp)\.com/channels|discord://(?:-|discord\.com|discordapp\.com)?/?channels)/(\d+|@me)/(\d+)/?(?:\?.*)?$`)

// voiceLink turns a pasted channel link into the discord:// form that the desktop app opens directly.
func voiceLink(s string) string {
	m := voiceRe.FindStringSubmatch(s)
	if m == nil {
		return ""
	}
	return "discord://-/channels/" + m[1] + "/" + m[2]
}

func registerVoice(mux *http.ServeMux) {
	mux.HandleFunc("/api/discord/voice", func(w http.ResponseWriter, r *http.Request) {
		raw := readSetting("discordVoice")
		if raw == "" {
			writeJSON(w, result{false, "Paste your Discord voice channel link in Settings first."})
			return
		}
		l := voiceLink(raw)
		if l == "" {
			writeJSON(w, result{false, "That doesn't look like a Discord channel link. In Discord, right-click the voice channel, Copy Link."})
			return
		}
		res := start("rundll32.exe", []string{"url.dll,FileProtocolHandler", l}, "")
		if res.OK {
			arcLog("Discord voice: opened the channel")
			if readSetting("discordVoiceHide") != "off" {
				go driveWindow("^Discord", "", 4000, true)
			}
		} else {
			arcLog("Discord voice: could not open Discord: " + res.Error)
		}
		writeJSON(w, res)
	})
}
