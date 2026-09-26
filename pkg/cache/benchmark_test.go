package cache

import (
	"fmt"
	"testing"
	"time"
)

func BenchmarkMemoryCache_Get(b *testing.B) {
	c := NewMemoryCache(1000)
	for i := 0; i < 500; i++ {
		c.Set(fmt.Sprintf("k%d", i), "cached_response_payload", 1*time.Hour)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		c.Get("k250")
	}
}

func BenchmarkMemoryCache_Set(b *testing.B) {
	c := NewMemoryCache(1000)
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		c.Set(fmt.Sprintf("k%d", i%800), "cached_response_payload", 1*time.Hour)
	}
}

func BenchmarkGenerateKey(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = GenerateKey("chat", "Explain clause 4.2 in NDA", "clause", "india", "doc_12345")
	}
}
