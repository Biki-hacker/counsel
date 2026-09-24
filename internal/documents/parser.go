package documents

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"counsel/internal/models"

	"github.com/google/uuid"
	"github.com/ledongthuc/pdf"
)

var (
	ErrUnsupportedMediaType = errors.New("Counsel currently supports text and PDF documents, not images")
	ErrFileTooLarge          = errors.New("document exceeds maximum permitted file size")
	ErrEmptyDocument         = errors.New("document contains no extractable text")
	ErrPoorQuality           = errors.New("I couldn't reliably read enough text from this document. Try a text-based PDF or paste the relevant section.")
)

// SectionRegex matches standard legal headings: "Section 3.1", "Clause 14", "Article IV", etc.
var sectionRegex = regexp.MustCompile(`(?i)(?:^|\n)\s*(?:section|clause|article|paragraph)\s*([0-9IVXLCDM]+(?:\.[0-9]+)*[:\s\-–]+[^\n]+)`)

type ExtractedDocument struct {
	Name                string
	MimeType            string
	SizeBytes           int64
	PageCount           int
	ExtractedTextLength int
	ExtractionStatus    string
	Chunks              []models.DocumentChunk
}

// Parse extracts text and structures it into referenceable chunks.
func Parse(filename string, mimeType string, r io.Reader, maxSizeBytes int64, maxPages int) (*ExtractedDocument, error) {
	return ParseWithImages(filename, mimeType, r, maxSizeBytes, maxPages, "", false)
}

// ParseWithImages extracts text, utilizing client-side extracted text or page images if OCR text is unretrievable.
func ParseWithImages(filename string, mimeType string, r io.Reader, maxSizeBytes int64, maxPages int, clientText string, hasImages bool) (*ExtractedDocument, error) {
	lowerMime := strings.ToLower(mimeType)
	lowerName := strings.ToLower(filename)

	// Explicitly check for raw images uploaded directly without PDF wrapper
	if !hasImages && (strings.HasPrefix(lowerMime, "image/") || strings.HasSuffix(lowerName, ".png") ||
		strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".jpeg") ||
		strings.HasSuffix(lowerName, ".webp") || strings.HasSuffix(lowerName, ".gif")) {
		return nil, ErrUnsupportedMediaType
	}

	data, err := io.ReadAll(io.LimitReader(r, maxSizeBytes+1024))
	if err != nil {
		return nil, fmt.Errorf("failed to read document: %w", err)
	}

	if int64(len(data)) > maxSizeBytes {
		return nil, ErrFileTooLarge
	}

	isPDF := strings.Contains(lowerMime, "pdf") || strings.HasSuffix(lowerName, ".pdf") || bytes.HasPrefix(data, []byte("%PDF-"))

	var pageTexts []string
	if isPDF {
		pageTexts, err = extractPDFText(data, maxPages)
		if err != nil && !hasImages {
			return nil, err
		}
	} else {
		// Plain text / Markdown
		text := string(data)
		if strings.TrimSpace(text) == "" && !hasImages {
			return nil, ErrEmptyDocument
		}
		pageTexts = []string{text}
	}

	totalLen := 0
	for _, p := range pageTexts {
		totalLen += len(p)
	}

	// Fallback to client-side extracted text if server extraction had low fidelity
	if totalLen < 20 && strings.TrimSpace(clientText) != "" {
		pageTexts = []string{strings.TrimSpace(clientText)}
		totalLen = len(pageTexts[0])
	}

	// If OCR extracted no text but we have page images rendered by the browser:
	// do NOT fail! The multimodal vision model will inspect the page images directly.
	if totalLen < 20 && hasImages {
		pageTexts = []string{"[Visual legal document page image rendered for multimodal vision analysis]"}
		totalLen = len(pageTexts[0])
	} else if totalLen < 20 {
		return nil, ErrPoorQuality
	}

	docID := "doc_" + uuid.New().String()
	chunks := ChunkDocument(docID, pageTexts)

	status := "success"
	if hasImages && totalLen <= 80 {
		status = "vision_multimodal"
	}

	return &ExtractedDocument{
		Name:                filename,
		MimeType:            mimeType,
		SizeBytes:           int64(len(data)),
		PageCount:           len(pageTexts),
		ExtractedTextLength: totalLen,
		ExtractionStatus:    status,
		Chunks:              chunks,
	}, nil
}

func extractPDFText(data []byte, maxPages int) ([]string, error) {
	readerAt := bytes.NewReader(data)
	pdfReader, err := pdf.NewReader(readerAt, int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("failed to parse PDF structure: %w", err)
	}

	numPages := pdfReader.NumPage()
	if numPages <= 0 {
		return nil, ErrEmptyDocument
	}

	limit := numPages
	if maxPages > 0 && limit > maxPages {
		limit = maxPages
	}

	var pages []string
	for i := 1; i <= limit; i++ {
		page := pdfReader.Page(i)
		text, err := page.GetPlainText(nil)
		if err != nil {
			// Some pages might be unreadable, continue to next
			text = ""
		}
		pages = append(pages, cleanText(text))
	}

	return pages, nil
}

func cleanText(s string) string {
	// Normalize line endings and non-printable characters
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", "    ")
	return strings.TrimSpace(s)
}
