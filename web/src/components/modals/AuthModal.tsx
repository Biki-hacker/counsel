import React, { useState } from 'react';
import { X, Scale, Sparkles, Mail, AlertCircle, User, Lock, Globe, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Jurisdiction } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithDemo, loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('in');

  // Google Account State
  const [showGoogleInput, setShowGoogleInput] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(() => localStorage.getItem('counsel_google_email') || '');
  const [googleName, setGoogleName] = useState(() => localStorage.getItem('counsel_google_name') || '');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleDemoSignIn = async (demoEmail: string, name: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await loginWithDemo(demoEmail, name);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (showGoogleInput && !googleEmail.trim()) {
        setErrorMessage('Please enter your Google account email');
        setIsLoading(false);
        return;
      }
      await loginWithGoogle(googleEmail.trim() || undefined, googleName.trim() || undefined);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter an email address');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    if (tab === 'signup') {
      const trimmedName = fullName.trim();
      if (!trimmedName) {
        setErrorMessage('Please enter your full name or title');
        return;
      }
      if (password && password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long');
        return;
      }

      setIsLoading(true);
      try {
        await signUpWithEmail(trimmedName, trimmedEmail, password, jurisdiction);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Account creation failed');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Sign In
      setIsLoading(true);
      try {
        await loginWithEmail(trimmedEmail, password);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Sign in failed');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
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
          maxWidth: '460px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            padding: '0.35rem',
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              marginBottom: '0.75rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Scale size={22} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {tab === 'signin' ? 'Sign in to Counsel' : 'Create Counsel Account'}
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            {tab === 'signin'
              ? 'Access your private legal consultations and documents'
              : 'Empower your legal analysis with private, grounded AI'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            backgroundColor: 'var(--surface-raised)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signin'}
            aria-label="Sign In Tab"
            onClick={() => {
              setTab('signin');
              setErrorMessage(null);
            }}
            style={{
              padding: '0.5rem',
              fontSize: '13px',
              fontWeight: tab === 'signin' ? 600 : 500,
              color: tab === 'signin' ? 'var(--text-primary)' : 'var(--text-muted)',
              backgroundColor: tab === 'signin' ? 'var(--surface)' : 'transparent',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              boxShadow: tab === 'signin' ? 'var(--shadow-sm)' : 'none',
              transition: 'all var(--duration-fast)',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            aria-label="Create Account Tab"
            onClick={() => {
              setTab('signup');
              setErrorMessage(null);
            }}
            style={{
              padding: '0.5rem',
              fontSize: '13px',
              fontWeight: tab === 'signup' ? 600 : 500,
              color: tab === 'signup' ? 'var(--text-primary)' : 'var(--text-muted)',
              backgroundColor: tab === 'signup' ? 'var(--surface)' : 'transparent',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              boxShadow: tab === 'signup' ? 'var(--shadow-sm)' : 'none',
              transition: 'all var(--duration-fast)',
              cursor: 'pointer',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 0.8rem',
              backgroundColor: 'var(--attention-bg)',
              border: '1px solid var(--attention-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={15} style={{ color: 'var(--attention)', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tab === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Full Name / Title
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <User size={15} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  required
                  placeholder="e.g. Adv. Sarah Jenkins"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Email Address
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={15} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={15} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder={tab === 'signup' ? 'Create a secure password (min 6 chars)' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {tab === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Primary Jurisdiction
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Globe size={15} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="in">India (Indian Contract Act, BNSS, Companies Act)</option>
                  <option value="us">United States (Federal, State Common Law, UCC)</option>
                  <option value="uk">United Kingdom (English Common Law, CRA)</option>
                  <option value="eu">European Union (GDPR, EU Directives)</option>
                  <option value="general">International / Comparative Legal General</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1rem',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '13.5px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>{tab === 'signup' ? 'Create Account & Continue' : 'Sign In to Account'}</span>
            <ArrowRight size={15} />
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            margin: '1.25rem 0 0.85rem',
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Instant Evaluation
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
        </div>

        {/* Quick Demo Personas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <button
            type="button"
            onClick={() => handleDemoSignIn('alice@counsel.law', 'Alice Vance, Esq.')}
            disabled={isLoading}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0.55rem 0.65rem',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent)', fontWeight: 600, fontSize: '12px' }}>
              <Sparkles size={13} />
              <span>Alice Vance, Esq.</span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Senior Litigation Partner
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoSignIn('bob@counsel.law', 'Bob Sterling')}
            disabled={isLoading}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0.55rem 0.65rem',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)', fontWeight: 600, fontSize: '12px' }}>
              <Check size={13} style={{ color: 'var(--accent)' }} />
              <span>Bob Sterling</span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Contracts Associate
            </span>
          </button>
        </div>

        {/* Google Sign In Options */}
        {!showGoogleInput ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={() => handleGoogleSignIn()}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.6rem 1rem',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 500,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{googleEmail ? `Continue with Google (${googleEmail})` : 'Continue with Google'}</span>
            </button>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setShowGoogleInput(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '2px 4px',
                }}
              >
                {googleEmail ? 'Use different Google account' : 'Specify custom Google account'}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Google Account Setup
              </span>
              <button
                type="button"
                onClick={() => setShowGoogleInput(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            <input
              type="email"
              placeholder="e.g. advocate.name@gmail.com"
              value={googleEmail}
              onChange={(e) => setGoogleEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Display Name (optional)"
              value={googleName}
              onChange={(e) => setGoogleName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={(e) => handleGoogleSignIn(e)}
              disabled={isLoading}
              style={{
                padding: '0.5rem',
                backgroundColor: 'var(--accent)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '12.5px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Sign In with Google Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
