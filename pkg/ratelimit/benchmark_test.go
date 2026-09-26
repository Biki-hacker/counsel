package ratelimit

import (
	"context"
	"testing"

	"counsel/pkg/config"
	"counsel/pkg/models"
	"counsel/pkg/store"
)

func BenchmarkMemoryLimiter_CalculateCost(b *testing.B) {
	cfg := config.Load()
	s := store.NewMemoryStore()
	limiter := NewMemoryLimiter(cfg, s)

	spec := &RequestSpec{
		LegalMode:  models.ModeContract,
		AIProvider: models.ProviderNvidia,
		AIMode:     models.AIModeThinking,
		PageCount:  5,
		PromptLen:  250,
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = limiter.CalculateCost(spec)
	}
}

func BenchmarkMemoryLimiter_ReserveAndSettle(b *testing.B) {
	cfg := config.Load()
	s := store.NewMemoryStore()
	limiter := NewMemoryLimiter(cfg, s)
	ctx := context.Background()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _, _ = limiter.ReserveUnits(ctx, "bench_user", 2)
		_ = limiter.SettleUnits(ctx, "bench_user", 2, 2)
	}
}
