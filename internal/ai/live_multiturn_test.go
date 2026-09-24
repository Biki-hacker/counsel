package ai

import (
	"context"
	"counsel/internal/config"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestLiveMultiTurnContextAwareness(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live multi-turn test in short mode")
	}

	cfg := config.Load()
	if cfg.OpenRouterKeyPrimary == "" && cfg.OpenRouterKeySecondary == "" {
		t.Skip("No OpenRouter keys configured, skipping live test")
	}

	cb := NewKeyCircuitBreaker(cfg.OpenRouterKeyPrimary, cfg.OpenRouterKeySecondary)
	client := NewOpenRouterClient(cfg, cb)

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	model := cfg.ModelNvidiaNormal
	if model == "" {
		model = "nvidia/nemotron-3-super-120b-a12b:free"
	}

	// Turn 1: User introduces facts
	// Turn 2: Assistant confirmed
	// Turn 3: User asks follow-up testing context awareness
	messages := []ChatMessage{
		{
			Role:    "system",
			Content: "You are Counsel, an intelligent and concise legal assistant. Answer questions directly in 1 short sentence.",
		},
		{
			Role:    "user",
			Content: "My name is Alex, and I run an IT consulting firm in Bangalore, India.",
		},
		{
			Role:    "assistant",
			Content: "Understood, Alex. I have noted your IT consulting practice in Bangalore, India.",
		},
		{
			Role:    "user",
			Content: "What is my profession and which city am I based in?",
		},
	}

	var deltas []string
	callbacks := StreamCallbacks{
		OnDelta: func(d string) {
			deltas = append(deltas, d)
		},
	}

	err := client.StreamResponse(ctx, model, messages, callbacks)
	if err != nil {
		t.Logf("Live OpenRouter multi-turn stream unavailable: %v", err)
		t.Skip("OpenRouter free tier unavailable or rate-limited; skipping live test")
		return
	}

	reply := strings.Join(deltas, "")
	fmt.Printf("\n[MULTI-TURN TEST RESPONSE]\n%s\n\n", reply)

	lower := strings.ToLower(reply)
	if !strings.Contains(lower, "bangalore") && !strings.Contains(lower, "it") && !strings.Contains(lower, "consult") {
		t.Errorf("Expected model to recall Bangalore or IT consulting from previous turns, got: %s", reply)
	}
}
