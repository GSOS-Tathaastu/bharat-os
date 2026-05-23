import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  consentLifecycle,
  createConsent,
  evaluateDecision,
  listPolicies,
  revokeConsent
} from '../../src/phase1/policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');
const cliPath = path.join(repoRoot, 'bin', 'bos.mjs');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('default policy registry contains binding Bharat OS guardrails', () => {
  const policies = listPolicies();
  assert.ok(policies.some((policy) => policy.policyId === 'policy.pii.no_raw_pii_to_model'));
  assert.ok(policies.some((policy) => policy.policyId === 'policy.identity.aadhaar_optional'));
  assert.ok(policies.some((policy) => policy.policyId === 'policy.worker.no_advance_fee'));
});

test('regulated decision is blocked without active consent and approved with consent', () => {
  const identity = createIdentity({ displayName: 'Policy actor' });
  const request = {
    actorId: identity.id,
    actionType: 'regulated_onboarding',
    scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
    regulated: true,
    piiHandling: 'tokenized',
    identity: { aadhaarRequired: false, fallbackAvailable: true }
  };

  const blocked = evaluateDecision(request, []);
  assert.equal(blocked.approved, false);
  assert.ok(
    blocked.checks.some(
      (check) =>
        check.policyId === 'policy.consent.required_for_regulated_action' &&
        check.status === 'fail'
    )
  );

  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: request.scopes,
    purpose: 'Regulated onboarding dry-run'
  });
  const approved = evaluateDecision(request, [consent]);
  assert.equal(approved.approved, true);
  assert.ok(approved.plan.some((step) => step.step === 'invoke_tool'));
});

test('decision engine blocks raw PII, mandatory Aadhaar, and worker fees', () => {
  const identity = createIdentity({ displayName: 'Worker actor' });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['labor.match', 'worker.notify', 'upi.escrow'],
    purpose: 'Labor matching'
  });
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'labor_match_post',
      scopes: ['labor.match', 'worker.notify', 'upi.escrow'],
      regulated: true,
      piiHandling: 'raw',
      identity: { aadhaarRequired: true, fallbackAvailable: false },
      money: { amount: 500, currency: 'INR', limit: 500, workerPays: true }
    },
    [consent]
  );

  assert.equal(decision.approved, false);
  assert.ok(decision.checks.some((check) => check.policyId === 'policy.pii.no_raw_pii_to_model' && check.status === 'fail'));
  assert.ok(decision.checks.some((check) => check.policyId === 'policy.identity.aadhaar_optional' && check.status === 'fail'));
  assert.ok(decision.checks.some((check) => check.policyId === 'policy.worker.no_advance_fee' && check.status === 'fail'));
});

test('revoked consent no longer covers regulated action', () => {
  const identity = createIdentity({ displayName: 'Revoked actor' });
  const activeConsent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['health.record.read', 'consent.record'],
    purpose: 'Health record read'
  });
  const consent = revokeConsent(activeConsent);
  assert.equal(consent.consentId, activeConsent.consentId);
  assert.equal(consentLifecycle(consent).status, 'revoked');
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'health_record_read',
      scopes: ['health.record.read', 'consent.record'],
      regulated: true,
      piiHandling: 'summary'
    },
    [consent]
  );

  assert.equal(decision.approved, false);
  assert.equal(decision.checks[0].candidateConsents[0].status, 'revoked');
});

test('expired consent no longer covers regulated action', () => {
  const identity = createIdentity({ displayName: 'Expired actor' });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['health.record.read', 'consent.record'],
    purpose: 'Expired health record read',
    expiresAt: '2000-01-01T00:00:00.000Z'
  });
  assert.equal(consentLifecycle(consent).status, 'expired');
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'health_record_read',
      scopes: ['health.record.read', 'consent.record'],
      regulated: true,
      piiHandling: 'summary'
    },
    [consent]
  );

  assert.equal(decision.approved, false);
  assert.equal(decision.checks[0].candidateConsents[0].status, 'expired');
});

test('store persists consents and decision receipts', async () => {
  const { store } = await freshStore('phase1-store');
  const identity = createIdentity({ displayName: 'Persistent policy actor' });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['mesh.store'],
    purpose: 'Mesh storage'
  });
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'mesh_storage',
      scopes: ['mesh.store'],
      regulated: false,
      piiHandling: 'none'
    },
    [consent]
  );

  await store.saveConsent(consent);
  await store.saveDecision(decision);

  assert.equal((await store.readConsent(consent.consentId)).consentId, consent.consentId);
  assert.equal((await store.readDecision(decision.decisionId)).decisionId, decision.decisionId);
  assert.equal((await store.listConsents()).length, 1);
  assert.equal((await store.listDecisions()).length, 1);
});

test('CLI creates consent and evaluates a decision', async () => {
  const { root, store } = await freshStore('phase1-cli');
  const identity = createIdentity({ displayName: 'CLI policy actor' });
  await store.saveIdentity(identity);

  const consentResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'consent',
      'create',
      '--subject-id',
      identity.id,
      '--grantee-id',
      'bharat-os-orchestrator',
      '--scopes',
      'identity.verify,consent.record,regulated.workflow',
      '--purpose',
      'CLI onboarding',
      '--sign-with-identity-id',
      identity.id,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(consentResult.status, 0, consentResult.stderr);
  const createdConsent = JSON.parse(consentResult.stdout).consent;
  assert.equal(createdConsent.signatures.length, 1);

  const decisionResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'decision',
      'evaluate',
      '--actor-id',
      identity.id,
      '--action-type',
      'regulated_onboarding',
      '--scopes',
      'identity.verify,consent.record,regulated.workflow',
      '--regulated',
      '--pii-handling',
      'tokenized',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );

  assert.equal(decisionResult.status, 0, decisionResult.stderr);
  assert.equal(JSON.parse(decisionResult.stdout).decision.approved, true);

  const revokeResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'consent',
      'revoke',
      '--id',
      createdConsent.consentId,
      '--reason',
      'test_revocation',
      '--sign-with-identity-id',
      identity.id,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(revokeResult.status, 0, revokeResult.stderr);
  assert.equal(JSON.parse(revokeResult.stdout).lifecycle.status, 'revoked');

  const blockedResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'decision',
      'evaluate',
      '--actor-id',
      identity.id,
      '--action-type',
      'regulated_onboarding',
      '--scopes',
      'identity.verify,consent.record,regulated.workflow',
      '--regulated',
      '--pii-handling',
      'tokenized',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(blockedResult.status, 0, blockedResult.stderr);
  assert.equal(JSON.parse(blockedResult.stdout).decision.approved, false);
});
