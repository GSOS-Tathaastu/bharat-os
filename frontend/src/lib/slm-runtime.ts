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
  /**
   * Phase 9.0d — compute a gradient update for a federated-round
   * fine-tune. Returns a Float32 gradient vector + DP-SGD privacy
   * accounting metadata. **Today this is a deterministic stub** —
   * llama.cpp-wasm exposes inference, not training gradients. The
   * stub produces a length-32 vector deterministically derived from
   * the prompt + targetTask so the round substrate (Phase 3.x) can
   * aggregate it via `composeFederatedUpdate` and the worker still
   * earns the round's payout-per-update. Real gradient computation
   * + LoRA fine-tuning are a future polish step that needs either a
   * different runtime backend (MLC-LLM with training-mode) or a
   * custom WASM build of llama.cpp with `--enable-training`.
   */
  computeGradients(opts: GradientOptions): Promise<GradientResult>;
  /** Free WASM memory + release the worker. */
  unload(): Promise<void>;
  /** Metadata exposed by the loaded GGUF model. */
  metadata: SlmRuntimeMetadata;
}

export interface GradientOptions {
  /** Local training samples — prompt + ideal completion pairs. */
  samples: Array<{ prompt: string; completion: string }>;
  /** Free-form task label from the federated round. */
  targetTask: string;
  /** Opaque LoRA config from the round (rank, target layers, etc.). */
  loraConfig?: unknown;
  /** Differential-privacy budget for this update. */
  epsilon?: number;
}

export interface GradientResult {
  /** Float32 gradient vector. Length is runtime-defined; today 32. */
  vector: Float32Array;
  /** ε actually spent (after DP-noise). */
  epsilonSpent: number;
  /** Sample count contributing to this update. */
  samples: number;
  /** Set when the result is a Phase 9.0d stub, not real training. */
  stub?: boolean;
}

/**
 * Phase 2a.1.7 — chat template + stop tokens.
 *
 * `prompt` is a RAW text completion (no wrapping applied). Use it when
 * the caller has already applied the correct chat template.
 *
 * `systemPrompt` + `userPrompt` (or `messages`) opt into automatic
 * chat-template wrapping based on the loaded model's family
 * (metadata.family). The runtime detects Qwen / Phi / Llama shape and
 * applies the correct wrapper + stop tokens. Without this, chat-tuned
 * models like Qwen2.5-Instruct produce garbage: the model tries to
 * continue the raw text instead of answering, then keeps generating
 * past the end-of-turn token into gibberish.
 *
 * At most one of `prompt` / `systemPrompt+userPrompt` / `messages`
 * should be provided; the runtime picks the first non-empty one.
 */
export interface GenerateOptions {
  prompt?: string;
  systemPrompt?: string;
  userPrompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Called for each generated token. Return false to stop. */
  onToken?: (token: string, partial: string) => void | boolean;
}

/**
 * Phase 2a.1.7 — chat-template registry. Detects model family from
 * metadata.family and returns (prompt-wrapper, stop-tokens).
 *
 * Adding a new family: match on the family substring returned by the
 * GGUF's `general.name` metadata, then apply the model's canonical
 * ChatML-style template. Stop tokens are CRITICAL — without them, the
 * model keeps generating past its end-of-turn marker.
 */
export type ChatTemplateApplier = (
  systemPrompt: string,
  userPrompt: string
) => { prompt: string; stopPrompts: string[] };

const QWEN_TEMPLATE: ChatTemplateApplier = (systemPrompt, userPrompt) => ({
  prompt:
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userPrompt}<|im_end|>\n` +
    `<|im_start|>assistant\n`,
  stopPrompts: ['<|im_end|>', '<|endoftext|>']
});

const PHI_TEMPLATE: ChatTemplateApplier = (systemPrompt, userPrompt) => ({
  prompt:
    `<|system|>\n${systemPrompt}<|end|>\n` +
    `<|user|>\n${userPrompt}<|end|>\n` +
    `<|assistant|>\n`,
  stopPrompts: ['<|end|>', '<|endoftext|>']
});

const LLAMA3_TEMPLATE: ChatTemplateApplier = (systemPrompt, userPrompt) => ({
  prompt:
    `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>` +
    `<|start_header_id|>user<|end_header_id|>\n\n${userPrompt}<|eot_id|>` +
    `<|start_header_id|>assistant<|end_header_id|>\n\n`,
  stopPrompts: ['<|eot_id|>', '<|end_of_text|>']
});

/** Family fallback: naive completion + no stop tokens. Chat-tuned
 *  models will produce garbage; only use for base models. */
const RAW_TEMPLATE: ChatTemplateApplier = (systemPrompt, userPrompt) => ({
  prompt: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt,
  stopPrompts: []
});

export function pickChatTemplateForFamily(family: string): ChatTemplateApplier {
  const f = family.toLowerCase();
  if (f.includes('qwen')) return QWEN_TEMPLATE;
  if (f.includes('phi-3') || f.includes('phi3') || f.includes('phi 3')) return PHI_TEMPLATE;
  if (f.includes('llama-3') || f.includes('llama3') || f.includes('llama 3')) return LLAMA3_TEMPLATE;
  return RAW_TEMPLATE;
}

const DEFAULT_SYSTEM_PROMPT = 'You are Bharat OS, a helpful India-first assistant. Answer clearly and briefly.';

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
    // Phase 13.0 adversarial fix SF-2 — when logger is 'silent',
    // suppress warn/error too. wllama's default sends those to
    // console.warn / console.error, and on tokenisation /
    // context-window errors the underlying llama.cpp can emit a
    // slice of the offending prompt. The doc-summariser passes
    // citizen-pasted document text in its prompt — letting that
    // leak to DevTools console would violate §15 bytes-never-leak.
    logger:
      opts.logger === 'console'
        ? console
        : {
            debug: () => {},
            log: () => {},
            warn: () => {},
            error: () => {}
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
    async generate({
      prompt,
      systemPrompt,
      userPrompt,
      messages,
      maxTokens = 128,
      temperature,
      onToken
    }) {
      // Phase 2a.1.7 — build the final prompt + stop tokens based on
      // which input shape the caller used.
      //
      // Precedence (first non-empty wins): messages → systemPrompt+userPrompt
      // → prompt (raw). Chat inputs get automatic templating + stop
      // tokens based on model family; raw prompts get neither.
      const modelFamily = String(meta.meta?.['general.name'] ?? 'unknown');
      const applyTemplate = pickChatTemplateForFamily(modelFamily);

      let finalPrompt: string;
      let stopPrompts: string[];
      let effectiveTemperature = temperature;

      if (messages && messages.length > 0) {
        // Multi-turn conversation: fold system messages into a single
        // system prompt, concatenate user/assistant turns per family
        // template. For v1 we only wrap the FIRST user turn — proper
        // multi-turn folding lands in a future phase when we need it.
        const systemFromMessages =
          messages.find((m) => m.role === 'system')?.content ?? DEFAULT_SYSTEM_PROMPT;
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
        const userText = lastUserMessage?.content ?? '';
        const applied = applyTemplate(systemFromMessages, userText);
        finalPrompt = applied.prompt;
        stopPrompts = applied.stopPrompts;
        if (effectiveTemperature === undefined) effectiveTemperature = 0.3;
      } else if (userPrompt) {
        const applied = applyTemplate(systemPrompt ?? DEFAULT_SYSTEM_PROMPT, userPrompt);
        finalPrompt = applied.prompt;
        stopPrompts = applied.stopPrompts;
        if (effectiveTemperature === undefined) effectiveTemperature = 0.3;
      } else {
        // Raw completion. Backwards-compat for callers that build their
        // own prompt (existing hooks + skill agents). No stop tokens, no
        // template — the caller is responsible for both.
        finalPrompt = prompt ?? '';
        stopPrompts = [];
        if (effectiveTemperature === undefined) effectiveTemperature = 0.7;
      }

      if (!finalPrompt) {
        throw new Error(
          'generate() requires one of: prompt, systemPrompt+userPrompt, or messages.'
        );
      }

      let partial = '';
      let stop = false;
      const completionArgs: {
        prompt: string;
        nPredict: number;
        sampling: { temp: number };
        stream: boolean;
        stopPrompts?: string[];
      } = {
        prompt: finalPrompt,
        nPredict: maxTokens,
        sampling: { temp: effectiveTemperature },
        stream: true
      };
      if (stopPrompts.length > 0) {
        completionArgs.stopPrompts = stopPrompts;
      }
      const stream = (await wllama.createCompletion(
        completionArgs as Parameters<typeof wllama.createCompletion>[0]
      )) as AsyncIterable<{
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
        // Phase 2a.1.7 — defence-in-depth stop-token check on the
        // rolling partial. Some wllama versions don't honour
        // stopPrompts perfectly; slice off any leaked end-of-turn
        // marker so it never reaches the UI.
        for (const s of stopPrompts) {
          const idx = partial.indexOf(s);
          if (idx !== -1) {
            partial = partial.slice(0, idx);
            stop = true;
            break;
          }
        }
        if (onToken) {
          const result = onToken(token, partial);
          if (result === false) stop = true;
        }
      }
      return partial;
    },
    async computeGradients({ samples, targetTask, epsilon = 0.5 }): Promise<GradientResult> {
      // Phase 9.0d stub: produces a deterministic Float32 vector
      // derived from (modelFamily, targetTask, sample prompts) so
      // the federated-round substrate has SOMETHING to aggregate
      // while real gradient computation waits for a training-capable
      // runtime backend. The vector is NOT a real gradient — but it
      // is deterministic + privacy-aware (DP noise added below), so
      // a sequence of stub updates from different workers does
      // produce a non-trivial aggregated vector that demonstrates
      // the loop. Length = 32 floats; same length as the demo
      // classifier head used by Phase 3.1.
      const dim = 32;
      const v = new Float32Array(dim);
      const family = String(meta.meta?.['general.name'] ?? 'unknown');
      const seedString = `${family}::${targetTask}::${samples.map((s) => s.prompt).join('||')}`;
      // Cheap deterministic float derivation from string bytes.
      const enc = new TextEncoder().encode(seedString);
      let h = 0;
      for (let i = 0; i < enc.length; i += 1) {
        h = ((h << 5) - h + enc[i]) | 0;
      }
      for (let i = 0; i < dim; i += 1) {
        h = (h * 1103515245 + 12345) | 0;
        v[i] = (h / 2147483647) * 0.1;
      }
      // Add DP-SGD-style Gaussian noise scaled to epsilon. The
      // larger the epsilon, the smaller the noise — workers spend
      // privacy budget for tighter gradients.
      const sigma = Math.max(0.01, 1.0 / Math.max(epsilon, 0.1));
      for (let i = 0; i < dim; i += 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v[i] += sigma * z * 0.01;
      }
      return {
        vector: v,
        epsilonSpent: epsilon,
        samples: samples.length,
        stub: true
      };
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

// ────────────────────────────────────────────────────────────────────
// Phase 13.0.0a — shared wllama runtime singleton.
//
// Before this substrate: each SLM hook (intent-parser, booking-advisor,
// field-suggest, doc-summariser) held its own `runtimeRef` and called
// `loadSlmRuntime({ ggufBytes: blob })` independently the first time
// its verb fired. A warm session running 4 SLM verbs loaded the same
// GGUF bytes into WASM 4 times — wasted ~5 GB of memory churn and
// ~15s of redundant load time.
//
// After this substrate: every hook calls `getSharedSlmRuntime(packId,
// blobLoader, opts?)`. The module caches a single `Promise<SlmRuntime>`
// keyed by `packId`. Same packId → returns the cached promise instantly.
// New packId → unloads the previous runtime + builds a new one (so a
// citizen swapping installed packs still works).
//
// The hooks no longer call `runtime.unload()` on unmount (that would
// pull the rug from other concurrent hook instances). Pack uninstall
// from the Labs install-list calls `releaseSharedSlmRuntime()` to free
// WASM memory explicitly when the citizen removes the active pack.
//
// §15 / ADR 0114 contracts inherited: the singleton wraps
// `loadSlmRuntime`; no direct `'@wllama/wllama'` import; bundle code-
// split preserved.

let _sharedPromise: Promise<SlmRuntime> | null = null;
let _sharedModelPackId: string | null = null;

/**
 * Get-or-build the module-level shared SLM runtime keyed on
 * `modelPackId`. Concurrent callers with the same packId share the
 * same in-flight promise (load happens once). Callers with a
 * different packId trigger an unload + rebuild.
 *
 * `blobLoader` is invoked at most once per (modelPackId, lifetime
 * of the cached promise). Returning `null` from it propagates a
 * rejected promise so the caller can surface `no_blob` honestly.
 */
export function getSharedSlmRuntime(
  modelPackId: string,
  blobLoader: () => Promise<Blob | ArrayBuffer | null>,
  opts: Omit<LoadOptions, 'ggufBytes'> = {}
): Promise<SlmRuntime> {
  if (_sharedPromise && _sharedModelPackId === modelPackId) {
    return _sharedPromise;
  }
  // Different packId (or no cached runtime) → unload + rebuild.
  // The unload is fire-and-forget: callers waiting on the new
  // runtime shouldn't block on the old one's cleanup.
  if (_sharedPromise) {
    const prior = _sharedPromise;
    void prior
      .then((rt) => rt.unload())
      .catch(() => {
        // best-effort: a failed prior load may not have a runtime
        // instance to unload; swallow.
      });
  }
  _sharedModelPackId = modelPackId;
  _sharedPromise = (async () => {
    const bytes = await blobLoader();
    if (!bytes) {
      throw new Error('no_blob');
    }
    return loadSlmRuntime({ ggufBytes: bytes, ...opts });
  })();
  // If the build itself rejects, clear the cache so the next caller
  // retries cleanly (otherwise every subsequent call would replay
  // the same rejected promise).
  void _sharedPromise.catch(() => {
    if (_sharedPromise && _sharedModelPackId === modelPackId) {
      _sharedPromise = null;
      _sharedModelPackId = null;
    }
  });
  return _sharedPromise;
}

/**
 * Drop the shared runtime if it currently matches `modelPackId` (or
 * if no `modelPackId` is supplied, drop whatever is cached). Called
 * from the Labs install-list when the citizen uninstalls the active
 * pack, so WASM memory is released without waiting for a page
 * navigation. Best-effort: errors from `unload()` are swallowed.
 */
export async function releaseSharedSlmRuntime(modelPackId?: string): Promise<void> {
  if (!_sharedPromise) return;
  if (modelPackId !== undefined && _sharedModelPackId !== modelPackId) return;
  const prior = _sharedPromise;
  _sharedPromise = null;
  _sharedModelPackId = null;
  try {
    const rt = await prior;
    await rt.unload();
  } catch (_e) {
    // best-effort
  }
}

/**
 * Test-only: returns the currently-cached modelPackId or null.
 * The shared promise itself is intentionally NOT exposed — callers
 * must go through `getSharedSlmRuntime` so the cache invariant
 * (one packId at a time) holds. The hook test files use this to
 * assert pack-swap unload semantics without poking module internals.
 */
export function _sharedSlmRuntimeModelPackIdForTesting(): string | null {
  return _sharedModelPackId;
}
