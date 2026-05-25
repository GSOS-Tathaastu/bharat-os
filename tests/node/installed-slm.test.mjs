// Phase 9.0b — Per-identity SLM install record tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BosStore } from '../../src/phase0/store.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createInstalledSlmRecord,
  INSTALLED_SLM_STATUSES,
  INSTALLED_SLM_PROTOCOL_VERSION
} from '../../src/phase1/installed-slm.mjs';
import { createSlmModelPack } from '../../src/phase1/slm-model-pack.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'installed-slm-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function freshStore(name, Store = BosStore) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new Store(root);
  await store.init();
  return { store, root };
}

const VALID_HASH = 'sha256:' + 'a'.repeat(64);
const OTHER_HASH = 'sha256:' + 'b'.repeat(64);

function validPackInput(overrides = {}) {
  return {
    family: 'phi-3-mini',
    variant: '4k-instruct',
    parameterCount: 3_800_000_000,
    quantization: 'q4_k_m',
    diskBytes: 2_300_000_000,
    ramRequiredMb: 2800,
    runtime: 'llama_cpp_wasm',
    sourceUrl: 'https://models.bharat-os.example/phi-3-mini-4k-q4_k_m.gguf',
    sourceHash: VALID_HASH,
    license: 'mit',
    capabilities: ['inference'],
    registeredBy: 'sre-on-call',
    ...overrides
  };
}

function validInstallInput(overrides = {}) {
  return {
    identityId: 'bos:person:test-worker-123',
    modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
    runtimeBackend: 'llama_cpp_wasm',
    downloadedBytes: 2_300_000_000,
    status: 'installed',
    storageLocation: 'opfs',
    expectedHash: VALID_HASH,
    observedHash: VALID_HASH,
    ...overrides
  };
}

// ─── Module: createInstalledSlmRecord ─────────────────────────────────

test('INSTALLED_SLM_STATUSES enumerates installed and failed', () => {
  assert.deepEqual(INSTALLED_SLM_STATUSES, ['installed', 'failed']);
});

test('createInstalledSlmRecord builds an installed record with derived id', () => {
  const record = createInstalledSlmRecord(validInstallInput());
  assert.match(record.installId, /^bos:installed-slm:[0-9a-f]{32}$/);
  assert.equal(record.protocolVersion, INSTALLED_SLM_PROTOCOL_VERSION);
  assert.equal(record.status, 'installed');
  assert.equal(record.storageLocation, 'opfs');
  assert.equal(record.downloadedBytes, 2_300_000_000);
});

test('createInstalledSlmRecord rejects missing identity / modelPack / runtime', () => {
  for (const field of ['identityId', 'modelPackId', 'runtimeBackend']) {
    assert.throws(
      () => createInstalledSlmRecord(validInstallInput({ [field]: '' })),
      new RegExp(`${field} is required`)
    );
  }
});

test('createInstalledSlmRecord rejects negative or non-integer downloadedBytes', () => {
  assert.throws(
    () => createInstalledSlmRecord(validInstallInput({ downloadedBytes: -1 })),
    /downloadedBytes must be a non-negative integer/
  );
  assert.throws(
    () => createInstalledSlmRecord(validInstallInput({ downloadedBytes: 1.5 })),
    /downloadedBytes must be a non-negative integer/
  );
});

test('createInstalledSlmRecord rejects unsupported status', () => {
  assert.throws(
    () => createInstalledSlmRecord(validInstallInput({ status: 'pending' })),
    /status must be one of/
  );
});

test('createInstalledSlmRecord requires failureReason when status is failed', () => {
  assert.throws(
    () => createInstalledSlmRecord(validInstallInput({ status: 'failed', failureReason: null })),
    /failureReason is required/
  );
  const failed = createInstalledSlmRecord(
    validInstallInput({ status: 'failed', failureReason: 'SHA-256 mismatch' })
  );
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureReason, 'SHA-256 mismatch');
});

test('createInstalledSlmRecord refuses installed when expected/observed hash mismatch', () => {
  assert.throws(
    () => createInstalledSlmRecord(
      validInstallInput({ expectedHash: VALID_HASH, observedHash: OTHER_HASH })
    ),
    /expectedHash and observedHash mismatch/
  );
});

// ─── Storage: file store ──────────────────────────────────────────────

test('BosStore persists installed-slm + emits installed_slm.recorded ledger', async () => {
  const { store } = await freshStore('file-store');
  const record = createInstalledSlmRecord(validInstallInput());
  await store.saveInstalledSlm(record);

  const reloaded = await store.readInstalledSlm(record.installId);
  assert.equal(reloaded.modelPackId, 'bos:slm-model-pack:phi-3-mini-q4');

  const events = await store.listLedger({ type: 'installed_slm.recorded' });
  assert.equal(events.length, 1);
  assert.equal(events[0].installId, record.installId);
});

test('BosStore deleteInstalledSlm hard-removes + emits installed_slm.removed ledger', async () => {
  const { store } = await freshStore('file-store-delete');
  const record = createInstalledSlmRecord(validInstallInput());
  await store.saveInstalledSlm(record);

  const ok = await store.deleteInstalledSlm(record.installId);
  assert.equal(ok, true);

  // File store readJson throws ENOENT when the file is gone — that's
  // the existing convention shared with readOnDeviceModelPack /
  // readPushSubscription. listInstalledSlms is the gone-friendly read.
  const list = await store.listInstalledSlms();
  assert.equal(list.length, 0);

  const events = await store.listLedger({ type: 'installed_slm.removed' });
  assert.equal(events.length, 1);

  // Second delete returns false (already gone) and does not emit a
  // duplicate ledger event.
  const second = await store.deleteInstalledSlm(record.installId);
  assert.equal(second, false);
  const eventsAfter = await store.listLedger({ type: 'installed_slm.removed' });
  assert.equal(eventsAfter.length, 1);
});

test('BosStore failed install emits installed_slm.failed ledger', async () => {
  const { store } = await freshStore('file-store-failed');
  const failedRecord = createInstalledSlmRecord(
    validInstallInput({
      status: 'failed',
      failureReason: 'SHA-256 mismatch',
      observedHash: OTHER_HASH,
      expectedHash: null
    })
  );
  await store.saveInstalledSlm(failedRecord);
  const events = await store.listLedger({ type: 'installed_slm.failed' });
  assert.equal(events.length, 1);
});

// ─── Storage: sqlite store ────────────────────────────────────────────

test('SqliteStore persists installed-slm with identity_id index across reload', async () => {
  const { store, root } = await freshStore('sqlite-store', SqliteStore);
  const record = createInstalledSlmRecord(validInstallInput());
  await store.saveInstalledSlm(record);
  if (typeof store.close === 'function') store.close();

  const reopened = new SqliteStore(root);
  await reopened.init();
  const list = await reopened.listInstalledSlms();
  assert.equal(list.length, 1);
  assert.equal(list[0].identityId, 'bos:person:test-worker-123');
  if (typeof reopened.close === 'function') reopened.close();
});

// ─── DPDP §12(3) cascade ──────────────────────────────────────────────

test('SqliteStore eraseUserData removes installed_slms rows', async () => {
  const { store } = await freshStore('sqlite-cascade', SqliteStore);
  const identityA = createIdentity({ displayName: 'Worker A' });
  const identityB = createIdentity({ displayName: 'Worker B' });
  await store.saveIdentity(identityA);
  await store.saveIdentity(identityB);

  const a = createInstalledSlmRecord(validInstallInput({ identityId: identityA.id }));
  const b = createInstalledSlmRecord(validInstallInput({ identityId: identityB.id }));
  await store.saveInstalledSlm(a);
  await store.saveInstalledSlm(b);

  const report = await store.eraseUserData(identityA.id, { redactLedgerEntry: (e) => e });
  assert.equal(report.sections.installedSlms, 1);

  const remaining = await store.listInstalledSlms();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].identityId, identityB.id);
  if (typeof store.close === 'function') store.close();
});

test('BosStore identity-cascade sweep removes installedSlms entries', async () => {
  const { store } = await freshStore('file-cascade');
  const identityA = createIdentity({ displayName: 'Worker A' });
  const identityB = createIdentity({ displayName: 'Worker B' });
  await store.saveIdentity(identityA);
  await store.saveIdentity(identityB);

  await store.saveInstalledSlm(createInstalledSlmRecord(validInstallInput({ identityId: identityA.id })));
  await store.saveInstalledSlm(createInstalledSlmRecord(validInstallInput({ identityId: identityB.id })));

  const report = await store.eraseUserData(identityA.id, { redactLedgerEntry: (e) => e });
  assert.equal(report.sections.installedSlms, 1);

  const remaining = await store.listInstalledSlms();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].identityId, identityB.id);
});

// ─── HTTP wiring ──────────────────────────────────────────────────────

async function withApiServer(callback, Store = SqliteStore) {
  const { store, root } = await freshStore('srv', Store);
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

async function seedIdentityAndPack(baseUrl, store) {
  const identity = createIdentity({ displayName: 'Test Worker' });
  await store.saveIdentity(identity);
  const pack = createSlmModelPack(validPackInput());
  await store.saveSlmModelPack(pack);
  return { identity, pack };
}

test('GET /api/identities/:id/installed-slms returns 404 for unknown identity', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/identities/bos:person:does-not-exist/installed-slms`);
    assert.equal(response.status, 404);
  });
});

test('GET /api/identities/:id/installed-slms returns empty list initially', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity } = await seedIdentityAndPack(baseUrl, store);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.installs, []);
  });
});

test('POST /api/identities/:id/installed-slms records install + decorates with pack metadata on GET', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, pack } = await seedIdentityAndPack(baseUrl, store);

    const createResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: pack.diskBytes,
          status: 'installed',
          observedHash: pack.sourceHash
        })
      }
    );
    assert.equal(createResp.status, 201);
    const createBody = await createResp.json();
    assert.equal(createBody.install.status, 'installed');
    assert.equal(createBody.install.expectedHash, pack.sourceHash);

    const listResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`
    );
    const listBody = await listResp.json();
    assert.equal(listBody.installs.length, 1);
    assert.equal(listBody.installs[0].pack.family, 'phi-3-mini');
    assert.equal(listBody.installs[0].pack.status, 'registered');

    const events = await store.listLedger({ type: 'installed_slm.recorded' });
    assert.equal(events.length, 1);
  });
});

test('POST /api/identities/:id/installed-slms refuses install when observed hash mismatches registry source hash', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, pack } = await seedIdentityAndPack(baseUrl, store);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: pack.diskBytes,
          status: 'installed',
          observedHash: OTHER_HASH
        })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_install_record');
    assert.match(body.error.message, /mismatch/);
  });
});

test('POST /api/identities/:id/installed-slms allows status=failed without observed hash', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, pack } = await seedIdentityAndPack(baseUrl, store);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: 1_000_000,
          status: 'failed',
          failureReason: 'Network dropped'
        })
      }
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.install.status, 'failed');
    assert.equal(body.install.failureReason, 'Network dropped');
  });
});

test('POST /api/identities/:id/installed-slms returns 404 when pack unknown', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity } = await seedIdentityAndPack(baseUrl, store);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: 'bos:slm-model-pack:does-not-exist',
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: 1,
          status: 'installed',
          observedHash: VALID_HASH
        })
      }
    );
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.code, 'unknown_pack');
  });
});

test('POST /api/identities/:id/installed-slms returns 409 when pack is revoked', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, pack } = await seedIdentityAndPack(baseUrl, store);
    // Revoke the pack via store directly to avoid needing admin auth here.
    const { revokeSlmModelPack } = await import('../../src/phase1/slm-model-pack.mjs');
    await store.saveSlmModelPack(revokeSlmModelPack(pack, { revokedBy: 'sre' }));

    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: pack.diskBytes,
          status: 'installed',
          observedHash: pack.sourceHash
        })
      }
    );
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'pack_revoked');
  });
});

test('DELETE /api/identities/:id/installed-slms/:installId hard-removes + 404 for other identity', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, pack } = await seedIdentityAndPack(baseUrl, store);
    const otherIdentity = createIdentity({ displayName: 'Other Worker' });
    await store.saveIdentity(otherIdentity);

    const createResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: pack.diskBytes,
          status: 'installed',
          observedHash: pack.sourceHash
        })
      }
    );
    const { install } = await createResp.json();

    // Cross-identity DELETE must 404 — the install belongs to
    // `identity`, not `otherIdentity`.
    const wrongResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(otherIdentity.id)}/installed-slms/${encodeURIComponent(install.installId)}`,
      { method: 'DELETE' }
    );
    assert.equal(wrongResp.status, 404);

    const deleteResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/installed-slms/${encodeURIComponent(install.installId)}`,
      { method: 'DELETE' }
    );
    assert.equal(deleteResp.status, 200);
    const deleteBody = await deleteResp.json();
    assert.equal(deleteBody.removed, true);

    const events = await store.listLedger({ type: 'installed_slm.removed' });
    assert.equal(events.length, 1);
  });
});
