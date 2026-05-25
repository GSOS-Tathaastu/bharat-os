// Portable work-history attestation — Phase 5.9.
//
// Worker-initiated QR handshake. The worker just finished a job;
// they generate a token, display a QR, the customer scans it on
// their own phone (no Bharat OS install required), and signs at
// one of three tiers:
//
//   • Tier 0 — anonymous tap.       Volume-only; trust-neutral.
//   • Tier 1 — OTP-confirmed.       Real phone, moderate weight.
//   • Tier 2 — Bharat OS signed.    Customer's Ed25519 key, high weight.
//
// The token is the unsigned attestation envelope. It expires after
// 1 hour OR after the first successful sign — whichever comes
// first. Single-use, one-token-one-customer.
//
// §15 bindings:
//
//   • ADDITIVE-ONLY. There is no "rate negative" path. Workers
//     accumulate signed positive attestations; absence of signature
//     is not a negative signal. Portable negative reviews entrench
//     class bias and are explicitly out of scope.
//
//   • CUSTOMER PHONE NEVER ON THE WORKER'S RECORD. Tier 0 records
//     IP only (for sybil detection); Tier 1 records a HASH of the
//     phone (sufficient to detect re-use, insufficient to identify);
//     Tier 2 records the customer's identity ID (already public).
//
//   • BHARAT OS TAKES NO ACCOUNTABILITY for what the worker did.
//     The signing UI surfaces this explicitly. Liability stays with
//     the worker, the customer who signed, the platform that
//     dispatched, and the legal system.
//
//   • ANTI-FRAUD SIGNALS are surfaced server-side but applied
//     conservatively. Repeated same-phone signing is flagged, not
//     auto-rejected — the consuming aggregator decides what to do
//     with a flagged record.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const PORTABLE_ATTESTATION_PROTOCOL_VERSION =
  'bos.phase1.portable-attestation.v0';

export const ATTESTATION_CATEGORIES = Object.freeze([
  'delivery', // food / parcel delivery
  'ride',     // passenger ride
  'service',  // electrician, plumber, etc.
  'cash',     // generic cash gig
  'other'
]);

export const ATTESTATION_TIERS = Object.freeze({
  ANONYMOUS_TAP: 0,
  OTP_CONFIRMED: 1,
  BHARAT_OS_SIGNED: 2
});

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function nowIso() {
  return new Date().toISOString();
}

function deriveTokenId({ workerId, category, at, nonce }) {
  const fingerprint = sha256Hex(
    stableStringify({ workerId, category, at, nonce })
  );
  return `bos:portable-attestation:${fingerprint.slice(0, 32)}`;
}

// ─── Token initialisation ─────────────────────────────────────────────

// Worker just delivered. They tap "Get a signed receipt" and Bharat
// OS calls this to produce the unsigned envelope. The QR encodes
// only `tokenId` — everything else lives server-side. The customer's
// phone is NOT in the QR (customer fills it in if they sign at
// Tier 1).
export function createPortableAttestationToken({
  workerId,
  category,
  workerGps = null,
  nonce,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
  at = nowIso()
} = {}) {
  if (!workerId || typeof workerId !== 'string') {
    throw new Error('workerId is required.');
  }
  if (!ATTESTATION_CATEGORIES.includes(category)) {
    throw new Error(
      `category must be one of: ${ATTESTATION_CATEGORIES.join(', ')}`
    );
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 24 * 60 * 60) {
    throw new Error('ttlSeconds must be a positive number <= 86400 (24h).');
  }
  if (!nonce) {
    // Caller didn't supply one — generate. Deterministic-from-timing
    // is fine here; tokens are single-use + expire.
    nonce = sha256Hex(`${workerId}|${at}|${Math.random()}`).slice(0, 16);
  }
  const tokenId = deriveTokenId({ workerId, category, at, nonce });
  const expiresAtMs = Date.parse(at) + ttlSeconds * 1000;
  return {
    protocolVersion: PORTABLE_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'portable-attestation-token',
    tokenId,
    workerId,
    category,
    workerGps:
      workerGps && typeof workerGps === 'object'
        ? {
            // Only persist lat/lng with 2-decimal precision (~1.1km
            // resolution) for anti-fraud GPS-clustering checks. We
            // never persist sharper-than-neighbourhood precision.
            lat: Number.isFinite(workerGps.lat) ? Number(workerGps.lat.toFixed(2)) : null,
            lng: Number.isFinite(workerGps.lng) ? Number(workerGps.lng.toFixed(2)) : null
          }
        : null,
    status: 'pending',
    tier: null,
    signerData: null,
    signature: null,
    issuedAt: at,
    expiresAt: new Date(expiresAtMs).toISOString(),
    signedAt: null
  };
}

// ─── Tier 0 — anonymous tap ──────────────────────────────────────────

export function signTier0(token, { clientIp, at = nowIso() } = {}) {
  if (!token || token.objectType !== 'portable-attestation-token') {
    throw new Error('token must be a portable-attestation-token.');
  }
  if (token.status === 'signed') {
    throw new Error('token already signed.');
  }
  if (token.expiresAt && at >= token.expiresAt) {
    throw new Error('token expired.');
  }
  // Hash the IP so the worker's record carries a soft-sybil key
  // without the actual IP. Different scanners produce different
  // hashes; one scanner signing 10× shows up as 10× the same hash.
  const ipHash = clientIp ? sha256Hex(`portable-attestation|${clientIp}`).slice(0, 24) : null;
  return {
    ...token,
    status: 'signed',
    tier: ATTESTATION_TIERS.ANONYMOUS_TAP,
    signerData: { ipHash },
    signedAt: at
  };
}

// ─── Tier 1 — OTP-confirmed ──────────────────────────────────────────

// Caller has already verified the OTP via the Phase 4.3 phone-otp
// module. We never see the plaintext phone here — caller passes the
// already-normalised number, and we hash it before storage.
export function signTier1(token, { customerPhone, at = nowIso() } = {}) {
  if (!token || token.objectType !== 'portable-attestation-token') {
    throw new Error('token must be a portable-attestation-token.');
  }
  if (token.status === 'signed') {
    throw new Error('token already signed.');
  }
  if (token.expiresAt && at >= token.expiresAt) {
    throw new Error('token expired.');
  }
  if (!customerPhone || typeof customerPhone !== 'string') {
    throw new Error('customerPhone is required for Tier 1.');
  }
  // SHA-256 of the phone — stable across the worker's record so
  // repeated signing from the same customer is detectable, but the
  // phone itself never lands on disk.
  const phoneHash = sha256Hex(`portable-attestation-tier1|${customerPhone}`).slice(0, 24);
  return {
    ...token,
    status: 'signed',
    tier: ATTESTATION_TIERS.OTP_CONFIRMED,
    signerData: { phoneHash },
    signedAt: at
  };
}

// ─── Tier 2 — Bharat OS signed ───────────────────────────────────────

// Customer signs with their own Ed25519 identity. The payload signed
// is the canonical token (worker / category / timestamp / nonce);
// signature verification needs the customer's public record.

function canonicalSignedPayload(token) {
  return {
    protocolVersion: PORTABLE_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'portable-attestation-tier2-payload',
    tokenId: token.tokenId,
    workerId: token.workerId,
    category: token.category,
    issuedAt: token.issuedAt
  };
}

export function buildTier2SignaturePayload(token) {
  return stableStringify(canonicalSignedPayload(token));
}

export function signTier2(token, customerIdentity, { at = nowIso() } = {}) {
  if (!token || token.objectType !== 'portable-attestation-token') {
    throw new Error('token must be a portable-attestation-token.');
  }
  if (token.status === 'signed') {
    throw new Error('token already signed.');
  }
  if (token.expiresAt && at >= token.expiresAt) {
    throw new Error('token expired.');
  }
  if (!customerIdentity?.id) {
    throw new Error('customerIdentity is required for Tier 2.');
  }
  if (customerIdentity.id === token.workerId) {
    throw new Error('customer cannot sign their own work record.');
  }
  const payloadText = buildTier2SignaturePayload(token);
  const signature = signText(customerIdentity, payloadText);
  return {
    ...token,
    status: 'signed',
    tier: ATTESTATION_TIERS.BHARAT_OS_SIGNED,
    signerData: {
      customerId: customerIdentity.id,
      payloadHash: sha256Hex(payloadText)
    },
    signature,
    signedAt: at
  };
}

// Verify a Tier 2 signature against the customer's public record.
// Used by consuming aggregators / Trust Passport renderers.
export function verifyTier2(attestation, customerPublicRecord) {
  if (!attestation || attestation.tier !== ATTESTATION_TIERS.BHARAT_OS_SIGNED) {
    return { ok: false, reason: 'not a tier-2 attestation' };
  }
  if (!customerPublicRecord || customerPublicRecord.id !== attestation.signerData?.customerId) {
    return { ok: false, reason: 'customer public record does not match signerData' };
  }
  const payloadText = buildTier2SignaturePayload(attestation);
  const valid = verifySignature(customerPublicRecord, payloadText, attestation.signature);
  return { ok: valid, reason: valid ? 'signature verified' : 'signature does not verify' };
}

// ─── Aggregation for Trust Passport rendering ────────────────────────

// Returns a versioned summary of a worker's portable-attestation
// record. ADDITIVE-ONLY by design: there is no negative tier.
//
//   {
//     workerId, category,
//     totalAttestations,
//     byTier: { 0: count, 1: count, 2: count },
//     mostRecentAt,
//     fraudSignals: {
//       repeatedPhoneShare,  // share of T1 attestations from same hash
//       repeatedIpShare,     // share of T0 attestations from same hash
//       tier0DominanceShare  // T0 / total — > 0.95 is a quality flag
//     }
//   }
export function aggregateAttestationsForWorker(
  attestations,
  { workerId, category } = {}
) {
  const scoped = (attestations ?? []).filter((a) => {
    if (!a || a.status !== 'signed') return false;
    if (workerId && a.workerId !== workerId) return false;
    if (category && a.category !== category) return false;
    return true;
  });
  const byTier = { 0: 0, 1: 0, 2: 0 };
  let mostRecentAt = null;
  const ipCounts = new Map();
  const phoneCounts = new Map();
  for (const a of scoped) {
    if (a.tier in byTier) byTier[a.tier] += 1;
    if (!mostRecentAt || (a.signedAt && a.signedAt > mostRecentAt)) {
      mostRecentAt = a.signedAt ?? mostRecentAt;
    }
    if (a.tier === 0 && a.signerData?.ipHash) {
      ipCounts.set(a.signerData.ipHash, (ipCounts.get(a.signerData.ipHash) ?? 0) + 1);
    }
    if (a.tier === 1 && a.signerData?.phoneHash) {
      phoneCounts.set(
        a.signerData.phoneHash,
        (phoneCounts.get(a.signerData.phoneHash) ?? 0) + 1
      );
    }
  }
  const total = scoped.length;
  const repeatedIpShare = computeRepeatShare(ipCounts, byTier[0]);
  const repeatedPhoneShare = computeRepeatShare(phoneCounts, byTier[1]);
  const tier0DominanceShare = total > 0 ? Number((byTier[0] / total).toFixed(3)) : 0;
  return {
    protocolVersion: PORTABLE_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'portable-attestation-summary',
    workerId: workerId ?? null,
    category: category ?? null,
    totalAttestations: total,
    byTier,
    mostRecentAt,
    fraudSignals: {
      repeatedPhoneShare,
      repeatedIpShare,
      tier0DominanceShare
    }
  };
}

// `repeatShare` answers: "what fraction of the records of this tier
// come from a signer who has signed more than once?" High repeat
// share = collusion signal. A worker with 50 Tier-1 attestations
// from 50 unique phones has repeatShare = 0; one with 50 from
// 5 phones has repeatShare = 1.0.
function computeRepeatShare(countsMap, totalAtTier) {
  if (totalAtTier === 0) return 0;
  let repeatedSignerCount = 0;
  for (const count of countsMap.values()) {
    if (count > 1) repeatedSignerCount += count;
  }
  return Number((repeatedSignerCount / totalAtTier).toFixed(3));
}
