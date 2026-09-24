package store

import (
	"context"
	"testing"
	"time"

	"counsel/internal/models"
)

func TestMemoryStoreUserLifecycle(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()

	user := &models.CanonicalUser{
		ID:              "u1",
		Email:           "alice@counsel.law",
		NormalizedEmail: "alice@counsel.law",
		DisplayName:     "Alice Vance",
		Jurisdiction:    models.JurisdictionIndia,
	}

	mapping := &models.IdentityMapping{
		Provider:        "google",
		ProviderSubject: "goog_1",
		CanonicalUserID: "u1",
	}

	// 1. Create User with Identity
	err := s.CreateUserWithIdentity(ctx, user, mapping)
	if err != nil {
		t.Fatalf("Failed to create user with identity: %v", err)
	}

	// Duplicate creation must fail with ErrAlreadyExists
	err = s.CreateUserWithIdentity(ctx, user, mapping)
	if err != ErrAlreadyExists {
		t.Errorf("Expected ErrAlreadyExists on duplicate, got: %v", err)
	}

	// 2. Fetch User by ID
	fetched, err := s.GetUser(ctx, "u1")
	if err != nil || fetched.DisplayName != "Alice Vance" {
		t.Errorf("Failed to retrieve user: %v, %+v", err, fetched)
	}

	// 3. Fetch User by Normalized Email
	fetchedByEmail, err := s.GetUserByEmail(ctx, "alice@counsel.law")
	if err != nil || fetchedByEmail.ID != "u1" {
		t.Errorf("Failed to retrieve user by email: %v, %+v", err, fetchedByEmail)
	}

	// 4. Fetch Identity Mapping
	fetchedMapping, err := s.GetIdentityMapping(ctx, "google", "goog_1")
	if err != nil || fetchedMapping.CanonicalUserID != "u1" {
		t.Errorf("Failed to retrieve identity mapping: %v, %+v", err, fetchedMapping)
	}

	// 5. Update User
	user.DisplayName = "Alice Vance Senior"
	if err := s.UpdateUser(ctx, user); err != nil {
		t.Errorf("Failed to update user: %v", err)
	}
	updated, _ := s.GetUser(ctx, "u1")
	if updated.DisplayName != "Alice Vance Senior" {
		t.Errorf("Expected updated display name, got %s", updated.DisplayName)
	}
}

func TestMemoryStoreConversationAndMessages(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()

	conv := &models.Conversation{
		ID:        "c1",
		UserID:    "u1",
		Title:     "Contract Analysis",
		LegalMode: models.ModeContract,
		CreatedAt: time.Now().UTC().Add(-10 * time.Minute),
		UpdatedAt: time.Now().UTC().Add(-10 * time.Minute),
	}

	if err := s.CreateConversation(ctx, conv); err != nil {
		t.Fatalf("Failed to create conversation: %v", err)
	}

	t1 := time.Now().UTC().Add(-5 * time.Minute)
	t2 := time.Now().UTC().Add(-4 * time.Minute)

	msg1 := &models.Message{
		ID:             "m1",
		ConversationID: "c1",
		UserID:         "u1",
		Role:           "user",
		Content:        "What are the terms?",
		Status:         models.StatusCompleted,
		CreatedAt:      t1,
	}
	msg2 := &models.Message{
		ID:             "m2",
		ConversationID: "c1",
		UserID:         "u1",
		Role:           "assistant",
		Content:        "Notice period is 30 days.",
		Status:         models.StatusCompleted,
		CreatedAt:      t2,
	}

	_ = s.CreateMessage(ctx, msg1)
	_ = s.CreateMessage(ctx, msg2)

	// List messages with limit
	msgs, err := s.ListMessages(ctx, "c1", 10)
	if err != nil || len(msgs) != 2 {
		t.Fatalf("Expected 2 messages, got %d, err: %v", len(msgs), err)
	}

	if msgs[0].ID != "m1" || msgs[1].ID != "m2" {
		t.Errorf("Messages out of chronological order: %s, %s", msgs[0].ID, msgs[1].ID)
	}

	// Test pagination limit
	oneMsg, err := s.ListMessages(ctx, "c1", 1)
	if err != nil || len(oneMsg) != 1 || oneMsg[0].ID != "m2" {
		t.Errorf("Expected most recent message with limit=1, got: %+v", oneMsg)
	}

	// Delete conversation
	if err := s.DeleteConversation(ctx, "c1", "u1"); err != nil {
		t.Errorf("Failed to delete conversation: %v", err)
	}

	// Confirm messages were cleaned up
	emptyMsgs, _ := s.ListMessages(ctx, "c1", 10)
	if len(emptyMsgs) != 0 {
		t.Errorf("Expected messages to be deleted with conversation, got: %d", len(emptyMsgs))
	}
}

func TestMemoryStoreDocumentsAndCascadeDeletion(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()

	user := &models.CanonicalUser{
		ID:              "u2",
		Email:           "bob@counsel.law",
		NormalizedEmail: "bob@counsel.law",
	}
	mapping := &models.IdentityMapping{
		Provider:        "demo",
		ProviderSubject: "bob_demo",
		CanonicalUserID: "u2",
	}
	_ = s.CreateUserWithIdentity(ctx, user, mapping)

	doc := &models.Document{
		ID:        "d1",
		UserID:    "u2",
		Name:      "Agreement.pdf",
		SizeBytes: 1024,
		PageCount: 5,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.CreateDocument(ctx, doc); err != nil {
		t.Fatalf("Failed to create document: %v", err)
	}

	conv := &models.Conversation{
		ID:     "c2",
		UserID: "u2",
	}
	_ = s.CreateConversation(ctx, conv)

	// Delete user must clean up identity, conversations, documents
	if err := s.DeleteUser(ctx, "u2"); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	if _, err := s.GetUser(ctx, "u2"); err != ErrNotFound {
		t.Errorf("Expected ErrNotFound for user, got %v", err)
	}
	if _, err := s.GetIdentityMapping(ctx, "demo", "bob_demo"); err != ErrNotFound {
		t.Errorf("Expected ErrNotFound for identity, got %v", err)
	}
	if _, err := s.GetDocument(ctx, "d1"); err != ErrNotFound {
		t.Errorf("Expected ErrNotFound for document, got %v", err)
	}
	if _, err := s.GetConversation(ctx, "c2"); err != ErrNotFound {
		t.Errorf("Expected ErrNotFound for conversation, got %v", err)
	}
}
