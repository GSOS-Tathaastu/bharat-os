// Phase 9.0c — SLM runtime adapter wrapping llama.cpp-wasm (via @wllama/wllama).
//
// Per ADR 0114: ONE runtime (llama.cpp-wasm), lazy-loaded on first
// install tap. The Wllama JS + WASM is NOT in the main /app/ bundle —
// imported dynamically here so users who never install an SLM never
// pay the bytes.
//
// Adapter API:
//   const runtime = await loadSlmRuntime({
//     ggufBytes: Blob | ArrayBuffer,
//     onProgress?: (n) => void
//   });
//   const text = await runtime.generate({ prompt, maxTokens, onToken? });
//   await runtime.unload();

export interface SlmRuntime {
  /** Stream text tokens for a given prompt. Resolves to the full text. */
  generate(opts: GenerateOptions): Promise<string>;
  /** Free WASM memory + release the worker. */
  unload(): Promise<void>;
  /** Metadata exposed by the loaded GGUF model. */
  metadata: SlmRuntimeMetadata;
}

export interface GenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Called for each generated token. Return false to stop. */
  onToken?: (token: string, partial: string) => void | boolean;
}

export interface SlmRuntimeMetadata {
  family: string;
  contextSize: number;
  vocabSize: number;
  parameterCount?: number;
}

export interface LoadOptions {
  /** GGUF model bytes. Either a Blob (recommended for OPFS files) or ArrayBuffer. */
  ggufBytes: Blob | ArrayBuffer;
  /** Called with bytes loaded / total during weight upload to WASM. */
  onProgress?: (loaded: number, total: number) => void;
  /** Optional log sink (default: silent). */
  logger?: 'silent' | 'console';
}

// Vite picks up the dynamic import; the wllama bundle code-splits
// into its own chunk so the main bundle stays ~100KB gzipped.
async function importWllama() {
  // Cast — wllama ships types but Vite/TS doesn't auto-resolve the
  // bundler-style export map perfectly. Adapter wrapper is what
  // callers depend on; this is the only file touching wllama types.
  const mod = await import('@wllama/wllama');
  return mod;
}

/**
 * Initialize llama.cpp-wasm with a GGUF model.
 *
 * The WASM binary lives on the @wllama jsDelivr CDN; for the demo
 * we pass the path config that wllama defaults to. In a hardened
 * deployment the operator would mirror the WASM behind their own
 * CDN — see ADR 0114 §"Vendoring posture".
 */
export async function loadSlmRuntime(opts: LoadOptions): Promise<SlmRuntime> {
  const wllamaMod = await importWllama();
  const { Wllama } = wllamaMod;

  // Path config: tell wllama where to fetch its WASM binaries from.
  // wllama 3.x exposes WLLAMA_CONFIG_PATHS via the npm package's
  // /esm/wasm directory — but those local files are dev-only. The
  // public jsDelivr CDN serves the same bytes for browser use.
  const WLLAMA_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.4.1/esm/wasm/';
  const pathConfig = {
    default: WLLAMA_CDN_BASE,
    'single-thread/wllama.wasm': `${WLLAMA_CDN_BASE}single-thread/wllama.wasm`,
    'multi-thread/wllama.wasm': `${WLLAMA_CDN_BASE}multi-thread/wllama.wasm`
  };

  const wllama = new Wllama(pathConfig, {
    logger:
      opts.logger === 'console'
        ? console
        : {
            debug: () => {},
            log: () => {},
            warn: console.warn,
            error: console.error
          },
    suppressNativeLog: true
  });

  // wllama wants Blob[]; if we got an ArrayBuffer wrap it.
  const blob =
    opts.ggufBytes instanceof Blob
      ? opts.ggufBytes
      : new Blob([opts.ggufBytes], { type: 'application/octet-stream' });

  // Track progress via the loader callback. Wllama's progressCallback
  // emits {loaded, total}.
  await wllama.loadModel([blob], {
    n_ctx: 2048,
    progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
      opts.onProgress?.(loaded, total);
    }
  } as Parameters<typeof wllama.loadModel>[1]);

  const meta = wllama.getModelMetadata();

  return {
    metadata: {
      family: String(meta.meta?.['general.name'] ?? 'unknown'),
      contextSize: meta.hparams.nCtxTrain,
      vocabSize: meta.hparams.nVocab
    },
    async generate({ prompt, maxTokens = 128, temperature = 0.7, onToken }) {
      let partial = '';
      let stop = false;
      const stream = (await wllama.createCompletion({
        prompt,
        nPredict: maxTokens,
        sampling: { temp: temperature },
        stream: true
      } as Parameters<typeof wllama.createCompletion>[0])) as AsyncIterable<{
        currentText?: string;
        token?: number | { text?: string };
      }>;
      for await (const chunk of stream) {
        if (stop) break;
        const token =
          typeof chunk.token === 'object' && chunk.token?.text
            ? chunk.token.text
            : (chunk.currentText ?? '').slice(partial.length);
        partial += token;
        if (onToken) {
          const result = onToken(token, partial);
          if (result === false) stop = true;
        }
      }
      return partial;
    },
    async unload() {
      try {
        await wllama.exit?.();
      } catch (_e) {
        // best-effort
      }
    }
  };
}

/**
 * Helper: load runtime directly from a URL (without OPFS persistence).
 * Used for the dev-stub model in tests + the "try a prompt" surface
 * when a previously-installed pack hasn't been cached to OPFS yet.
 */
export async function loadSlmRuntimeFromUrl(
  url: string,
  opts: Omit<LoadOptions, 'ggufBytes'> = {}
): Promise<SlmRuntime> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SLM model fetch failed: HTTP ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  return loadSlmRuntime({ ggufBytes: bytes, ...opts });
}
