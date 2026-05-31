import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Action, Card, Hero, Identity, Sheet, useToast } from '@/components/ui';
import { useIdentities } from '@/lib/hooks';
import { useIdentityStore, classifyPersona, type PersonaKind } from '@/lib/identity-store';

// Phase 11.1 — split-hero onboarding. Worker / Citizen choice on the
// very first screen, then a persona picker showing the seeded demo
// identities matching that path.

export function OnboardingPage() {
  const navigate = useNavigate();
  const [chosenKind, setChosenKind] = useState<PersonaKind | null>(null);
  const setActive = useIdentityStore((s) => s.setActive);
  const { data: identities = [], isLoading, error } = useIdentities();
  const show = useToast((s) => s.show);

  const filtered = identities.filter(
    (i) => !/(bootstrap|tenant)/i.test(i.displayName ?? '') && classifyPersona(i) === chosenKind
  );

  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-white font-semibold">
          ⚒
        </span>
        <span className="text-heading font-semibold">Bharat OS</span>
      </header>

      <Hero
        variant="split"
        eyebrow="A new digital home for India"
        title="Your phone. Your identity. Your data."
        subtitle="One Bharat OS replaces a dozen apps — and never sells what you do."
        left={
          <Card className="text-left">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-primary-50 text-primary text-heading">
                ⚒
              </span>
              <h3 className="text-heading font-semibold">I work</h3>
            </div>
            <p className="mb-4 text-body text-text-muted">
              Earn from your phone. Share spare compute. Get paid in UPI,
              not crypto. Show verified income to lenders.
            </p>
            <Action size="lg" onClick={() => setChosenKind('worker')}>
              Continue as a worker →
            </Action>
          </Card>
        }
        right={
          <Card className="text-left" tone="trust">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-trust-100 text-trust text-heading">
                ✦
              </span>
              <h3 className="text-heading font-semibold">I live</h3>
            </div>
            <p className="mb-4 text-body text-text-muted">
              Replace the 10 apps on your phone with one. Speak in your
              language. Your data stays on your phone.
            </p>
            <Action size="lg" variant="trust" onClick={() => setChosenKind('citizen')}>
              Continue as a citizen →
            </Action>
          </Card>
        }
        footer={
          <span>
            Demo personas are seeded. Bharat OS is open-source and{' '}
            <a href="/shell/" className="underline">developer-shell available</a>.
          </span>
        }
      />

      <Sheet
        open={chosenKind !== null}
        onClose={() => setChosenKind(null)}
        title={chosenKind === 'worker' ? 'Pick a worker persona' : 'Pick a citizen persona'}
      >
        {isLoading && <p className="text-body text-text-muted">Loading personas…</p>}
        {error && (
          <p className="text-body text-error">
            Could not reach Bharat OS API. Is the dev server running?
          </p>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <p className="text-body text-text-muted">No seeded personas for this path.</p>
        )}
        <ul className="flex flex-col gap-2">
          {filtered.map((identity) => (
            <li key={identity.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(identity.id);
                  show(`Welcome, ${identity.displayName.split(' ')[0]}.`, 'success');
                  navigate(chosenKind === 'worker' ? '/worker' : '/citizen');
                }}
                className="block w-full rounded-md border border-border bg-white p-3 text-left transition-colors hover:border-primary"
              >
                <Identity
                  name={identity.displayName}
                  meta={chosenKind === 'worker' ? 'Worker' : 'Citizen'}
                />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
