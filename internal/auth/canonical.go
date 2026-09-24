package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"counsel/internal/models"
	"counsel/internal/store"

	"github.com/google/uuid"
)

var (
	ErrAccountConflict = errors.New("an account already exists with this email using another sign-in method")
	ErrInvalidProvider = errors.New("unsupported authentication provider")
)

// IdentityPayload is the verified payload from Firebase, Supabase, or Demo auth.
type IdentityPayload struct {
	Provider        string // "firebase", "supabase", "demo"
	ProviderSubject string
	Email           string
	DisplayName     string
	PhotoURL        string
}

// CanonicalAuthManager coordinates identity resolution across providers.
type CanonicalAuthManager struct {
	store store.Store
}

// NewCanonicalAuthManager initializes a new canonical auth manager.
func NewCanonicalAuthManager(s store.Store) *CanonicalAuthManager {
	return &CanonicalAuthManager{store: s}
}

// ResolveUser implements the rigorous canonical identity resolution (Cases A through I).
func (m *CanonicalAuthManager) ResolveUser(ctx context.Context, payload *IdentityPayload) (*models.CanonicalUser, error) {
	if payload.Provider == "" || payload.ProviderSubject == "" {
		return nil, errors.New("missing provider or subject in identity payload")
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(payload.Email))

	// Step 1: Check if an identity mapping exists for this provider:subject
	mapping, err := m.store.GetIdentityMapping(ctx, payload.Provider, payload.ProviderSubject)
	if err == nil && mapping != nil {
		// Case B: Same user signs in again
		user, err := m.store.GetUser(ctx, mapping.CanonicalUserID)
		if err == nil && user != nil {
			// Case H: User record exists, patch missing fields without overwriting valid data
			patched := false
			if (user.DisplayName == "" || user.DisplayName == "Counsel Demo User") && payload.DisplayName != "" && payload.DisplayName != "Counsel Demo User" {
				user.DisplayName = payload.DisplayName
				patched = true
			}
			if user.PhotoURL == "" && payload.PhotoURL != "" {
				user.PhotoURL = payload.PhotoURL
				patched = true
			}
			if patched {
				_ = m.store.UpdateUser(ctx, user)
			}
			return user, nil
		}

		// Case G: Identity mapping exists but user document is missing -> recreate canonical user
		now := time.Now().UTC()
		newUser := &models.CanonicalUser{
			ID:                mapping.CanonicalUserID,
			Email:             payload.Email,
			NormalizedEmail:   normalizedEmail,
			DisplayName:       payload.DisplayName,
			PhotoURL:          payload.PhotoURL,
			Jurisdiction:      models.JurisdictionGeneral,
			PreferredProvider: models.ProviderNvidia,
			ThinkingDefault:   false,
			Theme:             "system",
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		if err := m.store.UpdateUser(ctx, newUser); err != nil {
			// Try creating if update failed
			_ = m.store.CreateUserWithIdentity(ctx, newUser, mapping)
		}
		return newUser, nil
	}

	// Step 2: Mapping does NOT exist. Check if an account already exists with this email.
	existingUser, err := m.store.GetUserByEmail(ctx, normalizedEmail)
	if err == nil && existingUser != nil {
		// If the sign-in is via Google or Demo and matches an existing account with the same email,
		// link identity to the existing canonical user instead of locking them out with a conflict.
		if payload.Provider == "google" || payload.Provider == "demo" {
			newMapping := &models.IdentityMapping{
				Provider:        payload.Provider,
				ProviderSubject: payload.ProviderSubject,
				CanonicalUserID: existingUser.ID,
				CreatedAt:       time.Now().UTC(),
				UpdatedAt:       time.Now().UTC(),
			}
			_ = m.store.CreateIdentityMapping(ctx, newMapping)
			return existingUser, nil
		}

		// Case C & D: An account exists with this email under a DIFFERENT provider.
		// Never blindly merge or overwrite!
		return nil, ErrAccountConflict
	}

	// Case A: First time user sign-in. Create canonical Counsel user.
	now := time.Now().UTC()
	canonicalID := "csl_" + uuid.New().String()
	newUser := &models.CanonicalUser{
		ID:                canonicalID,
		Email:             payload.Email,
		NormalizedEmail:   normalizedEmail,
		DisplayName:       payload.DisplayName,
		PhotoURL:          payload.PhotoURL,
		Jurisdiction:      models.JurisdictionGeneral,
		PreferredProvider: models.ProviderNvidia,
		ThinkingDefault:   false,
		Theme:             "system",
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	newMapping := &models.IdentityMapping{
		Provider:        payload.Provider,
		ProviderSubject: payload.ProviderSubject,
		CanonicalUserID: canonicalID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := m.store.CreateUserWithIdentity(ctx, newUser, newMapping); err != nil {
		return nil, err
	}

	return newUser, nil
}

// LinkAccount explicitly links a second provider to an authenticated canonical user.
func (m *CanonicalAuthManager) LinkAccount(ctx context.Context, canonicalUserID string, payload *IdentityPayload) error {
	user, err := m.store.GetUser(ctx, canonicalUserID)
	if err != nil {
		return err
	}

	// Case E: Check if this new provider:subject is already linked to another canonical user
	existingMapping, err := m.store.GetIdentityMapping(ctx, payload.Provider, payload.ProviderSubject)
	if err == nil && existingMapping != nil {
		if existingMapping.CanonicalUserID != user.ID {
			return errors.New("this identity is already linked to a different Counsel account")
		}
		return nil // Already linked
	}

	now := time.Now().UTC()
	newMapping := &models.IdentityMapping{
		Provider:        payload.Provider,
		ProviderSubject: payload.ProviderSubject,
		CanonicalUserID: user.ID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	return m.store.CreateIdentityMapping(ctx, newMapping)
}
