import { type ReactNode } from 'react';

interface EvidenceProps {
  title?: ReactNode;
  children: ReactNode;
}

// Collapsible technical-detail panel. Used by result cards to surface
// signed hash, audit ledger reference, integrity proof — without
// cluttering the primary surface.
export function Evidence({ title = 'Show technical details', children }: EvidenceProps) {
  return (
    <details className="mt-3 border-t border-border pt-3 text-caption text-text-muted">
      <summary className="cursor-pointer select-none font-semibold text-text-muted hover:text-text">
        {title}
      </summary>
      <div className="mt-2 space-y-1 font-mono">{children}</div>
    </details>
  );
}
