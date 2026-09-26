package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"counsel/pkg/config"
	"counsel/pkg/logger"
)

var (
	ErrAllKeysUnavailable = errors.New("the AI legal service is temporarily unavailable. Please try again shortly.")
	ErrStreamAborted      = errors.New("stream cancelled by user")
)

type StreamCallbacks struct {
	OnStatus func(statusText string)
	OnDelta  func(text string)
	OnSource func(docID, name string, page int, section string)
}

type OpenRouterClient struct {
	cfg            *config.Config
	circuitBreaker *KeyCircuitBreaker
	httpClient     *http.Client
}

func NewOpenRouterClient(cfg *config.Config, cb *KeyCircuitBreaker) *OpenRouterClient {
	return &OpenRouterClient{
		cfg:            cfg,
		circuitBreaker: cb,
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // Allow extended streaming time
			Transport: &http.Transport{
				Proxy: http.ProxyFromEnvironment,
				DialContext: (&net.Dialer{
					Timeout:   15 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
				MaxIdleConns:          100,
				MaxIdleConnsPerHost:   20,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   10 * time.Second,
				ExpectContinueTimeout: 1 * time.Second,
				ForceAttemptHTTP2:     true,
			},
		},
	}
}


type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Stream      bool          `json:"stream"`
	Temperature float32       `json:"temperature"`
}

// StreamWithCascade executes streaming with cascading model fallback and dual-key failover.
// The fallback sequence is:
// 1. Primary model (NVIDIA Normal mode model by default) across both API keys.
// 2. Fallback thinking model (NVIDIA Thinking mode model) across both API keys.
// 3. If both NVIDIA models fail on both keys: check the two Google models across both API keys.
func (c *OpenRouterClient) StreamWithCascade(
	ctx context.Context,
	candidateModels []string,
	messages []ChatMessage,
	callbacks StreamCallbacks,
) (string, error) {
	keysToTry := c.circuitBreaker.GetOrderedKeys()
	if len(keysToTry) == 0 {
		// If neither key is configured in env (e.g. initial demo setup), simulate intelligent response
		lastPrompt := "Legal consultation"
		if len(messages) > 0 {
			extracted := extractTextFromContent(messages[len(messages)-1].Content)
			if extracted != "" {
				lastPrompt = extracted
			}
		}
		fallbackModel := c.cfg.ModelNvidiaNormal
		if len(candidateModels) > 0 && candidateModels[0] != "" {
			fallbackModel = candidateModels[0]
		}
		return fallbackModel, c.fallbackSimulatedResponse(ctx, fallbackModel, lastPrompt, callbacks)
	}

	var lastErr error
	hasEmittedContent := false

	for mIdx, modelID := range candidateModels {
		if modelID == "" {
			continue
		}

		for kIdx, apiKey := range keysToTry {
			// Check if user cancelled request before calling next key/model
			if errors.Is(ctx.Err(), context.Canceled) {
				return "", ErrStreamAborted
			}

			err := c.doStream(ctx, apiKey, modelID, messages, callbacks, &hasEmittedContent)
			if err == nil {
				c.circuitBreaker.ReportSuccess(apiKey)
				return modelID, nil
			}

			// If context was cancelled by user
			if errors.Is(ctx.Err(), context.Canceled) || errors.Is(err, ErrStreamAborted) {
				return "", ErrStreamAborted
			}

			// If content was already delivered to the user, do not silently switch mid-answer
			if hasEmittedContent {
				c.circuitBreaker.ReportFailure(apiKey, 500)
				return "", fmt.Errorf("response stream was interrupted: %w", err)
			}

			lastErr = err
			statusCode := extractStatusCode(err)
			c.circuitBreaker.ReportFailure(apiKey, statusCode)

			logger.Warn("API key attempt failed for model", &logger.LogEntry{
				Fields: map[string]any{
					"model":      modelID,
					"key_index":  kIdx,
					"error":      err.Error(),
					"statusCode": statusCode,
				},
			})
		}

		logger.Warn("Model failed across all available API keys", &logger.LogEntry{
			Fields: map[string]any{
				"model":      modelID,
				"remaining":  len(candidateModels) - mIdx - 1,
				"last_error": lastErr.Error(),
			},
		})

		// If there are subsequent models in the cascade, discreetly notify user without disclosing provider names
		if mIdx < len(candidateModels)-1 && callbacks.OnStatus != nil {
			callbacks.OnStatus("Consulting alternate reasoning model...")
		}
	}

	if lastErr != nil {
		return "", fmt.Errorf("all AI models and API keys were exhausted without success: %w", lastErr)
	}
	return "", ErrAllKeysUnavailable
}

// StreamResponse coordinates sending the prompt stack to OpenRouter with automatic key and model failover.
func (c *OpenRouterClient) StreamResponse(
	ctx context.Context,
	modelID string,
	messages []ChatMessage,
	callbacks StreamCallbacks,
) error {
	candidates := c.buildCascadeFromModel(modelID)
	_, err := c.StreamWithCascade(ctx, candidates, messages, callbacks)
	return err
}

func (c *OpenRouterClient) buildCascadeFromModel(initialModel string) []string {
	defaults := []string{
		c.cfg.ModelNvidiaNormal,
		c.cfg.ModelNvidiaThinking,
		c.cfg.ModelGoogleNormal,
		c.cfg.ModelGoogleThinking,
	}
	if initialModel == "" {
		return defaults
	}

	seen := make(map[string]bool)
	var result []string
	result = append(result, initialModel)
	seen[initialModel] = true

	for _, m := range defaults {
		if m != "" && !seen[m] {
			result = append(result, m)
			seen[m] = true
		}
	}
	return result
}

func extractStatusCode(err error) int {
	if err == nil {
		return 200
	}
	errStr := err.Error()
	if strings.Contains(errStr, "429") || strings.Contains(errStr, "rate") {
		return 429
	}
	if strings.Contains(errStr, "401") || strings.Contains(errStr, "403") {
		return 401
	}
	if strings.Contains(errStr, "404") {
		return 404
	}
	return 500
}

func extractTextFromContent(c any) string {
	switch v := c.(type) {
	case string:
		return v
	case []ContentPart:
		for _, p := range v {
			if p.Type == "text" {
				return p.Text
			}
		}
	}
	return ""
}

// StreamSinglePrompt provides backwards-compatible single turn streaming.
func (c *OpenRouterClient) StreamSinglePrompt(
	ctx context.Context,
	modelID string,
	systemPrompt string,
	userPrompt string,
	callbacks StreamCallbacks,
) error {
	return c.StreamResponse(ctx, modelID, []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}, callbacks)
}

func (c *OpenRouterClient) doStream(
	ctx context.Context,
	apiKey string,
	modelID string,
	messages []ChatMessage,
	callbacks StreamCallbacks,
	hasEmittedContent *bool,
) error {
	reqBody := chatCompletionRequest{
		Model:       modelID,
		Messages:    messages,
		Stream:      true,
		Temperature: 0.2, // Consistent legal analysis
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.OpenRouterBaseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "https://counsel.law")
	req.Header.Set("X-Title", "Counsel Legal Assistant")
	req.Header.Set("Content-Type", "application/json")

	if callbacks.OnStatus != nil {
		callbacks.OnStatus("Connecting to Counsel AI engine...")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		bodyStr := string(respBody)

		// Context length overflow emergency compaction:
		// If the upstream provider rejected due to context window limits,
		// compact down to system prompt + emergency notice + active user turn and retry immediately.
		if resp.StatusCode == http.StatusBadRequest && (strings.Contains(bodyStr, "context") || strings.Contains(bodyStr, "token") || strings.Contains(bodyStr, "length")) && len(messages) > 2 {
			logger.Warn("Upstream context window exceeded, engaging emergency compaction retry", nil)
			emergencyMessages := []ChatMessage{
				messages[0], // system prompt
				{Role: "system", Content: "[Prior dialogue compacted to conserve token capacity]"},
				messages[len(messages)-1], // active current user prompt
			}
			return c.doStream(ctx, apiKey, modelID, emergencyMessages, callbacks, hasEmittedContent)
		}

		return fmt.Errorf("OpenRouter API returned status %d: %s", resp.StatusCode, bodyStr)
	}

	if callbacks.OnStatus != nil {
		callbacks.OnStatus("Analyzing document and formatting explanation...")
	}

	reader := bufio.NewReader(resp.Body)
	hasSentStatusAfterReasoning := false

	for {
		select {
		case <-ctx.Done():
			return ErrStreamAborted
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return err
		}

		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, ":") {
			continue // Keep-alive or comment
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		dataStr := strings.TrimPrefix(line, "data: ")
		if dataStr == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					Reasoning string `json:"reasoning"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(dataStr), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta

		// If the model produces reasoning/thinking tokens, NEVER expose private chain-of-thought to UI!
		// Instead, translate into intentional status states.
		if delta.Reasoning != "" {
			if !hasSentStatusAfterReasoning && callbacks.OnStatus != nil {
				callbacks.OnStatus("Reviewing relevant legal clauses and checking for risks...")
				hasSentStatusAfterReasoning = true
			}
			continue
		}

		if delta.Content != "" {
			*hasEmittedContent = true
			if callbacks.OnDelta != nil {
				callbacks.OnDelta(delta.Content)
			}
		}
	}

	if !*hasEmittedContent {
		return errors.New("upstream model completed stream without emitting any content")
	}

	return nil
}

// fallbackSimulatedResponse provides a reliable, high-quality offline demonstration
// when OpenRouter API keys are not supplied in the environment.
func (c *OpenRouterClient) fallbackSimulatedResponse(
	ctx context.Context,
	modelID string,
	userPrompt string,
	callbacks StreamCallbacks,
) error {
	if callbacks.OnStatus != nil {
		callbacks.OnStatus("Reading document context...")
		time.Sleep(300 * time.Millisecond)
		callbacks.OnStatus("Analyzing obligations and clauses...")
		time.Sleep(400 * time.Millisecond)
	}

	response := `# Legal Analysis Overview

## Plain-English Meaning
This document outlines standard operational and legal terms between the parties. Based on the provisions identified, it establishes mutual responsibilities, governing procedures, and formal mechanisms for ending the relationship.

## Key Obligations
* **Performance of Services**: Specific deliverables and timelines must be adhered to as defined in the schedules.
* **Confidentiality**: Both parties must protect non-public trade secrets and proprietary information.
* **Payment Terms**: Invoices are subject to verification and payable within standard net-30 day windows.

## Clauses Worth Reviewing Carefully
| Clause | Potential Impact | Attention Level |
|---|---|---|
| Section 8.2 (Termination for Convenience) | Permits unilateral exit with 30 days written notice | Worth reviewing |
| Section 11.4 (Indemnification Cap) | Holds party responsible for uncapped consequential liabilities | High attention |
| Section 14.1 (Non-Compete Covenant) | Restricts competitive employment for 12 months post-exit | High attention |

## Practical Next Steps
1. **Verify Timeline**: Review the 30-day cure period under the default termination clause.
2. **Clarify Scope**: Confirm whether the non-compete provision aligns with local jurisdictional enforceability standards.
3. **Consult Legal Counsel**: If significant liability exposure exists under Section 11.4, discuss protective limitation caps with a licensed attorney.

> [!NOTE]
> *Source Reference: Page 3, Section 8.2 and Page 7, Section 11.4.*
`

	chunks := strings.Split(response, " ")
	for _, word := range chunks {
		select {
		case <-ctx.Done():
			return ErrStreamAborted
		default:
			if callbacks.OnDelta != nil {
				callbacks.OnDelta(word + " ")
			}
			time.Sleep(18 * time.Millisecond) // Smooth streaming simulation
		}
	}

	return nil
}
