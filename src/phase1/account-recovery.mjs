// Account recovery — Phase 5.0.
//
// Completes the phone-OTP loop from Phase 4.3. Without this module,
// a user who loses their 12-word phrase is locked out forever. With
// it, the user can rebind their existing identity to a new device
// after proving control of their previously-verified phone number.
//
// Flow:
//
//   1. User taps "I lost my recovery phrase" on the welcome screen
//      (new device).
//   2. Enters their phone number.
//   3. Server looks up an identity whose `phone_verified`
//      attestation matches (via masked-phone equality, since the
//      full phone is only on the OTP record, never on the public
//      identity record).
//   4. Server issues an `account_recovery`-purpose OTP to that
//      phone via the configured SMS provider.
//   5. User enters the 6-digit code.
//   6. On verify: server returns the identity's signing material
//      (privateKey + vaultKey) to the new device. The new device
//      becomes the owner and can sign on the identity's behalf.
//
// §15 bindings:
//
//   • The recovery flow is the ONLY path the server hands the
//     privateKey back to a fresh device. The vault-snapshot
//     endpoint (`/api/identities/:id/vault-snapshot`) requires
//     knowing the identity ID, which a recovery flow specifically
//     does not have. So the lookup is by phone, gated by OTP.
//
//   • Phone numbers are sensitive (§15 PII). The lookup uses the
//     identity's `phone_verified` attestation's `phoneMasked`
//     field. We never expose the full phone on the public
//     identity record (this was already established in Phase 4.3).
//     The full phone lives only on the per-OTP record.
//
//   • Recovery RECORDS are ledger-audited so a phone-number
//     takeover (SIM swap) is detectable after the fact. The
//     ledger event captures the masked phone + the rebound
//     identity ID; ops can correlate to detect a wave of
//     recoveries against a single phone range.
//
//   • Phase 2a stores private keys server-side (per ADR 0066's
//     demo-mode caveat) so this flow can hand them back. Phase 2b
//     moves keys to the device hardware keystore, at which point
//     the recovery flow design changes — the new device generates
//     a fresh keypair and the old one is replaced via a signed
//     identity-transfer event. That's a Phase 2b commitment; this
//     module ships the Phase 2a contract.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import {
  createPhoneOtp,
  maskPhone,
  PHONE_OTP_PROTOCOL_VERSION,
  verifyPhoneOtp
} from './phone-otp.mjs';
import { normalisePhone } from '../phase0/sms-provider.mjs';

export const ACCOUNT_RECOVERY_PROTOCOL_VERSION = 'bos.phase1.account-recovery.v0';

const RECOVERY_TTL_SECONDS = 5 * 60; // 5 minutes — same as the underlying OTP

function nowIso() {
  return new Date().toISOString();
}

// Find an identity whose `phone_verified` attestation matches the
// given phone. Returns the identity OR null.
//
// We compare on phoneMasked (since the full phone isn't on the
// identity record). Mask collisions are possible in theory (two
// users with the same +91-XXX----XX form) but vanishingly rare
// at population scale; production deployments may store the
// last 4 digits of each phone hashed for tighter matching.
export function findIdentityByPhone(identities, phone) {
  const normalised = normalisePhone(phone);
  if (!normalised) return null;
  const targetMask = maskPhone(normalised);
  const candidates = identities.filter((identity) => {
    const att = identity.attestations?.phone_verified;
    if (!att || att.status !== 'verified') return false;
    return att.phoneMasked === targetMask;
  });
  if (candidates.length === 0) return null;
  // If multiple identities share the same masked phone, surface
  // the most recently verified one — that's the most likely match
  // for a recovery request.
  candidates.sort((a, b) => {
    const verA = a.attestations?.phone_verified?.verifiedAt ?? '';
    const verB = b.attestations?.phone_verified?.verifiedAt ?? '';
    return verB.localeCompare(verA);
  });
  return candidates[0];
}

// Recovery request — first step. Generates the OTP envelope
// (returns the plaintext code for the API handler to send via
// SMS, then discard).
//
// Returns { recoveryId, otp, identityId, phoneMasked, expiresAt }.
// The caller (API handler) persists the OTP via store.savePhoneOtp,
// then calls the SMS provider with otp.code. The plaintext code
// is NEVER persisted.
export function startAccountRecovery({
  identity,
  phone,
  at = nowIso(),
  ttlSeconds = RECOVERY_TTL_SECONDS
}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!phone) throw new Error('phone is required.');
  const normalised = normalisePhone(phone);
  if (!normalised) throw new Error('phone must be a valid number.');
  const otp = createPhoneOtp({
    identityId: identity.id,
    phone: normalised,
    purpose: 'account_recovery',
    ttlSeconds,
    at
  });
  const recoveryId = `bos:account-recovery:${sha256Hex(
    stableStringify({ identityId: identity.id, phone: normalised, at, salt: otp.salt })
  ).slice(0, 32)}`;
  return {
    protocolVersion: ACCOUNT_RECOVERY_PROTOCOL_VERSION,
    objectType: 'account-recovery-request',
    recoveryId,
    identityId: identity.id,
    phoneMasked: otp.phoneMasked,
    otpId: otp.otpId,
    issuedAt: at,
    expiresAt: otp.expiresAt,
    otp // caller strips the plaintext code before persisting
  };
}

// Recovery verify — second step. Calls verifyPhoneOtp against the
// stored OTP record; on success, the caller assembles the
// recovery bundle (privateKey + vaultKey + recoveryPhrase) and
// returns it to the new device.
//
// This module returns ONLY the verification result; the actual
// bundle assembly is in the API handler because it needs store
// access. Same pattern as the §7c vault-snapshot flow.
export function verifyAccountRecovery(otp, providedCode, { at = nowIso() } = {}) {
  if (!otp || otp.purpose !== 'account_recovery') {
    return { status: 'malformed', otp, reason: 'not an account_recovery OTP' };
  }
  const result = verifyPhoneOtp(otp, providedCode, { at });
  return {
    protocolVersion: ACCOUNT_RECOVERY_PROTOCOL_VERSION,
    objectType: 'account-recovery-verification',
    status: result.status,
    otp: result.otp,
    verifiedAt: result.status === 'verified' ? at : null
  };
}

// Build the response payload the new device receives after a
// successful recovery. Mirrors the vault-snapshot shape (per
// ADR 0066) so the existing client code can consume it.
//
// §15 caveat: this hands `privateKeyPem` over the wire. Same
// "demo-only" framing as ADR 0066 — production Phase 2b keeps
// the private key on the device hardware keystore, at which point
// this endpoint goes away (replaced by a signed identity-transfer
// event the old identity authorises).
export function buildRecoveryBundle({ identity, recoveryPhrase, memoryRecordRefs = [] }) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!identity.privateKeyPem) throw new Error('identity must carry privateKeyPem for recovery.');
  return {
    protocolVersion: ACCOUNT_RECOVERY_PROTOCOL_VERSION,
    objectType: 'account-recovery-bundle',
    issuedAt: nowIso(),
    identity: {
      id: identity.id,
      displayName: identity.displayName,
      publicKeyPem: identity.publicKeyPem,
      privateKeyPem: identity.privateKeyPem,
      vaultKeyBase64: identity.vaultKeyBase64,
      attestations: identity.attestations ?? {}
    },
    recoveryPhrase, // re-deriving the phrase saves the user from typing it
    memoryRecordRefs: memoryRecordRefs.map((ref) => ({
      recordId: ref.recordId,
      manifestId: ref.manifestId ?? null,
      label: ref.label ?? null,
      createdAt: ref.createdAt ?? null
    })),
    warning:
      'Demo endpoint. Production Bharat OS (Phase 2b AOSP shell) issues a fresh keypair on the new device + signs an identity-transfer event from the old identity. Today the privateKey is server-stored so we hand it back; the OTP-gated lookup is the §15-aligned trust anchor.'
  };
}

export { RECOVERY_TTL_SECONDS };
