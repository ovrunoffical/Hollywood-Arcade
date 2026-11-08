//go:build !windows

package main

import "os/exec"

func detach(c *exec.Cmd) {}
func hide(c *exec.Cmd)   {}
