// Phase 13.5.1 — Citizen data offer purchase record.
//
// One record per sponsor purchase against a citizen data offer.
// Each purchase atomically:
//   1. Validates the offer is `active` (not paused/revoked/exhausted).
//   2. Validates the sponsor's declared purpose is in the offer's
//      `sponsorPurposeAllowlist`.
//   3. Validates the sponsor has at least `pricePerSalePaise` in
//      AVAILABLE escrow (balance - locked).
//   4. Debits the sponsor's escrow by `pricePerSalePaise`.
//   5. Credits the citizen via a `citizen_data_sale` mesh-contribution
//      event with `payoutPaise = pricePerSalePaise`.
//   6. Bumps the offer's `salesCount` by 1; transitions status to
//      `exhausted` when `salesCount === maxSales`.
//   7. Persists the purchase record.
//   8. Emits a `citizen_data_offer.purchased` pointer ledger event.
//
// The atomicity is enforced by the API handler (all reads + writes
// in the same request handler before any response); we don't open a
// transaction at the BE-store layer because the existing labeling /
// federated patterns don't either, and a partial failure path is
// already managed by re-running the request.
//
// §15 bindings:
//   - Pointer-not-payload — the purchase record carries sponsorId,
//     offerId, purchaseId, purpose, pricePerSalePaise, purchasedAt.
//     NEVER the data point bytes; those flow via the per-data-point
//     delivery signature flow which lands in Phase 13.5.2.
//   - Strict allowlist on top-level keys.
//   - DPDP §12 cascade on identity erase — purchases that reference
//     an erased citizen are wiped (both sponsor-side and citizen-side
//     cascade work).

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const CITIZEN_DATA_OFFER_PURCHASE_PROTOCOL_VERSION =
  'bos.phase13.citizen-data-offer-purchase.v1';

export const PERMITTED_PURCHASE_KEYS = Object.freeze([
  'purchaseId',
  'offerId',
  'sponsorId',
  'publisherId',
  'pricePerSalePaise',
  'sponsorPurpose',
  // Phase 13.5.2 — denormalised from the offer at purchase time so
  // the audit-export bundle stays self-contained even after the
  // citizen revokes the offer (DPDP §12 cascade removes the offer
  // record but the purchase row + sponsor's signed export remain).
  'dataPointKind',
  'protocolVersion',
  'purchasedAt',
  'meshContributionEventId'
]);

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function purchaseIdFrom(payload) {
  return `bos:citizen-data-purchase:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Build a citizen-data-offer purchase record. Caller is responsible
 * for having already validated the offer + the sponsor.
 *
 * @param {object} input
 * @param {string} input.offerId
 * @param {string} input.sponsorId
 * @param {string} input.publisherId
 * @param {number} input.pricePerSalePaise
 * @param {string} input.sponsorPurpose — one of the offer's allowed purposes
 * @param {string} [input.dataPointKind] — denormalised from the offer
 *   so the audit-export bundle remains self-contained even after
 *   the offer record is wiped by DPDP §12 cascade. v1 accepts null;
 *   v2 will require this field.
 */
export function buildCitizenDataOfferPurchase(input) {
  if (input == null || typeof input !== 'object') {
    throw new Error('purchase input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!PERMITTED_PURCHASE_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted citizen-data-offer-purchase field; envelope is pointer-only (the data point bytes never reach the registry).`
      );
    }
  }
  const offerId = assertNonEmptyString(input.offerId, 'offerId', 200);
  const sponsorId = assertNonEmptyString(input.sponsorId, 'sponsorId', 200);
  const publisherId = assertNonEmptyString(input.publisherId, 'publisherId', 200);
  const sponsorPurpose = assertNonEmptyString(input.sponsorPurpose, 'sponsorPurpose', 80);
  const pricePerSalePaise = Number(input.pricePerSalePaise);
  if (!Number.isInteger(pricePerSalePaise) || pricePerSalePaise <= 0) {
    throw new Error('pricePerSalePaise must be a positive integer.');
  }
  // dataPointKind is optional for backward-compat with any pre-13.5.2
  // purchase records on disk; new purchases always set it.
  const dataPointKind = input.dataPointKind != null
    ? assertNonEmptyString(input.dataPointKind, 'dataPointKind', 64)
    : null;
  const purchasedAt = nowIso().replace(/\.\d{1,3}Z$/, 'Z');
  // Content-derived purchase id. salt with the timestamp so multiple
  // purchases of the same offer by the same sponsor for the same
  // purpose produce distinct ids.
  const purchaseId = purchaseIdFrom({
    offerId,
    sponsorId,
    sponsorPurpose,
    pricePerSalePaise,
    purchasedAt
  });
  return {
    purchaseId,
    offerId,
    sponsorId,
    publisherId,
    pricePerSalePaise,
    sponsorPurpose,
    dataPointKind,
    protocolVersion: CITIZEN_DATA_OFFER_PURCHASE_PROTOCOL_VERSION,
    purchasedAt,
    meshContributionEventId: null
  };
}

/**
 * Apply the salesCount bump + status transition to an offer.
 * Caller has already validated the offer is active + has remaining
 * capacity; this just produces the next-state object.
 */
export function applyPurchaseToOffer(offer) {
  if (offer == null || offer.status !== 'active') {
    throw new Error('cannot apply purchase: offer is not active.');
  }
  if (offer.salesCount >= offer.maxSales) {
    throw new Error('cannot apply purchase: offer already exhausted.');
  }
  const nextSalesCount = offer.salesCount + 1;
  const nextStatus = nextSalesCount >= offer.maxSales ? 'exhausted' : 'active';
  return {
    ...offer,
    salesCount: nextSalesCount,
    status: nextStatus
  };
}

/**
 * Build the `citizen_data_offer.purchased` audit-ledger event.
 * POINTER + count-only meta per §15.
 */
export function buildCitizenDataOfferPurchasedLedgerEvent({ offer, purchase, at }) {
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: 'citizen_data_offer.purchased',
    purchaseId: purchase.purchaseId,
    offerId: purchase.offerId,
    sponsorId: purchase.sponsorId,
    publisherId: purchase.publisherId,
    dataPointKind: offer.dataPointKind,
    sponsorPurpose: purchase.sponsorPurpose,
    pricePerSalePaise: purchase.pricePerSalePaise,
    salesCount: offer.salesCount,
    maxSales: offer.maxSales,
    at: atNormalised
  };
}
