// Phase 13.7.1 — Compute-serving dispatch + serve tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, sha256Hex } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildComputeServingCapacity
} from '../../src/phase1/compute-serving-capacity.mjs';
import {
  buildComputeServingDispatch,
  applyServeToDispatch,
  buildComputeServingDispatchedLedgerEvent,
  buildComputeServingServedLedgerEvent,
  COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION,
  COMPUTE_SERVING_DISPATCH_STATUSES,
  COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS,
  PERMITTED_DISPATCH_KEYS
} from '../../src/phase1/compute-serving-dispatch.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'compute-serving-dispatch-tests');

function sampleCapacity(workerId = 'bos:person:worker', overrides = {}) {
  return buildComputeServingCapacity({
    workerId,
    pricePerKTokensPaise: 200,
    maxConcurrent: 2,
    maxDailyTokens: 100_000,
    constraints: { batteryMinPercent: 30, requireWifi: true, requireCharging: true },
    publishedAt: '2026-06-02T10:00:00Z',
    expiresAt: '2026-07-02T10:00:00Z',
    ...overrides
  });
}

function validInput(overrides = {}) {
  return {
    requesterId: 'bos:person:requester',
    workerId: 'bos:person:worker',
    capacityId: 'bos:compute-serving-capacity:test',
    promptHash: 'sha256:' + sha256Hex('demo prompt body bytes'),
    estimatedTokens: 500,
    requestedAt: '2026-06-02T10:00:00Z',
    ...overrides
  };
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ──────────────────────────────────────────────────

test('COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION pinned', () => {
  assert.equal(
    COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION,
    'bos.phase13.compute-serving-dispatch.v1'
  );
});

test('buildComputeServingDispatch — happy path produces pending dispatch', () => {
  const d = buildComputeServingDispatch(validInput());
  assert.ok(d.dispatchId.startsWith('bos:compute-serving-dispatch:'));
  assert.equal(d.status, 'pending');
  assert.equal(d.actualTokens, null);
  assert.equal(d.responseHash, null);
  assert.equal(d.payoutPaise, null);
  assert.equal(d.servedAt, null);
  // expiresAt is 15 minutes after requestedAt
  const expected = new Date(Date.parse('2026-06-02T10:00:00Z') + 15 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{1,3}Z$/, 'Z');
  assert.equal(d.expiresAt, expected);
});

test('content-derived dispatchId is stable for identical input', () => {
  const a = buildComputeServingDispatch(validInput());
  const b = buildComputeServingDispatch(validInput());
  assert.equal(a.dispatchId, b.dispatchId);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS) {
    assert.throws(
      () => buildComputeServingDispatch({ ...validInput(), [forbidden]: 'leak' }),
      new RegExp(`${forbidden} is not a permitted compute-serving-dispatch field`)
    );
  }
});

test('PERMITTED_DISPATCH_KEYS contains exactly the documented set', () => {
  assert.deepEqual([...PERMITTED_DISPATCH_KEYS].sort(), [
    'actualTokens',
    'capacityId',
    'dispatchId',
    'estimatedTokens',
    'expiresAt',
    'failureReason',
    'meshContributionEventId',
    'payoutPaise',
    'promptHash',
    'protocolVersion',
    'requestedAt',
    'requesterId',
    'responseHash',
    'servedAt',
    'status',
    'workerId'
  ].sort());
});

test('rejects malformed promptHash (must be sha256:<hex64>)', () => {
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), promptHash: 'not-a-hash' }),
    /promptHash must match/
  );
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), promptHash: 'sha256:short' }),
    /promptHash must match/
  );
});

test('rejects estimatedTokens outside [1, 100_000]', () => {
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), estimatedTokens: 0 }),
    /estimatedTokens must be an integer in/
  );
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), estimatedTokens: 200_000 }),
    /estimatedTokens must be an integer in/
  );
});

test('rejects dispatchId that does not match content-derived hash', () => {
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), dispatchId: 'bos:compute-serving-dispatch:spoofed' }),
    /dispatchId does not match content-derived hash/
  );
});

test('applyServeToDispatch transitions pending → served with computed payout', () => {
  const cap = sampleCapacity();
  const d = buildComputeServingDispatch({ ...validInput(), capacityId: cap.capacityId });
  const responseHash = 'sha256:' + sha256Hex('demo response body bytes');
  const served = applyServeToDispatch(d, cap, {
    actualTokens: 2500,    // 2.5K → 3 buckets × ₹2 = ₹6
    responseHash,
    servedAt: '2026-06-02T10:05:00Z'
  });
  assert.equal(served.status, 'served');
  assert.equal(served.actualTokens, 2500);
  assert.equal(served.responseHash, responseHash);
  assert.equal(served.servedAt, '2026-06-02T10:05:00Z');
  // 2500 tokens → ceil(2500/1000) = 3 buckets × 200 paise = 600
  assert.equal(served.payoutPaise, 600);
});

test('applyServeToDispatch uses ceil bucketing so workers can\'t be cheated by under-1K rounding', () => {
  const cap = sampleCapacity();
  const d = buildComputeServingDispatch({ ...validInput(), capacityId: cap.capacityId });
  const responseHash = 'sha256:' + sha256Hex('x');
  // 1 token → ceil(1/1000) = 1 bucket → ₹2
  const served = applyServeToDispatch(d, cap, {
    actualTokens: 1,
    responseHash,
    servedAt: '2026-06-02T10:05:00Z'
  });
  assert.equal(served.payoutPaise, 200);
});

test('applyServeToDispatch rejects non-pending dispatch', () => {
  const cap = sampleCapacity();
  const d = buildComputeServingDispatch({ ...validInput(), capacityId: cap.capacityId });
  const served = applyServeToDispatch(d, cap, {
    actualTokens: 1000,
    responseHash: 'sha256:' + sha256Hex('x'),
    servedAt: '2026-06-02T10:05:00Z'
  });
  assert.throws(
    () => applyServeToDispatch(served, cap, {
      actualTokens: 1000,
      responseHash: 'sha256:' + sha256Hex('x'),
      servedAt: '2026-06-02T10:06:00Z'
    }),
    /cannot serve dispatch in status served/
  );
});

test('applyServeToDispatch rejects capacity mismatch', () => {
  const cap = sampleCapacity();
  const otherCap = sampleCapacity('bos:person:other-worker');
  const d = buildComputeServingDispatch({ ...validInput(), capacityId: cap.capacityId });
  assert.throws(
    () => applyServeToDispatch(d, otherCap, {
      actualTokens: 1000,
      responseHash: 'sha256:' + sha256Hex('x'),
      servedAt: '2026-06-02T10:05:00Z'
    }),
    /capacity does not match the dispatch/
  );
});

test('buildComputeServingDispatchedLedgerEvent emits POINTER + count-only meta', () => {
  const d = buildComputeServingDispatch(validInput());
  const event = buildComputeServingDispatchedLedgerEvent({
    dispatch: d,
    at: '2026-06-02T10:00:01.547Z'
  });
  assert.equal(event.type, 'compute_serving.dispatched');
  assert.equal(event.dispatchId, d.dispatchId);
  assert.equal(event.estimatedTokens, 500);
  assert.equal(/\.\d/.test(event.at), false);
  const json = JSON.stringify(event);
  for (const forbidden of COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS) {
    assert.ok(!json.includes(`"${forbidden}"`));
  }
});

test('buildComputeServingServedLedgerEvent emits POINTER + count + payout', () => {
  const cap = sampleCapacity();
  const d = buildComputeServingDispatch({ ...validInput(), capacityId: cap.capacityId });
  const served = applyServeToDispatch(d, cap, {
    actualTokens: 2500,
    responseHash: 'sha256:' + sha256Hex('x'),
    servedAt: '2026-06-02T10:05:00Z'
  });
  const event = buildComputeServingServedLedgerEvent({
    dispatch: served,
    at: '2026-06-02T10:05:01.547Z'
  });
  assert.equal(event.type, 'compute_serving.served');
  assert.equal(event.dispatchId, served.dispatchId);
  assert.equal(event.actualTokens, 2500);
  assert.equal(event.payoutPaise, 600);
  assert.equal(/\.\d/.test(event.at), false);
});

test('rejects ms-precision timestamps via Date.parse round-trip', () => {
  const d = buildComputeServingDispatch({
    ...validInput(),
    requestedAt: '2026-06-02T10:00:00.547Z'
  });
  assert.equal(d.requestedAt, '2026-06-02T10:00:00Z');
});

test('rejects calendar-invalid requestedAt', () => {
  assert.throws(
    () => buildComputeServingDispatch({ ...validInput(), requestedAt: '2026-13-99T99:99:99Z' }),
    /requestedAt must be/
  );
});

// ─── HTTP integration ────────────────────────────────────────────

async function withApiServer(handler) {
  const { store } = await freshSqlite('http');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

async function seedRequesterWorkerCapacity(store, baseUrl) {
  const requester = createIdentity({ displayName: 'Citizen Requester' });
  const worker = createIdentity({ displayName: 'Worker Demo' });
  await store.saveIdentity(requester);
  await store.saveIdentity(worker);
  // Publish a capacity via the worker's endpoint.
  const capRes = await fetch(
    `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/compute-serving-capacity`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pricePerKTokensPaise: 200,
        maxConcurrent: 2,
        maxDailyTokens: 100_000,
        constraints: { batteryMinPercent: 30, requireWifi: true, requireCharging: true },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
    }
  );
  const capacity = (await capRes.json()).capacity;
  return { requester, worker, capacity };
}

test('POST /api/compute-serving-dispatches — happy path + emits dispatched ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    const promptHash = 'sha256:' + sha256Hex('demo prompt');
    const r = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash,
        estimatedTokens: 1000
      })
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.dispatch.status, 'pending');
    assert.equal(body.dispatch.requesterId, requester.id);
    assert.equal(body.dispatch.workerId, capacity.workerId);
    const events = await store.listLedger({ type: 'compute_serving.dispatched' });
    assert.equal(events.length, 1);
    assert.equal(events[0].dispatchId, body.dispatch.dispatchId);
  });
});

test('POST /serve — atomic: persists served + credits worker mesh + emits served event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, worker, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    const promptHash = 'sha256:' + sha256Hex('demo prompt');
    const dispatchRes = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash,
        estimatedTokens: 1000
      })
    });
    const dispatch = (await dispatchRes.json()).dispatch;
    const responseHash = 'sha256:' + sha256Hex('demo response');
    const serveRes = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/serve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerId: worker.id,
          actualTokens: 2500,
          responseHash
        })
      }
    );
    assert.equal(serveRes.status, 200);
    const body = await serveRes.json();
    assert.equal(body.dispatch.status, 'served');
    assert.equal(body.dispatch.actualTokens, 2500);
    assert.equal(body.dispatch.payoutPaise, 600); // 3 buckets × ₹2
    assert.ok(body.meshContributionEvent.contributionEventId);
    assert.equal(body.meshContributionEvent.payoutPaise, 600);
    // Both ledger events present.
    const dispatched = await store.listLedger({ type: 'compute_serving.dispatched' });
    const served = await store.listLedger({ type: 'compute_serving.served' });
    assert.equal(dispatched.length, 1);
    assert.equal(served.length, 1);
  });
});

test('POST /serve rejects non-assigned worker (403)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    const intruder = createIdentity({ displayName: 'Intruder' });
    await store.saveIdentity(intruder);
    const promptHash = 'sha256:' + sha256Hex('demo prompt');
    const dispatchRes = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash,
        estimatedTokens: 1000
      })
    });
    const dispatch = (await dispatchRes.json()).dispatch;
    const serveRes = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/serve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerId: intruder.id,
          actualTokens: 1000,
          responseHash: 'sha256:' + sha256Hex('x')
        })
      }
    );
    assert.equal(serveRes.status, 403);
    const body = await serveRes.json();
    assert.equal(body.error.code, 'not_assigned');
  });
});

test('POST dispatch self-dispatch rejected with 409', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { worker, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    const promptHash = 'sha256:' + sha256Hex('demo');
    const r = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: worker.id, // self
        capacityId: capacity.capacityId,
        promptHash,
        estimatedTokens: 1000
      })
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, 'self_dispatch');
  });
});

test('POST dispatch rejects paused capacity (409)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, worker, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    // pause the capacity
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/compute-serving-capacity/${encodeURIComponent(capacity.capacityId)}/pause`,
      { method: 'POST' }
    );
    const r = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash: 'sha256:' + sha256Hex('x'),
        estimatedTokens: 1000
      })
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, 'capacity_not_active');
  });
});

test('GET /api/identities/:id/compute-serving-dispatches/sent returns requester history', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash: 'sha256:' + sha256Hex('demo'),
        estimatedTokens: 1000
      })
    });
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(requester.id)}/compute-serving-dispatches/sent`
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.dispatches.length, 1);
    assert.equal(body.protocolVersion, COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION);
  });
});

test('GET /api/identities/:id/compute-serving-dispatches/pending returns worker queue', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, worker, capacity } = await seedRequesterWorkerCapacity(store, baseUrl);
    await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterId: requester.id,
        capacityId: capacity.capacityId,
        promptHash: 'sha256:' + sha256Hex('demo'),
        estimatedTokens: 1000
      })
    });
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/compute-serving-dispatches/pending`
    );
    const body = await r.json();
    assert.equal(body.dispatches.length, 1);
    assert.equal(body.dispatches[0].workerId, worker.id);
    assert.equal(body.dispatches[0].status, 'pending');
  });
});

test('serve 404 on unknown dispatch', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { worker } = await seedRequesterWorkerCapacity(store, baseUrl);
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/bos:compute-serving-dispatch:nope/serve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerId: worker.id,
          actualTokens: 1000,
          responseHash: 'sha256:' + sha256Hex('x')
        })
      }
    );
    assert.equal(r.status, 404);
  });
});

// DPDP cascade — by either requester or worker side.
test('eraseUserData cascades dispatches by requesterId', async () => {
  const { store } = await freshSqlite('cascade-req');
  try {
    const requester = createIdentity({ displayName: 'Citizen Requester' });
    const worker = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(requester);
    await store.saveIdentity(worker);
    const cap = buildComputeServingCapacity({
      workerId: worker.id,
      pricePerKTokensPaise: 200,
      maxConcurrent: 2,
      maxDailyTokens: 100_000,
      constraints: { batteryMinPercent: 30, requireWifi: true, requireCharging: true },
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    await store.saveComputeServingCapacity(cap);
    const d = buildComputeServingDispatch({
      requesterId: requester.id,
      workerId: worker.id,
      capacityId: cap.capacityId,
      promptHash: 'sha256:' + sha256Hex('demo'),
      estimatedTokens: 1000,
      requestedAt: new Date().toISOString()
    });
    await store.saveComputeServingDispatch(d);
    const before = await store.listComputeServingDispatches({ requesterId: requester.id });
    assert.equal(before.length, 1);
    await store.eraseUserData(requester.id, { redactLedgerEntry: (e) => e });
    const after = await store.listComputeServingDispatches({ requesterId: requester.id });
    assert.equal(after.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('eraseUserData cascades dispatches by workerId', async () => {
  const { store } = await freshSqlite('cascade-worker');
  try {
    const requester = createIdentity({ displayName: 'Citizen Requester' });
    const worker = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(requester);
    await store.saveIdentity(worker);
    const cap = buildComputeServingCapacity({
      workerId: worker.id,
      pricePerKTokensPaise: 200,
      maxConcurrent: 2,
      maxDailyTokens: 100_000,
      constraints: { batteryMinPercent: 30, requireWifi: true, requireCharging: true },
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    await store.saveComputeServingCapacity(cap);
    const d = buildComputeServingDispatch({
      requesterId: requester.id,
      workerId: worker.id,
      capacityId: cap.capacityId,
      promptHash: 'sha256:' + sha256Hex('demo'),
      estimatedTokens: 1000,
      requestedAt: new Date().toISOString()
    });
    await store.saveComputeServingDispatch(d);
    await store.eraseUserData(worker.id, { redactLedgerEntry: (e) => e });
    const after = await store.listComputeServingDispatches({ workerId: worker.id });
    assert.equal(after.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});
