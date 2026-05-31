// Phase 12.1a.2 — Citizen-booking escrow.
//
// One record per citizen rootIdentity. Sibling to sponsor.mjs's
// escrow envelope, but scoped to a citizen rather than an
// organization, and powered by the shared escrow-paise primitives
// (src/phase0/escrow-paise.mjs) so the math stays identical.
//
// Funding model — bookkeeping-v1.
//
//   For the investor-pitch MVP, an operator deposits paise into a
//   citizen's escrow via the admin endpoint. This stands in for a
//   real UPI rail (which would PSP-verify the citizen's VPA before
//   crediting). The substrate does NOT pretend the rail exists; the
//   `fundingMode` literal `'bookkeeping-v1'` on every escrow
//   envelope makes that honest. A future Phase 12.2+ payment rail
//   adapter will flip this to 'upi-collect' or similar without
//   changing the state-machine.
//
// §15 bindings:
//   • NO commission, fee, or platform-share field.
//   • The escrow record is bound to a rootIdentityId; DPDP §12(3)
//     cascade on identity erasure must zero the record (handled in
//     store erasure path).
//   • Balances cannot underflow. Lock cannot exceed available.
//     Settled at the primitive layer.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import {
  depositPaise,
  lockPaise,
  debitLockedPaise,
  refundLockedPaise,
  availablePaise
} from '../phase0/escrow-paise.mjs';

export const CITIZEN_ESCROW_PROTOCOL_VERSION = 'bos.phase12.citizen-escrow.v0';

function nowIso() {
  return new Date().toISOString();
}

// Stable envelope id from the rootIdentityId. Derived deterministically
// so the same citizen's escrow always resolves to the same record id,
// and a stale "deposit twice" path can't accidentally fork the
// envelope into two competing balances.
export function citizenEscrowIdFor(rootIdentityId) {
  if (typeof rootIdentityId !== 'string' || rootIdentityId.trim() === '') {
    throw new Error('rootIdentityId is required.');
  }
  return `bos:citizen-escrow:${sha256Hex(stableStringify({ root: rootIdentityId.trim() })).slice(0, 32)}`;
}

// Construct an empty escrow envelope. Caller persists.
export function createCitizenEscrow(rootIdentityId, { createdAt = nowIso() } = {}) {
  const root = String(rootIdentityId).trim();
  if (!root) throw new Error('rootIdentityId is required.');
  return {
    protocolVersion: CITIZEN_ESCROW_PROTOCOL_VERSION,
    objectType: 'citizen-escrow',
    citizenEscrowId: citizenEscrowIdFor(root),
    citizenRootIdentityId: root,
    fundingMode: 'bookkeeping-v1',
    escrowBalancePaise: 0,
    escrowLockedPaise: 0,
    // Phase 12.1a.2 ESCROW-CAS — monotonic seq for CAS so two
    // concurrent booking-creates can't both lock past the
    // available balance. Bumped on every mutating helper.
    seq: 1,
    createdAt,
    updatedAt: createdAt
  };
}

function bumpSeq(escrow) {
  return { ...escrow, seq: (escrow.seq || 0) + 1 };
}

// Mutating helpers — caller persists the returned record.
export function depositCitizenEscrow(escrow, amountPaise, { at = nowIso() } = {}) {
  return { ...bumpSeq(depositPaise(escrow, amountPaise)), updatedAt: at };
}

export function lockCitizenEscrow(escrow, amountPaise, { at = nowIso() } = {}) {
  return { ...bumpSeq(lockPaise(escrow, amountPaise)), updatedAt: at };
}

export function debitLockedCitizenEscrow(escrow, amountPaise, { at = nowIso() } = {}) {
  return { ...bumpSeq(debitLockedPaise(escrow, amountPaise)), updatedAt: at };
}

export function refundLockedCitizenEscrow(escrow, amountPaise, { at = nowIso() } = {}) {
  return { ...bumpSeq(refundLockedPaise(escrow, amountPaise)), updatedAt: at };
}

export function availableCitizenEscrow(escrow) {
  return availablePaise(escrow);
}

// Public read for citizen's own dashboard. The record has no
// secrets vs the owner; this projection exists for shape
// consistency with publicProviderRecord and sponsor.publicSponsor.
export function publicCitizenEscrow(escrow) {
  return {
    citizenEscrowId: escrow.citizenEscrowId,
    protocolVersion: escrow.protocolVersion,
    objectType: escrow.objectType,
    fundingMode: escrow.fundingMode,
    escrowBalancePaise: escrow.escrowBalancePaise,
    escrowLockedPaise: escrow.escrowLockedPaise,
    availablePaise: availablePaise(escrow),
    updatedAt: escrow.updatedAt
  };
}
