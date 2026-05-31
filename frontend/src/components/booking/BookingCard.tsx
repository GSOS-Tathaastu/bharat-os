import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/ui';
import { formatRupees } from '@/lib/format-paise';
import { formatDistanceMeters } from '@/lib/format-distance';
import type { PublicBooking } from '@/lib/hooks';
import { BookingStatusPill } from './BookingStatusPill';
import { AutoReleaseCountdown } from './AutoReleaseCountdown';

// Phase 12.1a.2 — Shared BookingCard. Role-prop driven so the same
// component renders in citizen + provider surfaces.

interface BookingCardProps {
  booking: PublicBooking;
  role: 'citizen' | 'provider';
  to: string;
  // Optional helper renderer for the right-side metric (eg distance).
  metric?: string;
}

const ROLE_LABEL: Record<string, string> = {
  'cab-driver': 'Cab / auto',
  'personal-driver': 'Personal driver',
  'household-help': 'Cook / maid',
  labourers: 'Labour',
  kirana: 'Kirana',
  'skilled-trades': 'Service'
};

export function BookingCard({ booking, role, to, metric }: BookingCardProps) {
  const headline = ROLE_LABEL[booking.roleKind] ?? booking.roleKind;
  const amount = formatRupees(booking.rateSnapshot.quotedAmountPaise);
  const distance =
    metric ??
    (booking.distanceMetersAtBooking != null
      ? formatDistanceMeters(booking.distanceMetersAtBooking) + ' away'
      : null);
  const bubble = booking.pickupPoint?.bubble1dp || null;
  const note = booking.citizenNote && booking.citizenNote.length > 0
    ? booking.citizenNote.length > 80
      ? booking.citizenNote.slice(0, 80) + '…'
      : booking.citizenNote
    : null;
  return (
    <Link to={to} className="block">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-body font-semibold text-text">{headline}</p>
              <Badge variant="trust">{amount}</Badge>
            </div>
            {distance && (
              <p className="mt-1 text-caption text-text-muted">{distance}</p>
            )}
            {role === 'provider' && bubble && !distance && (
              <p className="mt-1 text-caption text-text-muted">~{bubble} area</p>
            )}
            {note && (
              <p className="mt-1 text-caption text-text-muted line-clamp-2">&ldquo;{note}&rdquo;</p>
            )}
            {booking.status === 'provider_marked_complete' && role === 'citizen' && (
              <div className="mt-2">
                <AutoReleaseCountdown providerCompletedAt={booking.providerCompletedAt} />
              </div>
            )}
          </div>
          <div className="shrink-0">
            <BookingStatusPill status={booking.status} />
          </div>
        </div>
      </Card>
    </Link>
  );
}
