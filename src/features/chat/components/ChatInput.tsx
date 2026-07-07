import React, { useRef } from 'react';
import { Send, StopCircle, Paperclip, X } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  disabled: boolean;
  placeholder: string;
  attachedImage: string | null;
  attachedImageName: string;
  onAttachImage: (dataUrl: string, name: string) => void;
  onClearImage: () => void;
}

export function ChatInput({
  input,
  onInputChange,
  onSend,
  onStop,
  isLoading,
  disabled,
  placeholder,
  attachedImage,
  attachedImageName,
  onAttachImage,
  onClearImage,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Only image files are supported for now.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onAttachImage(reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAutoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {/* Attached image preview */}
      {attachedImage && (
        <div className="max-w-4xl mx-auto flex items-center gap-2 mb-2">
          <img
            src={attachedImage}
            alt="attached"
            className="w-12 h-12 rounded-lg object-cover border border-[var(--color-border)]"
          />
          <span className="text-xs text-[var(--color-text-muted)] truncate">{attachedImageName}</span>
          <button
            onClick={onClearImage}
            className="p-1 rounded hover:bg-[var(--color-surface-alt)]"
          >
            <X size={14} className="text-[var(--color-text-muted)]" />
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)]',
            'pl-10 pr-12 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent',
            'disabled:opacity-50 max-h-40 overflow-y-auto'
          )}
          style={{ minHeight: '48px' }}
          onInput={handleAutoResize}
        />

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="absolute left-3 bottom-3.5 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          title="Attach image"
        >
          <Paperclip size={16} />
        </button>

        {/* Send / Stop button */}
        <div className="absolute right-2 bottom-2">
          {isLoading ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
              title="Stop generating"
            >
              <StopCircle size={18} />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!input.trim() || disabled}
              className={cn(
                'p-2 rounded-lg transition-colors',
                input.trim() && !disabled
                  ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                  : 'text-[var(--color-text-muted)] cursor-not-allowed'
              )}
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
