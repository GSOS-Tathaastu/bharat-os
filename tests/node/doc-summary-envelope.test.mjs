// Phase 13.0.2 — Doc-summary `source` envelope + ledger event tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  DOC_SUMMARY_PROTOCOL_VERSION,
  DOC_SUMMARY_SOURCE_TYPE,
  DOC_KIND_ALLOWLIST,
  DOC_LANGUAGE_ALLOWLIST,
  FORBIDDEN_LEDGER_SUBSTRINGS,
  normaliseDocSummarySource,
  buildDocSummarisedLedgerEvent
} from '../../src/phase0/doc-summary-envelope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'doc-summary-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

function validSource() {
  return {
    type: DOC_SUMMARY_SOURCE_TYPE,
    docKind: 'electricity_bill',
    modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
    titleLength: 42,
    tldrLength: 120,
    bulletCount: 3,
    confidence: 0.87,
    riskFlag: 'attention',
    language: 'English',
    pdfFingerprint: { pages: 4, truncatedReason: 'chars' },
    generatedAt: '2026-06-02T10:00:00.000Z'
  };
}

// ─── Pure module ──────────────────────────────────────────────────

test('DOC_SUMMARY_PROTOCOL_VERSION is pinned', () => {
  assert.equal(DOC_SUMMARY_PROTOCOL_VERSION, 'bos.phase13.doc-summary.v1');
});

// Phase 13.0.2 adversarial fix SF-1 — real FE↔BE convergence test
// (was previously a literal-comparison sanity check that drift
// could pass silently). Reads the FE source file and extracts the
// DocKind / DocLanguage unions via regex; asserts set-equality
// against the BE allowlists. A future PR that adds (e.g.)
// `gst_invoice` to the FE union without updating the BE allowlist
// will trip this test loudly.
function extractFeUnionMembers(source, typeName) {
  const re = new RegExp(`export type ${typeName} =\\s*([\\s\\S]+?);`);
  const match = re.exec(source);
  if (!match) throw new Error(`Could not find type ${typeName} in FE source.`);
  return match[1]
    .split('|')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
}

test('Phase 13.0.2 SF-1 — DOC_KIND_ALLOWLIST matches FE DocKind by reading FE source', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'doc-summariser.ts');
  const source = await fs.readFile(fePath, 'utf8');
  const feMembers = extractFeUnionMembers(source, 'DocKind');
  assert.deepEqual([...DOC_KIND_ALLOWLIST].sort(), feMembers);
});

test('Phase 13.0.2 SF-1 — DOC_LANGUAGE_ALLOWLIST matches FE DocLanguage by reading FE source', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'doc-summariser.ts');
  const source = await fs.readFile(fePath, 'utf8');
  // DocLanguage is derived from `LANGUAGES` const tuple, not a
  // straight union. Match the tuple literal instead.
  const re = /const LANGUAGES = \[([\s\S]+?)\] as const;/;
  const match = re.exec(source);
  if (!match) throw new Error('Could not find LANGUAGES tuple in FE source.');
  const feMembers = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...DOC_LANGUAGE_ALLOWLIST].sort(), feMembers);
});

test('normaliseDocSummarySource — happy path round-trip', () => {
  const out = normaliseDocSummarySource(validSource());
  assert.equal(out.type, DOC_SUMMARY_SOURCE_TYPE);
  assert.equal(out.protocolVersion, DOC_SUMMARY_PROTOCOL_VERSION);
  assert.equal(out.docKind, 'electricity_bill');
  assert.equal(out.titleLength, 42);
  assert.equal(out.tldrLength, 120);
  assert.equal(out.bulletCount, 3);
  assert.equal(out.confidence, 0.87);
  assert.equal(out.riskFlag, 'attention');
  assert.equal(out.language, 'English');
  assert.deepEqual(out.pdfFingerprint, { pages: 4, truncatedReason: 'chars' });
  // Phase 13.2 MF-3 — millisecond precision dropped on accept.
  assert.equal(out.generatedAt, '2026-06-02T10:00:00Z');
});

// Phase 13.0.2 adversarial fix SF-2 — same FORBIDDEN_LEDGER_SUBSTRINGS
// list used as the strict-allowlist rejection probe AND below as the
// ledger-event JSON-grep guard, so the two defences can't drift.
test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of FORBIDDEN_LEDGER_SUBSTRINGS) {
    assert.throws(
      () => normaliseDocSummarySource({ ...validSource(), [forbidden]: 'leak' }),
      new RegExp(`source\\.${forbidden} is not a permitted field`)
    );
  }
});

test('strict allowlist rejects forbidden pdfFingerprint keys', () => {
  for (const forbidden of [
    'bytes', 'sha256', 'firstPageText', 'fileName', 'mimeType'
  ]) {
    assert.throws(
      () => normaliseDocSummarySource({
        ...validSource(),
        pdfFingerprint: { pages: 2, [forbidden]: 'leak' }
      }),
      new RegExp(`source\\.pdfFingerprint\\.${forbidden} is not a permitted field`)
    );
  }
});

test('rejects type other than doc_summary_v1', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), type: 'api' }),
    /source\.type must be/
  );
});

test('rejects off-allowlist docKind', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), docKind: 'gst_certificate' }),
    /source\.docKind must be one of/
  );
});

test('rejects off-allowlist riskFlag', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), riskFlag: 'SCAM' }),
    /source\.riskFlag must be one of/
  );
});

test('rejects off-allowlist language', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), language: 'French' }),
    /source\.language must be one of/
  );
});

test('rejects confidence outside [0,1]', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), confidence: 1.2 }),
    /source\.confidence must be in \[0, 1\]/
  );
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), confidence: -0.1 }),
    /source\.confidence must be in \[0, 1\]/
  );
});

test('rejects count fields above their caps', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), titleLength: 300 }),
    /titleLength must be an integer/
  );
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), bulletCount: 99 }),
    /bulletCount must be an integer/
  );
});

test('rejects modelPackId over 128 chars', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), modelPackId: 'x'.repeat(200) }),
    /modelPackId exceeds 128/
  );
});

test('pdfFingerprint is optional (null is valid)', () => {
  const out = normaliseDocSummarySource({ ...validSource(), pdfFingerprint: null });
  assert.equal(out.pdfFingerprint, null);
});

test('rejects pdfFingerprint with non-allowlist truncatedReason', () => {
  assert.throws(
    () => normaliseDocSummarySource({
      ...validSource(),
      pdfFingerprint: { pages: 1, truncatedReason: 'words' }
    }),
    /truncatedReason must be one of/
  );
});

test('rejects appliedAt-like fields (we use generatedAt; reject the typo)', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), appliedAt: '2026-06-02T10:00:00Z' }),
    /source\.appliedAt is not a permitted field/
  );
});

test('generatedAt rejects non-ISO strings', () => {
  assert.throws(
    () => normaliseDocSummarySource({ ...validSource(), generatedAt: 'X'.repeat(40) }),
    /generatedAt must be an ISO-8601 UTC instant/
  );
});

test('buildDocSummarisedLedgerEvent surfaces count-only meta', () => {
  const source = normaliseDocSummarySource(validSource());
  const ev = buildDocSummarisedLedgerEvent({
    recordId: 'bos:memory:abc',
    ownerId: 'bos:person:xyz',
    source,
    at: '2026-06-02T10:00:01Z'
  });
  assert.equal(ev.type, 'doc.summarised');
  assert.equal(ev.recordId, 'bos:memory:abc');
  assert.equal(ev.ownerId, 'bos:person:xyz');
  assert.equal(ev.docKind, 'electricity_bill');
  assert.equal(ev.titleLength, 42);
  assert.equal(ev.bulletCount, 3);
  // Phase 13.0.2 MF-1 — `at` must be ms-stripped just like
  // `generatedAt` (Phase 13.2 MF-3). Both come out at second
  // precision so the audit ledger can't fingerprint citizen
  // typing speed.
  assert.equal(/\.\d/.test(ev.at), false);
  assert.equal(/\.\d/.test(ev.generatedAt), false);
  // SF-2 §15 binding — JSON-stringify + grep with the SHARED
  // FORBIDDEN_LEDGER_SUBSTRINGS list. Same list is asserted on the
  // normaliser allowlist rejection above; the two defences can't
  // drift.
  const json = JSON.stringify(ev);
  for (const forbidden of FORBIDDEN_LEDGER_SUBSTRINGS) {
    assert.ok(
      !json.includes(`"${forbidden}"`),
      `ledger event must not surface "${forbidden}" (got ${json})`
    );
  }
});

// Phase 13.0.2 MF-1 — direct regression test: ms-precision `at`
// must be stripped on the event.
test('buildDocSummarisedLedgerEvent strips millisecond precision from `at`', () => {
  const source = normaliseDocSummarySource(validSource());
  const ev = buildDocSummarisedLedgerEvent({
    recordId: 'bos:memory:r1',
    ownerId: 'bos:person:p1',
    source,
    at: '2026-06-02T10:00:01.547Z'
  });
  assert.equal(ev.at, '2026-06-02T10:00:01Z');
  assert.equal(/\.\d/.test(ev.at), false);
});

// Phase 13.0.2 SF-3 — calendar-invalid instants must reject even if
// they match the ISO_INSTANT_RE shape.
test('normaliseDocSummarySource rejects calendar-invalid generatedAt', () => {
  assert.throws(
    () => normaliseDocSummarySource({
      ...validSource(),
      generatedAt: '2026-13-99T99:99:99Z'
    }),
    /generatedAt must be a calendar-valid ISO-8601 UTC instant/
  );
});

// ─── HTTP integration ─────────────────────────────────────────────

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

test('POST /api/memory-records with doc_summary_v1 source persists + emits doc.summarised ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const summaryText = 'TITLE: Mahadiscom bill\nTLDR: Rs 2956 due 24 May 2026.';
    const source = validSource();
    const r = await fetch(`${baseUrl}/api/memory-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        text: summaryText,
        label: 'Mahadiscom electricity bill - May 2026',
        sensitivity: 'sensitive',
        source
      })
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(body.memory.recordId.startsWith('bos:memory:'));
    // Ledger event present + carries pointer + count-only meta.
    const events = await store.listLedger({ type: 'doc.summarised' });
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.recordId, body.memory.recordId);
    assert.equal(ev.docKind, 'electricity_bill');
    assert.equal(ev.titleLength, 42);
    // Phase 13.0.2 MF-1 — `at` flows from record.createdAt
    // (nowIso() at ms precision); the event builder must strip
    // those ms so this also holds when at comes from the live
    // store, not just a hard-coded test string.
    assert.equal(/\.\d/.test(ev.at), false);
    // §15 — body.text MUST NOT appear in the ledger event. Also
    // run the shared SF-2 forbidden-substrings probe so the HTTP
    // path stays in lockstep with the pure-builder test above.
    const evJson = JSON.stringify(ev);
    assert.ok(!evJson.includes('Mahadiscom bill'));
    assert.ok(!evJson.includes('2956'));
    assert.ok(!evJson.includes('Rs '));
    for (const forbidden of FORBIDDEN_LEDGER_SUBSTRINGS) {
      assert.ok(
        !evJson.includes(`"${forbidden}"`),
        `HTTP-emitted ledger event must not surface "${forbidden}" (got ${evJson})`
      );
    }
  });
});

test('POST /api/memory-records with malformed doc_summary_v1 source returns 400 (no record persisted)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(`${baseUrl}/api/memory-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        text: 'whatever',
        label: 'attempt',
        source: { type: DOC_SUMMARY_SOURCE_TYPE, docKind: 'electricity_bill', title: 'leak attempt' }
      })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_doc_summary_source');
    // No record persisted, no event emitted.
    const events = await store.listLedger({ type: 'doc.summarised' });
    assert.equal(events.length, 0);
    const records = await store.listMemoryRecords();
    assert.equal(records.length, 0);
  });
});

test('POST /api/memory-records with NON-doc-summary source still flows unchanged (no ledger event)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(`${baseUrl}/api/memory-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        text: 'a personal note',
        label: 'Doctor contact',
        sensitivity: 'personal'
      })
    });
    assert.equal(r.status, 201);
    // No doc.summarised event because source.type !== doc_summary_v1.
    const events = await store.listLedger({ type: 'doc.summarised' });
    assert.equal(events.length, 0);
  });
});
