import { useMemo } from 'react';
import { Card } from '@/components/ui';
import { BookingCard } from '@/components/booking';
import { useProviderInbox, type ProviderIdentity } from '@/lib/hooks';

interface ProviderHistoryProps {
  provider: ProviderIdentity;
  rootIdentityId: string;
}

const TERMINAL = new Set([
  'citizen_confirmed',
  'auto_released',
  'cancelled_after_dispute',
  'rejected_by_provider',
  'cancelled_by_citizen',
  'expired_unaccepted'
]);

export function ProviderHistory({ provider, rootIdentityId }: ProviderHistoryProps) {
  const list = useProviderInbox(provider.providerIdentityId, rootIdentityId);
  const terminal = useMemo(
    () => (list.data ?? []).filter((b) => TERMINAL.has(b.status)),
    [list.data]
  );

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <header>
        <h1 className="text-display font-semibold">History</h1>
        <p className="mt-1 text-body text-text-muted">
          Closed bookings — confirmed, cancelled, or refunded.
        </p>
      </header>

      {!list.isPending && terminal.length === 0 && (
        <Card tone="governance">
          <p className="text-body">
            No closed bookings yet. Bookings that are confirmed, cancelled,
            expired, or refunded show up here. As you complete bookings
            your history will grow.
          </p>
        </Card>
      )}

      {terminal.map((b) => (
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
