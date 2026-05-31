import { Badge } from '@/components/ui';
import type { BookingStatus } from '@/lib/hooks';

// Phase 12.1a.2 — Single source of truth for the booking status
// visual + label. Used by every BookingCard so a status change in
// one place updates the visual everywhere.

const LABEL: Record<BookingStatus, string> = {
  pre_authorized: 'Awaiting provider',
  in_progress: 'In progress',
  provider_marked_complete: 'Awaiting your confirm',
  citizen_confirmed: 'Confirmed',
  auto_released: 'Auto-released',
  disputed: 'Disputed',
  cancelled_after_dispute: 'Refunded (dispute)',
  rejected_by_provider: 'Provider rejected',
  cancelled_by_citizen: 'You cancelled',
  expired_unaccepted: 'Timed out'
};

const TONE: Record<BookingStatus, 'trust' | 'pending' | 'warning' | 'error' | 'neutral' | 'governance'> = {
  pre_authorized: 'pending',
  in_progress: 'governance',
  provider_marked_complete: 'pending',
  citizen_confirmed: 'trust',
  auto_released: 'trust',
  disputed: 'warning',
  cancelled_after_dispute: 'neutral',
  rejected_by_provider: 'neutral',
  cancelled_by_citizen: 'neutral',
  expired_unaccepted: 'neutral'
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <Badge variant={TONE[status]}>{LABEL[status]}</Badge>;
}

export function bookingStatusLabel(status: BookingStatus): string {
  return LABEL[status];
}
