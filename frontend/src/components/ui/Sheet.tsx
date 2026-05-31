import { type ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-lg sm:rounded-lg p-4 shadow-elevated',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
            <h2 className="text-heading font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-text-muted hover:text-text"
            >
              ✕
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
