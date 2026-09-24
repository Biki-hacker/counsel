package ai

import (
	"testing"

	"counsel/pkg/config"
	"counsel/pkg/models"
)

func TestGetCandidateModels_CascadeOrder(t *testing.T) {
	cfg := &config.Config{
		ModelNvidiaNormal:   "nvidia/normal-model",
		ModelNvidiaThinking: "nvidia/thinking-model",
		ModelGoogleNormal:   "google/normal-model",
		ModelGoogleThinking: "google/thinking-model",
		ModelNvidiaOmni:     "nvidia/omni-model",
	}

	reg := NewRegistry(cfg)

	// 1. Test Normal Mode (Default, no PDF):
	// Must be: NVIDIA Normal -> NVIDIA Thinking -> Google Normal -> Google Thinking
	normalCandidates := reg.GetCandidateModels(models.AIModeNormal, false)
	expectedNormal := []string{
		"nvidia/normal-model",
		"nvidia/thinking-model",
		"google/normal-model",
		"google/thinking-model",
	}

	if len(normalCandidates) != len(expectedNormal) {
		t.Fatalf("Expected %d normal candidates, got %d", len(expectedNormal), len(normalCandidates))
	}
	for i, expected := range expectedNormal {
		if normalCandidates[i] != expected {
			t.Errorf("At index %d: expected %s, got %s", i, expected, normalCandidates[i])
		}
	}

	// 2. Test Thinking Mode (no PDF):
	// Must be: NVIDIA Thinking -> NVIDIA Normal -> Google Thinking -> Google Normal
	thinkingCandidates := reg.GetCandidateModels(models.AIModeThinking, false)
	expectedThinking := []string{
		"nvidia/thinking-model",
		"nvidia/normal-model",
		"google/thinking-model",
		"google/normal-model",
	}

	if len(thinkingCandidates) != len(expectedThinking) {
		t.Fatalf("Expected %d thinking candidates, got %d", len(expectedThinking), len(thinkingCandidates))
	}
	for i, expected := range expectedThinking {
		if thinkingCandidates[i] != expected {
			t.Errorf("At index %d: expected %s, got %s", i, expected, thinkingCandidates[i])
		}
	}

	// 3. Test Thinking Mode WITH PDF:
	// User Requirement:
	// "When there is a pdf, in thinking mode, use Gemma 4 31B -> if not working, then gemma 4 26B A4B, -> if not working previous 2 models on both api keys, use 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'"
	pdfThinkingCandidates := reg.GetCandidateModels(models.AIModeThinking, true)
	expectedPDFThinking := []string{
		"google/thinking-model", // Gemma 4 31B
		"google/normal-model",   // Gemma 4 26B A4B
		"nvidia/omni-model",     // Nemotron 3 Nano Omni 30B reasoning
	}

	if len(pdfThinkingCandidates) != len(expectedPDFThinking) {
		t.Fatalf("Expected %d PDF thinking candidates, got %d", len(expectedPDFThinking), len(pdfThinkingCandidates))
	}
	for i, expected := range expectedPDFThinking {
		if pdfThinkingCandidates[i] != expected {
			t.Errorf("At index %d: expected %s, got %s", i, expected, pdfThinkingCandidates[i])
		}
	}

	// 4. Test Normal Mode WITH PDF:
	// Must be: Gemma 4 26B A4B -> Gemma 4 31B -> Nemotron 3 Nano Omni 30B reasoning
	pdfNormalCandidates := reg.GetCandidateModels(models.AIModeNormal, true)
	expectedPDFNormal := []string{
		"google/normal-model",   // Gemma 4 26B A4B
		"google/thinking-model", // Gemma 4 31B
		"nvidia/omni-model",     // Nemotron 3 Nano Omni 30B reasoning
	}

	if len(pdfNormalCandidates) != len(expectedPDFNormal) {
		t.Fatalf("Expected %d PDF normal candidates, got %d", len(expectedPDFNormal), len(pdfNormalCandidates))
	}
	for i, expected := range expectedPDFNormal {
		if pdfNormalCandidates[i] != expected {
			t.Errorf("At index %d: expected %s, got %s", i, expected, pdfNormalCandidates[i])
		}
	}
}
