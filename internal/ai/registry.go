package ai

import (
	"errors"

	"counsel/internal/config"
	"counsel/internal/models"
)

var (
	ErrInvalidModel    = errors.New("requested model is not allowed or supported")
	ErrInvalidProvider = errors.New("unsupported AI provider")
)

// ModelDescriptor holds metadata for a registered model.
type ModelDescriptor struct {
	ID             string
	Provider       models.AIProvider
	Mode           models.AIMode
	ContextWindow  int
	MaxTokens      int
	SupportsReason bool
}

// Registry manages verified models available through OpenRouter.
type Registry struct {
	cfg    *config.Config
	models map[string]*ModelDescriptor
}

// NewRegistry initializes the registry with verified Google and NVIDIA models.
func NewRegistry(cfg *config.Config) *Registry {
	r := &Registry{
		cfg:    cfg,
		models: make(map[string]*ModelDescriptor),
	}

	// Register Google Normal (Gemma 4 26B)
	r.models[cfg.ModelGoogleNormal] = &ModelDescriptor{
		ID:             cfg.ModelGoogleNormal,
		Provider:       models.ProviderGoogle,
		Mode:           models.AIModeNormal,
		ContextWindow:  262144,
		MaxTokens:      8192,
		SupportsReason: false,
	}

	// Register Google Thinking (Gemma 4 31B)
	r.models[cfg.ModelGoogleThinking] = &ModelDescriptor{
		ID:             cfg.ModelGoogleThinking,
		Provider:       models.ProviderGoogle,
		Mode:           models.AIModeThinking,
		ContextWindow:  262144,
		MaxTokens:      8192,
		SupportsReason: true,
	}

	// Register NVIDIA Normal (Nemotron 3 Super 120B)
	r.models[cfg.ModelNvidiaNormal] = &ModelDescriptor{
		ID:             cfg.ModelNvidiaNormal,
		Provider:       models.ProviderNvidia,
		Mode:           models.AIModeNormal,
		ContextWindow:  262144,
		MaxTokens:      8192,
		SupportsReason: false,
	}

	// Register NVIDIA Thinking (Nemotron 3 Ultra 550B)
	r.models[cfg.ModelNvidiaThinking] = &ModelDescriptor{
		ID:             cfg.ModelNvidiaThinking,
		Provider:       models.ProviderNvidia,
		Mode:           models.AIModeThinking,
		ContextWindow:  1000000,
		MaxTokens:      16384,
		SupportsReason: true,
	}

	// Register NVIDIA Omni (Nemotron 3 Nano Omni 30B - Vision & Reasoning)
	r.models[cfg.ModelNvidiaOmni] = &ModelDescriptor{
		ID:             cfg.ModelNvidiaOmni,
		Provider:       models.ProviderNvidia,
		Mode:           models.AIModeThinking,
		ContextWindow:  131072,
		MaxTokens:      8192,
		SupportsReason: true,
	}

	return r
}

// GetCandidateModels returns the candidate models in the exact cascading fallback order:
//
// When there is a PDF (or image pages attached):
// - In Thinking mode:
//   1. Gemma 4 31B (google/gemma-4-31b-it:free)
//   2. Gemma 4 26B A4B (google/gemma-4-26b-a4b-it:free)
//   3. NVIDIA Nemotron 3 Nano Omni 30B (nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free)
// - In Normal mode:
//   1. Gemma 4 26B A4B (google/gemma-4-26b-a4b-it:free)
//   2. Gemma 4 31B (google/gemma-4-31b-it:free)
//   3. NVIDIA Nemotron 3 Nano Omni 30B (nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free)
// Note: MODEL_NVIDIA_NORMAL and MODEL_NVIDIA_THINKING do not support images and are omitted for PDFs.
//
// When there is no PDF (text-only):
// - In Normal mode (default):
//   1. NVIDIA Normal model (default)
//   2. NVIDIA Thinking model (if normal is not working)
//   3. Google Normal model (if both NVIDIA models fail on both API keys)
//   4. Google Thinking model
// - In Thinking mode:
//   1. NVIDIA Thinking model
//   2. NVIDIA Normal model
//   3. Google Thinking model
//   4. Google Normal model
func (r *Registry) GetCandidateModels(mode models.AIMode, hasPDF bool) []string {
	if hasPDF {
		if mode == models.AIModeThinking {
			return []string{
				r.cfg.ModelGoogleThinking, // Gemma 4 31B
				r.cfg.ModelGoogleNormal,   // Gemma 4 26B A4B
				r.cfg.ModelNvidiaOmni,     // Nemotron 3 Nano Omni 30B
			}
		}
		return []string{
			r.cfg.ModelGoogleNormal,   // Gemma 4 26B A4B
			r.cfg.ModelGoogleThinking, // Gemma 4 31B
			r.cfg.ModelNvidiaOmni,     // Nemotron 3 Nano Omni 30B
		}
	}

	if mode == models.AIModeThinking {
		return []string{
			r.cfg.ModelNvidiaThinking,
			r.cfg.ModelNvidiaNormal,
			r.cfg.ModelGoogleThinking,
			r.cfg.ModelGoogleNormal,
		}
	}
	return []string{
		r.cfg.ModelNvidiaNormal,
		r.cfg.ModelNvidiaThinking,
		r.cfg.ModelGoogleNormal,
		r.cfg.ModelGoogleThinking,
	}
}

// SelectModel determines the default model ID for the given mode.
func (r *Registry) SelectModel(provider models.AIProvider, mode models.AIMode) (string, error) {
	candidates := r.GetCandidateModels(mode, false)
	if len(candidates) > 0 {
		return candidates[0], nil
	}
	return r.cfg.ModelNvidiaNormal, nil
}


// GetDescriptor returns metadata for a registered model ID.
func (r *Registry) GetDescriptor(modelID string) (*ModelDescriptor, error) {
	desc, ok := r.models[modelID]
	if !ok {
		return nil, ErrInvalidModel
	}
	return desc, nil
}
