// Phase 9.0a — Tier-4 SLM model-pack registry tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BosStore } from '../../src/phase0/store.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createSlmModelPack,
  filterCompatibleSlmModelPacks,
  revokeSlmModelPack,
  SLM_RUNTIMES,
  SLM_QUANTIZATIONS,
  SLM_LICENSES,
  SLM_CAPABILITIES
} from '../../src/phase1/slm-model-pack.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'slm-model-pack-tests');

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
    contextWindow: 4096,
    description: 'Microsoft Phi-3 mini, 4K context, Q4_K_M quant.',
    registeredBy: 'sre-on-call',
    ...overrides
  };
}

// ─── Module: createSlmModelPack ───────────────────────────────────────

test('SLM registry advertises supported runtimes / quantizations / licenses / capabilities', () => {
  assert.deepEqual(SLM_RUNTIMES, [
    'llama_cpp_wasm',
    'mlc_llm_webgpu',
    'onnx_runtime_web',
    'native_aosp'
  ]);
  assert.ok(SLM_QUANTIZATIONS.includes('q4_k_m'));
  assert.ok(SLM_LICENSES.includes('mit'));
  assert.ok(SLM_CAPABILITIES.includes('inference'));
});

test('createSlmModelPack returns a normalized pack with derived modelPackId', () => {
  const pack = createSlmModelPack(validPackInput());
  assert.match(pack.modelPackId, /^bos:slm-model-pack:[0-9a-f]{32}$/);
  assert.equal(pack.tier, 4);
  assert.equal(pack.family, 'phi-3-mini');
  assert.equal(pack.runtime, 'llama_cpp_wasm');
  assert.equal(pack.status, 'registered');
  assert.equal(pack.parameterCount, 3_800_000_000);
  assert.equal(pack.diskBytes, 2_300_000_000);
  assert.equal(pack.contextWindow, 4096);
  assert.deepEqual(pack.capabilities, ['inference']);
});

test('createSlmModelPack honours explicit modelPackId', () => {
  const pack = createSlmModelPack(validPackInput({ modelPackId: 'bos:slm:phi-3-mini-q4' }));
  assert.equal(pack.modelPackId, 'bos:slm:phi-3-mini-q4');
});

test('createSlmModelPack rejects unsupported runtime', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ runtime: 'fictional_engine' })),
    /runtime must be one of/
  );
});

test('createSlmModelPack rejects unsupported quantization', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ quantization: 'q9' })),
    /quantization must be one of/
  );
});

test('createSlmModelPack rejects unsupported license', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ license: 'gpl-3.0' })),
    /license must be one of/
  );
});

test('createSlmModelPack rejects http (non-https) sourceUrl', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ sourceUrl: 'http://models.example.com/foo.gguf' })),
    /https/
  );
});

test('createSlmModelPack rejects malformed sourceHash', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ sourceHash: 'md5:abc' })),
    /sha256/
  );
});

test('createSlmModelPack rejects packs exceeding the 8 GB Tier-4 envelope', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ diskBytes: 9_000_000_000 })),
    /8 GB/
  );
});

test('createSlmModelPack rejects packs with absurd RAM requirement', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ ramRequiredMb: 32_768 })),
    /16 GB/
  );
});

test('createSlmModelPack rejects packs with no capabilities', () => {
  assert.throws(
    () => createSlmModelPack(validPackInput({ capabilities: ['not_a_real_capability'] })),
    /capability/
  );
});

test('revokeSlmModelPack flips status without deleting metadata', () => {
  const pack = createSlmModelPack(validPackInput());
  const revoked = revokeSlmModelPack(pack, { revokedBy: 'sre-on-call', reason: 'license change' });
  assert.equal(revoked.modelPackId, pack.modelPackId);
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedBy, 'sre-on-call');
  assert.equal(revoked.revocationReason, 'license change');
  assert.ok(revoked.revokedAt);
});

test('revokeSlmModelPack is idempotent', () => {
  const pack = revokeSlmModelPack(createSlmModelPack(validPackInput()));
  const second = revokeSlmModelPack(pack);
  assert.equal(second, pack);
});

// ─── Module: filterCompatibleSlmModelPacks ────────────────────────────

test('filterCompatibleSlmModelPacks excludes revoked packs', () => {
  const pack = createSlmModelPack(validPackInput());
  const revoked = revokeSlmModelPack(createSlmModelPack(validPackInput({ family: 'gemma-2b' })));
  const compat = filterCompatibleSlmModelPacks([pack, revoked]);
  assert.equal(compat.length, 1);
  assert.equal(compat[0].family, 'phi-3-mini');
});

test('filterCompatibleSlmModelPacks excludes packs exceeding device RAM', () => {
  const small = createSlmModelPack(validPackInput({ ramRequiredMb: 1500 }));
  const big = createSlmModelPack(validPackInput({ family: 'llama-3-8b', ramRequiredMb: 6500 }));
  const compat = filterCompatibleSlmModelPacks([small, big], { deviceRamMb: 4000 });
  assert.equal(compat.length, 1);
  assert.equal(compat[0].family, 'phi-3-mini');
});

test('filterCompatibleSlmModelPacks excludes packs without 1.2x free disk headroom', () => {
  const pack = createSlmModelPack(validPackInput({ diskBytes: 2_000_000_000 }));
  // 1.2 * 2GB = 2.4GB required; free = 2.2GB → excluded.
  const compat = filterCompatibleSlmModelPacks([pack], { freeDiskBytes: 2_200_000_000 });
  assert.equal(compat.length, 0);
});

test('filterCompatibleSlmModelPacks excludes packs whose runtime is unsupported on device', () => {
  const wasm = createSlmModelPack(validPackInput({ runtime: 'llama_cpp_wasm' }));
  const webgpu = createSlmModelPack(validPackInput({ family: 'gemma-2b', runtime: 'mlc_llm_webgpu' }));
  const compat = filterCompatibleSlmModelPacks([wasm, webgpu], {
    supportedRuntimes: ['llama_cpp_wasm']
  });
  assert.equal(compat.length, 1);
  assert.equal(compat[0].runtime, 'llama_cpp_wasm');
});

// ─── Storage: file store ──────────────────────────────────────────────

test('BosStore persists slm-model-packs and emits ledger evidence', async () => {
  const { store } = await freshStore('file-store');
  const pack = createSlmModelPack(validPackInput());
  await store.saveSlmModelPack(pack);

  const reloaded = await store.readSlmModelPack(pack.modelPackId);
  assert.equal(reloaded.family, 'phi-3-mini');

  const list = await store.listSlmModelPacks();
  assert.equal(list.length, 1);

  const events = await store.listLedger({ type: 'slm_model_pack.registered' });
  assert.equal(events.length, 1);
  assert.equal(events[0].modelPackId, pack.modelPackId);
  assert.equal(events[0].operator, 'sre-on-call');
});

test('BosStore records revoked status with a slm_model_pack.revoked ledger event', async () => {
  const { store } = await freshStore('file-store-revoke');
  const pack = createSlmModelPack(validPackInput());
  await store.saveSlmModelPack(pack);

  const revoked = revokeSlmModelPack(pack, { revokedBy: 'sre-on-call', reason: 'CVE-2026-1234' });
  await store.saveSlmModelPack(revoked);

  const events = await store.listLedger({ type: 'slm_model_pack.revoked' });
  assert.equal(events.length, 1);
  assert.equal(events[0].modelPackId, pack.modelPackId);

  const list = await store.listSlmModelPacks();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'revoked');
});

// ─── Storage: sqlite store ────────────────────────────────────────────

test('SqliteStore persists slm-model-packs across reload', async () => {
  const { store, root } = await freshStore('sqlite-store', SqliteStore);
  const pack = createSlmModelPack(validPackInput());
  await store.saveSlmModelPack(pack);
  if (typeof store.close === 'function') store.close();

  const reopened = new SqliteStore(root);
  await reopened.init();
  const list = await reopened.listSlmModelPacks();
  assert.equal(list.length, 1);
  assert.equal(list[0].family, 'phi-3-mini');
  if (typeof reopened.close === 'function') reopened.close();
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

test('GET /api/slm-model-packs returns empty list initially with supported enums', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/slm-model-packs`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.modelPacks, []);
    assert.equal(body.totalRegistered, 0);
    assert.equal(body.totalActive, 0);
    assert.ok(body.supportedRuntimes.includes('llama_cpp_wasm'));
    assert.ok(body.supportedQuantizations.includes('q4_k_m'));
  });
});

test('POST /api/admin/slm-model-packs refuses when token unset', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validPackInput())
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.error.code, 'admin_disabled');
    });
  });
});

test('POST /api/admin/slm-model-packs refuses with wrong token', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer wrong-token-for-this-test'
        },
        body: JSON.stringify(validPackInput())
      });
      assert.equal(response.status, 401);
    });
  });
});

test('POST /api/admin/slm-model-packs registers a pack + GET reflects it + ledger records it', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const response = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-bharat-os-operator': 'sre-on-call'
        },
        body: JSON.stringify(validPackInput())
      });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.modelPack.family, 'phi-3-mini');
      assert.equal(body.modelPack.status, 'registered');
      assert.equal(body.modelPack.registeredBy, 'sre-on-call');

      const listResponse = await fetch(`${baseUrl}/api/slm-model-packs`);
      const listBody = await listResponse.json();
      assert.equal(listBody.modelPacks.length, 1);
      assert.equal(listBody.totalRegistered, 1);
      assert.equal(listBody.totalActive, 1);

      const events = await store.listLedger({ type: 'slm_model_pack.registered' });
      assert.equal(events.length, 1);
      assert.equal(events[0].operator, 'sre-on-call');
    });
  });
});

test('POST /api/admin/slm-model-packs returns 400 on invalid metadata', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(validPackInput({ runtime: 'fictional_engine' }))
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, 'invalid_slm_model_pack');
    });
  });
});

test('POST /api/admin/slm-model-packs returns 409 on duplicate registration', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const input = validPackInput({ modelPackId: 'bos:slm:phi-3-mini-q4-test' });
      const first = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      });
      assert.equal(first.status, 201);

      const second = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      });
      assert.equal(second.status, 409);
      const body = await second.json();
      assert.equal(body.error.code, 'duplicate_pack');
    });
  });
});

test('DELETE /api/admin/slm-model-packs/:id revokes (soft-delete) with ledger event', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const registerResponse = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-bharat-os-operator': 'sre-on-call'
        },
        body: JSON.stringify(validPackInput())
      });
      const { modelPack } = await registerResponse.json();

      const deleteResponse = await fetch(
        `${baseUrl}/api/admin/slm-model-packs/${encodeURIComponent(modelPack.modelPackId)}`,
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'x-bharat-os-operator': 'sre-on-call'
          },
          body: JSON.stringify({ reason: 'license expired' })
        }
      );
      assert.equal(deleteResponse.status, 200);
      const deleteBody = await deleteResponse.json();
      assert.equal(deleteBody.modelPack.status, 'revoked');
      assert.equal(deleteBody.modelPack.revocationReason, 'license expired');

      const events = await store.listLedger({ type: 'slm_model_pack.revoked' });
      assert.equal(events.length, 1);

      // GET activeOnly excludes the revoked pack.
      const activeResp = await fetch(`${baseUrl}/api/slm-model-packs?activeOnly=true`);
      const activeBody = await activeResp.json();
      assert.equal(activeBody.modelPacks.length, 0);
      assert.equal(activeBody.totalRegistered, 1);
      assert.equal(activeBody.totalActive, 0);
    });
  });
});

test('DELETE /api/admin/slm-model-packs/:id returns 404 for unknown pack', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/slm-model-packs/bos:slm-model-pack:does-not-exist`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 404);
    });
  });
});

test('GET /api/slm-model-packs?compatible=true filters by deviceRamMb/freeDiskBytes/supportedRuntimes', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      // Register two packs: a small wasm pack the device can run + a
      // big webgpu pack it cannot.
      await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          validPackInput({
            family: 'phi-3-mini',
            ramRequiredMb: 2500,
            diskBytes: 2_000_000_000,
            runtime: 'llama_cpp_wasm'
          })
        )
      });
      await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          validPackInput({
            family: 'llama-3-8b',
            ramRequiredMb: 6500,
            diskBytes: 4_500_000_000,
            runtime: 'mlc_llm_webgpu'
          })
        )
      });

      const response = await fetch(
        `${baseUrl}/api/slm-model-packs?compatible=true&deviceRamMb=4000&freeDiskBytes=3000000000&supportedRuntimes=llama_cpp_wasm,onnx_runtime_web`
      );
      const body = await response.json();
      assert.equal(body.modelPacks.length, 1);
      assert.equal(body.modelPacks[0].family, 'phi-3-mini');
      assert.equal(body.totalRegistered, 2);
    });
  });
});

test('GET /api/slm-model-packs/:id returns single pack or 404', async () => {
  const token = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: token }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const registerResponse = await fetch(`${baseUrl}/api/admin/slm-model-packs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(validPackInput())
      });
      const { modelPack } = await registerResponse.json();

      const found = await fetch(
        `${baseUrl}/api/slm-model-packs/${encodeURIComponent(modelPack.modelPackId)}`
      );
      assert.equal(found.status, 200);
      const foundBody = await found.json();
      assert.equal(foundBody.modelPack.modelPackId, modelPack.modelPackId);

      const missing = await fetch(`${baseUrl}/api/slm-model-packs/bos:slm-model-pack:does-not-exist`);
      assert.equal(missing.status, 404);
    });
  });
});
