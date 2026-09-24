package documents

import (
	"fmt"
	"strings"

	"counsel/pkg/models"
)

const (
	TargetChunkCharSize = 1200
	ChunkOverlapChars   = 150
)

// ChunkDocument breaks page text into referenced, section-aware chunks.
func ChunkDocument(docID string, pageTexts []string) []models.DocumentChunk {
	var chunks []models.DocumentChunk

	for pageIdx, text := range pageTexts {
		pageNum := pageIdx + 1
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}

		// Detect section titles in this page
		currentSection := detectSectionHeading(text)

		// If page is within reasonable chunk size, keep it as single chunk
		if len(text) <= TargetChunkCharSize+200 {
			chunks = append(chunks, models.DocumentChunk{
				ID:            fmt.Sprintf("%s_p%d_c0", docID, pageNum),
				DocumentID:    docID,
				PageNumber:    pageNum,
				SectionTitle:  currentSection,
				Content:       text,
				TokenEstimate: len(text) / 4,
			})
			continue
		}

		// Split by paragraphs or sentences
		paragraphs := strings.Split(text, "\n\n")
		var currentChunk strings.Builder
		chunkIndex := 0

		for _, p := range paragraphs {
			trimmedP := strings.TrimSpace(p)
			if trimmedP == "" {
				continue
			}

			// Update section title if paragraph contains heading
			if heading := detectSectionHeading(trimmedP); heading != "" {
				currentSection = heading
			}

			if currentChunk.Len()+len(trimmedP) > TargetChunkCharSize && currentChunk.Len() > 0 {
				chunkText := currentChunk.String()
				chunks = append(chunks, models.DocumentChunk{
					ID:            fmt.Sprintf("%s_p%d_c%d", docID, pageNum, chunkIndex),
					DocumentID:    docID,
					PageNumber:    pageNum,
					SectionTitle:  currentSection,
					Content:       chunkText,
					TokenEstimate: len(chunkText) / 4,
				})
				chunkIndex++
				currentChunk.Reset()

				// Carry over overlap
				if len(chunkText) > ChunkOverlapChars {
					overlap := chunkText[len(chunkText)-ChunkOverlapChars:]
					currentChunk.WriteString(overlap)
					currentChunk.WriteString(" ")
				}
			}

			currentChunk.WriteString(trimmedP)
			currentChunk.WriteString("\n\n")
		}

		if currentChunk.Len() > 0 {
			chunkText := strings.TrimSpace(currentChunk.String())
			chunks = append(chunks, models.DocumentChunk{
				ID:            fmt.Sprintf("%s_p%d_c%d", docID, pageNum, chunkIndex),
				DocumentID:    docID,
				PageNumber:    pageNum,
				SectionTitle:  currentSection,
				Content:       chunkText,
				TokenEstimate: len(chunkText) / 4,
			})
		}
	}

	return chunks
}

func detectSectionHeading(text string) string {
	matches := sectionRegex.FindStringSubmatch(text)
	if len(matches) > 1 {
		title := strings.TrimSpace(matches[1])
		if len(title) > 60 {
			title = title[:60] + "..."
		}
		return title
	}

	// Also check for simple numbered headers like "1. Term", "2. Obligations"
	lines := strings.Split(text, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if len(trimmed) > 3 && len(trimmed) < 60 {
			if strings.HasPrefix(trimmed, "Article ") || strings.HasPrefix(trimmed, "Section ") ||
				strings.HasPrefix(trimmed, "Clause ") || strings.HasPrefix(trimmed, "Schedule ") {
				return trimmed
			}
		}
	}

	return ""
}

// FormatContextAsUntrustedData formats chunks into protected XML for LLM grounding.
func FormatContextAsUntrustedData(docName, docID string, chunks []models.DocumentChunk, maxTokens int) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("<untrusted_document name=\"%s\" id=\"%s\">\n", docName, docID))

	totalTokens := 0
	for _, chunk := range chunks {
		if maxTokens > 0 && totalTokens+chunk.TokenEstimate > maxTokens {
			sb.WriteString("<!-- Remaining document content omitted to stay within context budget -->\n")
			break
		}

		sb.WriteString(fmt.Sprintf("  <chunk page=\"%d\"", chunk.PageNumber))
		if chunk.SectionTitle != "" {
			sb.WriteString(fmt.Sprintf(" section=\"%s\"", chunk.SectionTitle))
		}
		sb.WriteString(">\n")
		sb.WriteString("    ")
		sb.WriteString(strings.ReplaceAll(chunk.Content, "\n", "\n    "))
		sb.WriteString("\n  </chunk>\n")

		totalTokens += chunk.TokenEstimate
	}

	sb.WriteString("</untrusted_document>\n")
	return sb.String()
}
