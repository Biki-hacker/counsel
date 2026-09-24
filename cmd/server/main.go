package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"counsel/pkg/ai"
	"counsel/pkg/api"
	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/logger"
	"counsel/pkg/ratelimit"
	"counsel/pkg/store"
	"counsel/pkg/websocket"
)

func main() {
	cfg := config.Load()
	logger.Init(cfg.DebugMode)

	logger.Info("Starting Counsel Legal Intelligence Server", &logger.LogEntry{
		Fields: map[string]any{
			"port":        cfg.Port,
			"environment": cfg.Env,
			"debug":       cfg.DebugMode,
		},
	})

	// 1. Persistence Layer
	var persistentStore store.Store = store.NewMemoryStore()
	logger.Info("Persistence store initialized", nil)

	// 2. Rate Limiting & Weighted Quotas
	var limiter ratelimit.Limiter
	if cfg.UpstashRedisURL != "" && cfg.UpstashRedisToken != "" {
		limiter = ratelimit.NewUpstashLimiter(cfg, persistentStore)
		logger.Info("Upstash Redis rate limiter initialized", nil)
	} else {
		limiter = ratelimit.NewMemoryLimiter(cfg, persistentStore)
		logger.Info("In-memory rate limiter initialized", nil)
	}

	// 3. Auth Subsystem
	verifier := auth.NewVerifier(cfg)
	authManager := auth.NewCanonicalAuthManager(persistentStore)

	// 4. AI Subsystem (OpenRouter, Models, Circuit Breaker)
	registry := ai.NewRegistry(cfg)
	promptBuilder := ai.NewPromptBuilder()
	circuitBreaker := ai.NewKeyCircuitBreaker(cfg.OpenRouterKeyPrimary, cfg.OpenRouterKeySecondary)
	aiClient := ai.NewOpenRouterClient(cfg, circuitBreaker)

	// 5. WebSocket Subsystem
	hub := websocket.NewHub()
	wsHandler := websocket.NewHandler(
		cfg,
		hub,
		verifier,
		authManager,
		persistentStore,
		limiter,
		registry,
		promptBuilder,
		aiClient,
	)

	// 6. REST API & Root Router
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
	router := api.SetupRouter(cfg, apiHandler, wsHandler, verifier, authManager)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second, // Allow extended streaming duration
		IdleTimeout:  120 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info(fmt.Sprintf("Counsel listening on http://0.0.0.0:%s", cfg.Port), nil)
		serverErrors <- srv.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			logger.Error(fmt.Sprintf("Server error: %v", err), nil)
			os.Exit(1)
		}
	case sig := <-shutdown:
		logger.Info(fmt.Sprintf("Received signal %v, initiating graceful shutdown", sig), nil)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			logger.Error(fmt.Sprintf("Graceful shutdown failed: %v", err), nil)
			_ = srv.Close()
		}
		logger.Info("Counsel server stopped cleanly", nil)
	}
}
