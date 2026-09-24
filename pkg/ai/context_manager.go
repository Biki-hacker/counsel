package ai

import (
	"fmt"
	"strings"

	"counsel/pkg/models"
)

// ChatMessage represents a typed role-content pair conforming to OpenAI/OpenRouter APIs.
type ChatMessage struct {
	Role    string `json:"role"` // "system", "user", "assistant"
	Content any    `json:"content"`
}

// ContentPart represents an item in a multimodal message (text or image_url).
type ContentPart struct {
	Type     string    `json:"type"` // "text" or "image_url"
	Text     string    `json:"text,omitempty"`
	ImageURL *ImageURL `json:"image_url,omitempty"`
}

// ImageURL holds the URL or base64 data for multimodal input.
type ImageURL struct {
	URL string `json:"url"` // "data:image/jpeg;base64,..."
}

// ContextManager manages the conversational sliding window and compacts older history.
type ContextManager struct {
	MaxTotalChars    int // Maximum character budget for entire request
	RecentTurnCount  int // Number of recent messages to keep verbatim
	MaxSummaryLength int // Maximum length of the compacted summary
}

// NewContextManager creates a ContextManager with safe production limits.
func NewContextManager() *ContextManager {
	return &ContextManager{
		MaxTotalChars:    28000, // ~7,000 tokens (safe for free tier & fast response)
		RecentTurnCount:  6,     // Preserve last 6 turns (3 exchanges) verbatim
		MaxSummaryLength: 2500,  // Compact older memory block
	}
}

// BuildContext constructs the complete context-aware message list (text-only).
func (cm *ContextManager) BuildContext(
	systemPrompt string,
	history []*models.Message,
	currentPrompt string,
	formattedDocContext string,
) []ChatMessage {
	return cm.BuildContextWithImages(systemPrompt, history, currentPrompt, formattedDocContext, nil)
}

// BuildContextWithImages constructs the context-aware message list with optional visual page images.
func (cm *ContextManager) BuildContextWithImages(
	systemPrompt string,
	history []*models.Message,
	currentPrompt string,
	formattedDocContext string,
	pageImages []string,
) []ChatMessage {
	// 1. Filter valid history messages (completed user & assistant turns)
	validHistory := make([]*models.Message, 0, len(history))
	for _, m := range history {
		if m == nil {
			continue
		}
		if m.Role != "user" && m.Role != "assistant" {
			continue
		}
		if m.Status == models.StatusFailed {
			continue
		}
		trimmed := strings.TrimSpace(m.Content)
		if trimmed == "" {
			continue
		}
		validHistory = append(validHistory, m)
	}

	// 2. Format current turn content (with document context if provided)
	var currentTurnContent string
	if formattedDocContext != "" {
		currentTurnContent = fmt.Sprintf("REFERENCED LEGAL DOCUMENT(S):\n%s\n\nUSER QUERY:\n%s", formattedDocContext, currentPrompt)
	} else {
		currentTurnContent = currentPrompt
	}

	var activeUserContent any = currentTurnContent
	if len(pageImages) > 0 {
		parts := make([]ContentPart, 0, len(pageImages)+1)
		parts = append(parts, ContentPart{
			Type: "text",
			Text: currentTurnContent,
		})
		for _, img := range pageImages {
			trimmedImg := strings.TrimSpace(img)
			if trimmedImg != "" {
				parts = append(parts, ContentPart{
					Type:     "image_url",
					ImageURL: &ImageURL{URL: trimmedImg},
				})
			}
		}
		activeUserContent = parts
	}

	// If no prior history, return system + current turn
	if len(validHistory) == 0 {
		return []ChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: activeUserContent},
		}
	}

	// 3. Calculate total character footprint
	totalChars := len(systemPrompt) + len(currentTurnContent)
	for _, m := range validHistory {
		totalChars += len(m.Content)
	}

	// 4. If within budget, include full verbatim history
	if totalChars <= cm.MaxTotalChars {
		messages := make([]ChatMessage, 0, len(validHistory)+2)
		messages = append(messages, ChatMessage{Role: "system", Content: systemPrompt})
		for _, m := range validHistory {
			messages = append(messages, ChatMessage{Role: m.Role, Content: m.Content})
		}
		messages = append(messages, ChatMessage{Role: "user", Content: activeUserContent})
		return messages
	}

	// 5. Compaction Required: Partition into Older vs. Recent messages
	splitIdx := len(validHistory) - cm.RecentTurnCount
	if splitIdx <= 0 {
		// Even recent messages alone are too large; truncate individual older responses
		splitIdx = len(validHistory) / 2
	}

	older := validHistory[:splitIdx]
	recent := validHistory[splitIdx:]

	// 6. Build compacted summary of older turns
	summary := cm.compactMessages(older)

	messages := make([]ChatMessage, 0, len(recent)+3)
	messages = append(messages, ChatMessage{Role: "system", Content: systemPrompt})

	// Inject compacted summary as a context-anchor message
	if summary != "" {
		messages = append(messages, ChatMessage{
			Role:    "system",
			Content: fmt.Sprintf("[PRIOR CONVERSATION CONTEXT & FACT SUMMARY]\nThe user and Counsel previously established the following facts and legal points:\n%s\n[END PRIOR CONTEXT - Resume normal conversation using these facts]", summary),
		})
	}

	// Add recent verbatim messages
	for _, m := range recent {
		content := m.Content
		// If an individual older assistant message is massive, trim it cleanly
		if len(content) > 3000 {
			content = content[:3000] + "\n... [Analysis truncated for brevity]"
		}
		messages = append(messages, ChatMessage{Role: m.Role, Content: content})
	}

	// Append active current turn
	messages = append(messages, ChatMessage{Role: "user", Content: activeUserContent})

	return messages
}

// compactMessages condenses older turns into an executive legal memory block.
func (cm *ContextManager) compactMessages(messages []*models.Message) string {
	if len(messages) == 0 {
		return ""
	}

	var sb strings.Builder
	turn := 1

	for i := 0; i < len(messages); i++ {
		m := messages[i]
		if m.Role == "user" {
			userQuery := strings.TrimSpace(m.Content)
			if len(userQuery) > 140 {
				userQuery = userQuery[:140] + "..."
			}
			sb.WriteString(fmt.Sprintf("- Turn %d User Question: \"%s\"\n", turn, userQuery))

			// Check if next message is the corresponding assistant reply
			if i+1 < len(messages) && messages[i+1].Role == "assistant" {
				i++
				reply := strings.TrimSpace(messages[i].Content)
				summaryLine := extractKeySummary(reply)
				sb.WriteString(fmt.Sprintf("  Counsel Answer / Determination: %s\n", summaryLine))
			}
			turn++
		} else if m.Role == "assistant" {
			summaryLine := extractKeySummary(m.Content)
			sb.WriteString(fmt.Sprintf("- Counsel Previous Note: %s\n", summaryLine))
		}

		if sb.Len() >= cm.MaxSummaryLength {
			break
		}
	}

	res := sb.String()
	if len(res) > cm.MaxSummaryLength {
		res = res[:cm.MaxSummaryLength] + "..."
	}
	return res
}

// extractKeySummary extracts the high-value determination from an assistant reply.
func extractKeySummary(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return "No details recorded."
	}

	lines := strings.Split(text, "\n")
	var meaningfulLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		// Clean markdown bullet symbols
		trimmed = strings.TrimPrefix(trimmed, "- ")
		trimmed = strings.TrimPrefix(trimmed, "* ")
		meaningfulLines = append(meaningfulLines, trimmed)
		if len(meaningfulLines) >= 2 {
			break
		}
	}

	if len(meaningfulLines) > 0 {
		summary := strings.Join(meaningfulLines, " ")
		if len(summary) > 220 {
			summary = summary[:220] + "..."
		}
		return summary
	}

	if len(text) > 180 {
		return text[:180] + "..."
	}
	return text
}
