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
import { chatStorage } from './utils/chatStorage';
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

  // State with initial restoration from local storage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('counsel_theme') as 'light' | 'dark') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return chatStorage.getStoredConversations();
  });
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    return chatStorage.getActiveConvId();
  });
  const activeConvIdRef = useRef<string | null>(chatStorage.getActiveConvId());
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

  // Typewriter streaming queue refs
  const deltaQueueRef = useRef<string>('');
  const typewriterTimerRef = useRef<any>(null);
  const isStreamCompleteRef = useRef<boolean>(false);
  const completeUsageUnitsRef = useRef<number | undefined>(undefined);

  // Stop typewriter interval cleanly
  const stopTypewriter = useCallback(() => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    deltaQueueRef.current = '';
    isStreamCompleteRef.current = false;
    completeUsageUnitsRef.current = undefined;
  }, []);

  // Apply theme to root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('counsel_theme', theme);
  }, [theme]);

  // Restore cached conversation and messages on initial mount
  useEffect(() => {
    const savedActiveId = chatStorage.getActiveConvId();
    if (savedActiveId) {
      const stored = chatStorage.getStoredConversation(savedActiveId);
      if (stored) {
        if (stored.messages && stored.messages.length > 0) {
          setMessages(stored.messages);
        }
        if (stored.conversation) {
          if (stored.conversation.legalMode) setActiveMode(stored.conversation.legalMode);
          if (stored.conversation.jurisdiction) setJurisdiction(stored.conversation.jurisdiction);
          if (stored.conversation.aiProvider) setProvider(stored.conversation.aiProvider);
          if (stored.conversation.aiMode) setAiMode(stored.conversation.aiMode);
        }
      }
    }
  }, []);

  // Track previous user ID to detect switches or logouts
  const prevUserIdRef = useRef<string | null>(null);

  // Sync user defaults and handle account switching / logout state reset
  useEffect(() => {
    const currentUserId = user?.id || null;
    // Only reset state if this is an explicit account switch (from an existing user to another user, or explicit logout)
    if (prevUserIdRef.current !== null && prevUserIdRef.current !== currentUserId) {
      stopTypewriter();
      if (activeConvIdRef.current) {
        wsClient.cancel(activeConvIdRef.current);
      }
      activeConvIdRef.current = null;
      setActiveConvId(null);
      chatStorage.setActiveConvId(null);
      setMessages([]);
      setStatusText(undefined);
      setIsStreaming(false);
      setConversations(chatStorage.getStoredConversations());
      setAvailableDocs([]);
      setQuotaUnits(undefined);
      setActiveMode('general');
      setPresetPrompt(undefined);
      setConversationToDelete(null);
    }

    prevUserIdRef.current = currentUserId;

    if (user) {
      if (user.jurisdiction) setJurisdiction(user.jurisdiction);
      if (user.preferredProvider) setProvider(user.preferredProvider);
      if (user.thinkingDefault) setAiMode('thinking');
    }
  }, [user, stopTypewriter]);

  // Load conversations and documents, merging server and persistent storage
  const refreshData = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setAvailableDocs([]);
      setQuotaUnits(undefined);
      return;
    }
    try {
      const [convRes, docRes, usageRes] = await Promise.all([
        api.listConversations().catch(() => ({ conversations: [] })),
        api.listDocuments().catch(() => ({ documents: [] })),
        api.getUsage().catch(() => ({ quota: undefined })),
      ]);

      const localConvs = chatStorage.getStoredConversations();
      const serverConvs = convRes.conversations || [];
      const convMap = new Map<string, Conversation>();

      for (const c of localConvs) {
        convMap.set(c.id, c);
      }
      for (const c of serverConvs) {
        convMap.set(c.id, c);
      }

      const merged = Array.from(convMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      chatStorage.saveConversations(merged);
      setConversations(merged);
      setAvailableDocs(docRes.documents || []);

      if (usageRes.quota) {
        setQuotaUnits({
          used: usageRes.quota.usedToday,
          total: usageRes.quota.dailyAllowance,
        });
      }
    } catch {
      setConversations(chatStorage.getStoredConversations());
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Adaptive typewriter streaming engine
  const startTypewriter = useCallback(() => {
    if (typewriterTimerRef.current) return;

    typewriterTimerRef.current = setInterval(() => {
      if (deltaQueueRef.current.length > 0) {
        const qLen = deltaQueueRef.current.length;
        // Adaptive speed: 14 chars per 22ms when buffer is large, down to 3 chars when streaming live
        const chunkSize = qLen > 300 ? 14 : qLen > 100 ? 8 : qLen > 30 ? 4 : 2;
        const slice = deltaQueueRef.current.slice(0, chunkSize);
        deltaQueueRef.current = deltaQueueRef.current.slice(chunkSize);

        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            const updatedLast: Message = {
              ...last,
              content: last.content + slice,
            };
            const updated = [...prev.slice(0, -1), updatedLast];
            if (last.conversationId) {
              chatStorage.saveMessages(last.conversationId, updated);
            }
            return updated;
          }
          return prev;
        });
      } else if (isStreamCompleteRef.current) {
        // Entire response typed out and server signaled completion
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
        isStreamCompleteRef.current = false;
        setIsStreaming(false);
        setStatusText(undefined);

        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            const completedMsg: Message = {
              ...last,
              status: 'completed',
              usageUnits: completeUsageUnitsRef.current,
            };
            const updated = [...prev.slice(0, -1), completedMsg];
            if (last.conversationId) {
              chatStorage.saveMessages(last.conversationId, updated);
            }
            return updated;
          }
          return prev;
        });

        refreshData();
      }
    }, 22);
  }, [refreshData]);

  // Load conversation messages with instant cache lookup and graceful serverless fallback
  const loadConversation = useCallback(async (convId: string) => {
    if (convId === activeConvIdRef.current && messages.length > 0) return;

    stopTypewriter();
    if (activeConvIdRef.current) {
      wsClient.cancel(activeConvIdRef.current);
    }
    setIsStreaming(false);
    setStatusText(undefined);

    activeConvIdRef.current = convId;
    setActiveConvId(convId);
    chatStorage.setActiveConvId(convId);

    // 1. Instantly display locally cached messages
    const cached = chatStorage.getStoredConversation(convId);
    if (cached) {
      if (cached.messages && cached.messages.length > 0) {
        setMessages(cached.messages);
      }
      if (cached.conversation) {
        if (cached.conversation.legalMode) setActiveMode(cached.conversation.legalMode);
        if (cached.conversation.jurisdiction) setJurisdiction(cached.conversation.jurisdiction);
        if (cached.conversation.aiProvider) setProvider(cached.conversation.aiProvider);
        if (cached.conversation.aiMode) setAiMode(cached.conversation.aiMode);
      }
    } else {
      setMessages([]);
    }

    // 2. Fetch from backend to sync fresh server messages
    try {
      const res = await api.getConversation(convId);
      if (activeConvIdRef.current === convId) {
        if (res.messages && res.messages.length > 0) {
          setMessages(res.messages);
          chatStorage.saveMessages(convId, res.messages);
        }
        if (res.conversation) {
          chatStorage.saveConversation(res.conversation);
          setActiveMode(res.conversation.legalMode || 'general');
          setJurisdiction(res.conversation.jurisdiction || 'in');
          setProvider(res.conversation.aiProvider || 'nvidia');
          setAiMode(res.conversation.aiMode || 'normal');
        }
      }
    } catch {
      // If server returns 404 due to serverless cold-start, retain cached messages
      const currentCache = chatStorage.getStoredMessages(convId);
      if (activeConvIdRef.current === convId && currentCache.length > 0) {
        setMessages(currentCache);
      }
    }
  }, [messages.length, stopTypewriter]);

  // WebSocket / SSE Subscription with typewriter streaming and storage sync
  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event: ServerEnvelope) => {
      const isCurrentConv =
        !event.conversationId ||
        !activeConvIdRef.current ||
        event.conversationId === activeConvIdRef.current;

      switch (event.type) {
        case 'message.start':
          const startConvId = event.conversationId || activeConvIdRef.current || '';
          if (startConvId) {
            activeConvIdRef.current = startConvId;
            setActiveConvId(startConvId);
            chatStorage.setActiveConvId(startConvId);
          }

          setIsStreaming(true);
          setStatusText(undefined);
          deltaQueueRef.current = '';
          isStreamCompleteRef.current = false;

          if (event.messageId) {
            const newAssistantMsg: Message = {
              id: event.messageId,
              conversationId: startConvId,
              userId: user?.id || '',
              role: 'assistant',
              content: '',
              status: 'streaming',
              createdAt: new Date().toISOString(),
            };

            setMessages((prev) => {
              if (prev.some((m) => m.id === event.messageId)) return prev;

              const updatedUserMsgs = prev.map((m) =>
                (!m.conversationId || m.conversationId === '') && startConvId
                  ? { ...m, conversationId: startConvId }
                  : m
              );
              const updated = [...updatedUserMsgs, newAssistantMsg];
              if (startConvId) {
                chatStorage.saveMessages(startConvId, updated);
                const firstUser = updatedUserMsgs.find((m) => m.role === 'user');
                const title = firstUser?.content ? (firstUser.content.length > 40 ? firstUser.content.slice(0, 40) + '...' : firstUser.content) : 'Legal Consultation';
                chatStorage.saveConversation({
                  id: startConvId,
                  userId: user?.id || '',
                  title,
                  legalMode: activeMode,
                  jurisdiction,
                  aiProvider: provider,
                  aiMode,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
              return updated;
            });
          }
          break;

        case 'message.status':
          if (!isCurrentConv) return;
          setStatusText(event.statusText);
          break;

        case 'message.delta':
          if (!isCurrentConv) return;
          if (event.delta) {
            deltaQueueRef.current += event.delta;
            startTypewriter();
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
                const updatedLast: Message = { ...last, sources: [...existing, event.source!] };
                const updated = [...prev.slice(0, -1), updatedLast];
                if (last.conversationId) {
                  chatStorage.saveMessages(last.conversationId, updated);
                }
                return updated;
              }
              return prev;
            });
          }
          break;

        case 'message.complete':
          if (isCurrentConv) {
            completeUsageUnitsRef.current = event.usageUnits;
            isStreamCompleteRef.current = true;
            if (!typewriterTimerRef.current && deltaQueueRef.current.length === 0) {
              setIsStreaming(false);
              setStatusText(undefined);
              setMessages((prev) => {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                if (last.role === 'assistant') {
                  const completedMsg: Message = {
                    ...last,
                    status: 'completed',
                    usageUnits: event.usageUnits,
                  };
                  const updated = [...prev.slice(0, -1), completedMsg];
                  if (last.conversationId) {
                    chatStorage.saveMessages(last.conversationId, updated);
                  }
                  return updated;
                }
                return prev;
              });
              refreshData();
            } else {
              startTypewriter();
            }
          } else {
            refreshData();
          }
          break;

        case 'message.error':
          if (isCurrentConv) {
            stopTypewriter();
            setIsStreaming(false);
            setStatusText(undefined);
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                const failedMsg: Message = { ...last, status: 'failed' };
                const updated = [...prev.slice(0, -1), failedMsg];
                if (last.conversationId) {
                  chatStorage.saveMessages(last.conversationId, updated);
                }
                return updated;
              }
              return prev;
            });
          }
          refreshData();
          break;

        case 'message.cancel':
          if (isCurrentConv) {
            stopTypewriter();
            setIsStreaming(false);
            setStatusText(undefined);
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (last.role === 'assistant') {
                const cancelledMsg: Message = { ...last, status: 'cancelled' };
                const updated = [...prev.slice(0, -1), cancelledMsg];
                if (last.conversationId) {
                  chatStorage.saveMessages(last.conversationId, updated);
                }
                return updated;
              }
              return prev;
            });
          }
          refreshData();
          break;
      }
    });

    return () => unsubscribe();
  }, [user, refreshData, startTypewriter, stopTypewriter, activeMode, jurisdiction, provider, aiMode]);

  // Handlers
  const handleSendMessage = (text: string, mode: LegalMode, attachedDocs: Document[]) => {
    if (!text.trim() && attachedDocs.length === 0) return;

    stopTypewriter();
    let currentConvId = activeConvIdRef.current || activeConvId;

    if (!currentConvId) {
      currentConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      activeConvIdRef.current = currentConvId;
      setActiveConvId(currentConvId);
      chatStorage.setActiveConvId(currentConvId);

      const cleanTitle = text.trim()
        ? (text.trim().length > 40 ? text.trim().slice(0, 40) + '...' : text.trim())
        : 'New Legal Consultation';

      const newConv: Conversation = {
        id: currentConvId,
        userId: user?.id || '',
        title: cleanTitle,
        legalMode: mode,
        jurisdiction,
        aiProvider: provider,
        aiMode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      chatStorage.saveConversation(newConv);
      setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== currentConvId)]);
    }

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: currentConvId,
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

    // The whole prior context of the conversation to pass together
    const priorContext = [...messages];

    const updated = [...messages, userMsg];
    setMessages(updated);
    chatStorage.saveMessages(currentConvId, updated);

    setIsStreaming(true);
    setStatusText('Counsel is reviewing legal context...');

    const docIds = attachedDocs.map((d) => d.id);
    const allImages = attachedDocs.flatMap((d) => d.pageImages || []).filter(Boolean);

    // Send message with the whole conversation context passed together
    wsClient.send({
      type: 'message.send',
      conversationId: currentConvId,
      prompt: text,
      messages: priorContext,
      legalMode: mode,
      jurisdiction,
      aiProvider: provider,
      aiMode,
      documentIds: docIds,
      pageImages: allImages.length > 0 ? allImages : undefined,
    });
  };

  const handleStopGenerating = () => {
    stopTypewriter();
    setIsStreaming(false);
    setStatusText(undefined);
    const currentConvId = activeConvIdRef.current || activeConvId;
    if (currentConvId) {
      wsClient.cancel(currentConvId);
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && last.status === 'streaming') {
          const cancelledMsg: Message = { ...last, status: 'cancelled' };
          const updated = [...prev.slice(0, -1), cancelledMsg];
          chatStorage.saveMessages(currentConvId, updated);
          return updated;
        }
        return prev;
      });
    }
  };

  const handleNewConversation = useCallback(() => {
    stopTypewriter();
    if (activeConvIdRef.current) {
      wsClient.cancel(activeConvIdRef.current);
    }
    setIsStreaming(false);
    setStatusText(undefined);
    activeConvIdRef.current = null;
    setActiveConvId(null);
    chatStorage.setActiveConvId(null);
    setMessages([]);
    setActiveMode('general');
    setPresetPrompt(undefined);
  }, [stopTypewriter]);

  const handleRequestDeleteConversation = (id: string) => {
    const target = conversations.find((c) => c.id === id);
    setConversationToDelete(target || { id, title: 'This consultation' });
  };

  const handleConfirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    setIsDeletingChat(true);
    const deleteId = conversationToDelete.id;
    try {
      chatStorage.deleteStoredConversation(deleteId);
      await api.deleteConversation(deleteId).catch(() => {});
      if (activeConvId === deleteId) {
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

    const currentConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    activeConvIdRef.current = currentConvId;
    setActiveConvId(currentConvId);
    chatStorage.setActiveConvId(currentConvId);

    const newConv: Conversation = {
      id: currentConvId,
      userId: user?.id || '',
      title: 'Contract Comparison',
      legalMode: 'compare',
      jurisdiction,
      aiProvider: provider,
      aiMode,
      documentIds: docIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    chatStorage.saveConversation(newConv);
    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== currentConvId)]);

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: currentConvId,
      userId: user?.id || '',
      role: 'user',
      content: prompt,
      status: 'completed',
      mode: 'compare',
      createdAt: new Date().toISOString(),
    };
    setMessages([userMsg]);
    chatStorage.saveMessages(currentConvId, [userMsg]);

    setIsStreaming(true);
    setStatusText('Counsel is reviewing comparison context...');

    wsClient.send({
      type: 'message.send',
      conversationId: currentConvId,
      prompt,
      messages: [],
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

    const currentConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    activeConvIdRef.current = currentConvId;
    setActiveConvId(currentConvId);
    chatStorage.setActiveConvId(currentConvId);

    const newConv: Conversation = {
      id: currentConvId,
      userId: user?.id || '',
      title: 'Lawyer Briefing',
      legalMode: 'prep_lawyer',
      jurisdiction,
      aiProvider: provider,
      aiMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    chatStorage.saveConversation(newConv);
    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== currentConvId)]);

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      conversationId: currentConvId,
      userId: user?.id || '',
      role: 'user',
      content: prompt,
      status: 'completed',
      mode: 'prep_lawyer',
      createdAt: new Date().toISOString(),
    };
    setMessages([userMsg]);
    chatStorage.saveMessages(currentConvId, [userMsg]);

    setIsStreaming(true);
    setStatusText('Counsel is preparing lawyer consultation briefing...');

    wsClient.send({
      type: 'message.send',
      conversationId: currentConvId,
      prompt,
      messages: [],
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
          isStreaming={isStreaming}
          activeMode={activeMode}
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
