// Phase 13.0.0a — shared wllama runtime singleton tests.
//
// The shared runtime caches a single Promise<SlmRuntime> keyed on
// modelPackId. Concurrent callers with the same packId share the
// same promise (so the GGUF bytes load AT MOST once). New packId →
// unload + rebuild. Test scope is the cache invariant; we mock
// loadSlmRuntime via the shared module's dynamic-import-of-wllama
// boundary so we don't actually need a real GGUF or WASM runtime.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We test getSharedSlmRuntime + releaseSharedSlmRuntime against the
// REAL slm-runtime.ts module, mocking only the wllama dynamic import
// so we don't need a real GGUF / WASM. The mock returns a fake
// SlmRuntime with a spy unload().

let unloadCount = 0;
const buildCalls: string[] = [];

vi.mock('@wllama/wllama', () => {
  class FakeWllama {
    constructor(_paths: unknown, _opts: unknown) {}
    async loadModel(_blobs: unknown[], _opts: { progressCallback?: (p: { loaded: number; total: number }) => void }) {
      _opts.progressCallback?.({ loaded: 100, total: 100 });
      buildCalls.push('load');
    }
    getModelMetadata() {
      return {
        meta: { 'general.name': 'fake-family' },
        hparams: { nCtxTrain: 2048, nVocab: 32000 }
      };
    }
    async createCompletion(_args: unknown) {
      // Not used in these tests.
      return { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }) };
    }
    async exit() {
      unloadCount += 1;
    }
  }
  return { Wllama: FakeWllama, default: { Wllama: FakeWllama } };
});

import {
  getSharedSlmRuntime,
  releaseSharedSlmRuntime,
  _sharedSlmRuntimeModelPackIdForTesting
} from './slm-runtime';

function makeBlob(): Blob {
  return new Blob([new Uint8Array([0x47, 0x47, 0x55, 0x46])], { type: 'application/octet-stream' });
}

beforeEach(() => {
  unloadCount = 0;
  buildCalls.length = 0;
});

afterEach(async () => {
  await releaseSharedSlmRuntime();
});

describe('getSharedSlmRuntime', () => {
  it('returns the SAME promise for two concurrent calls with the same packId (load happens once)', async () => {
    const loader = vi.fn(async () => makeBlob());
    const p1 = getSharedSlmRuntime('bos:slm:pack-A', loader);
    const p2 = getSharedSlmRuntime('bos:slm:pack-A', loader);
    expect(p1).toBe(p2);
    await p1;
    await p2;
    expect(loader).toHaveBeenCalledTimes(1);
    expect(buildCalls).toHaveLength(1);
  });

  it('returns the cached promise on a third call after settle', async () => {
    const loader = vi.fn(async () => makeBlob());
    const p1 = await getSharedSlmRuntime('bos:slm:pack-A', loader);
    const p2 = await getSharedSlmRuntime('bos:slm:pack-A', loader);
    expect(p1).toBe(p2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBe('bos:slm:pack-A');
  });

  it('unloads the previous runtime + rebuilds when packId changes', async () => {
    const loaderA = vi.fn(async () => makeBlob());
    const loaderB = vi.fn(async () => makeBlob());
    await getSharedSlmRuntime('bos:slm:pack-A', loaderA);
    await getSharedSlmRuntime('bos:slm:pack-B', loaderB);
    // Wait a microtask so the fire-and-forget unload runs.
    await new Promise((r) => setTimeout(r, 0));
    expect(unloadCount).toBeGreaterThanOrEqual(1);
    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBe('bos:slm:pack-B');
  });

  it('rejects with no_blob when the loader returns null', async () => {
    const loader = vi.fn(async () => null);
    await expect(
      getSharedSlmRuntime('bos:slm:pack-C', loader)
    ).rejects.toThrow(/no_blob/);
  });

  it('clears the cache on rejected load so a retry rebuilds', async () => {
    const failingLoader = vi.fn(async () => null);
    await expect(getSharedSlmRuntime('bos:slm:pack-D', failingLoader)).rejects.toThrow();
    // Cache should be cleared.
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBeNull();
    // Retry with a working loader rebuilds.
    const goodLoader = vi.fn(async () => makeBlob());
    await getSharedSlmRuntime('bos:slm:pack-D', goodLoader);
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBe('bos:slm:pack-D');
    expect(goodLoader).toHaveBeenCalledTimes(1);
  });
});

describe('releaseSharedSlmRuntime', () => {
  it('releases the shared runtime + clears the cache when no packId is given', async () => {
    const loader = vi.fn(async () => makeBlob());
    await getSharedSlmRuntime('bos:slm:pack-E', loader);
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBe('bos:slm:pack-E');
    await releaseSharedSlmRuntime();
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBeNull();
    expect(unloadCount).toBeGreaterThanOrEqual(1);
  });

  it('releases only when the supplied packId matches the cached one', async () => {
    const loader = vi.fn(async () => makeBlob());
    await getSharedSlmRuntime('bos:slm:pack-F', loader);
    // Non-matching packId — no-op.
    await releaseSharedSlmRuntime('bos:slm:pack-OTHER');
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBe('bos:slm:pack-F');
    expect(unloadCount).toBe(0);
    // Matching packId — drops.
    await releaseSharedSlmRuntime('bos:slm:pack-F');
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBeNull();
    expect(unloadCount).toBeGreaterThanOrEqual(1);
  });

  it('is safe to call when nothing is cached', async () => {
    await releaseSharedSlmRuntime();
    await releaseSharedSlmRuntime('bos:slm:any');
    expect(_sharedSlmRuntimeModelPackIdForTesting()).toBeNull();
  });
});
