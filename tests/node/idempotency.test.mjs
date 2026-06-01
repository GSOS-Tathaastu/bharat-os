// Phase 12.1b.2 — Ledger-backed idempotency substrate tests.
//
// Covers:
//   1. Pure module: isValidIdempotencyKey, computeRequestFingerprint,
//      withIdempotency mint / replay / fingerprint-mismatch / per-actor
//      scoping / malformed-key.
//   2. HTTP: POST /api/orchestrations with header → minted; replay
//      returns 200 byte-equal body; downstream effects fire ONCE;
//      fingerprint mismatch → 409 tripwire; per-actor scoping.
//   3. GET /api/health basic.
//   4. §15 binding: idempotency.mjs source has no override / route field.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  isValidIdempotencyKey,
  computeRequestFingerprint,
  withIdempotency,
  findMintedRecord,
  mintedEventType,
  replayEventType,
  reusedEventType,
  IdempotencyError,
  IDEMPOTENCY_PROTOCOL_VERSION
} from '../../src/phase0/idempotency.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'idempotency-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ───────────────────────────────────────────────────

test('isValidIdempotencyKey accepts 32 lowercase hex', () => {
  assert.equal(isValidIdempotencyKey('abcd1234'.repeat(4)), true);
  assert.equal(isValidIdempotencyKey('ABCD1234'.repeat(4)), false, 'uppercase rejected');
  assert.equal(isValidIdempotencyKey('abc'), false, 'too short rejected');
  assert.equal(isValidIdempotencyKey(''), false);
  assert.equal(isValidIdempotencyKey(null), false);
  assert.equal(isValidIdempotencyKey(undefined), false);
  assert.equal(isValidIdempotencyKey('z' + 'a'.repeat(31)), false, 'non-hex rejected');
});

test('computeRequestFingerprint is deterministic', () => {
  const a = computeRequestFingerprint({ intentText: 'Book a cab', actorId: 'bos:person:c' });
  const b = computeRequestFingerprint({ actorId: 'bos:person:c', intentText: 'Book a cab' });
  assert.equal(a, b, 'stable across key order');
  const c = computeRequestFingerprint({ intentText: 'Different text', actorId: 'bos:person:c' });
  assert.notEqual(a, c);
});

test('event type helpers compose scope correctly', () => {
  assert.equal(mintedEventType('orchestration.create'), 'orchestration.create.idempotency_key_minted');
  assert.equal(replayEventType('orchestration.create'), 'orchestration.create.idempotent_replay');
  assert.equal(reusedEventType('orchestration.create'), 'orchestration.create.idempotency_key_reused_with_different_payload');
});

test('withIdempotency: no key → runs worker once, source=fresh', async () => {
  const { store } = await freshSqlite('no-key');
  try {
    let runs = 0;
    const out = await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:c',
      idempotencyKey: null,
      requestBody: { x: 1 }
    }, async () => { runs += 1; return { ok: true }; });
    assert.equal(out.source, 'fresh');
    assert.equal(runs, 1);
    // No minted event written when no key.
    const ledger = await store.listLedger({ type: mintedEventType('orchestration.create') });
    assert.equal(ledger.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('withIdempotency: first call mints, second call replays (worker NOT re-entered)', async () => {
  const { store } = await freshSqlite('mint-replay');
  try {
    const key = 'a'.repeat(32);
    let runs = 0;
    const fresh = await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:c',
      idempotencyKey: key,
      requestBody: { intentText: 'Book a cab' }
    }, async () => { runs += 1; return { ok: true, orchestrationId: 'bos:orch:X' }; });
    assert.equal(fresh.source, 'fresh');
    assert.equal(fresh.body.orchestrationId, 'bos:orch:X');

    const replay = await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:c',
      idempotencyKey: key,
      requestBody: { intentText: 'Book a cab' }
    }, async () => { runs += 1; return { ok: true, orchestrationId: 'bos:orch:DIFFERENT' }; });
    assert.equal(replay.source, 'replay');
    assert.equal(replay.body.orchestrationId, 'bos:orch:X', 'returns the cached body verbatim');
    assert.equal(runs, 1, 'worker fired exactly once');

    const ledger = await store.listLedger({ limit: 100 });
    const minted = ledger.filter((e) => e.type === mintedEventType('orchestration.create'));
    const replayed = ledger.filter((e) => e.type === replayEventType('orchestration.create'));
    assert.equal(minted.length, 1);
    assert.equal(replayed.length, 1);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('withIdempotency: same key + different fingerprint → 409 + tripwire event, worker NOT re-entered', async () => {
  const { store } = await freshSqlite('fingerprint-mismatch');
  try {
    const key = 'b'.repeat(32);
    let runs = 0;
    await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:c',
      idempotencyKey: key,
      requestBody: { intentText: 'Book a cab' }
    }, async () => { runs += 1; return { ok: true }; });
    await assert.rejects(
      withIdempotency(store, {
        scope: 'orchestration.create',
        actorId: 'bos:person:c',
        idempotencyKey: key,
        requestBody: { intentText: 'Pay my bill' }
      }, async () => { runs += 1; return { ok: true }; }),
      (err) => err instanceof IdempotencyError && err.code === 'idempotency_key_reused_with_different_payload' && err.status === 409
    );
    assert.equal(runs, 1, 'worker fired exactly once');
    const tripwire = (await store.listLedger({ limit: 100 })).filter(
      (e) => e.type === reusedEventType('orchestration.create')
    );
    assert.equal(tripwire.length, 1);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('withIdempotency: per-actor scoping — same key, different actor → new mint', async () => {
  const { store } = await freshSqlite('per-actor');
  try {
    const key = 'c'.repeat(32);
    let runs = 0;
    await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:alice',
      idempotencyKey: key,
      requestBody: { x: 1 }
    }, async () => { runs += 1; return { who: 'alice' }; });
    const bob = await withIdempotency(store, {
      scope: 'orchestration.create',
      actorId: 'bos:person:bob',
      idempotencyKey: key,
      requestBody: { x: 1 }
    }, async () => { runs += 1; return { who: 'bob' }; });
    assert.equal(bob.source, 'fresh');
    assert.equal(bob.body.who, 'bob');
    assert.equal(runs, 2);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('withIdempotency: malformed key → IdempotencyError 400', async () => {
  const { store } = await freshSqlite('malformed-key');
  try {
    await assert.rejects(
      withIdempotency(store, {
        scope: 'orchestration.create',
        actorId: 'bos:person:c',
        idempotencyKey: 'not-32-hex',
        requestBody: { x: 1 }
      }, async () => ({ ok: true })),
      (err) => err.code === 'idempotency_key_malformed' && err.status === 400
    );
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

// ─── HTTP integration ─────────────────────────────────────────────

async function withApiServer(callback) {
  const { store } = await freshSqlite('srv');
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

test('GET /api/health returns 200 + json + cache-control no-store', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/health`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(body.at);
  });
});

test('POST /api/orchestrations with Idempotency-Key: first call mints, second returns 200 byte-equal', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const key = '1'.repeat(32);
    const payload = JSON.stringify({
      intentText: 'Book a cab to PMC',
      actorId: citizen.id,
      locale: 'en-IN'
    });
    const first = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: payload
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.ok(firstBody.orchestration?.orchestrationId);
    const firstId = firstBody.orchestration.orchestrationId;

    const second = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: payload
    });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-bharat-os-idempotent-replay'), '1');
    const secondBody = await second.json();
    assert.equal(secondBody.orchestration.orchestrationId, firstId, 'same orchestrationId');

    // Downstream side-effects (saveOrchestration, saveDecision,
    // saveSkillPreflight) should have fired exactly once — verify by
    // counting orchestrations.
    const all = await store.listOrchestrations();
    const matching = all.filter((o) => o.orchestrationId === firstId);
    assert.equal(matching.length, 1, 'orchestration persisted once');
  });
});

test('POST /api/orchestrations with same key but different intentText → 409 tripwire', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const key = '2'.repeat(32);
    const okPayload = JSON.stringify({ intentText: 'Book a cab', actorId: citizen.id, locale: 'en-IN' });
    const okResp = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: okPayload
    });
    assert.equal(okResp.status, 201);
    const bad = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ intentText: 'Pay my bill', actorId: citizen.id, locale: 'en-IN' })
    });
    assert.equal(bad.status, 409);
    const body = await bad.json();
    assert.equal(body.error.code, 'idempotency_key_reused_with_different_payload');
  });
});

test('POST /api/orchestrations malformed Idempotency-Key → 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'not-32-hex' },
      body: JSON.stringify({ intentText: 'Hi', actorId: citizen.id, locale: 'en-IN' })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'idempotency_key_malformed');
  });
});

test('POST /api/orchestrations without Idempotency-Key keeps legacy behaviour (201)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intentText: 'Book a cab', actorId: citizen.id, locale: 'en-IN' })
    });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('x-bharat-os-idempotent-replay'), null);
  });
});

// ─── §15 binding ──────────────────────────────────────────────────

test('§15 binding: idempotency.mjs source has no override / commission / payload-echo fields', async () => {
  const src = await fs.readFile(path.join(repoRoot, 'src/phase0/idempotency.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/\boverride\b/.test(code), 'no override field');
  assert.ok(!/\bcommission\b/.test(code), 'no commission field');
  assert.ok(!/\bplatformFee\b/.test(code), 'no platformFee field');
  assert.ok(!/rawBody/.test(code), 'no rawBody payload-echo');
});

test('IDEMPOTENCY_PROTOCOL_VERSION constant present', () => {
  assert.ok(IDEMPOTENCY_PROTOCOL_VERSION.startsWith('bos.phase0.idempotency.'));
});
