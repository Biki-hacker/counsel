import React, { useRef, useEffect } from 'react';
import { Message, LegalMode } from '../../types';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { TypingIndicator } from './TypingIndicator';

interface ConversationAreaProps {
  messages: Message[];
  statusText?: string;
  isStreaming?: boolean;
  activeMode?: string;
  onSelectAction: (prompt: string, mode: LegalMode) => void;
  onOpenCompare: () => void;
  onOpenLawyerPrep: () => void;
  onRetry?: () => void;
}

export const ConversationArea: React.FC<ConversationAreaProps> = ({
  messages,
  statusText,
  isStreaming,
  activeMode,
  onSelectAction,
  onOpenCompare,
  onOpenLawyerPrep,
  onRetry,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  const isWaitingForAssistant =
    isStreaming &&
    (messages.length === 0 ||
      messages[messages.length - 1].role === 'user' ||
      (messages[messages.length - 1].role === 'assistant' &&
        !messages[messages.length - 1].content &&
        messages[messages.length - 1].status === 'streaming'));

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, statusText, isStreaming]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <EmptyState
          onSelectAction={onSelectAction}
          onOpenCompare={onOpenCompare}
          onOpenLawyerPrep={onOpenLawyerPrep}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem 1rem 0.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '820px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {messages
          .filter((msg) => msg.role !== 'assistant' || msg.content || msg.status === 'failed')
          .map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              statusText={statusText}
              onRetry={onRetry}
            />
          ))}
        {isWaitingForAssistant && (
          <TypingIndicator statusText={statusText || 'Counsel is typing...'} mode={activeMode} />
        )}
        <div ref={bottomRef} style={{ height: '1px' }} />
      </div>
    </div>
  );
};
