import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'trust' | 'pending' | 'warning' | 'error' | 'neutral' | 'governance';

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  trust: 'bg-trust-50 text-trust-700',
  pending: 'bg-orange-50 text-orange-700',
  warning: 'bg-orange-100 text-orange-700',
  error: 'bg-red-50 text-red-700',
  neutral: 'bg-surface text-text-muted border border-border',
  governance: 'bg-governance-50 text-governance'
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-semibold uppercase tracking-wide',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
