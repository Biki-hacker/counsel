package ai

import (
	"testing"

	"counsel/pkg/models"
)

func BenchmarkPromptBuilder_BuildSystemPrompt(b *testing.B) {
	builder := NewPromptBuilder()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = builder.BuildSystemPrompt(models.ModeContract, models.JurisdictionIndia)
	}
}

func BenchmarkExtractTextFromContent(b *testing.B) {
	content := `[{"type":"text","text":"Analyze this non-disclosure agreement."}]`

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = extractTextFromContent(content)
	}
}
