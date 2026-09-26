import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chatStorage, groupConversationsByDate } from '../utils/chatStorage';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { ConversationArea } from '../components/chat/ConversationArea';
import { Message, Conversation } from '../types';

describe('Chat Storage and Typing Bubble Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('persists and retrieves conversations and messages from localStorage', () => {
    const mockConv: Conversation = {
      id: 'cnv_test_101',
      userId: 'usr_test',
      title: 'Employment Agreement Review',
      legalMode: 'general',
      jurisdiction: 'in',
      aiProvider: 'nvidia',
      aiMode: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockMessages: Message[] = [
      {
        id: 'msg_u1',
        conversationId: 'cnv_test_101',
        userId: 'usr_test',
        role: 'user',
        content: 'Please evaluate the non-compete clause in clause 4.',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_a1',
        conversationId: 'cnv_test_101',
        userId: 'usr_test',
        role: 'assistant',
        content: 'Under Section 27 of the Indian Contract Act, 1872, restrictive non-competes are void.',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
    ];

    chatStorage.saveConversation(mockConv, mockMessages);
    chatStorage.setActiveConvId(mockConv.id);

    // Verify stored conversation
    const stored = chatStorage.getStoredConversation('cnv_test_101');
    expect(stored).not.toBeNull();
    expect(stored?.conversation?.title).toBe('Employment Agreement Review');
    expect(stored?.messages.length).toBe(2);
    expect(stored?.messages[0].content).toContain('non-compete');

    // Verify active conversation ID
    expect(chatStorage.getActiveConvId()).toBe('cnv_test_101');

    // Verify conversation list
    const convs = chatStorage.getStoredConversations();
    expect(convs.length).toBe(1);
    expect(convs[0].id).toBe('cnv_test_101');
  });

  it('groups conversations into chronological periods like Gemini (Today, Yesterday, Previous 7 Days, Older)', () => {
    const now = new Date();
    const today = new Date(now.getTime() - 1000 * 60).toISOString();
    const yesterday = new Date(now.getTime() - 86400000 * 1.2).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 86400000 * 3).toISOString();
    const fortyDaysAgo = new Date(now.getTime() - 86400000 * 40).toISOString();

    const mockConvs: Conversation[] = [
      {
        id: 'c_today',
        userId: 'u1',
        title: 'Today Chat',
        legalMode: 'general',
        jurisdiction: 'in',
        aiProvider: 'nvidia',
        aiMode: 'normal',
        createdAt: today,
        updatedAt: today,
      },
      {
        id: 'c_yesterday',
        userId: 'u1',
        title: 'Yesterday Chat',
        legalMode: 'general',
        jurisdiction: 'in',
        aiProvider: 'nvidia',
        aiMode: 'normal',
        createdAt: yesterday,
        updatedAt: yesterday,
      },
      {
        id: 'c_3days',
        userId: 'u1',
        title: '3 Days Ago Chat',
        legalMode: 'general',
        jurisdiction: 'in',
        aiProvider: 'nvidia',
        aiMode: 'normal',
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
      },
      {
        id: 'c_older',
        userId: 'u1',
        title: 'Older Chat',
        legalMode: 'general',
        jurisdiction: 'in',
        aiProvider: 'nvidia',
        aiMode: 'normal',
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
      },
    ];

    const groups = groupConversationsByDate(mockConvs);

    expect(groups.length).toBe(4);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].conversations[0].id).toBe('c_today');

    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].conversations[0].id).toBe('c_yesterday');

    expect(groups[2].label).toBe('Previous 7 Days');
    expect(groups[2].conversations[0].id).toBe('c_3days');

    expect(groups[3].label).toBe('Older');
    expect(groups[3].conversations[0].id).toBe('c_older');
  });

  it('keeps multi-turn conversation messages together in one conversation thread', () => {
    const convId = 'cnv_multiturn_1';
    const conv: Conversation = {
      id: convId,
      userId: 'usr_multiturn',
      title: 'New Legal Consultation',
      legalMode: 'general',
      jurisdiction: 'in',
      aiProvider: 'google',
      aiMode: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    chatStorage.saveConversation(conv);

    // Turn 1
    const msgsTurn1: Message[] = [
      {
        id: 'm1',
        conversationId: convId,
        userId: 'usr_multiturn',
        role: 'user',
        content: 'What is arbitration?',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'm2',
        conversationId: convId,
        userId: 'usr_multiturn',
        role: 'assistant',
        content: 'Arbitration is an ADR mechanism.',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
    ];
    chatStorage.saveMessages(convId, msgsTurn1);

    // Turn 2 in SAME conversation
    const msgsTurn2: Message[] = [
      ...msgsTurn1,
      {
        id: 'm3',
        conversationId: convId,
        userId: 'usr_multiturn',
        role: 'user',
        content: 'How does it compare to mediation?',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'm4',
        conversationId: convId,
        userId: 'usr_multiturn',
        role: 'assistant',
        content: 'Mediation is non-binding whereas arbitration awards are binding.',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
    ];
    chatStorage.saveMessages(convId, msgsTurn2);

    const stored = chatStorage.getStoredConversation(convId);
    expect(stored).not.toBeNull();
    // All 4 messages should be together in this single conversation
    expect(stored?.messages.length).toBe(4);
    expect(stored?.messages[0].content).toBe('What is arbitration?');
    expect(stored?.messages[2].content).toBe('How does it compare to mediation?');

    // Title should have been dynamically updated from first user message
    const convs = chatStorage.getStoredConversations();
    expect(convs.length).toBe(1);
    expect(convs[0].title).toBe('What is arbitration?');
  });

  it('renders Instagram/WhatsApp typing chat bubble with 3 bouncing dots and status pill', () => {
    const { container } = render(
      <TypingIndicator statusText="Counsel is reviewing statutory precedents..." mode="general" />
    );

    // Header badge
    expect(screen.getByText('Counsel')).toBeDefined();
    expect(screen.getByText(/general/i)).toBeDefined();

    // Bubble and 3 animated dots
    const bubble = container.querySelector('.typing-bubble');
    expect(bubble).toBeDefined();
    expect(bubble?.getAttribute('aria-label')).toBe('Counsel is typing...');

    const dots = container.querySelectorAll('.typing-dot');
    expect(dots.length).toBe(3);

    // Status pill
    expect(screen.getByText('Counsel is reviewing statutory precedents...')).toBeDefined();
  });

  it('renders TypingIndicator inside ConversationArea when isStreaming is true', () => {
    const messages: Message[] = [
      {
        id: 'msg_user_1',
        conversationId: 'cnv_1',
        userId: 'usr_1',
        role: 'user',
        content: 'What is the governing stamp duty rate?',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
    ];

    const { container } = render(
      <ConversationArea
        messages={messages}
        isStreaming={true}
        statusText="Counsel is reviewing legal context..."
        onSelectAction={vi.fn()}
        onOpenCompare={vi.fn()}
        onOpenLawyerPrep={vi.fn()}
      />
    );

    // Verify user message is visible
    expect(screen.getByText('What is the governing stamp duty rate?')).toBeDefined();

    // Verify typing indicator bubble is rendered immediately
    const bubble = container.querySelector('.typing-bubble');
    expect(bubble).toBeDefined();
    expect(screen.getByText('Counsel is reviewing legal context...')).toBeDefined();
  });
});
