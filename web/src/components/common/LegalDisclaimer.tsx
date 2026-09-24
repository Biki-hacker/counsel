import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const LegalDisclaimer: React.FC = () => {
  return (
    <footer
      style={{
        padding: '0.45rem 1rem',
        fontSize: '12px',
        color: 'var(--text-muted)',
        textAlign: 'center',
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        flexShrink: 0,
      }}
    >
      <ShieldAlert size={13} style={{ color: 'var(--attention)', flexShrink: 0 }} />
      <span>
        Counsel provides legal information and document assistance, not formal legal advice or legal representation.
      </span>
    </footer>
  );
};
