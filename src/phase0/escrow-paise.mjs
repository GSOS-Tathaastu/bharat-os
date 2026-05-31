// Phase 12.1a.2 — Shared escrow paise primitives.
//
// Entity-agnostic pure helpers over a generic
// `{ escrowBalancePaise, escrowLockedPaise }` envelope. Lifted
// from Phase 9.1's sponsor.mjs so the same math powers:
//   • Sponsor escrow (Phase 9.1) — labeling-job / federated-round
//     pre-funding. sponsor.mjs is a thin wrapper re-exporting
//     these; existing tests stand as the regression gate.
//   • Citizen-booking escrow (Phase 12.1a.2) — citizen pre-deposits
//     to lock for one-off bookings.
//   • Future Phase 12.2 mesh-contribution payout settlement.
//
// §15 bindings preserved at the math layer:
//   • Lock cannot exceed available (balance - locked).
//   • Debit cannot exceed locked.
//   • Refund cannot exceed locked.
//   • All amounts MUST be positive integers (no floats, no nulls).
//
// These helpers are pure; the CALLER persists the returned
// envelope and ledgers the action. We do not emit ledger events
// here so the same primitive serves stores that emit different
// event shapes (sponsor_escrow.deposited vs
// citizen_escrow.deposited vs booking.escrow_locked).

export const ESCROW_PAISE_PROTOCOL_VERSION = 'bos.phase0.escrow-paise.v0';

function assertPositiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return n;
}

// Caller envelope contract: any object with these two fields.
//
//   {
//     escrowBalancePaise: non-negative integer,
//     escrowLockedPaise:  non-negative integer (<= balance)
//   }
//
// All four helpers return a shallow-copy envelope with the same
// shape; non-escrow fields on the input are preserved.

export function depositPaise(envelope, amountPaise) {
  const n = assertPositiveInteger(amountPaise, 'amountPaise');
  return {
    ...envelope,
    escrowBalancePaise: (envelope.escrowBalancePaise || 0) + n
  };
}

export function lockPaise(envelope, amountPaise) {
  const n = assertPositiveInteger(amountPaise, 'amountPaise');
  const balance = envelope.escrowBalancePaise || 0;
  const locked = envelope.escrowLockedPaise || 0;
  if (n > balance - locked) {
    throw new Error('insufficient available escrow balance.');
  }
  return {
    ...envelope,
    escrowLockedPaise: locked + n
  };
}

// Debit a previously-locked amount: balance AND locked both go
// down by the same amount. Used at settlement when escrow flows
// to the counterparty.
export function debitLockedPaise(envelope, amountPaise) {
  const n = assertPositiveInteger(amountPaise, 'amountPaise');
  const locked = envelope.escrowLockedPaise || 0;
  if (n > locked) {
    throw new Error('debit exceeds locked escrow.');
  }
  return {
    ...envelope,
    escrowBalancePaise: (envelope.escrowBalancePaise || 0) - n,
    escrowLockedPaise: locked - n
  };
}

// Unlock without debiting: refund unused budget on close / expire
// / dispute-refund. balance unchanged; locked goes down.
export function refundLockedPaise(envelope, amountPaise) {
  const n = assertPositiveInteger(amountPaise, 'amountPaise');
  const locked = envelope.escrowLockedPaise || 0;
  if (n > locked) {
    throw new Error('refund exceeds locked escrow.');
  }
  return {
    ...envelope,
    escrowLockedPaise: locked - n
  };
}

// Convenience read.
export function availablePaise(envelope) {
  return (envelope.escrowBalancePaise || 0) - (envelope.escrowLockedPaise || 0);
}
