import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wsClient } from '../api/ws';
import { ServerEnvelope } from '../types';

describe('Counsel Dual-Transport SSE Streaming Fallback', () => {
  beforeEach(() => {
    wsClient.disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams messages via SSE when WebSocket is not active', async () => {
    const receivedEvents: ServerEnvelope[] = [];
    const unsubscribe = wsClient.subscribe((event) => {
      receivedEvents.push(event);
    });

    const sseChunks = [
      'data: {"type":"message.start","conversationId":"cnv_sse","messageId":"msg_1"}\n\n',
      'data: {"type":"message.status","conversationId":"cnv_sse","statusText":"Analyzing statutes..."}\n\n',
      'data: {"type":"message.delta","conversationId":"cnv_sse","delta":"Under Indian Penal Code..."}\n\n',
      'data: {"type":"message.complete","conversationId":"cnv_sse","usageUnits":5}\n\n',
    ];

    let chunkIndex = 0;
    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < sseChunks.length) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(sseChunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });
    vi.stubGlobal('fetch', fetchSpy);

    wsClient.connect('token_test_user');
    // WebSocket is not opened, so send should trigger SSE stream
    wsClient.send({
      type: 'message.send',
      conversationId: 'cnv_sse',
      prompt: 'Summarize IPC Section 302',
      legalMode: 'criminal',
    });

    // Wait for the stream to read and flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/chat/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_test_user',
        }),
      })
    );

    expect(receivedEvents.length).toBe(4);
    expect(receivedEvents[0].type).toBe('message.start');
    expect(receivedEvents[1].type).toBe('message.status');
    expect(receivedEvents[1].statusText).toBe('Analyzing statutes...');
    expect(receivedEvents[2].type).toBe('message.delta');
    expect(receivedEvents[2].delta).toBe('Under Indian Penal Code...');
    expect(receivedEvents[3].type).toBe('message.complete');
    expect(receivedEvents[3].usageUnits).toBe(5);

    unsubscribe();
  });

  it('handles stream abort when cancel is invoked', async () => {
    const receivedEvents: ServerEnvelope[] = [];
    const unsubscribe = wsClient.subscribe((event) => {
      receivedEvents.push(event);
    });

    let abortSignalPassed: AbortSignal | null = null;
    const fetchSpy = vi.fn().mockImplementation((_url: string, options: any) => {
      abortSignalPassed = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    wsClient.send({
      type: 'message.send',
      conversationId: 'cnv_to_cancel',
      prompt: 'Draft an NDA',
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect((abortSignalPassed as AbortSignal | null)?.aborted).toBe(false);

    // Cancel consultation
    wsClient.cancel('cnv_to_cancel');

    expect((abortSignalPassed as AbortSignal | null)?.aborted).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const cancelEvent = receivedEvents.find((e) => e.type === 'message.cancel');
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent?.conversationId).toBe('cnv_to_cancel');

    unsubscribe();
  });

  it('handles server HTTP error gracefully and emits message.error', async () => {
    const receivedEvents: ServerEnvelope[] = [];
    const unsubscribe = wsClient.subscribe((event) => {
      receivedEvents.push(event);
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Daily quota exceeded' },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    wsClient.send({
      type: 'message.send',
      conversationId: 'cnv_limited',
      prompt: 'Exceed quota test',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe('message.error');
    expect(receivedEvents[0].errorMessage).toBe('Daily quota exceeded');

    unsubscribe();
  });
});
