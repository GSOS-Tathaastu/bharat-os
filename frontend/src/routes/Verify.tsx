import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Action, Badge, Card, Evidence, Field, Money, Stat, useToast } from '@/components/ui';
// Money is used inside the BundleView nested component below — keep the import.
import { useMfiBundle, type MfiBundle } from '@/lib/hooks';

const STATUS_VARIANT: Record<MfiBundle['status'], 'trust' | 'error' | 'warning' | 'neutral'> = {
  valid: 'trust',
  expired: 'neutral',
  revoked: 'error',
  exhausted: 'warning',
  signature_invalid: 'error',
  unknown_worker: 'error',
  malformed: 'error'
};

const STATUS_LABEL: Record<MfiBundle['status'], string> = {
  valid: 'VERIFIED ✓',
  expired: 'EXPIRED',
  revoked: 'REVOKED',
  exhausted: 'EXHAUSTED',
  signature_invalid: 'SIGNATURE INVALID',
  unknown_worker: 'UNKNOWN WORKER',
  malformed: 'MALFORMED'
};

const STATUS_LEAD: Record<MfiBundle['status'], string> = {
  valid: "Signature verified against the worker's published public key.",
  expired: 'Signature is valid but the share window has ended.',
  revoked: 'The worker revoked this consent before you read it.',
  exhausted: 'All allowed reads have been used.',
  signature_invalid: 'Signature did not verify. The bundle may have been tampered with.',
  unknown_worker: 'The worker identity is not registered with this Bharat OS instance.',
  malformed: 'Bundle envelope is not well-formed.'
};

export function VerifyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryConsentId = searchParams.get('consent');
  const [inputId, setInputId] = useState(queryConsentId ?? '');
  const consentId = queryConsentId;
  const { data, isLoading, error, refetch } = useMfiBundle(consentId);
  const show = useToast((s) => s.show);

  function handleLoad() {
    if (!inputId.trim()) {
      show('Paste the consent ID or share URL.', 'error');
      return;
    }
    // Accept either a bare consent ID or a full share URL containing ?consent=…
    let id = inputId.trim();
    const match = id.match(/[?&]consent=([^&]+)/);
    if (match) id = decodeURIComponent(match[1]);
    setSearchParams({ consent: id });
  }

  function handleNew() {
    setInputId('');
    setSearchParams({});
  }

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-white font-semibold">
            ⚒
          </span>
          <span className="text-heading font-semibold">Bharat OS Verifier</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          §13A — Trust as a service
        </p>
        <h1 className="text-display font-semibold">Read a signed income bundle</h1>
        <p className="mt-2 text-body text-text-muted">
          The worker issued you a one-time signed bundle. Paste the share URL
          or consent ID. Reading it burns one of the worker's allowed reads.
        </p>
      </div>

      {!consentId && (
        <Card title="Open a bundle">
          <Field
            label="Share URL or consent ID"
            placeholder="Paste from the worker"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            className="font-mono"
          />
          <div className="mt-3 flex gap-2">
            <Action onClick={handleLoad}>Read bundle</Action>
          </div>
        </Card>
      )}

      {consentId && (
        <>
          {isLoading && (
            <Card>
              <p className="text-body text-text-muted">Loading signed bundle…</p>
            </Card>
          )}
          {error && (
            <Card>
              <Badge variant="error">ERROR</Badge>
              <p className="mt-2 text-body text-error">{error.message}</p>
              <Action variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Action>
            </Card>
          )}
          {data && (
            <>
              <Card>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[data.status]}>{STATUS_LABEL[data.status]}</Badge>
                  <p className="text-body text-text">{STATUS_LEAD[data.status]}</p>
                </div>
                {data.reason && (
                  <p className="mt-2 text-caption text-text-muted">{data.reason}</p>
                )}
              </Card>

              {data.bundle && (
                <BundleView bundle={data.bundle} status={data.status} />
              )}

              <Action variant="ghost" onClick={handleNew}>
                ← Read a different bundle
              </Action>
            </>
          )}
        </>
      )}
      </main>
    </div>
  );
}

function BundleView({ bundle, status }: { bundle: NonNullable<MfiBundle['bundle']>; status: MfiBundle['status'] }) {
  return (
    <>
      <Card title="Worker" tone="trust">
        <p className="text-heading font-semibold">{bundle.workerDisplayName}</p>
        <p className="text-caption text-text-muted">For: {bundle.mfiName} · FY {bundle.financialYear}</p>
        <p className="text-caption text-text-muted">
          Bundle issued {new Date(bundle.issuedAt).toLocaleString('en-IN')}
        </p>
      </Card>

      <Card title="Aggregated income">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Total earnings"
            value={<Money paise={bundle.aggregates.totalEarningsPaise} size="lg" />}
            delta={`Across ${bundle.aggregates.monthsWithIncome} months`}
          />
          {bundle.aggregates.earningsByMonth.length > 0 && (
            <Stat
              label="Best month"
              value={
                <Money
                  paise={Math.max(...bundle.aggregates.earningsByMonth.map((m) => m.paise))}
                  size="lg"
                />
              }
            />
          )}
        </div>

        {bundle.aggregates.earningsByMonth.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Month by month
            </p>
            <ul className="grid gap-1">
              {bundle.aggregates.earningsByMonth.map((m) => (
                <li key={m.month} className="flex items-center justify-between text-body">
                  <span className="font-mono text-text-muted">{m.month}</span>
                  <Money paise={m.paise} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {bundle.attestations.length > 0 && (
        <Card title="Verified attestations" subtitle={`${bundle.attestations.length} signed claims`}>
          <ul className="flex flex-col gap-2">
            {bundle.attestations.map((a, idx) => (
              <li key={idx} className="rounded-sm border border-border bg-white p-2">
                <p className="text-body">
                  <span className="font-semibold">{a.subject}</span>: {a.claim}
                </p>
                <p className="text-caption text-text-muted">
                  Issued {new Date(a.issuedAt).toLocaleDateString('en-IN')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {bundle.collectiveMemberships.length > 0 && (
        <Card title="Worker-collective memberships">
          <ul className="flex flex-col gap-1">
            {bundle.collectiveMemberships.map((m, idx) => (
              <li key={idx} className="flex items-center justify-between text-body">
                <span>
                  {m.collectiveName} · <span className="text-text-muted">{m.role}</span>
                </span>
                <Badge variant={m.verified ? 'trust' : 'neutral'}>
                  {m.verified ? 'verified' : 'unverified'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(bundle.eshramRegistrations.length > 0 || bundle.schemeEntitlements.length > 0) && (
        <Card title="Welfare attestations" tone="governance">
          {bundle.eshramRegistrations.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                e-Shram
              </p>
              <ul>
                {bundle.eshramRegistrations.map((e, idx) => (
                  <li key={idx} className="text-body">
                    UAN {e.uanMasked}{' '}
                    {e.verified ? <Badge variant="trust">verified</Badge> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bundle.schemeEntitlements.length > 0 && (
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Welfare schemes
              </p>
              <ul>
                {bundle.schemeEntitlements.map((s, idx) => (
                  <li key={idx} className="text-body">
                    {s.schemeCode}{' '}
                    {s.verified ? <Badge variant="trust">verified</Badge> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card tone="default">
        <p className="text-caption font-semibold text-text-muted">Disclaimer</p>
        <p className="mt-1 text-caption text-text-muted">{bundle.disclaimer}</p>
        <Evidence title="Signature + integrity proof">
          <p className="break-all">signature: {bundle.signature}</p>
          <p className="mt-1">status: {status}</p>
        </Evidence>
      </Card>
    </>
  );
}
