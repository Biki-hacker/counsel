package handler

import (
	"net/http"
	"sync"

	"counsel/internal/ai"
	"counsel/internal/api"
	"counsel/internal/auth"
	"counsel/internal/config"
	"counsel/internal/logger"
	"counsel/internal/ratelimit"
	"counsel/internal/store"
)

var (
	rootRouter http.Handler
	initOnce   sync.Once
)

func initializeServerless() {
	cfg := config.Load()
	logger.Init(cfg.DebugMode)

	logger.Info("Initializing Counsel Serverless Function (Vercel)", &logger.LogEntry{
		Fields: map[string]any{
			"environment": cfg.Env,
			"debug":       cfg.DebugMode,
		},
	})

	// 1. Persistence Layer
	// In-memory default for serverless demos; configure cloud storage via env in production
	var persistentStore store.Store = store.NewMemoryStore()

	// 2. Rate Limiting & Weighted Quotas
	var limiter ratelimit.Limiter
	if cfg.UpstashRedisURL != "" && cfg.UpstashRedisToken != "" {
		limiter = ratelimit.NewUpstashLimiter(cfg, persistentStore)
		logger.Info("Upstash Redis rate limiter initialized for serverless", nil)
	} else {
		limiter = ratelimit.NewMemoryLimiter(cfg, persistentStore)
		logger.Info("In-memory rate limiter initialized for serverless", nil)
	}

	// 3. Auth Subsystem
	verifier := auth.NewVerifier(cfg)
	authManager := auth.NewCanonicalAuthManager(persistentStore)

	// 4. AI Subsystem (OpenRouter, Models, Circuit Breaker)
	registry := ai.NewRegistry(cfg)
	promptBuilder := ai.NewPromptBuilder()
	circuitBreaker := ai.NewKeyCircuitBreaker(cfg.OpenRouterKeyPrimary, cfg.OpenRouterKeySecondary)
	aiClient := ai.NewOpenRouterClient(cfg, circuitBreaker)

	// 5. REST & SSE API Handler
	apiHandler := api.NewAPIHandler(
		cfg,
		persistentStore,
		limiter,
		verifier,
		authManager,
		registry,
		promptBuilder,
		aiClient,
	)

	// In serverless environments, wsHandler is nil as WebSockets are not supported.
	// SetupRouter will serve a 501 Not Implemented response for any /ws/chat requests.
	rootRouter = api.SetupRouter(cfg, apiHandler, nil, verifier, authManager)
}

// Handler is the Vercel Go Serverless Function entrypoint.
// Vercel routes incoming HTTP requests to this function.
func Handler(w http.ResponseWriter, r *http.Request) {
	initOnce.Do(initializeServerless)

	// Vercel rewrites may rewrite the internal URL to /api/index.go or /api.
	// When that occurs, restore the original request path from standard Vercel headers.
	if r.URL.Path == "/api/index.go" || r.URL.Path == "/api/index" || r.URL.Path == "/api" {
		if matched := r.Header.Get("x-matched-path"); matched != "" {
			r.URL.Path = matched
		} else if orig := r.Header.Get("x-original-url"); orig != "" {
			r.URL.Path = orig
		} else if fwd := r.Header.Get("x-forwarded-uri"); fwd != "" {
			r.URL.Path = fwd
		}
	}

	rootRouter.ServeHTTP(w, r)
}
