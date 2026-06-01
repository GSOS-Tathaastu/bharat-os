import { useState } from 'react';
import { Badge, Card } from '@/components/ui';
import { useSlmBookingAdvisor } from '@/lib/use-slm-booking-advisor';
import { verdictLabel, type ParsedAdvisorResponse } from '@/lib/booking-advisor';
import type { PublicBooking, ProviderIdentity } from '@/lib/hooks';

// Phase 12.1b.4 — SLM-D booking advisor surface for the provider.
//
// On a pre_authorized booking, the provider can tap "Ask my SLM"
// to get an on-device verdict (accept / reject / unsure) + a
// suggested reject-reason chip they can tap to fill the reject
// reason input. The chip never changes booking state; only the
// existing accept/reject actions do.

interface SlmBookingAdvisorChipProps {
  identityId: string | null | undefined;
  booking: PublicBooking;
  provider: ProviderIdentity;
  onAcceptSuggestedRejectReason?: (reason: string) => void;
}

export function SlmBookingAdvisorChip({
  identityId,
  booking,
  provider,
  onAcceptSuggestedRejectReason
}: SlmBookingAdvisorChipProps) {
  const advisor = useSlmBookingAdvisor({ identityId });
  const [result, setResult] = useState<ParsedAdvisorResponse | null>(null);

  // Hide chip entirely when the booking is past the decision
  // moment or when no SLM is installed.
  if (!advisor.hasSlm) return null;
  if (booking.status !== 'pre_authorized') return null;

  async function handleAsk() {
    setResult(null);
    // Recover the provider's role-form answers if available so the
    // SLM weighs language match etc. — they live on the
    // provider record (owner-readable; never public).
    const roleAnswers = ((provider as ProviderIdentity & { roleAnswers?: { values: Record<string, unknown> } | null }).roleAnswers?.values) ?? null;
    const out = await advisor.ask({
      bookingId: booking.bookingId,
      context: {
        roleKind: booking.roleKind,
        quotedAmountPaise: booking.rateSnapshot.quotedAmountPaise,
        pricingBasis: booking.rateSnapshot.pricingBasis,
        distanceMetersAtBooking: booking.distanceMetersAtBooking,
        pickupBubble1dp: booking.pickupPoint?.bubble1dp ?? null,
        citizenNote: booking.citizenNote ?? null,
        providerRoleAnswers: roleAnswers
      }
    });
    if (out?.parsed) setResult(out.parsed);
  }

  const busy = advisor.status.kind === 'loading' || advisor.status.kind === 'thinking';

  return (
    <Card>
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        On-device advisor (optional)
      </p>
      <p className="mt-1 text-body text-text-muted">
        Get a quick recommendation from your installed SLM. You always
        decide.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleAsk}
          disabled={busy || advisor.status.kind === 'cooling-down'}
          className="rounded-sm border border-primary bg-primary-50 px-3 py-1 text-caption font-semibold text-primary transition-colors hover:bg-primary-100 disabled:opacity-50"
        >
          {advisor.status.kind === 'loading'
            ? 'Loading model…'
            : advisor.status.kind === 'thinking'
              ? 'Thinking…'
              : advisor.status.kind === 'cooling-down'
                ? `Cooling down (${Math.ceil(advisor.status.retryInMs / 1000)}s)`
                : '✨ Ask my SLM: should I accept?'}
        </button>
        {advisor.status.kind === 'unavailable' && advisor.status.reason !== 'no_install' && (
          <span className="text-caption text-text-muted">
            On-device model unavailable: {advisor.status.reason}
          </span>
        )}
      </div>
      {result && (
        <div className="mt-3 space-y-2">
          <Badge
            variant={result.verdict === 'accept' ? 'trust' : result.verdict === 'reject' ? 'warning' : 'neutral'}
          >
            {verdictLabel(result.verdict)} · confidence {Math.round(result.confidence * 100)}%
          </Badge>
          {result.rationale && (
            <p className="text-body text-text">&ldquo;{result.rationale}&rdquo;</p>
          )}
          {result.verdict === 'reject' && result.suggestedRejectReason && onAcceptSuggestedRejectReason && (
            <div>
              <button
                type="button"
                onClick={() => onAcceptSuggestedRejectReason(result.suggestedRejectReason!)}
                className="rounded-sm border border-warning bg-warning-50 px-3 py-1 text-caption text-warning hover:bg-warning-100"
              >
                Use this reason: &ldquo;{result.suggestedRejectReason}&rdquo;
              </button>
            </div>
          )}
          <p className="text-caption text-text-muted">
            This is a suggestion. You still tap Accept or Reject yourself.
          </p>
        </div>
      )}
    </Card>
  );
}
