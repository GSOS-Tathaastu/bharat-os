import crypto from 'node:crypto';
import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const PROFILE_AUTH_PROTOCOL_VERSION = 'bos.phase2a.profile-auth.v0';

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(dateIso, seconds) {
  return new Date(new Date(dateIso).getTime() + seconds * 1000).toISOString();
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function challengeCore(challenge) {
  return {
    protocolVersion: challenge?.protocolVersion,
    objectType: challenge?.objectType,
    identityId: challenge?.identityId,
    ceremony: challenge?.ceremony,
    challengeHash: challenge?.challengeHash,
    issuedAt: challenge?.issuedAt,
    expiresAt: challenge?.expiresAt
  };
}

export function verifyProfileAuthChallengeEvidence(challenge) {
  const reasons = [];
  if (!challenge?.challengeId) reasons.push('challenge missing');
  if (challenge?.protocolVersion !== PROFILE_AUTH_PROTOCOL_VERSION) reasons.push('protocol version mismatch');
  if (challenge?.objectType !== 'profile-auth-challenge') reasons.push('challenge object type mismatch');
  if (!['register', 'verify'].includes(challenge?.ceremony)) reasons.push('challenge ceremony invalid');

  if (challenge?.challengeId) {
    const expectedId = idFrom('bos:profile-auth-challenge', challengeCore(challenge));
    if (expectedId !== challenge.challengeId) reasons.push('challenge evidence tampered');
  }

  return {
    artifactType: 'profile-auth-challenge-verification',
    valid: reasons.length === 0,
    challengeId: challenge?.challengeId,
    identityId: challenge?.identityId,
    ceremony: challenge?.ceremony,
    reasons
  };
}

export function createProfileAuthChallenge({
  identityId,
  ceremony = 'register',
  issuedAt = nowIso(),
  ttlSeconds = 300,
  challengeBytes
}) {
  if (!identityId) throw new Error('identityId is required.');
  if (!['register', 'verify'].includes(ceremony)) {
    throw new Error('ceremony must be register or verify.');
  }
  const challenge = challengeBytes ? Buffer.from(challengeBytes) : crypto.randomBytes(32);
  const core = {
    protocolVersion: PROFILE_AUTH_PROTOCOL_VERSION,
    objectType: 'profile-auth-challenge',
    identityId,
    ceremony,
    challengeHash: sha256Hex(challenge),
    issuedAt,
    expiresAt: addSeconds(issuedAt, ttlSeconds)
  };

  return {
    challengeId: idFrom('bos:profile-auth-challenge', core),
    challengeBase64Url: base64Url(challenge),
    ...core
  };
}

export function createProfileCredentialRecord({
  identityId,
  credentialId,
  challenge,
  publicKeyAlgorithm = 'ES256',
  transports = [],
  userVerified = false,
  createdAt = nowIso()
}) {
  if (!identityId) throw new Error('identityId is required.');
  if (!credentialId) throw new Error('credentialId is required.');
  if (!challenge?.challengeId) throw new Error('profile auth challenge is required.');
  if (!verifyProfileAuthChallengeEvidence(challenge).valid) throw new Error('profile auth challenge evidence is invalid.');
  if (challenge.identityId !== identityId) throw new Error('challenge identity mismatch.');
  if (challenge.ceremony !== 'register') throw new Error('registration challenge is required.');
  if (challenge.expiresAt && new Date(challenge.expiresAt).getTime() <= new Date(createdAt).getTime()) {
    throw new Error('registration challenge expired.');
  }

  const core = {
    protocolVersion: PROFILE_AUTH_PROTOCOL_VERSION,
    objectType: 'profile-auth-credential',
    identityId,
    credentialId,
    credentialIdHash: sha256Hex(credentialId),
    challengeId: challenge.challengeId,
    publicKeyAlgorithm,
    transports: [...new Set(transports.map(String))].sort(),
    userVerified: Boolean(userVerified),
    createdAt
  };

  return {
    profileCredentialId: idFrom('bos:profile-credential', core),
    ...core
  };
}

export function verifyProfileCredentialAssertion({ credential, credentialId, challenge, at = nowIso() }) {
  const reasons = [];
  if (!credential) reasons.push('credential missing');
  if (!challenge) reasons.push('challenge missing');
  const challengeEvidence = verifyProfileAuthChallengeEvidence(challenge);
  if (!challengeEvidence.valid) reasons.push(...challengeEvidence.reasons);
  if (credential && challenge && credential.identityId !== challenge.identityId) {
    reasons.push('credential identity mismatch');
  }
  if (challenge?.ceremony !== 'verify') reasons.push('verification challenge is required');
  if (credentialId && credential?.credentialId !== credentialId) reasons.push('credential id mismatch');
  if (challenge?.expiresAt && new Date(challenge.expiresAt).getTime() <= new Date(at).getTime()) {
    reasons.push('challenge expired');
  }

  return {
    artifactType: 'profile-auth-assertion',
    valid: reasons.length === 0,
    identityId: credential?.identityId ?? challenge?.identityId,
    credentialIdHash: credential?.credentialIdHash,
    challengeId: challenge?.challengeId,
    reasons
  };
}
