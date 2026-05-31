import { useState } from 'react';
import { Action, Badge, Card, Evidence, Field, Money, Stat, useToast } from '@/components/ui';
import { useActiveIdentity, useMeshBalance, useMeshSummary, useMeshWithdrawals, useRequestWithdrawal } from '@/lib/hooks';

export function WorkerEarn() {
  const identity = useActiveIdentity();
  const { data: balance } = useMeshBalance(identity?.id);
  const { data: summary } = useMeshSummary(identity?.id);
  const { data: withdrawals = [] } = useMeshWithdrawals(identity?.id);
  const requestWithdrawal = useRequestWithdrawal();
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
