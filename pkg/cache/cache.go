package cache

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// CacheEntry represents an item stored in the LRU cache.
type CacheEntry struct {
	key       string
	value     string
	expiresAt time.Time
}

// CacheStats provides visibility into cache performance.
type CacheStats struct {
	Hits      int64   `json:"hits"`
	Misses    int64   `json:"misses"`
	HitRate   float64 `json:"hitRate"`
	ItemCount int     `json:"itemCount"`
	Capacity  int     `json:"capacity"`
}

// MemoryCache implements a high-performance, thread-safe LRU cache with TTL eviction.
type MemoryCache struct {
	mu       sync.RWMutex
	capacity int
	items    map[string]*list.Element
	evict    *list.List
	hits     int64
	misses   int64
}

// NewMemoryCache initializes an in-memory LRU cache with the specified capacity limit.
func NewMemoryCache(capacity int) *MemoryCache {
	if capacity <= 0 {
		capacity = 500
	}
	return &MemoryCache{
		capacity: capacity,
		items:    make(map[string]*list.Element),
		evict:    list.New(),
	}
}

// GenerateKey creates a deterministic SHA-256 hash key from prompt, mode, jurisdiction, and doc contexts.
func GenerateKey(prefix string, components ...string) string {
	h := sha256.New()
	h.Write([]byte(prefix))
	for _, c := range components {
		h.Write([]byte("|"))
		h.Write([]byte(c))
	}
	return prefix + "_" + hex.EncodeToString(h.Sum(nil))[:24]
}

// Get retrieves a cached value if present and not expired.
func (c *MemoryCache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, exists := c.items[key]
	if !exists {
		c.misses++
		return "", false
	}

	entry := elem.Value.(*CacheEntry)
	// Check TTL expiration
	if !entry.expiresAt.IsZero() && time.Now().After(entry.expiresAt) {
		c.evict.Remove(elem)
		delete(c.items, key)
		c.misses++
		return "", false
	}

	// Move to front of LRU list
	c.evict.MoveToFront(elem)
	c.hits++
	return entry.value, true
}

// Set stores a key-value pair in cache with an expiration duration.
func (c *MemoryCache) Set(key string, value string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var expiresAt time.Time
	if ttl > 0 {
		expiresAt = time.Now().Add(ttl)
	}

	// If key exists, update value and move to front
	if elem, exists := c.items[key]; exists {
		c.evict.MoveToFront(elem)
		entry := elem.Value.(*CacheEntry)
		entry.value = value
		entry.expiresAt = expiresAt
		return
	}

	// Evict oldest item if capacity is reached
	for c.evict.Len() >= c.capacity {
		oldest := c.evict.Back()
		if oldest == nil {
			break
		}
		c.evict.Remove(oldest)
		oldEntry := oldest.Value.(*CacheEntry)
		delete(c.items, oldEntry.key)
	}

	// Insert new entry
	entry := &CacheEntry{
		key:       key,
		value:     value,
		expiresAt: expiresAt,
	}
	elem := c.evict.PushFront(entry)
	c.items[key] = elem
}

// Len returns the current number of cached items.
func (c *MemoryCache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Purge removes all items from the cache.
func (c *MemoryCache) Purge() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]*list.Element)
	c.evict.Init()
}

// Stats returns hit/miss and utilization metrics.
func (c *MemoryCache) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	total := c.hits + c.misses
	hitRate := 0.0
	if total > 0 {
		hitRate = float64(c.hits) / float64(total)
	}

	return CacheStats{
		Hits:      c.hits,
		Misses:    c.misses,
		HitRate:   hitRate,
		ItemCount: len(c.items),
		Capacity:  c.capacity,
	}
}
