import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, publicIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent, evaluateDecision, revokeConsent } from '../../src/phase1/policy.mjs';
import { executeToolAction } from '../../src/phase1/tools.mjs';
import { orchestrateIntent } from '../../src/phase1/orchestrator.mjs';
import { evaluateSkillPreflight } from '../../src/phase1/skills.mjs';
import {
  signConsent,
  signConsentRevocation,
  verifyArtifactIntegrity,
  verifyConsentIntegrity,
  verifyConsentRevocationIntegrity,
  verifyConsentSignature,
  verifyReceiptIntegrity
} from '../../src/phase1/integrity.mjs';

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

function regulatedConsent(identity) {
  return createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
    purpose: 'Signed regulated workflow'
  });
}

test('consent integrity verifies canonical ID and subject signature', () => {
  const identity = createIdentity({ displayName: 'Integrity signer' });
  const consent = regulatedConsent(identity);
  const signed = signConsent(consent, identity);

  assert.equal(verifyConsentIntegrity(signed).valid, true);
  assert.equal(verifyConsentSignature(signed, publicIdentity(identity), { role: 'subject' }), true);

  const verified = verifyArtifactIntegrity(signed, [publicIdentity(identity)]);
  assert.equal(verified.valid, true);
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.signatures.length, 1);
});

test('consent integrity fails after purpose tampering', () => {
  const identity = createIdentity({ displayName: 'Tamper signer' });
  const signed = signConsent(regulatedConsent(identity), identity);
  const tampered = { ...signed, purpose: 'Different purpose after signature' };

  const verified = verifyArtifactIntegrity(tampered, [publicIdentity(identity)]);
  assert.equal(verified.valid, false);
  assert.equal(verified.idValid, false);
  assert.equal(verified.signatureValid, false);
});

test('revoked consent keeps grant signature and verifies revocation receipt', () => {
  const identity = createIdentity({ displayName: 'Revocation signer' });
  const signed = signConsent(regulatedConsent(identity), identity);
  const revoked = signConsentRevocation(revokeConsent(signed), identity);

  const verified = verifyArtifactIntegrity(revoked, [publicIdentity(identity)]);
  assert.equal(verified.valid, true);
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.revocation.valid, true);
  assert.equal(verified.revocation.signatureValid, true);

  const revocation = verifyConsentRevocationIntegrity(revoked, [publicIdentity(identity)]);
  assert.equal(revocation.valid, true);
  assert.equal(
    verifyConsentRevocationIntegrity(
      {
        ...revoked,
        revocation: { ...revoked.revocation, reason: 'altered_reason' }
      },
      [publicIdentity(identity)]
    ).valid,
    false
  );
});

test('decision, tool, orchestration, and skill preflight receipts are tamper evident', () => {
  const identity = createIdentity({ displayName: 'Receipt actor' });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
    purpose: 'Receipt checks'
  });

  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'scheme_delivery',
      scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
      regulated: true,
      piiHandling: 'tokenized'
    },
    [consent]
  );
  assert.equal(verifyReceiptIntegrity(decision).valid, true);
  assert.equal(verifyReceiptIntegrity({ ...decision, approved: false }).valid, false);

  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'scheme_delivery',
      tool: 'digilocker',
      scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
      regulated: true,
      piiHandling: 'tokenized'
    },
    [consent]
  );
  assert.equal(verifyReceiptIntegrity(execution).valid, true);
  assert.equal(
    verifyReceiptIntegrity({
      ...execution,
      toolReceipt: { ...execution.toolReceipt, status: 'altered' }
    }).valid,
    false
  );

  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Which government scheme am I eligible for?'
    },
    [consent],
    { execute: true }
  );
  assert.equal(verifyReceiptIntegrity(orchestration).valid, true);
  assert.equal(verifyReceiptIntegrity({ ...orchestration, status: 'blocked' }).valid, false);

  const preflight = evaluateSkillPreflight('bos:skill:digilocker-docrefs', { actorId: identity.id }, [consent]);
  assert.equal(verifyReceiptIntegrity(preflight).valid, true);
  assert.equal(verifyReceiptIntegrity({ ...preflight, approved: false }).valid, false);
});

test('CLI creates signed consent and verifies persisted integrity', async () => {
  const { root, store } = await freshStore('integrity-cli');
  const identity = createIdentity({ displayName: 'CLI integrity signer' });
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
      'CLI signed onboarding',
      '--sign-with-identity-id',
      identity.id,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(consentResult.status, 0, consentResult.stderr);
  const created = JSON.parse(consentResult.stdout).consent;
  assert.equal(created.signatures.length, 1);

  const verifyResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'integrity',
      'verify',
      '--artifact',
      'consent',
      '--id',
      created.consentId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(verifyResult.status, 0, verifyResult.stderr);
  const verified = JSON.parse(verifyResult.stdout).integrity;
  assert.equal(verified.valid, true);
  assert.equal(verified.signatureValid, true);
});
