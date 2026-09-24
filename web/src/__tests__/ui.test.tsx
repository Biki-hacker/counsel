import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import { SourceCard } from '../components/chat/SourceCard';
import { LegalDisclaimer } from '../components/common/LegalDisclaimer';
import { CustomSelect, CustomSelectOption } from '../components/common/CustomSelect';
import { Composer } from '../components/chat/Composer';
import { MessageBubble } from '../components/chat/MessageBubble';
import { DeleteConfirmationModal } from '../components/modals/DeleteConfirmationModal';
import { Header } from '../components/layout/Header';
import { SettingsModal } from '../components/modals/SettingsModal';

describe('Counsel Frontend Component Suite', () => {
  it('renders Markdown headings, bold text, and tables correctly', () => {
    const md = `# Contract Overview
## Key Obligations
* Obligation 1: Deliver code
* Obligation 2: Maintain **strict secrecy**

| Clause Reference | Risk Assessment | Governing Jurisdiction |
|---|---|---|
| Section 8.2 | High attention required | India (Indian Contract Act) |
| Section 9.1 | Worth reviewing promptly | United States (UCC) |`;

    const { container } = render(<MarkdownRenderer content={md} />);

    expect(screen.getByText('Contract Overview')).toBeDefined();
    expect(screen.getByText('Key Obligations')).toBeDefined();
    expect(screen.getByText('strict secrecy')).toBeDefined();
    expect(screen.getByText('Section 8.2')).toBeDefined();
    expect(screen.getByText('High attention required')).toBeDefined();
    expect(screen.getByText('India (Indian Contract Act)')).toBeDefined();

    const tableWrapper = container.querySelector('.markdown-table-wrapper');
    expect(tableWrapper).toBeDefined();
    const table = container.querySelector('table');
    expect(table).toBeDefined();
    const headers = container.querySelectorAll('th');
    expect(headers.length).toBe(3);
  });

  it('renders CustomSelect, opens popup on click, and triggers onChange', () => {
    const handleChange = vi.fn();
    const options: CustomSelectOption<string>[] = [
      { value: 'in', label: 'India', description: 'Indian Contract Act & BNSS' },
      { value: 'us', label: 'United States', description: 'Federal & State General' },
      { value: 'uk', label: 'United Kingdom', description: 'English Common Law' },
    ];

    const { rerender } = render(
      <CustomSelect
        label="Target Jurisdiction"
        value="in"
        onChange={handleChange}
        options={options}
        variant="form"
      />
    );

    // Initial label rendered
    expect(screen.getByText('Target Jurisdiction')).toBeDefined();
    expect(screen.getByRole('combobox')).toBeDefined();
    expect(screen.getByText('India')).toBeDefined();

    // Dropdown popover not open initially
    expect(screen.queryByText('Indian Contract Act & BNSS')).toBeNull();

    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Indian Contract Act & BNSS')).toBeDefined();
    expect(screen.getByText('United States')).toBeDefined();
    expect(screen.getByText('Federal & State General')).toBeDefined();

    // Select United States option
    fireEvent.click(screen.getByText('United States'));
    expect(handleChange).toHaveBeenCalledWith('us');

    // Re-render with new value
    rerender(
      <CustomSelect
        label="Target Jurisdiction"
        value="us"
        onChange={handleChange}
        options={options}
        variant="form"
      />
    );
    expect(screen.getByText('United States')).toBeDefined();
  });

  it('closes CustomSelect when pressing Escape key', () => {
    const handleChange = vi.fn();
    const options: CustomSelectOption<string>[] = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ];

    render(
      <CustomSelect
        value="opt1"
        onChange={handleChange}
        options={options}
        variant="pill"
      />
    );

    // Click to open
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeDefined();

    // Press Escape
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders grounded SourceCard with page number and section title', () => {
    render(
      <SourceCard
        source={{
          documentName: 'Employment_Agreement.txt',
          pageNumber: 3,
          sectionTitle: 'Section 7.2 Termination',
        }}
      />
    );

    expect(screen.getByText('Employment_Agreement.txt')).toBeDefined();
    expect(screen.getByText('p. 3')).toBeDefined();
    expect(screen.getByText('Section 7.2 Termination')).toBeDefined();
  });

  it('renders Composer with speech-to-text mic icon to the left of input arrow', () => {
    const handleSend = vi.fn();
    const handleStop = vi.fn();
    const handleModeChange = vi.fn();

    render(
      <Composer
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={false}
        activeMode="general"
        onModeChange={handleModeChange}
        jurisdiction="in"
      />
    );

    const micButton = screen.getByRole('button', { name: /speech to text/i });
    expect(micButton).toBeDefined();
    expect(micButton.getAttribute('title')).toContain('Speech-to-Text');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDefined();

    // Verify mic button is situated immediately to the left of the send arrow button
    expect(micButton.nextElementSibling).toBe(sendButton);
  });

  it('renders the persistent legal disclaimer', () => {
    render(<LegalDisclaimer />);
    expect(
      screen.getByText(/Counsel provides legal information and document assistance/i)
    ).toBeDefined();
  });

  it('renders DeleteConfirmationModal, verifies title preview, and handles confirm/cancel', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    const { rerender } = render(
      <DeleteConfirmationModal
        isOpen={false}
        onClose={handleClose}
        onConfirm={handleConfirm}
        conversationTitle="NDA Agreement Review"
      />
    );

    // When closed, nothing should be in the document
    expect(screen.queryByText('Delete Consultation?')).toBeNull();

    // When open, verify title and content
    rerender(
      <DeleteConfirmationModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        conversationTitle="NDA Agreement Review"
      />
    );

    expect(screen.getByText('Delete Consultation?')).toBeDefined();
    expect(screen.getByText('NDA Agreement Review')).toBeDefined();
    expect(screen.getByText(/All conversation messages, attached legal document analyses/i)).toBeDefined();

    // Test Cancel button
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Test Delete button
    const deleteButton = screen.getByRole('button', { name: /delete chat/i });
    fireEvent.click(deleteButton);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders Header without disclosing Google or NVIDIA provider buttons', () => {
    const handleToggle = vi.fn();
    const handleJurisdiction = vi.fn();
    const handleAIMode = vi.fn();
    const handleTheme = vi.fn();

    render(
      <Header
        onToggleSidebar={handleToggle}
        jurisdiction="in"
        onJurisdictionChange={handleJurisdiction}
        aiMode="normal"
        onAIModeToggle={handleAIMode}
        theme="light"
        onThemeToggle={handleTheme}
      />
    );

    // Verify brand and navigation elements
    expect(screen.getByText('Counsel')).toBeDefined();
    expect(screen.getByText('India')).toBeDefined();

    // Verify neither Google nor NVIDIA buttons exist in Header
    expect(screen.queryByRole('button', { name: /^Google$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^NVIDIA$/i })).toBeNull();
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByText('NVIDIA')).toBeNull();
  });

  it('renders SettingsModal without disclosing Default AI Engine or provider names', () => {
    const handleClose = vi.fn();
    const handleUpdate = vi.fn();
    const handleDelete = vi.fn();
    const handleTheme = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={handleClose}
        user={{
          id: 'usr_test',
          email: 'test@counsel.law',
          displayName: 'Test User',
          jurisdiction: 'in',
          preferredProvider: 'nvidia',
          thinkingDefault: false,
          theme: 'light',
          createdAt: new Date().toISOString(),
        }}
        onUserUpdated={handleUpdate}
        onAccountDeleted={handleDelete}
        currentTheme="light"
        onThemeChange={handleTheme}
      />
    );

    expect(screen.getByText('Counsel Settings')).toBeDefined();
    expect(screen.getByText('Target Jurisdiction')).toBeDefined();
    expect(screen.getByText('Thinking Mode by Default')).toBeDefined();

    // Ensure Default AI Engine and provider names are NOT disclosed in settings
    expect(screen.queryByText('Default AI Engine')).toBeNull();
    expect(screen.queryByText('NVIDIA Nemotron 3')).toBeNull();
    expect(screen.queryByText('Google Gemma 4')).toBeNull();
  });

  it('renders attached document card inside the user chat bubble', () => {
    const userMessageWithAttachment = {
      id: 'msg_1',
      conversationId: 'conv_1',
      userId: 'usr_1',
      role: 'user' as const,
      content: 'Please summarize the liability clauses in this agreement.',
      attachments: [
        {
          id: 'doc_1',
          name: 'Non_Disclosure_Agreement_2026.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 245760, // 240 KB
          pageCount: 3,
        },
      ],
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
    };

    render(<MessageBubble message={userMessageWithAttachment} />);

    // Filename should be rendered inside user message
    expect(screen.getByText('Non_Disclosure_Agreement_2026.pdf')).toBeDefined();
    // Metadata: PDF • 3 pages • 240 KB
    expect(screen.getByText('PDF • 3 pages • 240 KB')).toBeDefined();
    // Prompt content should also be rendered
    expect(screen.getByText('Please summarize the liability clauses in this agreement.')).toBeDefined();
  });
});

