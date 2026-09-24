import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '../components/modals/AuthModal';

// Mock useAuth
const mockLoginWithDemo = vi.fn();
const mockLoginWithGoogle = vi.fn();
const mockLoginWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    loginWithDemo: mockLoginWithDemo,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithEmail: mockLoginWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
  }),
}));

describe('AuthModal Component & Registration Flow', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Sign In tab by default with demo personas and Google login', () => {
    render(<AuthModal isOpen={true} onClose={onClose} />);

    expect(screen.getByText('Sign in to Counsel')).toBeDefined();
    expect(screen.getByText('Alice Vance, Esq.')).toBeDefined();
    expect(screen.getByText('Bob Sterling')).toBeDefined();
    expect(screen.getByText('Continue with Google')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Sign In Tab' })).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in to account/i })).toBeDefined();

    // "Full Name" should NOT be rendered in Sign In tab
    expect(screen.queryByPlaceholderText('e.g. Adv. Sarah Jenkins')).toBeNull();
  });

  it('switches to Create Account tab and exposes Full Name and Jurisdiction fields', () => {
    render(<AuthModal isOpen={true} onClose={onClose} />);

    // Click Create Account tab
    const createAccountTab = screen.getByRole('tab', { name: 'Create Account Tab' });
    fireEvent.click(createAccountTab);

    expect(screen.getByText('Create Counsel Account')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. Adv. Sarah Jenkins')).toBeDefined();
    expect(screen.getByText('Primary Jurisdiction')).toBeDefined();
    expect(screen.getByRole('button', { name: /create account & continue/i })).toBeDefined();
  });

  it('handles 1-click demo personas (Alice and Bob)', async () => {
    mockLoginWithDemo.mockResolvedValueOnce(undefined);
    render(<AuthModal isOpen={true} onClose={onClose} />);

    const aliceButton = screen.getByText('Alice Vance, Esq.');
    fireEvent.click(aliceButton);

    await waitFor(() => {
      expect(mockLoginWithDemo).toHaveBeenCalledWith('alice@counsel.law', 'Alice Vance, Esq.');
      expect(onClose).toHaveBeenCalled();
    });

    const bobButton = screen.getByText('Bob Sterling');
    fireEvent.click(bobButton);

    await waitFor(() => {
      expect(mockLoginWithDemo).toHaveBeenCalledWith('bob@counsel.law', 'Bob Sterling');
    });
  });

  it('submits Create Account form with Full Name, Email, Password, and Jurisdiction', async () => {
    mockSignUpWithEmail.mockResolvedValueOnce(undefined);
    render(<AuthModal isOpen={true} onClose={onClose} />);

    // Switch to Create Account
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account Tab' }));

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('e.g. Adv. Sarah Jenkins'), {
      target: { value: 'Harvey Specter, Senior Counsel' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'harvey@pearson.law' },
    });
    fireEvent.change(screen.getByPlaceholderText('Create a secure password (min 6 chars)'), {
      target: { value: 'legalpass123' },
    });

    // Select US Jurisdiction
    const jurisdictionSelect = screen.getByRole('combobox');
    fireEvent.change(jurisdictionSelect, { target: { value: 'us' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /create account & continue/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith(
        'Harvey Specter, Senior Counsel',
        'harvey@pearson.law',
        'legalpass123',
        'us'
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('validates password length in Create Account', async () => {
    render(<AuthModal isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Create Account Tab' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. Adv. Sarah Jenkins'), {
      target: { value: 'Sarah' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'sarah@firm.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Create a secure password (min 6 chars)'), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account & continue/i }));

    expect(screen.getByText('Password must be at least 6 characters long')).toBeDefined();
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();
  });

  it('displays backend error message when authentication fails', async () => {
    mockLoginWithEmail.mockRejectedValueOnce(new Error('Invalid email or credentials'));
    render(<AuthModal isOpen={true} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or credentials')).toBeDefined();
    });
  });
});

describe('CounselWebSocketClient Reconnection on Token Switch', () => {
  it('closes stale connection and creates new connection when token changes', async () => {
    const { wsClient } = await import('../api/ws');
    const closeSpy = vi.fn();
    const createdSockets: any[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = 1; // OPEN
      close = closeSpy;
      send = vi.fn();
      url: string;
      constructor(url: string) {
        this.url = url;
        createdSockets.push(this);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);

    wsClient.connect('token_alice');
    expect(createdSockets.length).toBe(1);
    expect(createdSockets[0].url).toContain('token_alice');

    // Calling connect again with same token should NOT close or create new socket
    wsClient.connect('token_alice');
    expect(closeSpy).not.toHaveBeenCalled();
    expect(createdSockets.length).toBe(1);

    // Switching token to bob should close alice's socket and create bob's socket
    wsClient.connect('token_bob');
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(createdSockets.length).toBe(2);
    expect(createdSockets[1].url).toContain('token_bob');

    // Disconnect cleans up
    wsClient.disconnect();
    expect(closeSpy).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
