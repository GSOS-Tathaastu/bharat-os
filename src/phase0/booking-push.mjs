// Phase 12.1a.2 — Booking push payload builder.
//
// Centralised so the §15 PII-leak binding has ONE surface to audit.
// Every push fired on a booking lifecycle event goes through one of
// the builders below. A binding-test in tests/node/booking-push.test.mjs
// asserts via source grep that this file contains no string-
// concatenation of citizen/provider displayName, no phone-shape
// regex, no 4dp coordinate fragments.
//
// Per the design synthesis:
//   • Push title carries roleKind ("New cab-driver booking").
//   • Push body is generic ("Tap to view in Bharat OS") for events
//     that involve the OTHER party's data — we don't want
//     household-help worker names showing on a citizen's lock
//     screen, nor pickup addresses showing on a provider's.
//   • EXCEPTION: provider's own payout confirmation (citizen_confirmed
//     / auto_released) may carry the ₹ amount in body because it's
//     the provider's own earnings.

const ROLE_LABEL = {
  'cab-driver': 'cab-driver',
  'personal-driver': 'driver',
  'household-help': 'household-help',
  labourers: 'labour',
  kirana: 'kirana',
  'skilled-trades': 'service'
};

function roleLabel(roleKind) {
  return ROLE_LABEL[roleKind] || 'service';
}

function rupeesFromPaise(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n) || n <= 0) return '';
  const r = Math.round(n / 100);
  // Indian numbering grouping ("12,34,500" style).
  return r.toLocaleString('en-IN');
}

// Provider sees a new pre_authorized booking. Body is generic —
// NO citizen name, NO address, NO phone, NO booking id, NO 4dp coords.
export function buildProviderNewBookingPush({ booking }) {
  return {
    title: `New ${roleLabel(booking.roleKind)} booking`,
    body: 'Tap to view in Bharat OS.',
    data: {
      kind: 'booking',
      action: 'open_inbox',
      bookingId: booking.bookingId
    }
  };
}

// Citizen sees their booking accepted. Body is generic.
export function buildCitizenBookingAcceptedPush({ booking }) {
  return {
    title: 'Your booking was accepted',
    body: 'The provider has confirmed. Tap to view in Bharat OS.',
    data: {
      kind: 'booking',
      action: 'open_detail',
      bookingId: booking.bookingId
    }
  };
}

// Citizen sees provider marked complete. Body says "Confirm or
// dispute" generically.
export function buildCitizenMarkedCompletePush({ booking }) {
  return {
    title: 'Provider marked complete',
    body: 'Confirm the work or dispute in Bharat OS. Auto-releases in 24h.',
    data: {
      kind: 'booking',
      action: 'open_detail',
      bookingId: booking.bookingId
    }
  };
}

// Provider sees a citizen confirmation OR auto-release. This is
// their own payout event — the amount is the provider's own
// earnings and is OK to show in body.
export function buildProviderPayoutPush({ booking, outcome }) {
  const amount = rupeesFromPaise(booking.rateSnapshot?.quotedAmountPaise);
  const title = outcome === 'auto_released' ? 'Auto-released payout' : 'Booking confirmed';
  const body = amount ? `Earned ₹${amount} from this booking.` : 'Payout settled.';
  return {
    title,
    body,
    data: {
      kind: 'booking',
      action: 'open_history',
      bookingId: booking.bookingId
    }
  };
}

// Citizen sees a refund (provider rejected, booking expired, or
// dispute refunded). Body is generic.
export function buildCitizenRefundPush({ booking, reason }) {
  let title = 'Booking refunded';
  if (reason === 'rejected_by_provider') title = 'Provider could not accept';
  else if (reason === 'expired_unaccepted') title = 'Booking timed out';
  return {
    title,
    body: 'Your escrow was refunded. Tap to view in Bharat OS.',
    data: {
      kind: 'booking',
      action: 'open_detail',
      bookingId: booking.bookingId
    }
  };
}

// Provider sees a dispute was filed by citizen.
export function buildProviderDisputeFiledPush({ booking }) {
  return {
    title: 'Dispute filed on a booking',
    body: 'An operator will review. Tap to view in Bharat OS.',
    data: {
      kind: 'booking',
      action: 'open_active',
      bookingId: booking.bookingId
    }
  };
}

// Citizen sees a dispute was filed by provider.
export function buildCitizenDisputeFiledPush({ booking }) {
  return {
    title: 'Dispute filed on a booking',
    body: 'An operator will review. Tap to view in Bharat OS.',
    data: {
      kind: 'booking',
      action: 'open_detail',
      bookingId: booking.bookingId
    }
  };
}
