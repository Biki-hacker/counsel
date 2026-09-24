import React, { useState } from 'react';
import { X, GitCompare, Sparkles, FileText } from 'lucide-react';
import { Document } from '../../types';
import { api } from '../../api/client';
import { CustomSelect, CustomSelectOption } from '../common/CustomSelect';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDocs: Document[];
  onStartComparison: (prompt: string, docIds: string[]) => void;
}

export const CompareModal: React.FC<CompareModalProps> = ({
  isOpen,
  onClose,
  availableDocs,
  onStartComparison,
}) => {
  const [docAId, setDocAId] = useState<string>('');
  const [docBId, setDocBId] = useState<string>('');
  const [focusArea, setFocusArea] = useState<string>('');
  const [isSeeding, setIsSeeding] = useState(false);

  if (!isOpen) return null;

  const handleQuickSeedAndSelect = async () => {
    setIsSeeding(true);
    try {
      const res = await api.seedDemoData();
      if (res.documents.length >= 2) {
        setDocAId(res.documents[0].id);
        setDocBId(res.documents[1].id);
      }
    } catch {
      // Fallback
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docAId || !docBId) return;

    let prompt = 'Please perform an exhaustive comparison between Document A and Document B. Identify the Executive Difference, Material Changes, New Obligations Introduced, Removed Protections, and Changed Liability or Termination Terms.';
    if (focusArea.trim()) {
      prompt += ` Specifically pay attention to: ${focusArea.trim()}`;
    }

    onStartComparison(prompt, [docAId, docBId]);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitCompare size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Compare Two Agreements
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Spot material differences, added burdens, and removed rights
              </p>
            </div>
          </div>

          <button onClick={onClose} style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Quick 1-Click Demo Seed Button */}
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--surface-raised)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span>Test with Synthetic Original vs Revised Employment Contracts:</span>
            </div>
            <button
              type="button"
              onClick={handleQuickSeedAndSelect}
              disabled={isSeeding}
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--accent)',
                backgroundColor: 'var(--accent-subtle)',
                padding: '0.25rem 0.6rem',
                borderRadius: '4px',
              }}
            >
              {isSeeding ? 'Loading...' : 'Auto-Fill Sample'}
            </button>
          </div>

          {/* Document Options */}
          {(() => {
            const docOptions: CustomSelectOption<string>[] = [
              { value: '', label: 'Select agreement...', description: 'Choose from uploaded or demo documents' },
              ...availableDocs.map((d) => ({
                value: d.id,
                label: d.name,
                description: `${d.pageCount} page${d.pageCount === 1 ? '' : 's'} • ${(d.sizeBytes / 1024).toFixed(0)} KB`,
                icon: <FileText size={14} style={{ color: 'var(--accent)' }} />,
              })),
            ];

            return (
              <>
                {/* Document A Selector */}
                <CustomSelect<string>
                  label="Document A (Base Agreement)"
                  value={docAId}
                  onChange={(val) => setDocAId(val)}
                  options={docOptions}
                  placeholder="Select first agreement..."
                  variant="form"
                  prefixIcon={<FileText size={14} style={{ color: 'var(--accent)' }} />}
                />

                {/* Document B Selector */}
                <CustomSelect<string>
                  label="Document B (New / Proposed Amendment)"
                  value={docBId}
                  onChange={(val) => setDocBId(val)}
                  options={docOptions}
                  placeholder="Select second agreement..."
                  variant="form"
                  prefixIcon={<FileText size={14} style={{ color: 'var(--accent)' }} />}
                />
              </>
            );
          })()}

          {/* Optional Focus Area */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
              Specific Focus Area (Optional)
            </label>
            <input
              type="text"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="e.g. Non-compete restrictions, liability caps, or termination notice"
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!docAId || !docBId}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--accent)',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                cursor: docAId && docBId ? 'pointer' : 'default',
                opacity: docAId && docBId ? 1 : 0.6,
              }}
            >
              Run Comparison
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
