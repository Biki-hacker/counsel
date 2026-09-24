package ai

import (
	"strings"
	"testing"
	"time"

	"counsel/internal/models"
)

func TestContextManager_SingleTurn(t *testing.T) {
	cm := NewContextManager()
	msgs := cm.BuildContext("You are Counsel.", nil, "What is an NDA?", "")

	if len(msgs) != 2 {
		t.Fatalf("Expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "system" || msgs[0].Content != "You are Counsel." {
		t.Errorf("Unexpected system message: %+v", msgs[0])
	}
	if msgs[1].Role != "user" || msgs[1].Content != "What is an NDA?" {
		t.Errorf("Unexpected user message: %+v", msgs[1])
	}
}

func TestContextManager_MultiTurnPreservation(t *testing.T) {
	cm := NewContextManager()

	history := []*models.Message{
		{
			ID:        "msg_1",
			Role:      "user",
			Content:   "Can an employer terminate me without notice in India?",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-2 * time.Minute),
		},
		{
			ID:        "msg_2",
			Role:      "assistant",
			Content:   "Under Indian employment law, termination without notice depends on the contract terms and whether misconduct is alleged.",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-1 * time.Minute),
		},
	}

	msgs := cm.BuildContext(
		"You are Counsel.",
		history,
		"What if the contract specifies 30 days notice?",
		"",
	)

	// Expected: System + User1 + Assistant1 + User2 (Current) = 4 messages
	if len(msgs) != 4 {
		t.Fatalf("Expected 4 messages, got %d", len(msgs))
	}

	if msgs[1].Role != "user" || msgs[1].Content != history[0].Content {
		t.Errorf("Turn 1 user message mismatch: %+v", msgs[1])
	}
	if msgs[2].Role != "assistant" || msgs[2].Content != history[1].Content {
		t.Errorf("Turn 1 assistant message mismatch: %+v", msgs[2])
	}
	if msgs[3].Role != "user" || msgs[3].Content != "What if the contract specifies 30 days notice?" {
		t.Errorf("Turn 2 user message mismatch: %+v", msgs[3])
	}
}

func TestContextManager_CompactionWhenExceedingBudget(t *testing.T) {
	cm := &ContextManager{
		MaxTotalChars:    500, // Artificially small budget to trigger compaction
		RecentTurnCount:  2,   // Keep last 2 messages (1 exchange) verbatim
		MaxSummaryLength: 200,
	}

	longAnswer := strings.Repeat("This is a detailed legal obligation review of Section 4. ", 15)

	history := []*models.Message{
		{
			ID:        "msg_1",
			Role:      "user",
			Content:   "Question about Section 1 arbitration clause.",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-10 * time.Minute),
		},
		{
			ID:        "msg_2",
			Role:      "assistant",
			Content:   longAnswer,
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-9 * time.Minute),
		},
		{
			ID:        "msg_3",
			Role:      "user",
			Content:   "Question about Section 2 payment terms.",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-8 * time.Minute),
		},
		{
			ID:        "msg_4",
			Role:      "assistant",
			Content:   longAnswer,
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-7 * time.Minute),
		},
		{
			ID:        "msg_5",
			Role:      "user",
			Content:   "Recent question about Section 3 liability cap.",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-2 * time.Minute),
		},
		{
			ID:        "msg_6",
			Role:      "assistant",
			Content:   "Section 3 caps liability at 12 months fees.",
			Status:    models.StatusCompleted,
			CreatedAt: time.Now().Add(-1 * time.Minute),
		},
	}

	msgs := cm.BuildContext(
		"System Prompt",
		history,
		"Can they increase the liability cap?",
		"",
	)

	// Check that compacted summary is present
	hasSummary := false
	for _, m := range msgs {
		if contentStr, ok := m.Content.(string); ok && strings.Contains(contentStr, "[PRIOR CONVERSATION CONTEXT & FACT SUMMARY]") {
			hasSummary = true
			break
		}
	}
	if !hasSummary {
		t.Errorf("Expected compacted summary message to be injected")
	}

	// Verify the most recent user turn (msg_5) and assistant turn (msg_6) are preserved verbatim
	foundRecentUser := false
	foundRecentAssistant := false
	for _, m := range msgs {
		if m.Role == "user" && m.Content == "Recent question about Section 3 liability cap." {
			foundRecentUser = true
		}
		if m.Role == "assistant" && m.Content == "Section 3 caps liability at 12 months fees." {
			foundRecentAssistant = true
		}
	}
	if !foundRecentUser {
		t.Errorf("Expected recent user turn to be preserved verbatim")
	}
	if !foundRecentAssistant {
		t.Errorf("Expected recent assistant turn to be preserved verbatim")
	}

	// Verify current turn is last message
	last := msgs[len(msgs)-1]
	if last.Role != "user" || last.Content != "Can they increase the liability cap?" {
		t.Errorf("Expected last message to be active user prompt, got: %+v", last)
	}
}

func TestContextManager_DocumentContextIncluded(t *testing.T) {
	cm := NewContextManager()
	docContext := "<untrusted_document name=\"Lease.pdf\">\nSection 1: Rent is $5000\n</untrusted_document>"
	msgs := cm.BuildContext("You are Counsel.", nil, "How much is rent?", docContext)

	if len(msgs) != 2 {
		t.Fatalf("Expected 2 messages, got %d", len(msgs))
	}
	contentStr, ok := msgs[1].Content.(string)
	if !ok {
		t.Fatalf("Expected string content for text-only turn")
	}
	if !strings.Contains(contentStr, "REFERENCED LEGAL DOCUMENT(S):") {
		t.Errorf("Expected document header in user prompt")
	}
	if !strings.Contains(contentStr, "Rent is $5000") {
		t.Errorf("Expected document content in user prompt")
	}
	if !strings.Contains(contentStr, "How much is rent?") {
		t.Errorf("Expected query in user prompt")
	}
}

func TestContextManager_MultimodalImages(t *testing.T) {
	cm := NewContextManager()
	pageImages := []string{
		"data:image/jpeg;base64,page1sampledata",
		"data:image/jpeg;base64,page2sampledata",
	}

	msgs := cm.BuildContextWithImages("You are Counsel.", nil, "Analyze this contract", "", pageImages)
	if len(msgs) != 2 {
		t.Fatalf("Expected 2 messages, got %d", len(msgs))
	}

	parts, ok := msgs[1].Content.([]ContentPart)
	if !ok {
		t.Fatalf("Expected []ContentPart for multimodal turn, got %T", msgs[1].Content)
	}
	if len(parts) != 3 {
		t.Fatalf("Expected 3 parts (1 text + 2 images), got %d", len(parts))
	}
	if parts[0].Type != "text" || parts[0].Text != "Analyze this contract" {
		t.Errorf("Expected text part first, got %+v", parts[0])
	}
	if parts[1].Type != "image_url" || parts[1].ImageURL.URL != pageImages[0] {
		t.Errorf("Expected image 1, got %+v", parts[1])
	}
	if parts[2].Type != "image_url" || parts[2].ImageURL.URL != pageImages[1] {
		t.Errorf("Expected image 2, got %+v", parts[2])
	}
}
