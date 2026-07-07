import React, { useState } from 'react';
import { Copy, RefreshCw, Edit3, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface MessageActionsProps {
  content: string;
  role: 'user' | 'assistant' | 'system';
  messageId: string;
  messageIndex?: number;
  conversationId?: string;
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onFeedback?: (rating: 'up' | 'down', messageIndex: number) => void;
}

export function MessageActions({
  content,
  role,
  messageId,
  messageIndex,
  isLoading,
  onRegenerate,
  onEdit,
  onFeedback,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFeedback = (rating: 'up' | 'down') => {
    const newRating = feedback === rating ? null : rating;
    setFeedback(newRating);
    if (newRating && messageIndex !== undefined && onFeedback) {
      onFeedback(newRating, messageIndex);
    }
  };

  const btnClass = cn(
    'p-1 rounded transition-colors',
    'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    'hover:bg-[var(--color-surface-alt)]'
  );

  return (
    <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy */}
      <button onClick={handleCopy} className={btnClass} title="Copy">
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>

      {/* Regenerate (assistant only) */}
      {role === 'assistant' && onRegenerate && !isLoading && (
        <button
          onClick={() => onRegenerate(messageId)}
          className={btnClass}
          title="Regenerate"
        >
          <RefreshCw size={12} />
        </button>
      )}

      {/* Feedback (assistant only) */}
      {role === 'assistant' && onFeedback && (
        <>
          <button
            onClick={() => handleFeedback('up')}
            className={cn(btnClass, feedback === 'up' && 'text-green-500')}
            title="Good response"
          >
            <ThumbsUp size={12} />
          </button>
          <button
            onClick={() => handleFeedback('down')}
            className={cn(btnClass, feedback === 'down' && 'text-red-500')}
            title="Bad response"
          >
            <ThumbsDown size={12} />
          </button>
        </>
      )}

      {/* Edit (user only) */}
      {role === 'user' && onEdit && !isLoading && (
        <button
          onClick={() => onEdit(messageId)}
          className={btnClass}
          title="Edit"
        >
          <Edit3 size={12} />
        </button>
      )}
    </div>
  );
}
