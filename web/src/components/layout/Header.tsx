import React from 'react';
import {
  Menu,
  Sun,
  Moon,
  Sparkles,
  Brain,
  Scale,
  Globe,
} from 'lucide-react';
import { Jurisdiction, AIProvider, AIMode } from '../../types';
import { CustomSelect, CustomSelectOption } from '../common/CustomSelect';

const JURISDICTION_OPTIONS: CustomSelectOption<Jurisdiction>[] = [
  { value: 'in', label: 'India', description: 'ICA, BNSS, Consumer Protection' },
  { value: 'us', label: 'United States', description: 'Federal, State UCC & Common Law' },
  { value: 'uk', label: 'United Kingdom', description: 'English Common Law & Employment' },
  { value: 'eu', label: 'European Union', description: 'Civil Law, GDPR & Directives' },
  { value: 'general', label: 'General Jurisdiction', description: 'Standard International Principles' },
];

interface HeaderProps {
  onToggleSidebar: () => void;
  jurisdiction: Jurisdiction;
  onJurisdictionChange: (j: Jurisdiction) => void;
  provider?: AIProvider;
  onProviderChange?: (p: AIProvider) => void;
  aiMode: AIMode;
  onAIModeToggle: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  quotaUnits?: { used: number; total: number };
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  jurisdiction,
  onJurisdictionChange,
  aiMode,
  onAIModeToggle,
  theme,
  onThemeToggle,
  quotaUnits,
}) => {
  return (
    <header
      style={{
        height: '56px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left: Sidebar Toggle & Brand Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            padding: '0.4rem',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Toggle conversation drawer"
        >
          <Menu size={19} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <Scale size={14} />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Counsel
          </span>
        </div>
      </div>

      {/* Right: Jurisdiction, Model, Thinking, Theme, Quota */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {/* Modern Custom Jurisdiction Selector */}
        <CustomSelect<Jurisdiction>
          value={jurisdiction}
          onChange={onJurisdictionChange}
          options={JURISDICTION_OPTIONS}
          prefixIcon={<Globe size={13} style={{ color: 'var(--accent)' }} />}
          variant="compact"
          menuMinWidth="240px"
        />

        {/* Thinking Mode Toggle */}
        <button
          onClick={onAIModeToggle}
          title={aiMode === 'thinking' ? 'Thinking mode active (deeper deliberation)' : 'Normal mode (fast assistance)'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.28rem 0.55rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: aiMode === 'thinking' ? 'var(--accent-subtle)' : 'var(--surface-raised)',
            border: aiMode === 'thinking' ? '1px solid var(--accent)' : '1px solid var(--border)',
            color: aiMode === 'thinking' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'all var(--duration-fast)',
          }}
        >
          {aiMode === 'thinking' ? <Brain size={13} /> : <Sparkles size={13} />}
          <span style={{ display: 'none', minWidth: '48px', textAlign: 'center' }}>
            {aiMode === 'thinking' ? 'Thinking' : 'Fast'}
          </span>
          <span className="hide-on-mobile">{aiMode === 'thinking' ? 'Thinking' : 'Normal'}</span>
        </button>

        {/* Quota Counter */}
        {quotaUnits && (
          <div
            title="Daily Capacity Units"
            style={{
              fontSize: '11.5px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              backgroundColor: 'var(--surface-raised)',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {quotaUnits.total - quotaUnits.used} units
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          style={{
            padding: '0.4rem',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
};
