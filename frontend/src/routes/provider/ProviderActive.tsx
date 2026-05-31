import { useMemo } from 'react';
import { Card } from '@/components/ui';
import { BookingCard } from '@/components/booking';
import { useProviderInbox, type ProviderIdentity } from '@/lib/hooks';

interface ProviderActiveProps {
  provider: ProviderIdentity;
  rootIdentityId: string;
}

const ACTIVE_STATUSES = new Set(['in_progress', 'provider_marked_complete', 'disputed']);

export function ProviderActive({ provider, rootIdentityId }: ProviderActiveProps) {
  const list = useProviderInbox(provider.providerIdentityId, rootIdentityId);
  const active = useMemo(
    () => (list.data ?? []).filter((b) => ACTIVE_STATUSES.has(b.status)),
    [list.data]
  );

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <header>
        <h1 className="text-display font-semibold">Active</h1>
        <p className="mt-1 text-body text-text-muted">
          Bookings in progress, awaiting your completion or citizen confirm.
        </p>
      </header>

      {list.isPending && <p className="text-body text-text-muted">Loading…</p>}

      {!list.isPending && active.length === 0 && (
        <Card tone="trust">
          <p className="text-body">No active bookings.</p>
        </Card>
      )}

      {active.map((b) => (
        <BookingCard
          key={b.bookingId}
          booking={b}
          role="provider"
          to={`/provider/bookings/${encodeURIComponent(b.bookingId)}`}
        />
      ))}
    </main>
  );
}
