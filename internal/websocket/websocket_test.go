package websocket

import (
	"testing"
)

func TestHubLifecycleAndStreamTracking(t *testing.T) {
	hub := NewHub()

	// Track a stream for user1
	streamCancelled := false
	cancelFunc := func() {
		streamCancelled = true
	}

	hub.TrackStream("u1", "c1", cancelFunc)

	// Cancel stream
	cancelled := hub.CancelStream("u1", "c1")
	if !cancelled {
		t.Errorf("Expected CancelStream to return true")
	}
	if !streamCancelled {
		t.Errorf("Expected cancelFunc to be invoked")
	}

	// Second cancel on already cancelled stream should return false
	if hub.CancelStream("u1", "c1") {
		t.Errorf("Expected second CancelStream to return false")
	}

	// Test ClearStream
	hub.TrackStream("u1", "c2", func() {})
	hub.ClearStream("u1", "c2")
	if hub.CancelStream("u1", "c2") {
		t.Errorf("Expected cancelled to be false after ClearStream")
	}
}

func TestEnvelopes(t *testing.T) {
	env := ServerEnvelope{
		Type:           ServerEventDelta,
		MessageID:      "m1",
		ConversationID: "c1",
		Delta:          "Hello",
	}

	if env.Type != ServerEventDelta || env.Delta != "Hello" {
		t.Errorf("Envelope mismatch: %+v", env)
	}

	clientEnv := ClientEnvelope{
		Type:   ClientMsgPing,
		Prompt: "test",
	}

	if clientEnv.Type != ClientMsgPing {
		t.Errorf("ClientEnvelope mismatch: %+v", clientEnv)
	}
}
