// Phase 2a.18 — §9C vignette 15 (trust attestation) + vignette 16b
// (daily brief) end-to-end tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { signConsent } from '../../src/phase1/integrity.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { orchestrateIntent, ORCHESTRATION_TEMPLATES } from '../../src/phase1/orchestrator.mjs';
import { listTools } from '../../src/phase1/tools.mjs';
import { listSkills } from '../../src/phase1/skills.mjs';
import {
  inferActionTypeFromNormalized,
  normalizeIntent,
  VERNACULAR_RESPONSES
} from '../../src/phase1/vernacular.mjs';

function freshConsent(subject, scopes, purpose, ttlSeconds) {
  return signConsent(
    createConsent({
      subjectId: subject.id,
      granteeId: 'bharat-os-orchestrator',
      scopes,
      purpose,
      ttlSeconds
    }),
    subject
  );
}

test('tool registry includes trust_passport_attestation and daily_brief_compose', () => {
  const ids = listTools().map((t) => t.toolId);
  assert.ok(ids.includes('trust_passport_attestation'));
  assert.ok(ids.includes('daily_brief_compose'));
});

test('skill registry covers trust_attestation and daily_brief action types', () => {
  const skills = listSkills();
  const trust = skills.find((s) => s.actionType === 'trust_attestation');
  const brief = skills.find((s) => s.actionType === 'daily_brief');
  assert.ok(trust, 'trust_attestation skill is registered');
  assert.ok(brief, 'daily_brief skill is registered');
  assert.equal(trust.toolBinding.toolId, 'trust_passport_attestation');
  assert.equal(brief.toolBinding.toolId, 'daily_brief_compose');
  // §13A #7 attestation is consent-required + regulated; daily brief is
  // citizen-facing memory.read.
  assert.equal(trust.permissions.consentRequired, true);
  assert.equal(brief.permissions.consentRequired, true);
});

test('orchestration templates are wired for both new action types', () => {
  assert.ok(ORCHESTRATION_TEMPLATES.trust_attestation);
  assert.ok(ORCHESTRATION_TEMPLATES.daily_brief);
  assert.equal(ORCHESTRATION_TEMPLATES.trust_attestation.tool, 'trust_passport_attestation');
  assert.equal(ORCHESTRATION_TEMPLATES.daily_brief.tool, 'daily_brief_compose');
  assert.equal(ORCHESTRATION_TEMPLATES.daily_brief.regulated, false);
});

test('vernacular classification routes trust + brief intents in English, Hinglish, Devanagari, Tamil', () => {
  const cases = [
    ['trust_attestation', 'Generate a trust attestation for my landlord'],
    ['trust_attestation', 'Mujhe landlord ke liye trust attestation chahiye'],
    ['trust_attestation', 'मुझे मकान मालिक के लिए विश्वास प्रमाण-पत्र चाहिए'],
    ['trust_attestation', 'வீட்டு உரிமையாளருக்கு நம்பிக்கை சான்றிதழ் வேண்டும்'],
    ['daily_brief', 'Give me my morning brief'],
    ['daily_brief', 'Aaj ka brief sunao'],
    ['daily_brief', 'आज का ब्रीफ बताओ'],
    ['daily_brief', 'What is on today']
  ];
  for (const [expected, text] of cases) {
    const n = normalizeIntent(text);
    const actual = inferActionTypeFromNormalized(n);
    assert.equal(actual, expected, `${text} should classify as ${expected}, got ${actual}`);
  }
});

test('vernacular response strings exist for trust + brief in every supported locale', () => {
  for (const action of ['trust_attestation', 'daily_brief']) {
    const bucket = VERNACULAR_RESPONSES[action];
    assert.ok(bucket, `${action} has a response bucket`);
    for (const status of ['planned', 'blocked', 'completed']) {
      const statusBucket = bucket[status];
      assert.ok(statusBucket, `${action} has ${status} responses`);
      for (const locale of ['en-IN', 'hi-IN', 'hi-Latn-IN', 'mr-IN', 'bho-IN', 'ta-IN', 'bn-IN']) {
        assert.ok(
          statusBucket[locale]?.length > 0,
          `${action}.${status} has a string for ${locale}`
        );
      }
    }
  }
});

test('trust_attestation flow mints a signed, time-bound attestation with selective disclosure', () => {
  const sneha = createIdentity({
    displayName: 'Sneha (tenant)',
    attestations: { aadhaar_offline: { status: 'verified', issuer: 'UIDAI' } }
  });
  const consent = freshConsent(
    sneha,
    ['trust.attest', 'consent.record'],
    'tenant_verification',
    14 * 24 * 60 * 60
  );
  const result = orchestrateIntent(
    {
      actorId: sneha.id,
      intentText: 'Generate a trust attestation for my landlord',
      locale: 'en-IN',
      metadata: {
        purpose: 'tenant_verification',
        shareDays: 14,
        verifierName: 'Mr. Kothrud Landlord',
        incomeBand: 'INR_50K_75K_MONTHLY'
      }
    },
    [consent],
    { publicRecords: [sneha], execute: true }
  );
  assert.equal(result.status, 'completed');
  const receipt = result.execution.toolReceipt;
  assert.equal(receipt.toolId, 'trust_passport_attestation');
  assert.equal(receipt.subjectId, sneha.id);
  assert.equal(receipt.verifierName, 'Mr. Kothrud Landlord');
  assert.equal(receipt.purpose, 'tenant_verification');
  assert.equal(receipt.shareDays, 14);
  assert.equal(receipt.rawPiiReturned, false, 'raw PII must not be exposed (§15)');
  assert.ok(receipt.attestationId.startsWith('bos:attestation:'));
  // Expires roughly 14 days from now.
  const issuedAt = new Date(receipt.issuedAt).getTime();
  const expiresAt = new Date(receipt.expiresAt).getTime();
  const diffDays = Math.round((expiresAt - issuedAt) / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 14);
  // Selective disclosure — each claim should be a band or boolean.
  for (const claim of receipt.claims) {
    assert.equal(claim.disclosure, 'band_or_boolean');
    assert.notEqual(typeof claim.value, 'undefined');
  }
});

test('trust_attestation honours custom claims and clamps shareDays to [1, 90]', () => {
  const subject = createIdentity({ displayName: 'Claims test' });
  const consent = freshConsent(subject, ['trust.attest', 'consent.record'], 't', 30 * 86400);
  // Negative share days clamp to 1.
  const tooShort = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Attest for me',
      locale: 'en-IN',
      metadata: { shareDays: -7, requestedClaims: ['identity_verified'] }
    },
    [consent],
    { publicRecords: [subject], execute: true }
  );
  assert.equal(tooShort.execution.toolReceipt.shareDays, 1);
  assert.equal(tooShort.execution.toolReceipt.claims.length, 1);
  // Over 90 clamps to 90.
  const tooLong = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Attest for me',
      locale: 'en-IN',
      metadata: { shareDays: 9999 }
    },
    [consent],
    { publicRecords: [subject], execute: true }
  );
  assert.equal(tooLong.execution.toolReceipt.shareDays, 90);
});

test('daily_brief flow completes on-device with zero network legs', () => {
  const priya = createIdentity({ displayName: 'Priya (brief test)' });
  const consent = freshConsent(
    priya,
    ['memory.read', 'consent.record'],
    'daily_brief',
    24 * 60 * 60
  );
  const result = orchestrateIntent(
    {
      actorId: priya.id,
      intentText: 'Give me my morning brief',
      locale: 'en-IN'
    },
    [consent],
    { publicRecords: [priya], execute: true }
  );
  assert.equal(result.status, 'completed');
  const receipt = result.execution.toolReceipt;
  assert.equal(receipt.toolId, 'daily_brief_compose');
  assert.equal(receipt.runtime, 'on_device_only');
  assert.equal(receipt.networkLegs, 0);
  assert.equal(receipt.rawPiiReturned, false);
  assert.ok(receipt.briefId.startsWith('bos:brief:'));
  assert.ok(Array.isArray(receipt.sections) && receipt.sections.length > 0);
});

test('daily_brief without consent is blocked, never executed', () => {
  const subject = createIdentity({ displayName: 'No-consent brief test' });
  const result = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Give me my morning brief',
      locale: 'en-IN'
    },
    [], // no consents
    { publicRecords: [subject], execute: true }
  );
  assert.notEqual(result.status, 'completed');
  assert.ok(
    result.execution?.toolReceipt === null ||
      result.execution?.toolReceipt === undefined ||
      result.execution.status === 'blocked',
    'no tool receipt when consent missing'
  );
});

test('trust_attestation honours horizonHours clamp on daily_brief metadata', () => {
  const subject = createIdentity({ displayName: 'Horizon clamp test' });
  const consent = freshConsent(subject, ['memory.read', 'consent.record'], 'brief', 86400);
  const short = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Brief me',
      locale: 'en-IN',
      metadata: { horizonHours: 0 }
    },
    [consent],
    { publicRecords: [subject], execute: true }
  );
  assert.equal(short.execution.toolReceipt.horizonHours, 1);
  const long = orchestrateIntent(
    {
      actorId: subject.id,
      intentText: 'Brief me',
      locale: 'en-IN',
      metadata: { horizonHours: 9999 }
    },
    [consent],
    { publicRecords: [subject], execute: true }
  );
  assert.equal(long.execution.toolReceipt.horizonHours, 168);
});
