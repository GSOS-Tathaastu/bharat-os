// Phase 6.0b — mesh-contribution dashboard aggregation + API tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  aggregateMeshByMonth,
  createMeshContributionEvent,
  MESH_CONTRIBUTION_PROTOCOL_VERSION,
  meshMonthlyStatement
} from '../../src/phase1/mesh-contribution.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'mesh-dashboard-tests');

function inferenceEvent({ operatorId, at, tokens = 1_000_000 }) {
  return createMeshContributionEvent({
    operatorId,
    nodeId: 'node-1',
    workloadType: 'inference',
    tokens,
    at
  });
}

function storageStoreEvent({ operatorId, at, bytes = 1024 ** 3 }) {
  return createMeshContributionEvent({
    operatorId,
    nodeId: 'node-1',
    workloadType: 'storage_store',
    bytes,
    at
  });
}

function federatedEvent({ operatorId, at, payoutPaise = 200 }) {
  return createMeshContributionEvent({
    operatorId,
    workloadType: 'federated_round',
    payoutPaise,
    roundId: 'r1',
    at
  });
}

// ─── aggregateMeshByMonth ────────────────────────────────────────────

test('aggregateMeshByMonth returns a versioned monthly summary', () => {
  const summary = aggregateMeshByMonth([], '2026-05', { operatorId: 'op-1' });
  assert.equal(summary.protocolVersion, MESH_CONTRIBUTION_PROTOCOL_VERSION);
  assert.equal(summary.objectType, 'mesh-monthly-summary');
  assert.equal(summary.month, '2026-05');
  assert.equal(summary.operatorId, 'op-1');
  assert.equal(summary.totalPaise, 0);
  assert.equal(summary.eventCount, 0);
  assert.deepEqual(summary.dailyTimeline, []);
});

test('aggregateMeshByMonth scopes to operatorId and the given month', () => {
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 }), // ₹8
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-03T11:00:00Z', tokens: 500_000 }),   // ₹4
    inferenceEvent({ operatorId: 'op-2', at: '2026-05-04T11:00:00Z', tokens: 1_000_000 }), // other operator
    inferenceEvent({ operatorId: 'op-1', at: '2026-04-30T23:00:00Z', tokens: 1_000_000 })  // prior month
  ];
  const summary = aggregateMeshByMonth(events, '2026-05', { operatorId: 'op-1' });
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.totalPaise, 800 + 400);
  assert.equal(summary.byWorkload.inference, 1200);
  assert.equal(summary.byWorkload.storage_serve, 0);
});

test('aggregateMeshByMonth groups payout by workload type', () => {
  // Storage_store payouts are prorated per-tick from a ₹70/TB-month
  // base, so a single tick rounds to zero paise. Use inference +
  // storage_serve + federated where the per-tick math produces
  // observable positive paise.
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z', tokens: 2_000_000 }), // ₹16
    createMeshContributionEvent({
      operatorId: 'op-1',
      nodeId: 'node-1',
      workloadType: 'storage_serve',
      bytes: 1024 ** 3, // 1 GB → ₹2 = 200 paise
      at: '2026-05-01T11:00:00Z'
    }),
    federatedEvent({ operatorId: 'op-1', at: '2026-05-02T10:00:00Z', payoutPaise: 250 })
  ];
  const summary = aggregateMeshByMonth(events, '2026-05', { operatorId: 'op-1' });
  assert.equal(summary.byWorkload.inference, 1600);
  assert.equal(summary.byWorkload.storage_serve, 200);
  assert.equal(summary.byWorkload.federated_round, 250);
  assert.equal(summary.byWorkload.storage_store, 0);
});

test('aggregateMeshByMonth produces an ascending daily timeline', () => {
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-03T10:00:00Z', tokens: 1_000_000 }),
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 }),
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T22:00:00Z', tokens: 500_000 }),
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-02T10:00:00Z', tokens: 2_000_000 })
  ];
  const summary = aggregateMeshByMonth(events, '2026-05', { operatorId: 'op-1' });
  assert.deepEqual(
    summary.dailyTimeline.map((d) => d.date),
    ['2026-05-01', '2026-05-02', '2026-05-03']
  );
  // Day 1 has two events: 1M + 0.5M tokens = ₹12 = 1200 paise.
  assert.equal(summary.dailyTimeline[0].paise, 1200);
  assert.equal(summary.dailyTimeline[0].eventCount, 2);
  assert.equal(summary.dailyTimeline[1].paise, 1600);
  assert.equal(summary.dailyTimeline[2].paise, 800);
});

test('aggregateMeshByMonth surfaces first + last event timestamps', () => {
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-15T10:00:00Z' }),
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T09:00:00Z' }),
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-28T23:00:00Z' })
  ];
  const summary = aggregateMeshByMonth(events, '2026-05', { operatorId: 'op-1' });
  assert.equal(summary.firstEventAt, '2026-05-01T09:00:00Z');
  assert.equal(summary.lastEventAt, '2026-05-28T23:00:00Z');
});

test('aggregateMeshByMonth rejects bad month strings', () => {
  assert.throws(() => aggregateMeshByMonth([], '2026'), /YYYY-MM/);
  assert.throws(() => aggregateMeshByMonth([], '2026-13'), /YYYY-MM/);
  assert.throws(() => aggregateMeshByMonth([], 'May 2026'), /YYYY-MM/);
});

test('aggregateMeshByMonth tolerates events without a timestamp', () => {
  const malformed = [
    { operatorId: 'op-1', payoutPaise: 100, workloadType: 'inference' /* no at */ },
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z' })
  ];
  const summary = aggregateMeshByMonth(malformed, '2026-05', { operatorId: 'op-1' });
  assert.equal(summary.eventCount, 1);
  assert.equal(summary.totalPaise, 800);
});

test('aggregateMeshByMonth without operatorId aggregates across operators', () => {
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z' }),
    inferenceEvent({ operatorId: 'op-2', at: '2026-05-01T10:00:00Z' })
  ];
  const summary = aggregateMeshByMonth(events, '2026-05');
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.totalPaise, 1600);
  assert.equal(summary.operatorId, null);
});

test('meshMonthlyStatement renders human-readable text', () => {
  const events = [
    inferenceEvent({ operatorId: 'op-1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 })
  ];
  const summary = aggregateMeshByMonth(events, '2026-05', { operatorId: 'op-1' });
  const text = meshMonthlyStatement(summary);
  assert.match(text, /Bharat OS mesh-contribution statement — 2026-05/);
  assert.match(text, /Total payout:\s+Rs\. 8\.00/);
  assert.match(text, /Working days:\s+1/);
  assert.match(text, /inference\s+Rs\. 8\.00/);
});

test('meshMonthlyStatement rejects malformed input', () => {
  assert.throws(() => meshMonthlyStatement(null), /summary must be/);
  assert.throws(() => meshMonthlyStatement({ objectType: 'wrong' }), /summary must be/);
});

// ─── End-to-end API ──────────────────────────────────────────────────

async function withApiServer(callback) {
  const root = path.join(tmpRoot, `srv-${Date.now()}-${process.pid}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('GET /api/identities/:id/mesh/summary returns the monthly aggregate', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'MeshWorker' });
    await store.saveIdentity(identity);
    await store.saveMeshContributionEvent(
      inferenceEvent({ operatorId: identity.id, at: '2026-05-10T10:00:00Z', tokens: 2_000_000 })
    );
    await store.saveMeshContributionEvent(
      federatedEvent({ operatorId: identity.id, at: '2026-05-12T10:00:00Z', payoutPaise: 150 })
    );
    const url = `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/summary?month=2026-05`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.month, '2026-05');
    assert.equal(body.summary.operatorId, identity.id);
    assert.equal(body.summary.totalPaise, 1600 + 150);
    assert.equal(body.summary.eventCount, 2);
    assert.equal(body.summary.dailyTimeline.length, 2);
    assert.match(body.statement, /mesh-contribution statement — 2026-05/);
  });
});

test('GET mesh/summary returns empty summary when no events exist', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'NoMesh' });
    await store.saveIdentity(identity);
    const url = `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/summary?month=2026-05`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.totalPaise, 0);
    assert.equal(body.summary.eventCount, 0);
    assert.deepEqual(body.summary.dailyTimeline, []);
  });
});

test('GET mesh/summary rejects missing month', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'NoMonth' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/summary`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'month_required');
  });
});

test('GET mesh/summary rejects bad month format', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'BadMonth' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/summary?month=2026-13`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_month');
  });
});

test('GET mesh/summary scopes to the identity (cross-user isolation)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const alice = createIdentity({ displayName: 'Alice' });
    const bob = createIdentity({ displayName: 'Bob' });
    await store.saveIdentity(alice);
    await store.saveIdentity(bob);
    await store.saveMeshContributionEvent(
      inferenceEvent({ operatorId: alice.id, at: '2026-05-10T10:00:00Z', tokens: 5_000_000 })
    );
    // Bob asks for the same month; should see zero (alice's events
    // are scoped out at the operatorId filter).
    const url = `${baseUrl}/api/identities/${encodeURIComponent(bob.id)}/mesh/summary?month=2026-05`;
    const response = await fetch(url);
    const body = await response.json();
    assert.equal(body.summary.eventCount, 0);
    assert.equal(body.summary.totalPaise, 0);
  });
});

test('GET mesh/summary 404s for unknown identity', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/api/identities/bos:person:nonexistent/mesh/summary?month=2026-05`
    );
    assert.equal(response.status, 404);
  });
});
