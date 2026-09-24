package main

import (
	"os"
	"testing"
)

func TestRunServer(t *testing.T) {
	if os.Getenv("RUN_SERVER") != "1" {
		t.Skip("skipping server runner")
	}
	main()
}
