import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, createNode } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  createMeshContributionEvent,
  meshContributionSummary,
  MESH_PAYOUT_RATES,
  MESH_WORKLOAD_TYPES
} from '../../src/phase1/mesh-contribution.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

test('MESH_WORKLOAD_TYPES covers §13B Product 1 + Product 2', () => {
  assert.deepEqual(MESH_WORKLOAD_TYPES.sort(), ['inference', 'storage_serve', 'storage_store'].sort());
});

test('MESH_PAYOUT_RATES exposes the §13B operator-payout midpoints', () => {
  assert.equal(MESH_PAYOUT_RATES.payoutPaisePerMillionTokens, 800);
  assert.equal(MESH_PAYOUT_RATES.payoutPaisePerGigabyteServed, 200);
  assert.equal(MESH_PAYOUT_RATES.payoutPaisePerTerabyteStoredMonth, 7000);
});

test('createMeshContributionEvent validates required fields', () => {
  assert.throws(() => createMeshContributionEvent({}), /operatorId/);
  assert.throws(
    () => createMeshContributionEvent({ operatorId: 'a', workloadType: 'invalid' }),
    /workloadType must be one of/
  );
  assert.throws(
    () => createMeshContributionEvent({ operatorId: 'a', workloadType: 'inference' }),
    /inference events require a numeric tokens count/
  );
  assert.throws(
    () => createMeshContributionEvent({ operatorId: 'a', workloadType: 'storage_serve' }),
    /storage events require a numeric bytes count/
  );
});

test('inference event computes payout from §13B operator-payout rate', () => {
  // 1M tokens at ₹8/M = 800 paise = ₹8.00
  const event = createMeshContributionEvent({
    operatorId: 'bos:person:test',
    workloadType: 'inference',
    tokens: 1_000_000
  });
  assert.equal(event.payoutPaise, 800);
  assert.equal(event.tokens, 1_000_000);
  assert.equal(event.bytes, null);
  assert.match(event.contributionEventId, /^bos:mesh-event:/);
});

test('storage_serve event computes payout from §13B per-GB rate', () => {
  // 1 GB at ₹2/GB = 200 paise
  const event = createMeshContributionEvent({
    operatorId: 'bos:person:test',
    workloadType: 'storage_serve',
    bytes: 1024 ** 3
  });
  assert.equal(event.payoutPaise, 200);
});

test('storage_store event prorates the per-TB-month rate to a per-minute tick', () => {
  // §13B Product 1 midpoint: ₹70/TB/month = 7000 paise/TB/month.
  // Per minute: 7000 / (30*24*60) ≈ 0.162 paise per TB-minute.
  // A single tick at 1 TB rounds to 0 paise; operators earn through
  // sustained availability over many ticks, by design.
  const tiny = createMeshContributionEvent({
    operatorId: 'bos:person:test',
    workloadType: 'storage_store',
    bytes: 1024 ** 3 // 1 GB
  });
  assert.equal(tiny.payoutPaise, 0);

  // A 100 TB tick rounds to ~16 paise — proves the proration math.
  const big = createMeshContributionEvent({
    operatorId: 'bos:person:test',
    workloadType: 'storage_store',
    bytes: 100 * (1024 ** 4) // 100 TB
  });
  assert.ok(big.payoutPaise >= 1, `expected >= 1 paise, got ${big.payoutPaise}`);
});

test('device state and peer id are recorded on the event', () => {
  const event = createMeshContributionEvent({
    operatorId: 'bos:person:priya',
    nodeId: 'bos:node:abc',
    workloadType: 'inference',
    tokens: 50_000,
    peerId: 'bos:person:neighbor',
    charging: false,
    wifi: true,
    batteryPercent: 87
  });
  assert.equal(event.peerId, 'bos:person:neighbor');
  assert.equal(event.deviceState.charging, false);
  assert.equal(event.deviceState.wifi, true);
  assert.equal(event.deviceState.batteryPercent, 87);
  assert.equal(event.settlementCurrency, 'INR');
});

test('meshContributionSummary aggregates per operator', () => {
  const events = [
    createMeshContributionEvent({ operatorId: 'a', workloadType: 'inference', tokens: 500_000 }),
    createMeshContributionEvent({ operatorId: 'a', workloadType: 'storage_serve', bytes: 2 * 1024 ** 3 }),
    createMeshContributionEvent({ operatorId: 'b', workloadType: 'inference', tokens: 1_000_000 })
  ];
  const summary = meshContributionSummary('a', events);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.inferenceCount, 1);
  assert.equal(summary.storageServeCount, 1);
  assert.equal(summary.totalTokensServed, 500_000);
  assert.equal(summary.totalBytesServed, 2 * 1024 ** 3);
  // 500k tokens at ₹8/M = ₹4 = 400 paise. 2 GB at ₹2/GB = 400 paise. Total 800 paise.
  assert.equal(summary.totalPaise, 800);
  assert.equal(summary.totalRupees, 8);
});

test('store persists mesh contribution events and ledger evidence', async () => {
  const { store } = await freshStore('mesh-contribution-store');
  const identity = createIdentity({ displayName: 'Mesh operator' });
  await store.saveIdentity(identity);

  const event = createMeshContributionEvent({
    operatorId: identity.id,
    workloadType: 'inference',
    tokens: 250_000
  });
  await store.saveMeshContributionEvent(event);

  assert.equal((await store.readMeshContributionEvent(event.contributionEventId)).contributionEventId, event.contributionEventId);
  assert.equal((await store.listMeshContributionEvents()).length, 1);
  const ledger = await store.listLedger({ type: 'mesh_contribution.recorded' });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].contributionEventId, event.contributionEventId);
});

test('computeContribution folds mesh events into the NCS dynamically', async () => {
  const { store } = await freshStore('mesh-contribution-ncs');
  const identity = createIdentity({ displayName: 'Earning Priya' });
  await store.saveIdentity(identity);
  await store.saveNode(createNode({ operatorId: identity.id, storageBytes: 50 * 1024 ** 3 }));

  const before = await store.computeContribution(identity.id);
  assert.equal(before.servedBytes, 0);
  assert.equal(before.earningsPaise, 0);

  // Simulate an overnight session: 4 ticks across two workloads
  await store.saveMeshContributionEvent(
    createMeshContributionEvent({ operatorId: identity.id, workloadType: 'inference', tokens: 1_000_000 })
  );
  await store.saveMeshContributionEvent(
    createMeshContributionEvent({ operatorId: identity.id, workloadType: 'inference', tokens: 500_000 })
  );
  await store.saveMeshContributionEvent(
    createMeshContributionEvent({ operatorId: identity.id, workloadType: 'storage_serve', bytes: 1024 ** 3 })
  );

  const after = await store.computeContribution(identity.id);
  // The static capacity baseline (50 GB) stays.
  assert.equal(after.advertisedCapacityBytes, 50 * 1024 ** 3);
  // Served bytes only counts storage workloads; inference is tokens.
  assert.equal(after.servedBytes, 1024 ** 3);
  assert.equal(after.tokensServed, 1_500_000);
  // ₹8/M × 1.5M + ₹2/GB × 1 = 1200 + 200 = 1400 paise = ₹14.00
  assert.equal(after.earningsPaise, 1400);
  assert.equal(after.earningsRupees, 14);
  assert.equal(after.contributionEventCount, 3);
  // contributedBytes grew by the served bytes
  assert.equal(after.contributedBytes, after.advertisedCapacityBytes + after.servedBytes);
});
