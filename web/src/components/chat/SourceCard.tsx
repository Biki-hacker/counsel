import React from 'react';
import { FileText, Bookmark } from 'lucide-react';
import { SourceReference } from '../../types';

interface SourceCardProps {
  source: SourceReference;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.25rem 0.6rem',
        backgroundColor: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        marginRight: '0.5rem',
        marginBottom: '0.4rem',
      }}
      title={source.snippet || source.documentName}
    >
      <FileText size={12} style={{ color: 'var(--accent)' }} />
      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
        {source.documentName}
      </span>
      {source.pageNumber && (
        <span style={{ color: 'var(--text-muted)' }}>
          p. {source.pageNumber}
        </span>
      )}
      {source.sectionTitle && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            padding: '0.1rem 0.35rem',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
          }}
        >
          <Bookmark size={10} />
          {source.sectionTitle}
        </span>
      )}
    </div>
  );
};
