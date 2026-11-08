//go:build !windows

package main

func pressKey(vk byte)                                      {}
func startHotkey(f func())                                  {}
func bringToFront(title string)                             {}
func singleInstance() bool                                  { return true }
func findWindow(title string, includeHidden bool) uintptr   { return 0 }
func windowVisible(h uintptr) bool                          { return false }
func hideWindow(h uintptr)                                  {}
func showOnTop(h uintptr)                                   {}
func windowSnapshot() map[uintptr]bool                      { return nil }
func raiseLaunched(b map[uintptr]bool, name, target string) {}
func startPadChord(f func())                                {}
func gameState() (string, bool)                             { return "", false }
func resumeGame() bool                                      { return false }
func raiseArcade()                                          {}
func padRaw() (uint32, uint32)                              { return 0, 0 }
func centerWindow(h uintptr)                                {}
