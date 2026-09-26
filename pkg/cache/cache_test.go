package cache

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestMemoryCache_BasicGetSet(t *testing.T) {
	c := NewMemoryCache(3)

	c.Set("k1", "v1", 1*time.Minute)
	c.Set("k2", "v2", 1*time.Minute)

	if val, ok := c.Get("k1"); !ok || val != "v1" {
		t.Fatalf("Expected v1, got %v (found: %v)", val, ok)
	}

	if _, ok := c.Get("k3"); ok {
		t.Fatalf("Expected k3 not found")
	}

	if c.Len() != 2 {
		t.Fatalf("Expected 2 items, got %d", c.Len())
	}
}

func TestMemoryCache_LRUEviction(t *testing.T) {
	c := NewMemoryCache(2)

	c.Set("k1", "v1", 1*time.Minute)
	c.Set("k2", "v2", 1*time.Minute)

	// Access k1 to make k2 the least recently used
	_, _ = c.Get("k1")

	// Insert k3 - should evict k2
	c.Set("k3", "v3", 1*time.Minute)

	if _, ok := c.Get("k2"); ok {
		t.Errorf("Expected k2 to have been evicted")
	}

	if val, ok := c.Get("k1"); !ok || val != "v1" {
		t.Errorf("Expected k1 to remain, got %v", val)
	}

	if val, ok := c.Get("k3"); !ok || val != "v3" {
		t.Errorf("Expected k3 to exist, got %v", val)
	}
}

func TestMemoryCache_Expiration(t *testing.T) {
	c := NewMemoryCache(5)

	c.Set("short", "expire_soon", 10*time.Millisecond)
	c.Set("long", "persist", 1*time.Minute)

	time.Sleep(25 * time.Millisecond)

	if _, ok := c.Get("short"); ok {
		t.Errorf("Expected short key to have expired")
	}

	if val, ok := c.Get("long"); !ok || val != "persist" {
		t.Errorf("Expected long key to remain, got %v", val)
	}
}

func TestMemoryCache_ConcurrentAccess(t *testing.T) {
	c := NewMemoryCache(100)
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			key := fmt.Sprintf("key_%d", id%10)
			c.Set(key, fmt.Sprintf("val_%d", id), 1*time.Minute)
			_, _ = c.Get(key)
		}(i)
	}

	wg.Wait()
	stats := c.Stats()
	if stats.Hits+stats.Misses == 0 {
		t.Errorf("Expected stats to record lookups")
	}
}

func TestGenerateKey(t *testing.T) {
	k1 := GenerateKey("chat", "prompt 1", "contract", "india")
	k2 := GenerateKey("chat", "prompt 1", "contract", "india")
	k3 := GenerateKey("chat", "prompt 2", "contract", "india")

	if k1 != k2 {
		t.Errorf("Expected identical keys for identical inputs, got %s vs %s", k1, k2)
	}
	if k1 == k3 {
		t.Errorf("Expected different keys for different prompts")
	}
}
