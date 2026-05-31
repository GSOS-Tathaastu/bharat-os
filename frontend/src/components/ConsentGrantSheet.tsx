import { useEffect, useState } from 'react';
import { Action, Card, Sheet } from '@/components/ui';

interface ConsentGrantSheetProps {
  open: boolean;
  onClose: () => void;
  scopes: string[];
  granteeId: string;
  purpose: string;
  ttlDays?: number;
  granting: boolean;
  onGrant: (scopes: string[], ttlDays: number) => void;
}

// Phase 11.8 — generic consent grant sheet launched from the
// citizen OutcomeCard when an intent was blocked on a consent
// gate. Lists each required scope with a checkbox (default ALL
// checked — the citizen can opt out per scope but the orchestrator
// will still block if any required scope is missing) + the TTL
// they're granting for + revocability note.
//
// §15: the citizen sees exactly which scopes are being granted,
// to whom (granteeId — `bharat-os-orchestrator` for service
// brokering), and for what purpose. Every consent is signed by
// the citizen so the artifact is authentic — server cannot
// fabricate one.
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'service.book': 'Let Bharat OS book the service on your behalf.',
  'consent.record': 'Record this consent in your audit ledger.',
  'upi.settle': 'Settle payment with the provider over UPI.',
  'identity.verify': 'Confirm your identity to the provider.',
  'scheme.eligibility': 'Check your eligibility for this scheme.',
  'health.record.read': 'Read the relevant health record summary.',
  'memory.read': 'Read your local memory to compose a brief.',
  'trust.attest': 'Mint a Trust Passport attestation.',
  'mesh.store': 'Store the payload on your mesh node.',
  'labor.match': 'Find a worker for this labor request.',
  'worker.notify': 'Notify matched workers.',
  'regulated.workflow': 'Run a regulated workflow.',
  'training.donate': 'Donate gradient updates from your device.',
  'training.donate_bytes': 'Donate the gradient bytes (not just hashes).'
};

const DURATION_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' }
];

export function ConsentGrantSheet({
  open,
  onClose,
  scopes,
  granteeId,
  purpose,
  ttlDays = 30,
  granting,
  onGrant
}: ConsentGrantSheetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(scopes));
  const [chosenTtl, setChosenTtl] = useState<number>(ttlDays);

  // Reset selection whenever the sheet opens for a new requirement.
  useEffect(() => {
    if (open) {
      setChecked(new Set(scopes));
      setChosenTtl(ttlDays);
    }
  }, [open, scopes, ttlDays]);

  function toggle(scope: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  const allChecked = scopes.every((s) => checked.has(s));
  const cleanGrantee = granteeId.replace(/^bharat-os-/, '').replace(/-/g, ' ');

  return (
    <Sheet open={open} onClose={onClose} title="Grant consent">
      <p className="text-body text-text-muted">
        Bharat OS needs your permission for the steps below. You can revoke any
        consent at any time from the Trust tab.
      </p>

      <Card className="mt-3" tone="governance">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Grantee
        </p>
        <p className="mt-1 font-mono text-body capitalize">{cleanGrantee}</p>
        <p className="mt-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Purpose
        </p>
        <p className="mt-1 text-body">{purpose}</p>
      </Card>

      <div className="mt-3 space-y-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Scopes
        </p>
        {scopes.map((scope) => {
          const isChecked = checked.has(scope);
          return (
            <label
              key={scope}
              className="flex cursor-pointer items-start gap-3 rounded-md border-2 border-border bg-white p-3 hover:border-trust"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(scope)}
                className="mt-1 h-5 w-5 cursor-pointer accent-trust"
              />
              <div className="flex-1">
                <p className="font-mono text-body text-text">{scope}</p>
                {SCOPE_DESCRIPTIONS[scope] && (
                  <p className="mt-1 text-caption text-text-muted">
                    {SCOPE_DESCRIPTIONS[scope]}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Valid for
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChosenTtl(opt.value)}
              className={
                chosenTtl === opt.value
                  ? 'rounded-sm border-2 border-trust bg-trust-50 px-3 py-1 text-caption font-semibold text-trust-700'
                  : 'rounded-sm border-2 border-border bg-white px-3 py-1 text-caption text-text-muted hover:border-trust'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!allChecked && (
        <p className="mt-3 text-caption text-orange-700">
          Bharat OS may still block this action if any required scope is missing.
          You can grant only what you are comfortable with.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Action
          onClick={() => onGrant(Array.from(checked), chosenTtl)}
          disabled={granting || checked.size === 0}
        >
          {granting
            ? 'Granting…'
            : checked.size === scopes.length
              ? 'Grant + retry intent'
              : `Grant ${checked.size} of ${scopes.length}`}
        </Action>
        <Action variant="ghost" onClick={onClose} disabled={granting}>
          Cancel
        </Action>
      </div>
    </Sheet>
  );
}
