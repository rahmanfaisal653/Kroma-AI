import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
  node?: any;
}

/**
 * Custom code renderer for ReactMarkdown.
 * Inline code: renders as <code> with styling.
 * Block code: renders with language label + copy button.
 */
export function CodeBlock({ children, className, inline, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Inline code
  if (inline) {
    return (
      <code
        className="bg-[var(--color-surface)] text-[var(--color-primary)] px-1.5 py-0.5 rounded text-[13px] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Block code — extract language from className (e.g. "language-python")
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = codeText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-[var(--color-border)]">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[var(--color-surface)] px-3 py-1.5 border-b border-[var(--color-border)]">
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
          )}
        >
          {copied ? (
            <>
              <Check size={10} className="text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="bg-slate-950 px-4 py-3 overflow-x-auto">
        <code className={cn('text-xs font-mono leading-relaxed text-slate-200', className)}>
          {codeText}
        </code>
      </pre>
    </div>
  );
}
