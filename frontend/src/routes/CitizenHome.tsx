import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Action, Badge, Card, Evidence, Tabs, useToast } from '@/components/ui';
import { ConsentGrantSheet } from '@/components/ConsentGrantSheet';
import {
  useActiveIdentity,
  useConsents,
  useGrantConsent,
  useRecentOrchestrations,
  useRevokeConsent,
  useSendIntent,
  type ConsentArtifact,
  type Orchestration
} from '@/lib/hooks';

const ACTION_TYPE_LABEL: Record<string, string> = {
  service_booking: 'Service booking (Bharat OS marketplace)',
  scheme_delivery: 'Government scheme delivery',
  regulated_onboarding: 'Regulated onboarding',
  health_record_read: 'Health record read',
  labor_match_post: 'Labor matching',
  mesh_storage: 'Mesh storage',
  trust_attestation: 'Trust Passport attestation',
  daily_brief: 'On-device daily brief'
};

const ACTION_TYPE_PURPOSE: Record<string, string> = {
  service_booking: 'Book a service for me through the Bharat OS marketplace.',
  scheme_delivery: 'Help me access a government scheme I am eligible for.',
  regulated_onboarding: 'Complete a regulated onboarding flow on my behalf.',
  health_record_read: 'Read my health record summary for this purpose.',
  labor_match_post: 'Post a labor request and match me with workers.',
  trust_attestation: 'Mint a selective-disclosure attestation about me.',
  daily_brief: 'Compose my on-device daily brief.',
  mesh_storage: 'Store this payload on my mesh node.'
};

const TABS = [
  { to: '/citizen/home', label: 'Home', icon: '🏠' },
  { to: '/citizen/trust', label: 'Trust', icon: '🛡' },
  { to: '/labs', label: 'Labs', icon: '🧪' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

const SUGGESTIONS = [
  'Book a cab',
  'Apply for a small loan',
  'Find a doctor near me',
  'Pay my electricity bill',
  'Share my health record with Lakshmi clinic'
];

function CitizenIntent() {
  const identity = useActiveIdentity();
  const [text, setText] = useState('');
  const [lastOutcome, setLastOutcome] = useState<Orchestration | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const sendIntent = useSendIntent();
  const grantConsent = useGrantConsent();
  const { data: recent = [] } = useRecentOrchestrations(identity?.id);
  const show = useToast((s) => s.show);

  function handleSend(intentText: string = text) {
    if (!identity || !intentText.trim()) {
      show('Type or pick what you want to do.', 'error');
      return;
    }
    sendIntent.mutate(
      { identityId: identity.id, intentText },
      {
        onSuccess: (data) => {
          setLastOutcome(data.orchestration);
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  async function handleGrant(scopes: string[], ttlDays: number) {
    if (!identity || !lastOutcome) return;
    const requirement = lastOutcome.consentRequirement;
    if (!requirement?.granteeId) return;
    const actionType = lastOutcome.actionRequest?.actionType;
    const purpose =
      (actionType && ACTION_TYPE_PURPOSE[actionType]) ??
      lastOutcome.intent?.intentText ??
      'Granted from /app/citizen/home';
    try {
      await grantConsent.mutateAsync({
        identityId: identity.id,
        granteeId: requirement.granteeId,
        scopes,
        purpose,
        ttlDays
      });
      setGrantOpen(false);
      // Auto-re-send the same intent so the citizen sees the
      // blocked → planned/completed transition in one motion.
      setAutoRetrying(true);
      handleSend(lastOutcome.intent?.intentText ?? text);
      setAutoRetrying(false);
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  const sendBusy = sendIntent.isPending || autoRetrying;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <section>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
        </p>
        <h1 className="text-display font-semibold">
          What can Bharat OS do for you today?
        </h1>
      </section>

      <Card>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Speak in any language. Hindi · Marathi · Bhojpuri · Tamil · Bengali · English."
          className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className="rounded-sm border border-border bg-white px-3 py-1 text-caption text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Action onClick={() => handleSend()} disabled={sendBusy}>
            {sendIntent.isPending ? 'Sending…' : autoRetrying ? 'Re-sending after consent…' : 'Send'}
          </Action>
          {lastOutcome && (
            <Action variant="ghost" onClick={() => setLastOutcome(null)}>
              Clear outcome
            </Action>
          )}
        </div>
        <Evidence title="What happens to my intent?">
          Bharat OS routes it through L4 policy → L6 skill preflight → L3 tool
          execution. Every step is signed and added to your audit ledger. No
          third party sees the intent unless you grant explicit consent.
        </Evidence>
      </Card>

      {lastOutcome && (
        <OutcomeCard
          orchestration={lastOutcome}
          onGrantConsent={() => setGrantOpen(true)}
        />
      )}

      {lastOutcome?.consentRequirement?.scopes && lastOutcome.consentRequirement.granteeId && (
        <ConsentGrantSheet
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          scopes={lastOutcome.consentRequirement.scopes}
          granteeId={lastOutcome.consentRequirement.granteeId}
          purpose={
            (lastOutcome.actionRequest?.actionType &&
              ACTION_TYPE_PURPOSE[lastOutcome.actionRequest.actionType]) ??
            lastOutcome.intent?.intentText ??
            'Granted from /app/citizen/home'
          }
          granting={grantConsent.isPending}
          onGrant={handleGrant}
        />
      )}

      <Card title="Recent activity" subtitle="Latest intents on this profile">
        {recent.length === 0 ? (
          <p className="text-body text-text-muted">No activity yet. Try a suggestion above.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((o) => (
              <li key={o.orchestrationId} className="py-2 first:pt-0 last:pb-0">
                <p className="font-semibold text-text">{o.intent?.intentText ?? '—'}</p>
                <p className="text-caption text-text-muted">
                  {o.actionRequest?.actionType ?? '—'} ·{' '}
                  {new Date(o.createdAt).toLocaleString('en-IN')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

interface OutcomeCardProps {
  orchestration: Orchestration;
  onGrantConsent?: () => void;
}

function OutcomeCard({ orchestration, onGrantConsent }: OutcomeCardProps) {
  const actionType = orchestration.actionRequest?.actionType;
  const label = (actionType && ACTION_TYPE_LABEL[actionType]) ?? 'Intent';
  const status = orchestration.status ?? 'planned';
  const tone =
    status === 'completed' ? 'trust' : status === 'blocked' ? 'warning' : 'governance';
  const badgeVariant =
    status === 'completed' ? 'trust' : status === 'blocked' ? 'warning' : 'pending';
  const message = orchestration.localizedResponse?.text;
  const consentRequirement = orchestration.consentRequirement;
  const failedPolicies = orchestration.failedPolicies ?? [];
  const plan = orchestration.plan ?? [];
  const consentBlocked =
    status === 'blocked' && Boolean(consentRequirement?.scopes?.length);

  return (
    <Card
      tone={tone}
      title={label}
      actions={<Badge variant={badgeVariant}>{status}</Badge>}
    >
      {message && <p className="text-body">{message}</p>}

      {consentBlocked && consentRequirement?.scopes && (
        <div className="mt-3 rounded-sm border border-orange-100 bg-white p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Bharat OS needs your consent for
          </p>
          <ul className="mt-1 list-disc pl-5 text-body text-text">
            {consentRequirement.scopes.map((scope) => (
              <li key={scope} className="font-mono text-caption">
                {scope}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-muted">
            Granting is a signed, revocable artifact stored under your identity.
            Revoke any time from the Trust tab.
          </p>
          {onGrantConsent && (
            <div className="mt-3">
              <Action size="sm" onClick={onGrantConsent}>
                Review + grant consent
              </Action>
            </div>
          )}
        </div>
      )}

      {failedPolicies.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Policy gate
          </p>
          <ul className="mt-1 list-disc pl-5 text-caption text-text-muted">
            {failedPolicies.map((p) => (
              <li key={p} className="font-mono">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption font-semibold uppercase tracking-wide text-text-muted">
            Plan ({plan.length} steps)
          </summary>
          <ol className="mt-2 space-y-1 text-caption">
            {plan.map((step, i) => (
              <li key={`${step.step}-${i}`} className="flex gap-2">
                <span className="font-mono text-text-muted">
                  {step.layer ? `${step.layer} ·` : ''}
                </span>
                <span className="font-mono text-text">{step.step}</span>
                {step.status && (
                  <span className="font-mono text-text-muted">— {step.status}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      <p className="mt-3 text-caption text-text-muted">
        Audit reference:{' '}
        <span className="font-mono">
          {orchestration.orchestrationId.replace(/^bos:orchestration:/, '')}
        </span>
      </p>
    </Card>
  );
}

function CitizenTrust() {
  const identity = useActiveIdentity();
  const { data: consents = [], isPending } = useConsents(identity?.id);
  const revoke = useRevokeConsent();
  const show = useToast((s) => s.show);

  function handleRevoke(consent: ConsentArtifact) {
    if (!identity) return;
    revoke.mutate(
      { identityId: identity.id, consentId: consent.consentId },
      {
        onSuccess: () => show('Consent revoked.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  const active = consents.filter((c) => (c.lifecycle?.active ?? c.status === 'active'));
  const inactive = consents.filter((c) => !(c.lifecycle?.active ?? c.status === 'active'));

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <h1 className="text-display font-semibold">Your data, your control</h1>
      <p className="text-body text-text-muted">
        Every consent grant is signed by you and lives in the audit ledger. Revoke
        any active grant here.
      </p>

      <Card title={`Active consents (${active.length})`} tone="trust">
        {isPending ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-body text-text-muted">
            No active consents. Granting one happens when you confirm an intent
            from Home.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((c) => (
              <li key={c.consentId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-semibold">{c.purpose}</p>
                    <p className="mt-1 text-caption text-text-muted">
                      Granted to <span className="font-mono">{c.granteeId}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-sm bg-trust-50 px-2 py-0.5 font-mono text-caption text-trust-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-caption text-text-muted">
                      Expires {new Date(c.expiresAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <Action
                    variant="destructive"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => handleRevoke(c)}
                  >
                    Revoke
                  </Action>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {inactive.length > 0 && (
        <Card title={`History (${inactive.length})`}>
          <ul className="divide-y divide-border">
            {inactive.map((c) => (
              <li key={c.consentId} className="py-2 first:pt-0 last:pb-0">
                <p className="text-body">{c.purpose}</p>
                <p className="text-caption text-text-muted">
                  {c.status === 'revoked'
                    ? `Revoked${c.revokedAt ? ` ${new Date(c.revokedAt).toLocaleString('en-IN')}` : ''}${
                        c.revokeReason ? ` — ${c.revokeReason}` : ''
                      }`
                    : `Expired ${new Date(c.expiresAt).toLocaleString('en-IN')}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

export function CitizenHome() {
  return (
    <>
      <Routes>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<CitizenIntent />} />
        <Route path="trust" element={<CitizenTrust />} />
        <Route path="*" element={<CitizenIntent />} />
      </Routes>
      <Tabs items={TABS} />
    </>
  );
}
