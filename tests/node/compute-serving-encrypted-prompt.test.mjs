// Phase 13.7.3 — Encrypted-prompt envelope tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, sha256Hex } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildComputeServingEncryptedPrompt,
  buildEncryptedPromptPostedLedgerEvent,
  COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION,
  COMPUTE_SERVING_ENCRYPTION_ALGORITHM,
  PERMITTED_ENCRYPTED_PROMPT_KEYS,
  COMPUTE_SERVING_ENCRYPTED_PROMPT_FORBIDDEN_SUBSTRINGS
} from '../../src/phase1/compute-serving-encrypted-prompt.mjs';
import { buildComputeServingCapacity } from '../../src/phase1/compute-serving-capacity.mjs';
import { buildComputeServingDispatch } from '../../src/phase1/compute-serving-dispatch.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'compute-serving-encrypted-prompt-tests');

// Canonical base64 for arbitrary-length test fixtures.
function fakeBase64(byteCount) {
  const bytes = Buffer.alloc(byteCount);
  for (let i = 0; i < byteCount; i += 1) bytes[i] = i % 256;
  return bytes.toString('base64');
}

function validInput(overrides = {}) {
  return {
    dispatchId: 'bos:compute-serving-dispatch:test',
    requesterId: 'bos:person:requester',
    workerId: 'bos:person:worker',
    ciphertextBase64: fakeBase64(64),
    nonceBase64: fakeBase64(12),
    ephemeralPubKeyBase64: fakeBase64(65),
    createdAt: '2026-06-03T10:00:00Z',
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

test('COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION pinned', () => {
  assert.equal(
    COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION,
    'bos.phase13.compute-serving-encrypted-prompt.v1'
  );
});

test('COMPUTE_SERVING_ENCRYPTION_ALGORITHM pinned', () => {
  assert.equal(COMPUTE_SERVING_ENCRYPTION_ALGORITHM, 'ecdh-p256+aes-256-gcm');
});

test('buildComputeServingEncryptedPrompt — happy path', () => {
  const env = buildComputeServingEncryptedPrompt(validInput());
  assert.ok(env.envelopeId.startsWith('bos:compute-serving-encrypted-prompt:'));
  assert.equal(env.dispatchId, 'bos:compute-serving-dispatch:test');
  assert.equal(env.algorithm, COMPUTE_SERVING_ENCRYPTION_ALGORITHM);
  assert.equal(env.protocolVersion, COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION);
  // 15-minute TTL.
  const expected = new Date(Date.parse('2026-06-03T10:00:00Z') + 15 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{1,3}Z$/, 'Z');
  assert.equal(env.expiresAt, expected);
});

test('content-derived envelopeId is stable for identical input', () => {
  const a = buildComputeServingEncryptedPrompt(validInput());
  const b = buildComputeServingEncryptedPrompt(validInput());
  assert.equal(a.envelopeId, b.envelopeId);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of COMPUTE_SERVING_ENCRYPTED_PROMPT_FORBIDDEN_SUBSTRINGS) {
    assert.throws(
      () => buildComputeServingEncryptedPrompt({ ...validInput(), [forbidden]: 'leak' }),
      new RegExp(`${forbidden} is not a permitted compute-serving-encrypted-prompt field`)
    );
  }
});

test('PERMITTED_ENCRYPTED_PROMPT_KEYS contains exactly the documented set', () => {
  assert.deepEqual([...PERMITTED_ENCRYPTED_PROMPT_KEYS].sort(), [
    'algorithm',
    'ciphertextBase64',
    'createdAt',
    'dispatchId',
    'ephemeralPubKeyBase64',
    'envelopeId',
    'expiresAt',
    'nonceBase64',
    'protocolVersion',
    'requesterId',
    'workerId'
  ].sort());
});

test('rejects non-base64 ciphertext', () => {
  assert.throws(
    () =>
      buildComputeServingEncryptedPrompt({
        ...validInput(),
        ciphertextBase64: 'not base64 — has spaces!'
      }),
    /ciphertextBase64 must match canonical base64/
  );
});

test('rejects oversized ciphertext (cap 8KB)', () => {
  assert.throws(
    () => buildComputeServingEncryptedPrompt({ ...validInput(), ciphertextBase64: fakeBase64(10_000) }),
    /ciphertextBase64 length must be in/
  );
});

test('rejects calendar-invalid createdAt', () => {
  assert.throws(
    () => buildComputeServingEncryptedPrompt({ ...validInput(), createdAt: '2026-13-99T99:99:99Z' }),
    /createdAt must be/
  );
});

test('strips ms precision from createdAt + computes ms-stripped expiresAt', () => {
  const env = buildComputeServingEncryptedPrompt({
    ...validInput(),
    createdAt: '2026-06-03T10:00:00.547Z'
  });
  assert.equal(env.createdAt, '2026-06-03T10:00:00Z');
  assert.equal(/\.\d/.test(env.expiresAt), false);
});

test('buildEncryptedPromptPostedLedgerEvent emits POINTER + count meta', () => {
  const env = buildComputeServingEncryptedPrompt(validInput());
  const event = buildEncryptedPromptPostedLedgerEvent({
    envelope: env,
    at: '2026-06-03T10:00:01.547Z'
  });
  assert.equal(event.type, 'compute_serving.encrypted_prompt_posted');
  assert.equal(event.envelopeId, env.envelopeId);
  assert.equal(event.dispatchId, env.dispatchId);
  assert.equal(event.algorithm, COMPUTE_SERVING_ENCRYPTION_ALGORITHM);
  assert.equal(typeof event.ciphertextLength, 'number');
  assert.equal(/\.\d/.test(event.at), false);
  // §15 — no forbidden substring in the event payload.
  const json = JSON.stringify(event);
  for (const forbidden of COMPUTE_SERVING_ENCRYPTED_PROMPT_FORBIDDEN_SUBSTRINGS) {
    assert.ok(!json.includes(`"${forbidden}"`));
  }
  // And no ciphertext leak — count only.
  assert.ok(!json.includes(env.ciphertextBase64));
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

async function seedRequesterWorkerCapacityDispatch(store, baseUrl) {
  const requester = createIdentity({ displayName: 'Citizen Requester' });
  const worker = createIdentity({ displayName: 'Worker Demo' });
  await store.saveIdentity(requester);
  await store.saveIdentity(worker);
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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        // Phase 13.7.3 — include a fake pubkey to demonstrate
        // the optional field flows through.
        workerEncryptionPubKeyBase64: fakeBase64(65)
      })
    }
  );
  const capacity = (await capRes.json()).capacity;
  const dispatchRes = await fetch(`${baseUrl}/api/compute-serving-dispatches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requesterId: requester.id,
      capacityId: capacity.capacityId,
      promptHash: 'sha256:' + sha256Hex('demo'),
      estimatedTokens: 500
    })
  });
  const dispatch = (await dispatchRes.json()).dispatch;
  return { requester, worker, capacity, dispatch };
}

test('POST /api/compute-serving-dispatches/:id/encrypted-prompt — happy path + ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          ciphertextBase64: fakeBase64(64),
          nonceBase64: fakeBase64(12),
          ephemeralPubKeyBase64: fakeBase64(65)
        })
      }
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.envelope.dispatchId, dispatch.dispatchId);
    assert.equal(body.envelope.algorithm, COMPUTE_SERVING_ENCRYPTION_ALGORITHM);
    const events = await store.listLedger({ type: 'compute_serving.encrypted_prompt_posted' });
    assert.equal(events.length, 1);
    assert.equal(events[0].dispatchId, dispatch.dispatchId);
    // §15 — ledger event must not include ciphertext.
    const evJson = JSON.stringify(events[0]);
    assert.ok(!evJson.includes(body.envelope.ciphertextBase64));
  });
});

test('POST /encrypted-prompt rejects non-requester (403)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requesterId: 'bos:person:not-the-requester',
          ciphertextBase64: fakeBase64(64),
          nonceBase64: fakeBase64(12),
          ephemeralPubKeyBase64: fakeBase64(65)
        })
      }
    );
    assert.equal(r.status, 403);
  });
});

test('POST /encrypted-prompt rejects duplicate envelope (409)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    const body = {
      requesterId: requester.id,
      ciphertextBase64: fakeBase64(64),
      nonceBase64: fakeBase64(12),
      ephemeralPubKeyBase64: fakeBase64(65)
    };
    const first = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(first.status, 201);
    const second = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(second.status, 409);
    const errBody = await second.json();
    assert.equal(errBody.error.code, 'envelope_already_posted');
  });
});

test('GET /encrypted-prompt — worker-only', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, worker, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          ciphertextBase64: fakeBase64(64),
          nonceBase64: fakeBase64(12),
          ephemeralPubKeyBase64: fakeBase64(65)
        })
      }
    );
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt?workerId=${encodeURIComponent(worker.id)}`
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.envelope.dispatchId, dispatch.dispatchId);
    assert.equal(body.protocolVersion, COMPUTE_SERVING_ENCRYPTED_PROMPT_PROTOCOL_VERSION);
  });
});

test('GET /encrypted-prompt rejects non-assigned worker (403)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          ciphertextBase64: fakeBase64(64),
          nonceBase64: fakeBase64(12),
          ephemeralPubKeyBase64: fakeBase64(65)
        })
      }
    );
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt?workerId=bos:person:intruder`
    );
    assert.equal(r.status, 403);
  });
});

test('GET /encrypted-prompt 404 when no envelope posted yet', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { worker, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    const r = await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt?workerId=${encodeURIComponent(worker.id)}`
    );
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error.code, 'envelope_not_found');
  });
});

test('serve wipes the encrypted-prompt envelope', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { requester, worker, dispatch } = await seedRequesterWorkerCapacityDispatch(store, baseUrl);
    await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/encrypted-prompt`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          ciphertextBase64: fakeBase64(64),
          nonceBase64: fakeBase64(12),
          ephemeralPubKeyBase64: fakeBase64(65)
        })
      }
    );
    const before = await store.findComputeServingEncryptedPromptByDispatch(dispatch.dispatchId);
    assert.ok(before);
    await fetch(
      `${baseUrl}/api/compute-serving-dispatches/${encodeURIComponent(dispatch.dispatchId)}/serve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerId: worker.id,
          actualTokens: 500,
          responseHash: 'sha256:' + sha256Hex('demo response')
        })
      }
    );
    const after = await store.findComputeServingEncryptedPromptByDispatch(dispatch.dispatchId);
    assert.equal(after, null);
  });
});

// DPDP cascade — envelopes wipe by either requesterId or workerId.
test('eraseUserData cascades envelopes by requesterId', async () => {
  const { store } = await freshSqlite('cascade-req');
  try {
    const requester = createIdentity({ displayName: 'Citizen Requester' });
    const worker = createIdentity({ displayName: 'Worker Demo' });
    await store.saveIdentity(requester);
    await store.saveIdentity(worker);
    const env = buildComputeServingEncryptedPrompt({
      dispatchId: 'bos:compute-serving-dispatch:x',
      requesterId: requester.id,
      workerId: worker.id,
      ciphertextBase64: fakeBase64(64),
      nonceBase64: fakeBase64(12),
      ephemeralPubKeyBase64: fakeBase64(65),
      createdAt: new Date().toISOString()
    });
    await store.saveComputeServingEncryptedPrompt(env);
    const before = await store.findComputeServingEncryptedPromptByDispatch('bos:compute-serving-dispatch:x');
    assert.ok(before);
    await store.eraseUserData(requester.id, { redactLedgerEntry: (e) => e });
    const after = await store.findComputeServingEncryptedPromptByDispatch('bos:compute-serving-dispatch:x');
    assert.equal(after, null);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

// FE↔BE convergence — the FE algorithm constant matches BE.
test('Phase 13.7.3 — FE encryption algorithm constant matches BE', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'compute-encryption.ts');
  const source = await fs.readFile(fePath, 'utf8');
  // The FE doesn't export an algorithm constant directly — it
  // references the suite via the file's top-doc comment. We
  // verify the comment names the BE algorithm so the two stay
  // in sync.
  assert.ok(source.includes('ECDH(P-256) + HKDF-SHA256 + AES-256-GCM'));
});
