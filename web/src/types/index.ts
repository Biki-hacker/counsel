export type LegalMode =
  | 'contract'
  | 'criminal'
  | 'civil'
  | 'clause'
  | 'doc_review'
  | 'compare'
  | 'prep_lawyer'
  | 'general';

export type Jurisdiction = 'in' | 'us' | 'uk' | 'eu' | 'general';

export type AIProvider = 'google' | 'nvidia';

export type AIMode = 'normal' | 'thinking';

export interface CanonicalUser {
  id: string;
  email: string;
  normalizedEmail?: string;
  displayName: string;
  photoUrl?: string;
  jurisdiction: Jurisdiction;
  preferredProvider: AIProvider;
  thinkingDefault: boolean;
  theme: 'light' | 'dark' | 'system';
  createdAt?: string;
}

export interface SourceReference {
  documentId?: string;
  documentName: string;
  pageNumber?: number;
  sectionTitle?: string;
  snippet?: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
}

export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MessageAttachment[];
  documentIds?: string[];
  sources?: SourceReference[];
  usageUnits?: number;
  status: MessageStatus;
  model?: string;
  provider?: AIProvider;
  mode?: LegalMode;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  legalMode: LegalMode;
  jurisdiction: Jurisdiction;
  aiProvider: AIProvider;
  aiMode: AIMode;
  documentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  pageNumber: number;
  sectionTitle?: string;
  content: string;
  tokenEstimate: number;
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  extractedTextLength: number;
  extractionStatus: string;
  chunks?: DocumentChunk[];
  pageImages?: string[];
  createdAt: string;
}

export interface UsageQuota {
  userId: string;
  dailyAllowance: number;
  usedToday: number;
  reservedUnits: number;
  resetAt: string;
}

export interface ServerEnvelope {
  type: 'message.start' | 'message.status' | 'message.delta' | 'message.source' | 'message.complete' | 'message.error' | 'message.cancel' | 'pong';
  messageId?: string;
  conversationId?: string;
  statusText?: string;
  delta?: string;
  source?: SourceReference;
  usageUnits?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ClientEnvelope {
  type: 'message.send' | 'message.cancel' | 'ping';
  conversationId?: string;
  prompt?: string;
  legalMode?: LegalMode;
  jurisdiction?: Jurisdiction;
  aiProvider?: AIProvider;
  aiMode?: AIMode;
  documentIds?: string[];
  pageImages?: string[];
}
