import { CanonicalUser, Conversation, Document, Message, UsageQuota } from '../types';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.error?.message || `HTTP ${response.status}: Request failed`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  async authSession(token: string, displayName?: string): Promise<{ user: CanonicalUser }> {
    return this.request<{ user: CanonicalUser }>('/api/v1/auth/session', {
      method: 'POST',
      body: JSON.stringify({ token, displayName }),
    });
  }

  async getMe(): Promise<{ user: CanonicalUser; quota: UsageQuota }> {
    return this.request<{ user: CanonicalUser; quota: UsageQuota }>('/api/v1/me');
  }

  async updateMe(data: Partial<CanonicalUser>): Promise<{ user: CanonicalUser }> {
    return this.request<{ user: CanonicalUser }>('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMe(): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('/api/v1/me', {
      method: 'DELETE',
    });
  }

  async listConversations(): Promise<{ conversations: Conversation[] }> {
    return this.request<{ conversations: Conversation[] }>('/api/v1/conversations');
  }

  async createConversation(data: Partial<Conversation>): Promise<{ conversation: Conversation }> {
    return this.request<{ conversation: Conversation }>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
    return this.request<{ conversation: Conversation; messages: Message[] }>(`/api/v1/conversations/${id}`);
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<{ conversation: Conversation }> {
    return this.request<{ conversation: Conversation }>(`/api/v1/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteConversation(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/api/v1/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  async uploadDocument(file: File, pageImages?: string[], clientText?: string): Promise<{ document: Document }> {
    const formData = new FormData();
    formData.append('file', file);
    if (pageImages && pageImages.length > 0) {
      formData.append('pageImages', JSON.stringify(pageImages));
    }
    if (clientText) {
      formData.append('clientText', clientText);
    }

    return this.request<{ document: Document }>('/api/v1/documents', {
      method: 'POST',
      body: formData,
    });
  }

  async listDocuments(): Promise<{ documents: Document[] }> {
    return this.request<{ documents: Document[] }>('/api/v1/documents');
  }

  async deleteDocument(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/api/v1/documents/${id}`, {
      method: 'DELETE',
    });
  }

  async getUsage(): Promise<{ quota: UsageQuota }> {
    return this.request<{ quota: UsageQuota }>('/api/v1/usage');
  }

  async seedDemoData(): Promise<{ message: string; documents: Document[] }> {
    return this.request<{ message: string; documents: Document[] }>('/api/v1/demo/seed');
  }
}

export const api = new ApiClient();
