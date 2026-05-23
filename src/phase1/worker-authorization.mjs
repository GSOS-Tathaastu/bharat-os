// §9A worker authorization — a signed first-class artifact that proves the
// worker personally authorized a kiosk- or operator-mediated action. Replaces
// the opaque `workerAuthorizationId` string the L4 mediation policy accepted
// in Phase 1.38, where bad actors could forge any ID. The L4 policy now
// requires the full signed receipt and verifies it inline.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const WORKER_AUTHORIZATION_PROTOCOL_VERSION = 'bos.phase1.worker-auth.v0';

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateIso, days) {
  const next = new Date(dateIso);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function normalizeScopes(scopes) {
  return [...new Set((scopes ?? []).map((scope) => String(scope).trim()).filter(Boolean))].sort();
}

export function canonicalWorkerAuthorizationPayload(auth) {
  return {
    protocolVersion: auth.protocolVersion,
    objectType: auth.objectType,
    workerId: auth.workerId,
    operatorId: auth.operatorId,
    jobReference: auth.jobReference,
    scopes: auth.scopes,
    purpose: auth.purpose,
    issuedAt: auth.issuedAt,
    expiresAt: auth.expiresAt
  };
}

export function createWorkerAuthorization({
  workerId,
  operatorId,
  jobReference,
  scopes,
  purpose,
  ttlDays = 1,
  expiresAt,
  issuedAt = nowIso()
}) {
  if (!workerId) throw new Error('workerId is required.');
  if (!operatorId) throw new Error('operatorId is required.');
  if (!jobReference) throw new Error('jobReference is required.');
  if (!purpose) throw new Error('purpose is required.');
  const normalized = normalizeScopes(scopes);
  if (normalized.length === 0) throw new Error('at least one scope is required.');

  const core = {
    protocolVersion: WORKER_AUTHORIZATION_PROTOCOL_VERSION,
    objectType: 'worker-authorization',
    workerId,
    operatorId,
    jobReference,
    scopes: normalized,
    purpose,
    issuedAt,
    expiresAt: expiresAt ?? addDays(issuedAt, ttlDays)
  };

  return {
    authorizationId: idFrom('bos:worker-auth', core),
    status: 'unsigned',
    signatures: [],
    ...core
  };
}

export function signWorkerAuthorization(auth, signerIdentity, { at = nowIso() } = {}) {
  if (!signerIdentity?.id) throw new Error('signerIdentity is required.');
  if (signerIdentity.id !== auth.workerId) {
    throw new Error('Worker authorization must be signed by the worker identity itself.');
  }

  const payload = canonicalWorkerAuthorizationPayload(auth);
  const payloadText = stableStringify(payload);
  const signature = signText(signerIdentity, payloadText);
  const signatureRecord = {
    protocolVersion: WORKER_AUTHORIZATION_PROTOCOL_VERSION,
    role: 'worker',
    signerId: signerIdentity.id,
    signedAt: at,
    payloadHash: sha256Hex(payloadText),
    signature
  };

  return {
    ...auth,
    status: 'signed',
    signatures: [...(auth.signatures ?? []), signatureRecord]
  };
}

export function verifyWorkerAuthorization(auth, publicRecord, { at = nowIso() } = {}) {
  const reasons = [];
  if (!auth || auth.objectType !== 'worker-authorization') {
    return {
      artifactType: 'worker-authorization',
      valid: false,
      idValid: false,
      signatureValid: false,
      reasons: ['invalid or missing worker authorization object']
    };
  }

  const payload = canonicalWorkerAuthorizationPayload(auth);
  const payloadText = stableStringify(payload);
  const payloadHash = sha256Hex(payloadText);
  const expectedId = idFrom('bos:worker-auth', payload);
  const idValid = auth.authorizationId === expectedId;

  if (!idValid) reasons.push('authorization ID does not match canonical payload');

  const expiresAtMs = new Date(auth.expiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= new Date(at).getTime()) {
    reasons.push('worker authorization expired');
  }

  const workerSignature = (auth.signatures ?? []).find(
    (sig) => sig.role === 'worker' && sig.signerId === auth.workerId
  );

  let signatureValid = false;
  if (!workerSignature) {
    reasons.push('worker signature missing');
  } else if (workerSignature.payloadHash !== payloadHash) {
    reasons.push('worker signature payload hash mismatch');
  } else if (!publicRecord) {
    reasons.push('worker public record unavailable for signature verification');
  } else if (publicRecord.id !== auth.workerId) {
    reasons.push('worker public record does not match authorization workerId');
  } else {
    signatureValid = verifySignature(publicRecord, payloadText, workerSignature.signature);
    if (!signatureValid) reasons.push('worker signature does not verify');
  }

  return {
    artifactType: 'worker-authorization',
    valid: reasons.length === 0 && signatureValid,
    idValid,
    expectedId,
    actualId: auth.authorizationId,
    payloadHash,
    signatureValid,
    workerId: auth.workerId,
    operatorId: auth.operatorId,
    reasons
  };
}
