import React from 'react';
import { cn } from '../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, hint, icon, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'h-10 w-full rounded-[var(--radius-md)]',
            'border border-[var(--color-border)] bg-[var(--color-input-bg)] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
            'px-3 text-sm text-[var(--color-text)]',
            'placeholder:text-[var(--color-text-muted)]',
            'transition-all duration-150',
            'focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]',
            'hover:border-[var(--color-border-hover)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            icon && 'pl-9',
            error && 'border-[var(--color-danger)] focus:ring-red-500/20',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[var(--color-danger)] flex items-center gap-1">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full rounded-[var(--radius-md)]',
          'border border-[var(--color-border)] bg-[var(--color-input-bg)] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
          'px-3 py-2.5 text-sm text-[var(--color-text)]',
          'placeholder:text-[var(--color-text-muted)]',
          'transition-all duration-150 resize-none',
          'focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]',
          'hover:border-[var(--color-border-hover)]',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          error && 'border-[var(--color-danger)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
