//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// detach: the launched program lives on after Hollywood Arcade closes.
func detach(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000200} // CREATE_NEW_PROCESS_GROUP
}

// hide: run helper commands (PowerShell, reg) without flashing a console window.
func hide(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}
