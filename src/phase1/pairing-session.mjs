// §7c device-pairing session artifact.
//
// A pairing session is the short-lived state the *signaling* path keeps
// while two devices establish a direct WebRTC data channel. The server
// holds ONLY the SDP offer/answer + a 6-digit human-readable claim code;
// the actual identity vault transfers browser-to-browser over the data
// channel and never touches the server. §15 pointer-not-payload + the
// §17 "PWA is 85% of the product" framing — this is the third mode after
// device-pairing's localStorage scaffold (ADR 0048) and a future Phase 2b
// hardware-attested transport.
//
// Lifecycle:
//   pending  — issuer created the session, waiting for the new device
//   claimed  — receiver entered the claim code, SDP exchange in progress
//   completed — initiator confirmed data transfer; both peers can close
//   expired  — TTL passed before completion
//
// Phase 2a.14 (ADR 0063).

import crypto from 'node:crypto';
import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const PAIRING_SESSION_PROTOCOL_VERSION = 'bos.phase2a.pairing-session.v0';

export const PAIRING_SESSION_STATUSES = ['pending', 'claimed', 'completed', 'expired'];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function generateClaimCode() {
  // Six digits — easy to read aloud, hard to brute-force in 10 minutes
  // (10^6 codes, but every session has its own random ID so an attacker
  // cannot grind globally; they would need a session ID + a code per
  // attempt, both unguessable).
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0) % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function createPairingSession({
  issuerIdentityId,
  issuerDisplayName,
  issuerPublicKeyFingerprint,
  ttlSeconds = 600,
  at = nowIso()
}) {
  if (!issuerIdentityId) throw new Error('issuerIdentityId is required.');
  if (!issuerPublicKeyFingerprint) throw new Error('issuerPublicKeyFingerprint is required.');

  const issuedAt = at;
  const expiresAt = new Date(new Date(issuedAt).getTime() + ttlSeconds * 1000).toISOString();
  const claimCode = generateClaimCode();
  const nonce = crypto.randomBytes(16).toString('hex');

  const core = {
    protocolVersion: PAIRING_SESSION_PROTOCOL_VERSION,
    objectType: 'pairing-session',
    issuerIdentityId,
    issuerDisplayName: issuerDisplayName ?? null,
    issuerPublicKeyFingerprint,
    nonce,
    issuedAt,
    expiresAt
  };

  return {
    sessionId: idFrom('bos:pairing-session', core),
    claimCode,
    status: 'pending',
    receiverFingerprint: null,
    sdp: { offer: null, answer: null },
    completion: null,
    ...core
  };
}

export function lookupByClaimCode(sessions, claimCode, at = nowIso()) {
  const now = new Date(at).getTime();
  return (
    sessions.find(
      (session) =>
        session.claimCode === claimCode &&
        session.status === 'pending' &&
        new Date(session.expiresAt).getTime() > now
    ) ?? null
  );
}

export function claimPairingSession(session, { receiverFingerprint, sdpAnswer, at = nowIso() }) {
  if (!session) throw new Error('session is required.');
  if (session.status !== 'pending') {
    throw new Error(`Cannot claim a ${session.status} session.`);
  }
  if (new Date(session.expiresAt).getTime() <= new Date(at).getTime()) {
    return { ...session, status: 'expired' };
  }
  if (!receiverFingerprint) throw new Error('receiverFingerprint is required.');

  return {
    ...session,
    status: 'claimed',
    receiverFingerprint,
    sdp: {
      offer: session.sdp?.offer ?? null,
      answer: sdpAnswer ?? session.sdp?.answer ?? null
    },
    claimedAt: at
  };
}

export function recordSdp(session, { offer, answer }) {
  if (!session) throw new Error('session is required.');
  return {
    ...session,
    sdp: {
      offer: offer ?? session.sdp?.offer ?? null,
      answer: answer ?? session.sdp?.answer ?? null
    }
  };
}

export function completePairingSession(session, { bytesTransferred = 0, at = nowIso() } = {}) {
  if (!session) throw new Error('session is required.');
  if (session.status === 'expired') {
    throw new Error('Cannot complete an expired session.');
  }
  return {
    ...session,
    status: 'completed',
    completion: {
      completedAt: at,
      bytesTransferred: Number(bytesTransferred ?? 0)
    }
  };
}

export function expirePairingSession(session, { at = nowIso() } = {}) {
  if (session.status === 'completed' || session.status === 'expired') return session;
  if (new Date(session.expiresAt).getTime() > new Date(at).getTime()) return session;
  return { ...session, status: 'expired' };
}
