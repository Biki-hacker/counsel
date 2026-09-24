package ai

import (
	"sync"
	"time"
)

type KeyHealthState string

const (
	StateHealthy  KeyHealthState = "healthy"
	StateDegraded KeyHealthState = "degraded"
	StateCooldown KeyHealthState = "cooldown"
)

type KeyStatus struct {
	Key           string
	State         KeyHealthState
	Failures      int
	LastFailure   time.Time
	CooldownUntil time.Time
}

// KeyCircuitBreaker coordinates health state and failovers for dual API keys.
type KeyCircuitBreaker struct {
	mu           sync.Mutex
	primaryKey   string
	secondaryKey string
	status       map[string]*KeyStatus
	cooldownDur  time.Duration
}

func NewKeyCircuitBreaker(primary, secondary string) *KeyCircuitBreaker {
	status := make(map[string]*KeyStatus)
	if primary != "" {
		status[primary] = &KeyStatus{Key: primary, State: StateHealthy}
	}
	if secondary != "" {
		status[secondary] = &KeyStatus{Key: secondary, State: StateHealthy}
	}

	return &KeyCircuitBreaker{
		primaryKey:   primary,
		secondaryKey: secondary,
		status:       status,
		cooldownDur:  60 * time.Second,
	}
}

// SelectHealthyKey chooses the best available API key.
func (cb *KeyCircuitBreaker) SelectHealthyKey() (string, string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now().UTC()

	// Update cooldowns
	for _, ks := range cb.status {
		if ks.State == StateCooldown && now.After(ks.CooldownUntil) {
			ks.State = StateDegraded
			ks.Failures = 1
		}
	}

	primaryStatus := cb.status[cb.primaryKey]
	secondaryStatus := cb.status[cb.secondaryKey]

	// Try primary first if healthy or degraded
	if primaryStatus != nil && primaryStatus.State != StateCooldown {
		backup := ""
		if secondaryStatus != nil && secondaryStatus.State != StateCooldown {
			backup = cb.secondaryKey
		}
		return cb.primaryKey, backup
	}

	// Try secondary if primary is in cooldown
	if secondaryStatus != nil && secondaryStatus.State != StateCooldown {
		return cb.secondaryKey, ""
	}

	// Both in cooldown or only one key available
	if cb.primaryKey != "" {
		return cb.primaryKey, cb.secondaryKey
	}
	return cb.secondaryKey, ""
}

// GetOrderedKeys returns all configured API keys in priority order:
// Healthy or degraded keys first, followed by cooldown keys before giving up on a model.
func (cb *KeyCircuitBreaker) GetOrderedKeys() []string {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now().UTC()

	// Update cooldowns
	for _, ks := range cb.status {
		if ks.State == StateCooldown && now.After(ks.CooldownUntil) {
			ks.State = StateDegraded
			ks.Failures = 1
		}
	}

	var healthyOrDegraded []string
	var cooldownKeys []string

	addKey := func(k string) {
		if k == "" {
			return
		}
		status := cb.status[k]
		if status == nil || status.State != StateCooldown {
			healthyOrDegraded = append(healthyOrDegraded, k)
		} else {
			cooldownKeys = append(cooldownKeys, k)
		}
	}

	// Prefer primary, then secondary
	addKey(cb.primaryKey)
	if cb.secondaryKey != "" && cb.secondaryKey != cb.primaryKey {
		addKey(cb.secondaryKey)
	}

	return append(healthyOrDegraded, cooldownKeys...)
}

// ReportSuccess resets the failure counter for a key.
func (cb *KeyCircuitBreaker) ReportSuccess(key string) {
	if key == "" {
		return
	}
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if ks, ok := cb.status[key]; ok {
		ks.State = StateHealthy
		ks.Failures = 0
	}
}

// ReportFailure marks a failure for a key, tripping the cooldown circuit if threshold is reached.
func (cb *KeyCircuitBreaker) ReportFailure(key string, statusCode int) {
	if key == "" {
		return
	}
	cb.mu.Lock()
	defer cb.mu.Unlock()

	ks, ok := cb.status[key]
	if !ok {
		ks = &KeyStatus{Key: key}
		cb.status[key] = ks
	}

	ks.Failures++
	ks.LastFailure = time.Now().UTC()

	// 429 Rate Limit or 5xx server errors trigger cooldown quickly
	if statusCode == 429 || statusCode >= 500 || ks.Failures >= 2 {
		ks.State = StateCooldown
		ks.CooldownUntil = time.Now().UTC().Add(cb.cooldownDur)
	} else {
		ks.State = StateDegraded
	}
}
