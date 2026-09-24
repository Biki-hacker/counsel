package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/ratelimit"
	"counsel/pkg/store"
	"counsel/pkg/websocket"
)

func TestChatStreamSSE(t *testing.T) {
	cfg := config.Load()
	cfg.OpenRouterKeyPrimary = ""
	cfg.OpenRouterKeySecondary = ""
	s := store.NewMemoryStore()
	limiter := ratelimit.NewMemoryLimiter(cfg, s)
	verifier := auth.NewVerifier(cfg)
	authMgr := auth.NewCanonicalAuthManager(s)

	apiHandler := NewAPIHandler(cfg, s, limiter, verifier, authMgr, nil, nil, nil)
	hub := websocket.NewHub()
	wsHandler := websocket.NewHandler(cfg, hub, verifier, authMgr, s, limiter, nil, nil, nil)
	router := SetupRouter(cfg, apiHandler, wsHandler, verifier, authMgr)

	ctx := context.Background()
	user, err := authMgr.ResolveUser(ctx, &auth.IdentityPayload{
		Provider:        "demo",
		ProviderSubject: "user_stream_1",
		Email:           "user1@counsel.law",
		DisplayName:     "Test User",
	})
	if err != nil {
		t.Fatalf("Failed to seed user: %v", err)
	}

	payload := websocket.ClientEnvelope{
		Prompt:    "Contract review query",
		LegalMode: "contract",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest("POST", "/api/v1/chat/stream", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer demo:user1@counsel.law:Test%20User")
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK, got: %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/event-stream") {
		t.Errorf("Expected Content-Type text/event-stream, got: %s", contentType)
	}

	scanner := bufio.NewScanner(resp.Body)
	defer resp.Body.Close()

	var eventTypes []string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			jsonStr := strings.TrimPrefix(line, "data: ")
			var env websocket.ServerEnvelope
			if err := json.Unmarshal([]byte(jsonStr), &env); err == nil {
				eventTypes = append(eventTypes, env.Type)
			}
		}
	}

	if len(eventTypes) == 0 {
		t.Fatalf("Expected SSE data events to be emitted, got 0")
	}

	// Must start with message.start
	if eventTypes[0] != websocket.ServerEventStart {
		t.Errorf("Expected first event to be message.start, got: %s", eventTypes[0])
	}

	// Must finish with message.complete
	lastEvent := eventTypes[len(eventTypes)-1]
	if lastEvent != websocket.ServerEventComplete {
		t.Errorf("Expected last event to be message.complete, got: %s", lastEvent)
	}

	// Verify conversation and message were persisted
	convs, err := s.ListConversations(ctx, user.ID, 10)
	if err != nil || len(convs) != 1 {
		t.Errorf("Expected 1 conversation to be created, got: %d", len(convs))
	}
}
