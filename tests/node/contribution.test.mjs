import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, createNode } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createMemoryRecord } from '../../src/phase1/memory.mjs';
import { createTrustPassport } from '../../src/phase1/trust-passport.mjs';

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

test('computeContribution treats an identity with no nodes and no memory as a zero-byte consumer', async () => {
  const { store } = await freshStore('contribution-zero');
  const identity = createIdentity({ displayName: 'Empty actor' });
  await store.saveIdentity(identity);

  const contribution = await store.computeContribution(identity.id);
  assert.equal(contribution.identityId, identity.id);
  assert.equal(contribution.contributedBytes, 0);
  assert.equal(contribution.consumedBytes, 0);
  assert.equal(contribution.scoreBytes, 0);
  assert.equal(contribution.class, 'producer'); // NCS >= 0 is producer per §13B
  assert.equal(contribution.nodeCount, 0);
  assert.equal(contribution.memoryRecordCount, 0);
});

test('computeContribution sums storageBytes across nodes the identity operates', async () => {
  const { store } = await freshStore('contribution-producer');
  const identity = createIdentity({ displayName: 'Producer Priya' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 20 * 1024 * 1024 * 1024 }));
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 30 * 1024 * 1024 * 1024 }));

  const contribution = await store.computeContribution(identity.id);
  assert.equal(contribution.nodeCount, 2);
  assert.equal(contribution.contributedBytes, 50 * 1024 * 1024 * 1024);
  assert.equal(contribution.consumedBytes, 0);
  assert.equal(contribution.class, 'producer');
  assert.ok(contribution.scoreBytes > 0);
});

test('computeContribution counts memory records as consumed bytes', async () => {
  const { store } = await freshStore('contribution-mixed');
  const identity = createIdentity({ displayName: 'Mixed Rajesh' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 1000 }));

  const { record: caRecord } = createMemoryRecord(identity, Buffer.alloc(700, 'x'), {
    label: 'CA file',
    tags: ['ca', 'audit'],
    source: { type: 'document', name: 'GST return Q4' }
  });
  await store.saveMemoryRecord(caRecord);

  const contribution = await store.computeContribution(identity.id);
  assert.equal(contribution.contributedBytes, 1000);
  assert.equal(contribution.consumedBytes, 700);
  assert.equal(contribution.scoreBytes, 300);
  assert.equal(contribution.class, 'producer'); // 300 >= 0
  assert.equal(contribution.memoryRecordCount, 1);
});

test('computeContribution returns consumer class when consumption exceeds contribution', async () => {
  const { store } = await freshStore('contribution-consumer');
  const identity = createIdentity({ displayName: 'Net consumer' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 100 }));

  const { record: bigRecord } = createMemoryRecord(identity, Buffer.alloc(500, 'y'), {
    label: 'Big file',
    tags: ['large']
  });
  await store.saveMemoryRecord(bigRecord);

  const contribution = await store.computeContribution(identity.id);
  assert.equal(contribution.scoreBytes, -400);
  assert.equal(contribution.class, 'consumer');
});

test('Trust Passport includes a mesh block computed from nodes and memory', async () => {
  const { store } = await freshStore('passport-mesh');
  const identity = createIdentity({ displayName: 'Passport actor' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 2048 }));
  const { record: demoRecord } = createMemoryRecord(identity, Buffer.alloc(512, 'z'), {
    label: 'A record',
    tags: ['demo']
  });
  await store.saveMemoryRecord(demoRecord);

  const passport = createTrustPassport(identity, {
    nodes: await store.listNodes(),
    memoryRecords: await store.listMemoryRecords()
  });

  assert.ok(passport.mesh, 'passport should expose a mesh block');
  assert.equal(passport.mesh.contributedBytes, 2048);
  assert.equal(passport.mesh.consumedBytes, 512);
  assert.equal(passport.mesh.scoreBytes, 1536);
  assert.equal(passport.mesh.class, 'producer');
  assert.equal(passport.mesh.nodeCount, 1);
  assert.equal(passport.mesh.memoryRecordCount, 1);
});

test('Trust Passport mesh block prefers a pre-computed contribution argument', async () => {
  const identity = createIdentity({ displayName: 'Preset actor' });
  const passport = createTrustPassport(identity, {
    contribution: {
      contributedBytes: 9999,
      consumedBytes: 1111,
      scoreBytes: 8888,
      class: 'producer',
      nodeCount: 3,
      memoryRecordCount: 5
    }
  });
  assert.equal(passport.mesh.contributedBytes, 9999);
  assert.equal(passport.mesh.nodeCount, 3);
});

test('Trust Passport surfaces a flagReports block (open / openHighSeverity / resolved / dismissed)', () => {
  const identity = createIdentity({ displayName: 'Flag actor' });
  const flagReports = [
    { subjectId: identity.id, status: 'pending', severity: 'high' },
    { subjectId: identity.id, status: 'under_review', severity: 'medium' },
    { subjectId: identity.id, status: 'resolved', severity: 'low' },
    { subjectId: identity.id, status: 'dismissed', severity: 'low' },
    { subjectId: 'someone-else', status: 'pending', severity: 'high' }
  ];
  const passport = createTrustPassport(identity, { flagReports });
  assert.ok(passport.flagReports, 'passport exposes flagReports block');
  assert.equal(passport.flagReports.total, 4);
  assert.equal(passport.flagReports.open, 2);
  assert.equal(passport.flagReports.openHighSeverity, 1);
  assert.equal(passport.flagReports.resolved, 1);
  assert.equal(passport.flagReports.dismissed, 1);
});

test('Trust Passport flagReports block defaults to zeros when no reports provided', () => {
  const identity = createIdentity({ displayName: 'No flag actor' });
  const passport = createTrustPassport(identity, {});
  assert.equal(passport.flagReports.total, 0);
  assert.equal(passport.flagReports.open, 0);
  assert.equal(passport.flagReports.openHighSeverity, 0);
});

test('CLI: bos contribution show returns the NCS block for an identity', async () => {
  const { root, store } = await freshStore('contribution-cli');
  const identity = createIdentity({ displayName: 'CLI actor' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 4096 }));

  const result = spawnSync(
    process.execPath,
    [cliPath, 'contribution', 'show', '--identity-id', identity.id, '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.contribution.identityId, identity.id);
  assert.equal(body.contribution.contributedBytes, 4096);
  assert.equal(body.contribution.class, 'producer');
});
