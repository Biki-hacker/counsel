import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth/AuthContext';
import {
  Conversation,
  Message,
  Document,
  LegalMode,
  Jurisdiction,
  AIProvider,
  AIMode,
  ServerEnvelope,
} from './types';
import { api } from './api/client';
import { wsClient } from './api/ws';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ConversationArea } from './components/chat/ConversationArea';
import { Composer } from './components/chat/Composer';
import { LegalDisclaimer } from './components/common/LegalDisclaimer';
import { CompareModal } from './components/modals/CompareModal';
import { LawyerPrepModal } from './components/modals/LawyerPrepModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { AuthModal } from './components/modals/AuthModal';
import { DeleteConfirmationModal } from './components/modals/DeleteConfirmationModal';

export const App: React.FC = () => {
  const { user, logout, updateUser } = useAuth();

  // State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('counsel_theme') as 'light' | 'dark') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusText, setStatusText] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<Document[]>([]);

  // Legal Settings
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('in');
  const [provider, setProvider] = useState<AIProvider>('nvidia');
  const [aiMode, setAiMode] = useState<AIMode>('normal');
  const [activeMode, setActiveMode] = useState<LegalMode>('general');
  const [presetPrompt, setPresetPrompt] = useState<string | undefined>();
  const [quotaUnits, setQuotaUnits] = useState<{ used: number; total: number } | undefined>();

  // Modals
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isLawyerPrepOpen, setIsLawyerPrepOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('counsel_theme', theme);
  }, [theme]);

  // Track previous user ID to detect switches or logouts
  const prevUserIdRef = useRef<string | null>(null);

  // Sync user defaults and handle account switching / logout state reset
  useEffect(() => {
    const currentUserId = user?.id || null;
    if (prevUserIdRef.current !== currentUserId) {
      // Cancel active streaming if changing user
      if (activeConvIdRef.current) {
        wsClient.cancel(activeConvIdRef.current);
      }
      // Reset all session data cleanly to prevent data leakage between accounts
      activeConvIdRef.current = null;
      setActiveConvId(null);
      setMessages([]);
      setStatusText(undefined);
      setIsStreaming(false);
      setConversations([]);
      setAvailableDocs([]);
      setQuotaUnits(undefined);
      setActiveMode('general');
      setPresetPrompt(undefined);
      setConversationToDelete(null);

      prevUserIdRef.current = currentUserId;
    }

    if (user) {
      if (user.jurisdiction) setJurisdiction(user.jurisdiction);
      if (user.preferredProvider) setProvider(user.preferredProvider);
      if (user.thinkingDefault) setAiMode('thinking');
    }
  }, [user]);

  // Load conversations and documents
  const refreshData = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setAvailableDocs([]);
      setQuotaUnits(undefined);
      return;
    }
    try {
      const [convRes, docRes, usageRes] = await Promise.all([
        api.listConversations(),
        api.listDocuments(),
        api.getUsage(),
      ]);
      setConversations(convRes.conversations || []);
      setAvailableDocs(docRes.documents || []);
      if (usageRes.quota) {
        setQuotaUnits({
          used: usageRes.quota.usedToday,
          total: usageRes.quota.dailyAllowance,
        });
      }
    } catch {
      // Silently handle in initial load
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Load conversation messages with stream abort for previous conversation
  const loadConversation = useCallback(async (convId: string) => {
    if (convId === activeConvIdRef.current) return;

    // Abort active stream on previous consultation
    if (activeConvIdRef.current) {
      wsClient.cancel(activeConvIdRef.current);
    }
    setIsStreaming(false);
    setStatusText(undefined);

    activeConvIdRef.current = convId;
    setActiveConvId(convId);
    try {
      const res = await api.getConversation(convId);
      // Ensure user hasn't clicked another consultation during async fetch
      if (activeConvIdRef.current === convId) {
        setMessages(res.messages || []);
        setActiveMode(res.conversation.legalMode || 'general');
        setJurisdiction(res.conversation.jurisdiction || 'in');
        setProvider(res.conversation.aiProvider || 'nvidia');
        setAiMode(res.conversation.aiMode || 'normal');
      }
    } catch {
      if (activeConvIdRef.current === convId) {
        setMessages([]);
      }
    }
  }, []);

  // WebSocket Subscription with strict conversation isolation
  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event: ServerEnvelope) => {
      // Check if event targets the currently active conversation
      const isCurrentConv =
        !event.conversationId ||
        !activeConvIdRef.current ||
        event.conversationId === activeConvIdRef.current;

      switch (event.type) {
        case 'message.start':
          if (event.conversationId) {
            // Adopt server-assigned ID for a new consultation
            if (!activeConvIdRef.current) {
              activeConvIdRef.current = event.conversationId;
              setActiveConvId(event.conversationId);
            }
          }

          // If this start event belongs to another conversation, refresh sidebar and ignore
          if (event.conversationId && event.conversationId !== activeConvIdRef.current) {
            refreshData();
            return;
          }

          setIsStreaming(true);
          setStatusText(undefined);

          if (event.messageId) {
            const newAssistantMsg: Message = {
              id: event.messageId,
              conversationId: event.conversationId || activeConvIdRef.current || '',
              userId: user?.id || '',
              role: 'assistant',
              content: '',
              status: 'streaming',
              createdAt: new Date().toISOString(),
            };

            setMessages((prev) => {
              // Update optimistic user message with the newly resolved conversationId
              const updated = prev.map((m) =>
                m.conversationId === '' && event.conversationId
                  ? { ...m, conversationId: event.conversationId }
                  : m
              );
              return [...updated, newAssistantMsg];
            });
          }

          // Instantly sync conversation list in sidebar
          refreshData();
          break;

        case 'message.status':
          if (!isCurrentConv) return;
          setStatusText(event.statusText);
          break;

        case 'message.delta':
          if (!isCurrentConv) return;
          if (event.delta) {
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + event.delta },
                ];
              }
              return prev;
            });
          }
          break;

        case 'message.source':
          if (!isCurrentConv) return;
          if (event.source) {
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                const existing = last.sources || [];
                return [
                  ...prev.slice(0, -1),
                  { ...last, sources: [...existing, event.source!] },
                ];
              }
              return prev;
            });
          }
          break;

        case 'message.complete':
          if (isCurrentConv) {
            setIsStreaming(false);
            setStatusText(undefined);
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    status: 'completed',
                    usageUnits: event.usageUnits,
                  },
                ];
              }
              return prev;
            });
          }
          refreshData();
          break;

        case 'message.error':
          if (isCurrentConv) {
            setIsStreaming(false);
            setStatusText(undefined);
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, status: 'failed' },
                ];
              }
              return prev;
            });
          }
          refreshData();
          break;

        case 'message.cancel':
          if (isCurrentConv) {
            setIsStreaming(false);
            setStatusText(undefined);
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, status: 'cancelled' },
                ];
              }
              return prev;
            });
          }
          refreshData();
          break;
      }
    });

    return () => unsubscribe();
  }, [user, refreshData]);

  // Handlers
  const handleSendMessage = (text: string, mode: LegalMode, attachedDocs: Document[]) => {
    if (!text.trim() && attachedDocs.length === 0) return;

    const currentConvId = activeConvIdRef.current || activeConvId;

    // Optimistically add user message to list
    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: currentConvId || '',
      userId: user?.id || '',
      role: 'user',
      content: text,
      attachments: attachedDocs.map((d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        pageCount: d.pageImages?.length || d.pageCount,
      })),
      documentIds: attachedDocs.map((d) => d.id),
      status: 'completed',
      mode,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Dispatch over WebSocket with guaranteed active conversation ID
    const docIds = attachedDocs.map((d) => d.id);
    const allImages = attachedDocs.flatMap((d) => d.pageImages || []).filter(Boolean);
    wsClient.send({
      type: 'message.send',
      conversationId: currentConvId || undefined,
      prompt: text,
      legalMode: mode,
      jurisdiction,
      aiProvider: provider,
      aiMode,
      documentIds: docIds,
      pageImages: allImages.length > 0 ? allImages : undefined,
    });
  };

  const handleStopGenerating = () => {
    const currentConvId = activeConvIdRef.current || activeConvId;
    if (currentConvId) {
      wsClient.cancel(currentConvId);
    }
  };

  const handleNewConversation = useCallback(() => {
    if (activeConvIdRef.current) {
      wsClient.cancel(activeConvIdRef.current);
    }
    setIsStreaming(false);
    setStatusText(undefined);
    activeConvIdRef.current = null;
    setActiveConvId(null);
    setMessages([]);
    setActiveMode('general');
    setPresetPrompt(undefined);
  }, []);

  const handleRequestDeleteConversation = (id: string) => {
    const target = conversations.find((c) => c.id === id);
    setConversationToDelete(target || { id, title: 'This consultation' });
  };

  const handleConfirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    setIsDeletingChat(true);
    try {
      await api.deleteConversation(conversationToDelete.id);
      if (activeConvId === conversationToDelete.id) {
        handleNewConversation();
      }
      refreshData();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setIsDeletingChat(false);
      setConversationToDelete(null);
    }
  };

  const handleSeedDemoData = async () => {
    try {
      const res = await api.seedDemoData();
      setAvailableDocs(res.documents);
      alert('Sample Contracts loaded into workspace (Original Employment Agreement, Revised Agreement, Lease, NDA)!');
    } catch {
      alert('Failed to seed sample contracts');
    }
  };

  const handleStartComparison = (prompt: string, docIds: string[]) => {
    handleNewConversation();
    setActiveMode('compare');

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: '',
      userId: user?.id || '',
      role: 'user',
      content: prompt,
      status: 'completed',
      mode: 'compare',
      createdAt: new Date().toISOString(),
    };
    setMessages([userMsg]);

    wsClient.send({
      type: 'message.send',
      prompt,
      legalMode: 'compare',
      jurisdiction,
      aiProvider: provider,
      aiMode,
      documentIds: docIds,
    });
  };

  const handleStartBriefing = (prompt: string) => {
    handleNewConversation();
    setActiveMode('prep_lawyer');

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: '',
      userId: user?.id || '',
      role: 'user',
      content: prompt,
      status: 'completed',
      mode: 'prep_lawyer',
      createdAt: new Date().toISOString(),
    };
    setMessages([userMsg]);

    wsClient.send({
      type: 'message.send',
      prompt,
      legalMode: 'prep_lawyer',
      jurisdiction,
      aiProvider: provider,
      aiMode,
    });
  };

  return (
    <div className="app-container">
      {/* Sidebar / Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConvId}
        onSelectConversation={loadConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleRequestDeleteConversation}
        user={user}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCompare={() => setIsCompareOpen(true)}
        onOpenLawyerPrep={() => setIsLawyerPrepOpen(true)}
        onSeedDemo={handleSeedDemoData}
        onSignOut={logout}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Chat Workspace */}
      <div className="main-content">
        <Header
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          jurisdiction={jurisdiction}
          onJurisdictionChange={(j) => {
            setJurisdiction(j);
            if (user) updateUser({ jurisdiction: j });
          }}
          aiMode={aiMode}
          onAIModeToggle={() => setAiMode((prev) => (prev === 'normal' ? 'thinking' : 'normal'))}
          theme={theme}
          onThemeToggle={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
          quotaUnits={quotaUnits}
        />

        <ConversationArea
          messages={messages}
          statusText={statusText}
          onSelectAction={(p, m) => {
            setActiveMode(m);
            setPresetPrompt(p);
          }}
          onOpenCompare={() => setIsCompareOpen(true)}
          onOpenLawyerPrep={() => setIsLawyerPrepOpen(true)}
        />

        <Composer
          onSend={handleSendMessage}
          onStop={handleStopGenerating}
          isStreaming={isStreaming}
          activeMode={activeMode}
          onModeChange={setActiveMode}
          presetPrompt={presetPrompt}
          jurisdiction={jurisdiction}
        />

        <LegalDisclaimer />
      </div>

      {/* Modals */}
      <CompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        availableDocs={availableDocs}
        onStartComparison={handleStartComparison}
      />

      <LawyerPrepModal
        isOpen={isLawyerPrepOpen}
        onClose={() => setIsLawyerPrepOpen(false)}
        onStartBriefing={handleStartBriefing}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUserUpdated={(u) => updateUser(u)}
        onAccountDeleted={() => {
          logout();
          handleNewConversation();
        }}
        currentTheme={theme}
        onThemeChange={setTheme}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* Delete Consultation Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={!!conversationToDelete}
        onClose={() => !isDeletingChat && setConversationToDelete(null)}
        onConfirm={handleConfirmDeleteConversation}
        conversationTitle={conversationToDelete?.title || 'This consultation'}
        isDeleting={isDeletingChat}
      />
    </div>
  );
};
