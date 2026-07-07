import React, { useState } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../../lib/utils';
import { ThinkingBlock } from '../../../ui/ThinkingBlock';
import { MessageActions } from './MessageActions';
import { CodeBlock } from './CodeBlock';
import type { ChatMessage } from '../../../types/api';

interface ChatBubbleProps {
  message: ChatMessage;
  messageIndex: number;
  isLastAssistant: boolean;
  isLoading: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onFeedback?: (rating: 'up' | 'down', messageIndex: number) => void;
}

export function ChatBubble({
  message,
  messageIndex,
  isLastAssistant,
  isLoading,
  onRegenerate,
  onEdit,
  onFeedback,
}: ChatBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isStreamingThis = isLoading && isLastAssistant && isAssistant;
  const showLoadingDots = isStreamingThis && !message.content && !message.thinking;

  // Sanitize content: detect raw JSON and Ollama metadata leaks
  const displayContent = React.useMemo(() => {
    const content = message.content || '';
    if (!content.trim()) return content;

    const trimmed = content.trim();

    // Case 1: Entire content is a single JSON object/array
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.model || parsed.choices || parsed.message || parsed.data) {
          return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
        }
        return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
      } catch {
        // Not valid JSON as a whole — check for NDJSON lines
      }
    }

    // Case 2: Content has multiple JSON lines (Ollama NDJSON leak)
    const lines = trimmed.split('\n');
    if (lines.length > 1 && lines.filter(l => l.trim()).every(l => l.trim().startsWith('{'))) {
      const jsonLines = lines.filter(l => l.trim().startsWith('{'));
      if (jsonLines.length > 1) {
        let extracted = '';
        for (const line of jsonLines) {
          try {
            const obj = JSON.parse(line);
            const text = obj.message?.content || obj.response || obj.choices?.[0]?.delta?.content || '';
            extracted += text;
          } catch {}
        }
        if (extracted) return extracted;
        return '```json\n' + trimmed + '\n```';
      }
    }

    // Case 3: Ollama JSON metadata leaked INLINE within text content
    // Pattern: normal text{"model":"...","created_at":"...","message":{...},"done":...}more text
    // Strip these inline JSON blobs
    const ollamaMetaPattern = /\{"model":"[^"]*","created_at":"[^"]*","message":\{"role":"[^"]*","content":"[^"]*"(?:,"thinking":"[^"]*")?\},"done":\w+\}/g;
    if (ollamaMetaPattern.test(content)) {
      let cleaned = content.replace(ollamaMetaPattern, (match) => {
        // Extract the actual content from the leaked metadata
        try {
          const obj = JSON.parse(match);
          return obj.message?.content || '';
        } catch {
          return '';
        }
      });
      // Clean up any double spaces or orphaned punctuation from removal
      cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
      return cleaned;
    }

    // Case 4: More generic pattern — any {...} blob with "model" and "done" fields inline
    const genericMetaPattern = /\{"model":"[^"]*"[^}]*"done":\s*(?:true|false)\}/g;
    if (genericMetaPattern.test(content)) {
      let cleaned = content.replace(genericMetaPattern, (match) => {
        try {
          const obj = JSON.parse(match);
          return obj.message?.content || obj.response || '';
        } catch {
          return '';
        }
      });
      cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
      return cleaned;
    }

    return content;
  }, [message.content]);

  const handleEditStart = () => {
    setEditValue(message.content);
    setIsEditing(true);
  };

  const handleEditSubmit = () => {
    if (editValue.trim() && editValue.trim() !== message.content) {
      onEdit?.(message.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditValue(message.content);
  };

  return (
    <div className={cn('group flex gap-3 py-3', isUser ? 'justify-end' : '')}>
      {/* Avatar: assistant */}
      {isAssistant && (
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          message.isError ? 'bg-red-500/15' : 'bg-[var(--color-primary-light)]'
        )}>
          <Bot size={14} className={message.isError ? 'text-red-400' : 'text-[var(--color-primary)]'} />
        </div>
      )}

      {/* Bubble content */}
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[80%]',
          isUser
            ? 'bg-[var(--color-primary)] text-white rounded-br-md'
            : message.isError
              ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-md'
              : 'bg-[var(--color-surface-alt)] text-[var(--color-text)] rounded-bl-md'
        )}
      >
        {isAssistant ? (
          <div>
            {/* Thinking block */}
            {message.thinking && (
              <ThinkingBlock
                thinking={message.thinking}
                isStreaming={isStreamingThis && !message.content}
              />
            )}

            {/* Loading dots — only if no content AND no thinking yet */}
            {showLoadingDots ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" />
                <span className="text-[var(--color-text-muted)] text-xs">Thinking...</span>
              </div>
            ) : (
              <div className="chat-prose max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ code: CodeBlock as any }}
                >
                  {displayContent}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ) : isEditing ? (
          /* Inline edit mode for user messages */
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full bg-white/20 rounded-lg px-2 py-1 text-sm text-white placeholder:text-white/60 outline-none resize-none min-h-[40px]"
              rows={2}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                if (e.key === 'Escape') handleEditCancel();
              }}
            />
            <div className="flex gap-1 justify-end">
              <button onClick={handleEditCancel} className="text-xs text-white/70 hover:text-white px-2 py-0.5 rounded">
                Cancel
              </button>
              <button onClick={handleEditSubmit} className="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded">
                Submit
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}

        {/* Cost badge */}
        {message.cost !== undefined && message.cost > 0 && (
          <div className="mt-1.5 text-[10px] opacity-60">{message.cost} credits</div>
        )}
      </div>

      {/* Avatar: user */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-alt)] flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-[var(--color-text-muted)]" />
        </div>
      )}

      {/* Hover action buttons */}
      {!isEditing && !showLoadingDots && message.content && (
        <div className="self-end mb-1">
          <MessageActions
            content={message.content}
            role={message.role}
            messageId={message.id}
            messageIndex={messageIndex}
            isLoading={isLoading}
            onRegenerate={onRegenerate}
            onEdit={onEdit ? () => handleEditStart() : undefined}
            onFeedback={onFeedback}
          />
        </div>
      )}
    </div>
  );
}
