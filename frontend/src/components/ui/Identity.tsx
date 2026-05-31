import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface IdentityProps {
  name: string;
  meta?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

const sizeStyles = {
  sm: { avatar: 'h-7 w-7 text-caption', text: 'text-caption', meta: 'text-[10px]' },
  md: { avatar: 'h-10 w-10 text-body', text: 'text-body', meta: 'text-caption' },
  lg: { avatar: 'h-14 w-14 text-heading', text: 'text-body-lg', meta: 'text-body' }
} as const;

export function Identity({ name, meta, size = 'md', className, onClick, trailing }: IdentityProps) {
  const s = sizeStyles[size];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-3 rounded-md',
        onClick && 'cursor-pointer transition-colors hover:bg-surface px-2 py-1 -mx-2 -my-1',
        className
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold',
          s.avatar
        )}
        aria-hidden
      >
        {initials(name)}
      </span>
      <span className="min-w-0 text-left">
        <span className={cn('block truncate font-semibold text-text', s.text)}>{name}</span>
        {meta && <span className={cn('block truncate text-text-muted', s.meta)}>{meta}</span>}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </Tag>
  );
}
