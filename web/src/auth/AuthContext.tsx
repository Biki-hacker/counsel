import React, { createContext, useContext, useState, useEffect } from 'react';
import { CanonicalUser, Jurisdiction } from '../types';
import { api } from '../api/client';
import { wsClient } from '../api/ws';

interface AuthContextType {
  user: CanonicalUser | null;
  token: string | null;
  loading: boolean;
  loginWithGoogle: (email?: string, name?: string) => Promise<void>;
  loginWithEmail: (email: string, password?: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password?: string, jurisdiction?: Jurisdiction) => Promise<void>;
  loginWithDemo: (email?: string, name?: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<CanonicalUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CanonicalUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('counsel_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('counsel_token');
      const isSignedOut = localStorage.getItem('counsel_signed_out') === 'true';

      if (storedToken) {
        api.setToken(storedToken);
        try {
          const res = await api.getMe();
          setUser(res.user);
          setToken(storedToken);
          wsClient.connect(storedToken);
        } catch {
          // Stored token is invalid or expired
          localStorage.removeItem('counsel_token');
          setToken(null);
          api.setToken(null);
          wsClient.disconnect();
        }
      } else if (!isSignedOut) {
        // Auto-initialize demo account only for brand-new first-time visitors
        try {
          await loginWithDemo('alice@counsel.law', 'Alice Vance, Esq.');
        } catch {
          // Gracefully fallback to guest state if demo init fails
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Sync auth state across browser tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'counsel_token') {
        const newToken = e.newValue;
        if (!newToken) {
          setToken(null);
          setUser(null);
          api.setToken(null);
          wsClient.disconnect();
        } else if (newToken !== token) {
          setToken(newToken);
          api.setToken(newToken);
          wsClient.connect(newToken);
          api.getMe().then((res) => setUser(res.user)).catch(() => {});
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [token]);

  const handleAuthenticatedToken = async (newToken: string, displayName?: string) => {
    // Stage token for verification request
    api.setToken(newToken);

    try {
      // Validate session with server BEFORE committing state or storage
      const res = await api.authSession(newToken, displayName);

      localStorage.setItem('counsel_token', newToken);
      localStorage.removeItem('counsel_signed_out');
      setToken(newToken);
      setUser(res.user);
      wsClient.connect(newToken);
    } catch (err) {
      // Rollback to prior token state on error
      api.setToken(token);
      throw err;
    }
  };

  const loginWithDemo = async (email: string = 'alice@counsel.law', name?: string) => {
    const defaultName = name || (email.includes('alice') ? 'Alice Vance, Esq.' : 'Bob Sterling');
    const demoToken = `demo:${email}:${encodeURIComponent(defaultName)}`;
    await handleAuthenticatedToken(demoToken, defaultName);
  };

  const loginWithGoogle = async (email?: string, name?: string) => {
    const savedEmail = localStorage.getItem('counsel_google_email');
    const savedName = localStorage.getItem('counsel_google_name');

    const googleEmail = email?.trim() || savedEmail || 'counsel.advocate@gmail.com';
    const googleName = name?.trim() || savedName || 'Advocate Google User';

    // Persist Google identity for consistent consultation history across sessions
    localStorage.setItem('counsel_google_email', googleEmail);
    localStorage.setItem('counsel_google_name', googleName);

    const googleToken = `google:${googleEmail}:${encodeURIComponent(googleName)}`;
    await handleAuthenticatedToken(googleToken, googleName);
  };

  const loginWithEmail = async (email: string, _password?: string) => {
    const trimmedEmail = email.trim();
    const demoToken = `demo:${trimmedEmail}`;
    await handleAuthenticatedToken(demoToken);
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    _password?: string,
    jurisdiction?: Jurisdiction
  ) => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const demoToken = `demo:${trimmedEmail}:${encodeURIComponent(trimmedName)}`;
    await handleAuthenticatedToken(demoToken, trimmedName);

    if (jurisdiction) {
      try {
        const updateRes = await api.updateMe({ jurisdiction });
        setUser(updateRes.user);
      } catch {
        // Non-fatal if preference update fails
      }
    }
  };

  const logout = () => {
    localStorage.removeItem('counsel_token');
    localStorage.setItem('counsel_signed_out', 'true');
    setToken(null);
    setUser(null);
    api.setToken(null);
    wsClient.disconnect();
  };

  const updateUser = async (data: Partial<CanonicalUser>) => {
    const res = await api.updateMe(data);
    setUser(res.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginWithGoogle,
        loginWithEmail,
        signUpWithEmail,
        loginWithDemo,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
