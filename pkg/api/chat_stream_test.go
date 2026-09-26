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
	"counsel/pkg/models"
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

// nonFlusherWriter deliberately hides http.Flusher to simulate Vercel serverless runtime
type nonFlusherWriter struct {
	rec *httptest.ResponseRecorder
}

func (n *nonFlusherWriter) Header() http.Header {
	return n.rec.Header()
}

func (n *nonFlusherWriter) Write(b []byte) (int, error) {
	return n.rec.Write(b)
}

func (n *nonFlusherWriter) WriteHeader(statusCode int) {
	n.rec.WriteHeader(statusCode)
}

func TestChatStreamSSE_WithoutFlusher(t *testing.T) {
	cfg := config.Load()
	cfg.OpenRouterKeyPrimary = ""
	cfg.OpenRouterKeySecondary = ""
	s := store.NewMemoryStore()
	limiter := ratelimit.NewMemoryLimiter(cfg, s)
	verifier := auth.NewVerifier(cfg)
	authMgr := auth.NewCanonicalAuthManager(s)

	apiHandler := NewAPIHandler(cfg, s, limiter, verifier, authMgr, nil, nil, nil)
	router := SetupRouter(cfg, apiHandler, nil, verifier, authMgr)

	ctx := context.Background()
	_, err := authMgr.ResolveUser(ctx, &auth.IdentityPayload{
		Provider:        "demo",
		ProviderSubject: "user_noflush_1",
		Email:           "noflush@counsel.law",
		DisplayName:     "NoFlush User",
	})
	if err != nil {
		t.Fatalf("Failed to seed user: %v", err)
	}

	payload := websocket.ClientEnvelope{
		Prompt:    "Serverless prompt without flusher",
		LegalMode: "plain_english",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest("POST", "/api/v1/chat/stream", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer demo:noflush@counsel.law:NoFlush%20User")
	req.Header.Set("Content-Type", "application/json")

	rawRec := httptest.NewRecorder()
	wrappedWriter := &nonFlusherWriter{rec: rawRec}
	router.ServeHTTP(wrappedWriter, req)

	resp := rawRec.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200 OK without Flusher, got: %d", resp.StatusCode)
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
		t.Fatalf("Expected SSE data events to be emitted even without flusher, got 0")
	}
	if eventTypes[0] != websocket.ServerEventStart {
		t.Errorf("Expected first event to be message.start, got: %s", eventTypes[0])
	}
	if eventTypes[len(eventTypes)-1] != websocket.ServerEventComplete {
		t.Errorf("Expected last event to be message.complete, got: %s", eventTypes[len(eventTypes)-1])
	}
}

func TestChatStreamSSE_MultiTurnContextPassing(t *testing.T) {
	cfg := config.Load()
	cfg.OpenRouterKeyPrimary = ""
	cfg.OpenRouterKeySecondary = ""
	s := store.NewMemoryStore()
	limiter := ratelimit.NewMemoryLimiter(cfg, s)
	verifier := auth.NewVerifier(cfg)
	authMgr := auth.NewCanonicalAuthManager(s)

	apiHandler := NewAPIHandler(cfg, s, limiter, verifier, authMgr, nil, nil, nil)
	router := SetupRouter(cfg, apiHandler, nil, verifier, authMgr)

	ctx := context.Background()
	user, err := authMgr.ResolveUser(ctx, &auth.IdentityPayload{
		Provider:        "demo",
		ProviderSubject: "user_multiturn_context",
		Email:           "multiturn@counsel.law",
		DisplayName:     "Multiturn User",
	})
	if err != nil {
		t.Fatalf("Failed to seed user: %v", err)
	}

	convID := "cnv_client_assigned_100"

	// Turn 1: Client provides conversationId and first prompt
	turn1Payload := websocket.ClientEnvelope{
		ConversationID: convID,
		Prompt:         "What is an NDA?",
		LegalMode:      "contract",
	}
	body1, _ := json.Marshal(turn1Payload)

	req1 := httptest.NewRequest("POST", "/api/v1/chat/stream", bytes.NewReader(body1))
	req1.Header.Set("Authorization", "Bearer demo:multiturn@counsel.law:Multiturn%20User")
	req1.Header.Set("Content-Type", "application/json")

	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	if w1.Result().StatusCode != http.StatusOK {
		t.Fatalf("Turn 1 failed: %d", w1.Result().StatusCode)
	}

	// Turn 2: Client passes whole context (Turn 1 user + assistant) along with follow-up prompt
	turn2Payload := websocket.ClientEnvelope{
		ConversationID: convID,
		Prompt:         "What are its standard carve-outs?",
		Messages: []*models.Message{
			{
				ID:             "msg_turn1_user",
				ConversationID: convID,
				UserID:         user.ID,
				Role:           "user",
				Content:        "What is an NDA?",
				Status:         models.StatusCompleted,
			},
			{
				ID:             "msg_turn1_asst",
				ConversationID: convID,
				UserID:         user.ID,
				Role:           "assistant",
				Content:        "An NDA protects confidential information.",
				Status:         models.StatusCompleted,
			},
		},
		LegalMode: "contract",
	}
	body2, _ := json.Marshal(turn2Payload)

	req2 := httptest.NewRequest("POST", "/api/v1/chat/stream", bytes.NewReader(body2))
	req2.Header.Set("Authorization", "Bearer demo:multiturn@counsel.law:Multiturn%20User")
	req2.Header.Set("Content-Type", "application/json")

	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	if w2.Result().StatusCode != http.StatusOK {
		t.Fatalf("Turn 2 failed: %d", w2.Result().StatusCode)
	}

	// Verify only 1 conversation was created and has the exact client-assigned ID
	convs, err := s.ListConversations(ctx, user.ID, 10)
	if err != nil {
		t.Fatalf("Failed to list conversations: %v", err)
	}
	if len(convs) != 1 {
		t.Fatalf("Expected exactly 1 conversation thread, got %d", len(convs))
	}
	if convs[0].ID != convID {
		t.Errorf("Expected conversation ID to be %s, got %s", convID, convs[0].ID)
	}

	// Verify messages are stored together in this conversation
	msgs, err := s.ListMessages(ctx, convID, 10)
	if err != nil {
		t.Fatalf("Failed to list messages: %v", err)
	}
	if len(msgs) < 3 {
		t.Errorf("Expected at least 3 messages stored in conversation %s, got %d", convID, len(msgs))
	}
}


