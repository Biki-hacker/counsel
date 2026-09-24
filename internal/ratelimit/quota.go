package ratelimit

import (
	"context"
	"errors"
	"sync"
	"time"

	"counsel/internal/config"
	"counsel/internal/models"
	"counsel/internal/store"
)

var (
	ErrQuotaExceeded = errors.New("daily usage quota exceeded")
)

// RequestSpec encapsulates the attributes that determine computational cost.
type RequestSpec struct {
	LegalMode  models.LegalMode
	AIProvider models.AIProvider
	AIMode     models.AIMode
	PageCount  int
	PromptLen  int
}

// Limiter manages weighted quota reservations and consumption.
type Limiter interface {
	CalculateCost(spec *RequestSpec) int
	ReserveUnits(ctx context.Context, userID string, units int) (bool, *models.UsageQuota, error)
	SettleUnits(ctx context.Context, userID string, reservedUnits, actualUnits int) error
	RefundUnits(ctx context.Context, userID string, units int) error
	GetQuota(ctx context.Context, userID string) (*models.UsageQuota, error)
}

// MemoryLimiter provides an atomic in-memory implementation of Limiter.
type MemoryLimiter struct {
	cfg   *config.Config
	store store.Store
	mu    sync.Mutex
}

// NewMemoryLimiter creates a new MemoryLimiter.
func NewMemoryLimiter(cfg *config.Config, store store.Store) *MemoryLimiter {
	return &MemoryLimiter{
		cfg:   cfg,
		store: store,
	}
}

// CalculateCost computes weighted capacity units for an operation.
func (l *MemoryLimiter) CalculateCost(spec *RequestSpec) int {
	if spec == nil {
		return l.cfg.WeightBaseText
	}

	cost := l.cfg.WeightBaseText

	// Mode multiplier
	if spec.LegalMode == models.ModeCompare {
		cost *= l.cfg.WeightCompareMult
	} else if spec.LegalMode == models.ModeDocReview {
		cost *= 2
	}

	// Thinking multiplier
	if spec.AIMode == models.AIModeThinking {
		cost *= l.cfg.WeightThinkingMult
	}

	// Provider multiplier
	if spec.AIProvider == models.ProviderNvidia {
		cost *= l.cfg.WeightExpertMult
	}

	// Document pages
	if spec.PageCount > 0 {
		pageCost := (spec.PageCount + 4) / 5 // 1 unit per 5 pages
		cost += pageCost
	}

	// Long prompt adjustment
	if spec.PromptLen > 10000 {
		cost += 2
	}

	if cost < 1 {
		cost = 1
	}

	return cost
}

func (l *MemoryLimiter) ReserveUnits(ctx context.Context, userID string, units int) (bool, *models.UsageQuota, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	quota, err := l.store.GetUsage(ctx, userID)
	if err != nil {
		return false, nil, err
	}

	now := time.Now().UTC()
	// Check if daily reset is needed
	if now.After(quota.ResetAt) {
		quota.UsedToday = 0
		quota.ReservedUnits = 0
		quota.ResetAt = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	}

	if quota.DailyAllowance <= 0 {
		quota.DailyAllowance = l.cfg.DailyQuotaAllowance
	}

	totalCommitted := quota.UsedToday + quota.ReservedUnits
	if totalCommitted+units > quota.DailyAllowance {
		return false, quota, ErrQuotaExceeded
	}

	quota.ReservedUnits += units
	if err := l.store.UpdateUsage(ctx, quota); err != nil {
		return false, nil, err
	}

	return true, quota, nil
}

func (l *MemoryLimiter) SettleUnits(ctx context.Context, userID string, reservedUnits, actualUnits int) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	quota, err := l.store.GetUsage(ctx, userID)
	if err != nil {
		return err
	}

	// Deduct from reserved
	quota.ReservedUnits -= reservedUnits
	if quota.ReservedUnits < 0 {
		quota.ReservedUnits = 0
	}

	// Add actual units used
	quota.UsedToday += actualUnits
	return l.store.UpdateUsage(ctx, quota)
}

func (l *MemoryLimiter) RefundUnits(ctx context.Context, userID string, units int) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	quota, err := l.store.GetUsage(ctx, userID)
	if err != nil {
		return err
	}

	quota.ReservedUnits -= units
	if quota.ReservedUnits < 0 {
		quota.ReservedUnits = 0
	}

	return l.store.UpdateUsage(ctx, quota)
}

func (l *MemoryLimiter) GetQuota(ctx context.Context, userID string) (*models.UsageQuota, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	quota, err := l.store.GetUsage(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	if now.After(quota.ResetAt) {
		quota.UsedToday = 0
		quota.ReservedUnits = 0
		quota.ResetAt = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
		_ = l.store.UpdateUsage(ctx, quota)
	}

	return quota, nil
}
