import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chatStorage } from '../utils/chatStorage';
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
