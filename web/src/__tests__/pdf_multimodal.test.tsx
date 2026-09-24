import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api/client';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Composer } from '../components/chat/Composer';

describe('PDF Processing & Multimodal Document Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects direct image uploads (.png, .jpg) in Composer with clear guidance', async () => {
    render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        activeMode="contract"
        onModeChange={vi.fn()}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Attempt to upload a PNG image
    const fakeImageFile = new File(['fake-png-bytes'], 'contract_scan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [fakeImageFile] } });

    await waitFor(() => {
      expect(
        screen.getByText('Counsel currently supports text and PDF documents, not images.')
      ).toBeDefined();
    });
  });

  it('uploadDocument transmits pageImages and clientText in FormData payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        document: {
          id: 'doc_123',
          name: 'scanned_agreement.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          pageCount: 2,
          extractedTextLength: 0,
          extractionStatus: 'success',
          pageImages: ['data:image/jpeg;base64,page1', 'data:image/jpeg;base64,page2'],
        },
      }),
    } as any);

    const testFile = new File(['%PDF-1.4 dummy'], 'scanned_agreement.pdf', {
      type: 'application/pdf',
    });
    const sampleImages = ['data:image/jpeg;base64,page1', 'data:image/jpeg;base64,page2'];
    const sampleText = '--- Page 1 ---\nClause 1\n--- Page 2 ---\nClause 2';

    const res = await api.uploadDocument(testFile, sampleImages, sampleText);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe('/api/v1/documents');
    expect(options?.method).toBe('POST');

    const body = options?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeDefined();
    expect(body.get('pageImages')).toBe(JSON.stringify(sampleImages));
    expect(body.get('clientText')).toBe(sampleText);
    expect(res.document.id).toBe('doc_123');
    expect(res.document.pageImages?.length).toBe(2);
  });
});
