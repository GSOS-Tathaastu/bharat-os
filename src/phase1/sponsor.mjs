// Phase 9.1 — Sponsor model + bearer-token auth + escrow ledger.
//
// Sponsors are organizations (banks, hospitals, government departments,
// LLM trainers) that pay Bharat OS to run federated training rounds.
// First non-investor revenue line.
//
// Pattern: admins (Phase 5.7 BHARAT_OS_ADMIN_TOKEN) onboard sponsors
// + top up their escrow balance. Sponsors then act on their own
// resource (creating rounds, fetching audit exports) using their
// per-sponsor bearer token. Two distinct auth surfaces — admin
// compromise can lift cooldowns but can't spend a sponsor's escrow;
// sponsor compromise can drain that sponsor's escrow but not affect
// other sponsors.
//
// Escrow accounting is internal ledger only — real fiat top-ups are
// operationally separate (admin posts a deposit after confirming
// the wire / NEFT cleared). This keeps the BE code path the same
// across demo + production.

import { randomBytes, createHash } from 'node:crypto';
import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const SPONSOR_PROTOCOL_VERSION = 'bos.phase9.sponsor.v0';

export const SPONSOR_STATUSES = ['active', 'suspended', 'revoked'];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

// Token shape: 32 hex chars (128 bits) prefixed with "bos:sponsor-token:"
// so leaked tokens are recognisable in logs and gitleaks-style scanners.
const SPONSOR_TOKEN_PREFIX = 'bos:sponsor-token:';

function generateBearerToken() {
  return SPONSOR_TOKEN_PREFIX + randomBytes(16).toString('hex');
}

export function hashBearerToken(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('token must be a non-empty string.');
  }
  return 'sha256:' + createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyBearerToken(token, hashedToken) {
  if (typeof token !== 'string' || typeof hashedToken !== 'string') return false;
  let candidate;
  try {
    candidate = hashBearerToken(token);
  } catch {
    return false;
  }
  if (candidate.length !== hashedToken.length) return false;
  let mismatch = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    mismatch |= candidate.charCodeAt(i) ^ hashedToken.charCodeAt(i);
  }
  return mismatch === 0;
}

// Returns { sponsor, bearerToken } where bearerToken is shown ONCE
// to the admin who onboarded the sponsor — never persisted by us
// past the hash.
export function createSponsor({
  displayName,
  contactEmail = null,
  status = 'active',
  onboardedAt = nowIso(),
  onboardedBy = 'unattributed-operator'
}) {
  const name = assertNonEmptyString(displayName, 'displayName', 120);
  const email = contactEmail == null ? null : assertNonEmptyString(contactEmail, 'contactEmail', 200);
  if (!SPONSOR_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${SPONSOR_STATUSES.join(', ')}.`);
  }
  const operator = String(onboardedBy).trim().slice(0, 80) || 'unattributed-operator';
  const bearerToken = generateBearerToken();
  const core = {
    protocolVersion: SPONSOR_PROTOCOL_VERSION,
    objectType: 'sponsor',
    displayName: name,
    contactEmail: email,
    status,
    onboardedAt,
    onboardedBy: operator,
    bearerTokenHash: hashBearerToken(bearerToken),
    // Internal escrow accounting — sum of deposits minus locked +
    // debited amounts. Updated by escrow ledger event handlers.
    escrowBalancePaise: 0,
    escrowLockedPaise: 0
  };
  const sponsorId = idFrom('bos:sponsor', { ...core, t: onboardedAt });
  return {
    sponsor: { sponsorId, ...core },
    bearerToken
  };
}

// "Self" view of a sponsor — for the sponsor's own dashboard +
// admin views. Strips bearer-token hash + operator label.
export function publicSponsor(sponsor) {
  return {
    sponsorId: sponsor.sponsorId,
    displayName: sponsor.displayName,
    contactEmail: sponsor.contactEmail,
    status: sponsor.status,
    onboardedAt: sponsor.onboardedAt,
    escrowBalancePaise: sponsor.escrowBalancePaise,
    escrowLockedPaise: sponsor.escrowLockedPaise
  };
}

// Public-facing view — sponsor display name + status only. Used by
// the FE rounds card to render "Sponsored by X" badges without
// exposing escrow numbers or the sponsor's contact info.
export function publicSponsorDirectory(sponsor) {
  return {
    sponsorId: sponsor.sponsorId,
    displayName: sponsor.displayName,
    status: sponsor.status
  };
}

// Mutating helpers — caller persists the returned sponsor.
//
// Phase 12.1a.2: the math is extracted to src/phase0/escrow-paise.mjs
// so the same primitives can power citizen-booking-escrow + future
// payout-settlement code paths. The sponsor.* wrappers stay for
// API stability; existing tests are the regression gate.
import {
  depositPaise,
  lockPaise,
  debitLockedPaise,
  refundLockedPaise
} from '../phase0/escrow-paise.mjs';

export function depositEscrow(sponsor, amountPaise) {
  return depositPaise(sponsor, amountPaise);
}

export function lockEscrow(sponsor, amountPaise) {
  return lockPaise(sponsor, amountPaise);
}

// Debit a previously-locked amount: balance AND locked both go down
// by the same amount. Used per accepted worker update.
export function debitLockedEscrow(sponsor, amountPaise) {
  return debitLockedPaise(sponsor, amountPaise);
}

// Unlock without debiting: refund unused round budget on close /
// expire. balance unchanged; locked goes down.
export function refundLockedEscrow(sponsor, amountPaise) {
  return refundLockedPaise(sponsor, amountPaise);
}

export function revokeSponsor(sponsor, { revokedAt = nowIso(), revokedBy = 'unattributed-operator' } = {}) {
  return {
    ...sponsor,
    status: 'revoked',
    revokedAt,
    revokedBy: String(revokedBy).trim().slice(0, 80) || 'unattributed-operator'
  };
}

// Sponsor-auth error mirrors AdminAuthError so the route handler
// can render an honest status without a per-route branch.
export class SponsorAuthError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'SponsorAuthError';
    this.status = status;
    this.code = code;
  }
}
