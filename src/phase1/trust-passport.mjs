import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';
import { consentLifecycle } from './policy.mjs';
import { verifyArtifactIntegrity } from './integrity.mjs';

export const TRUST_PASSPORT_PROTOCOL_VERSION = 'bos.phase1.trust-passport.v0';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort();
}

function attestationRows(identity) {
  return Object.entries(identity.attestations ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, value]) => ({
      type,
      status: value?.status ?? (value?.verified ? 'verified' : 'present'),
      issuer: value?.issuer ?? value?.provider ?? 'local',
      issuedAt: value?.issuedAt,
      expiresAt: value?.expiresAt
    }));
}

function consentRowsFor(identity, consents) {
  return consents.filter((consent) => consent.subjectId === identity.id);
}

function memoryRowsFor(identity, memoryRecords) {
  return memoryRecords.filter((record) => record.ownerId === identity.id);
}

function skillPreflightRowsFor(identity, skillPreflights) {
  return skillPreflights.filter((preflight) => preflight.decision?.request?.actorId === identity.id);
}

function toolExecutionRowsFor(identity, toolExecutions, subjectPreflights) {
  const subjectPreflightIds = new Set(subjectPreflights.map((preflight) => preflight.preflightId));
  return toolExecutions.filter(
    (execution) =>
      execution.decision?.request?.actorId === identity.id ||
      subjectPreflightIds.has(execution.skillPreflightId)
  );
}

function ledgerRowsFor(identity, ledgerEvents) {
  return ledgerEvents.filter((event) =>
    [
      event.identityId,
      event.subjectId,
      event.ownerId,
      event.actorId,
      event.operatorId
    ].includes(identity.id)
  );
}

function latestIso(values) {
  return values
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))
    .at(0);
}

function assuranceLevel({ attestationCount, verifiedConsentCount, activeConsentCount, memoryRecordCount }) {
  if (attestationCount > 0 && verifiedConsentCount > 0 && activeConsentCount > 0) return 'verified';
  if (verifiedConsentCount > 0 || activeConsentCount > 0 || memoryRecordCount > 0) return 'active';
  return 'basic';
}

export function createTrustPassport(
  identity,
  {
    consents = [],
    memoryRecords = [],
    skillPreflights = [],
    toolExecutions = [],
    ledgerEvents = [],
    publicRecords = [],
    generatedAt = new Date().toISOString()
  } = {}
) {
  const attestationEvidence = attestationRows(identity);
  const subjectConsents = consentRowsFor(identity, consents);
  const subjectMemory = memoryRowsFor(identity, memoryRecords);
  const subjectPreflights = skillPreflightRowsFor(identity, skillPreflights);
  const subjectToolExecutions = toolExecutionRowsFor(identity, toolExecutions, subjectPreflights);
  const subjectLedger = ledgerRowsFor(identity, ledgerEvents);
  const consentIntegrity = subjectConsents.map((consent) => verifyArtifactIntegrity(consent, publicRecords));
  const lifecycleRows = subjectConsents.map((consent) => consentLifecycle(consent));
  const activeConsentCount = lifecycleRows.filter((lifecycle) => lifecycle.status === 'active').length;
  const revokedConsentCount = lifecycleRows.filter((lifecycle) => lifecycle.status === 'revoked').length;
  const expiredConsentCount = lifecycleRows.filter((lifecycle) => lifecycle.status === 'expired').length;
  const signedConsentCount = subjectConsents.filter((consent) => (consent.signatures ?? []).length > 0).length;
  const verifiedConsentCount = consentIntegrity.filter((result) => result.valid).length;
  const revocationReceiptCount = subjectConsents.filter((consent) => (consent.revocation?.signatures ?? []).length > 0).length;
  const activeScopes = uniqueSorted(
    subjectConsents
      .filter((consent, index) => lifecycleRows[index]?.active)
      .flatMap((consent) => consent.scopes ?? [])
  );
  const evidenceHash = sha256Hex(
    stableStringify({
      subjectId: identity.id,
      attestationTypes: attestationEvidence.map((item) => item.type),
      consentIds: subjectConsents.map((consent) => consent.consentId).sort(),
      memoryRecordIds: subjectMemory.map((record) => record.recordId).sort(),
      skillPreflightIds: subjectPreflights.map((preflight) => preflight.preflightId).sort(),
      toolExecutionIds: subjectToolExecutions.map((execution) => execution.executionId).sort(),
      ledgerEvents: subjectLedger.map((event) => stableStringify(event)).sort()
    })
  );
  const level = assuranceLevel({
    attestationCount: attestationEvidence.length,
    verifiedConsentCount,
    activeConsentCount,
    memoryRecordCount: subjectMemory.length
  });

  return {
    protocolVersion: TRUST_PASSPORT_PROTOCOL_VERSION,
    objectType: 'trust-passport-v1',
    passportId: `bos:trust-passport:${sha256Hex(stableStringify({ subjectId: identity.id, evidenceHash })).slice(0, 32)}`,
    subjectId: identity.id,
    displayName: identity.displayName,
    publicKeyFingerprint: sha256Hex(identity.publicKeyPem).slice(0, 24),
    generatedAt,
    assurance: {
      level,
      reasons: [
        `attestations:${attestationEvidence.length}`,
        `activeConsents:${activeConsentCount}`,
        `verifiedConsents:${verifiedConsentCount}`,
        `memoryRecords:${subjectMemory.length}`
      ]
    },
    attestations: {
      count: attestationEvidence.length,
      types: attestationEvidence.map((item) => item.type),
      evidence: attestationEvidence
    },
    consents: {
      total: subjectConsents.length,
      active: activeConsentCount,
      revoked: revokedConsentCount,
      expired: expiredConsentCount,
      signed: signedConsentCount,
      verified: verifiedConsentCount,
      revocationReceipts: revocationReceiptCount,
      activeScopes,
      latestIssuedAt: latestIso(subjectConsents.map((consent) => consent.issuedAt))
    },
    memory: {
      recordCount: subjectMemory.length,
      manifestCount: uniqueSorted(subjectMemory.map((record) => record.manifestId)).length,
      plaintextBytes: subjectMemory.reduce((sum, record) => sum + Number(record.plaintextBytes ?? 0), 0),
      latestRecordAt: latestIso(subjectMemory.map((record) => record.createdAt))
    },
    skillInvocations: {
      preflightCount: subjectPreflights.length,
      approvedPreflightCount: subjectPreflights.filter((preflight) => preflight.approved).length,
      blockedPreflightCount: subjectPreflights.filter((preflight) => !preflight.approved).length,
      executionCount: subjectToolExecutions.length,
      completedExecutionCount: subjectToolExecutions.filter((execution) => execution.status === 'completed').length,
      skillIds: uniqueSorted(subjectPreflights.map((preflight) => preflight.skillId)),
      latestPreflightAt: latestIso(subjectPreflights.map((preflight) => preflight.checkedAt)),
      latestExecutionAt: latestIso(subjectToolExecutions.map((execution) => execution.finishedAt))
    },
    ledger: {
      eventCount: subjectLedger.length,
      recentEventTypes: uniqueSorted(subjectLedger.slice(0, 10).map((event) => event.type))
    },
    privacy: {
      exposure: 'public_metadata_only',
      privateKeyIncluded: false,
      vaultKeyIncluded: false,
      memoryPlaintextIncluded: false,
      rawAttestationPayloadsIncluded: false
    },
    evidenceHash
  };
}

export function createTrustPassports(identities, context = {}) {
  return identities.map((identity) => createTrustPassport(identity, context));
}

export function canonicalTrustPassportPayload(passport) {
  return {
    protocolVersion: passport.protocolVersion,
    objectType: passport.objectType,
    passportId: passport.passportId,
    subjectId: passport.subjectId,
    displayName: passport.displayName,
    publicKeyFingerprint: passport.publicKeyFingerprint,
    generatedAt: passport.generatedAt,
    assurance: passport.assurance,
    attestations: passport.attestations,
    consents: passport.consents,
    memory: passport.memory,
    skillInvocations: passport.skillInvocations,
    ledger: passport.ledger,
    privacy: passport.privacy,
    evidenceHash: passport.evidenceHash
  };
}

export function signTrustPassportSnapshot(passport, signerIdentity, { role = 'subject', signedAt = new Date().toISOString() } = {}) {
  if (!signerIdentity?.id) throw new Error('signerIdentity is required.');
  if (signerIdentity.id !== passport.subjectId) {
    throw new Error('Trust Passport snapshots must be signed by the subject identity in this prototype.');
  }

  const payload = canonicalTrustPassportPayload(passport);
  const payloadText = stableStringify(payload);
  const payloadHash = sha256Hex(payloadText);
  const signature = signText(signerIdentity, payloadText);
  const core = {
    protocolVersion: TRUST_PASSPORT_PROTOCOL_VERSION,
    objectType: 'signed-trust-passport-snapshot',
    passportId: passport.passportId,
    subjectId: passport.subjectId,
    signerId: signerIdentity.id,
    role,
    payloadHash,
    signedAt
  };

  return {
    snapshotId: `bos:trust-passport-snapshot:${sha256Hex(stableStringify(core)).slice(0, 32)}`,
    ...core,
    passport,
    signature: {
      algorithm: signature.algorithm,
      signerId: signature.signerId,
      signatureBase64: signature.signatureBase64
    }
  };
}

export function verifyTrustPassportSnapshot(snapshot, publicRecords = []) {
  const reasons = [];
  const passportPayload = canonicalTrustPassportPayload(snapshot.passport ?? {});
  const payloadText = stableStringify(passportPayload);
  const payloadHash = sha256Hex(payloadText);
  const core = {
    protocolVersion: snapshot.protocolVersion,
    objectType: snapshot.objectType,
    passportId: snapshot.passportId,
    subjectId: snapshot.subjectId,
    signerId: snapshot.signerId,
    role: snapshot.role,
    payloadHash: snapshot.payloadHash,
    signedAt: snapshot.signedAt
  };
  const expectedSnapshotId = `bos:trust-passport-snapshot:${sha256Hex(stableStringify(core)).slice(0, 32)}`;
  const publicRecord = publicRecords.find((candidate) => candidate.id === snapshot.signerId);
  const signatureValid = Boolean(publicRecord && snapshot.signature) && verifySignature(publicRecord, payloadText, snapshot.signature);

  if (snapshot.objectType !== 'signed-trust-passport-snapshot') reasons.push('invalid snapshot object type');
  if (snapshot.snapshotId !== expectedSnapshotId) reasons.push('snapshot ID does not match canonical payload');
  if (snapshot.passportId !== snapshot.passport?.passportId) reasons.push('snapshot passport ID does not match embedded passport');
  if (snapshot.subjectId !== snapshot.passport?.subjectId) reasons.push('snapshot subject does not match embedded passport');
  if (snapshot.payloadHash !== payloadHash) reasons.push('payload hash does not match embedded passport');
  if (!publicRecord) reasons.push('signer public record is unavailable');
  if (!snapshot.signature) reasons.push('snapshot signature is missing');
  if (publicRecord && !signatureValid) reasons.push('snapshot signature does not verify');

  return {
    artifactType: 'trust-passport-snapshot',
    valid: reasons.length === 0,
    idValid: snapshot.snapshotId === expectedSnapshotId,
    payloadHashValid: snapshot.payloadHash === payloadHash,
    signatureValid,
    publicRecordAvailable: Boolean(publicRecord),
    signerId: snapshot.signerId,
    expectedSnapshotId,
    actualSnapshotId: snapshot.snapshotId,
    payloadHash,
    reasons
  };
}
