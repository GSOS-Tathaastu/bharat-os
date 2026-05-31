import { Card, Evidence, Money, Stat } from '@/components/ui';
import { useSponsorEscrowLedger, useSponsorSelf } from '@/lib/hooks';
import { EscrowLedgerRow } from '@/components/sponsor/EscrowLedgerRow';

export function SponsorEscrow() {
  const { data: sponsor } = useSponsorSelf();
  const { data: events = [], isPending } = useSponsorEscrowLedger();

  const balance = sponsor?.escrowBalancePaise ?? 0;
  const locked = sponsor?.escrowLockedPaise ?? 0;
  const available = balance - locked;

  // Sort newest first.
  const sorted = [...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Escrow
        </p>
        <h1 className="text-display font-semibold">Wallet</h1>
        <p className="mt-1 text-body text-text-muted">
          Admins deposit; jobs + rounds lock; submissions debit; sponsor
          rejections refund.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card tone="trust">
          <Stat label="Available" value={<Money paise={available} size="lg" />} />
        </Card>
        <Card tone="governance">
          <Stat label="Locked" value={<Money paise={locked} size="lg" />} />
        </Card>
        <Card>
          <Stat label="Balance" value={<Money paise={balance} size="lg" />} />
        </Card>
      </div>

      <Card title="Recent ledger events" subtitle={`${sorted.length} events`}>
        {isPending ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-body text-text-muted">
            No escrow activity yet. Admin deposits, round locks, and labeling
            debits will appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((event, i) => (
              <EscrowLedgerRow key={`${event.type}-${event.at}-${i}`} event={event} />
            ))}
          </ul>
        )}
      </Card>

      <Evidence title="How is the ledger filtered?">
        The Bharat OS ledger is a public stream (
        <a className="underline" href="/api/ledger" target="_blank" rel="noreferrer">
          /api/ledger
        </a>
        ). The sponsor console fetches the last 500 events client-side and
        keeps only events tagged with your sponsorId AND of type{' '}
        <span className="font-mono">sponsor_escrow.*</span> or{' '}
        <span className="font-mono">labeling_export.signed</span>. Per §15 you
        cannot see other sponsors' lines (the filter is enforced client-side
        but the substrate already strips the only sensitive field —
        bearerTokenHash — from every public record).
      </Evidence>
    </main>
  );
}
