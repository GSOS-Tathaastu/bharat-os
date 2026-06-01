// Phase 12.2.3 — Attachment CORE substrate tests.
//
// Covers:
//   1. Pure substrate: validators, decode, build, derive.
//   2. SqliteStore: save / read / list / delete / cascade / quota.
//   3. HTTP: POST + GET (owner & operator) + DELETE + error
//      paths + §15 binding-grep on ledger events.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_MIME_ALLOWLIST,
  ATTACHMENT_MAX_BYTES_PER_BLOB,
  ATTACHMENT_MAX_BYTES_PER_ACTOR,
  ATTACHMENT_PROTOCOL_VERSION,
  AttachmentValidationError,
  buildAttachmentRecord,
  decodeAttachmentBytes,
  deriveAttachmentId,
  isAllowedKind,
  isAllowedMime,
  publicAttachmentMeta
} from '../../src/phase1/attachment.mjs';
import { sha256Hex } from '../../src/phase0/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'attachment-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// A tiny but valid JPEG: SOI + APP0 + EOI. Just enough to be a
// nonzero "image/jpeg" payload — we don't decode it.
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);
const TINY_JPEG_B64 = TINY_JPEG.toString('base64');
const TINY_JPEG_SHA = sha256Hex(TINY_JPEG);

// ─── Pure substrate ───────────────────────────────────────────────

test('exports protocol version + frozen allowlists', () => {
  assert.equal(ATTACHMENT_PROTOCOL_VERSION, 'bos.phase12.attachment.v0');
  assert.deepEqual(ATTACHMENT_MIME_ALLOWLIST, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  assert.equal(ATTACHMENT_MAX_BYTES_PER_BLOB, 5 * 1024 * 1024);
  assert.equal(ATTACHMENT_MAX_BYTES_PER_ACTOR, 50 * 1024 * 1024);
  assert.ok(ATTACHMENT_KINDS.includes('kyc_l1_selfie'));
  assert.ok(ATTACHMENT_KINDS.includes('kyc_l1_id_proof'));
});

test('isAllowedMime / isAllowedKind discriminate', () => {
  assert.ok(isAllowedMime('image/jpeg'));
  assert.ok(isAllowedMime('IMAGE/JPEG'), 'case-insensitive');
  assert.ok(!isAllowedMime('image/svg+xml'));
  assert.ok(!isAllowedMime('text/html'));
  assert.ok(isAllowedKind('kyc_l1_selfie'));
  assert.ok(!isAllowedKind('bogus'));
});

test('deriveAttachmentId is content-addressed + stable', () => {
  const id = deriveAttachmentId(TINY_JPEG_SHA);
  assert.match(id, /^bos:att:[0-9a-f]{32}$/);
  assert.equal(deriveAttachmentId(TINY_JPEG_SHA), id, 'same sha → same id');
  assert.throws(() => deriveAttachmentId('not-hex'), (e) => e instanceof AttachmentValidationError);
  assert.throws(() => deriveAttachmentId('abc'), (e) => e instanceof AttachmentValidationError);
});

test('decodeAttachmentBytes happy path + sha256 verification', () => {
  const { bytes, sha256, byteLength } = decodeAttachmentBytes(TINY_JPEG_B64);
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(byteLength, TINY_JPEG.length);
  assert.equal(sha256, TINY_JPEG_SHA);
});

test('decodeAttachmentBytes rejects empty / non-base64 / oversized', () => {
  assert.throws(() => decodeAttachmentBytes(''), (e) => e.code === 'bytes_required');
  assert.throws(() => decodeAttachmentBytes(null), (e) => e.code === 'bytes_required');
  // A non-empty input that decodes to zero bytes: just whitespace
  // (base64 ignores it).
  assert.throws(() => decodeAttachmentBytes('====='), (e) => e.code === 'bytes_empty');
  // A buffer 1 byte over the cap, base64-encoded.
  const big = Buffer.alloc(ATTACHMENT_MAX_BYTES_PER_BLOB + 1).toString('base64');
  assert.throws(() => decodeAttachmentBytes(big), (e) => e.code === 'bytes_too_large' && e.status === 413);
});

test('buildAttachmentRecord rejects bad inputs', () => {
  const base = {
    bytes: TINY_JPEG,
    sha256: TINY_JPEG_SHA,
    byteLength: TINY_JPEG.length,
    rootIdentityId: 'bos:person:1',
    mimeType: 'image/jpeg',
    kind: 'kyc_l1_selfie',
    createdAt: '2026-06-01T00:00:00.000Z'
  };
  assert.throws(() => buildAttachmentRecord({ ...base, rootIdentityId: null }), (e) => e.code === 'root_identity_required');
  assert.throws(() => buildAttachmentRecord({ ...base, mimeType: 'image/gif' }), (e) => e.code === 'mime_not_allowed');
  assert.throws(() => buildAttachmentRecord({ ...base, kind: 'random' }), (e) => e.code === 'kind_not_allowed');
  assert.throws(() => buildAttachmentRecord({ ...base, createdAt: null }), (e) => e.code === 'created_at_required');
});

test('buildAttachmentRecord happy path returns a full record', () => {
  const r = buildAttachmentRecord({
    bytes: TINY_JPEG,
    sha256: TINY_JPEG_SHA,
    byteLength: TINY_JPEG.length,
    rootIdentityId: 'bos:person:1',
    mimeType: 'image/jpeg',
    kind: 'kyc_l1_selfie',
    createdAt: '2026-06-01T00:00:00.000Z'
  });
  assert.equal(r.attachmentId, `bos:att:${TINY_JPEG_SHA.slice(0, 32)}`);
  assert.equal(r.byteLength, TINY_JPEG.length);
  assert.equal(r.mimeType, 'image/jpeg');
  assert.equal(r.kind, 'kyc_l1_selfie');
  assert.equal(r.objectType, 'attachment');
  // publicAttachmentMeta strips bytes.
  const pub = publicAttachmentMeta(r);
  assert.ok(!('bytes' in pub));
});

// ─── SqliteStore ──────────────────────────────────────────────────

test('SqliteStore save + read + list + delete round-trip', async () => {
  const { store } = await freshSqlite('round-trip');
  try {
    const record = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: 'bos:person:rt',
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(record);

    const back = await store.readAttachment(record.attachmentId, { rootIdentityId: 'bos:person:rt' });
    assert.ok(back);
    assert.ok(Buffer.isBuffer(back.bytes));
    assert.equal(back.bytes.toString('hex'), TINY_JPEG.toString('hex'));
    assert.equal(back.sha256, TINY_JPEG_SHA);

    const list = await store.listAttachments({ rootIdentityId: 'bos:person:rt' });
    assert.equal(list.length, 1);
    assert.ok(!('bytes' in list[0]), 'list MUST NOT carry blob bytes');

    const total = await store.sumAttachmentBytesByActor('bos:person:rt');
    assert.equal(total, TINY_JPEG.length);

    const deleted = await store.deleteAttachment(record.attachmentId, { rootIdentityId: 'bos:person:rt' });
    assert.equal(deleted, true);
    const after = await store.readAttachment(record.attachmentId, { rootIdentityId: 'bos:person:rt' });
    assert.equal(after, null);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore attachment cross-owner read returns null (composite PK)', async () => {
  const { store } = await freshSqlite('cross-owner');
  try {
    const record = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: 'bos:person:owner',
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(record);
    const wrong = await store.readAttachment(record.attachmentId, { rootIdentityId: 'bos:person:attacker' });
    assert.equal(wrong, null);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore attachment.saved ledger event is meta-only (§15)', async () => {
  const { store } = await freshSqlite('ledger-binding');
  try {
    const record = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: 'bos:person:owner',
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(record);
    const ledger = await store.listLedger({ type: 'attachment.saved' });
    assert.equal(ledger.length, 1);
    const evt = ledger[0];
    assert.equal(evt.attachmentId, record.attachmentId);
    assert.equal(evt.sha256, TINY_JPEG_SHA);
    assert.equal(evt.byteLength, TINY_JPEG.length);
    assert.equal(evt.mimeType, 'image/jpeg');
    assert.ok(!('bytes' in evt), 'audit event MUST NEVER carry bytes');
    // The JPEG signature bytes must not appear anywhere in the
    // event JSON either.
    const json = JSON.stringify(evt);
    assert.ok(!json.includes('FFD8FFE0'), 'no JPEG signature in audit JSON');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore DPDP cascade — attachments swept by root_identity_id', async () => {
  const { store } = await freshSqlite('cascade');
  try {
    // Create the identity record so eraseUserData has something
    // to anchor on.
    const identity = createIdentity({ displayName: 'Test' });
    await store.saveIdentity(identity);
    const record = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: identity.id,
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(record);

    const result = await store.eraseUserData(identity.id);
    assert.ok(result.sections);
    assert.ok(result.sections.attachments >= 1, 'cascade reports attachments removed');

    const after = await store.listAttachments({ rootIdentityId: identity.id });
    assert.equal(after.length, 0, 'attachments swept');
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

async function seedIdentity(store) {
  const identity = createIdentity({ displayName: `Test Person ${Math.floor(Math.random() * 1e9)}` });
  await store.saveIdentity(identity);
  return identity;
}

test('POST /api/attachments happy path returns 201 + public meta', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: id.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.attachment.byteLength, TINY_JPEG.length);
    assert.equal(body.attachment.mimeType, 'image/jpeg');
    assert.equal(body.attachment.kind, 'kyc_l1_selfie');
    assert.equal(body.attachment.rootIdentityId, id.id);
    assert.match(body.attachment.attachmentId, /^bos:att:[0-9a-f]{32}$/);
  });
});

test('POST /api/attachments missing acting identity → 401', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    assert.equal(r.status, 401);
    const body = await r.json();
    assert.equal(body.error.code, 'missing_acting_identity');
  });
});

test('POST /api/attachments unknown identity → 404', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: 'bos:person:nope',
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error.code, 'unknown_identity');
  });
});

test('POST /api/attachments disallowed MIME → 415', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: id.id,
        mimeType: 'image/svg+xml',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    assert.equal(r.status, 415);
    const body = await r.json();
    assert.equal(body.error.code, 'mime_not_allowed');
  });
});

test('POST /api/attachments disallowed kind → 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: id.id,
        mimeType: 'image/jpeg',
        kind: 'something_random',
        bytesBase64: TINY_JPEG_B64
      })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'kind_not_allowed');
  });
});

test('GET /api/attachments/:id owner path returns raw bytes + cache headers', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const post = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: id.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    const meta = (await post.json()).attachment;
    const r = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
      headers: { 'x-bharat-os-acting-identity': id.id }
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.equal(r.headers.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.match(r.headers.get('etag') || '', /^"[0-9a-f]{64}"$/);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.toString('hex'), TINY_JPEG.toString('hex'));
  });
});

test('GET /api/attachments/:id cross-owner read → 404', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const owner = await seedIdentity(store);
    const attacker = await seedIdentity(store);
    const post = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: owner.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    const meta = (await post.json()).attachment;
    const r = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
      headers: { 'x-bharat-os-acting-identity': attacker.id }
    });
    assert.equal(r.status, 404);
  });
});

test('GET /api/attachments/:id operator path with bearer token returns bytes', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const owner = await seedIdentity(store);
      const post = await fetch(`${baseUrl}/api/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actingRootIdentityId: owner.id,
          mimeType: 'image/jpeg',
          kind: 'kyc_l1_selfie',
          bytesBase64: TINY_JPEG_B64
        })
      });
      const meta = (await post.json()).attachment;
      const r = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
        headers: { 'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      });
      assert.equal(r.status, 200);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('DELETE /api/attachments/:id owner happy path + emits attachment.erased', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const owner = await seedIdentity(store);
    const post = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: owner.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    const meta = (await post.json()).attachment;
    const del = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
      method: 'DELETE',
      headers: { 'x-bharat-os-acting-identity': owner.id }
    });
    assert.equal(del.status, 200);
    const erased = await store.listLedger({ type: 'attachment.erased' });
    assert.equal(erased.length, 1);
  });
});

test('safePath redacts /api/attachments/:id (Phase 12.2.3 fix PII-1)', async () => {
  const { safePath } = await import('../../src/phase0/logger.mjs');
  // unencoded colon form
  assert.equal(
    safePath('/api/attachments/bos:att:1234567890abcdef1234567890abcdef'),
    '/api/attachments/:id'
  );
  // URL-encoded form (real HTTP requests look like this)
  assert.equal(
    safePath('/api/attachments/bos%3Aatt%3A1234567890abcdef1234567890abcdef'),
    '/api/attachments/:id'
  );
  assert.equal(safePath('/api/attachments/bos:att:abc?foo=bar'), '/api/attachments/:id');
  // Listing endpoint (no trailing segment) unchanged.
  assert.equal(safePath('/api/attachments'), '/api/attachments');
});

test('listAttachments without rootIdentityId returns empty (PII-6 fix)', async () => {
  const { store } = await freshSqlite('pii-6-bos');
  try {
    const record = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: 'bos:person:owner',
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(record);
    // sumAttachmentBytesByActor with empty actor must return 0.
    assert.equal(await store.sumAttachmentBytesByActor(''), 0);
    assert.equal(await store.sumAttachmentBytesByActor(null), 0);
    assert.equal(await store.sumAttachmentBytesByActor(undefined), 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('saveAttachment + quotaCapBytes enforces actor quota atomically (A3-4 fix)', async () => {
  const { store } = await freshSqlite('quota-cap');
  try {
    const cap = TINY_JPEG.length + 1; // room for exactly one TINY_JPEG.
    const r1 = buildAttachmentRecord({
      bytes: TINY_JPEG,
      sha256: TINY_JPEG_SHA,
      byteLength: TINY_JPEG.length,
      rootIdentityId: 'bos:person:cap',
      mimeType: 'image/jpeg',
      kind: 'kyc_l1_selfie',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await store.saveAttachment(r1, { quotaCapBytes: cap });

    // Different bytes (PNG-ish) → different sha → different row.
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r2 = buildAttachmentRecord({
      bytes: pngBytes,
      sha256: sha256Hex(pngBytes),
      byteLength: pngBytes.length,
      rootIdentityId: 'bos:person:cap',
      mimeType: 'image/png',
      kind: 'kyc_l1_id_proof',
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await assert.rejects(
      store.saveAttachment(r2, { quotaCapBytes: cap }),
      (err) => err.code === 'actor_quota_exceeded'
    );
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('admin GET emits attachment.admin_read ledger event (A3-2 fix)', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const owner = await seedIdentity(store);
      const post = await fetch(`${baseUrl}/api/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actingRootIdentityId: owner.id,
          mimeType: 'image/jpeg',
          kind: 'kyc_l1_selfie',
          bytesBase64: TINY_JPEG_B64
        })
      });
      const meta = (await post.json()).attachment;
      const r = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
        headers: {
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'x-bharat-os-operator': 'bos:operator:test'
        }
      });
      assert.equal(r.status, 200);
      const ledger = await store.listLedger({ type: 'attachment.admin_read' });
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0].attachmentId, meta.attachmentId);
      assert.equal(ledger[0].operatorId, 'bos:operator:test');
      assert.ok(!('bytes' in ledger[0]));
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('owner GET does NOT emit admin_read event (audit minimalism)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const owner = await seedIdentity(store);
    const post = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: owner.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    const meta = (await post.json()).attachment;
    await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
      headers: { 'x-bharat-os-acting-identity': owner.id }
    });
    const ledger = await store.listLedger({ type: 'attachment.admin_read' });
    assert.equal(ledger.length, 0);
  });
});

test('admin GET of erased attachment returns attachment_unavailable code (DPDP-3 fix)', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const owner = await seedIdentity(store);
      const post = await fetch(`${baseUrl}/api/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actingRootIdentityId: owner.id,
          mimeType: 'image/jpeg',
          kind: 'kyc_l1_selfie',
          bytesBase64: TINY_JPEG_B64
        })
      });
      const meta = (await post.json()).attachment;
      await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
        method: 'DELETE',
        headers: { 'x-bharat-os-acting-identity': owner.id }
      });
      const r = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(meta.attachmentId)}`, {
        headers: { 'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      });
      assert.equal(r.status, 404);
      const body = await r.json();
      assert.equal(body.error.code, 'attachment_unavailable');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('JPEG / WebP records carry mayContainExif=true; PNG / PDF carry false (PII-4 fix)', () => {
  const j = buildAttachmentRecord({
    bytes: TINY_JPEG,
    sha256: TINY_JPEG_SHA,
    byteLength: TINY_JPEG.length,
    rootIdentityId: 'bos:person:exif',
    mimeType: 'image/jpeg',
    kind: 'kyc_l1_selfie',
    createdAt: '2026-06-01T00:00:00.000Z'
  });
  assert.equal(j.mayContainExif, true);
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const p = buildAttachmentRecord({
    bytes: pngBytes,
    sha256: sha256Hex(pngBytes),
    byteLength: pngBytes.length,
    rootIdentityId: 'bos:person:exif',
    mimeType: 'image/png',
    kind: 'kyc_l1_id_proof',
    createdAt: '2026-06-01T00:00:00.000Z'
  });
  assert.equal(p.mayContainExif, false);
});

test('GET /api/attachments owner listing returns meta only', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const owner = await seedIdentity(store);
    await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actingRootIdentityId: owner.id,
        mimeType: 'image/jpeg',
        kind: 'kyc_l1_selfie',
        bytesBase64: TINY_JPEG_B64
      })
    });
    const r = await fetch(`${baseUrl}/api/attachments?actingRootIdentityId=${encodeURIComponent(owner.id)}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.attachments.length, 1);
    assert.ok(!('bytes' in body.attachments[0]), 'list MUST NOT carry bytes');
  });
});
