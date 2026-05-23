// §13A #7 Trust-as-a-service — attestation signing + verification.
//
// The `trust_passport_attestation` tool (tools.mjs) returns an
// unsigned envelope. This module signs it with the subject's Ed25519
// identity and exposes a server-side verification helper that the
// `/verify/` page calls. Same signature primitive as consents,
// worker authorizations, and federated gradient updates.
//
// §15 bindings preserved:
//
//   • The verifier never sees raw PII — only the band-and-boolean
//     `claims` array embedded in the signed envelope.
//   • Verification needs only the subject's *public* record. No
//     server-stored private key required for the verifier flow.
//   • Expiry is enforced inside `verifyTrustAttestation`; a valid
//     signature past `expiresAt` is reported as `expired` separately
//     from a bad-signature failure.

import { sha256Hex, signText, stableStringify, verifySignature } from '../phase0/core.mjs';

export const TRUST_ATTESTATION_PROTOCOL_VERSION = 'bos.phase1.trust-attestation.v0';

// Canonical payload — what the signature covers. Includes everything
// from the tool receipt that a verifier could trust, excludes
// transient fields like `revenueLine` framing.
function canonicalAttestationPayload(envelope) {
  return {
    protocolVersion: TRUST_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'trust-attestation',
    attestationId: envelope.attestationId,
    subjectId: envelope.subjectId,
    verifierName: envelope.verifierName,
    purpose: envelope.purpose,
    claims: envelope.claims,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    shareDays: envelope.shareDays
  };
}

export function signTrustAttestation(envelope, signerIdentity) {
  if (!signerIdentity?.id) throw new Error('signerIdentity is required.');
  if (signerIdentity.id !== envelope.subjectId) {
    throw new Error('attestation must be signed by its subject identity.');
  }
  const payload = canonicalAttestationPayload(envelope);
  const payloadText = stableStringify(payload);
  const payloadHash = sha256Hex(payloadText);
  const signature = signText(signerIdentity, payloadText);
  return {
    ...envelope,
    protocolVersion: TRUST_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'trust-attestation',
    payloadHash,
    signature
  };
}

// Returns one of: 'valid' | 'expired' | 'signature_invalid' |
// 'unknown_subject' | 'malformed', along with the canonical payload
// so callers can render the claims they verified (and only those).
export function verifyTrustAttestation(envelope, publicRecords, { at = new Date().toISOString() } = {}) {
  if (!envelope || envelope.objectType !== 'trust-attestation') {
    return { status: 'malformed', reason: 'not a trust attestation envelope', payload: null };
  }
  if (!envelope.signature) {
    return { status: 'malformed', reason: 'signature missing', payload: null };
  }
  const subject = publicRecords.find((record) => record.id === envelope.subjectId);
  if (!subject) {
    return { status: 'unknown_subject', reason: 'subject identity not in registry', payload: null };
  }
  const payload = canonicalAttestationPayload(envelope);
  const payloadText = stableStringify(payload);
  const signatureValid = verifySignature(subject, payloadText, envelope.signature);
  if (!signatureValid) {
    return { status: 'signature_invalid', reason: 'signature does not verify', payload };
  }
  const expiresAtMs = envelope.expiresAt ? Date.parse(envelope.expiresAt) : null;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= new Date(at).getTime()) {
    return { status: 'expired', reason: 'attestation expired', payload };
  }
  return {
    status: 'valid',
    reason: 'signature verified, not expired',
    payload,
    subject: {
      id: subject.id,
      displayName: subject.displayName,
      publicKeyFingerprint: sha256Hex(subject.publicKeyPem).slice(0, 24)
    }
  };
}
