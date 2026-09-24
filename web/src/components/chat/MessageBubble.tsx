import React, { useState } from 'react';
import { Message } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceCard } from './SourceCard';
import { Copy, Check, RefreshCw, AlertCircle, Scale, FileText } from 'lucide-react';

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MessageBubbleProps {
  message: Message;
  statusText?: string;
  onRetry?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, statusText, onRetry }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '1.5rem',
        width: '100%',
      }}
    >
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
        {!isUser && (
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
        )}
        {message.mode && (
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
            {message.mode.replace('_', ' ')}
          </span>
        )}
      </div>

      <div
        style={{
          maxWidth: isUser ? '85%' : '100%',
          backgroundColor: isUser ? 'var(--surface-raised)' : 'transparent',
          border: isUser ? '1px solid var(--border)' : 'none',
          padding: isUser ? '0.85rem 1.15rem' : '0.2rem 0',
          borderRadius: isUser ? 'var(--radius-lg) var(--radius-lg) 2px var(--radius-lg)' : '0',
          color: 'var(--text-primary)',
          boxShadow: isUser ? 'var(--shadow-sm)' : 'none',
          overflowWrap: 'break-word',
        }}
      >
        {isUser ? (
          <div>
            {/* Attached file cards like ChatGPT, Claude, Gemini */}
            {message.attachments && message.attachments.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  marginBottom: message.content ? '0.75rem' : '0',
                }}
              >
                {message.attachments.map((att) => {
                  const isPdf =
                    att.name.toLowerCase().endsWith('.pdf') ||
                    (att.mimeType && att.mimeType.toLowerCase().includes('pdf'));

                  const metaParts: string[] = [];
                  if (isPdf) {
                    metaParts.push('PDF');
                  } else {
                    metaParts.push('Document');
                  }
                  if (att.pageCount && att.pageCount > 0) {
                    metaParts.push(`${att.pageCount} page${att.pageCount > 1 ? 's' : ''}`);
                  }
                  const sizeStr = formatFileSize(att.sizeBytes);
                  if (sizeStr) {
                    metaParts.push(sizeStr);
                  }

                  return (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        minWidth: '200px',
                        maxWidth: '100%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isPdf ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-subtle)',
                          color: isPdf ? '#ef4444' : 'var(--accent)',
                          flexShrink: 0,
                        }}
                      >
                        <FileText size={18} />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          title={att.name}
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {att.name}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginTop: '1px',
                          }}
                        >
                          {metaParts.join(' • ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {message.content && (
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{message.content}</p>
            )}
          </div>
        ) : (
          <div>
            {message.status === 'streaming' && !message.content && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '13.5px',
                  fontStyle: 'italic',
                  padding: '0.5rem 0',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                    animation: 'pulse 1.2s infinite ease-in-out',
                  }}
                />
                <span>{statusText || 'Analyzing document provisions...'}</span>
              </div>
            )}

            {message.content && <MarkdownRenderer content={message.content} />}

            {message.status === 'failed' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--attention-bg)',
                  border: '1px solid var(--attention-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  marginTop: '0.75rem',
                }}
              >
                <AlertCircle size={16} style={{ color: 'var(--attention)' }} />
                <span>An error interrupted this response.</span>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    style={{
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontWeight: 600,
                      color: 'var(--accent)',
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            {/* Source Reference Badges */}
            {message.sources && message.sources.length > 0 && (
              <div style={{ marginTop: '0.85rem' }}>
                {message.sources.map((src, sIdx) => (
                  <SourceCard key={sIdx} source={src} />
                ))}
              </div>
            )}

            {/* Assistant Action Bar (Copy) */}
            {message.status === 'completed' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  marginTop: '0.75rem',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                <button
                  onClick={handleCopy}
                  title="Copy explanation"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '4px',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {copied ? <Check size={13} style={{ color: 'var(--safe)' }} /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                {message.usageUnits ? <span>• {message.usageUnits} units</span> : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
