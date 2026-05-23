import {
  publicIdentity,
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';
import { canonicalSkillPreflightPayload } from './skills.mjs';

export const INTEGRITY_PROTOCOL_VERSION = 'bos.phase1.integrity.v0';

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function pushReason(reasons, condition, message) {
  if (!condition) reasons.push(message);
}

export function canonicalConsentPayload(consent) {
  return {
    protocolVersion: consent.protocolVersion,
    objectType: consent.objectType,
    subjectId: consent.subjectId,
    granteeId: consent.granteeId,
    scopes: consent.scopes,
    purpose: consent.purpose,
    constraints: consent.constraints ?? {},
    issuedAt: consent.issuedAt,
    expiresAt: consent.expiresAt
  };
}

function legacyCanonicalConsentPayload(consent) {
  const payload = {
    ...canonicalConsentPayload(consent),
    status: consent.status
  };

  if (consent.revokedAt) payload.revokedAt = consent.revokedAt;
  if (consent.revokeReason) payload.revokeReason = consent.revokeReason;

  return payload;
}

export function canonicalRevocationPayload(revocation) {
  return {
    protocolVersion: revocation.protocolVersion,
    objectType: revocation.objectType,
    consentId: revocation.consentId,
    subjectId: revocation.subjectId,
    granteeId: revocation.granteeId,
    reason: revocation.reason,
    revokedAt: revocation.revokedAt,
    revokedBy: revocation.revokedBy
  };
}

export function verifyConsentIntegrity(consent) {
  const payload = canonicalConsentPayload(consent);
  const expectedConsentId = idFrom('bos:consent', payload);
  const legacyExpectedConsentId = idFrom('bos:consent', legacyCanonicalConsentPayload(consent));
  const reasons = [];
  const idValid = consent.consentId === expectedConsentId || consent.consentId === legacyExpectedConsentId;

  pushReason(reasons, consent.objectType === 'consent-artifact', 'invalid consent object type');
  pushReason(reasons, idValid, 'consent ID does not match canonical payload');

  return {
    artifactType: 'consent',
    valid: reasons.length === 0,
    idValid,
    actualId: consent.consentId,
    expectedId: expectedConsentId,
    legacyExpectedId: legacyExpectedConsentId,
    payloadHash: sha256Hex(stableStringify(payload)),
    reasons
  };
}

export function signConsent(consent, signerIdentity, { role = 'subject' } = {}) {
  const payload = canonicalConsentPayload(consent);
  const payloadText = stableStringify(payload);
  const signature = signText(signerIdentity, payloadText);
  const signatureRecord = {
    protocolVersion: INTEGRITY_PROTOCOL_VERSION,
    role,
    signerId: signerIdentity.id,
    signedAt: new Date().toISOString(),
    payloadHash: sha256Hex(payloadText),
    signature
  };

  return {
    ...consent,
    signatures: [...(consent.signatures ?? []), signatureRecord]
  };
}

export function verifyConsentSignature(consent, signerPublicRecord, { role } = {}) {
  const payloadCandidates = [
    canonicalConsentPayload(consent),
    legacyCanonicalConsentPayload(consent)
  ];
  if (consent.status === 'revoked') {
    payloadCandidates.push({
      ...canonicalConsentPayload(consent),
      status: 'active'
    });
  }
  const payloadTexts = payloadCandidates.map((payload) => stableStringify(payload));
  const payloadHashes = payloadTexts.map((payloadText) => sha256Hex(payloadText));
  const signatures = (consent.signatures ?? []).filter((signatureRecord) => {
    if (signatureRecord.signerId !== signerPublicRecord.id) return false;
    if (role && signatureRecord.role !== role) return false;
    return payloadHashes.includes(signatureRecord.payloadHash);
  });

  return signatures.some((signatureRecord) => {
    const payloadText = payloadTexts[payloadHashes.indexOf(signatureRecord.payloadHash)];
    return verifySignature(signerPublicRecord, payloadText, signatureRecord.signature);
  });
}

export function signConsentRevocation(consent, signerIdentity, { role = 'revoker' } = {}) {
  if (!consent.revocation) {
    throw new Error('consent revocation is required before signing revocation.');
  }

  const payload = canonicalRevocationPayload(consent.revocation);
  const payloadText = stableStringify(payload);
  const signature = signText(signerIdentity, payloadText);
  const signatureRecord = {
    protocolVersion: INTEGRITY_PROTOCOL_VERSION,
    role,
    signerId: signerIdentity.id,
    signedAt: new Date().toISOString(),
    payloadHash: sha256Hex(payloadText),
    signature
  };

  return {
    ...consent,
    revocation: {
      ...consent.revocation,
      signatures: [...(consent.revocation.signatures ?? []), signatureRecord]
    }
  };
}

export function verifyConsentRevocationIntegrity(consent, publicRecords = []) {
  if (consent.status !== 'revoked') {
    return {
      required: false,
      valid: true,
      idValid: true,
      signatureValid: undefined,
      signatures: [],
      reasons: []
    };
  }

  const reasons = [];
  if (!consent.revocation) {
    return {
      required: true,
      valid: false,
      idValid: false,
      signatureValid: false,
      signatures: [],
      reasons: ['missing consent revocation record']
    };
  }

  const payload = canonicalRevocationPayload(consent.revocation);
  const payloadText = stableStringify(payload);
  const payloadHash = sha256Hex(payloadText);
  const expectedRevocationId = idFrom('bos:consent-revocation', payload);
  const idValid = consent.revocation.revocationId === expectedRevocationId;
  pushReason(reasons, consent.revocation.objectType === 'consent-revocation', 'invalid consent revocation object type');
  pushReason(reasons, idValid, 'consent revocation ID does not match canonical payload');

  const signatures = (consent.revocation.signatures ?? []).map((signatureRecord) => {
    const publicRecord = publicRecords.find((candidate) => candidate.id === signatureRecord.signerId);
    return {
      signerId: signatureRecord.signerId,
      role: signatureRecord.role,
      verified:
        Boolean(publicRecord) &&
        signatureRecord.payloadHash === payloadHash &&
        verifySignature(publicRecord, payloadText, signatureRecord.signature),
      publicRecordAvailable: Boolean(publicRecord)
    };
  });
  const signatureValid = signatures.length > 0 && signatures.every((item) => item.verified);

  return {
    required: true,
    valid: reasons.length === 0 && (signatures.length === 0 || signatureValid),
    idValid,
    actualId: consent.revocation.revocationId,
    expectedId: expectedRevocationId,
    payloadHash,
    signatureValid,
    signatures,
    reasons
  };
}

function decisionCore(decision) {
  return {
    protocolVersion: decision.protocolVersion,
    objectType: decision.objectType,
    request: decision.request,
    approved: decision.approved,
    checks: decision.checks,
    plan: decision.plan,
    evaluatedAt: decision.evaluatedAt
  };
}

function toolExecutionCore(execution) {
  const core = {
    protocolVersion: execution.protocolVersion,
    objectType: execution.objectType,
    skillPreflightId: execution.skillPreflightId,
    status: execution.status,
    decisionId: execution.decisionId,
    decision: execution.decision,
    toolReceipt: execution.toolReceipt,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt
  };

  if (execution.error) core.error = execution.error;
  return core;
}

function orchestrationCore(orchestration) {
  return {
    protocolVersion: orchestration.protocolVersion,
    objectType: orchestration.objectType,
    intent: orchestration.intent,
    actionRequest: orchestration.actionRequest,
    consentRequirement: orchestration.consentRequirement,
    skillPreflightId: orchestration.skillPreflightId,
    approved: orchestration.approved,
    decisionId: orchestration.decisionId,
    executionId: orchestration.executionId,
    executed: orchestration.executed,
    status: orchestration.status,
    localizedResponse: orchestration.localizedResponse ?? null,
    plan: orchestration.plan,
    failedPolicies: orchestration.failedPolicies,
    createdAt: orchestration.createdAt
  };
}

export function canonicalReceiptPayload(receipt) {
  if (receipt.objectType === 'decision-evaluation') {
    return {
      artifactType: 'decision',
      idField: 'decisionId',
      prefix: 'bos:decision',
      payload: decisionCore(receipt)
    };
  }

  if (receipt.objectType === 'tool-execution') {
    return {
      artifactType: 'tool-execution',
      idField: 'executionId',
      prefix: 'bos:tool-exec',
      payload: toolExecutionCore(receipt)
    };
  }

  if (receipt.objectType === 'intent-orchestration') {
    return {
      artifactType: 'orchestration',
      idField: 'orchestrationId',
      prefix: 'bos:orchestration',
      payload: orchestrationCore(receipt)
    };
  }

  if (receipt.objectType === 'skill-preflight') {
    return {
      artifactType: 'skill-preflight',
      idField: 'preflightId',
      prefix: 'bos:skill-preflight',
      payload: canonicalSkillPreflightPayload(receipt)
    };
  }

  throw new Error(`Unsupported receipt object type: ${receipt.objectType}`);
}

export function verifyReceiptIntegrity(receipt) {
  const { artifactType, idField, prefix, payload } = canonicalReceiptPayload(receipt);
  const expectedId = idFrom(prefix, payload);
  const expectedAuditHash = sha256Hex(stableStringify(payload));
  const reasons = [];

  pushReason(reasons, receipt[idField] === expectedId, `${artifactType} ID does not match canonical payload`);
  pushReason(reasons, receipt.auditHash === expectedAuditHash, `${artifactType} audit hash does not match canonical payload`);

  return {
    artifactType,
    valid: reasons.length === 0,
    idValid: receipt[idField] === expectedId,
    auditHashValid: receipt.auditHash === expectedAuditHash,
    actualId: receipt[idField],
    expectedId,
    actualAuditHash: receipt.auditHash,
    expectedAuditHash,
    reasons
  };
}

export function verifyArtifactIntegrity(artifact, publicRecords = []) {
  if (artifact.objectType === 'consent-artifact') {
    const integrity = verifyConsentIntegrity(artifact);
    const revocation = verifyConsentRevocationIntegrity(artifact, publicRecords);
    const signatureResults = (artifact.signatures ?? []).map((signatureRecord) => {
      const publicRecord = publicRecords.find((candidate) => candidate.id === signatureRecord.signerId);
      return {
        signerId: signatureRecord.signerId,
        role: signatureRecord.role,
        verified: publicRecord ? verifyConsentSignature(artifact, publicRecord, { role: signatureRecord.role }) : false,
        publicRecordAvailable: Boolean(publicRecord)
      };
    });

    return {
      ...integrity,
      signatures: signatureResults,
      signatureValid: signatureResults.length > 0 && signatureResults.every((item) => item.verified),
      revocation,
      valid:
        integrity.valid &&
        revocation.valid &&
        (signatureResults.length === 0 || signatureResults.every((item) => item.verified))
    };
  }

  return verifyReceiptIntegrity(artifact);
}

export function publicRecordsFromIdentities(identities) {
  return identities.map((identity) => publicIdentity(identity));
}
