import { Card } from '@/components/ui';
import { BookingCard } from '@/components/booking';
import { useProviderInbox, type ProviderIdentity } from '@/lib/hooks';

interface ProviderInboxProps {
  provider: ProviderIdentity;
  rootIdentityId: string;
}

export function ProviderInbox({ provider, rootIdentityId }: ProviderInboxProps) {
  const inbox = useProviderInbox(provider.providerIdentityId, rootIdentityId, 'pre_authorized');
  const pending = inbox.data ?? [];

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <header>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Provider · {provider.displayName}
        </p>
        <h1 className="text-display font-semibold">Inbox</h1>
        <p className="mt-1 text-body text-text-muted">
          New booking requests awaiting your accept.
        </p>
      </header>

      {inbox.isPending && (
        <p className="text-body text-text-muted">Loading…</p>
      )}

      {!inbox.isPending && pending.length === 0 && (
        <Card tone="trust">
          <p className="text-body font-semibold">Your inbox is empty.</p>
          <p className="mt-1 text-body text-text-muted">
            Welcome to Bharat OS — citizens in your service area can see
            your profile when they browse. We&rsquo;ll send you a push notification
            (and surface the request here) the moment someone books you.
          </p>
        </Card>
      )}

      {pending.map((b) => (
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
