import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  className?: string;
}

export function Stat({ label, value, delta, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-display font-semibold tabular-nums text-text">{value}</span>
      {delta && <span className="text-caption text-text-muted">{delta}</span>}
    </div>
  );
}
