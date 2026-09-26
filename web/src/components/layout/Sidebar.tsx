import React from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Settings,
  GitCompare,
  Briefcase,
  FileCode,
  User,
  LogOut,
} from 'lucide-react';
import { Conversation, CanonicalUser } from '../../types';
import { groupConversationsByDate } from '../../utils/chatStorage';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  user: CanonicalUser | null;
  onOpenSettings: () => void;
  onOpenCompare: () => void;
  onOpenLawyerPrep: () => void;
  onSeedDemo: () => void;
  onSignOut: () => void;
  onOpenAuth: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  user,
  onOpenSettings,
  onOpenCompare,
  onOpenLawyerPrep,
  onSeedDemo,
  onSignOut,
  onOpenAuth,
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            zIndex: 40,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sidebar Container */}
      <aside
        style={{
          width: '270px',
          height: '100%',
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: isOpen ? 0 : '-270px',
          zIndex: 50,
          transition: 'left var(--duration-normal) var(--ease-out)',
        }}
      >
        {/* Top: New Consultation Button */}
        <div style={{ padding: '0.85rem 0.85rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => {
              onNewConversation();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1rem',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              fontWeight: 500,
              fontSize: '13.5px',
              boxShadow: 'var(--shadow-sm)',
              transition: 'background var(--duration-fast)',
            }}
          >
            <Plus size={16} />
            <span>New Consultation</span>
          </button>

          {/* Special Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
            <button
              onClick={() => {
                onOpenCompare();
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.6rem',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              <GitCompare size={13} style={{ color: 'var(--accent)' }} />
              <span>Compare</span>
            </button>

            <button
              onClick={() => {
                onOpenLawyerPrep();
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.6rem',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              <Briefcase size={13} style={{ color: 'var(--accent)' }} />
              <span>Lawyer Prep</span>
            </button>
          </div>

          <button
            onClick={onSeedDemo}
            title="Load sample agreements (Employment, Lease, NDA) for immediate testing"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.6rem',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px dashed var(--accent)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--accent)',
              fontWeight: 500,
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <FileCode size={13} />
            <span>Seed Sample Contracts</span>
          </button>
        </div>

        {/* Middle: Conversation List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
          }}
        >
          {conversations.length === 0 ? (
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '0.5rem 0.4rem' }}>
              No previous conversations.
            </p>
          ) : (
            groupConversationsByDate(conversations).map((group) => (
              <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    margin: '0.4rem 0 0.2rem',
                    paddingLeft: '0.4rem',
                  }}
                >
                  {group.label}
                </span>

                {group.conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.55rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isActive ? 'var(--surface-raised)' : 'transparent',
                        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'background var(--duration-fast)',
                      }}
                      onClick={() => {
                        onSelectConversation(conv.id);
                        onClose();
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                        <MessageSquare size={14} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conv.title}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        title="Delete consultation"
                        style={{
                          padding: '0.2rem',
                          color: 'var(--text-muted)',
                          opacity: isActive ? 1 : 0.6,
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom: Profile / Settings */}
        <div
          style={{
            padding: '0.85rem',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-raised)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '12px',
                  flexShrink: 0,
                }}
              >
                {(() => {
                  try {
                    const clean = decodeURIComponent(user.displayName || 'Counsel');
                    return clean[0].toUpperCase();
                  } catch {
                    return 'C';
                  }
                })()}
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => {
                    try {
                      return decodeURIComponent(user.displayName || 'Counsel User');
                    } catch {
                      return user.displayName || 'Counsel User';
                    }
                  })()}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '12.5px',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              <User size={15} />
              <span>Sign In</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              onClick={onOpenSettings}
              title="Settings"
              style={{
                padding: '0.35rem',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              <Settings size={16} />
            </button>

            {user && (
              <button
                onClick={onSignOut}
                title="Sign out"
                style={{
                  padding: '0.35rem',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
