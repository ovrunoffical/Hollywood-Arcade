# Contributing

Thanks for helping. Hollywood Arcade is a small project and stays that way on purpose.

## Ground rules
- **Standard library only.** The Go side uses no third-party modules. The web side is plain HTML, CSS and JavaScript with no build step and no npm.
- **Private by default.** Nothing is sent anywhere unless the person set up a feature that needs it, and API keys stay on their PC.
- **No game downloads.** Arcade never downloads or provides games, ROMs or BIOS files.
- **Keep it controller friendly.** Anything new has to work with a D-pad, A and B.

## Building
Install Go 1.24 or newer, then:

```
go vet ./...
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o HollywoodArcade.exe .
```

You can run a Linux build for the web side (`go build && ./hollywoodarcade`) with `HA_NOWINDOW=1`, which prints a local address to open in a browser.
Platform code lives in `native_windows.go` / `native_other.go` and `stream_windows.go` / `stream_other.go`. If you add a function to one, add a stub to the other.

## Before you open a pull request
- `gofmt -l .` prints nothing and `go vet ./...` passes for both Linux and Windows.
- Add a line to the newest entry in `PATCH_NOTES` in `web/v2.js`.
- Say what you tested. Things that only work on real hardware (controllers, Windows settings, emulators) are easy to get wrong, so describe what you tried.

## Adding retro games or emulators
You do not need code for this. See "Your own game lists and emulators" in Settings: it creates `retro.json` and `emulators.json` in the data folder.
