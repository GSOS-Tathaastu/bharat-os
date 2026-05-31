import { Link } from 'react-router-dom';
import { Identity } from '@/components/ui';
import { useIdentityStore, classifyPersona } from '@/lib/identity-store';
import { useIdentities } from '@/lib/hooks';
import { useState } from 'react';
import { Sheet } from '@/components/ui';
import { Action } from '@/components/ui';

interface TopBarProps {
  identity: { id: string; displayName: string } | undefined;
}

// Persona-switcher pinned top-right on every protected surface.
export function TopBar({ identity }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const { data: identities = [] } = useIdentities();
  const setActive = useIdentityStore((s) => s.setActive);
  const clear = useIdentityStore((s) => s.clear);

  if (!identity) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-white font-semibold">
            ⚒
          </span>
          <span className="text-heading font-semibold">Bharat OS</span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1 transition-colors hover:bg-surface"
          aria-label="Switch persona"
        >
          <Identity name={identity.displayName} size="sm" />
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Switch persona">
        <ul className="flex flex-col gap-2">
          {identities.map((i) => {
            const persona = classifyPersona(i);
            const isActive = i.id === identity.id;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(i.id);
                    setOpen(false);
                    const next = persona === 'worker' ? '/worker' : '/citizen';
                    window.history.pushState({}, '', `/app${next}`);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:border-primary ${
                    isActive ? 'border-primary bg-primary-50' : 'border-border bg-white'
                  }`}
                >
                  <Identity
                    name={i.displayName}
                    meta={persona === 'worker' ? 'Worker' : 'Citizen'}
                  />
                  {isActive && <span className="text-caption font-semibold text-primary">Active</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-border pt-4">
          <Action
            variant="ghost"
            size="sm"
            onClick={() => {
              clear();
              setOpen(false);
              window.location.href = '/app/';
            }}
          >
            Sign out (forget this persona on this device)
          </Action>
        </div>
      </Sheet>
    </header>
  );
}
