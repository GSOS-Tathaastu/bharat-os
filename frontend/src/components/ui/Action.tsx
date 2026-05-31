import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Primary button. 6 variants per ADR 0115.
type Variant = 'default' | 'secondary' | 'trust' | 'governance' | 'destructive' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  default:
    'bg-primary text-white hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-100 disabled:text-text-muted',
  secondary:
    'bg-white text-text border border-border hover:border-primary hover:text-primary disabled:opacity-50',
  trust:
    'bg-trust text-white hover:bg-trust-600 active:bg-trust-700 disabled:bg-trust-100 disabled:text-text-muted',
  governance:
    'bg-governance text-white hover:bg-governance-600 disabled:opacity-50',
  destructive:
    'bg-error text-white hover:opacity-90 disabled:opacity-50',
  ghost:
    'bg-transparent text-text hover:bg-surface disabled:opacity-50'
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-caption gap-1',
  md: 'h-10 px-4 text-body gap-2',
  lg: 'h-12 px-6 text-body-lg gap-2'
};

export const Action = forwardRef<HTMLButtonElement, ActionProps>(
  ({ variant = 'default', size = 'md', leftIcon, rightIcon, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...rest}
    >
      {leftIcon ? <span aria-hidden>{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span aria-hidden>{rightIcon}</span> : null}
    </button>
  )
);
Action.displayName = 'Action';
