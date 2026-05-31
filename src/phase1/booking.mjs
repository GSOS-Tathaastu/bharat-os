// Phase 12.1a.2 — Citizen-booking substrate.
//
// One record per booking between a citizen and a Bharat-OS-native
// provider. The record is canonical: it carries a rate snapshot
// (immutable after creation), a pickup point at 4dp (party-only
// visibility), a monotonic seq for CAS concurrency control, and
// an inline append-only transitions log for audit.
//
// State machine — 6 live states + 4 terminal-refund branches:
//
//   pre_authorized
//      │
//      ├─ accept ─────────────►  in_progress
//      │                              │
//      │                              ├─ markComplete ─►  provider_marked_complete
//      │                              │                          │
//      │                              │                          ├─ citizenConfirm ─►  citizen_confirmed (T)
//      │                              │                          ├─ auto-release24h ──► auto_released (T)  ← LAZY on read
//      │                              │                          └─ fileDispute ─────► disputed (T-pending-op)
//      │                              │
//      │                              ├─ fileDispute ─►  disputed
//      │                              └─ cancelByCitizen ►  cancelled_by_citizen (T-refund)
//      │
//      ├─ reject ────────────►  rejected_by_provider  (T-refund)
//      ├─ cancelByCitizen ──►  cancelled_by_citizen  (T-refund)
//      └─ 4h-expiry ──────────►  expired_unaccepted     (T-refund)  ← LAZY on read
//
//   disputed
//      └─ admin adjudicate ──►  citizen_confirmed | cancelled_after_dispute  (T)
//
//   Terminal states (T): no further transitions allowed.
//
// §15 bindings the module enforces:
//
//   • Frozen fields: bookingId, citizenRootIdentityId,
//     providerIdentityId, providerRootIdentityId, roleKind,
//     rateSnapshot, pickupPoint, distanceMetersAtBooking, createdAt.
//     Once created, NONE of these are editable. Provider mutating
//     their providerIdentity.rate AFTER creation does NOT affect
//     existing bookings. Tested.
//
//   • CAS concurrency: every transition increments seq; store
//     casUpdateBooking(bookingId, expectedSeq, next, events)
//     atomically check+writes. Two concurrent provider accepts
//     race; one wins, the second sees `stale_seq` (409).
//
//   • No commission anywhere. Payout amount strictly equals
//     rateSnapshot.quotedAmountPaise. Binding test on source
//     greps for {commission, platformFee, takeRate, platformShare}
//     and asserts none exist.
//
//   • Pointer-not-payload: pickup at 4dp on the record (visible
//     ONLY to the two parties after auth), ledger events carry
//     ONLY the 1dp bubble via geo.bubbleAt1dp. Push body
//     redacted via booking-push.mjs.
//
//   • Dispute = operator only. State machine has no auto-resolve
//     from `disputed`; admin-token adjudicate is the only exit.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { bubbleAt1dp, haversineMeters } from '../phase0/geo.mjs';

export const BOOKING_PROTOCOL_VERSION = 'bos.phase12.booking.v0';

export const BOOKING_STATUSES = [
  'pre_authorized',
  'in_progress',
  'provider_marked_complete',
  'citizen_confirmed',
  'auto_released',
  'disputed',
  'cancelled_after_dispute',
  'rejected_by_provider',
  'cancelled_by_citizen',
  'expired_unaccepted'
];

export const BOOKING_TERMINAL_STATUSES = new Set([
  'citizen_confirmed',
  'auto_released',
  'cancelled_after_dispute',
  'rejected_by_provider',
  'cancelled_by_citizen',
  'expired_unaccepted'
]);

export const BOOKING_REFUND_TERMINAL_STATUSES = new Set([
  'rejected_by_provider',
  'cancelled_by_citizen',
  'expired_unaccepted',
  'cancelled_after_dispute'
]);

export const BOOKING_PAYOUT_TERMINAL_STATUSES = new Set([
  'citizen_confirmed',
  'auto_released'
]);

export const BOOKING_PRICING_BASES = ['per-service', 'per-hour'];

// Documented expiry + auto-release windows (in milliseconds).
// Inline lazy-compute-on-read uses these; no node-cron.
export const PRE_AUTHORIZED_EXPIRY_MS = 4 * 60 * 60 * 1000;    // 4 hours
export const AUTO_RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;     // 24 hours

const FROZEN_FIELDS = new Set([
  'bookingId',
  'citizenRootIdentityId',
  'providerIdentityId',
  'providerRootIdentityId',
  'roleKind',
  'rateSnapshot',
  'pickupPoint',
  'distanceMetersAtBooking',
  'createdAt',
  'transitions',
  'protocolVersion',
  'objectType'
]);

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function assertString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertPositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return n;
}

function normaliseNote(raw, max = 400) {
  if (raw == null) return null;
  const s = String(raw).replace(/\r\n/g, '\n').replace(/^﻿/, '').slice(0, max).trim();
  return s || null;
}

// Round to 4 decimals (~11 m) — the substrate persists pickup
// coords at this precision for the two parties; the ledger emits
// only the 1dp bubble.
function round4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10000) / 10000;
}

function normalisePickupPoint(raw, { roleKind } = {}) {
  // Kirana role = provider IS the destination; pickup optional.
  if (raw == null) {
    if (roleKind === 'kirana') return null;
    const err = new Error('pickup_required');
    err.code = 'pickup_required';
    throw err;
  }
  if (typeof raw !== 'object') {
    throw new Error('pickup must be an object.');
  }
  const lat = round4(raw.lat);
  const lng = round4(raw.lng);
  if (lat == null || lat < -90 || lat > 90) {
    throw new Error('pickup.lat must be a finite number in [-90, 90].');
  }
  if (lng == null || lng < -180 || lng > 180) {
    throw new Error('pickup.lng must be a finite number in [-180, 180].');
  }
  const address = raw.address == null ? null : String(raw.address).slice(0, 200);
  const capturedAt = raw.capturedAt == null ? nowIso() : String(raw.capturedAt);
  return {
    lat,
    lng,
    address,
    capturedAt,
    bubble1dp: bubbleAt1dp(lat, lng)
  };
}

// Compute the quoted amount given a chosen pricing basis + the
// provider's current rates. The result becomes part of the
// immutable rateSnapshot — provider rate edits AFTER booking
// creation do NOT propagate.
function computeQuotedAmount({ pricingBasis, ratePaisePerHour, ratePaisePerService, estimatedHours }) {
  if (pricingBasis === 'per-service') {
    if (!Number.isFinite(ratePaisePerService) || ratePaisePerService <= 0) {
      const err = new Error('rate_required');
      err.code = 'rate_required';
      throw err;
    }
    return Math.trunc(ratePaisePerService);
  }
  if (pricingBasis === 'per-hour') {
    if (!Number.isFinite(ratePaisePerHour) || ratePaisePerHour <= 0) {
      const err = new Error('rate_required');
      err.code = 'rate_required';
      throw err;
    }
    const hours = Number(estimatedHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error('estimatedHours must be a positive number for per-hour pricing.');
    }
    return Math.trunc(Math.round(ratePaisePerHour * hours));
  }
  throw new Error(`pricingBasis must be one of: ${BOOKING_PRICING_BASES.join(', ')}.`);
}

// Build a rate snapshot from a provider record at booking-creation
// time. The snapshot is frozen onto the booking; later mutations
// of providerIdentity.ratePaise* do NOT affect existing bookings.
export function buildRateSnapshot(provider, { pricingBasis, estimatedHours = null, at = nowIso() } = {}) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('provider is required.');
  }
  const ratePaisePerHour = Number(provider.ratePaisePerHour) || 0;
  const ratePaisePerService = Number(provider.ratePaisePerService) || 0;
  const quotedAmountPaise = computeQuotedAmount({
    pricingBasis,
    ratePaisePerHour,
    ratePaisePerService,
    estimatedHours
  });
  return {
    pricingBasis,
    ratePaisePerHour,
    ratePaisePerService,
    estimatedHours: pricingBasis === 'per-hour' ? Number(estimatedHours) : null,
    quotedAmountPaise,
    capturedFromProviderProtocol: provider.protocolVersion || null,
    snapshotAt: at
  };
}

// Build a booking record from a citizen request + a provider record
// at lock-time. Caller persists; caller is responsible for the
// concurrent escrow lock against the citizen's escrow envelope.
export function createBooking({
  citizenRootIdentityId,
  provider,
  pricingBasis,
  estimatedHours = null,
  pickup = null,
  citizenNote = null,
  expectedAmountPaise = null,        // server-side rate-drift guard
  createdAt = nowIso()
} = {}) {
  const citizenId = assertString(citizenRootIdentityId, 'citizenRootIdentityId', 160);
  if (!provider || typeof provider !== 'object') {
    throw new Error('provider is required.');
  }
  if (!provider.providerIdentityId) {
    throw new Error('provider.providerIdentityId is required.');
  }
  if (provider.status !== 'active') {
    const err = new Error('provider_not_bookable');
    err.code = 'provider_not_bookable';
    throw err;
  }
  if (!BOOKING_PRICING_BASES.includes(pricingBasis)) {
    throw new Error(`pricingBasis must be one of: ${BOOKING_PRICING_BASES.join(', ')}.`);
  }
  if (citizenId === provider.rootIdentityId) {
    const err = new Error('cannot_book_self');
    err.code = 'cannot_book_self';
    throw err;
  }
  const rateSnapshot = buildRateSnapshot(provider, {
    pricingBasis,
    estimatedHours,
    at: createdAt
  });
  // Rate-drift guard. The FE renders a quote against the provider's
  // current rate; if the provider edits between the citizen seeing
  // the quote and the citizen tapping "Lock escrow", we must refuse
  // rather than silently lock a different amount.
  if (expectedAmountPaise != null) {
    const expected = Number(expectedAmountPaise);
    if (!Number.isFinite(expected) || expected !== rateSnapshot.quotedAmountPaise) {
      const err = new Error('rate_drift');
      err.code = 'rate_drift';
      err.currentQuotedAmountPaise = rateSnapshot.quotedAmountPaise;
      throw err;
    }
  }
  const pickupPoint = normalisePickupPoint(pickup, { roleKind: provider.roleKind });
  // Distance metres at booking time — for honest UI later. If the
  // provider has discoverable geo and the citizen provided pickup,
  // we snapshot the haversine here.
  let distanceMetersAtBooking = null;
  if (
    pickupPoint &&
    provider.serviceArea &&
    provider.serviceArea.kind === 'point-radius' &&
    provider.serviceArea.center
  ) {
    distanceMetersAtBooking = Math.round(
      haversineMeters(
        { lat: pickupPoint.lat, lng: pickupPoint.lng },
        provider.serviceArea.center
      )
    );
  }
  const note = normaliseNote(citizenNote, 280);
  const core = {
    protocolVersion: BOOKING_PROTOCOL_VERSION,
    objectType: 'booking',
    citizenRootIdentityId: citizenId,
    providerIdentityId: provider.providerIdentityId,
    providerRootIdentityId: provider.rootIdentityId,
    roleKind: provider.roleKind,
    status: 'pre_authorized',
    seq: 1,
    rateSnapshot,
    pickupPoint,
    distanceMetersAtBooking,
    citizenNote: note,
    createdAt,
    acceptedAt: null,
    providerCompletedAt: null,
    citizenConfirmedAt: null,
    autoReleasedAt: null,
    disputedAt: null,
    disputeFiledBy: null,
    disputeReason: null,
    disputeAdjudicatedAt: null,
    disputeAdjudicatedBy: null,
    disputeOutcome: null,
    rejectedAt: null,
    rejectReason: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    expiredAt: null,
    updatedAt: createdAt,
    transitions: [
      { from: null, to: 'pre_authorized', by: 'citizen', at: createdAt, reason: null }
    ]
  };
  const bookingId = `bos:booking:${sha256Hex(stableStringify({ ...core, t: createdAt })).slice(0, 32)}`;
  return { bookingId, ...core };
}

// Apply a vetted state transition. Pure function. Caller wraps
// in store.casUpdateBooking(bookingId, expectedSeq, next, events)
// which enforces CAS.
function applyTransition(booking, {
  nextStatus,
  by,                  // 'citizen' | 'provider' | 'operator' | 'system'
  at,
  reason = null,
  extra = {}
} = {}) {
  if (BOOKING_TERMINAL_STATUSES.has(booking.status)) {
    const err = new Error('booking_status_locked');
    err.code = 'booking_status_locked';
    err.from = booking.status;
    err.to = nextStatus;
    throw err;
  }
  const next = {
    ...booking,
    status: nextStatus,
    seq: (booking.seq || 0) + 1,
    updatedAt: at,
    ...extra,
    transitions: [
      ...(booking.transitions || []),
      { from: booking.status, to: nextStatus, by, at, reason }
    ]
  };
  return next;
}

function assertTransitionAllowed(from, to) {
  const allowed = {
    pre_authorized: new Set(['in_progress', 'rejected_by_provider', 'cancelled_by_citizen', 'expired_unaccepted']),
    in_progress: new Set(['provider_marked_complete', 'cancelled_by_citizen', 'disputed']),
    provider_marked_complete: new Set(['citizen_confirmed', 'auto_released', 'disputed']),
    disputed: new Set(['citizen_confirmed', 'cancelled_after_dispute'])
  };
  const set = allowed[from] || new Set();
  if (!set.has(to)) {
    const err = new Error('booking_status_locked');
    err.code = 'booking_status_locked';
    err.from = from;
    err.to = to;
    throw err;
  }
}

// Provider accepts the pre_authorized booking; enters in_progress.
export function acceptBooking(booking, { at = nowIso() } = {}) {
  assertTransitionAllowed(booking.status, 'in_progress');
  return applyTransition(booking, {
    nextStatus: 'in_progress',
    by: 'provider',
    at,
    extra: { acceptedAt: at }
  });
}

// Provider rejects pre_authorized; refund branch.
export function rejectBooking(booking, { at = nowIso(), reason = null } = {}) {
  assertTransitionAllowed(booking.status, 'rejected_by_provider');
  const r = reason == null ? null : String(reason).slice(0, 280).trim() || null;
  return applyTransition(booking, {
    nextStatus: 'rejected_by_provider',
    by: 'provider',
    at,
    reason: r,
    extra: { rejectedAt: at, rejectReason: r }
  });
}

// Citizen cancels — allowed from pre_authorized OR in_progress.
// In_progress cancel still refunds in v1 (documented sharp edge:
// griefing surface dampens once ratings ship in Phase 12.2+).
export function cancelBooking(booking, { at = nowIso(), reason = null, by = 'citizen' } = {}) {
  assertTransitionAllowed(booking.status, 'cancelled_by_citizen');
  const r = reason == null ? null : String(reason).slice(0, 280).trim() || null;
  return applyTransition(booking, {
    nextStatus: 'cancelled_by_citizen',
    by,
    at,
    reason: r,
    extra: { cancelledAt: at, cancelledBy: by, cancelReason: r }
  });
}

// Provider marks complete; starts the 24h auto-release window.
export function markBookingComplete(booking, { at = nowIso() } = {}) {
  assertTransitionAllowed(booking.status, 'provider_marked_complete');
  return applyTransition(booking, {
    nextStatus: 'provider_marked_complete',
    by: 'provider',
    at,
    extra: { providerCompletedAt: at }
  });
}

// Citizen confirms — terminal-release.
export function citizenConfirmComplete(booking, { at = nowIso() } = {}) {
  assertTransitionAllowed(booking.status, 'citizen_confirmed');
  return applyTransition(booking, {
    nextStatus: 'citizen_confirmed',
    by: 'citizen',
    at,
    extra: { citizenConfirmedAt: at }
  });
}

// Either party files a dispute. Allowed from in_progress OR
// provider_marked_complete. Escrow stays locked until operator
// adjudicates.
export function fileDispute(booking, { filedBy, reason, at = nowIso() } = {}) {
  if (filedBy !== 'citizen' && filedBy !== 'provider') {
    throw new Error('filedBy must be "citizen" or "provider".');
  }
  if (booking.status !== 'in_progress' && booking.status !== 'provider_marked_complete') {
    const err = new Error('booking_status_locked');
    err.code = 'booking_status_locked';
    err.from = booking.status;
    err.to = 'disputed';
    throw err;
  }
  const r = String(reason || '').replace(/\r\n/g, '\n').replace(/^﻿/, '').slice(0, 600).trim();
  if (r.length < 4) {
    throw new Error('dispute reason must be at least 4 characters.');
  }
  return applyTransition(booking, {
    nextStatus: 'disputed',
    by: filedBy,
    at,
    reason: r,
    extra: { disputedAt: at, disputeFiledBy: filedBy, disputeReason: r }
  });
}

// Operator-only adjudication. Two outcomes for v1; "split" deferred
// to Phase 12.2 once real-world dispute distribution data exists.
export function adjudicateDispute(booking, { outcome, operatorId, at = nowIso() } = {}) {
  if (booking.status !== 'disputed') {
    const err = new Error('booking_status_locked');
    err.code = 'booking_status_locked';
    err.from = booking.status;
    err.to = outcome === 'release_to_provider' ? 'citizen_confirmed' : 'cancelled_after_dispute';
    throw err;
  }
  if (outcome !== 'release_to_provider' && outcome !== 'refund_to_citizen') {
    throw new Error('outcome must be "release_to_provider" or "refund_to_citizen".');
  }
  const op = assertString(operatorId, 'operatorId', 160);
  const nextStatus = outcome === 'release_to_provider' ? 'citizen_confirmed' : 'cancelled_after_dispute';
  assertTransitionAllowed('disputed', nextStatus);
  return applyTransition(booking, {
    nextStatus,
    by: 'operator',
    at,
    reason: `adjudicated: ${outcome}`,
    extra: {
      disputeAdjudicatedAt: at,
      disputeAdjudicatedBy: op,
      disputeOutcome: outcome,
      ...(nextStatus === 'citizen_confirmed' ? { citizenConfirmedAt: at } : { cancelledAt: at, cancelledBy: 'operator', cancelReason: `dispute-refund:${booking.disputeReason || ''}`.slice(0, 280) })
    }
  });
}

// Lazy auto-release. Called by every read path BEFORE returning
// the booking. Returns { booking, released, expired, transitions }
// where `released` / `expired` are booleans that flip if the
// state transitioned; `transitions` is a list of just-applied
// transition objects the caller emits as ledger events.
//
// We compute timing in milliseconds (Date.parse on the ISO
// timestamps; if Date.parse returns NaN, we skip the sweep
// rather than crash).
export function maybeAutoRelease(booking, { now = nowMs(), nowIsoStr = null } = {}) {
  if (!booking) return { booking, released: false, expired: false, transitions: [] };
  // 1) 24h auto-release from provider_marked_complete.
  if (booking.status === 'provider_marked_complete' && booking.providerCompletedAt) {
    const startedMs = Date.parse(booking.providerCompletedAt);
    if (Number.isFinite(startedMs) && now - startedMs >= AUTO_RELEASE_WINDOW_MS) {
      const at = nowIsoStr || new Date(now).toISOString();
      const next = applyTransition(booking, {
        nextStatus: 'auto_released',
        by: 'system',
        at,
        reason: '24h-auto-release',
        extra: { autoReleasedAt: at, citizenConfirmedAt: null }
      });
      return {
        booking: next,
        released: true,
        expired: false,
        transitions: [next.transitions[next.transitions.length - 1]]
      };
    }
  }
  // 2) 4h pre_authorized → expired_unaccepted.
  if (booking.status === 'pre_authorized' && booking.createdAt) {
    const startedMs = Date.parse(booking.createdAt);
    if (Number.isFinite(startedMs) && now - startedMs >= PRE_AUTHORIZED_EXPIRY_MS) {
      const at = nowIsoStr || new Date(now).toISOString();
      const next = applyTransition(booking, {
        nextStatus: 'expired_unaccepted',
        by: 'system',
        at,
        reason: '4h-no-provider-accept',
        extra: { expiredAt: at }
      });
      return {
        booking: next,
        released: false,
        expired: true,
        transitions: [next.transitions[next.transitions.length - 1]]
      };
    }
  }
  return { booking, released: false, expired: false, transitions: [] };
}

// Citizen projection. Returns the citizen-facing shape — both
// parties see the same booking but neither sees the other's PII
// beyond what's already public. This projection runs through the
// existing publicProviderRecord at the route layer (NOT here, so
// we don't import provider-identity.mjs).
export function publicBookingForCitizen(booking) {
  return {
    bookingId: booking.bookingId,
    protocolVersion: booking.protocolVersion,
    objectType: booking.objectType,
    providerIdentityId: booking.providerIdentityId,
    roleKind: booking.roleKind,
    status: booking.status,
    seq: booking.seq,
    rateSnapshot: booking.rateSnapshot,
    pickupPoint: booking.pickupPoint,   // citizen owns this; show full 4dp
    distanceMetersAtBooking: booking.distanceMetersAtBooking,
    citizenNote: booking.citizenNote,
    createdAt: booking.createdAt,
    acceptedAt: booking.acceptedAt,
    providerCompletedAt: booking.providerCompletedAt,
    citizenConfirmedAt: booking.citizenConfirmedAt,
    autoReleasedAt: booking.autoReleasedAt,
    disputedAt: booking.disputedAt,
    disputeFiledBy: booking.disputeFiledBy,
    disputeReason: booking.disputeReason,
    disputeOutcome: booking.disputeOutcome,
    rejectedAt: booking.rejectedAt,
    rejectReason: booking.rejectReason,
    cancelledAt: booking.cancelledAt,
    cancelledBy: booking.cancelledBy,
    cancelReason: booking.cancelReason,
    expiredAt: booking.expiredAt,
    updatedAt: booking.updatedAt
  };
}

// Provider projection. Same fields EXCEPT we drop the
// citizenRootIdentityId (FE never needs the raw id to render the
// inbox card; the booking is keyed by bookingId). Pickup point IS
// shown to the provider after accept — they need it to find the
// citizen. Pre-accept (pre_authorized): pickup masked to bubble1dp
// only so providers cannot harvest precise pickup pins without
// committing to the booking.
export function publicBookingForProvider(booking) {
  const showFullPickup = booking.status !== 'pre_authorized';
  return {
    bookingId: booking.bookingId,
    protocolVersion: booking.protocolVersion,
    objectType: booking.objectType,
    providerIdentityId: booking.providerIdentityId,
    roleKind: booking.roleKind,
    status: booking.status,
    seq: booking.seq,
    rateSnapshot: booking.rateSnapshot,
    pickupPoint: booking.pickupPoint
      ? (showFullPickup
          ? booking.pickupPoint
          : { bubble1dp: booking.pickupPoint.bubble1dp, address: null, lat: null, lng: null, capturedAt: booking.pickupPoint.capturedAt })
      : null,
    distanceMetersAtBooking: booking.distanceMetersAtBooking,
    citizenNote: booking.citizenNote,
    createdAt: booking.createdAt,
    acceptedAt: booking.acceptedAt,
    providerCompletedAt: booking.providerCompletedAt,
    citizenConfirmedAt: booking.citizenConfirmedAt,
    autoReleasedAt: booking.autoReleasedAt,
    disputedAt: booking.disputedAt,
    disputeFiledBy: booking.disputeFiledBy,
    disputeReason: booking.disputeReason,
    disputeOutcome: booking.disputeOutcome,
    rejectedAt: booking.rejectedAt,
    rejectReason: booking.rejectReason,
    cancelledAt: booking.cancelledAt,
    cancelledBy: booking.cancelledBy,
    cancelReason: booking.cancelReason,
    expiredAt: booking.expiredAt,
    updatedAt: booking.updatedAt
  };
}

// Whether the field-write is allowed by the substrate's
// immutability contract. Used in tests + at the store layer as
// defence-in-depth. Returns the offending field name on first
// violation, or null if the diff respects immutability.
export function findImmutableViolation(prev, next) {
  for (const field of FROZEN_FIELDS) {
    if (field === 'transitions') {
      const oldT = prev.transitions || [];
      const newT = next.transitions || [];
      if (newT.length < oldT.length) return field;
      for (let i = 0; i < oldT.length; i += 1) {
        if (JSON.stringify(oldT[i]) !== JSON.stringify(newT[i])) return field;
      }
      continue;
    }
    if (JSON.stringify(prev[field]) !== JSON.stringify(next[field])) {
      return field;
    }
  }
  return null;
}

export const FROZEN_BOOKING_FIELDS = FROZEN_FIELDS;
