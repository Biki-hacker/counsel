import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface CustomSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  placeholder?: string;
  label?: string;
  prefixIcon?: React.ReactNode;
  variant?: 'form' | 'pill' | 'compact';
  direction?: 'down' | 'up';
  menuMinWidth?: string | number;
  width?: string | number;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  label,
  prefixIcon,
  variant = 'form',
  direction = 'down',
  menuMinWidth,
  width,
  disabled = false,
  className,
  id,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
        onChange(options[nextIndex].value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
        onChange(options[prevIndex].value);
      }
    }
  };

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  // Base Trigger Styles by Variant
  const getTriggerStyle = (): React.CSSProperties => {
    const common: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.45rem',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      fontFamily: 'inherit',
      transition: 'all var(--duration-fast) var(--ease-out)',
      userSelect: 'none',
      border: 'none',
      background: 'none',
      color: 'inherit',
      textAlign: 'left',
    };

    if (variant === 'compact') {
      return {
        ...common,
        padding: '0.22rem 0.5rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--text-primary)',
      };
    }

    if (variant === 'pill') {
      return {
        ...common,
        padding: '0.28rem 0.65rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
      };
    }

    // Default 'form' variant
    return {
      ...common,
      width: '100%',
      padding: '0.58rem 0.85rem',
      borderRadius: 'var(--radius-md)',
      backgroundColor: 'var(--surface-raised)',
      border: isOpen ? '1px solid var(--border-focus)' : '1px solid var(--border)',
      boxShadow: isOpen ? '0 0 0 2px var(--accent-subtle)' : 'none',
      fontSize: '13.5px',
      color: 'var(--text-primary)',
    };
  };

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      style={{
        position: 'relative',
        display: variant === 'form' ? 'block' : 'inline-block',
        width: width || (variant === 'form' ? '100%' : 'auto'),
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '0.35rem',
            color: 'var(--text-primary)',
          }}
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        style={getTriggerStyle()}
        onMouseEnter={(e) => {
          if (!disabled && variant !== 'form') {
            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && variant !== 'form') {
            e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden' }}>
          {prefixIcon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{prefixIcon}</span>}
          {selectedOption?.icon && (
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{selectedOption.icon}</span>
          )}
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: variant === 'form' ? 500 : 600,
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color: 'var(--text-muted)',
            transition: 'transform var(--duration-fast) var(--ease-out)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            ...(direction === 'up'
              ? { bottom: 'calc(100% + 6px)' }
              : { top: 'calc(100% + 6px)' }),
            minWidth: menuMinWidth || (variant === 'form' ? '100%' : '210px'),
            width: variant === 'form' ? '100%' : 'max-content',
            maxWidth: 'min(440px, 90vw)',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.35rem',
            zIndex: 150,
          }}
        >
          <ul
            ref={listRef}
            role="listbox"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    padding: opt.description ? '0.55rem 0.75rem' : '0.45rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {opt.icon && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        {opt.icon}
                      </span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 500,
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              backgroundColor: 'var(--surface-raised)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.description && (
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--text-muted)',
                            lineHeight: 1.35,
                          }}
                        >
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check
                      size={15}
                      style={{
                        flexShrink: 0,
                        color: 'var(--accent)',
                        marginLeft: '0.4rem',
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
