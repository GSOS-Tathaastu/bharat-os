// Phase 13.7 — Compute-serving capacity tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildComputeServingCapacity,
  revokeComputeServingCapacity,
  pauseComputeServingCapacity,
  buildComputeServingCapacityLedgerEvent,
  COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION,
  COMPUTE_SERVING_CAPACITY_STATUSES,
  COMPUTE_SERVING_CAPACITY_FORBIDDEN_SUBSTRINGS,
  PERMITTED_CAPACITY_KEYS,
  PERMITTED_CONSTRAINT_KEYS
} from '../../src/phase1/compute-serving-capacity.mjs';
import { createMeshContributionEvent } from '../../src/phase1/mesh-contribution.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'compute-serving-capacity-tests');

function validInput(overrides = {}) {
  return {
    workerId: 'bos:person:test-worker',
    pricePerKTokensPaise: 200,
    maxConcurrent: 2,
    maxDailyTokens: 100_000,
    constraints: {
      batteryMinPercent: 30,
      requireWifi: true,
      requireCharging: true
    },
    publishedAt: '2026-06-02T10:00:00Z',
    expiresAt: '2026-07-02T10:00:00Z',
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

test('COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION pinned', () => {
  assert.equal(
    COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION,
    'bos.phase13.compute-serving-capacity.v1'
  );
});

test('buildComputeServingCapacity — happy path', () => {
  const cap = buildComputeServingCapacity(validInput());
  assert.ok(cap.capacityId.startsWith('bos:compute-serving-capacity:'));
  assert.equal(cap.workerId, 'bos:person:test-worker');
  assert.equal(cap.pricePerKTokensPaise, 200);
  assert.equal(cap.maxConcurrent, 2);
  assert.equal(cap.maxDailyTokens, 100_000);
  assert.deepEqual(cap.constraints, {
    batteryMinPercent: 30,
    requireWifi: true,
    requireCharging: true
  });
  assert.equal(cap.status, 'active');
  assert.equal(cap.protocolVersion, COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION);
});

test('content-derived capacityId is stable', () => {
  const a = buildComputeServingCapacity(validInput());
  const b = buildComputeServingCapacity(validInput());
  assert.equal(a.capacityId, b.capacityId);
});

test('different price produces a different capacityId', () => {
  const a = buildComputeServingCapacity(validInput());
  const b = buildComputeServingCapacity(validInput({ pricePerKTokensPaise: 300 }));
  assert.notEqual(a.capacityId, b.capacityId);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of COMPUTE_SERVING_CAPACITY_FORBIDDEN_SUBSTRINGS) {
    assert.throws(
      () => buildComputeServingCapacity({ ...validInput(), [forbidden]: 'leak' }),
      new RegExp(`${forbidden} is not a permitted compute-serving-capacity field`)
    );
  }
});

test('PERMITTED_CAPACITY_KEYS contains exactly the documented set', () => {
  // Sort comparison ignores ordering — assert set equality.
  assert.deepEqual([...PERMITTED_CAPACITY_KEYS].sort(), [
    'capacityId',
    'constraints',
    'expiresAt',
    'maxConcurrent',
    'maxDailyTokens',
    'pausedAt',
    'pricePerKTokensPaise',
    'protocolVersion',
    'publishedAt',
    'revokeReason',
    'revokedAt',
    'status',
    'workerId'
  ].sort());
});

test('PERMITTED_CONSTRAINT_KEYS contains exactly the documented set', () => {
  assert.deepEqual([...PERMITTED_CONSTRAINT_KEYS].sort(), [
    'batteryMinPercent',
    'requireCharging',
    'requireWifi'
  ]);
});

test('strict allowlist rejects forbidden constraints keys', () => {
  assert.throws(
    () => buildComputeServingCapacity({
      ...validInput(),
      constraints: { ...validInput().constraints, deviceFingerprint: 'leak' }
    }),
    /constraints\.deviceFingerprint is not a permitted constraint field/
  );
});

test('rejects pricePerKTokensPaise outside [50, 50_000]', () => {
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), pricePerKTokensPaise: 10 }),
    /pricePerKTokensPaise must be an integer in/
  );
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), pricePerKTokensPaise: 100_000 }),
    /pricePerKTokensPaise must be an integer in/
  );
});

test('rejects maxConcurrent outside [1, 4]', () => {
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), maxConcurrent: 0 }),
    /maxConcurrent must be an integer in/
  );
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), maxConcurrent: 10 }),
    /maxConcurrent must be an integer in/
  );
});

test('rejects maxDailyTokens outside [10K, 10M]', () => {
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), maxDailyTokens: 1000 }),
    /maxDailyTokens must be an integer in/
  );
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), maxDailyTokens: 99_999_999 }),
    /maxDailyTokens must be an integer in/
  );
});

test('rejects batteryMinPercent outside [20, 100]', () => {
  assert.throws(
    () => buildComputeServingCapacity({
      ...validInput(),
      constraints: { ...validInput().constraints, batteryMinPercent: 10 }
    }),
    /constraints\.batteryMinPercent must be an integer in/
  );
});

test('rejects non-boolean constraints', () => {
  assert.throws(
    () => buildComputeServingCapacity({
      ...validInput(),
      constraints: { ...validInput().constraints, requireWifi: 'yes' }
    }),
    /constraints\.requireWifi must be a boolean/
  );
});

test('rejects TTL < 24 hours or > 90 days', () => {
  assert.throws(
    () => buildComputeServingCapacity({
      ...validInput(),
      publishedAt: '2026-06-02T10:00:00Z',
      expiresAt: '2026-06-02T11:00:00Z'
    }),
    /at least 24 hours/
  );
  assert.throws(
    () => buildComputeServingCapacity({
      ...validInput(),
      publishedAt: '2026-06-02T10:00:00Z',
      expiresAt: '2027-12-31T10:00:00Z'
    }),
    /more than 90 days/
  );
});

test('rejects calendar-invalid publishedAt', () => {
  assert.throws(
    () => buildComputeServingCapacity({ ...validInput(), publishedAt: '2026-13-99T99:99:99Z' }),
    /publishedAt must be/
  );
});

test('strips ms precision from publishedAt + expiresAt', () => {
  const cap = buildComputeServingCapacity({
    ...validInput(),
    publishedAt: '2026-06-02T10:00:00.547Z',
    expiresAt: '2026-07-02T10:00:00.123Z'
  });
  assert.equal(cap.publishedAt, '2026-06-02T10:00:00Z');
  assert.equal(cap.expiresAt, '2026-07-02T10:00:00Z');
});

test('revokeComputeServingCapacity transitions with worker attribution', () => {
  const cap = buildComputeServingCapacity(validInput());
  const revoked = revokeComputeServingCapacity(cap, {
    revokedBy: cap.workerId,
    reason: 'taking break'
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokeReason, 'taking break');
});

test('revokeComputeServingCapacity rejects revoke by non-worker', () => {
  const cap = buildComputeServingCapacity(validInput());
  assert.throws(
    () => revokeComputeServingCapacity(cap, { revokedBy: 'bos:person:other' }),
    /only the publishing worker/
  );
});

test('pauseComputeServingCapacity transitions active → paused; rejects on non-active', () => {
  const cap = buildComputeServingCapacity(validInput());
  const paused = pauseComputeServingCapacity(cap);
  assert.equal(paused.status, 'paused');
  assert.throws(() => pauseComputeServingCapacity(paused), /cannot pause capacity in status paused/);
});

test('buildComputeServingCapacityLedgerEvent emits POINTER + count-only meta', () => {
  const cap = buildComputeServingCapacity(validInput());
  const event = buildComputeServingCapacityLedgerEvent({
    capacity: cap,
    eventType: 'compute_serving_capacity.published',
    at: '2026-06-02T10:00:01.547Z'
  });
  assert.equal(event.type, 'compute_serving_capacity.published');
  assert.equal(event.capacityId, cap.capacityId);
  assert.equal(event.workerId, cap.workerId);
  assert.equal(event.pricePerKTokensPaise, 200);
  assert.equal(/\.\d/.test(event.at), false);
  // §15 — no forbidden substring leaks.
  const json = JSON.stringify(event);
  for (const forbidden of COMPUTE_SERVING_CAPACITY_FORBIDDEN_SUBSTRINGS) {
    assert.ok(!json.includes(`"${forbidden}"`));
  }
});

// Phase 13.7 — mesh-contribution compute_serving event shape.
test('createMeshContributionEvent compute_serving carries pointers + payout', () => {
  const event = createMeshContributionEvent({
    operatorId: 'bos:person:worker',
    workloadType: 'compute_serving',
    tokens: 2500,
    payoutPaise: 500,
    computeServingCapacityId: 'bos:compute-serving-capacity:c1',
    computeServingDispatchId: 'bos:compute-serving-dispatch:d1'
  });
  assert.equal(event.workloadType, 'compute_serving');
  assert.equal(event.tokens, 2500);
  assert.equal(event.bytes, null);
  assert.equal(event.payoutPaise, 500);
  assert.equal(event.computeServingCapacityId, 'bos:compute-serving-capacity:c1');
  assert.equal(event.computeServingDispatchId, 'bos:compute-serving-dispatch:d1');
});

test('createMeshContributionEvent compute_serving caps payout at ₹50 (5000 paise)', () => {
  const event = createMeshContributionEvent({
    operatorId: 'bos:person:worker',
    workloadType: 'compute_serving',
    tokens: 100_000,
    payoutPaise: 1_000_000   // ₹10,000 — over the per-dispatch cap
  });
  assert.equal(event.payoutPaise, 5000);
});

test('createMeshContributionEvent compute_serving requires tokens', () => {
  assert.throws(
    () =>
      createMeshContributionEvent({
        operatorId: 'bos:person:worker',
        workloadType: 'compute_serving',
        payoutPaise: 500
      }),
    /compute_serving events require a numeric tokens count/
  );
});

// FE↔BE convergence.
test('Phase 13.7 — FE COMPUTE_SERVING_CAPACITY_STATUSES matches BE', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'compute-serving-capacity.ts');
  const source = await fs.readFile(fePath, 'utf8');
  const re = /export const COMPUTE_SERVING_CAPACITY_STATUSES = Object\.freeze\(\[([\s\S]+?)\] as const\);/;
  const match = re.exec(source);
  assert.ok(match);
  const feMembers = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...COMPUTE_SERVING_CAPACITY_STATUSES].sort(), feMembers);
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

function capacityBody(overrides = {}) {
  return {
    pricePerKTokensPaise: 200,
    maxConcurrent: 2,
    maxDailyTokens: 100_000,
    constraints: { batteryMinPercent: 30, requireWifi: true, requireCharging: true },
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

test('POST /api/identities/:id/compute-serving-capacity — happy path persists + emits published event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(capacityBody())
      }
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.capacity.workerId, identity.id);
    assert.equal(body.capacity.status, 'active');
    const events = await store.listLedger({ type: 'compute_serving_capacity.published' });
    assert.equal(events.length, 1);
    assert.equal(events[0].capacityId, body.capacity.capacityId);
  });
});

test('POST duplicate capacity returns 409', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const body = capacityBody({ expiresAt: '2026-07-15T10:00:00Z' });
    const first = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(first.status, 201);
    const second = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(second.status, 409);
    const errBody = await second.json();
    assert.equal(errBody.error.code, 'duplicate_capacity');
  });
});

test('POST malformed envelope 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(capacityBody({ pricePerKTokensPaise: 0 }))
      }
    );
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_compute_serving_capacity');
  });
});

test('GET returns worker capacities + supported enums', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capacityBody()) }
    );
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`
    );
    const body = await r.json();
    assert.equal(body.capacities.length, 1);
    assert.equal(body.protocolVersion, COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION);
  });
});

test('DELETE revokes (worker-only, emits ledger)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const post = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capacityBody()) }
    );
    const created = (await post.json()).capacity;
    const del = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity/${encodeURIComponent(created.capacityId)}`,
      { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'taking break' }) }
    );
    assert.equal(del.status, 200);
    const body = await del.json();
    assert.equal(body.capacity.status, 'revoked');
    const events = await store.listLedger({ type: 'compute_serving_capacity.revoked' });
    assert.equal(events.length, 1);
  });
});

test('POST /pause transitions active → paused', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const post = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capacityBody()) }
    );
    const created = (await post.json()).capacity;
    const pause = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity/${encodeURIComponent(created.capacityId)}/pause`,
      { method: 'POST' }
    );
    assert.equal(pause.status, 200);
    const body = await pause.json();
    assert.equal(body.capacity.status, 'paused');
  });
});

test('DELETE 404 on unknown capacity / wrong worker', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/compute-serving-capacity/bos:compute-serving-capacity:nope`,
      { method: 'DELETE' }
    );
    assert.equal(r.status, 404);
  });
});

// DPDP cascade.
test('eraseUserData cascades compute-serving capacities by workerId', async () => {
  const { store } = await freshSqlite('cascade');
  try {
    const identity = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(identity);
    const cap = buildComputeServingCapacity({
      ...validInput(),
      workerId: identity.id,
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    await store.saveComputeServingCapacity(cap);
    const before = await store.listComputeServingCapacities({ workerId: identity.id });
    assert.equal(before.length, 1);
    await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
    const after = await store.listComputeServingCapacities({ workerId: identity.id });
    assert.equal(after.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});
