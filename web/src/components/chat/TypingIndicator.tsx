import React from 'react';
import { Scale, Sparkles } from 'lucide-react';

interface TypingIndicatorProps {
  statusText?: string;
  mode?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ statusText, mode }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginBottom: '1.5rem',
        width: '100%',
        animation: 'fadeIn 200ms ease-out',
      }}
    >
      {/* Sender Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '11.5px',
          color: 'var(--text-muted)',
          marginBottom: '0.35rem',
          padding: '0 0.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          <Scale size={13} />
          <span>Counsel</span>
        </div>
        {mode && (
          <span
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '10px',
              backgroundColor: 'var(--surface-raised)',
              padding: '0.1rem 0.35rem',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {mode.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* WhatsApp / Instagram Chat Bubble with 3 Bouncing Dots */}
      <div className="typing-bubble-wrapper">
        <div className="typing-bubble" aria-label="Counsel is typing...">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>

        {statusText && (
          <div className="typing-status-pill">
            <Sparkles size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>{statusText}</span>
          </div>
        )}
      </div>
    </div>
  );
};
