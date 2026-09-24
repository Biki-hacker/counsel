package websocket

import "counsel/pkg/models"

// Client-to-server message types
const (
	ClientMsgSend   = "message.send"
	ClientMsgCancel = "message.cancel"
	ClientMsgPing   = "ping"
)

// Server-to-client event types
const (
	ServerEventStart    = "message.start"
	ServerEventStatus   = "message.status"
	ServerEventDelta    = "message.delta"
	ServerEventSource   = "message.source"
	ServerEventComplete = "message.complete"
	ServerEventError    = "message.error"
	ServerEventCancel   = "message.cancel"
	ServerEventPong     = "pong"
)

type ClientEnvelope struct {
	Type           string              `json:"type"`
	ConversationID string              `json:"conversationId,omitempty"`
	Prompt         string              `json:"prompt,omitempty"`
	LegalMode      models.LegalMode    `json:"legalMode,omitempty"`
	Jurisdiction   models.Jurisdiction `json:"jurisdiction,omitempty"`
	AIProvider     models.AIProvider   `json:"aiProvider,omitempty"`
	AIMode         models.AIMode       `json:"aiMode,omitempty"`
	DocumentIDs    []string            `json:"documentIds,omitempty"`
	PageImages     []string            `json:"pageImages,omitempty"`
}

type ServerEnvelope struct {
	Type           string                  `json:"type"`
	MessageID      string                  `json:"messageId,omitempty"`
	ConversationID string                  `json:"conversationId,omitempty"`
	StatusText     string                  `json:"statusText,omitempty"`
	Delta          string                  `json:"delta,omitempty"`
	Source         *models.SourceReference `json:"source,omitempty"`
	UsageUnits     int                     `json:"usageUnits,omitempty"`
	ErrorCode      string                  `json:"errorCode,omitempty"`
	ErrorMessage   string                  `json:"errorMessage,omitempty"`
}
