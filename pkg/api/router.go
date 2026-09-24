package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/logger"
	"counsel/pkg/websocket"

	"github.com/google/uuid"
)

// SetupRouter creates the root HTTP multiplexer with security, CORS, and logging middlewares.
func SetupRouter(
	cfg *config.Config,
	apiHandler *APIHandler,
	wsHandler *websocket.Handler,
	verifier *auth.Verifier,
	authManager *auth.CanonicalAuthManager,
) http.Handler {
	mux := http.NewServeMux()

	authMiddleware := auth.Middleware(verifier, authManager)

	// Health check
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"healthy","service":"counsel"}`))
	})

	// Public Auth Session endpoint
	mux.HandleFunc("POST /api/v1/auth/session", apiHandler.HandleAuthSession)

	// WebSocket Chat endpoint (Persistent container & local dev)
	if wsHandler != nil {
		mux.Handle("/ws/chat", wsHandler)
	} else {
		mux.HandleFunc("/ws/chat", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotImplemented)
			_, _ = w.Write([]byte(`{"error":{"code":"WEBSOCKET_UNAVAILABLE","message":"WebSockets are not supported in serverless environment. Use POST /api/v1/chat/stream for HTTP Server-Sent Events (SSE) streaming."}}`))
		})
	}

	// HTTP Server-Sent Events (SSE) Chat endpoint (Serverless, Vercel & HTTP streaming)
	mux.Handle("POST /api/v1/chat/stream", authMiddleware(http.HandlerFunc(apiHandler.HandleChatStream)))

	// Authenticated User endpoints
	mux.Handle("GET /api/v1/me", authMiddleware(http.HandlerFunc(apiHandler.HandleGetMe)))
	mux.Handle("PATCH /api/v1/me", authMiddleware(http.HandlerFunc(apiHandler.HandleUpdateMe)))
	mux.Handle("DELETE /api/v1/me", authMiddleware(http.HandlerFunc(apiHandler.HandleDeleteMe)))

	// Authenticated Conversation endpoints
	mux.Handle("GET /api/v1/conversations", authMiddleware(http.HandlerFunc(apiHandler.HandleListConversations)))
	mux.Handle("POST /api/v1/conversations", authMiddleware(http.HandlerFunc(apiHandler.HandleCreateConversation)))
	mux.Handle("GET /api/v1/conversations/{id}", authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		apiHandler.HandleGetConversation(w, r, id)
	})))
	mux.Handle("PATCH /api/v1/conversations/{id}", authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		apiHandler.HandleUpdateConversation(w, r, id)
	})))
	mux.Handle("DELETE /api/v1/conversations/{id}", authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		apiHandler.HandleDeleteConversation(w, r, id)
	})))

	// Authenticated Document endpoints
	mux.Handle("GET /api/v1/documents", authMiddleware(http.HandlerFunc(apiHandler.HandleListDocuments)))
	mux.Handle("POST /api/v1/documents", authMiddleware(http.HandlerFunc(apiHandler.HandleUploadDocument)))
	mux.Handle("DELETE /api/v1/documents/{id}", authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		apiHandler.HandleDeleteDocument(w, r, id)
	})))

	// Authenticated Usage endpoint
	mux.Handle("GET /api/v1/usage", authMiddleware(http.HandlerFunc(apiHandler.HandleGetUsage)))

	// Demo seed endpoint
	mux.Handle("GET /api/v1/demo/seed", authMiddleware(http.HandlerFunc(apiHandler.HandleSeedDemoData)))

	// Root middleware chain: Recovery -> Security Headers -> Request Logging -> CORS
	return recoveryMiddleware(securityHeadersMiddleware(loggingMiddleware(corsMiddleware(cfg, mux))))
}

func corsMiddleware(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := false
		if origin != "" {
			for _, o := range cfg.AllowedOrigins {
				if o == "*" || strings.EqualFold(o, origin) {
					allowed = true
					break
				}
			}
			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Correlation-ID")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := r.Header.Get("X-Correlation-ID")
		if reqID == "" {
			reqID = "req_" + uuid.New().String()[:8]
		}
		w.Header().Set("X-Request-ID", reqID)

		next.ServeHTTP(w, r)

		dur := time.Since(start).Milliseconds()
		if !strings.HasPrefix(r.URL.Path, "/healthz") {
			logger.Info(fmt.Sprintf("%s %s completed", r.Method, r.URL.Path), &logger.LogEntry{
				RequestID:  reqID,
				Endpoint:   r.URL.Path,
				DurationMs: dur,
				Status:     "OK",
			})
		}
	})
}

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Error(fmt.Sprintf("Panic recovered: %v", rec), nil)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":{"code":"INTERNAL_ERROR","message":"An unexpected server error occurred."}}`))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

