package ai

import (
	"context"
	"counsel/pkg/config"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestLiveOpenRouterConnectivity(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live OpenRouter test in short mode")
	}
	cfg := config.Load()
	if cfg.OpenRouterKeyPrimary == "" && cfg.OpenRouterKeySecondary == "" {
		t.Skip("No OpenRouter keys configured, skipping live test")
	}

	cb := NewKeyCircuitBreaker(cfg.OpenRouterKeyPrimary, cfg.OpenRouterKeySecondary)
	client := NewOpenRouterClient(cfg, cb)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var receivedDeltas []string
	var statuses []string

	callbacks := StreamCallbacks{
		OnStatus: func(s string) {
			statuses = append(statuses, s)
		},
		OnDelta: func(d string) {
			receivedDeltas = append(receivedDeltas, d)
		},
	}

	// Test with Nvidia Nemotron (which was 200 OK in our earlier API test)
	model := cfg.ModelNvidiaNormal
	if model == "" {
		model = "nvidia/nemotron-3-super-120b-a12b:free"
	}

	err := client.StreamSinglePrompt(
		ctx,
		model,
		"You are Counsel, a concise legal AI assistant. Provide a single sentence overview of what a non-disclosure agreement does.",
		"What is an NDA?",
		callbacks,
	)

	if err != nil {
		t.Logf("Live OpenRouter streaming unavailable: %v", err)
		t.Skip("OpenRouter free tier unavailable or rate-limited; skipping live test")
		return
	}

	combined := strings.Join(receivedDeltas, "")
	fmt.Printf("\n[LIVE TEST RESULT]\nModel: %s\nStatuses received: %v\nResponse length: %d chars\nPreview: %s\n\n",
		model, statuses, len(combined), combined)

	if len(combined) == 0 {
		t.Errorf("Expected streamed response deltas, got 0 bytes")
	}
}
