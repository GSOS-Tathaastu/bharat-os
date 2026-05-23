import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertManifest,
  createControlPlane,
  createEncryptedObject,
  createIdentity,
  createNode,
  createPlacementPlan,
  netContributionScore,
  publicIdentity,
  publishManifest,
  readEncryptedObject,
  registerNode,
  signText,
  verifySignature
} from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';

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

test('identity signatures verify and reject tampering', () => {
  const identity = createIdentity({
    displayName: 'Phase 0.1 signer',
    attestations: { aadhaar: 'offline-ekyc-placeholder' }
  });
  const publicRecord = publicIdentity(identity);
  const signature = signText(identity, '{"intent":"register-node"}');

  assert.equal(verifySignature(publicRecord, '{"intent":"register-node"}', signature), true);
  assert.equal(verifySignature(publicRecord, '{"intent":"tampered"}', signature), false);
  assert.equal('privateKeyPem' in publicRecord, false);
  assert.equal('vaultKeyBase64' in publicRecord, false);
});

test('encrypted object stores pointers in manifest and payloads in chunks', () => {
  const identity = createIdentity({ displayName: 'Vault owner' });
  const plaintext = Buffer.from('Bharat OS pointer-not-payload survives the Node port.');
  const bundle = createEncryptedObject(identity, plaintext, {
    chunkSizeBytes: 10,
    contentType: 'text/plain'
  });

  assert.equal(assertManifest(bundle.manifest), true);
  assert.equal(JSON.stringify(bundle.manifest).includes(plaintext.toString('utf8')), false);
  for (const chunk of bundle.manifest.chunks) {
    assert.equal('ciphertextBase64' in chunk, false);
  }

  const roundTrip = readEncryptedObject(identity, bundle);
  assert.equal(roundTrip.toString('utf8'), plaintext.toString('utf8'));
});

test('encrypted object detects chunk tampering', () => {
  const identity = createIdentity({ displayName: 'Tamper owner' });
  const bundle = createEncryptedObject(identity, Buffer.from('tamper me'), {
    chunkSizeBytes: 4
  });
  const firstChunkId = Object.keys(bundle.chunks)[0];
  bundle.chunks[firstChunkId].ciphertextBase64 = Buffer.from('bad').toString('base64');

  assert.throws(() => readEncryptedObject(identity, bundle), /Chunk hash verification failed/);
});

test('mesh placement selects only eligible KYC charging WiFi nodes', () => {
  const identity = createIdentity({ displayName: 'Mesh owner' });
  const bundle = createEncryptedObject(identity, Buffer.from('mesh payload'));
  const controlPlane = createControlPlane();
  const eligibleA = registerNode(
    controlPlane,
    createNode({
      operatorId: identity.id,
      storageBytes: 4096,
      kycVerified: true,
      charging: true,
      wifi: true,
      batteryPercent: 90,
      trustScore: 90
    })
  );
  const eligibleB = registerNode(
    controlPlane,
    createNode({
      operatorId: identity.id,
      storageBytes: 4096,
      kycVerified: true,
      charging: true,
      wifi: true,
      batteryPercent: 80,
      trustScore: 80
    })
  );
  const notKyc = registerNode(
    controlPlane,
    createNode({
      operatorId: identity.id,
      storageBytes: 4096,
      kycVerified: false,
      charging: true,
      wifi: true,
      batteryPercent: 90,
      trustScore: 100
    })
  );

  publishManifest(controlPlane, bundle.manifest);
  const plan = createPlacementPlan(controlPlane, bundle.manifest, { replicationFactor: 2 });
  const usedNodeIds = new Set(plan.placements.map((placement) => placement.nodeId));

  assert.equal(usedNodeIds.has(eligibleA.nodeId), true);
  assert.equal(usedNodeIds.has(eligibleB.nodeId), true);
  assert.equal(usedNodeIds.has(notKyc.nodeId), false);
});

test('persistent store saves identities and encrypted bundles', async () => {
  const { store } = await freshStore('bundle');
  const identity = createIdentity({ displayName: 'Persistent owner' });
  await store.saveIdentity(identity);
  const loadedIdentity = await store.readIdentity(identity.id);

  assert.equal(loadedIdentity.id, identity.id);

  const plaintext = Buffer.from('persistent encrypted payload');
  const bundle = createEncryptedObject(identity, plaintext, { chunkSizeBytes: 8 });
  await store.saveBundle(bundle);
  const loadedBundle = await store.readBundle(bundle.manifest.manifestId);
  const roundTrip = readEncryptedObject(identity, loadedBundle);

  assert.equal(roundTrip.toString('utf8'), plaintext.toString('utf8'));
  assert.equal((await store.listManifests()).length, 1);
});

test('CLI creates identity, stores object, and reads it back', async () => {
  const { root } = await freshStore('cli');
  const inputFile = path.join(root, 'input.txt');
  const outputFile = path.join(root, 'output.txt');
  await fs.writeFile(inputFile, 'cli roundtrip payload', 'utf8');

  const init = spawnSync(process.execPath, [cliPath, 'init', '--store', root], {
    encoding: 'utf8'
  });
  assert.equal(init.status, 0, init.stderr);

  const created = spawnSync(
    process.execPath,
    [cliPath, 'identity', 'create', '--name', 'CLI Owner', '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(created.status, 0, created.stderr);
  const identityId = JSON.parse(created.stdout).identity.id;

  const put = spawnSync(
    process.execPath,
    [
      cliPath,
      'object',
      'put',
      '--identity-id',
      identityId,
      '--file',
      inputFile,
      '--content-type',
      'text/plain',
      '--chunk-size',
      '5',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(put.status, 0, put.stderr);
  const manifestId = JSON.parse(put.stdout).manifestId;

  const get = spawnSync(
    process.execPath,
    [
      cliPath,
      'object',
      'get',
      '--identity-id',
      identityId,
      '--manifest-id',
      manifestId,
      '--out',
      outputFile,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(get.status, 0, get.stderr);
  assert.equal(await fs.readFile(outputFile, 'utf8'), 'cli roundtrip payload');
});

test('net contribution score classifies producers and consumers', () => {
  assert.deepEqual(netContributionScore({ contributedBytes: 1000, consumedBytes: 250 }), {
    contributedBytes: 1000,
    consumedBytes: 250,
    scoreBytes: 750,
    class: 'producer'
  });
  assert.deepEqual(netContributionScore({ contributedBytes: 100, consumedBytes: 250 }), {
    contributedBytes: 100,
    consumedBytes: 250,
    scoreBytes: -150,
    class: 'consumer'
  });
});

