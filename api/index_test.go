package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVercelServerlessHandler(t *testing.T) {
	// Test 1: Direct Health Check
	reqHealth := httptest.NewRequest("GET", "/healthz", nil)
	recHealth := httptest.NewRecorder()
	Handler(recHealth, reqHealth)

	if recHealth.Code != http.StatusOK {
		t.Fatalf("expected status 200 for /healthz, got %d", recHealth.Code)
	}
	if !strings.Contains(recHealth.Body.String(), "healthy") {
		t.Fatalf("expected healthy response, got: %s", recHealth.Body.String())
	}

	// Test 2: WebSocket Endpoint Graceful Rejection in Serverless
	reqWS := httptest.NewRequest("GET", "/ws/chat", nil)
	recWS := httptest.NewRecorder()
	Handler(recWS, reqWS)

	if recWS.Code != http.StatusNotImplemented {
		t.Fatalf("expected status 501 for /ws/chat in serverless, got %d", recWS.Code)
	}
	if !strings.Contains(recWS.Body.String(), "WEBSOCKET_UNAVAILABLE") {
		t.Fatalf("expected WEBSOCKET_UNAVAILABLE error code, got: %s", recWS.Body.String())
	}

	// Test 3: Vercel Rewrite with x-matched-path header
	reqRewrite := httptest.NewRequest("GET", "/api/index.go", nil)
	reqRewrite.Header.Set("x-matched-path", "/healthz")
	recRewrite := httptest.NewRecorder()
	Handler(recRewrite, reqRewrite)

	if recRewrite.Code != http.StatusOK {
		t.Fatalf("expected status 200 for rewritten /healthz, got %d", recRewrite.Code)
	}
}
