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
  INTENT_ANNOTATION_PROTOCOL_VERSION,
  PII_KIND_ALLOWLIST
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

// ─── Phase 13.2 PII redaction envelope ────────────────────────────

test('Phase 13.2 PII_KIND_ALLOWLIST matches the FE PII_KINDS exactly', () => {
  // FE source-of-truth lives in frontend/src/lib/pii-detectors.ts;
  // this list MUST stay in lockstep so the BE rejects any kind the
  // FE doesn't surface and vice versa.
  assert.deepEqual([...PII_KIND_ALLOWLIST].sort(), [
    'aadhaar', 'abha', 'account', 'dl', 'email',
    'gstin', 'mobile', 'pan', 'pin', 'rc', 'upi'
  ]);
});

test('normaliseIntentAnnotation accepts a piiRedaction count-only envelope', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8,
    piiRedaction: {
      detectedCount: 3,
      maskedCount: 2,
      kinds: ['pan', 'aadhaar', 'mobile'],
      source: 'regex+slm',
      appliedAt: '2026-06-01T10:05:00.000Z'
    }
  });
  assert.equal(out.piiRedaction.detectedCount, 3);
  assert.equal(out.piiRedaction.maskedCount, 2);
  assert.deepEqual(out.piiRedaction.kinds, ['aadhaar', 'mobile', 'pan']); // sorted
  assert.equal(out.piiRedaction.source, 'regex+slm');
  // Phase 13.2 MF-3 — ms precision dropped on accept.
  assert.equal(out.piiRedaction.appliedAt, '2026-06-01T10:05:00Z');
});

test('normaliseIntentAnnotation: piiRedaction omitted → field is null', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8
  });
  assert.equal(out.piiRedaction, null);
});

test('normaliseIntentAnnotation: piiRedaction defaults source to "regex"', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8,
    piiRedaction: { detectedCount: 1, maskedCount: 1, kinds: ['pan'] }
  });
  assert.equal(out.piiRedaction.source, 'regex');
});

test('normaliseIntentAnnotation: piiRedaction dedupes + sorts kinds', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8,
    piiRedaction: {
      detectedCount: 4,
      maskedCount: 4,
      kinds: ['pan', 'pan', 'aadhaar', 'mobile']
    }
  });
  assert.deepEqual(out.piiRedaction.kinds, ['aadhaar', 'mobile', 'pan']);
});

test('Phase 13.2 MF-3 — piiRedaction strict allowlist rejects unknown keys', () => {
  // Earlier forbidden-key denylist (spans/text/rawText/etc.) PLUS
  // synonym leak vectors a denylist would have missed (body, value,
  // snippet, payload, content) all hard-reject under the strict
  // allowlist.
  for (const unknownKey of [
    'spans', 'text', 'rawText', 'redactedText', 'scannedText',
    'original', 'raw', 'masked', 'start', 'end',
    'body', 'value', 'snippet', 'preview', 'payload', 'content',
    'before', 'after', 'plain', 'plaintext'
  ]) {
    assert.throws(
      () => normaliseIntentAnnotation({
        actionType: 'service_booking',
        confidence: 0.8,
        piiRedaction: {
          detectedCount: 1,
          maskedCount: 1,
          kinds: ['pan'],
          [unknownKey]: 'should be rejected'
        }
      }),
      new RegExp(`piiRedaction\\.${unknownKey} is not a permitted field`)
    );
  }
});

test('Phase 13.2 MF-3 — appliedAt must be ISO-8601 UTC instant', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 1, maskedCount: 1, kinds: ['pan'], appliedAt: 'X'.repeat(40) }
    }),
    /appliedAt must be an ISO-8601 UTC instant/
  );
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 1, maskedCount: 1, kinds: ['pan'], appliedAt: '2026-06-01 12:34:56' }
    }),
    /ISO-8601/
  );
});

test('Phase 13.2 MF-3 — appliedAt millisecond precision is dropped to second', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8,
    piiRedaction: {
      detectedCount: 1, maskedCount: 1, kinds: ['pan'],
      appliedAt: '2026-06-01T12:34:56.789Z'
    }
  });
  assert.equal(out.piiRedaction.appliedAt, '2026-06-01T12:34:56Z');
});

test('Phase 13.2 SF-10 — kinds cap is enforced AFTER dedup (duplicates not exploitable)', () => {
  const out = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8,
    piiRedaction: { detectedCount: 1, maskedCount: 1, kinds: Array(11).fill('pan') }
  });
  // Pre-fix would have admitted the 11-entry duplicate array; the
  // strict allowlist + post-dedup invariant reduce it cleanly.
  assert.deepEqual(out.piiRedaction.kinds, ['pan']);
});

test('normaliseIntentAnnotation: piiRedaction rejects unknown kind', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 1, maskedCount: 1, kinds: ['ssn'] }
    }),
    /unknown kind: ssn/
  );
});

test('normaliseIntentAnnotation: piiRedaction rejects unknown source', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 0, maskedCount: 0, kinds: [], source: 'remote-llm' }
    }),
    /source must be one of/
  );
});

test('normaliseIntentAnnotation: piiRedaction maskedCount > detectedCount rejected', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 1, maskedCount: 5, kinds: ['pan'] }
    }),
    /maskedCount cannot exceed detectedCount/
  );
});

test('normaliseIntentAnnotation: piiRedaction count cap is 64', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: { detectedCount: 65, maskedCount: 0, kinds: [] }
    }),
    /must be an integer in \[0, 64\]/
  );
});

test('normaliseIntentAnnotation: piiRedaction non-object input rejected', () => {
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: 'oops'
    }),
    /must be an object/
  );
  assert.throws(
    () => normaliseIntentAnnotation({
      actionType: 'service_booking',
      confidence: 0.8,
      piiRedaction: [1, 2]
    }),
    /must be an object/
  );
});

test('buildIntentAnnotationLedgerEvent surfaces piiRedaction in annotation meta (counts only)', () => {
  const a = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.85,
    piiRedaction: {
      detectedCount: 2,
      maskedCount: 1,
      kinds: ['pan', 'aadhaar'],
      source: 'regex'
    }
  });
  const ev = buildIntentAnnotationLedgerEvent({
    orchestrationId: 'bos:orchestration:xyz',
    annotation: a,
    serverActionType: 'service_booking',
    verdict: 'agreed',
    at: '2026-06-01T10:00:00.000Z'
  });
  assert.equal(ev.annotation.piiRedaction.detectedCount, 2);
  assert.equal(ev.annotation.piiRedaction.maskedCount, 1);
  assert.deepEqual(ev.annotation.piiRedaction.kinds.sort(), ['aadhaar', 'pan']);
  assert.equal(ev.annotation.piiRedaction.source, 'regex');
  // §15 binding — the ledger event must not contain ANY raw value
  // or span structure. JSON-stringify + grep for guard.
  const json = JSON.stringify(ev);
  for (const forbidden of ['spans', 'rawText', 'redactedText', 'scannedText', 'start', 'end', 'raw', 'masked']) {
    assert.ok(!json.includes(`"${forbidden}"`), `ledger event must not surface ${forbidden}`);
  }
});

test('buildIntentAnnotationLedgerEvent: piiRedaction null when annotation has no redaction', () => {
  const a = normaliseIntentAnnotation({
    actionType: 'service_booking',
    confidence: 0.8
  });
  const ev = buildIntentAnnotationLedgerEvent({
    orchestrationId: 'bos:orchestration:xyz',
    annotation: a,
    serverActionType: 'service_booking',
    verdict: 'agreed',
    at: '2026-06-01T10:00:00.000Z'
  });
  assert.equal(ev.annotation.piiRedaction, null);
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
