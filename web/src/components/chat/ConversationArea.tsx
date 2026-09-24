import React, { useRef, useEffect } from 'react';
import { Message, LegalMode } from '../../types';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';

interface ConversationAreaProps {
  messages: Message[];
  statusText?: string;
  onSelectAction: (prompt: string, mode: LegalMode) => void;
  onOpenCompare: () => void;
  onOpenLawyerPrep: () => void;
  onRetry?: () => void;
}

export const ConversationArea: React.FC<ConversationAreaProps> = ({
  messages,
  statusText,
  onSelectAction,
  onOpenCompare,
  onOpenLawyerPrep,
  onRetry,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusText]);

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
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            statusText={statusText}
            onRetry={onRetry}
          />
        ))}
        <div ref={bottomRef} style={{ height: '1px' }} />
      </div>
    </div>
  );
};
