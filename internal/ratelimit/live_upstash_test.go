package ratelimit

import (
	"context"
	"counsel/internal/config"
	"counsel/internal/store"
	"testing"
	"time"
)

func TestLiveUpstashLimiter(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live Upstash test in short mode")
	}
	cfg := config.Load()
	if cfg.UpstashRedisURL == "" || cfg.UpstashRedisToken == "" {
		t.Skip("No Upstash Redis credentials configured, skipping live test")
	}

	s := store.NewMemoryStore()
	limiter := NewUpstashLimiter(cfg, s)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	testUser := "user_test_live_verify_001"

	// 1. Reserve 2 units
	ok, quota, err := limiter.ReserveUnits(ctx, testUser, 2)
	if err != nil || !ok {
		t.Fatalf("Failed to reserve units on live Upstash: err=%v ok=%v", err, ok)
	}
	if quota == nil {
		t.Fatalf("Expected quota object, got nil")
	}

	// 2. Refund the 2 units so test is non-destructive
	err = limiter.RefundUnits(ctx, testUser, 2)
	if err != nil {
		t.Fatalf("Failed to refund units on live Upstash: %v", err)
	}
}
