import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, ArrowUp, Square, FileText, X, AlertCircle, Mic, Loader2 } from 'lucide-react';
import { LegalMode, Document, Jurisdiction } from '../../types';
import { api } from '../../api/client';
import { CustomSelect, CustomSelectOption } from '../common/CustomSelect';
import { processPDFFile } from '../../utils/pdfProcessor';

const LEGAL_MODE_OPTIONS: CustomSelectOption<LegalMode>[] = [
  { value: 'general', label: 'Mode: General', description: 'Broad legal queries and guidance' },
  { value: 'contract', label: 'Mode: Contract', description: 'Review obligations, terms & breaches' },
  { value: 'clause', label: 'Mode: Clause', description: 'Examine specific risk and enforceability' },
  { value: 'civil', label: 'Mode: Civil', description: 'Property, contracts & tort claims' },
  { value: 'criminal', label: 'Mode: Criminal', description: 'Offenses, procedural rights & bail' },
  { value: 'doc_review', label: 'Mode: Doc Review', description: 'Deep provision and risk scanning' },
  { value: 'compare', label: 'Mode: Compare', description: 'Identify changes and added burdens' },
  { value: 'prep_lawyer', label: 'Mode: Prep for Lawyer', description: 'Structured briefing outline' },
];

interface ComposerProps {
  onSend: (text: string, mode: LegalMode, attachedDocs: Document[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  activeMode: LegalMode;
  onModeChange: (mode: LegalMode) => void;
  presetPrompt?: string;
  jurisdiction?: Jurisdiction;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  onStop,
  isStreaming,
  activeMode,
  onModeChange,
  presetPrompt,
  jurisdiction = 'in',
}) => {
  const [text, setText] = useState('');
  const [attachedDocs, setAttachedDocs] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');

  useEffect(() => {
    if (presetPrompt) {
      setText(presetPrompt);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [presetPrompt]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  // Clean up STT on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorMessage('Local speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;

      // Local multilingual speech recognition matching jurisdiction locale
      let lang = navigator.language || 'en-US';
      if (jurisdiction === 'in') {
        lang = 'en-IN';
      } else if (jurisdiction === 'us') {
        lang = 'en-US';
      } else if (jurisdiction === 'uk') {
        lang = 'en-GB';
      } else if (jurisdiction === 'eu') {
        lang = 'en-GB';
      }
      recognition.lang = lang;

      baseTextRef.current = text;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscripts = '';
        let interimTranscripts = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item[0]) {
            if (item.isFinal) {
              finalTranscripts += item[0].transcript;
            } else {
              interimTranscripts += item[0].transcript;
            }
          }
        }

        const prefix = baseTextRef.current
          ? baseTextRef.current.endsWith(' ')
            ? baseTextRef.current
            : baseTextRef.current + ' '
          : '';

        if (finalTranscripts) {
          baseTextRef.current = prefix + finalTranscripts.trim() + ' ';
        }

        const currentSpeech = (finalTranscripts + interimTranscripts).trim();
        if (currentSpeech) {
          setText(prefix + currentSpeech);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setErrorMessage('Microphone access denied. Please grant microphone permissions in your browser.');
          setTimeout(() => setErrorMessage(null), 5000);
          setIsListening(false);
        } else if (event.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
      setIsListening(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (isStreaming) return;
    if (isListening) {
      stopListening();
    }
    const trimmed = text.trim();
    if (!trimmed && attachedDocs.length === 0) return;

    onSend(trimmed, activeMode, attachedDocs);
    setText('');
    setAttachedDocs([]);
    setErrorMessage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers change
    e.target.value = '';

    const lowerName = file.name.toLowerCase();
    if (
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.webp') ||
      file.type.startsWith('image/')
    ) {
      setErrorMessage('Counsel currently supports text and PDF documents, not images.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('This document is too large to process. Try a document under 20MB.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const isPDF = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
      let pageImages: string[] | undefined;
      let clientText: string | undefined;

      if (isPDF) {
        setUploadStatus('Rendering PDF pages for visual inspection...');
        const processed = await processPDFFile(file, {
          onProgress: (current, total) => {
            setUploadStatus(`Rendering PDF page ${current} of ${total}...`);
          },
        });
        pageImages = processed.pageImages;
        clientText = processed.extractedText;
      }

      setUploadStatus('Uploading document...');
      const res = await api.uploadDocument(file, pageImages, clientText);
      setAttachedDocs((prev) => [...prev, res.document]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read document');
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  const removeDoc = (id: string) => {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div
      style={{
        maxWidth: '820px',
        width: '100%',
        margin: '0 auto',
        padding: '0 1rem 1rem',
      }}
    >
      {/* Error alert */}
      {errorMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.85rem',
            backgroundColor: 'var(--attention-bg)',
            border: '1px solid var(--attention-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12.5px',
            color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          <AlertCircle size={14} style={{ color: 'var(--attention)', flexShrink: 0 }} />
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ marginLeft: 'auto', padding: '0.1rem' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Composer Box */}
      <div
        style={{
          backgroundColor: 'var(--composer-bg)',
          border: '1px solid var(--composer-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '0.75rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          transition: 'border-color var(--duration-fast)',
        }}
      >
        {/* Attached Documents Row */}
        {attachedDocs.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
              paddingBottom: '0.4rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            {attachedDocs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.55rem',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              >
                <FileText size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.name}
                </span>
                {doc.pageImages && doc.pageImages.length > 0 && (
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    ({doc.pageImages.length}p)
                  </span>
                )}
                <button
                  onClick={() => removeDoc(doc.id)}
                  style={{
                    padding: '0.1rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Visual Progress Status during PDF Page Rendering / Upload */}
        {uploadStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.25rem 0.6rem',
              fontSize: '12px',
              color: 'var(--accent)',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-subtle)',
              borderRadius: 'var(--radius-sm)',
              animation: 'fadeIn 150ms ease-out',
            }}
          >
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            <span>{uploadStatus}</span>
          </div>
        )}

        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your legal problem, paste a clause, or attach a contract..."
          rows={1}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: '15px',
            lineHeight: 1.55,
            color: 'var(--text-primary)',
            maxHeight: '180px',
          }}
        />

        {/* Bottom Control Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* Attachment Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept=".pdf,.txt,.md"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isStreaming}
              title={isUploading ? (uploadStatus || 'Processing document...') : 'Attach PDF or Text document'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                color: isUploading ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: 'var(--surface-raised)',
                transition: 'all var(--duration-fast)',
                cursor: isUploading || isStreaming ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isUploading && !isStreaming) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isUploading && !isStreaming) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
                }
              }}
            >
              {isUploading ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Paperclip size={16} />
              )}
            </button>

            {/* Modern Custom Mode Selector Pill */}
            <CustomSelect<LegalMode>
              value={activeMode}
              onChange={onModeChange}
              options={LEGAL_MODE_OPTIONS}
              variant="pill"
              direction="up"
              menuMinWidth="240px"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* Listening Live Indicator if active */}
            {isListening && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '11.5px',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  backgroundColor: 'var(--accent-subtle)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  marginRight: '0.15rem',
                  animation: 'fadeIn 150ms ease-out',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                    animation: 'pulse 1s infinite ease-in-out',
                  }}
                />
                <span>Listening...</span>
              </div>
            )}

            {/* Mic Icon Button (on the left side of the Input arrow) */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isStreaming}
              title={
                isListening
                  ? 'Listening... Click to stop voice dictation'
                  : `Speech-to-Text (${jurisdiction === 'in' ? 'en-IN' : jurisdiction === 'uk' ? 'en-GB' : 'en-US'})`
              }
              aria-label="Speech to Text"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isListening ? 'var(--accent-subtle)' : 'var(--surface-raised)',
                border: isListening ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: isListening ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                opacity: isStreaming ? 0.5 : 1,
                transition: 'all var(--duration-fast)',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isListening && !isStreaming) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isListening && !isStreaming) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
                }
              }}
            >
              <Mic size={16} style={isListening ? { animation: 'pulse 1.2s infinite ease-in-out' } : undefined} />
              {isListening && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent)',
                  }}
                />
              )}
            </button>

            {/* Input Arrow (Send Message) or Stop Button */}
            {isStreaming ? (
              <button
                onClick={onStop}
                title="Stop generating"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--attention)',
                  color: '#FFFFFF',
                }}
              >
                <Square size={14} fill="#FFFFFF" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim() && attachedDocs.length === 0}
                title="Send message"
                aria-label="Send message"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: text.trim() || attachedDocs.length > 0 ? 'var(--accent)' : 'var(--surface-raised)',
                  color: text.trim() || attachedDocs.length > 0 ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: text.trim() || attachedDocs.length > 0 ? 'pointer' : 'default',
                  transition: 'all var(--duration-fast)',
                }}
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
