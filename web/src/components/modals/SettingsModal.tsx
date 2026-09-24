import React, { useState } from 'react';
import { X, Settings, Trash2, ShieldCheck, Sun, Moon, Laptop } from 'lucide-react';
import { CanonicalUser, Jurisdiction } from '../../types';
import { api } from '../../api/client';
import { CustomSelect, CustomSelectOption } from '../common/CustomSelect';

const JURISDICTION_OPTIONS: CustomSelectOption<Jurisdiction>[] = [
  { value: 'in', label: 'India', description: 'Indian Contract Act, BNSS, Consumer Protection' },
  { value: 'us', label: 'United States', description: 'Federal & State General, Uniform Commercial Code' },
  { value: 'uk', label: 'United Kingdom', description: 'English Common Law, Employment Rights Act' },
  { value: 'eu', label: 'European Union', description: 'Civil Law, GDPR, Directives & Regulations' },
  { value: 'general', label: 'General Jurisdiction', description: 'Universal legal standards & comparative principles' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CanonicalUser | null;
  onUserUpdated: (user: CanonicalUser) => void;
  onAccountDeleted: () => void;
  currentTheme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUserUpdated,
  onAccountDeleted,
  currentTheme,
  onThemeChange,
}) => {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(user?.jurisdiction || 'in');
  const [thinkingDefault, setThinkingDefault] = useState<boolean>(user?.thinkingDefault || false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      const res = await api.updateMe({
        jurisdiction,
        preferredProvider: user?.preferredProvider || 'nvidia',
        thinkingDefault,
      });
      onUserUpdated(res.user);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      // Error
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? All conversations, documents, and identity mappings will be permanently wiped.')) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteMe();
      onAccountDeleted();
      onClose();
    } catch {
      setIsDeleting(false);
    }
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
          maxWidth: '520px',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
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
            <Settings size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Counsel Settings
            </h2>
          </div>
          <button onClick={onClose} style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Appearance / Theme */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem' }}>
              Appearance
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: currentTheme === 'light' ? 'var(--accent-subtle)' : 'var(--surface-raised)',
                  border: currentTheme === 'light' ? '1px solid var(--accent)' : '1px solid var(--border)',
                  color: currentTheme === 'light' ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <Sun size={15} />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: currentTheme === 'dark' ? 'var(--accent-subtle)' : 'var(--surface-raised)',
                  border: currentTheme === 'dark' ? '1px solid var(--accent)' : '1px solid var(--border)',
                  color: currentTheme === 'dark' ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <Moon size={15} />
                <span>Dark</span>
              </button>

              <button
                type="button"
                onClick={() => onThemeChange('light')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <Laptop size={15} />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Target Jurisdiction */}
          <CustomSelect<Jurisdiction>
            label="Target Jurisdiction"
            value={jurisdiction}
            onChange={(val) => setJurisdiction(val)}
            options={JURISDICTION_OPTIONS}
            variant="form"
          />

          {/* Thinking Mode Default */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>Thinking Mode by Default</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Enable deliberate multi-pass reasoning on complex contracts
              </span>
            </div>
            <input
              type="checkbox"
              checked={thinkingDefault}
              onChange={(e) => setThinkingDefault(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Privacy Note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--surface-raised)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <ShieldCheck size={16} style={{ color: 'var(--safe)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Data Privacy Guarantee:</strong>
              <p style={{ marginTop: '0.2rem', lineHeight: 1.4 }}>
                Counsel treats legal documents as confidential. Documents are segmented in-memory for analysis and never retained for AI training.
              </p>
            </div>
          </div>

          {/* Danger Zone: Delete Account */}
          <div
            style={{
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--attention)', display: 'block' }}>
                Danger Zone
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Wipe all conversations and document metadata
              </span>
            </div>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--attention-bg)',
                border: '1px solid var(--attention-border)',
                color: 'var(--attention)',
                fontSize: '12.5px',
                fontWeight: 600,
              }}
            >
              <Trash2 size={13} />
              <span>{isDeleting ? 'Wiping...' : 'Delete Account'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--surface-raised)',
          }}
        >
          {saveSuccess && <span style={{ fontSize: '12px', color: 'var(--safe)', fontWeight: 600 }}>Preferences saved!</span>}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '0.45rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
