import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const elements = parseMarkdownToReact(content);
  return <div className="markdown-body">{elements}</div>;
};

function parseMarkdownToReact(markdown: string): React.ReactNode[] {
  const lines = markdown.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // 1. Headings
    if (trimmed.startsWith('# ')) {
      nodes.push(<h1 key={`h1-${i}`}>{renderInline(trimmed.substring(2))}</h1>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(<h2 key={`h2-${i}`}>{renderInline(trimmed.substring(3))}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${i}`}>{renderInline(trimmed.substring(4))}</h3>);
      i++;
      continue;
    }

    // 2. GitHub-style Callouts (> [!NOTE], > [!IMPORTANT], > [!WARNING])
    if (trimmed.startsWith('> [!NOTE]') || trimmed.startsWith('> [!TIP]')) {
      const calloutLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].trim().substring(1).trim());
        i++;
      }
      nodes.push(
        <div key={`callout-note-${i}`} className="callout-note">
          {calloutLines.map((l, idx) => (
            <p key={idx}>{renderInline(l)}</p>
          ))}
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('> [!IMPORTANT]') || trimmed.startsWith('> [!WARNING]') || trimmed.startsWith('> [!CAUTION]')) {
      const calloutLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].trim().substring(1).trim());
        i++;
      }
      nodes.push(
        <div key={`callout-warn-${i}`} className="callout-warning">
          {calloutLines.map((l, idx) => (
            <p key={idx}>{renderInline(l)}</p>
          ))}
        </div>
      );
      continue;
    }

    // 3. Regular Blockquotes
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().substring(1).trim());
        i++;
      }
      nodes.push(
        <blockquote key={`quote-${i}`}>
          {quoteLines.map((l, idx) => (
            <p key={idx}>{renderInline(l)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 4. Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        // Check if delimiter row (|---|---|)
        if (rowLine.includes('---')) {
          i++;
          continue;
        }
        const cells = rowLine
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        tableRows.push(cells);
        i++;
      }

      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        nodes.push(
          <div key={`table-${i}`} className="markdown-table-wrapper">
            <table>
              <thead>
                <tr>
                  {header.map((th, hIdx) => (
                    <th key={hIdx}>{renderInline(th)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((td, cIdx) => (
                      <td key={cIdx}>{renderInline(td)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // 5. Code blocks (```)
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      nodes.push(
        <pre key={`code-${i}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 6. Bullet lists
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('* ') || lines[i].trim().startsWith('- '))) {
        listItems.push(lines[i].trim().substring(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`}>
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 7. Numbered lists
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`}>
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 8. Paragraphs
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('* ') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('```') &&
      !/^\d+\.\s/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    nodes.push(<p key={`p-${i}`}>{renderInline(paraLines.join(' '))}</p>);
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  // Inline code: `text`
  // Italic: *text*
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
