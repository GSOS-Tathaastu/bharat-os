// UPI cash-out for mesh earnings — Phase 6.1b.
//
// Phase 3.x ships mesh-contribution events with `payoutPaise` per
// event. Phase 6.0b promoted the dashboard. Now we let workers
// actually CASH OUT — convert accumulated unsettled payouts into
// a UPI transfer.
//
// We don't have an actual payout partner integration (Razorpay X,
// Cashfree, etc.). What we ship is the SUBSTRATE any payout
// partner can consume:
//
//   • Signed withdrawal request from the worker (intent +
//     cryptographic non-repudiation).
//   • A clean state machine: pending → provider_accepted → paid,
//     with a failed terminal state.
//   • Idempotent event-settlement tracking: each mesh-contribution
//     event is bundled into at most one ACCEPTED withdrawal. If
//     the withdrawal fails, its events become unsettled again
//     and are eligible for a future withdrawal.
//   • Ops admin endpoints (Phase 5.7 admin-auth) for marking
//     withdrawals paid / failed as external payouts complete.
//
// §15 bindings:
//
//   • UPI ID is the destination — it's outbound-payment-essential
//     so we DO store it, but mask it in audit logs / ledger /
//     metric labels. Format `<first><***>@<bank>` (e.g.
//     `r***h@upi`).
//
//   • Worker SIGNS the request envelope. Cryptographic proof that
//     they authorised the cash-out — no silent payouts.
//
//   • Settlement is auditable: every state transition emits a
//     typed ledger event (`mesh_withdrawal.requested` /
//     `mesh_withdrawal.accepted` / `mesh_withdrawal.paid` /
//     `mesh_withdrawal.failed`) with the masked UPI ID.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const MESH_WITHDRAWAL_PROTOCOL_VERSION =
  'bos.phase1.mesh-withdrawal.v0';

export const WITHDRAWAL_STATUSES = Object.freeze([
  'pending',           // worker submitted, partner not yet notified
  'provider_accepted', // payout partner accepted the request; events SETTLED
  'paid',              // partner confirmed funds received
  'failed'             // partner rejected; events return to UNSETTLED pool
]);

const MIN_WITHDRAWAL_PAISE = 10_00;       // ₹10 floor — sanity, no penny-payouts
const MAX_WITHDRAWAL_PAISE = 10_00_000_00; // ₹10L ceiling — sanity for v1
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

function nowIso() {
  return new Date().toISOString();
}

export function isValidUpiId(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 5 || value.length > 80) return false;
  return UPI_ID_PATTERN.test(value);
}

// Mask the UPI ID so it can safely appear in audit ledger + metrics.
// 'rajesh@hdfcbank' → 'r***h@hdfcbank'. Caller is responsible for
// passing this (never the raw ID) into any observability sink.
export function maskUpiId(upiId) {
  if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
    return null;
  }
  const [local, ...rest] = upiId.split('@');
  const domain = rest.join('@');
  if (local.length === 0) return null;
  if (local.length === 1) return `*@${domain}`;
  if (local.length === 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

// ─── Available balance ───────────────────────────────────────────────

// `meshEvents` is the full event list for the operator; `withdrawals`
// is the operator's withdrawal history. We sum the payout of every
// event that is NOT already locked into a `provider_accepted` or
// `paid` withdrawal. Failed withdrawals' events return to the pool
// (refundable).
export function computeAvailableBalance(meshEvents, withdrawals, { operatorId } = {}) {
  const settledEventIds = new Set();
  for (const w of withdrawals ?? []) {
    if (
      (w.status === 'pending' ||
        w.status === 'provider_accepted' ||
        w.status === 'paid') &&
      Array.isArray(w.settledEventIds)
    ) {
      for (const eid of w.settledEventIds) settledEventIds.add(eid);
    }
  }
  let availablePaise = 0;
  const unsettledEventIds = [];
  const sortedEvents = (meshEvents ?? [])
    .filter((e) => !operatorId || e.operatorId === operatorId)
    // FIFO — oldest first.
    .slice()
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of sortedEvents) {
    if (settledEventIds.has(e.contributionEventId)) continue;
    availablePaise += e.payoutPaise ?? 0;
    unsettledEventIds.push(e.contributionEventId);
  }
  return {
    protocolVersion: MESH_WITHDRAWAL_PROTOCOL_VERSION,
    objectType: 'mesh-balance',
    operatorId: operatorId ?? null,
    availablePaise,
    availableRupees: Number((availablePaise / 100).toFixed(2)),
    unsettledEventCount: unsettledEventIds.length,
    unsettledEventIds,
    minWithdrawalPaise: MIN_WITHDRAWAL_PAISE
  };
}

// ─── Withdrawal request ──────────────────────────────────────────────

// Bundle ALL unsettled events into a single signed withdrawal
// request. Worker signs. Caller persists.
//
// `meshEvents` + `priorWithdrawals` come from the store; this is a
// pure function over those inputs.
//
// Throws if available balance < MIN_WITHDRAWAL_PAISE or > MAX.
export function createWithdrawalRequest({
  identity,
  meshEvents,
  priorWithdrawals,
  upiId,
  at = nowIso()
}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!isValidUpiId(upiId)) {
    throw new Error('upiId is required and must match <local>@<bank>.');
  }
  const balance = computeAvailableBalance(meshEvents, priorWithdrawals, {
    operatorId: identity.id
  });
  if (balance.availablePaise < MIN_WITHDRAWAL_PAISE) {
    throw new Error(
      `insufficient_balance: ₹${(balance.availablePaise / 100).toFixed(2)} available, ` +
        `₹${(MIN_WITHDRAWAL_PAISE / 100).toFixed(2)} minimum.`
    );
  }
  if (balance.availablePaise > MAX_WITHDRAWAL_PAISE) {
    throw new Error(
      `amount_exceeds_ceiling: ₹${(balance.availablePaise / 100).toFixed(2)} ` +
        `exceeds the per-request ₹${(MAX_WITHDRAWAL_PAISE / 100).toLocaleString()} ceiling.`
    );
  }
  const core = {
    protocolVersion: MESH_WITHDRAWAL_PROTOCOL_VERSION,
    objectType: 'mesh-withdrawal-request',
    workerId: identity.id,
    amountPaise: balance.availablePaise,
    amountRupees: balance.availableRupees,
    upiId,
    upiIdMasked: maskUpiId(upiId),
    settledEventIds: balance.unsettledEventIds,
    eventCount: balance.unsettledEventCount,
    status: 'pending',
    requestedAt: at,
    acceptedAt: null,
    paidAt: null,
    failedAt: null,
    failureReason: null,
    providerReference: null
  };
  const requestId = `bos:mesh-withdrawal:${sha256Hex(stableStringify(core)).slice(0, 32)}`;
  // The signature covers the canonical request (everything except
  // mutable state fields the operator transitions through).
  const payloadText = stableStringify({
    ...core,
    requestId
  });
  const signature = signText(identity, payloadText);
  return {
    ...core,
    requestId,
    signature
  };
}

// Verify the worker's signature on a withdrawal request. Used by
// the payout partner / ops tooling before processing.
export function verifyWithdrawalRequest(request, workerPublicRecord) {
  if (!request || request.objectType !== 'mesh-withdrawal-request') {
    return { ok: false, reason: 'malformed' };
  }
  if (!request.signature) return { ok: false, reason: 'no signature' };
  if (!workerPublicRecord || workerPublicRecord.id !== request.workerId) {
    return { ok: false, reason: 'worker public record does not match' };
  }
  // Reconstruct the canonical payload — strip mutable state fields
  // that get filled in by transitions AFTER signing.
  const {
    signature,
    status: _s,
    acceptedAt: _a,
    paidAt: _p,
    failedAt: _f,
    failureReason: _r,
    providerReference: _pr,
    ...canonical
  } = request;
  const payloadText = stableStringify({
    ...canonical,
    status: 'pending',
    acceptedAt: null,
    paidAt: null,
    failedAt: null,
    failureReason: null,
    providerReference: null
  });
  const valid = verifySignature(workerPublicRecord, payloadText, signature);
  return valid
    ? { ok: true, reason: 'signature verified' }
    : { ok: false, reason: 'signature does not verify' };
}

// ─── State transitions ───────────────────────────────────────────────

// All transitions are pure functions. The API handler persists the
// result + emits the matching ledger event.

const VALID_TRANSITIONS = {
  pending: new Set(['provider_accepted', 'failed']),
  provider_accepted: new Set(['paid', 'failed']),
  paid: new Set(), // terminal
  failed: new Set() // terminal
};

function assertTransition(currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`unknown current status: ${currentStatus}`);
  }
  if (!allowed.has(nextStatus)) {
    throw new Error(
      `invalid transition: cannot go from ${currentStatus} to ${nextStatus}.`
    );
  }
}

export function markWithdrawalAccepted(request, { providerReference, at = nowIso() } = {}) {
  if (!request) throw new Error('request is required.');
  assertTransition(request.status, 'provider_accepted');
  if (!providerReference || typeof providerReference !== 'string') {
    throw new Error('providerReference is required.');
  }
  return {
    ...request,
    status: 'provider_accepted',
    acceptedAt: at,
    providerReference: providerReference.slice(0, 120)
  };
}

export function markWithdrawalPaid(request, { providerReference, at = nowIso() } = {}) {
  if (!request) throw new Error('request is required.');
  // Allow paid from either pending (fast partners that confirm
  // synchronously) or provider_accepted (two-phase partners).
  if (request.status === 'pending') {
    assertTransition('pending', 'provider_accepted');
    // We track the accepted timestamp as `at` too — synchronous
    // accept + pay happen at the same moment.
  } else {
    assertTransition(request.status, 'paid');
  }
  return {
    ...request,
    status: 'paid',
    acceptedAt: request.acceptedAt ?? at,
    paidAt: at,
    providerReference:
      providerReference?.slice(0, 120) ?? request.providerReference ?? null
  };
}

export function markWithdrawalFailed(request, { reason, at = nowIso() } = {}) {
  if (!request) throw new Error('request is required.');
  assertTransition(request.status, 'failed');
  if (!reason || typeof reason !== 'string' || reason.length < 4) {
    throw new Error('reason is required (>= 4 chars) for a failed transition.');
  }
  return {
    ...request,
    status: 'failed',
    failedAt: at,
    failureReason: reason.slice(0, 240)
  };
}

// ─── Constants for callers ───────────────────────────────────────────

export const MESH_WITHDRAWAL_LIMITS = Object.freeze({
  minPaise: MIN_WITHDRAWAL_PAISE,
  maxPaise: MAX_WITHDRAWAL_PAISE
});
