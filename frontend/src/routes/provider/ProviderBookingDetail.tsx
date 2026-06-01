import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Action, Badge, Card, Field, useToast } from '@/components/ui';
import { BookingStatusPill, DisputeFileSheet, SlmBookingAdvisorChip } from '@/components/booking';
import { PickupAreaHint } from '@/components/geo';
import { formatRupees, formatRateBasis } from '@/lib/format-paise';
import { formatDistanceMeters } from '@/lib/format-distance';
import { useBooking, useBookingTransition, type ProviderIdentity } from '@/lib/hooks';

interface Props {
  provider: ProviderIdentity;
  rootIdentityId: string;
}

export function ProviderBookingDetail({ provider, rootIdentityId }: Props) {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const show = useToast((s) => s.show);
  const bookingQuery = useBooking(bookingId, rootIdentityId);
  const transition = useBookingTransition();
  const [rejectReason, setRejectReason] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);

  if (bookingQuery.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading…</p>
      </main>
    );
  }
  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card tone="warning">
          <p className="text-body">
            Could not load booking.{' '}
            <Link to="/provider/inbox" className="underline">
              Back to inbox
            </Link>
          </p>
        </Card>
      </main>
    );
  }
  const b = bookingQuery.data;

  async function fire(action: 'accept' | 'reject' | 'mark-complete' | 'dispute', reason?: string) {
    try {
      const result = await transition.mutateAsync({
        bookingId: b.bookingId,
        action,
        actingRootIdentityId: rootIdentityId,
        expectedSeq: b.seq,
        reason
      });
      show(`Booking ${result.booking.status.replace(/_/g, ' ')}.`, 'success');
      if (action === 'reject' || result.booking.status === 'citizen_confirmed') {
        navigate('/provider/history');
      }
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <Link to="/provider/inbox" className="text-caption text-text-muted underline">
        ← Inbox
      </Link>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Booking
            </p>
            <h1 className="text-heading font-semibold">{formatRupees(b.rateSnapshot.quotedAmountPaise)}</h1>
            <p className="mt-1 text-body text-text-muted">
              {formatRateBasis(
                b.rateSnapshot.pricingBasis === 'per-hour'
                  ? b.rateSnapshot.ratePaisePerHour
                  : b.rateSnapshot.ratePaisePerService,
                b.rateSnapshot.pricingBasis
              )}
            </p>
          </div>
          <BookingStatusPill status={b.status} />
        </div>
      </Card>

      {b.distanceMetersAtBooking != null && (
        <Card>
          <p className="text-body">
            <span className="font-semibold">Distance from your area:</span>{' '}
            {formatDistanceMeters(b.distanceMetersAtBooking)}
          </p>
        </Card>
      )}

      {b.pickupPoint && (
        <Card title="Pickup">
          {b.pickupPoint.lat != null && b.pickupPoint.lng != null ? (
            <>
              <p className="text-body text-text">
                {b.pickupPoint.address || 'Pinned location'}
              </p>
              <PickupAreaHint lat={b.pickupPoint.lat} lng={b.pickupPoint.lng} />
              <p className="mt-1 text-caption text-text-muted">
                {b.pickupPoint.lat.toFixed(4)}, {b.pickupPoint.lng.toFixed(4)}
              </p>
            </>
          ) : (
            <>
              <p className="text-body text-text-muted">
                ~{b.pickupPoint.bubble1dp} area
              </p>
              <PickupAreaHint bubble1dp={b.pickupPoint.bubble1dp} />
              {/* UX-8 (adversarial review) — frame the mask as a
                  citizen-safety feature, not a paywall. */}
              <p className="mt-1 text-caption text-text-muted">
                For citizen safety, the precise pickup point is only
                revealed once you accept this booking. Right now you
                see the approximate neighbourhood so you can decide.
              </p>
            </>
          )}
        </Card>
      )}

      {b.citizenNote && (
        <Card title="Citizen's note">
          <p className="text-body">&ldquo;{b.citizenNote}&rdquo;</p>
        </Card>
      )}

      {/* Action area */}
      {b.status === 'pre_authorized' && (
        <>
          {/* Phase 12.1b.4 SLM-D — optional on-device advisor */}
          <SlmBookingAdvisorChip
            identityId={rootIdentityId}
            booking={b}
            provider={provider}
            onAcceptSuggestedRejectReason={(r) => setRejectReason(r)}
          />
          <Card title="Accept or reject">
            <div className="flex flex-wrap gap-2">
              <Action onClick={() => fire('accept')} disabled={transition.isPending}>
                Accept
              </Action>
            </div>
            <div className="mt-3 space-y-2">
              <Field
                label="Reject reason (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Eg: Not in my area today"
              />
              <Action variant="ghost" onClick={() => fire('reject', rejectReason.trim() || null as unknown as string)} disabled={transition.isPending}>
                Reject (refunds citizen)
              </Action>
            </div>
          </Card>
        </>
      )}

      {b.status === 'in_progress' && (
        <Card title="Mark complete">
          <p className="text-body text-text-muted">
            When the work is done, mark it complete. The citizen has 24h
            to confirm or dispute; otherwise it auto-releases to you.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Action onClick={() => fire('mark-complete')} disabled={transition.isPending}>
              Mark complete
            </Action>
            <Badge variant="warning">
              <button type="button" onClick={() => setDisputeOpen(true)}>
                File dispute
              </button>
            </Badge>
          </div>
        </Card>
      )}

      {b.status === 'provider_marked_complete' && (
        <Card title="Awaiting citizen confirm">
          <p className="text-body text-text-muted">
            The citizen has up to 24h from when you marked complete to
            confirm or dispute. Otherwise the booking auto-releases to
            your payout.
          </p>
        </Card>
      )}

      <DisputeFileSheet
        open={disputeOpen}
        busy={transition.isPending}
        onClose={() => setDisputeOpen(false)}
        onFile={async (reason) => {
          setDisputeOpen(false);
          await fire('dispute', reason);
        }}
      />
    </main>
  );
}
