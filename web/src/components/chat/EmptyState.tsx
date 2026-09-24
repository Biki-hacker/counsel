import React from 'react';
import {
  FileCheck,
  FileSearch,
  GitCompare,
  Briefcase,
  Scale,
  ArrowRight,
} from 'lucide-react';
import { LegalMode } from '../../types';

interface EmptyStateProps {
  onSelectAction: (prompt: string, mode: LegalMode) => void;
  onOpenCompare: () => void;
  onOpenLawyerPrep: () => void;
}

interface ActionItem {
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onSelectAction,
  onOpenCompare,
  onOpenLawyerPrep,
}) => {
  const actions: ActionItem[] = [
    {
      title: 'Review an Agreement',
      desc: 'Analyze obligations, termination rights & liability risks',
      icon: <FileCheck size={18} />,
      onClick: () =>
        onSelectAction(
          'Please review this agreement and outline my key obligations, liability terms, and clauses that require careful attention.',
          'contract'
        ),
    },
    {
      title: 'Explain a Clause',
      desc: 'Translate complex legalese into clear, plain language',
      icon: <FileSearch size={18} />,
      onClick: () =>
        onSelectAction(
          'Can you explain this clause in plain English, who it affects, and what potential concerns or traps I should watch for?',
          'clause'
        ),
    },
    {
      title: 'Compare Two Contracts',
      desc: 'Detect material revisions, added burdens & removed terms',
      icon: <GitCompare size={18} />,
      onClick: onOpenCompare,
    },
    {
      title: 'Prepare for a Lawyer',
      desc: 'Organize facts, timeline & key questions into a brief',
      icon: <Briefcase size={18} />,
      onClick: onOpenLawyerPrep,
    },
  ];

  return (
    <div
      style={{
        maxWidth: '760px',
        width: '100%',
        margin: '0 auto',
        padding: '1.5rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        animation: 'fadeIn 180ms ease-out',
      }}
    >
      {/* Editorial Emblem */}
      <div
        style={{
          width: '46px',
          height: '46px',
          borderRadius: '13px',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          marginBottom: '1.15rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <Scale size={22} />
      </div>

      {/* Hero Heading & Subhead */}
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '2.15rem',
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
          marginBottom: '0.6rem',
        }}
      >
        Legal clarity, made straightforward.
      </h1>

      <p
        style={{
          fontSize: '14.5px',
          color: 'var(--text-secondary)',
          maxWidth: '520px',
          lineHeight: 1.55,
          marginBottom: '1.85rem',
        }}
      >
        Analyze obligations, spot hidden risks, compare contract versions, or structure your case for legal counsel.
      </p>

      {/* Curated 2x2 Action Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '0.75rem',
          width: '100%',
          textAlign: 'left',
        }}
      >
        {actions.map((act, idx) => (
          <button
            key={idx}
            onClick={act.onClick}
            style={{
              padding: '0.95rem 1.15rem',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all var(--duration-fast) var(--ease-out)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.85rem',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-focus)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {act.icon}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '3px',
                  }}
                >
                  {act.title}
                </div>
                <div
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                    wordBreak: 'normal',
                    overflowWrap: 'normal',
                  }}
                >
                  {act.desc}
                </div>
              </div>
            </div>

            <ArrowRight
              size={15}
              style={{
                color: 'var(--text-muted)',
                flexShrink: 0,
                marginLeft: '0.5rem',
                opacity: 0.7,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
