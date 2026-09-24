import * as pdfjsLib from 'pdfjs-dist';

// Ensure PDF.js worker is pointed to local static asset
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface ProcessedPDF {
  pageCount: number;
  extractedText: string;
  pageImages: string[];
}

export interface PDFProcessOptions {
  maxPages?: number;
  targetMaxDimension?: number;
  jpegQuality?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * processPDFFile loads a PDF file in the browser, extracts any embedded text,
 * and renders up to `maxPages` pages as JPEG Data URLs (base64) using an offscreen canvas.
 * This guarantees OCR-independent visual understanding for vision models even with
 * scanned, stamped, or image-heavy legal documents.
 */
export async function processPDFFile(
  file: File,
  options: PDFProcessOptions = {}
): Promise<ProcessedPDF> {
  const {
    maxPages = 20,
    targetMaxDimension = 1200,
    jpegQuality = 0.82,
    onProgress,
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pagesToProcess = Math.min(totalPages, maxPages);

  const textSnippets: string[] = [];
  const pageImages: string[] = [];

  for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
    onProgress?.(pageNum, pagesToProcess);
    try {
      const page = await pdf.getPage(pageNum);

      // 1. Extract embedded text content
      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ')
          .trim();

        if (pageText) {
          textSnippets.push(`--- Page ${pageNum} ---\n${pageText}`);
        }
      } catch (textErr) {
        console.warn(`[pdfProcessor] Failed to extract text for page ${pageNum}:`, textErr);
      }

      // 2. Render page to canvas as image for vision model inspection
      if (typeof document !== 'undefined') {
        try {
          const unscaledViewport = page.getViewport({ scale: 1.0 });
          const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
          // Scale to target dimension (~1200px) bounded between 1.0x and 2.0x
          const scale = maxDim > 0
            ? Math.min(2.0, Math.max(1.0, targetMaxDimension / maxDim))
            : 1.5;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          const ctx = canvas.getContext('2d');
          if (ctx) {
            // White background (PDF canvases can be transparent by default)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const renderContext = {
              canvasContext: ctx,
              viewport,
              canvas,
            };

            await page.render(renderContext).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
            pageImages.push(dataUrl);
          }
        } catch (renderErr) {
          console.warn(`[pdfProcessor] Failed to render image for page ${pageNum}:`, renderErr);
        }
      }
    } catch (pageErr) {
      console.warn(`[pdfProcessor] Failed to process page ${pageNum}:`, pageErr);
    }
  }

  return {
    pageCount: totalPages,
    extractedText: textSnippets.join('\n\n'),
    pageImages,
  };
}
