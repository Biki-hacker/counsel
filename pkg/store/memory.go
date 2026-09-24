package store

import (
	"context"
	"sort"
	"sync"
	"time"

	"counsel/pkg/models"
)

// MemoryStore provides a high-fidelity, thread-safe in-memory store.
type MemoryStore struct {
	mu            sync.RWMutex
	users         map[string]*models.CanonicalUser
	emailIndex    map[string]string // normalizedEmail -> userId
	identities    map[string]*models.IdentityMapping // provider:subject -> mapping
	conversations map[string]*models.Conversation
	messages      map[string]*models.Message
	documents     map[string]*models.Document
	usages        map[string]*models.UsageQuota
}

// NewMemoryStore initializes an empty memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:         make(map[string]*models.CanonicalUser),
		emailIndex:    make(map[string]string),
		identities:    make(map[string]*models.IdentityMapping),
		conversations: make(map[string]*models.Conversation),
		messages:      make(map[string]*models.Message),
		documents:     make(map[string]*models.Document),
		usages:        make(map[string]*models.UsageQuota),
	}
}

func (s *MemoryStore) GetUser(ctx context.Context, id string) (*models.CanonicalUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *u
	return &clone, nil
}

func (s *MemoryStore) GetUserByEmail(ctx context.Context, normalizedEmail string) (*models.CanonicalUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	userID, ok := s.emailIndex[normalizedEmail]
	if !ok {
		return nil, ErrNotFound
	}
	u, ok := s.users[userID]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *u
	return &clone, nil
}

func (s *MemoryStore) GetIdentityMapping(ctx context.Context, provider, subject string) (*models.IdentityMapping, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	key := provider + ":" + subject
	m, ok := s.identities[key]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *m
	return &clone, nil
}

func (s *MemoryStore) CreateUserWithIdentity(ctx context.Context, user *models.CanonicalUser, mapping *models.IdentityMapping) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := mapping.Provider + ":" + mapping.ProviderSubject
	if _, exists := s.identities[key]; exists {
		return ErrAlreadyExists
	}
	if _, exists := s.users[user.ID]; exists {
		return ErrAlreadyExists
	}
	if existingUID, exists := s.emailIndex[user.NormalizedEmail]; exists && existingUID != user.ID {
		return ErrConflict
	}

	uClone := *user
	mClone := *mapping
	s.users[user.ID] = &uClone
	s.identities[key] = &mClone
	s.emailIndex[user.NormalizedEmail] = user.ID
	return nil
}

func (s *MemoryStore) CreateIdentityMapping(ctx context.Context, mapping *models.IdentityMapping) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := mapping.Provider + ":" + mapping.ProviderSubject
	if _, exists := s.identities[key]; exists {
		return ErrAlreadyExists
	}
	mClone := *mapping
	s.identities[key] = &mClone
	return nil
}

func (s *MemoryStore) UpdateUser(ctx context.Context, user *models.CanonicalUser) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.users[user.ID]; !exists {
		return ErrNotFound
	}
	uClone := *user
	uClone.UpdatedAt = time.Now().UTC()
	s.users[user.ID] = &uClone
	return nil
}

func (s *MemoryStore) DeleteUser(ctx context.Context, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok {
		return ErrNotFound
	}

	delete(s.emailIndex, user.NormalizedEmail)
	delete(s.users, userID)
	delete(s.usages, userID)

	// Clean identities
	for k, v := range s.identities {
		if v.CanonicalUserID == userID {
			delete(s.identities, k)
		}
	}

	// Clean conversations & their messages
	for cid, conv := range s.conversations {
		if conv.UserID == userID {
			delete(s.conversations, cid)
			for mid, msg := range s.messages {
				if msg.ConversationID == cid {
					delete(s.messages, mid)
				}
			}
		}
	}

	// Clean documents
	for did, doc := range s.documents {
		if doc.UserID == userID {
			delete(s.documents, did)
		}
	}

	return nil
}

func (s *MemoryStore) CreateConversation(ctx context.Context, conv *models.Conversation) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cClone := *conv
	s.conversations[conv.ID] = &cClone
	return nil
}

func (s *MemoryStore) GetConversation(ctx context.Context, id string) (*models.Conversation, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.conversations[id]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *c
	return &clone, nil
}

func (s *MemoryStore) ListConversations(ctx context.Context, userID string, limit int) ([]*models.Conversation, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*models.Conversation
	for _, c := range s.conversations {
		if c.UserID == userID {
			clone := *c
			result = append(result, &clone)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].UpdatedAt.After(result[j].UpdatedAt)
	})

	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}

	return result, nil
}

func (s *MemoryStore) UpdateConversation(ctx context.Context, conv *models.Conversation) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conversations[conv.ID]; !ok {
		return ErrNotFound
	}
	cClone := *conv
	cClone.UpdatedAt = time.Now().UTC()
	s.conversations[conv.ID] = &cClone
	return nil
}

func (s *MemoryStore) DeleteConversation(ctx context.Context, id, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.conversations[id]
	if !ok {
		return ErrNotFound
	}
	if c.UserID != userID {
		return ErrUnauthorized
	}
	delete(s.conversations, id)
	for mid, msg := range s.messages {
		if msg.ConversationID == id {
			delete(s.messages, mid)
		}
	}
	return nil
}

func (s *MemoryStore) CreateMessage(ctx context.Context, msg *models.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	mClone := *msg
	s.messages[msg.ID] = &mClone
	return nil
}

func (s *MemoryStore) GetMessage(ctx context.Context, id string) (*models.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.messages[id]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *m
	return &clone, nil
}

func (s *MemoryStore) ListMessages(ctx context.Context, conversationID string, limit int) ([]*models.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*models.Message
	for _, m := range s.messages {
		if m.ConversationID == conversationID {
			clone := *m
			result = append(result, &clone)
		}
	}

	sort.SliceStable(result, func(i, j int) bool {
		if result[i].CreatedAt.Equal(result[j].CreatedAt) {
			return result[i].Role == "user" && result[j].Role == "assistant"
		}
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})

	if limit > 0 && len(result) > limit {
		// Return last 'limit' messages
		result = result[len(result)-limit:]
	}

	return result, nil
}

func (s *MemoryStore) UpdateMessage(ctx context.Context, msg *models.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.messages[msg.ID]; !ok {
		return ErrNotFound
	}
	mClone := *msg
	s.messages[msg.ID] = &mClone
	return nil
}

func (s *MemoryStore) CreateDocument(ctx context.Context, doc *models.Document) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	dClone := *doc
	s.documents[doc.ID] = &dClone
	return nil
}

func (s *MemoryStore) GetDocument(ctx context.Context, id string) (*models.Document, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.documents[id]
	if !ok {
		return nil, ErrNotFound
	}
	clone := *d
	return &clone, nil
}

func (s *MemoryStore) ListDocuments(ctx context.Context, userID string) ([]*models.Document, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*models.Document
	for _, d := range s.documents {
		if d.UserID == userID {
			clone := *d
			result = append(result, &clone)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})

	return result, nil
}

func (s *MemoryStore) DeleteDocument(ctx context.Context, id, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.documents[id]
	if !ok {
		return ErrNotFound
	}
	if d.UserID != userID {
		return ErrUnauthorized
	}
	delete(s.documents, id)
	return nil
}

func (s *MemoryStore) GetUsage(ctx context.Context, userID string) (*models.UsageQuota, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.usages[userID]
	if !ok {
		now := time.Now().UTC()
		midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
		return &models.UsageQuota{
			UserID:         userID,
			DailyAllowance: 100,
			UsedToday:      0,
			ReservedUnits:  0,
			ResetAt:        midnight,
		}, nil
	}
	clone := *u
	return &clone, nil
}

func (s *MemoryStore) UpdateUsage(ctx context.Context, usage *models.UsageQuota) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	uClone := *usage
	s.usages[usage.UserID] = &uClone
	return nil
}
