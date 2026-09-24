package ratelimit

import (
	"context"
	"testing"

	"counsel/pkg/config"
	"counsel/pkg/models"
	"counsel/pkg/store"
)

func TestWeightedQuotaManagement(t *testing.T) {
	ctx := context.Background()
	cfg := config.Load()
	s := store.NewMemoryStore()
	limiter := NewMemoryLimiter(cfg, s)

	userID := "usr_test_123"

	// 1. Cost calculations
	normalCost := limiter.CalculateCost(&RequestSpec{
		LegalMode:  models.ModeContract,
		AIProvider: models.ProviderGoogle,
		AIMode:     models.AIModeNormal,
		PageCount:  0,
		PromptLen:  100,
	})
	if normalCost != 1 {
		t.Errorf("Expected base cost 1, got %d", normalCost)
	}

	thinkingCost := limiter.CalculateCost(&RequestSpec{
		LegalMode:  models.ModeContract,
		AIProvider: models.ProviderGoogle,
		AIMode:     models.AIModeThinking,
		PageCount:  0,
		PromptLen:  100,
	})
	if thinkingCost != 2 {
		t.Errorf("Expected thinking cost 2, got %d", thinkingCost)
	}

	expertThinkingDocCost := limiter.CalculateCost(&RequestSpec{
		LegalMode:  models.ModeDocReview,
		AIProvider: models.ProviderNvidia,
		AIMode:     models.AIModeThinking,
		PageCount:  10, // 2 extra units
		PromptLen:  500,
	})
	// ModeDocReview (2) * Thinking (2) * Expert (3) + 2 pages = 12 + 2 = 14
	if expertThinkingDocCost < 10 {
		t.Errorf("Expected weighted cost >= 10, got %d", expertThinkingDocCost)
	}

	// 2. Reservation
	ok, quota, err := limiter.ReserveUnits(ctx, userID, 10)
	if err != nil || !ok {
		t.Fatalf("Failed to reserve 10 units: %v", err)
	}
	if quota.ReservedUnits != 10 {
		t.Errorf("Expected 10 reserved units, got %d", quota.ReservedUnits)
	}

	// 3. Settlement
	err = limiter.SettleUnits(ctx, userID, 10, 8)
	if err != nil {
		t.Fatalf("Failed to settle units: %v", err)
	}
	q2, _ := limiter.GetQuota(ctx, userID)
	if q2.UsedToday != 8 {
		t.Errorf("Expected 8 used today, got %d", q2.UsedToday)
	}
	if q2.ReservedUnits != 0 {
		t.Errorf("Expected 0 reserved units after settle, got %d", q2.ReservedUnits)
	}

	// 4. Refund
	_, _, _ = limiter.ReserveUnits(ctx, userID, 15)
	err = limiter.RefundUnits(ctx, userID, 15)
	if err != nil {
		t.Fatalf("Failed to refund units: %v", err)
	}
	q3, _ := limiter.GetQuota(ctx, userID)
	if q3.ReservedUnits != 0 {
		t.Errorf("Expected 0 reserved units after refund, got %d", q3.ReservedUnits)
	}
}
