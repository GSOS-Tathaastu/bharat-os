import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: 'default' | 'trust' | 'warning' | 'governance';
}

const toneStyles: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'bg-white border-border',
  trust: 'bg-trust-50 border-trust-100',
  warning: 'bg-orange-50 border-orange-100',
  governance: 'bg-governance-50 border-governance-100'
};

export function Card({ title, subtitle, actions, children, className, tone = 'default' }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-md border p-4 shadow-card',
        toneStyles[tone],
        className
      )}
    >
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-heading font-semibold text-text">{title}</h2>}
            {subtitle && <p className="mt-1 text-caption text-text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
