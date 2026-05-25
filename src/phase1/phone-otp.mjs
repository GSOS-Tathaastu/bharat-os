// Phone-OTP artifact — Phase 4.3.
//
// Generates 6-digit OTPs for phone verification + recovery.
// Hashes the OTP before storage so a stolen database doesn't
// expose live codes (the on-the-wire code is what the user types;
// storage holds only its SHA-256 hash with a per-record salt).
//
// Lifecycle:
//   created → sent (immediately, by the API handler that calls
//     sendSms after createPhoneOtp) → verified | expired | spent
//
// Constraints:
//   • 5-minute TTL (configurable)
//   • Max 5 verification attempts before the OTP is invalidated
//   • One active OTP per (identityId, phone) pair — re-issuing
//     replaces the prior one (the prior is marked 'replaced')
//
// §15 bindings:
//   • Phone numbers are stored alongside the OTP record but are
//     treated as PII. The L4 ledger logs only `phoneMasked`.
//   • OTPs themselves never appear in the L4 ledger.
//   • The hash uses a per-OTP salt so two contemporaneous OTPs
//     with the same plaintext code don't have the same hash.

import crypto from 'node:crypto';
import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const PHONE_OTP_PROTOCOL_VERSION = 'bos.phase1.phone-otp.v0';

export const PHONE_OTP_TTL_SECONDS = 5 * 60; // 5 minutes
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_OTP_PURPOSES = [
  'phone_verify',       // attach a phone to an identity
  'account_recovery',   // recover after phrase loss
  'sensitive_action'    // step-up auth for a regulated action
];

function maskPhone(phone) {
  return String(phone ?? '').replace(/(?<=^\+\d{3})\d+(?=\d{2}$)/, '****');
}

function generateOtpCode() {
  // Cryptographically random 6-digit code. Bias-free integer in
  // [0, 1_000_000) — reject-and-resample any reads that fall in
  // the top of the range that would skew modulo.
  while (true) {
    const buf = crypto.randomBytes(4);
    const value = buf.readUInt32BE(0);
    // 2^32 = 4,294,967,296. Largest multiple of 1_000_000 ≤ 2^32
    // is 4,294,000,000. Reads above that are biased; discard.
    if (value >= 4_294_000_000) continue;
    return String(value % 1_000_000).padStart(6, '0');
  }
}

function hashOtp(code, salt) {
  return sha256Hex(stableStringify({ code: String(code), salt }));
}

export function createPhoneOtp({
  identityId,
  phone,
  purpose = 'phone_verify',
  ttlSeconds = PHONE_OTP_TTL_SECONDS,
  at = new Date().toISOString()
} = {}) {
  if (!identityId) throw new Error('identityId is required.');
  if (!phone) throw new Error('phone is required.');
  if (!PHONE_OTP_PURPOSES.includes(purpose)) {
    throw new Error(
      `purpose must be one of: ${PHONE_OTP_PURPOSES.join(', ')}`
    );
  }
  const code = generateOtpCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashOtp(code, salt);
  const expiresAtMs = new Date(at).getTime() + ttlSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const core = {
    protocolVersion: PHONE_OTP_PROTOCOL_VERSION,
    objectType: 'phone-otp',
    identityId,
    phone,
    phoneMasked: maskPhone(phone),
    purpose,
    codeHash,
    salt,
    status: 'sent',
    attempts: 0,
    maxAttempts: PHONE_OTP_MAX_ATTEMPTS,
    issuedAt: at,
    expiresAt,
    verifiedAt: null,
    replacedAt: null
  };
  return {
    otpId: `bos:phone-otp:${sha256Hex(stableStringify({ identityId, phone, purpose, issuedAt: at, salt })).slice(0, 32)}`,
    ...core,
    // The plaintext `code` is returned for the API handler to pass
    // to `sendSms`. It is NEVER persisted — the caller hands it to
    // the provider and discards it.
    code
  };
}

// Returns `{ status, otp }` where `status` is one of:
//   'verified'       — code matched, OTP marked verified
//   'mismatch'       — code wrong; attempts incremented
//   'expired'        — past expiresAt
//   'spent'          — already verified or replaced
//   'too_many_attempts' — attempts >= maxAttempts
//   'malformed'      — input doesn't match a valid OTP shape
export function verifyPhoneOtp(otp, providedCode, { at = new Date().toISOString() } = {}) {
  if (!otp || otp.objectType !== 'phone-otp') {
    return { status: 'malformed', otp };
  }
  if (otp.status === 'verified' || otp.status === 'replaced') {
    return { status: 'spent', otp };
  }
  if (Date.parse(otp.expiresAt) <= Date.parse(at)) {
    return {
      status: 'expired',
      otp: { ...otp, status: 'expired' }
    };
  }
  if (otp.attempts >= otp.maxAttempts) {
    return {
      status: 'too_many_attempts',
      otp: { ...otp, status: 'too_many_attempts' }
    };
  }
  const provided = String(providedCode ?? '').trim();
  const providedHash = hashOtp(provided, otp.salt);
  // Use constant-time comparison to defeat timing attacks.
  const a = Buffer.from(providedHash);
  const b = Buffer.from(otp.codeHash);
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!matches) {
    const next = { ...otp, attempts: otp.attempts + 1 };
    if (next.attempts >= next.maxAttempts) {
      next.status = 'too_many_attempts';
    }
    return { status: 'mismatch', otp: next };
  }
  return {
    status: 'verified',
    otp: { ...otp, status: 'verified', verifiedAt: at }
  };
}

export { maskPhone, generateOtpCode };
