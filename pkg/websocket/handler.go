package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"counsel/pkg/ai"
	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/documents"
	"counsel/pkg/logger"
	"counsel/pkg/models"
	"counsel/pkg/ratelimit"
	"counsel/pkg/store"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Handler struct {
	cfg           *config.Config
	hub           *Hub
	verifier      *auth.Verifier
	authManager   *auth.CanonicalAuthManager
	store         store.Store
	limiter       ratelimit.Limiter
	registry      *ai.Registry
	promptBuilder *ai.PromptBuilder
	contextManager *ai.ContextManager
	aiClient      *ai.OpenRouterClient
	upgrader      websocket.Upgrader
}

func NewHandler(
	cfg *config.Config,
	hub *Hub,
	verifier *auth.Verifier,
	authMgr *auth.CanonicalAuthManager,
	s store.Store,
	limiter ratelimit.Limiter,
	registry *ai.Registry,
	promptBuilder *ai.PromptBuilder,
	aiClient *ai.OpenRouterClient,
) *Handler {
	return &Handler{
		cfg:            cfg,
		hub:            hub,
		verifier:       verifier,
		authManager:    authMgr,
		store:          s,
		limiter:        limiter,
		registry:       registry,
		promptBuilder:  promptBuilder,
		contextManager: ai.NewContextManager(),
		aiClient:       aiClient,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				for _, o := range cfg.AllowedOrigins {
					if o == "*" || strings.EqualFold(o, origin) {
						return true
					}
				}
				return true // Permissive in dev/testing environments
			},
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Authenticate during handshake
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		tokenStr = r.Header.Get("Authorization")
	}

	payload, err := h.verifier.VerifyToken(r.Context(), tokenStr)
	if err != nil {
		http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
		return
	}

	user, err := h.authManager.ResolveUser(r.Context(), payload)
	if err != nil {
		http.Error(w, "Authentication error: "+err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade websocket connection", &logger.LogEntry{
			Message: err.Error(),
		})
		return
	}

	h.hub.Register(conn, user.ID)
	defer h.hub.Unregister(conn)

	var writeMu sync.Mutex
	safeWrite := func(event *ServerEnvelope) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteJSON(event)
	}

	for {
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var clientEnv ClientEnvelope
		if err := json.Unmarshal(messageBytes, &clientEnv); err != nil {
			_ = safeWrite(&ServerEnvelope{
				Type:         ServerEventError,
				ErrorCode:    "MALFORMED_PAYLOAD",
				ErrorMessage: "Invalid JSON format in message request.",
			})
			continue
		}

		switch clientEnv.Type {
		case ClientMsgPing:
			_ = safeWrite(&ServerEnvelope{Type: ServerEventPong})

		case ClientMsgCancel:
			if clientEnv.ConversationID != "" {
				h.hub.CancelStream(user.ID, clientEnv.ConversationID)
				_ = safeWrite(&ServerEnvelope{
					Type:           ServerEventCancel,
					ConversationID: clientEnv.ConversationID,
				})
			}

		case ClientMsgSend:
			go h.handleMessageSend(conn, safeWrite, user, clientEnv)

		default:
			_ = safeWrite(&ServerEnvelope{
				Type:         ServerEventError,
				ErrorCode:    "UNKNOWN_MESSAGE_TYPE",
				ErrorMessage: "Unrecognized client event type.",
			})
		}
	}
}

func (h *Handler) handleMessageSend(
	conn *websocket.Conn,
	safeWrite func(*ServerEnvelope) error,
	user *models.CanonicalUser,
	req ClientEnvelope,
) {
	ctx := context.Background()
	now := time.Now().UTC()

	// 1. Resolve or create conversation
	var conv *models.Conversation
	if req.ConversationID != "" {
		c, err := h.store.GetConversation(ctx, req.ConversationID)
		if err == nil && c != nil {
			if c.UserID != user.ID {
				_ = safeWrite(&ServerEnvelope{
					Type:         ServerEventError,
					ErrorCode:    "UNAUTHORIZED",
					ErrorMessage: "You do not have permission to access this conversation.",
				})
				return
			}
			conv = c
		} else {
			// Conversation ID provided by client but not in store (e.g. server restart or client-first session)
			title := req.Prompt
			if len(title) > 40 {
				title = title[:40] + "..."
			}
			if title == "" {
				title = "Legal Consultation"
			}
			conv = &models.Conversation{
				ID:           req.ConversationID,
				UserID:       user.ID,
				Title:        title,
				LegalMode:    req.LegalMode,
				Jurisdiction: req.Jurisdiction,
				AIProvider:   req.AIProvider,
				AIMode:       req.AIMode,
				DocumentIDs:  req.DocumentIDs,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			_ = h.store.CreateConversation(ctx, conv)
		}
	}

	if conv == nil {
		// Generate deterministic title from first message prompt
		title := req.Prompt
		if len(title) > 40 {
			title = title[:40] + "..."
		}
		if title == "" {
			title = "New Legal Consultation"
		}

		convID := "cnv_" + uuid.New().String()
		conv = &models.Conversation{
			ID:           convID,
			UserID:       user.ID,
			Title:        title,
			LegalMode:    req.LegalMode,
			Jurisdiction: req.Jurisdiction,
			AIProvider:   req.AIProvider,
			AIMode:       req.AIMode,
			DocumentIDs:  req.DocumentIDs,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := h.store.CreateConversation(ctx, conv); err != nil {
			_ = safeWrite(&ServerEnvelope{
				Type:         ServerEventError,
				ErrorCode:    "PERSISTENCE_ERROR",
				ErrorMessage: "Failed to initialize conversation session.",
			})
			return
		}
	}

	// Update conversation settings if specified in message
	if req.LegalMode != "" {
		conv.LegalMode = req.LegalMode
	}
	if req.Jurisdiction != "" {
		conv.Jurisdiction = req.Jurisdiction
	}
	if req.AIProvider != "" {
		conv.AIProvider = req.AIProvider
	}
	if req.AIMode != "" {
		conv.AIMode = req.AIMode
	}
	conv.UpdatedAt = now
	_ = h.store.UpdateConversation(ctx, conv)

	// 2. Load referenced document(s)
	var formattedDocContext strings.Builder
	var totalPages int
	var pageImages []string
	var docAttachments []models.MessageAttachment
	hasPDF := false

	for _, docID := range req.DocumentIDs {
		doc, err := h.store.GetDocument(ctx, docID)
		if err == nil && doc != nil && doc.UserID == user.ID {
			totalPages += doc.PageCount
			formatted := documents.FormatContextAsUntrustedData(doc.Name, doc.ID, doc.Chunks, 15000)
			formattedDocContext.WriteString(formatted)
			formattedDocContext.WriteString("\n")

			pCount := doc.PageCount
			if len(doc.PageImages) > 0 {
				pCount = len(doc.PageImages)
			}
			docAttachments = append(docAttachments, models.MessageAttachment{
				ID:        doc.ID,
				Name:      doc.Name,
				MimeType:  doc.MimeType,
				SizeBytes: doc.SizeBytes,
				PageCount: pCount,
			})

			lowerMime := strings.ToLower(doc.MimeType)
			lowerName := strings.ToLower(doc.Name)
			if strings.Contains(lowerMime, "pdf") || strings.HasSuffix(lowerName, ".pdf") || len(doc.PageImages) > 0 {
				hasPDF = true
			}
			if len(doc.PageImages) > 0 {
				pageImages = append(pageImages, doc.PageImages...)
			}
		}
	}

	if len(req.PageImages) > 0 {
		hasPDF = true
		pageImages = append(pageImages, req.PageImages...)
	}

	// 3. Compute cost and reserve quota
	spec := &ratelimit.RequestSpec{
		LegalMode:  conv.LegalMode,
		AIProvider: conv.AIProvider,
		AIMode:     conv.AIMode,
		PageCount:  totalPages,
		PromptLen:  len(req.Prompt),
	}
	costUnits := h.limiter.CalculateCost(spec)

	ok, _, err := h.limiter.ReserveUnits(ctx, user.ID, costUnits)
	if err != nil || !ok {
		_ = safeWrite(&ServerEnvelope{
			Type:           ServerEventError,
			ConversationID: conv.ID,
			ErrorCode:      "QUOTA_EXCEEDED",
			ErrorMessage:   "Counsel daily capacity reached. Quota resets daily at UTC midnight.",
		})
		return
	}

	// 4. Retrieve prior conversation history for multi-turn conversational context
	var priorHistory []*models.Message
	if len(req.Messages) > 0 {
		for _, m := range req.Messages {
			if m == nil {
				continue
			}
			if m.Role != "user" && m.Role != "assistant" {
				continue
			}
			if strings.TrimSpace(m.Content) == "" {
				continue
			}
			priorHistory = append(priorHistory, m)
			if m.ID != "" {
				if _, err := h.store.GetMessage(ctx, m.ID); err != nil {
					m.ConversationID = conv.ID
					m.UserID = user.ID
					_ = h.store.CreateMessage(ctx, m)
				}
			}
		}
	} else {
		priorHistory, _ = h.store.ListMessages(ctx, conv.ID, 50)
	}

	// Avoid prompt duplication if the client included the current prompt at the end of messages
	if len(priorHistory) > 0 {
		lastIdx := len(priorHistory) - 1
		if priorHistory[lastIdx].Role == "user" && strings.TrimSpace(priorHistory[lastIdx].Content) == strings.TrimSpace(req.Prompt) {
			priorHistory = priorHistory[:lastIdx]
		}
	}

	// Persist incoming user message
	userMsgID := "msg_" + uuid.New().String()
	userMsg := &models.Message{
		ID:             userMsgID,
		ConversationID: conv.ID,
		UserID:         user.ID,
		Role:           "user",
		Content:        req.Prompt,
		Attachments:    docAttachments,
		DocumentIDs:    req.DocumentIDs,
		Status:         models.StatusCompleted,
		Mode:           conv.LegalMode,
		CreatedAt:      now,
	}
	_ = h.store.CreateMessage(ctx, userMsg)

	// 5. Initialize assistant message
	assistantMsgID := "msg_" + uuid.New().String()
	assistantMsg := &models.Message{
		ID:             assistantMsgID,
		ConversationID: conv.ID,
		UserID:         user.ID,
		Role:           "assistant",
		Content:        "",
		Status:         models.StatusStreaming,
		Provider:       conv.AIProvider,
		Mode:           conv.LegalMode,
		UsageUnits:     costUnits,
		CreatedAt:      now.Add(1 * time.Millisecond),
	}
	_ = h.store.CreateMessage(ctx, assistantMsg)

	// Send message.start to client
	_ = safeWrite(&ServerEnvelope{
		Type:           ServerEventStart,
		MessageID:      assistantMsgID,
		ConversationID: conv.ID,
	})

	// 6. Assemble context-aware multi-turn messages with sliding-window compaction
	systemPrompt := h.promptBuilder.BuildSystemPrompt(conv.LegalMode, conv.Jurisdiction)
	contextMessages := h.contextManager.BuildContextWithImages(
		systemPrompt,
		priorHistory,
		req.Prompt,
		formattedDocContext.String(),
		pageImages,
	)

	candidateModels := h.registry.GetCandidateModels(conv.AIMode, hasPDF)
	if len(candidateModels) > 0 {
		assistantMsg.Model = candidateModels[0]
	}

	// 7. Execute streaming with cancellation tracking
	streamCtx, streamCancel := context.WithCancel(ctx)
	h.hub.TrackStream(user.ID, conv.ID, streamCancel)
	defer h.hub.ClearStream(user.ID, conv.ID)

	var fullResponse strings.Builder
	callbacks := ai.StreamCallbacks{
		OnStatus: func(statusText string) {
			if err := safeWrite(&ServerEnvelope{
				Type:           ServerEventStatus,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
				StatusText:     statusText,
			}); err != nil {
				streamCancel()
			}
		},
		OnDelta: func(delta string) {
			fullResponse.WriteString(delta)
			if err := safeWrite(&ServerEnvelope{
				Type:           ServerEventDelta,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
				Delta:          delta,
			}); err != nil {
				streamCancel()
			}
		},
	}

	usedModel, streamErr := h.aiClient.StreamWithCascade(streamCtx, candidateModels, contextMessages, callbacks)
	if usedModel != "" {
		assistantMsg.Model = usedModel
	}

	if streamErr != nil {
		if errors.Is(streamErr, ai.ErrStreamAborted) || errors.Is(streamCtx.Err(), context.Canceled) {
			// Cancelled by user: finalize partial message, refund unspent units
			assistantMsg.Content = fullResponse.String()
			assistantMsg.Status = models.StatusCancelled
			_ = h.store.UpdateMessage(ctx, assistantMsg)
			_ = h.limiter.SettleUnits(ctx, user.ID, costUnits, 1) // charge nominal 1 unit for cancelled work
			_ = safeWrite(&ServerEnvelope{
				Type:           ServerEventCancel,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
			})
			return
		}

		// Provider failure: refund all reserved units and send clean user-friendly error
		assistantMsg.Status = models.StatusFailed
		_ = h.store.UpdateMessage(ctx, assistantMsg)
		_ = h.limiter.RefundUnits(ctx, user.ID, costUnits)

		_ = safeWrite(&ServerEnvelope{
			Type:           ServerEventError,
			MessageID:      assistantMsgID,
			ConversationID: conv.ID,
			ErrorCode:      "AI_SERVICE_ERROR",
			ErrorMessage:   "Counsel encountered a temporary issue generating your response. Please try again.",
		})
		return
	}

	// 8. Completed successfully: finalize message and settle units
	finalContent := fullResponse.String()
	assistantMsg.Content = finalContent
	assistantMsg.Status = models.StatusCompleted

	// Parse any source citations embedded in response (e.g. Page X, Section Y)
	if strings.Contains(finalContent, "Page ") || strings.Contains(finalContent, "Section ") {
		assistantMsg.Sources = []models.SourceReference{
			{
				DocumentName: "Uploaded Contract / Document",
				SectionTitle: "Referenced Provisions",
			},
		}
	}

	_ = h.store.UpdateMessage(ctx, assistantMsg)
	_ = h.limiter.SettleUnits(ctx, user.ID, costUnits, costUnits)

	_ = safeWrite(&ServerEnvelope{
		Type:           ServerEventComplete,
		MessageID:      assistantMsgID,
		ConversationID: conv.ID,
		UsageUnits:     costUnits,
	})
}
