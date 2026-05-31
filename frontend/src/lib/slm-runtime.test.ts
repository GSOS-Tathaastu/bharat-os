import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 9.0c — adapter tests with @wllama/wllama mocked. We don't
// load actual WASM in jsdom; we verify the adapter calls wllama
// correctly + handles streaming + handles unload.

const mockLoadModel = vi.fn();
const mockCreateCompletion = vi.fn();
const mockGetModelMetadata = vi.fn();
const mockExit = vi.fn();

class FakeWllama {
  constructor(public pathConfig: unknown, public config?: unknown) {}
  loadModel = mockLoadModel;
  createCompletion = mockCreateCompletion;
  getModelMetadata = mockGetModelMetadata;
  exit = mockExit;
}

vi.mock('@wllama/wllama', () => ({ Wllama: FakeWllama }));

beforeEach(() => {
  mockLoadModel.mockReset();
  mockCreateCompletion.mockReset();
  mockGetModelMetadata.mockReset();
  mockExit.mockReset();
  mockGetModelMetadata.mockReturnValue({
    hparams: { nCtxTrain: 2048, nVocab: 32000, nEmbd: 768, nLayer: 12 },
    meta: { 'general.name': 'phi-3-mini' }
  });
});

describe('loadSlmRuntime', () => {
  it('loads a model from a Blob and exposes metadata', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0x47, 0x47, 0x55, 0x46])], {
      type: 'application/octet-stream'
    });
    mockLoadModel.mockResolvedValue(undefined);
    const runtime = await loadSlmRuntime({ ggufBytes: blob });
    expect(mockLoadModel).toHaveBeenCalled();
    expect(runtime.metadata.family).toBe('phi-3-mini');
    expect(runtime.metadata.contextSize).toBe(2048);
    expect(runtime.metadata.vocabSize).toBe(32000);
  });

  it('wraps ArrayBuffer ggufBytes in a Blob before calling loadModel', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const buf = new ArrayBuffer(8);
    mockLoadModel.mockResolvedValue(undefined);
    await loadSlmRuntime({ ggufBytes: buf });
    const [blobs] = mockLoadModel.mock.calls[0];
    expect(Array.isArray(blobs)).toBe(true);
    expect(blobs[0]).toBeInstanceOf(Blob);
  });

  it('forwards progress callback through to wllama', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0x47, 0x47, 0x55, 0x46])]);
    const onProgress = vi.fn();
    mockLoadModel.mockImplementation(async (_blobs, params) => {
      params?.progressCallback?.({ loaded: 50, total: 100 });
    });
    await loadSlmRuntime({ ggufBytes: blob, onProgress });
    expect(onProgress).toHaveBeenCalledWith(50, 100);
  });
});

describe('runtime.generate', () => {
  it('streams tokens and returns the accumulated text', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0])]);
    mockLoadModel.mockResolvedValue(undefined);

    async function* stream() {
      yield { token: { text: 'Hello' } };
      yield { token: { text: ' world' } };
    }
    mockCreateCompletion.mockResolvedValue(stream());

    const runtime = await loadSlmRuntime({ ggufBytes: blob });
    const tokens: string[] = [];
    const result = await runtime.generate({
      prompt: 'Greeting?',
      maxTokens: 32,
      onToken: (tok) => {
        tokens.push(tok);
      }
    });
    expect(result).toBe('Hello world');
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('stops streaming when onToken returns false', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0])]);
    mockLoadModel.mockResolvedValue(undefined);

    async function* stream() {
      yield { token: { text: 'A' } };
      yield { token: { text: 'B' } };
      yield { token: { text: 'C' } };
    }
    mockCreateCompletion.mockResolvedValue(stream());

    const runtime = await loadSlmRuntime({ ggufBytes: blob });
    const result = await runtime.generate({
      prompt: 'x',
      onToken: (_tok, partial) => (partial.length >= 1 ? false : undefined)
    });
    expect(result).toBe('A');
  });
});

describe('runtime.unload', () => {
  it('calls wllama.exit()', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0])]);
    mockLoadModel.mockResolvedValue(undefined);
    mockExit.mockResolvedValue(undefined);
    const runtime = await loadSlmRuntime({ ggufBytes: blob });
    await runtime.unload();
    expect(mockExit).toHaveBeenCalled();
  });

  it('swallows exit errors silently', async () => {
    const { loadSlmRuntime } = await import('./slm-runtime');
    const blob = new Blob([new Uint8Array([0])]);
    mockLoadModel.mockResolvedValue(undefined);
    mockExit.mockRejectedValue(new Error('worker already terminated'));
    const runtime = await loadSlmRuntime({ ggufBytes: blob });
    await expect(runtime.unload()).resolves.toBeUndefined();
  });
});
