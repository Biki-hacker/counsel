package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/models"
	"counsel/pkg/ratelimit"
	"counsel/pkg/store"
	"counsel/pkg/websocket"
)

func TestSecurityAndDataIsolation(t *testing.T) {
	cfg := config.Load()
	s := store.NewMemoryStore()
	limiter := ratelimit.NewMemoryLimiter(cfg, s)
	verifier := auth.NewVerifier(cfg)
	authMgr := auth.NewCanonicalAuthManager(s)

	apiHandler := NewAPIHandler(cfg, s, limiter, verifier, authMgr, nil, nil, nil)
	hub := websocket.NewHub()
	wsHandler := websocket.NewHandler(cfg, hub, verifier, authMgr, s, limiter, nil, nil, nil)
	router := SetupRouter(cfg, apiHandler, wsHandler, verifier, authMgr)

	ctx := context.Background()

	// Seed User A
	userA, _ := authMgr.ResolveUser(ctx, &auth.IdentityPayload{
		Provider:        "demo",
		ProviderSubject: "demo_alice_counsel.law",
		Email:           "alice@counsel.law",
		DisplayName:     "Alice User",
	})

	// Seed User B
	userB, _ := authMgr.ResolveUser(ctx, &auth.IdentityPayload{
		Provider:        "demo",
		ProviderSubject: "demo_bob_counsel.law",
		Email:           "bob@counsel.law",
		DisplayName:     "Bob User",
	})

	// User B creates a private conversation
	convB := &models.Conversation{
		ID:           "cnv_bob_private",
		UserID:       userB.ID,
		Title:        "Bob's Confidential Trade Secrets",
		LegalMode:    models.ModeContract,
		Jurisdiction: models.JurisdictionUS,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	_ = s.CreateConversation(ctx, convB)

	// User B creates a private document
	docB := &models.Document{
		ID:        "doc_bob_private",
		UserID:    userB.ID,
		Name:      "Bobs_Patent_Filing.txt",
		CreatedAt: time.Now().UTC(),
	}
	_ = s.CreateDocument(ctx, docB)

	// Test 1: User A attempts to GET User B's conversation -> MUST FAIL (404 / 401)
	req1 := httptest.NewRequest("GET", "/api/v1/conversations/"+convB.ID, nil)
	req1.Header.Set("Authorization", "Bearer demo:alice@counsel.law")
	rec1 := httptest.NewRecorder()
	router.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusNotFound && rec1.Code != http.StatusUnauthorized {
		t.Errorf("Expected 404 or 401 when User A accesses User B's conversation, got %d", rec1.Code)
	}

	// Test 2: User A attempts to DELETE User B's document -> MUST FAIL (404 / 401)
	req2 := httptest.NewRequest("DELETE", "/api/v1/documents/"+docB.ID, nil)
	req2.Header.Set("Authorization", "Bearer demo:alice@counsel.law")
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusNotFound && rec2.Code != http.StatusUnauthorized {
		t.Errorf("Expected 404 or 401 when User A deletes User B's document, got %d", rec2.Code)
	}

	// Verify Bob's document still exists!
	stillExists, err := s.GetDocument(ctx, docB.ID)
	if err != nil || stillExists == nil {
		t.Errorf("Bob's document was improperly deleted by User A!")
	}

	// Test 3: Request without authorization token -> MUST RETURN 401 UNAUTHORIZED
	req3 := httptest.NewRequest("GET", "/api/v1/conversations", nil)
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for unauthenticated request, got %d", rec3.Code)
	}

	// Test 4: Request with tampered/invalid token -> MUST RETURN 401 UNAUTHORIZED
	req4 := httptest.NewRequest("GET", "/api/v1/conversations", nil)
	req4.Header.Set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature")
	rec4 := httptest.NewRecorder()
	router.ServeHTTP(rec4, req4)

	if rec4.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for tampered token, got %d", rec4.Code)
	}

	// Test 5: User A listing conversations only sees User A's conversations
	convA := &models.Conversation{
		ID:        "cnv_alice_1",
		UserID:    userA.ID,
		Title:     "Alice's NDA",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	_ = s.CreateConversation(ctx, convA)

	req5 := httptest.NewRequest("GET", "/api/v1/conversations", nil)
	req5.Header.Set("Authorization", "Bearer demo:alice@counsel.law")
	rec5 := httptest.NewRecorder()
	router.ServeHTTP(rec5, req5)

	if rec5.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", rec5.Code)
	}

	var resp5 struct {
		Conversations []*models.Conversation `json:"conversations"`
	}
	_ = json.NewDecoder(rec5.Body).Decode(&resp5)

	for _, c := range resp5.Conversations {
		if c.UserID != userA.ID {
			t.Errorf("Data leak! User A received conversation belonging to %s", c.UserID)
		}
	}

	// Test 6: Health check is public
	req6 := httptest.NewRequest("GET", "/healthz", nil)
	rec6 := httptest.NewRecorder()
	router.ServeHTTP(rec6, req6)
	if rec6.Code != http.StatusOK {
		t.Errorf("Expected /healthz to be 200 OK, got %d", rec6.Code)
	}
}

func TestSecurityHeadersAndCORS(t *testing.T) {
	cfg := config.Load()
	cfg.AllowedOrigins = []string{"http://localhost:5173", "https://counsel.law"}
	s := store.NewMemoryStore()
	limiter := ratelimit.NewMemoryLimiter(cfg, s)
	verifier := auth.NewVerifier(cfg)
	authMgr := auth.NewCanonicalAuthManager(s)

	apiHandler := NewAPIHandler(cfg, s, limiter, verifier, authMgr, nil, nil, nil)
	router := SetupRouter(cfg, apiHandler, nil, verifier, authMgr)

	req := httptest.NewRequest("GET", "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	// Verify OWASP Security Headers
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("Expected X-Content-Type-Options: nosniff")
	}
	if rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("Expected X-Frame-Options: DENY")
	}
	if rec.Header().Get("Content-Security-Policy") == "" {
		t.Errorf("Expected Content-Security-Policy header to be present")
	}
	if rec.Header().Get("Strict-Transport-Security") == "" {
		t.Errorf("Expected Strict-Transport-Security header to be present")
	}
	if rec.Header().Get("Permissions-Policy") == "" {
		t.Errorf("Expected Permissions-Policy header to be present")
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("Expected CORS origin reflection for allowed origin")
	}
}

func TestInsecureJWTAlgorithmNone(t *testing.T) {
	cfg := config.Load()
	verifier := auth.NewVerifier(cfg)

	// Craft a JWT token with "alg": "none"
	// Header: {"alg":"none","typ":"JWT"} -> eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0
	// Payload: {"sub":"hacker","iss":"supabase","role":"authenticated"} -> eyJzdWIiOiJoYWNrZXIiLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0
	tokenWithAlgNone := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJoYWNrZXIiLCJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0."

	_, err := verifier.VerifyToken(context.Background(), tokenWithAlgNone)
	if err == nil {
		t.Fatalf("Security failure: verifier accepted JWT token with alg: none!")
	}
}

