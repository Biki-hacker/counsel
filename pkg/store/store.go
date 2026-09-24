package store

import (
	"context"
	"errors"

	"counsel/pkg/models"
)

var (
	ErrNotFound       = errors.New("entity not found")
	ErrAlreadyExists  = errors.New("entity already exists")
	ErrUnauthorized   = errors.New("unauthorized access to entity")
	ErrConflict       = errors.New("identity conflict")
)

// Store defines the persistent storage operations required by Counsel.
type Store interface {
	// User & Identity
	GetUser(ctx context.Context, id string) (*models.CanonicalUser, error)
	GetUserByEmail(ctx context.Context, normalizedEmail string) (*models.CanonicalUser, error)
	GetIdentityMapping(ctx context.Context, provider, subject string) (*models.IdentityMapping, error)
	CreateUserWithIdentity(ctx context.Context, user *models.CanonicalUser, mapping *models.IdentityMapping) error
	CreateIdentityMapping(ctx context.Context, mapping *models.IdentityMapping) error
	UpdateUser(ctx context.Context, user *models.CanonicalUser) error
	DeleteUser(ctx context.Context, userID string) error

	// Conversations
	CreateConversation(ctx context.Context, conv *models.Conversation) error
	GetConversation(ctx context.Context, id string) (*models.Conversation, error)
	ListConversations(ctx context.Context, userID string, limit int) ([]*models.Conversation, error)
	UpdateConversation(ctx context.Context, conv *models.Conversation) error
	DeleteConversation(ctx context.Context, id, userID string) error

	// Messages
	CreateMessage(ctx context.Context, msg *models.Message) error
	GetMessage(ctx context.Context, id string) (*models.Message, error)
	ListMessages(ctx context.Context, conversationID string, limit int) ([]*models.Message, error)
	UpdateMessage(ctx context.Context, msg *models.Message) error

	// Documents
	CreateDocument(ctx context.Context, doc *models.Document) error
	GetDocument(ctx context.Context, id string) (*models.Document, error)
	ListDocuments(ctx context.Context, userID string) ([]*models.Document, error)
	DeleteDocument(ctx context.Context, id, userID string) error

	// Usage Quota
	GetUsage(ctx context.Context, userID string) (*models.UsageQuota, error)
	UpdateUsage(ctx context.Context, usage *models.UsageQuota) error
}
