// MFI-consumable income verification — Phase 6.1.
//
// A worker who's accumulated earnings (Phase 6.0a), mesh-contribution
// payouts (Phase 6.0b inputs), and portable attestations (Phase 5.9)
// can authorize a microfinance institution (MFI) / NBFC / lender to
// read a signed summary of those records. The bundle is the
// substrate an MFI consumes for KYC-supplementary income proof —
// the kind of evidence that today requires three months of bank
// statements and a salary slip.
//
// Two artifacts:
//
//   1. **Consent** — worker-signed envelope authorising a NAMED
//      MFI to read the bundle. Includes purpose, FY, expiry,
//      max-reads (default 1 = single-use bearer token). The
//      consentId doubles as the bearer token the MFI presents.
//
//   2. **Bundle** — worker-signed summary aggregated from
//      `earnings-log`, `mesh-contribution`, `portable-attestation`.
//      The MFI verifies via the worker's public key.
//
// §15 bindings:
//
//   • Worker explicitly signs the consent — MFI access is opt-in,
//     not implicit. No silent data flow.
//
//   • Consent is single-use by default. After read, the consent
//     burns; the MFI cannot poll over time.
//
//   • Bundle contains aggregates (total paise, working days,
//     attestation counts) — not raw earnings entries. MFI sees
//     "₹3,42,500 across 142 days, 600 signed attestations" but
//     not the day-by-day Swiggy / Zomato split.
//
//   • Bundle carries a mandatory disclaimer making the worker's
//     self-assertion + the verification-tier model explicit. MFI
//     knows what they're consuming.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';
import { ATTESTATION_TIERS } from './portable-attestation.mjs';

export const INCOME_VERIFICATION_PROTOCOL_VERSION =
  'bos.phase1.income-verification.v0';

const DEFAULT_CONSENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_CONSENT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const MIN_CONSENT_TTL_SECONDS = 60; // 1 minute (test-friendly lower bound)
const FY_PATTERN = /^(\d{4})-(\d{2})$/;

function isValidFinancialYear(value) {
  if (typeof value !== 'string') return false;
  const match = FY_PATTERN.exec(value);
  if (!match) return false;
  const startYear = Number(match[1]);
  const expectedEnd = ((startYear + 1) % 100).toString().padStart(2, '0');
  return match[2] === expectedEnd && startYear >= 2017 && startYear <= 2099;
}

function fyWindow(financialYear) {
  const startYear = Number(financialYear.slice(0, 4));
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`
  };
}

// ─── Consent issuance ─────────────────────────────────────────────────

export function createIncomeVerificationConsent({
  identity,
  mfiName,
  purpose,
  financialYear,
  ttlSeconds = DEFAULT_CONSENT_TTL_SECONDS,
  maxReads = 1,
  at = new Date().toISOString()
} = {}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!mfiName || typeof mfiName !== 'string') {
    throw new Error('mfiName is required.');
  }
  if (mfiName.length > 80) throw new Error('mfiName must be <= 80 chars.');
  if (!purpose || typeof purpose !== 'string') {
    throw new Error('purpose is required.');
  }
  if (!isValidFinancialYear(financialYear)) {
    throw new Error('financialYear must be YYYY-YY (e.g., 2025-26).');
  }
  if (
    !Number.isFinite(ttlSeconds) ||
    ttlSeconds < MIN_CONSENT_TTL_SECONDS ||
    ttlSeconds > MAX_CONSENT_TTL_SECONDS
  ) {
    throw new Error(
      `ttlSeconds must be between ${MIN_CONSENT_TTL_SECONDS} and ${MAX_CONSENT_TTL_SECONDS}.`
    );
  }
  if (!Number.isInteger(maxReads) || maxReads < 1 || maxReads > 10) {
    throw new Error('maxReads must be an integer between 1 and 10.');
  }

  const expiresAt = new Date(Date.parse(at) + ttlSeconds * 1000).toISOString();
  const core = {
    protocolVersion: INCOME_VERIFICATION_PROTOCOL_VERSION,
    objectType: 'income-verification-consent',
    workerId: identity.id,
    mfiName: mfiName.trim().slice(0, 80),
    purpose: purpose.trim().slice(0, 240),
    financialYear,
    issuedAt: at,
    expiresAt,
    maxReads
  };
  const consentId = `bos:income-verification-consent:${sha256Hex(
    stableStringify(core)
  ).slice(0, 32)}`;
  const payloadText = stableStringify({ ...core, consentId });
  const signature = signText(identity, payloadText);
  return {
    ...core,
    consentId,
    signature,
    readCount: 0,
    revokedAt: null
  };
}

// Verify a consent's signature + freshness. Returns
//   { ok: true, status: 'valid' } | { ok: false, status: '...' }.
// `status` distinguishes 'expired' / 'revoked' / 'exhausted' /
// 'signature_invalid' / 'unknown_worker' so the API handler can
// pick the appropriate HTTP status.
export function verifyIncomeVerificationConsent(
  consent,
  workerPublicRecord,
  { at = new Date().toISOString() } = {}
) {
  if (!consent || consent.objectType !== 'income-verification-consent') {
    return { ok: false, status: 'malformed' };
  }
  if (!consent.signature) return { ok: false, status: 'malformed' };
  if (!workerPublicRecord || workerPublicRecord.id !== consent.workerId) {
    return { ok: false, status: 'unknown_worker' };
  }
  if (consent.revokedAt) return { ok: false, status: 'revoked' };
  if (at >= consent.expiresAt) return { ok: false, status: 'expired' };
  if ((consent.readCount ?? 0) >= consent.maxReads) {
    return { ok: false, status: 'exhausted' };
  }
  // Reconstruct the canonical payload by stripping mutable fields.
  // `readCount` and `revokedAt` were not present at signing time;
  // including them would invalidate the signature on every read.
  const { signature, readCount: _r, revokedAt: _v, ...canonical } = consent;
  const payloadText = stableStringify(canonical);
  const valid = verifySignature(workerPublicRecord, payloadText, signature);
  if (!valid) return { ok: false, status: 'signature_invalid' };
  return { ok: true, status: 'valid' };
}

// ─── Bundle composition ──────────────────────────────────────────────

export function buildIncomeVerificationBundle({
  identity,
  consent,
  earningsEntries,
  meshContributionEvents,
  portableAttestations,
  at = new Date().toISOString()
}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!consent || consent.workerId !== identity.id) {
    throw new Error('consent must match identity.');
  }
  const window = fyWindow(consent.financialYear);

  // Earnings aggregation — only this worker, only in the FY window.
  const inFy = (earningsEntries ?? []).filter(
    (e) =>
      e.identityId === identity.id &&
      typeof e.date === 'string' &&
      e.date >= window.from &&
      e.date <= window.to
  );
  const totalEarningsPaise = inFy.reduce(
    (sum, e) => sum + (e.amountPaise ?? 0),
    0
  );
  const byCategory = {
    delivery: 0,
    ride: 0,
    service: 0,
    cash: 0,
    other: 0
  };
  for (const e of inFy) {
    if (e.category in byCategory) byCategory[e.category] += e.amountPaise ?? 0;
  }
  const workingDays = new Set(inFy.map((e) => e.date)).size;

  // Mesh contribution — FY window via the event timestamp.
  const fyStartMs = Date.parse(`${window.from}T00:00:00Z`);
  const fyEndMs = Date.parse(`${window.to}T23:59:59.999Z`);
  const meshInFy = (meshContributionEvents ?? []).filter((m) => {
    if (m.operatorId !== identity.id) return false;
    if (typeof m.at !== 'string') return false;
    const ms = Date.parse(m.at);
    return Number.isFinite(ms) && ms >= fyStartMs && ms <= fyEndMs;
  });
  const meshPayoutPaise = meshInFy.reduce(
    (sum, m) => sum + (m.payoutPaise ?? 0),
    0
  );

  // Portable attestations — count signed-only, group by tier.
  const attestations = (portableAttestations ?? []).filter(
    (a) => a.workerId === identity.id && a.status === 'signed'
  );
  const attestationsByTier = {
    [ATTESTATION_TIERS.ANONYMOUS_TAP]: 0,
    [ATTESTATION_TIERS.OTP_CONFIRMED]: 0,
    [ATTESTATION_TIERS.BHARAT_OS_SIGNED]: 0
  };
  for (const a of attestations) {
    if (a.tier in attestationsByTier) attestationsByTier[a.tier] += 1;
  }

  const core = {
    protocolVersion: INCOME_VERIFICATION_PROTOCOL_VERSION,
    objectType: 'income-verification-bundle',
    consentId: consent.consentId,
    workerId: identity.id,
    workerDisplayName: identity.displayName ?? null,
    mfiName: consent.mfiName,
    purpose: consent.purpose,
    financialYear: consent.financialYear,
    issuedAt: at,
    fyWindow: window,
    income: {
      totalEarningsPaise,
      totalEarningsRupees: Number((totalEarningsPaise / 100).toFixed(2)),
      byCategory,
      workingDays,
      entryCount: inFy.length,
      meshPayoutPaise,
      grandTotalPaise: totalEarningsPaise + meshPayoutPaise,
      grandTotalRupees: Number(
        ((totalEarningsPaise + meshPayoutPaise) / 100).toFixed(2)
      )
    },
    credibility: {
      portableAttestationsByTier: attestationsByTier,
      totalSignedAttestations: attestations.length
    },
    disclaimer:
      'This bundle summarises the worker\'s self-logged Bharat OS earnings ' +
      'and customer-signed portable attestations. Earnings entries are ' +
      'TYPED BY THE WORKER (Bharat OS does not scrape aggregator APIs); ' +
      'their accuracy is the worker\'s assertion under §15 PII discipline. ' +
      'Portable attestations are customer-signed claims at three quality ' +
      'tiers (anonymous tap / OTP-confirmed / Bharat OS signed); see the ' +
      '`credibility.portableAttestationsByTier` breakdown and weight them ' +
      'as appropriate for your decision. Bharat OS does NOT verify ' +
      'identity (Aadhaar does that) and does NOT guarantee the underlying ' +
      'work performance. The lender is responsible for any verification ' +
      'beyond what is in this bundle.'
  };
  const bundleId = `bos:income-verification-bundle:${sha256Hex(
    stableStringify(core)
  ).slice(0, 32)}`;
  const payloadText = stableStringify({ ...core, bundleId });
  const signature = signText(identity, payloadText);
  return {
    ...core,
    bundleId,
    signature
  };
}

export function verifyIncomeVerificationBundle(bundle, workerPublicRecord) {
  if (!bundle || bundle.objectType !== 'income-verification-bundle') {
    return { ok: false, status: 'malformed' };
  }
  if (!bundle.signature) return { ok: false, status: 'malformed' };
  if (!workerPublicRecord || workerPublicRecord.id !== bundle.workerId) {
    return { ok: false, status: 'unknown_worker' };
  }
  const { signature, ...canonical } = bundle;
  const payloadText = stableStringify(canonical);
  const valid = verifySignature(workerPublicRecord, payloadText, signature);
  return valid
    ? { ok: true, status: 'valid' }
    : { ok: false, status: 'signature_invalid' };
}

// Revoke a consent — worker can pull MFI access before expiry. Pure;
// returns a new consent object with revokedAt set. Caller persists.
export function revokeIncomeVerificationConsent(
  consent,
  { at = new Date().toISOString() } = {}
) {
  if (!consent || consent.objectType !== 'income-verification-consent') {
    throw new Error('consent must be an income-verification-consent.');
  }
  if (consent.revokedAt) return consent;
  return { ...consent, revokedAt: at };
}

// Mark a consent as having been read once. Mutates by returning a
// new object; caller persists. Used by the MFI fetch endpoint.
export function recordConsentRead(consent) {
  if (!consent) throw new Error('consent is required.');
  return { ...consent, readCount: (consent.readCount ?? 0) + 1 };
}
