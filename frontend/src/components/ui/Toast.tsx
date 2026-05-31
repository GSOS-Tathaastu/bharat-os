import { create } from 'zustand';
import { cn } from '@/lib/cn';

type ToastKind = 'info' | 'success' | 'error';
interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastEntry[];
  show: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show(message, kind = 'info') {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 4000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  }
}));

const kindStyles: Record<ToastKind, string> = {
  info: 'bg-text text-white',
  success: 'bg-trust text-white',
  error: 'bg-error text-white'
};

export function ToastRoot() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            'rounded-md px-4 py-2 text-body font-semibold shadow-elevated transition-opacity',
            kindStyles[t.kind]
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
