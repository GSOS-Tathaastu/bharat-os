// Phase 12.1b.1 — Intent annotation substrate tests.
//
// Covers:
//   1. Pure module: validator clip, comparer verdicts, ledger
//      event builder shape.
//   2. Orchestrator pass-through: annotation rides on intent.slmAnnotation
//      and is NOT used to override actionRequest.actionType.
//   3. HTTP: 400 on malformed annotation; valid annotation lands on
//      saved orchestration; verdict ledger event fires (agreed /
//      disagreed / fe_only / server_only / absent).
//   4. §15 binding: annotation cannot make the orchestrator route
//      to a different action than its deterministic parse would.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { orchestrateIntent } from '../../src/phase1/orchestrator.mjs';
import {
  normaliseIntentAnnotation,
  compareIntentAnnotation,
  buildIntentAnnotationLedgerEvent,
  INTENT_ANNOTATION_VERDICTS,
  INTENT_ANNOTATION_PROTOCOL_VERSION
} from '../../src/phase0/intent-annotation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'intent-annotation-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ───────────────────────────────────────────────────

test('normaliseIntentAnnotation null in → null out', () => {
  assert.equal(normaliseIntentAnnotation(null), null);
  assert.equal(normaliseIntentAnnotation(undefined), null);
});

test('normaliseIntentAnnotation requires object input', () => {
  assert.throws(() => normaliseIntentAnnotation('hello'), /object/);
});

test('normaliseIntentAnnotation happy path with all fields', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.87,
    detectedLanguage: 'hi-IN',
    rationale: 'User asked to book a cab in Hindi',
    modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
    entities: [
      { type: 'role', value: 'cab-driver', confidence: 0.91 },
      { type: 'when', value: 'now' }
    ],
    generatedAt: '2026-06-01T10:00:00.000Z'
  });
  assert.equal(out.protocolVersion, INTENT_ANNOTATION_PROTOCOL_VERSION);
  assert.equal(out.actionType, 'service_booking');
  assert.equal(out.confidence, 0.87);
  assert.equal(out.detectedLanguage, 'hi-IN');
  assert.equal(out.entities.length, 2);
  assert.equal(out.entities[0].type, 'role');
});

test('normaliseIntentAnnotation rejects confidence out of [0,1]', () => {
  assert.throws(() => normaliseIntentAnnotation({ actionType: 'service_booking', confidence: 1.5 }), /\[0, 1\]/);
  assert.throws(() => normaliseIntentAnnotation({ actionType: 'service_booking', confidence: -0.1 }), /\[0, 1\]/);
});

test('normaliseIntentAnnotation rejects empty actionType', () => {
  assert.throws(() => normaliseIntentAnnotation({ actionType: '', confidence: 0.5 }), /actionType/);
});

test('normaliseIntentAnnotation caps entities at 16', () => {
  const entities = Array.from({ length: 20 }, (_, i) => ({ type: 'e', value: String(i) }));
  assert.throws(
    () => normaliseIntentAnnotation({ actionType: 'service_booking', confidence: 0.5, entities }),
    /16-entry cap/
  );
});

test('normaliseIntentAnnotation clips rationale + strips CRLF / BOM', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.5,
    rationale: '﻿Long Hindi explanation\r\nover two lines  '.repeat(5)
  });
  assert.ok(out.rationale.length <= 280);
  assert.ok(!out.rationale.includes('\r'));
  assert.ok(!out.rationale.startsWith('﻿'));
});

test('compareIntentAnnotation: agreed / disagreed / fe_only / server_only / absent', () => {
  const a = { actionType: 'service_booking', confidence: 0.8 };
  assert.equal(compareIntentAnnotation(a, 'service_booking'), 'agreed');
  assert.equal(compareIntentAnnotation(a, 'mesh_storage'), 'disagreed');
  assert.equal(compareIntentAnnotation(a, null), 'fe_only');
  assert.equal(compareIntentAnnotation(null, 'service_booking'), 'server_only');
  assert.equal(compareIntentAnnotation(null, null), 'absent');
});

test('buildIntentAnnotationLedgerEvent encodes verdict in type', () => {
  const a = normaliseIntentAnnotation({ actionType: 'service_booking', confidence: 0.8, detectedLanguage: 'hi-IN', entities: [{ type: 'role', value: 'cab-driver' }] });
  const ev = buildIntentAnnotationLedgerEvent({
    orchestrationId: 'bos:orchestration:abc',
    annotation: a,
    serverActionType: 'service_booking',
    verdict: 'agreed',
    at: '2026-06-01T10:00:00.000Z'
  });
  assert.equal(ev.type, 'intent.slm_agreed');
  assert.equal(ev.annotation.entityCount, 1);
  assert.equal(ev.serverActionType, 'service_booking');
});

test('INTENT_ANNOTATION_VERDICTS set is exhaustive', () => {
  assert.deepEqual(
    INTENT_ANNOTATION_VERDICTS.slice().sort(),
    ['absent', 'agreed', 'disagreed', 'fe_only', 'server_only']
  );
});

// ─── Orchestrator pass-through ─────────────────────────────────────

test('orchestrator echoes intentAnnotation onto intent.slmAnnotation', () => {
  const annotation = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.9,
    detectedLanguage: 'hi-IN'
  });
  const result = orchestrateIntent({
    intentText: 'Book a cab to PMC',
    actorId: 'bos:person:c',
    intentAnnotation: annotation
  });
  assert.equal(result.intent.slmAnnotation?.actionType, 'service_booking');
});

test('orchestrator does NOT route by intentAnnotation (deterministic actionType wins)', () => {
  const annotation = normaliseIntentAnnotation({
    actionType: 'health_record_read',     // SLM says "read health record"
    confidence: 0.99,
    detectedLanguage: 'hi-IN'
  });
  const result = orchestrateIntent({
    intentText: 'Book a cab to PMC',      // Substrate will route to service_booking
    actorId: 'bos:person:c',
    intentAnnotation: annotation
  });
  assert.equal(result.actionRequest.actionType, 'service_booking');
  // Annotation is preserved verbatim for audit.
  assert.equal(result.intent.slmAnnotation.actionType, 'health_record_read');
});

test('orchestrator with no annotation leaves slmAnnotation null', () => {
  const result = orchestrateIntent({
    intentText: 'Book a cab',
    actorId: 'bos:person:c'
  });
  assert.equal(result.intent.slmAnnotation, null);
});

// ─── HTTP ──────────────────────────────────────────────────────────

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

test('POST /api/orchestrations rejects malformed intentAnnotation', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentText: 'Book a cab',
        actorId: citizen.id,
        intentAnnotation: { actionType: 'service_booking', confidence: 1.5 }
      })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_intent_annotation');
  });
});

test('POST /api/orchestrations: annotation lands on saved orchestration; verdict ledger event fires', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentText: 'Book a cab to PMC',
        actorId: citizen.id,
        intentAnnotation: {
          actionType: 'service_booking',
          confidence: 0.92,
          detectedLanguage: 'en-IN',
          modelPackId: 'bos:slm-model-pack:phi-3-mini-q4'
        }
      })
    });
    assert.equal(r.status, 201);
    const { orchestration } = await r.json();
    assert.equal(orchestration.intent.slmAnnotation?.actionType, 'service_booking');
    // Verdict event present in ledger.
    const ledger = await store.listLedger({ limit: 100 });
    const verdictEvent = ledger.find((e) => String(e.type || '').startsWith('intent.slm_'));
    assert.ok(verdictEvent, 'intent.slm_<verdict> ledger event must fire');
    // Substrate routed to service_booking and annotation also says service_booking → agreed.
    assert.equal(verdictEvent.type, 'intent.slm_agreed');
  });
});

test('POST /api/orchestrations: disagreed verdict when SLM != substrate', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentText: 'Book a cab to PMC',
        actorId: citizen.id,
        intentAnnotation: {
          actionType: 'health_record_read',
          confidence: 0.55
        }
      })
    });
    assert.equal(r.status, 201);
    const { orchestration } = await r.json();
    // Deterministic substrate still wins.
    assert.equal(orchestration.actionRequest.actionType, 'service_booking');
    const ledger = await store.listLedger({ limit: 100 });
    const verdictEvent = ledger.find((e) => String(e.type || '').startsWith('intent.slm_'));
    assert.equal(verdictEvent.type, 'intent.slm_disagreed');
  });
});

test('POST /api/orchestrations without annotation produces no intent.slm_<verdict> event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentText: 'Book a cab to PMC',
        actorId: citizen.id
      })
    });
    const ledger = await store.listLedger({ limit: 100 });
    // server_only verdict still emits when server inferred an actionType.
    const verdictEvent = ledger.find((e) => String(e.type || '').startsWith('intent.slm_'));
    assert.equal(verdictEvent?.type, 'intent.slm_server_only');
  });
});

// ─── §15 binding ──────────────────────────────────────────────────

test('§15 binding: intent-annotation.mjs source has no override / route field', async () => {
  const src = await fs.readFile(path.join(repoRoot, 'src/phase0/intent-annotation.mjs'), 'utf8');
  // Strip line comments before regexing field names.
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/\bcommission\b/.test(code), 'no commission field');
  assert.ok(!/\boverride\b/.test(code), 'no override field — annotation never overrides');
  assert.ok(!/\brouteTo\b/.test(code), 'no routeTo field');
  assert.ok(!/\bforce[A-Z]/.test(code), 'no force* field');
});
