import React, { useState } from 'react';
import { X, Briefcase, Sparkles } from 'lucide-react';

interface LawyerPrepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartBriefing: (prompt: string) => void;
}

export const LawyerPrepModal: React.FC<LawyerPrepModalProps> = ({
  isOpen,
  onClose,
  onStartBriefing,
}) => {
  const [situation, setSituation] = useState('');
  const [facts, setFacts] = useState('');
  const [documents, setDocuments] = useState('');
  const [questions, setQuestions] = useState('');

  if (!isOpen) return null;

  const handleLoadSampleScenario = () => {
    setSituation('A former consulting client is refusing to pay two outstanding invoices totaling $24,500 for backend development work completed under a master services agreement, claiming the product was delivered past an informal deadline.');
    setFacts('1. Signed Statement of Work on April 2, 2025 specifying deliverables.\n2. Work was delivered on May 15, 2025; client acknowledged receipt in Slack.\n3. Invoices #104 ($12,000) and #105 ($12,500) were issued June 1 and July 1.\n4. Net-30 payment term passed without payment.\n5. On August 10, client sent email asserting alleged loss of revenue.');
    setDocuments('1. Signed Master Services Agreement & SOW.\n2. Exported Slack conversations acknowledging receipt.\n3. GitHub commit logs showing timestamps of code delivery.\n4. Unpaid invoices #104 and #105.');
    setQuestions('1. Does the client have valid grounds to withhold payment based on informal text messages?\n2. What is the statute of limitations for contract breach in this jurisdiction?\n3. Should I send a formal demand letter or proceed directly to mediation/small claims court?\n4. Can I recover legal fees under the contract terms?');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const formattedPrompt = `Please generate a structured, professional Lawyer Consultation Briefing based on the following situation:

### SITUATION OVERVIEW:
${situation}

### KEY FACTS & CHRONOLOGY:
${facts}

### RELEVANT DOCUMENTS & EVIDENCE:
${documents}

### SPECIFIC QUESTIONS FOR THE LAWYER:
${questions}

Please organize this into an executive briefing document: Situation Summary, Verified Facts, Timeline, Potential Issues to Explore, Questions for Lawyer, Evidence Checklist, and Important Deadlines to Verify.`;

    onStartBriefing(formattedPrompt);
    onClose();
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
          maxWidth: '620px',
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
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Briefcase size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Prepare for a Lawyer
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Turn your situation into an organized legal briefing to save consultation time and costs
              </p>
            </div>
          </div>

          <button onClick={onClose} style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Quick Scenario Loader */}
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--surface-raised)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span>Need an example?</span>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleScenario}
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--accent)',
                backgroundColor: 'var(--accent-subtle)',
                padding: '0.25rem 0.6rem',
                borderRadius: '4px',
              }}
            >
              Load Sample Dispute
            </button>
          </div>

          {/* Situation */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.3rem' }}>
              1. What is the core situation or dispute?
            </label>
            <textarea
              required
              rows={3}
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="Explain the background problem in your own words..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Key Facts */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.3rem' }}>
              2. What are the key verified facts and dates?
            </label>
            <textarea
              required
              rows={3}
              value={facts}
              onChange={(e) => setFacts(e.target.value)}
              placeholder="Dates of agreements, messages, payments, or actions taken..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Documents */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.3rem' }}>
              3. What documents or evidence do you currently possess?
            </label>
            <textarea
              rows={2}
              value={documents}
              onChange={(e) => setDocuments(e.target.value)}
              placeholder="e.g. Invoices, contracts, emails, text messages, receipts..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Questions */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '0.3rem' }}>
              4. What specific questions do you want answered by legal counsel?
            </label>
            <textarea
              rows={3}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder="What questions or decisions do you need advice on?"
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--accent)',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              Generate Lawyer Briefing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
