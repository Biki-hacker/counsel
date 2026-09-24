package ratelimit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"counsel/pkg/config"
	"counsel/pkg/models"
	"counsel/pkg/store"
)

// UpstashLimiter leverages Upstash Redis REST API with fallback to MemoryLimiter.
type UpstashLimiter struct {
	cfg      *config.Config
	fallback *MemoryLimiter
	client   *http.Client
}

func NewUpstashLimiter(cfg *config.Config, s store.Store) *UpstashLimiter {
	return &UpstashLimiter{
		cfg:      cfg,
		fallback: NewMemoryLimiter(cfg, s),
		client:   &http.Client{Timeout: 5 * time.Second},
	}
}

func (u *UpstashLimiter) CalculateCost(spec *RequestSpec) int {
	return u.fallback.CalculateCost(spec)
}

func (u *UpstashLimiter) ReserveUnits(ctx context.Context, userID string, units int) (bool, *models.UsageQuota, error) {
	if u.cfg.UpstashRedisURL == "" || u.cfg.UpstashRedisToken == "" {
		return u.fallback.ReserveUnits(ctx, userID, units)
	}

	// Try atomic increment on Upstash Redis
	// Key: counsel:quota:<userID>:<todayDate>
	today := time.Now().UTC().Format("2006-01-02")
	key := fmt.Sprintf("counsel:quota:%s:%s", userID, today)

	// Send pipeline or single INCRBY
	url := fmt.Sprintf("%s/incrby/%s/%d", u.cfg.UpstashRedisURL, key, units)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return u.fallback.ReserveUnits(ctx, userID, units)
	}
	req.Header.Set("Authorization", "Bearer "+u.cfg.UpstashRedisToken)

	resp, err := u.client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		// Fallback to local memory limiter on transient Upstash failure
		return u.fallback.ReserveUnits(ctx, userID, units)
	}
	defer resp.Body.Close()

	var upstashResp struct {
		Result int `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&upstashResp); err != nil {
		return u.fallback.ReserveUnits(ctx, userID, units)
	}

	allowance := u.cfg.DailyQuotaAllowance
	if upstashResp.Result > allowance {
		// Roll back the reservation
		decrURL := fmt.Sprintf("%s/decrby/%s/%d", u.cfg.UpstashRedisURL, key, units)
		if decrReq, err := http.NewRequestWithContext(ctx, "POST", decrURL, nil); err == nil {
			decrReq.Header.Set("Authorization", "Bearer "+u.cfg.UpstashRedisToken)
			_, _ = u.client.Do(decrReq)
		}
		return false, &models.UsageQuota{
			UserID:         userID,
			DailyAllowance: allowance,
			UsedToday:      upstashResp.Result - units,
			ResetAt:        time.Now().UTC().Add(24 * time.Hour),
		}, ErrQuotaExceeded
	}

	// Also sync into local fallback store for local queries
	return u.fallback.ReserveUnits(ctx, userID, units)
}

func (u *UpstashLimiter) SettleUnits(ctx context.Context, userID string, reservedUnits, actualUnits int) error {
	diff := actualUnits - reservedUnits
	if diff != 0 && u.cfg.UpstashRedisURL != "" && u.cfg.UpstashRedisToken != "" {
		today := time.Now().UTC().Format("2006-01-02")
		key := fmt.Sprintf("counsel:quota:%s:%s", userID, today)
		var op string
		var amount int
		if diff > 0 {
			op = "incrby"
			amount = diff
		} else {
			op = "decrby"
			amount = -diff
		}
		url := fmt.Sprintf("%s/%s/%s/%d", u.cfg.UpstashRedisURL, op, key, amount)
		if req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(nil)); err == nil {
			req.Header.Set("Authorization", "Bearer "+u.cfg.UpstashRedisToken)
			if resp, err := u.client.Do(req); err == nil {
				_ = resp.Body.Close()
			}
		}
	}
	return u.fallback.SettleUnits(ctx, userID, reservedUnits, actualUnits)
}

func (u *UpstashLimiter) RefundUnits(ctx context.Context, userID string, units int) error {
	if units > 0 && u.cfg.UpstashRedisURL != "" && u.cfg.UpstashRedisToken != "" {
		today := time.Now().UTC().Format("2006-01-02")
		key := fmt.Sprintf("counsel:quota:%s:%s", userID, today)
		url := fmt.Sprintf("%s/decrby/%s/%d", u.cfg.UpstashRedisURL, key, units)
		if req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(nil)); err == nil {
			req.Header.Set("Authorization", "Bearer "+u.cfg.UpstashRedisToken)
			if resp, err := u.client.Do(req); err == nil {
				_ = resp.Body.Close()
			}
		}
	}
	return u.fallback.RefundUnits(ctx, userID, units)
}

func (u *UpstashLimiter) GetQuota(ctx context.Context, userID string) (*models.UsageQuota, error) {
	return u.fallback.GetQuota(ctx, userID)
}
