import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Action, Card, Hero, Identity, Sheet, useToast } from '@/components/ui';
import { useIdentities } from '@/lib/hooks';
import { useIdentityStore, classifyPersona, type PersonaKind } from '@/lib/identity-store';
import { EARN_ROLES, isComingSoonRole, type EarnRole } from '@/lib/earn-roles';

// Phase 11.9 — hero rebrand to Earn / Use (was Worker / Citizen).
// "Earn" covers labelers + drivers + cooks + maids + kiranas via an
// in-flow role chooser. Provider roles are "Coming Phase 12" tiles
// until the providerIdentity substrate ships.
//
// Why Earn / Use, not Worker / Citizen:
//   The plan is to onboard every shape of working-class India —
//   not just gig-economy "workers" but also drivers, cooks, maids,
//   kirana owners, electricians. "Worker" reads narrow + slightly
//   demeaning in Indian English; "Earn" is action-framed and covers
//   the full earner motion. "Use" / "Citizen" stays for consumers.
//   "Business" is reserved for sponsor onboarding (MFI / bank /
//   research lab) — DO NOT reuse on the earner side.

export function OnboardingPage() {
  const navigate = useNavigate();
  // Two-step picker: kind ('worker'|'citizen') first, then for
  // the earn side, a role chooser before the persona picker.
  const [chosenKind, setChosenKind] = useState<PersonaKind | null>(null);
  const [chosenRole, setChosenRole] = useState<EarnRole | null>(null);
  const setActive = useIdentityStore((s) => s.setActive);
  const { data: identities = [], isLoading, error } = useIdentities();
  const show = useToast((s) => s.show);

  const filtered = identities.filter(
    (i) => !/(bootstrap|tenant)/i.test(i.displayName ?? '') && classifyPersona(i) === chosenKind
  );

  function closeAll() {
    setChosenKind(null);
    setChosenRole(null);
  }

  function pickRole(role: EarnRole) {
    if (isComingSoonRole(role)) {
      // Stay in the sheet; the tile will render its placeholder
      // copy. We don't navigate or activate any identity.
      setChosenRole(role);
      return;
    }
    setChosenRole(role);
  }

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
              <h3 className="text-heading font-semibold">I earn</h3>
            </div>
            <p className="mb-4 text-body text-text-muted">
              Label data, drive a cab, cook, run a shop, do skilled work.
              Get paid in UPI, not crypto. Show verified income to lenders.
            </p>
            <Action size="lg" onClick={() => setChosenKind('worker')}>
              Continue as an earner →
            </Action>
          </Card>
        }
        right={
          <Card className="text-left" tone="trust">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-trust-100 text-trust text-heading">
                ✦
              </span>
              <h3 className="text-heading font-semibold">I use</h3>
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
        footer={<span>Bharat OS is open-source. Built India-first.</span>}
      />

      {/* Step 1 for earner side: role chooser. */}
      <Sheet
        open={chosenKind === 'worker' && chosenRole === null}
        onClose={closeAll}
        title="How do you want to earn?"
      >
        <p className="text-body text-text-muted">
          Pick a way to earn. Some flows are live today; provider roles
          (driver, cook, kirana, maid, skilled trades) arrive in Phase 12.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {EARN_ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => pickRole(role)}
              className={
                'flex items-start gap-3 rounded-md border-2 p-3 text-left transition-colors ' +
                (isComingSoonRole(role)
                  ? 'border-border bg-surface-2 hover:border-text-muted'
                  : 'border-border bg-white hover:border-trust hover:bg-trust-50')
              }
            >
              <span
                aria-hidden
                className={
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-heading ' +
                  (isComingSoonRole(role)
                    ? 'bg-white text-text-muted border border-border'
                    : 'bg-trust-50 text-trust')
                }
              >
                {role.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text">
                  {role.label}
                  {isComingSoonRole(role) && (
                    <span className="ml-2 rounded-sm bg-orange-50 px-1.5 py-0.5 font-mono text-xs text-orange-700">
                      Phase 12
                    </span>
                  )}
                </p>
                <p className="mt-1 text-caption text-text-muted">{role.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Step 1 for citizen side OR step 2 for earner side: persona picker (only for live roles). */}
      <Sheet
        open={
          (chosenKind === 'citizen') ||
          (chosenKind === 'worker' && chosenRole !== null && !isComingSoonRole(chosenRole))
        }
        onClose={closeAll}
        title={
          chosenKind === 'citizen'
            ? 'Pick a citizen persona'
            : chosenRole
              ? `Pick a persona for ${chosenRole.label}`
              : ''
        }
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
                  navigate(
                    chosenKind === 'worker'
                      ? chosenRole?.targetPath ?? '/worker'
                      : '/citizen'
                  );
                }}
                className="block w-full rounded-md border border-border bg-white p-3 text-left transition-colors hover:border-primary"
              >
                <Identity
                  name={identity.displayName}
                  meta={chosenKind === 'worker' ? chosenRole?.label ?? 'Earner' : 'Citizen'}
                />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Coming-soon detail sheet for provider roles. */}
      <Sheet
        open={chosenKind === 'worker' && chosenRole !== null && isComingSoonRole(chosenRole)}
        onClose={closeAll}
        title={chosenRole?.label ?? ''}
      >
        {chosenRole && isComingSoonRole(chosenRole) && (
          <Card tone="warning">
            <p className="text-body">
              <span className="font-semibold">{chosenRole.label}</span> onboarding
              ships in <span className="font-mono">Phase 12.0</span> —
              providerIdentity substrate with verified KYC + role attestation +
              Trust Passport.
            </p>
            <p className="mt-3 text-caption text-text-muted">
              {chosenRole.comingSoonNote ??
                'When this ships, you will set up your verified profile, list your service area, and start receiving bookings directly from citizens. Bharat OS does not take a cut of your earnings.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Action variant="secondary" onClick={() => setChosenRole(null)}>
                ← Back to earn options
              </Action>
              <Action variant="ghost" onClick={closeAll}>
                Close
              </Action>
            </div>
          </Card>
        )}
      </Sheet>
    </div>
  );
}
