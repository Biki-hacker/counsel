package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"counsel/pkg/ai"
	"counsel/pkg/auth"
	"counsel/pkg/config"
	"counsel/pkg/documents"
	"counsel/pkg/models"
	"counsel/pkg/ratelimit"
	"counsel/pkg/store"
	"counsel/pkg/websocket"

	"github.com/google/uuid"
)

type APIHandler struct {
	cfg            *config.Config
	store          store.Store
	limiter        ratelimit.Limiter
	verifier       *auth.Verifier
	authManager    *auth.CanonicalAuthManager
	registry       *ai.Registry
	promptBuilder  *ai.PromptBuilder
	contextManager *ai.ContextManager
	aiClient       *ai.OpenRouterClient
}

func NewAPIHandler(
	cfg *config.Config,
	s store.Store,
	limiter ratelimit.Limiter,
	verifier *auth.Verifier,
	authManager *auth.CanonicalAuthManager,
	registry *ai.Registry,
	promptBuilder *ai.PromptBuilder,
	aiClient *ai.OpenRouterClient,
) *APIHandler {
	if registry == nil {
		registry = ai.NewRegistry(cfg)
	}
	if promptBuilder == nil {
		promptBuilder = ai.NewPromptBuilder()
	}
	if aiClient == nil {
		cb := ai.NewKeyCircuitBreaker(cfg.OpenRouterKeyPrimary, cfg.OpenRouterKeySecondary)
		aiClient = ai.NewOpenRouterClient(cfg, cb)
	}

	return &APIHandler{
		cfg:            cfg,
		store:          s,
		limiter:        limiter,
		verifier:       verifier,
		authManager:    authManager,
		registry:       registry,
		promptBuilder:  promptBuilder,
		contextManager: ai.NewContextManager(),
		aiClient:       aiClient,
	}
}

// POST /api/v1/auth/session
func (h *APIHandler) HandleAuthSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		DisplayName string `json:"displayName,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		writeJSONError(w, http.StatusBadRequest, "INVALID_REQUEST", "Missing token parameter")
		return
	}

	payload, err := h.verifier.VerifyToken(r.Context(), req.Token)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", err.Error())
		return
	}

	if req.DisplayName != "" {
		payload.DisplayName = req.DisplayName
	}

	user, err := h.authManager.ResolveUser(r.Context(), payload)
	if err != nil {
		if errors.Is(err, auth.ErrAccountConflict) {
			writeJSONError(w, http.StatusConflict, "ACCOUNT_CONFLICT", "An account already exists with this email. Please sign in with your original method.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "AUTH_ERROR", "Failed to resolve canonical user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user": user,
	})
}

// GET /api/v1/me
func (h *APIHandler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	quota, _ := h.limiter.GetQuota(r.Context(), user.ID)

	writeJSON(w, http.StatusOK, map[string]any{
		"user":  user,
		"quota": quota,
	})
}

// PATCH /api/v1/me
func (h *APIHandler) HandleUpdateMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	var req struct {
		DisplayName       string              `json:"displayName,omitempty"`
		Jurisdiction      models.Jurisdiction `json:"jurisdiction,omitempty"`
		PreferredProvider models.AIProvider   `json:"preferredProvider,omitempty"`
		ThinkingDefault   *bool               `json:"thinkingDefault,omitempty"`
		Theme             string              `json:"theme,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid payload")
		return
	}

	if req.DisplayName != "" {
		user.DisplayName = req.DisplayName
	}
	if req.Jurisdiction != "" {
		user.Jurisdiction = req.Jurisdiction
	}
	if req.PreferredProvider != "" {
		user.PreferredProvider = req.PreferredProvider
	}
	if req.ThinkingDefault != nil {
		user.ThinkingDefault = *req.ThinkingDefault
	}
	if req.Theme != "" {
		user.Theme = req.Theme
	}

	if err := h.store.UpdateUser(r.Context(), user); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "UPDATE_FAILED", "Failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user": user,
	})
}

// DELETE /api/v1/me
func (h *APIHandler) HandleDeleteMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	if err := h.store.DeleteUser(r.Context(), user.ID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "DELETE_FAILED", "Failed to delete user account")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
	})
}

// GET /api/v1/conversations
func (h *APIHandler) HandleListConversations(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	conversations, err := h.store.ListConversations(r.Context(), user.ID, 50)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "QUERY_ERROR", "Failed to list conversations")
		return
	}

	if conversations == nil {
		conversations = []*models.Conversation{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"conversations": conversations,
	})
}

// POST /api/v1/conversations
func (h *APIHandler) HandleCreateConversation(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	var req struct {
		Title        string              `json:"title"`
		LegalMode    models.LegalMode    `json:"legalMode"`
		Jurisdiction models.Jurisdiction `json:"jurisdiction"`
		AIProvider   models.AIProvider   `json:"aiProvider"`
		AIMode       models.AIMode       `json:"aiMode"`
		DocumentIDs  []string            `json:"documentIds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "New Legal Consultation"
	}

	now := time.Now().UTC()
	conv := &models.Conversation{
		ID:           "cnv_" + uuid.New().String(),
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

	if err := h.store.CreateConversation(r.Context(), conv); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "PERSISTENCE_ERROR", "Failed to create conversation")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"conversation": conv,
	})
}

// GET /api/v1/conversations/:id
func (h *APIHandler) HandleGetConversation(w http.ResponseWriter, r *http.Request, convID string) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	conv, err := h.store.GetConversation(r.Context(), convID)
	if err != nil || conv.UserID != user.ID {
		writeJSONError(w, http.StatusNotFound, "NOT_FOUND", "Conversation not found")
		return
	}

	messages, err := h.store.ListMessages(r.Context(), convID, 100)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "QUERY_ERROR", "Failed to list messages")
		return
	}

	if messages == nil {
		messages = []*models.Message{}
	} else {
		for _, m := range messages {
			if m.Role == "user" && len(m.Attachments) == 0 && len(m.DocumentIDs) > 0 {
				for _, docID := range m.DocumentIDs {
					doc, err := h.store.GetDocument(r.Context(), docID)
					if err == nil && doc != nil {
						pCount := doc.PageCount
						if len(doc.PageImages) > 0 {
							pCount = len(doc.PageImages)
						}
						m.Attachments = append(m.Attachments, models.MessageAttachment{
							ID:        doc.ID,
							Name:      doc.Name,
							MimeType:  doc.MimeType,
							SizeBytes: doc.SizeBytes,
							PageCount: pCount,
						})
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"conversation": conv,
		"messages":     messages,
	})
}

// PATCH /api/v1/conversations/:id
func (h *APIHandler) HandleUpdateConversation(w http.ResponseWriter, r *http.Request, convID string) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	conv, err := h.store.GetConversation(r.Context(), convID)
	if err != nil || conv.UserID != user.ID {
		writeJSONError(w, http.StatusNotFound, "NOT_FOUND", "Conversation not found")
		return
	}

	var req struct {
		Title        string              `json:"title,omitempty"`
		LegalMode    models.LegalMode    `json:"legalMode,omitempty"`
		Jurisdiction models.Jurisdiction `json:"jurisdiction,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid payload")
		return
	}

	if req.Title != "" {
		conv.Title = req.Title
	}
	if req.LegalMode != "" {
		conv.LegalMode = req.LegalMode
	}
	if req.Jurisdiction != "" {
		conv.Jurisdiction = req.Jurisdiction
	}
	conv.UpdatedAt = time.Now().UTC()

	_ = h.store.UpdateConversation(r.Context(), conv)

	writeJSON(w, http.StatusOK, map[string]any{
		"conversation": conv,
	})
}

// DELETE /api/v1/conversations/:id
func (h *APIHandler) HandleDeleteConversation(w http.ResponseWriter, r *http.Request, convID string) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	if err := h.store.DeleteConversation(r.Context(), convID, user.ID); err != nil {
		writeJSONError(w, http.StatusNotFound, "NOT_FOUND", "Conversation not found or unauthorized")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
	})
}

// POST /api/v1/documents
func (h *APIHandler) HandleUploadDocument(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	// 20MB limit
	r.Body = http.MaxBytesReader(w, r.Body, h.cfg.MaxDocumentSizeBytes+1024)
	if err := r.ParseMultipartForm(h.cfg.MaxDocumentSizeBytes); err != nil {
		writeJSONError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "Document exceeds maximum permitted file size.")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "MISSING_FILE", "No file found in upload form.")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".gif" {
		writeJSONError(w, http.StatusBadRequest, "IMAGE_UNSUPPORTED", "Counsel currently supports text and PDF documents, not images.")
		return
	}

	var pageImages []string
	if rawImages := r.FormValue("pageImages"); rawImages != "" {
		_ = json.Unmarshal([]byte(rawImages), &pageImages)
	}
	clientText := r.FormValue("clientText")
	hasImages := len(pageImages) > 0

	extracted, err := documents.ParseWithImages(header.Filename, header.Header.Get("Content-Type"), file, h.cfg.MaxDocumentSizeBytes, h.cfg.MaxPageCount, clientText, hasImages)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "EXTRACTION_FAILED", err.Error())
		return
	}

	doc := &models.Document{
		ID:                  "doc_" + uuid.New().String(),
		UserID:              user.ID,
		Name:                extracted.Name,
		MimeType:            extracted.MimeType,
		SizeBytes:           extracted.SizeBytes,
		PageCount:           extracted.PageCount,
		ExtractedTextLength: extracted.ExtractedTextLength,
		ExtractionStatus:    extracted.ExtractionStatus,
		Chunks:              extracted.Chunks,
		PageImages:          pageImages,
		CreatedAt:           time.Now().UTC(),
	}

	if err := h.store.CreateDocument(r.Context(), doc); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "PERSISTENCE_ERROR", "Failed to save document metadata")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"document": doc,
	})
}

// GET /api/v1/documents
func (h *APIHandler) HandleListDocuments(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	docs, err := h.store.ListDocuments(r.Context(), user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "QUERY_ERROR", "Failed to list documents")
		return
	}

	if docs == nil {
		docs = []*models.Document{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"documents": docs,
	})
}

// DELETE /api/v1/documents/:id
func (h *APIHandler) HandleDeleteDocument(w http.ResponseWriter, r *http.Request, docID string) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	if err := h.store.DeleteDocument(r.Context(), docID, user.ID); err != nil {
		writeJSONError(w, http.StatusNotFound, "NOT_FOUND", "Document not found or unauthorized")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
	})
}

// GET /api/v1/usage
func (h *APIHandler) HandleGetUsage(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	quota, err := h.limiter.GetQuota(r.Context(), user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "QUERY_ERROR", "Failed to get usage quota")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"quota": quota,
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

// POST /api/v1/chat/stream - Server-Sent Events (SSE) streaming for serverless/Vercel environments
func (h *APIHandler) HandleChatStream(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "STREAMING_UNSUPPORTED", "Streaming is not supported by this server/client environment")
		return
	}

	var req websocket.ClientEnvelope
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON payload")
		return
	}

	ctx := r.Context()
	now := time.Now().UTC()

	// 1. Resolve or create conversation
	var conv *models.Conversation
	if req.ConversationID != "" {
		c, err := h.store.GetConversation(ctx, req.ConversationID)
		if err == nil && c != nil {
			if c.UserID != user.ID {
				writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "You do not have permission to access this conversation")
				return
			}
			conv = c
		}
	}

	if conv == nil {
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
			writeJSONError(w, http.StatusInternalServerError, "PERSISTENCE_ERROR", "Failed to initialize conversation session")
			return
		}
	}

	// Update conversation settings if specified
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
		writeJSONError(w, http.StatusTooManyRequests, "QUOTA_EXCEEDED", "Counsel daily capacity reached. Quota resets daily at UTC midnight.")
		return
	}

	// 4. Retrieve prior conversation history
	priorHistory, _ := h.store.ListMessages(ctx, conv.ID, 50)

	// Persist user message
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

	// 6. Begin SSE stream
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	sendEvent := func(env *websocket.ServerEnvelope) error {
		bytes, err := json.Marshal(env)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintf(w, "data: %s\n\n", bytes)
		flusher.Flush()
		return err
	}

	// Send initial message.start event
	_ = sendEvent(&websocket.ServerEnvelope{
		Type:           websocket.ServerEventStart,
		MessageID:      assistantMsgID,
		ConversationID: conv.ID,
	})

	// 7. Assemble context-aware multi-turn messages
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

	var fullResponse strings.Builder
	callbacks := ai.StreamCallbacks{
		OnStatus: func(statusText string) {
			_ = sendEvent(&websocket.ServerEnvelope{
				Type:           websocket.ServerEventStatus,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
				StatusText:     statusText,
			})
		},
		OnDelta: func(delta string) {
			fullResponse.WriteString(delta)
			_ = sendEvent(&websocket.ServerEnvelope{
				Type:           websocket.ServerEventDelta,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
				Delta:          delta,
			})
		},
	}

	usedModel, streamErr := h.aiClient.StreamWithCascade(ctx, candidateModels, contextMessages, callbacks)
	if usedModel != "" {
		assistantMsg.Model = usedModel
	}

	if streamErr != nil {
		if errors.Is(streamErr, ai.ErrStreamAborted) || errors.Is(ctx.Err(), context.Canceled) {
			assistantMsg.Content = fullResponse.String()
			assistantMsg.Status = models.StatusCancelled
			_ = h.store.UpdateMessage(ctx, assistantMsg)
			_ = h.limiter.SettleUnits(ctx, user.ID, costUnits, 1)
			_ = sendEvent(&websocket.ServerEnvelope{
				Type:           websocket.ServerEventCancel,
				MessageID:      assistantMsgID,
				ConversationID: conv.ID,
			})
			return
		}

		assistantMsg.Status = models.StatusFailed
		_ = h.store.UpdateMessage(ctx, assistantMsg)
		_ = h.limiter.RefundUnits(ctx, user.ID, costUnits)
		_ = sendEvent(&websocket.ServerEnvelope{
			Type:           websocket.ServerEventError,
			MessageID:      assistantMsgID,
			ConversationID: conv.ID,
			ErrorCode:      "AI_SERVICE_ERROR",
			ErrorMessage:   "Counsel encountered a temporary issue generating your response. Please try again.",
		})
		return
	}

	finalContent := fullResponse.String()
	assistantMsg.Content = finalContent
	assistantMsg.Status = models.StatusCompleted

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

	_ = sendEvent(&websocket.ServerEnvelope{
		Type:           websocket.ServerEventComplete,
		MessageID:      assistantMsgID,
		ConversationID: conv.ID,
		UsageUnits:     costUnits,
	})
}
