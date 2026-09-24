package ai

import (
	"testing"
)

func TestCircuitBreakerFailover(t *testing.T) {
	primary := "key-primary-111"
	secondary := "key-secondary-222"

	cb := NewKeyCircuitBreaker(primary, secondary)

	selected, backup := cb.SelectHealthyKey()
	if selected != primary {
		t.Errorf("Expected primary key %s, got %s", primary, selected)
	}
	if backup != secondary {
		t.Errorf("Expected backup %s, got %s", secondary, backup)
	}

	cb.ReportFailure(primary, 429)

	selected2, _ := cb.SelectHealthyKey()
	if selected2 != secondary {
		t.Errorf("Expected failover to secondary key %s, got %s", secondary, selected2)
	}

	cb.ReportSuccess(secondary)

	selected3, _ := cb.SelectHealthyKey()
	if selected3 != secondary {
		t.Errorf("Expected secondary to remain active while primary is in cooldown, got %s", selected3)
	}
}

func TestCircuitBreakerGetOrderedKeys(t *testing.T) {
	primary := "key-primary-111"
	secondary := "key-secondary-222"

	cb := NewKeyCircuitBreaker(primary, secondary)

	keys := cb.GetOrderedKeys()
	if len(keys) != 2 || keys[0] != primary || keys[1] != secondary {
		t.Errorf("Expected [%s, %s], got %v", primary, secondary, keys)
	}

	cb.ReportFailure(primary, 429)

	keysAfterFail := cb.GetOrderedKeys()
	if len(keysAfterFail) != 2 || keysAfterFail[0] != secondary || keysAfterFail[1] != primary {
		t.Errorf("Expected [%s, %s], got %v", secondary, primary, keysAfterFail)
	}
}
