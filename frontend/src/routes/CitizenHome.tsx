import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Action, Card, Evidence, Tabs, useToast } from '@/components/ui';
import { useActiveIdentity, useRecentOrchestrations, useSendIntent } from '@/lib/hooks';

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
  const sendIntent = useSendIntent();
  const { data: recent = [] } = useRecentOrchestrations(identity?.id);
  const show = useToast((s) => s.show);

  function handleSend() {
    if (!identity || !text.trim()) {
      show('Type or pick what you want to do.', 'error');
      return;
    }
    sendIntent.mutate(
      { identityId: identity.id, intentText: text },
      {
        onSuccess: () => {
          setText('');
          show('Intent sent for policy review.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

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
          <Action onClick={handleSend} disabled={sendIntent.isPending}>
            {sendIntent.isPending ? 'Sending…' : 'Send'}
          </Action>
        </div>
        <Evidence title="What happens to my intent?">
          Bharat OS routes it through L4 policy → L6 skill preflight → L3 tool
          execution. Every step is signed and added to your audit ledger. No
          third party sees the intent unless you grant explicit consent.
        </Evidence>
      </Card>

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

function CitizenTrust() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <h1 className="text-display font-semibold">Your data, your control</h1>
      <Card title="Permissions you've granted">
        <p className="text-body text-text-muted">
          Every consent grant has an audit-ledger trail. Coming up next:
          per-grant revoke + receipt download.
        </p>
      </Card>
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
