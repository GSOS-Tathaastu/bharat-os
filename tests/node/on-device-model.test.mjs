import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  createOnDeviceModelPack,
  createOnDeviceRuntimePlan,
  ON_DEVICE_TASKS
} from '../../src/phase1/on-device-model.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

test('on-device model runtime advertises supported local SLM tasks', () => {
  assert.deepEqual(ON_DEVICE_TASKS, ['intent_planning', 'field_extraction', 'summarization']);
});

test('on-device model pack stores metadata without model weights', () => {
  const pack = createOnDeviceModelPack({
    modelId: 'gemma-2b-it-q4-webgpu',
    family: 'gemma-2b-it-q4',
    runtime: 'webgpu_transformersjs',
    bytes: 1_250_000_000,
    sha256: 'a'.repeat(64),
    capabilities: ['intent_planning', 'summarization'],
    localeCoverage: ['en-IN', 'hi-IN']
  });

  assert.match(pack.onDeviceModelPackId, /^bos:on-device-model-pack:/);
  assert.deepEqual(pack.capabilities, ['intent_planning', 'summarization']);
  assert.equal(pack.modelBytesStored, false);
  assert.equal(JSON.stringify(pack).includes('modelWeights'), false);
});

test('on-device runtime prefers compatible WebGPU model and falls back to deterministic rules', () => {
  const pack = createOnDeviceModelPack({
    modelId: 'phi-3-mini-webgpu',
    runtime: 'webgpu_transformersjs',
    capabilities: ['intent_planning']
  });
  const ready = createOnDeviceRuntimePlan({
    task: 'intent_planning',
    modelPacks: [pack],
    webGpuAvailable: true
  });
  assert.equal(ready.runtime, 'webgpu_transformersjs');
  assert.equal(ready.localModelReady, true);
  assert.equal(ready.selectedModelPackId, pack.onDeviceModelPackId);

  const fallback = createOnDeviceRuntimePlan({
    task: 'field_extraction',
    modelPacks: [pack],
    webGpuAvailable: true
  });
  assert.equal(fallback.runtime, 'deterministic_rules_with_model_slot');
  assert.equal(fallback.localModelReady, false);
});

test('store persists on-device model packs and ledger evidence', async () => {
  const { store } = await freshStore('on-device-model-store');
  const pack = createOnDeviceModelPack({ modelId: 'tiny-llm-wasm', runtime: 'wasm_llamacpp' });

  await store.saveOnDeviceModelPack(pack);

  assert.equal((await store.readOnDeviceModelPack(pack.onDeviceModelPackId)).modelId, 'tiny-llm-wasm');
  assert.equal((await store.listOnDeviceModelPacks()).length, 1);
  const events = await store.listLedger({ type: 'on_device_model_pack.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].onDeviceModelPackId, pack.onDeviceModelPackId);
});
