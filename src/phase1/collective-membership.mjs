// Worker-collective membership attestations — Phase 6.2.
//
// SEWA (~2.5M members), IFAT (~25K app-based drivers), the
// National Domestic Workers Federation, state construction-worker
// boards — these collectives have hundreds of thousands to
// millions of members AND existing trust relationships. A single
// partnership with an affiliating org gets bulk Bharat OS
// onboarding. ADR 0096's Phase 6.2 plan: "Worker collective
// distribution."
//
// The substrate any collective can use:
//
//   1. The collective is itself a Bharat OS identity (created via
//      the normal `createIdentity` flow). Its Ed25519 key signs
//      member attestations.
//
//   2. `createMembershipAttestation` produces a signed envelope
//      saying "this collective vouches that this worker is a
//      verified member, in this region, since this date."
//
//   3. The signed attestation lives on the worker's record. A
//      consuming surface (MFI, aggregator, government scheme)
//      verifies via the collective's public key.
//
//   4. A separate "blessed-collectives" registry (admin-gated)
//      lists which collectives are trust-worthy by default. ANY
//      identity can sign membership attestations; only blessed
//      ones surface in default-trust consuming flows. The
//      protocol (signing) is separate from the trust policy
//      (whom to trust).
//
// §15 bindings:
//
//   • Worker explicitly accepts membership — collective can't
//     silently affiliate a worker. The attestation envelope
//     must be presented + acknowledged before being persisted
//     to the worker's record.
//
//   • Region is at the city/district level, never an exact
//     address. Same precision bound as Phase 5.9 portable-
//     attestation GPS (~1km).
//
//   • Revocation surface — collectives can revoke memberships
//     (e.g. worker left the union). Revocation is signed +
//     audited.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const COLLECTIVE_MEMBERSHIP_PROTOCOL_VERSION =
  'bos.phase1.collective-membership.v0';

export const MEMBER_ROLES = Object.freeze([
  'driver',           // gig drivers, taxi, truck
  'delivery',         // food / parcel delivery riders
  'domestic_worker',  // maids, cooks, caretakers
  'construction',     // building / site labour
  'service',          // electrician, plumber, etc.
  'farm',             // agricultural labour
  'general'           // catch-all
]);

const DEFAULT_MEMBERSHIP_TTL_DAYS = 365;
const MIN_TTL_DAYS = 30;
const MAX_TTL_DAYS = 5 * 365; // 5 years

function nowIso() {
  return new Date().toISOString();
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ─── Membership attestation issuance ─────────────────────────────────

export function createMembershipAttestation({
  collective,
  memberId,
  collectiveName,
  memberRole = 'general',
  region = null,
  joinedAt = null,
  ttlDays = DEFAULT_MEMBERSHIP_TTL_DAYS,
  at = nowIso()
} = {}) {
  if (!collective?.id) throw new Error('collective identity is required.');
  if (!memberId || typeof memberId !== 'string') {
    throw new Error('memberId is required.');
  }
  if (memberId === collective.id) {
    throw new Error('collective cannot issue a membership to itself.');
  }
  if (!collectiveName || typeof collectiveName !== 'string') {
    throw new Error('collectiveName is required.');
  }
  if (collectiveName.length > 120) {
    throw new Error('collectiveName must be <= 120 chars.');
  }
  if (!MEMBER_ROLES.includes(memberRole)) {
    throw new Error(`memberRole must be one of: ${MEMBER_ROLES.join(', ')}`);
  }
  if (region !== null && region !== undefined) {
    if (typeof region !== 'string' || region.length > 80) {
      throw new Error('region must be a string <= 80 chars (city / district).');
    }
    region = region.trim().slice(0, 80);
    if (!region) region = null;
  }
  if (joinedAt !== null && joinedAt !== undefined) {
    if (!isValidIsoDate(joinedAt)) {
      throw new Error('joinedAt must be YYYY-MM-DD.');
    }
  }
  if (
    !Number.isFinite(ttlDays) ||
    ttlDays < MIN_TTL_DAYS ||
    ttlDays > MAX_TTL_DAYS
  ) {
    throw new Error(`ttlDays must be between ${MIN_TTL_DAYS} and ${MAX_TTL_DAYS}.`);
  }

  const expiresAt = new Date(
    Date.parse(at) + ttlDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const core = {
    protocolVersion: COLLECTIVE_MEMBERSHIP_PROTOCOL_VERSION,
    objectType: 'collective-membership-attestation',
    collectiveId: collective.id,
    collectiveName: collectiveName.trim().slice(0, 120),
    memberId,
    memberRole,
    region,
    joinedAt: joinedAt ?? null,
    issuedAt: at,
    expiresAt,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  };
  const membershipId = `bos:collective-membership:${sha256Hex(
    stableStringify(core)
  ).slice(0, 32)}`;
  const payloadText = stableStringify({ ...core, membershipId });
  const signature = signText(collective, payloadText);
  return {
    ...core,
    membershipId,
    signature
  };
}

// Verify the collective's signature + freshness. Returns a status
// enum: 'valid' | 'expired' | 'revoked' | 'signature_invalid' |
// 'unknown_collective' | 'malformed'.
export function verifyMembershipAttestation(
  attestation,
  collectivePublicRecord,
  { at = nowIso() } = {}
) {
  if (!attestation || attestation.objectType !== 'collective-membership-attestation') {
    return { ok: false, status: 'malformed' };
  }
  if (!attestation.signature) return { ok: false, status: 'malformed' };
  if (
    !collectivePublicRecord ||
    collectivePublicRecord.id !== attestation.collectiveId
  ) {
    return { ok: false, status: 'unknown_collective' };
  }
  if (attestation.status === 'revoked' || attestation.revokedAt) {
    return { ok: false, status: 'revoked' };
  }
  if (attestation.expiresAt && at >= attestation.expiresAt) {
    return { ok: false, status: 'expired' };
  }
  const {
    signature,
    status: _s,
    revokedAt: _r,
    revokedReason: _rr,
    ...canonical
  } = attestation;
  const payloadText = stableStringify({
    ...canonical,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  });
  const valid = verifySignature(collectivePublicRecord, payloadText, signature);
  return valid
    ? { ok: true, status: 'valid' }
    : { ok: false, status: 'signature_invalid' };
}

// Revoke a previously-issued membership. Pure — caller persists.
export function revokeMembershipAttestation(
  attestation,
  { reason, at = nowIso() } = {}
) {
  if (
    !attestation ||
    attestation.objectType !== 'collective-membership-attestation'
  ) {
    throw new Error('attestation must be a collective-membership-attestation.');
  }
  if (!reason || typeof reason !== 'string' || reason.length < 4) {
    throw new Error('reason is required (>= 4 chars) for revocation.');
  }
  return {
    ...attestation,
    status: 'revoked',
    revokedAt: at,
    revokedReason: reason.slice(0, 240)
  };
}

// ─── Blessed-collectives registry ────────────────────────────────────
//
// A simple admin-gated trust list. Consuming surfaces (MFI bundle,
// aggregator integrations, government scheme verifiers) use this to
// decide whose membership attestations to treat as authoritative.
//
// We do NOT enforce blessing at the issuance layer — anyone can
// sign a membership attestation. We DO surface "is this collective
// blessed?" as a credibility signal in downstream bundles.

export function createBlessedCollectiveRecord({
  collectiveId,
  collectiveName,
  blessedBy,
  notes = null,
  at = nowIso()
} = {}) {
  if (!collectiveId || typeof collectiveId !== 'string') {
    throw new Error('collectiveId is required.');
  }
  if (!collectiveName || typeof collectiveName !== 'string') {
    throw new Error('collectiveName is required.');
  }
  if (collectiveName.length > 120) {
    throw new Error('collectiveName must be <= 120 chars.');
  }
  if (!blessedBy || typeof blessedBy !== 'string') {
    throw new Error('blessedBy is required.');
  }
  if (notes !== null && notes !== undefined) {
    if (typeof notes !== 'string') {
      throw new Error('notes must be a string when provided.');
    }
    notes = notes.trim().slice(0, 400);
    if (!notes) notes = null;
  }
  return {
    protocolVersion: COLLECTIVE_MEMBERSHIP_PROTOCOL_VERSION,
    objectType: 'blessed-collective',
    collectiveId,
    collectiveName: collectiveName.trim().slice(0, 120),
    blessedAt: at,
    blessedBy: blessedBy.slice(0, 80),
    notes
  };
}

// Given a list of memberships and the blessed registry, return the
// subset that are (a) signed by a blessed collective AND (b)
// currently valid (active + not expired). The consuming surface
// (MFI bundle, etc.) uses this to display "verified collective
// affiliations" without trusting random self-attestations.
export function filterBlessedMemberships(
  memberships,
  blessedRegistry,
  { at = nowIso() } = {}
) {
  const blessedSet = new Set(
    (blessedRegistry ?? []).map((b) => b.collectiveId)
  );
  return (memberships ?? []).filter((m) => {
    if (!blessedSet.has(m.collectiveId)) return false;
    if (m.status !== 'active') return false;
    if (m.revokedAt) return false;
    if (m.expiresAt && at >= m.expiresAt) return false;
    return true;
  });
}
