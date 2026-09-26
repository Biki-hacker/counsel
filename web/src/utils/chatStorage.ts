import { Conversation, Message } from '../types';

const CONVERSATIONS_KEY = 'counsel_conversations_v1';
const MESSAGES_PREFIX = 'counsel_messages_v1_';
const ACTIVE_CONV_KEY = 'counsel_active_conv_id_v1';

export const chatStorage = {
  getStoredConversations(): Conversation[] {
    try {
      const raw = localStorage.getItem(CONVERSATIONS_KEY);
      if (!raw) return [];
      const list: Conversation[] = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  getStoredMessages(convId: string): Message[] {
    try {
      const raw = localStorage.getItem(`${MESSAGES_PREFIX}${convId}`);
      if (!raw) return [];
      const list: Message[] = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  getStoredConversation(convId: string): { conversation?: Conversation; messages: Message[] } | null {
    const convs = this.getStoredConversations();
    const conv = convs.find((c) => c.id === convId);
    const messages = this.getStoredMessages(convId);
    if (!conv && messages.length === 0) return null;
    return { conversation: conv, messages };
  },

  saveConversation(conv: Conversation, messages?: Message[]) {
    try {
      const convs = this.getStoredConversations();
      const existingIdx = convs.findIndex((c) => c.id === conv.id);
      if (existingIdx >= 0) {
        convs[existingIdx] = { ...convs[existingIdx], ...conv, updatedAt: new Date().toISOString() };
      } else {
        convs.unshift(conv);
      }
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));

      if (messages) {
        localStorage.setItem(`${MESSAGES_PREFIX}${conv.id}`, JSON.stringify(messages));
      }
    } catch (e) {
      console.warn('Failed to save conversation to localStorage', e);
    }
  },

  saveConversations(convs: Conversation[]) {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    } catch (e) {
      console.warn('Failed to save conversations to localStorage', e);
    }
  },

  saveMessages(convId: string, messages: Message[]) {
    try {
      localStorage.setItem(`${MESSAGES_PREFIX}${convId}`, JSON.stringify(messages));

      // Also ensure the conversation's updatedAt timestamp and title are in sync
      const convs = this.getStoredConversations();
      const idx = convs.findIndex((c) => c.id === convId);
      if (idx >= 0) {
        convs[idx] = {
          ...convs[idx],
          updatedAt: new Date().toISOString(),
        };

        // If conversation title is generic, update it with first user message
        if (
          !convs[idx].title ||
          convs[idx].title === 'New Legal Consultation' ||
          convs[idx].title === 'Legal Consultation'
        ) {
          const firstUser = messages.find((m) => m.role === 'user');
          if (firstUser?.content) {
            const clean = firstUser.content.trim();
            convs[idx].title = clean.length > 40 ? clean.slice(0, 40) + '...' : clean;
          }
        }

        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
      }
    } catch (e) {
      console.warn('Failed to save messages to localStorage', e);
    }
  },

  deleteStoredConversation(convId: string) {
    try {
      const convs = this.getStoredConversations().filter((c) => c.id !== convId);
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
      localStorage.removeItem(`${MESSAGES_PREFIX}${convId}`);
      if (this.getActiveConvId() === convId) {
        this.setActiveConvId(null);
      }
    } catch (e) {
      console.warn('Failed to delete conversation from localStorage', e);
    }
  },

  getActiveConvId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_CONV_KEY);
    } catch {
      return null;
    }
  },

  setActiveConvId(convId: string | null) {
    try {
      if (convId) {
        localStorage.setItem(ACTIVE_CONV_KEY, convId);
      } else {
        localStorage.removeItem(ACTIVE_CONV_KEY);
      }
    } catch {
      // ignore
    }
  },
};

export interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

export function groupConversationsByDate(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const sevenDaysStart = todayStart - 7 * 86400000;
  const thirtyDaysStart = todayStart - 30 * 86400000;

  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const prev7Days: Conversation[] = [];
  const prev30Days: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt || conv.createdAt).getTime();
    if (d >= todayStart) {
      today.push(conv);
    } else if (d >= yesterdayStart) {
      yesterday.push(conv);
    } else if (d >= sevenDaysStart) {
      prev7Days.push(conv);
    } else if (d >= thirtyDaysStart) {
      prev30Days.push(conv);
    } else {
      older.push(conv);
    }
  }

  const groups: ConversationGroup[] = [];
  if (today.length > 0) groups.push({ label: 'Today', conversations: today });
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', conversations: yesterday });
  if (prev7Days.length > 0) groups.push({ label: 'Previous 7 Days', conversations: prev7Days });
  if (prev30Days.length > 0) groups.push({ label: 'Previous 30 Days', conversations: prev30Days });
  if (older.length > 0) groups.push({ label: 'Older', conversations: older });

  return groups;
}
