import { ClientEnvelope, ServerEnvelope } from '../types';

type EventListener = (event: ServerEnvelope) => void;

class CounselWebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners: Set<EventListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isExplicitlyClosed = false;
  private sseAbortController: AbortController | null = null;

  connect(token: string) {
    const tokenChanged = this.token !== token;
    this.token = token;
    this.isExplicitlyClosed = false;

    if (this.ws) {
      if (tokenChanged) {
        // Explicitly close stale connection to connect with new user token
        this.ws.close();
        this.ws = null;
      } else if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/chat?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startPing();
      };

      this.ws.onmessage = (e) => {
        try {
          const event: ServerEnvelope = JSON.parse(e.data);
          this.notifyListeners(event);
        } catch {
          // Ignore malformed payloads
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    this.token = null;
    this.stopPing();
    clearTimeout(this.reconnectTimer);
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.token) {
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.token) {
        this.connect(this.token);
      }
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: ServerEnvelope) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Send a client envelope.
   * If the WebSocket connection is active, dispatches over WebSocket.
   * In serverless environments (e.g. Vercel) or when WebSocket is disconnected,
   * seamlessly falls back to HTTP Server-Sent Events (SSE) streaming over POST /api/v1/chat/stream.
   */
  send(envelope: ClientEnvelope): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
      return true;
    }

    // Seamless Serverless / SSE fallback
    this.streamViaSSE(envelope);
    return true;
  }

  cancel(conversationId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'message.cancel',
        conversationId,
      }));
    }
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
      this.notifyListeners({
        type: 'message.cancel',
        conversationId,
      });
    }
  }

  /**
   * HTTP Server-Sent Events (SSE) streaming fallback for serverless deployments.
   */
  private async streamViaSSE(envelope: ClientEnvelope) {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
    }
    const abortController = new AbortController();
    this.sseAbortController = abortController;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}: Stream request failed`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMsg = errData.error.message;
          }
        } catch {
          // ignore
        }
        this.notifyListeners({
          type: 'message.error',
          conversationId: envelope.conversationId,
          errorCode: 'STREAM_ERROR',
          errorMessage: errMsg,
        });
        return;
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser or empty body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr) {
                try {
                  const event: ServerEnvelope = JSON.parse(dataStr);
                  this.notifyListeners(event);
                } catch {
                  // ignore malformed payloads
                }
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr) {
              try {
                const event: ServerEnvelope = JSON.parse(dataStr);
                this.notifyListeners(event);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        this.notifyListeners({
          type: 'message.cancel',
          conversationId: envelope.conversationId,
        });
        return;
      }
      this.notifyListeners({
        type: 'message.error',
        conversationId: envelope.conversationId,
        errorCode: 'STREAM_EXCEPTION',
        errorMessage: err?.message || 'Streaming failed',
      });
    } finally {
      if (this.sseAbortController === abortController) {
        this.sseAbortController = null;
      }
    }
  }
}

export const wsClient = new CounselWebSocketClient();
