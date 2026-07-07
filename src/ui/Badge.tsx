import React from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  primary: 'bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary)]/20',
  success: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  danger: 'bg-red-500/10 text-[var(--color-danger)] border border-red-500/20',
  info: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-text-muted)]',
  primary: 'bg-[var(--color-primary)]',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-[var(--color-danger)]',
  info: 'bg-blue-500',
};

export function Badge({ variant = 'default', children, className, dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
      variantClasses[variant],
      className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />}
      {children}
    </span>
  );
}
