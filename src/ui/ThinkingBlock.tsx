import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { cn } from '../lib/utils';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, isStreaming = false }: ThinkingBlockProps) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(isStreaming);

  // Auto-expand when streaming starts, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      // Streaming just started → auto-expand
      setManualToggle(null); // reset manual override
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-scroll thinking content during streaming
  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming]);

  if (!thinking) return null;

  // If user manually toggled, respect that. Otherwise auto-expand while streaming.
  const expanded = manualToggle !== null ? manualToggle : isStreaming;

  const handleToggle = () => {
    setManualToggle(prev => prev !== null ? !prev : !isStreaming);
  };

  const charCount = thinking.length;
  const label = isStreaming
    ? `Thinking... (${charCount} chars)`
    : `Thought process (${charCount} chars)`;

  return (
    <div className="mb-2">
      <button
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors',
          'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          'bg-[var(--color-surface)] hover:bg-[var(--color-border)]',
          'border border-[var(--color-border)]'
        )}
      >
        <Brain size={12} className={cn(
          'transition-colors',
          isStreaming ? 'text-amber-500 animate-pulse' : 'text-[var(--color-text-muted)]'
        )} />
        <span>{label}</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {expanded && (
        <div
          ref={contentRef}
          className={cn(
            'mt-1.5 px-3 py-2 rounded-lg text-xs leading-relaxed',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'text-[var(--color-text-muted)] whitespace-pre-wrap',
            'max-h-60 overflow-y-auto transition-all'
          )}
        >
          {thinking}
        </div>
      )}
    </div>
  );
}
