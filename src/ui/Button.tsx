import React from 'react';
import { cn } from '../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'relative overflow-hidden text-white font-semibold',
    'bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_55%,#f472b6_100%)]',
    'shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_10px_28px_rgba(34,211,238,0.20)]',
    'hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_16px_36px_rgba(139,92,246,0.28)] hover:-translate-y-0.5',
    'transition-all duration-200',
  ].join(' '),
  secondary: [
    'bg-[var(--color-surface-alt)] text-[var(--color-text)]',
    'border border-[var(--color-border)] hover:border-[var(--color-border-hover)]',
    'hover:bg-[var(--color-surface-raised)]',
    'transition-all duration-150',
  ].join(' '),
  ghost: [
    'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    'hover:bg-[var(--color-surface-alt)]',
    'transition-all duration-150',
  ].join(' '),
  danger: [
    'bg-[var(--color-danger)] text-white',
    'hover:opacity-90',
    'shadow-[0_1px_3px_rgba(239,68,68,0.3)] hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)]',
    'transition-all duration-150',
  ].join(' '),
  outline: [
    'border border-[var(--color-border)] text-[var(--color-text)]',
    'hover:bg-[var(--color-surface-alt)] hover:border-[var(--color-border-hover)]',
    'transition-all duration-150',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-6 text-sm gap-2.5 rounded-[var(--radius-md)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        'select-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
