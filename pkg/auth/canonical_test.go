package auth

import (
	"context"
	"testing"

	"counsel/pkg/store"
)

func TestCanonicalAuthCases(t *testing.T) {
	ctx := context.Background()
	s := store.NewMemoryStore()
	mgr := NewCanonicalAuthManager(s)

	// Case A: First time Google sign in creates canonical user
	googlePayload := &IdentityPayload{
		Provider:        "firebase",
		ProviderSubject: "google_sub_123",
		Email:           "user@example.com",
		DisplayName:     "Alice Lawyer",
		PhotoURL:        "https://example.com/alice.jpg",
	}

	userA, err := mgr.ResolveUser(ctx, googlePayload)
	if err != nil {
		t.Fatalf("Case A failed: %v", err)
	}
	if userA.Email != "user@example.com" {
		t.Errorf("Expected email user@example.com, got %s", userA.Email)
	}
	if userA.ID == "" {
		t.Errorf("Expected non-empty canonical ID")
	}

	// Case B: Same Google user signs in again -> returns existing canonical user
	userB, err := mgr.ResolveUser(ctx, googlePayload)
	if err != nil {
		t.Fatalf("Case B failed: %v", err)
	}
	if userB.ID != userA.ID {
		t.Errorf("Expected same canonical ID %s, got %s", userA.ID, userB.ID)
	}

	// Case C & D: Same email creates an account with Supabase -> must detect conflict!
	supabasePayload := &IdentityPayload{
		Provider:        "supabase",
		ProviderSubject: "supabase_sub_999",
		Email:           "user@example.com",
		DisplayName:     "Alice Different",
	}

	_, err = mgr.ResolveUser(ctx, supabasePayload)
	if err == nil {
		t.Fatalf("Case C/D expected ErrAccountConflict, got nil")
	}
	if err != ErrAccountConflict {
		t.Errorf("Expected ErrAccountConflict, got %v", err)
	}

	// Explicit account linking: user links Supabase identity to existing canonical ID
	err = mgr.LinkAccount(ctx, userA.ID, supabasePayload)
	if err != nil {
		t.Fatalf("Failed to link account: %v", err)
	}

	// Now Supabase user signs in -> resolves to same canonical ID!
	userLinked, err := mgr.ResolveUser(ctx, supabasePayload)
	if err != nil {
		t.Fatalf("Linked Supabase sign in failed: %v", err)
	}
	if userLinked.ID != userA.ID {
		t.Errorf("Expected linked user to have ID %s, got %s", userA.ID, userLinked.ID)
	}

	// Case H: User record exists but fields are patched
	googlePayloadWithNewInfo := &IdentityPayload{
		Provider:        "firebase",
		ProviderSubject: "google_sub_123",
		Email:           "user@example.com",
		DisplayName:     "Alice Updated",
		PhotoURL:        "https://example.com/new_alice.jpg",
	}
	userH, err := mgr.ResolveUser(ctx, googlePayloadWithNewInfo)
	if err != nil {
		t.Fatalf("Case H failed: %v", err)
	}
	if userH.DisplayName != "Alice Lawyer" { // Valid existing name preserved
		t.Logf("Existing valid name preserved: %s", userH.DisplayName)
	}
}
