package models

import "time"

// LegalMode defines the specific mode of legal assistance requested.
type LegalMode string

const (
	ModeContract   LegalMode = "contract"
	ModeCriminal   LegalMode = "criminal"
	ModeCivil      LegalMode = "civil"
	ModeClause     LegalMode = "clause"
	ModeDocReview  LegalMode = "doc_review"
	ModeCompare    LegalMode = "compare"
	ModePrepLawyer LegalMode = "prep_lawyer"
	ModeGeneral    LegalMode = "general"
)

// Jurisdiction represents the target legal jurisdiction.
type Jurisdiction string

const (
	JurisdictionIndia   Jurisdiction = "in"
	JurisdictionUS      Jurisdiction = "us"
	JurisdictionUK      Jurisdiction = "uk"
	JurisdictionEU      Jurisdiction = "eu"
	JurisdictionGeneral Jurisdiction = "general"
)

// AIProvider represents the selected model provider.
type AIProvider string

const (
	ProviderGoogle AIProvider = "google"
	ProviderNvidia AIProvider = "nvidia"
)

// AIMode represents the reasoning effort level.
type AIMode string

const (
	AIModeNormal   AIMode = "normal"
	AIModeThinking AIMode = "thinking"
)

// CanonicalUser is the unified user identity across Firebase and Supabase.
type CanonicalUser struct {
	ID                string       `json:"id"`
	Email             string       `json:"email"`
	NormalizedEmail   string       `json:"normalizedEmail"`
	DisplayName       string       `json:"displayName"`
	PhotoURL          string       `json:"photoUrl,omitempty"`
	Jurisdiction      Jurisdiction `json:"jurisdiction"`
	PreferredProvider AIProvider   `json:"preferredProvider"`
	ThinkingDefault   bool         `json:"thinkingDefault"`
	Theme             string       `json:"theme"` // "light", "dark", "system"
	CreatedAt         time.Time    `json:"createdAt"`
	UpdatedAt         time.Time    `json:"updatedAt"`
}

// IdentityMapping links an external auth provider subject to a canonical user ID.
type IdentityMapping struct {
	Provider        string    `json:"provider"` // "firebase" or "supabase"
	ProviderSubject string    `json:"providerSubject"`
	CanonicalUserID string    `json:"canonicalUserId"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// SourceReference captures grounded citations pointing directly to clauses and pages.
type SourceReference struct {
	DocumentID   string `json:"documentId"`
	DocumentName string `json:"documentName"`
	PageNumber   int    `json:"pageNumber,omitempty"`
	SectionTitle string `json:"sectionTitle,omitempty"`
	Snippet      string `json:"snippet,omitempty"`
}

// MessageStatus represents the lifecycle of an AI response.
type MessageStatus string

const (
	StatusPending   MessageStatus = "pending"
	StatusStreaming MessageStatus = "streaming"
	StatusCompleted MessageStatus = "completed"
	StatusFailed    MessageStatus = "failed"
	StatusCancelled MessageStatus = "cancelled"
)

// MessageAttachment captures lightweight attachment metadata stored on a message.
type MessageAttachment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MimeType  string `json:"mimeType,omitempty"`
	SizeBytes int64  `json:"sizeBytes,omitempty"`
	PageCount int    `json:"pageCount,omitempty"`
}

// Message is an individual turn in a conversation.
type Message struct {
	ID             string              `json:"id"`
	ConversationID string              `json:"conversationId"`
	UserID         string              `json:"userId"`
	Role           string              `json:"role"` // "user", "assistant", "system"
	Content        string              `json:"content"`
	Attachments    []MessageAttachment `json:"attachments,omitempty"`
	DocumentIDs    []string            `json:"documentIds,omitempty"`
	Sources        []SourceReference   `json:"sources,omitempty"`
	UsageUnits     int                 `json:"usageUnits,omitempty"`
	Status         MessageStatus       `json:"status"`
	Model          string              `json:"model,omitempty"`
	Provider       AIProvider          `json:"provider,omitempty"`
	Mode           LegalMode           `json:"mode,omitempty"`
	CreatedAt      time.Time           `json:"createdAt"`
}

// Conversation is a threaded discussion with legal context.
type Conversation struct {
	ID           string       `json:"id"`
	UserID       string       `json:"userId"`
	Title        string       `json:"title"`
	LegalMode    LegalMode    `json:"legalMode"`
	Jurisdiction Jurisdiction `json:"jurisdiction"`
	AIProvider   AIProvider   `json:"aiProvider"`
	AIMode       AIMode       `json:"aiMode"`
	DocumentIDs  []string     `json:"documentIds,omitempty"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

// DocumentChunk is an indexable segment of a legal document for grounded context.
type DocumentChunk struct {
	ID            string `json:"id"`
	DocumentID    string `json:"documentId"`
	PageNumber    int    `json:"pageNumber"`
	SectionTitle  string `json:"sectionTitle,omitempty"`
	Content       string `json:"content"`
	TokenEstimate int    `json:"tokenEstimate"`
}

// Document represents an uploaded contract, NDA, or legal document.
type Document struct {
	ID                  string          `json:"id"`
	UserID              string          `json:"userId"`
	Name                string          `json:"name"`
	MimeType            string          `json:"mimeType"`
	SizeBytes           int64           `json:"sizeBytes"`
	PageCount           int             `json:"pageCount"`
	ExtractedTextLength int             `json:"extractedTextLength"`
	ExtractionStatus    string          `json:"extractionStatus"` // "success", "partial", "failed"
	Chunks              []DocumentChunk `json:"chunks,omitempty"`
	PageImages          []string        `json:"pageImages,omitempty"`
	CreatedAt           time.Time       `json:"createdAt"`
}

// UsageQuota tracks daily weighted unit consumption per user.
type UsageQuota struct {
	UserID         string    `json:"userId"`
	DailyAllowance int       `json:"dailyAllowance"`
	UsedToday      int       `json:"usedToday"`
	ReservedUnits  int       `json:"reservedUnits"`
	ResetAt        time.Time `json:"resetAt"`
}

// WebSocketIncomingMessage is sent by the client.
type WebSocketIncomingMessage struct {
	Type           string       `json:"type"` // "message.send", "message.cancel"
	ConversationID string       `json:"conversationId"`
	Prompt         string       `json:"prompt"`
	Messages       []*Message   `json:"messages,omitempty"`
	LegalMode      LegalMode    `json:"legalMode"`
	Jurisdiction   Jurisdiction `json:"jurisdiction"`
	AIProvider     AIProvider   `json:"aiProvider"`
	AIMode         AIMode       `json:"aiMode"`
	DocumentIDs    []string     `json:"documentIds,omitempty"`
	PageImages     []string     `json:"pageImages,omitempty"`
}

// WebSocketEvent is pushed from the server to the client.
type WebSocketEvent struct {
	Type           string           `json:"type"` // "message.start", "message.status", "message.delta", "message.source", "message.complete", "message.error", "message.cancel"
	MessageID      string           `json:"messageId,omitempty"`
	ConversationID string           `json:"conversationId,omitempty"`
	StatusText     string           `json:"statusText,omitempty"` // e.g. "Analyzing document..."
	Delta          string           `json:"delta,omitempty"`
	Source         *SourceReference `json:"source,omitempty"`
	UsageUnits     int              `json:"usageUnits,omitempty"`
	ErrorCode      string           `json:"errorCode,omitempty"`
	ErrorMessage   string           `json:"errorMessage,omitempty"`
}
