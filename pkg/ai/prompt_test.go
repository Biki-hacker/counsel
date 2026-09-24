package ai

import (
	"strings"
	"testing"

	"counsel/pkg/models"
)

func TestPromptConstructionAndSafetyRules(t *testing.T) {
	pb := NewPromptBuilder()

	// Test 1: Contract mode + India jurisdiction
	contractPrompt := pb.BuildSystemPrompt(models.ModeContract, models.JurisdictionIndia)

	if !strings.Contains(contractPrompt, "NOT a lawyer") {
		t.Errorf("Expected core non-lawyer disclaimer rule")
	}
	if !strings.Contains(contractPrompt, "NO HALLUCINATION POLICY") {
		t.Errorf("Expected anti-hallucination policy")
	}
	if !strings.Contains(contractPrompt, "Target Jurisdiction: India") {
		t.Errorf("Expected Indian jurisdiction context")
	}
	if !strings.Contains(contractPrompt, "Active Mode: Contract Analysis") {
		t.Errorf("Expected Contract mode instructions")
	}

	// Test 2: Criminal mode safety override
	criminalPrompt := pb.BuildSystemPrompt(models.ModeCriminal, models.JurisdictionUS)
	if !strings.Contains(criminalPrompt, "NEVER assist a user in evading law enforcement") {
		t.Errorf("Expected criminal safety override preventing evasion assistance")
	}

	// Test 3: Compare mode format
	comparePrompt := pb.BuildSystemPrompt(models.ModeCompare, models.JurisdictionGeneral)
	if !strings.Contains(comparePrompt, "Executive Difference Summary") {
		t.Errorf("Expected comparison format structure")
	}

	// Test 4: Prepare for a Lawyer mode format
	prepPrompt := pb.BuildSystemPrompt(models.ModePrepLawyer, models.JurisdictionUK)
	if !strings.Contains(prepPrompt, "Lawyer Consultation Briefing") {
		t.Errorf("Expected lawyer prep briefing structure")
	}
}
