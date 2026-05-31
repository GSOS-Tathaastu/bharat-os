import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Hero has two variants:
//  - default: single column page-top headline + subtitle + action slot
//  - split:   two cards side by side (or stacked on mobile) used by /app/
//             onboarding for Worker / Citizen choice
interface BaseProps {
  className?: string;
}

interface DefaultHeroProps extends BaseProps {
  variant?: 'default';
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

interface SplitHeroProps extends BaseProps {
  variant: 'split';
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  left: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}

type HeroProps = DefaultHeroProps | SplitHeroProps;

export function Hero(props: HeroProps) {
  if (props.variant === 'split') {
    const { eyebrow, title, subtitle, left, right, footer, className } = props;
    return (
      <section className={cn('mx-auto max-w-3xl px-4 py-12 text-center', className)}>
        {eyebrow && <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">{eyebrow}</div>}
        <h1 className="text-hero font-semibold text-text">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-xl text-body-lg text-text-muted">{subtitle}</p>}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {left}
          {right}
        </div>
        {footer && <div className="mt-6 text-caption text-text-muted">{footer}</div>}
      </section>
    );
  }

  const { eyebrow, title, subtitle, action, className } = props;
  return (
    <section className={cn('mx-auto max-w-2xl px-4 py-8', className)}>
      {eyebrow && <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">{eyebrow}</div>}
      <h1 className="text-display font-semibold text-text">{title}</h1>
      {subtitle && <p className="mt-2 text-body-lg text-text-muted">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
