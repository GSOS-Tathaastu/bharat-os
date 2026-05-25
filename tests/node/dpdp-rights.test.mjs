// Phase 4.0 — DPDP data-subject rights.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { signConsent } from '../../src/phase1/integrity.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  collectUserData,
  DEFAULT_DPO_CONTACT,
  DPDP_RIGHTS_PROTOCOL_VERSION,
  erasureManifest,
  redactLedgerEntry
} from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'dpdp-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('DEFAULT_DPO_CONTACT carries the required DPDP §13 fields', () => {
  assert.equal(DEFAULT_DPO_CONTACT.protocolVersion, DPDP_RIGHTS_PROTOCOL_VERSION);
  assert.ok(DEFAULT_DPO_CONTACT.name);
  assert.ok(DEFAULT_DPO_CONTACT.email);
  assert.ok(DEFAULT_DPO_CONTACT.grievanceEscalation);
  assert.equal(DEFAULT_DPO_CONTACT.responseSlaDays, 30);
});

test('collectUserData returns a structured export with all required sections', async () => {
  const { store } = await freshStore('export-shape');
  const identity = createIdentity({ displayName: 'Export subject' });
  await store.saveIdentity(identity);
  const consent = signConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read'],
      purpose: 'export_test'
    }),
    identity
  );
  await store.saveConsent(consent);
  const data = await collectUserData(store, identity.id);
  assert.equal(data.protocolVersion, DPDP_RIGHTS_PROTOCOL_VERSION);
  assert.equal(data.objectType, 'dpdp-data-subject-export');
  assert.equal(data.subject.identityId, identity.id);
  assert.equal(data.subject.displayName, 'Export subject');
  // The required DPDP sections all exist.
  for (const section of [
    'identity',
    'consents',
    'decisions',
    'orchestrations',
    'memoryRecords',
    'workerAuthorizations',
    'flagsAuthored',
    'flagsAgainst',
    'meshContributions',
    'attestations',
    'ledger'
  ]) {
    assert.ok(data.sections[section], `missing section: ${section}`);
    assert.ok(typeof data.sections[section].count === 'number');
  }
  assert.equal(data.sections.consents.count, 1);
  assert.equal(data.sections.identity.count, 1);
});

test('collectUserData EXCLUDES privateKey and vaultKey from the export', async () => {
  const { store } = await freshStore('export-secrets');
  const identity = createIdentity({ displayName: 'Secrets subject' });
  await store.saveIdentity(identity);
  const data = await collectUserData(store, identity.id);
  // Subject block must NOT carry the cryptographic secret material.
  assert.equal(data.subject.privateKeyPem, undefined);
  assert.equal(data.subject.vaultKeyBase64, undefined);
  // But the publicKey + attestations should be present (DPDP §11 grants
  // visibility into the public record).
  assert.ok(data.subject.publicKeyPem);
  const serialized = JSON.stringify(data);
  assert.equal(
    serialized.includes(identity.privateKeyPem),
    false,
    'private key must never appear in the export'
  );
  assert.equal(
    serialized.includes(identity.vaultKeyBase64),
    false,
    'vault key must never appear in the export'
  );
});

test('collectUserData filters across multiple subjects — only includes the requested user', async () => {
  const { store } = await freshStore('export-filter');
  const alice = createIdentity({ displayName: 'Alice' });
  const bob = createIdentity({ displayName: 'Bob' });
  await store.saveIdentity(alice);
  await store.saveIdentity(bob);
  const aliceConsent = signConsent(
    createConsent({
      subjectId: alice.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read'],
      purpose: 'alice_only'
    }),
    alice
  );
  const bobConsent = signConsent(
    createConsent({
      subjectId: bob.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read'],
      purpose: 'bob_only'
    }),
    bob
  );
  await store.saveConsent(aliceConsent);
  await store.saveConsent(bobConsent);

  const aliceData = await collectUserData(store, alice.id);
  assert.equal(aliceData.sections.consents.count, 1);
  assert.equal(aliceData.sections.consents.records[0].subjectId, alice.id);

  const bobData = await collectUserData(store, bob.id);
  assert.equal(bobData.sections.consents.count, 1);
  assert.equal(bobData.sections.consents.records[0].subjectId, bob.id);
});

test('collectUserData refuses unknown identity', async () => {
  const { store } = await freshStore('export-unknown');
  await assert.rejects(
    () => collectUserData(store, 'bos:person:nonexistent'),
    /no identity/
  );
});

test('erasureManifest emits a deletion plan without touching the filesystem', async () => {
  const { store, root } = await freshStore('erasure-plan');
  const identity = createIdentity({ displayName: 'Erasure subject' });
  await store.saveIdentity(identity);
  const consent = signConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read'],
      purpose: 'erasure_test'
    }),
    identity
  );
  await store.saveConsent(consent);

  const manifest = await erasureManifest(store, identity.id);
  assert.equal(manifest.protocolVersion, DPDP_RIGHTS_PROTOCOL_VERSION);
  assert.equal(manifest.objectType, 'dpdp-erasure-manifest');
  assert.equal(manifest.identityId, identity.id);
  assert.equal(manifest.plannedDeletions.identity, 1);
  assert.equal(manifest.plannedDeletions.consents, 1);
  // ledger entries are tracked as redactions, not deletions.
  assert.equal(manifest.plannedDeletions.ledger, undefined);
  assert.ok(manifest.ledgerEntryRedactions >= 1);
  assert.ok(manifest.noticeText.includes('permanent'));

  // Pure — store still has the records.
  const aliveIdentity = await store.readIdentity(identity.id);
  assert.equal(aliveIdentity.id, identity.id);
  const aliveConsents = await store.listConsents();
  assert.equal(aliveConsents.length, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('redactLedgerEntry replaces identity references with <erased>, preserves the rest', () => {
  const identityId = 'bos:person:redact';
  const event = {
    type: 'orchestration.completed',
    at: '2026-05-24T00:00:00.000Z',
    actorId: identityId,
    subjectId: identityId,
    decisionId: 'bos:decision:k',
    payloadSize: 42
  };
  const redacted = redactLedgerEntry(event, identityId);
  assert.equal(redacted.actorId, '<erased>');
  assert.equal(redacted.subjectId, '<erased>');
  assert.equal(redacted.type, 'orchestration.completed');
  assert.equal(redacted.at, '2026-05-24T00:00:00.000Z');
  assert.equal(redacted.decisionId, 'bos:decision:k');
  assert.equal(redacted.payloadSize, 42);
});

test('redactLedgerEntry leaves events that do not mention the user unchanged', () => {
  const event = {
    type: 'orchestration.completed',
    actorId: 'bos:person:other',
    subjectId: 'bos:person:other-too'
  };
  const redacted = redactLedgerEntry(event, 'bos:person:requested-erasure');
  assert.equal(redacted.actorId, 'bos:person:other');
  assert.equal(redacted.subjectId, 'bos:person:other-too');
});

test('the export bundle includes the DPDP rights notice and DPO contact', async () => {
  const { store } = await freshStore('export-notice');
  const identity = createIdentity({ displayName: 'Notice subject' });
  await store.saveIdentity(identity);
  const data = await collectUserData(store, identity.id);
  assert.ok(data.notice);
  assert.ok(Array.isArray(data.notice.yourRights));
  assert.ok(data.notice.yourRights.some((line) => /erasure/i.test(line)));
  assert.ok(data.notice.yourRights.some((line) => /access/i.test(line)));
  assert.equal(data.notice.grievanceContact.email, DEFAULT_DPO_CONTACT.email);
});
