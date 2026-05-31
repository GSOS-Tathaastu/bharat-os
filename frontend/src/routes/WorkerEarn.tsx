import { useState } from 'react';
import { Action, Badge, Card, Evidence, Field, Money, Stat, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useEshramRegistrations,
  useMeshBalance,
  useMeshSummary,
  useMeshWithdrawals,
  useRequestWithdrawal,
  useSchemeEntitlements,
  useTaxSummary
} from '@/lib/hooks';

// Helpers used by both the Schemes + Tax sections below.
function currentFY(): string {
  const now = new Date();
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function WorkerEarn() {
  const identity = useActiveIdentity();
  const { data: balance } = useMeshBalance(identity?.id);
  const { data: summary } = useMeshSummary(identity?.id);
  const { data: withdrawals = [] } = useMeshWithdrawals(identity?.id);
  const requestWithdrawal = useRequestWithdrawal();
  // Phase 12.0.3 worker-sweep — government benefits + tax summary on
  // /worker/earn. Each substrate is fully Phase 1 / Phase 5+ already;
  // this wires it into the user-facing surface.
  const { data: eshramRegs = [] } = useEshramRegistrations(identity?.id);
  const { data: schemes = [] } = useSchemeEntitlements(identity?.id);
  const fy = currentFY();
  const { data: taxSummary } = useTaxSummary(identity?.id, fy);
  const show = useToast((s) => s.show);
  const [upiId, setUpiId] = useState('');

  const canWithdraw =
    !!balance &&
    balance.availablePaise > 0 &&
    balance.availablePaise >= (balance.minWithdrawalPaise ?? 0);

  function handleWithdraw() {
    if (!identity || !canWithdraw) return;
    if (!upiId.trim()) {
      show('Enter your UPI ID first.', 'error');
      return;
    }
    const ok = window.confirm(
      `Withdraw ${(balance!.availablePaise / 100).toFixed(2)} INR to ${upiId}? Events lock until paid.`
    );
    if (!ok) return;
    requestWithdrawal.mutate(
      { identityId: identity.id, upiId },
      {
        onSuccess: () => {
          setUpiId('');
          show('Withdrawal requested.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <h1 className="text-display font-semibold">Your earnings</h1>

      <Card tone="trust" title="Earned this month">
        <Money paise={summary?.totalPaise ?? 0} size="xl" />
        <p className="mt-2 text-caption text-text-muted">
          {summary?.workingDays ?? 0} working days · {summary?.eventCount ?? 0} mesh events
        </p>
        {summary?.byWorkload && Object.keys(summary.byWorkload).length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(summary.byWorkload).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between rounded-sm border border-trust-100 bg-white px-3 py-2">
                <span className="text-caption font-semibold capitalize text-trust-700">{key.replace(/_/g, ' ')}</span>
                <Money paise={val.paise} size="sm" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Phase 12.0.3 — government schemes + e-Shram registration. */}
      {(eshramRegs.length > 0 || schemes.length > 0) && (
        <Card
          title="Government schemes you are eligible for"
          subtitle="e-Shram + scheme entitlements issued by registered issuers."
          tone="trust"
        >
          {eshramRegs.length > 0 && (
            <div className="rounded-sm border border-trust-100 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-text">e-Shram registered</p>
                  <p className="text-caption text-text-muted">
                    UAN <span className="font-mono">{eshramRegs[0].uanMasked}</span>{' '}
                    · {eshramRegs[0].occupationCategory.replace(/_/g, ' ')}
                    {eshramRegs[0].state ? ` · ${eshramRegs[0].state}` : ''}
                  </p>
                  <p className="text-caption text-text-muted">
                    Registered {shortDate(eshramRegs[0].registeredAt)} ·
                    Expires {shortDate(eshramRegs[0].expiresAt)}
                  </p>
                </div>
                <Badge variant="trust">active</Badge>
              </div>
            </div>
          )}
          {schemes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {schemes.map((s) => (
                <li
                  key={s.entitlementId}
                  className="rounded-sm border border-trust-100 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">{s.schemeName}</p>
                      <p className="text-caption text-text-muted">
                        <span className="font-mono">{s.schemeCode}</span>
                        {s.issuerName ? ` · issued by ${s.issuerName}` : ''}
                      </p>
                      {s.eligibilityNote && (
                        <p className="mt-1 text-caption text-text-muted">{s.eligibilityNote}</p>
                      )}
                      {s.cycleStart && s.cycleEnd && (
                        <p className="text-caption text-text-muted">
                          Window: {shortDate(s.cycleStart)} → {shortDate(s.cycleEnd)}
                        </p>
                      )}
                    </div>
                    {s.monetaryBenefitPaise != null && s.monetaryBenefitPaise > 0 && (
                      <div className="text-right">
                        <Money paise={s.monetaryBenefitPaise} size="sm" />
                        {s.benefitFrequency && (
                          <p className="text-caption text-text-muted">/{s.benefitFrequency}</p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Evidence title="Who issues these?">
            Bharat OS doesn't decide who qualifies — issuers (e-Shram registry,
            cooperative societies, sangha collectives, state welfare boards)
            sign each entitlement with their own key. Verifiers read the
            signature; revocations cascade in your audit ledger.
          </Evidence>
        </Card>
      )}

      {/* Phase 12.0.3 — tax summary card. Only shows when there's
          actually a year of earnings to compute against. */}
      {taxSummary && taxSummary.grossIncomePaise > 0 && (
        <Card
          title={`Tax view (FY ${taxSummary.financialYear})`}
          subtitle="Estimated from your logged Bharat OS earnings only."
          tone="governance"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-sm border border-border bg-white p-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Gross income
              </p>
              <div className="mt-1">
                <Money paise={taxSummary.grossIncomePaise} size="md" />
              </div>
              <p className="mt-1 text-caption text-text-muted">
                {taxSummary.entryCount} earning entries
              </p>
            </div>
            <div className="rounded-sm border border-border bg-white p-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                New regime
              </p>
              <div className="mt-1">
                <Money paise={taxSummary.newRegime.estimatedTaxPaise} size="md" />
              </div>
              <p className="mt-1 text-caption text-text-muted">estimated tax</p>
            </div>
            <div className="rounded-sm border border-border bg-white p-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Old regime
              </p>
              <div className="mt-1">
                <Money paise={taxSummary.oldRegime.estimatedTaxPaise} size="md" />
              </div>
              <p className="mt-1 text-caption text-text-muted">estimated tax</p>
            </div>
          </div>
          <div className="mt-3 rounded-sm border border-trust-100 bg-trust-50 p-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-trust-700">
              Cheapest option for you
            </p>
            <p className="mt-1 text-body">
              <span className="font-semibold">{taxSummary.recommendation.cheapestOption}</span> —{' '}
              <Money paise={taxSummary.recommendation.cheapestTaxPaise} size="sm" />
            </p>
          </div>
          <Evidence title="Important disclaimer">
            <p className="whitespace-pre-line">{taxSummary.disclaimer}</p>
          </Evidence>
        </Card>
      )}

      <Card title="Cash out to UPI" subtitle="Wages always settle in real UPI credits.">
        <div className="rounded-sm bg-primary-50 p-4 mb-4">
          <Stat
            label="Available now"
            value={<Money paise={balance?.availablePaise ?? 0} size="lg" />}
            delta={
              balance && balance.availablePaise < (balance.minWithdrawalPaise ?? 0)
                ? `Minimum withdrawal: ₹${(balance.minWithdrawalPaise / 100).toFixed(2)}`
                : `${balance?.unsettledEventCount ?? 0} unsettled events`
            }
          />
        </div>
        <Field
          label="UPI ID"
          placeholder="yourname@bank"
          autoComplete="off"
          inputMode="email"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          <Action
            variant="default"
            size="md"
            disabled={!canWithdraw || requestWithdrawal.isPending}
            onClick={handleWithdraw}
          >
            {requestWithdrawal.isPending ? 'Requesting…' : 'Request withdrawal'}
          </Action>
        </div>
        <Evidence title="How does cash-out work?">
          Your mesh events are bundled into a signed withdrawal request and sent
          to a UPI payout provider. If FAILED, the events return to your available
          balance — no money is lost. The UPI ID is masked in audit logs.
        </Evidence>
      </Card>

      {withdrawals.length > 0 && (
        <Card title="History" subtitle={`${withdrawals.length} withdrawals`}>
          <ul className="flex flex-col gap-2">
            {withdrawals.map((w) => (
              <li
                key={w.requestId}
                className="flex items-start justify-between gap-2 rounded-sm border border-border bg-white p-3"
              >
                <div className="min-w-0">
                  <Money paise={w.amountPaise} size="sm" />
                  <p className="truncate text-caption text-text-muted">
                    {w.upiIdMasked} · {new Date(w.requestedAt).toLocaleDateString('en-IN')}
                  </p>
                  {w.providerReference && (
                    <p className="truncate font-mono text-caption text-text-muted">
                      ref: {w.providerReference}
                    </p>
                  )}
                  {w.failureReason && (
                    <p className="text-caption text-error">{w.failureReason}</p>
                  )}
                </div>
                <Badge
                  variant={
                    w.status === 'paid' ? 'trust' : w.status === 'failed' ? 'error' : 'pending'
                  }
                >
                  {w.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
