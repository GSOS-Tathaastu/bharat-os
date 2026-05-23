import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  createMemoryRecord,
  memoryProvenance,
  readMemoryRecord,
  readMemoryRecordWithConsent,
  searchMemoryRecords
} from '../../src/phase1/memory.mjs';

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

test('memory records store encrypted payload pointers without plaintext metadata', () => {
  const identity = createIdentity({ displayName: 'Memory owner' });
  const { record, bundle } = createMemoryRecord(identity, 'My preferred language is Marathi.', {
    label: 'language preference',
    tags: ['profile', 'language']
  });

  assert.equal(record.objectType, 'identity-memory-record');
  assert.equal(record.ownerId, identity.id);
  assert.equal(record.manifestId, bundle.manifest.manifestId);
  assert.equal(JSON.stringify(record).includes('Marathi'), false);
  assert.equal(readMemoryRecord(identity, record, bundle).toString('utf8'), 'My preferred language is Marathi.');
});

test('memory reads are blocked without consent and allowed with active consent', () => {
  const identity = createIdentity({ displayName: 'Consent memory owner' });
  const { record, bundle } = createMemoryRecord(identity, 'Account type: exporter current account.', {
    label: 'banking preference'
  });

  const blocked = readMemoryRecordWithConsent(identity, record, bundle, []);
  assert.equal(blocked.approved, false);
  assert.equal(blocked.plaintext, null);

  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: record.scopes,
    purpose: 'Read memory for decision context'
  });
  const approved = readMemoryRecordWithConsent(identity, record, bundle, [consent]);
  assert.equal(approved.approved, true);
  assert.equal(approved.plaintext, 'Account type: exporter current account.');
});

test('memory search and provenance expose metadata without plaintext', () => {
  const identity = createIdentity({ displayName: 'Search memory owner' });
  const { record } = createMemoryRecord(identity, 'Prefers Konkani for service calls.', {
    label: 'language preference',
    tags: ['profile', 'language'],
    source: { type: 'survey', ref: 'onboarding-form' }
  });

  const results = searchMemoryRecords([record], {
    query: 'survey',
    tags: 'profile',
    scopes: 'memory.read'
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].recordId, record.recordId);
  assert.ok(results[0].match.fields.includes('source'));
  assert.equal(JSON.stringify(results[0]).includes('Konkani'), false);
  assert.equal(results[0].provenance.manifestId, record.manifestId);

  const plaintextOnlyQuery = searchMemoryRecords([record], { query: 'Konkani' });
  assert.equal(plaintextOnlyQuery.length, 0);

  const provenance = memoryProvenance(record);
  assert.equal(provenance.exposure, 'metadata_only');
  assert.equal(provenance.source.ref, 'onboarding-form');
  assert.equal(JSON.stringify(provenance).includes('Konkani'), false);
});

test('store persists memory records and encrypted bundles', async () => {
  const { store } = await freshStore('memory-store');
  const identity = createIdentity({ displayName: 'Persistent memory owner' });
  const { record, bundle } = createMemoryRecord(identity, 'Village: Satara', {
    label: 'home district'
  });
  await store.saveIdentity(identity);
  await store.saveBundle(bundle);
  await store.saveMemoryRecord(record);

  const stored = await store.readMemoryRecord(record.recordId);
  const storedBundle = await store.readBundle(stored.manifestId);
  assert.equal(stored.recordId, record.recordId);
  assert.equal(readMemoryRecord(identity, stored, storedBundle).toString('utf8'), 'Village: Satara');
  assert.equal((await store.listMemoryRecords()).length, 1);
});

test('CLI writes and consent-gates memory reads', async () => {
  const { root, store } = await freshStore('memory-cli');
  const identity = createIdentity({ displayName: 'CLI memory owner' });
  await store.saveIdentity(identity);

  const putResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'memory',
      'put',
      '--identity-id',
      identity.id,
      '--label',
      'food preference',
      '--text',
      'Prefers vegetarian meals',
      '--tags',
      'profile,food',
      '--source-ref',
      'onboarding-card',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(putResult.status, 0, putResult.stderr);
  const record = JSON.parse(putResult.stdout).memory;

  const searchResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'memory',
      'search',
      '--query',
      'food',
      '--tags',
      'profile',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(searchResult.status, 0, searchResult.stderr);
  const searchBody = JSON.parse(searchResult.stdout);
  assert.equal(searchBody.memory.length, 1);
  assert.equal(searchBody.memory[0].recordId, record.recordId);
  assert.equal(JSON.stringify(searchBody).includes('vegetarian'), false);

  const provenanceResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'memory',
      'provenance',
      '--record-id',
      record.recordId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(provenanceResult.status, 0, provenanceResult.stderr);
  const provenanceBody = JSON.parse(provenanceResult.stdout);
  assert.equal(provenanceBody.provenance.source.ref, 'onboarding-card');
  assert.equal(JSON.stringify(provenanceBody).includes('vegetarian'), false);

  const blockedResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'memory',
      'read',
      '--identity-id',
      identity.id,
      '--record-id',
      record.recordId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(blockedResult.status, 0, blockedResult.stderr);
  assert.equal(JSON.parse(blockedResult.stdout).approved, false);

  await store.saveConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read', 'consent.record'],
      purpose: 'CLI memory read'
    })
  );

  const readResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'memory',
      'read',
      '--identity-id',
      identity.id,
      '--record-id',
      record.recordId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(readResult.status, 0, readResult.stderr);
  const body = JSON.parse(readResult.stdout);
  assert.equal(body.approved, true);
  assert.equal(body.plaintext, 'Prefers vegetarian meals');
});
