// Phase 2a.22 — trust-attestation sign + verify contract.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publicIdentity, sha256Hex, stableStringify } from '../../src/phase0/core.mjs';
import { signConsent } from '../../src/phase1/integrity.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { orchestrateIntent } from '../../src/phase1/orchestrator.mjs';
import {
  signTrustAttestation,
  TRUST_ATTESTATION_PROTOCOL_VERSION,
  verifyTrustAttestation
} from '../../src/phase1/trust-attestation.mjs';

function unsignedAttestation(subject, { expiresAt, verifierName = 'Landlord X' } = {}) {
  return {
    attestationId: 'bos:attestation:test-1',
    subjectId: subject.id,
    verifierName,
    purpose: 'tenant_verification',
    claims: [
      { claim: 'identity_verified', disclosure: 'band_or_boolean', value: true },
      { claim: 'income_band', disclosure: 'band_or_boolean', value: 'INR_50K_75K_MONTHLY' }
    ],
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    shareDays: 14
  };
}

test('signTrustAttestation requires a signer that matches the subject', () => {
  const subject = createIdentity({ displayName: 'Subject' });
  const stranger = createIdentity({ displayName: 'Stranger' });
  const envelope = unsignedAttestation(subject);
  assert.throws(
    () => signTrustAttestation(envelope, stranger),
    /must be signed by its subject identity/
  );
});

test('signed attestation round-trips: subject signs, verifier validates', () => {
  const subject = createIdentity({ displayName: 'Round-trip subject' });
  const envelope = unsignedAttestation(subject);
  const signed = signTrustAttestation(envelope, subject);
  assert.equal(signed.protocolVersion, TRUST_ATTESTATION_PROTOCOL_VERSION);
  assert.equal(signed.objectType, 'trust-attestation');
  assert.ok(signed.signature);
  assert.ok(signed.payloadHash);

  const result = verifyTrustAttestation(signed, [publicIdentity(subject)]);
  assert.equal(result.status, 'valid');
  assert.equal(result.payload.attestationId, 'bos:attestation:test-1');
  assert.equal(result.subject.id, subject.id);
  assert.ok(result.subject.publicKeyFingerprint.length === 24);
});

test('verifyTrustAttestation reports expired separately from invalid', () => {
  const subject = createIdentity({ displayName: 'Expiry subject' });
  const expired = signTrustAttestation(
    unsignedAttestation(subject, {
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
    }),
    subject
  );
  const result = verifyTrustAttestation(expired, [publicIdentity(subject)]);
  assert.equal(result.status, 'expired');
  assert.ok(result.payload, 'payload still surfaced even when expired');
});

test('verifyTrustAttestation rejects tampered claims', () => {
  const subject = createIdentity({ displayName: 'Tamper subject' });
  const signed = signTrustAttestation(unsignedAttestation(subject), subject);
  const tampered = {
    ...signed,
    claims: [
      ...signed.claims,
      { claim: 'income_band', disclosure: 'raw', value: 'INR_500K_MONTHLY' }
    ]
  };
  const result = verifyTrustAttestation(tampered, [publicIdentity(subject)]);
  assert.equal(result.status, 'signature_invalid');
});

test('verifyTrustAttestation reports unknown_subject when subject not in registry', () => {
  const subject = createIdentity({ displayName: 'Missing subject' });
  const signed = signTrustAttestation(unsignedAttestation(subject), subject);
  const result = verifyTrustAttestation(signed, []); // empty registry
  assert.equal(result.status, 'unknown_subject');
});

test('verifyTrustAttestation reports malformed when signature missing or wrong type', () => {
  const noSig = verifyTrustAttestation(
    { objectType: 'trust-attestation', attestationId: 'x', subjectId: 'y' },
    []
  );
  assert.equal(noSig.status, 'malformed');

  const wrongType = verifyTrustAttestation({ objectType: 'something-else' }, []);
  assert.equal(wrongType.status, 'malformed');
});

test('canonical payload excludes transient framing fields so signature stays stable', () => {
  const subject = createIdentity({ displayName: 'Canonical subject' });
  const envelope = unsignedAttestation(subject);
  const signed = signTrustAttestation(envelope, subject);
  // Add a transient field that wouldn't be in the canonical payload.
  const withFraming = { ...signed, revenueLine: '§13A #7 …', toolId: 'trust_passport_attestation' };
  const result = verifyTrustAttestation(withFraming, [publicIdentity(subject)]);
  assert.equal(result.status, 'valid');
});

// End-to-end: orchestration mints the tool receipt → caller signs it
// with the subject identity → verifier checks against the public
// record. Mirrors what the API does in production.
test('end-to-end: orchestrateIntent → sign → verify round-trip', () => {
  const subject = createIdentity({
    displayName: 'E2E subject',
    attestations: { aadhaar_offline: { status: 'verified', issuer: 'UIDAI' } }
  });
  const consent = signConsent(
    createConsent({
      subjectId: subject.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['trust.attest', 'consent.record'],
      purpose: 'tenant_verification',
      ttlSeconds: 14 * 24 * 60 * 60
    }),
    subject
  );
  const orchestration = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Generate a trust attestation for my landlord',
      locale: 'en-IN',
      metadata: {
        purpose: 'tenant_verification',
        shareDays: 14,
        verifierName: 'Test Landlord'
      }
    },
    [consent],
    { publicRecords: [publicIdentity(subject)], execute: true }
  );
  assert.equal(orchestration.status, 'completed');
  const unsigned = orchestration.execution.toolReceipt;
  const signed = signTrustAttestation(unsigned, subject);
  const result = verifyTrustAttestation(signed, [publicIdentity(subject)]);
  assert.equal(result.status, 'valid');
  assert.equal(result.subject.id, subject.id);
  assert.equal(result.payload.verifierName, 'Test Landlord');
  assert.equal(result.payload.shareDays, 14);
  // Selective disclosure preserved through the round-trip:
  for (const claim of result.payload.claims) {
    assert.equal(claim.disclosure, 'band_or_boolean');
  }
});
