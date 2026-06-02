// Phase 13.7.3 — Encrypted-prompt envelope substrate.
//
// The §15 verifiable-serve loop primitive. Citizen encrypts the
// prompt text to the worker's published P-256 ECDH public key
// before POSTing — the BE only ever sees the ciphertext. Worker
// fetches the envelope, decrypts client-side with their stored
// private key, runs the inference on the actual prompt, and
// posts back a response (separately).
//
// Why P-256 (not X25519)?
//   Web Crypto's `crypto.subtle` supports P-256 ECDH everywhere
//   modern. X25519 is still patchy across browsers (Safari +
//   older Chrome quirks). P-256 + HKDF + AES-GCM is the
//   conservative NIST suite that works without polyfills.
//
// Why a separate envelope (not the dispatch record)?
//   The dispatch record stays pointer-only (promptHash). The
//   ciphertext is a separate ephemeral artifact with its own
//   TTL — when the dispatch is served (or expires), the
//   envelope can be wiped.
//
// §15 bindings:
//   - The PLAINTEXT prompt never reaches the BE. The validator
//     hard-rejects any envelope field that could leak plaintext.
//   - Strict allowlist on top-level keys + FORBIDDEN_SUBSTRINGS
//     probe rejecting `prompt`, `text`, `plaintext`, etc.
//   - Content-derived `envelopeId` so a citizen can't post two
//     envelopes for the same dispatch (or rather, would collide).
//   - ms-stripped timestamps.
//   - DPDP §12 cascade: envelopes wipe alongside the dispatch
//     (both requester and worker sides). The encryption is
//     forward-secret via ephemeral pubkeys, so even if a
//     long-lived worker keypair leaks later, past prompts
//     remain unreadable.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION =
  'bos.phase13.compute-serving-encrypted-prompt.v1';

// Supported AEAD algorithm. v1 is AES-GCM-256; future bumps lock
// agility (X25519 + ChaCha20-Poly1305 when Web Crypto X25519 is
// universal).
export const COMPUTE_SERVING_ENCRYPTION_ALGORITHM = 'ecdh-p256+aes-256-gcm';

export const PERMITTED_ENCRYPTED_PROMPT_KEYS = Object.freeze([
  'envelopeId',
  'dispatchId',
  'requesterId',
  'workerId',
  'ciphertextBase64',
  'nonceBase64',
  'ephemeralPubKeyBase64',
  'algorithm',
  'protocolVersion',
  'createdAt',
  'expiresAt'
]);

// FORBIDDEN_SUBSTRINGS probe shared with capacity + dispatch
// entities. Even though the ciphertext is by definition not
// plaintext, the validator still rejects any key that could be
// confused with plaintext to prevent a misconfigured client
// from accidentally posting plaintext to the wrong field.
export const COMPUTE_SERVING_ENCRYPTED_PROMPT_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'prompt',           // any field named `prompt*` is plaintext leak
  'text',
  'completion',
  'response',
  'content',
  'plaintext',
  'rawBody',
  'snippet',
  'preview',
  'unmasked',
  'phoneNumber',
  'deviceId',
  'imei',
  'imsi'
]);

// Caps. v1: 8 KB ciphertext is enough for a ~4-6 KB prompt plus
// GCM overhead + base64 inflation. Bigger prompts need
// streaming, which is a v2 problem.
const MAX_CIPHERTEXT_LENGTH = 8 * 1024;
// AES-GCM nonce: 12 bytes → 16 base64 chars; we accept up to 32
// chars in case implementations pad.
const MAX_NONCE_LENGTH = 32;
// P-256 uncompressed point: 65 bytes → ~88 base64 chars; we
// accept up to 120 for safety with potential length prefixes.
const MAX_EPHEMERAL_PUBKEY_LENGTH = 120;
// TTL: ciphertext lifetime tied to the dispatch (15 minutes).
const ENVELOPE_TTL_MS = 15 * 60 * 1000;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// Strict base64: A-Z a-z 0-9 + / =. Reject base64url to avoid
// ambiguity; the FE helper emits canonical base64.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function nowIso() {
  return new Date().toISOString().replace(/\.\d{1,3}Z$/, 'Z');
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertBase64(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} must be a base64 string.`);
  if (value.length === 0 || value.length > max) {
    throw new Error(`${label} length must be in (0, ${max}].`);
  }
  if (!BASE64_RE.test(value)) {
    throw new Error(`${label} must match canonical base64 [A-Za-z0-9+/=].`);
  }
  return value;
}

function assertIsoInstant(value, label) {
  if (typeof value !== 'string' || !ISO_INSTANT_RE.test(value)) {
    throw new Error(`${label} must be an ISO-8601 UTC instant.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a calendar-valid ISO-8601 UTC instant.`);
  }
  return value.replace(/\.\d{1,3}Z$/, 'Z');
}

function envelopeIdFrom(payload) {
  return `bos:compute-serving-encrypted-prompt:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Validate + build an encrypted-prompt envelope. Citizens construct
 * the ciphertext client-side; this validator only checks the
 * envelope shape. The caller (API handler) is responsible for
 * validating the dispatch exists + is pending + the requester
 * matches.
 *
 * @param {object} input
 * @param {string} input.dispatchId
 * @param {string} input.requesterId
 * @param {string} input.workerId
 * @param {string} input.ciphertextBase64 — AES-GCM ciphertext (with auth tag)
 * @param {string} input.nonceBase64 — 12-byte AES-GCM nonce
 * @param {string} input.ephemeralPubKeyBase64 — P-256 ephemeral
 *   pubkey (uncompressed point, base64). Worker uses this + their
 *   long-lived private key to derive the shared AES-GCM key.
 */
export function buildComputeServingEncryptedPrompt(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('compute-serving-encrypted-prompt input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!PERMITTED_ENCRYPTED_PROMPT_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted compute-serving-encrypted-prompt field; envelope is ciphertext-only (plaintext never reaches the BE).`
      );
    }
  }
  const dispatchId = assertNonEmptyString(input.dispatchId, 'dispatchId', 200);
  const requesterId = assertNonEmptyString(input.requesterId, 'requesterId', 200);
  const workerId = assertNonEmptyString(input.workerId, 'workerId', 200);
  const ciphertextBase64 = assertBase64(input.ciphertextBase64, 'ciphertextBase64', MAX_CIPHERTEXT_LENGTH);
  const nonceBase64 = assertBase64(input.nonceBase64, 'nonceBase64', MAX_NONCE_LENGTH);
  const ephemeralPubKeyBase64 = assertBase64(
    input.ephemeralPubKeyBase64,
    'ephemeralPubKeyBase64',
    MAX_EPHEMERAL_PUBKEY_LENGTH
  );
  const createdAt = assertIsoInstant(input.createdAt ?? nowIso(), 'createdAt');
  const expiresAt = new Date(Date.parse(createdAt) + ENVELOPE_TTL_MS)
    .toISOString()
    .replace(/\.\d{1,3}Z$/, 'Z');

  const envelopeId = envelopeIdFrom({
    dispatchId,
    requesterId,
    workerId,
    ciphertextBase64,
    createdAt
  });
  if (input.envelopeId != null && input.envelopeId !== envelopeId) {
    throw new Error('envelopeId does not match content-derived hash.');
  }
  return {
    envelopeId,
    dispatchId,
    requesterId,
    workerId,
    ciphertextBase64,
    nonceBase64,
    ephemeralPubKeyBase64,
    algorithm: COMPUTE_SERVING_ENCRYPTION_ALGORITHM,
    protocolVersion: COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION,
    createdAt,
    expiresAt
  };
}

/**
 * Build the `compute_serving.encrypted_prompt_posted` audit-ledger
 * event payload. POINTER + count-only meta per §15. Records
 * envelopeId + dispatchId + ciphertextLength (count, not bytes).
 */
export function buildEncryptedPromptPostedLedgerEvent({ envelope, at }) {
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: 'compute_serving.encrypted_prompt_posted',
    envelopeId: envelope.envelopeId,
    dispatchId: envelope.dispatchId,
    requesterId: envelope.requesterId,
    workerId: envelope.workerId,
    algorithm: envelope.algorithm,
    ciphertextLength: envelope.ciphertextBase64.length,
    at: atNormalised
  };
}
