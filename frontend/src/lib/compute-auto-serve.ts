// Phase 13.7.4 — Compute auto-serve helper.
//
// Pure-function generator for the auto-serve loop. Given a
// decrypted plaintext prompt + a loaded shared SLM runtime,
// produce the response text + token count that the worker
// would otherwise type by hand.
//
// Kept tiny + injectable so the test can pass a stub runtime
// without dragging in wllama.
//
// §15 bindings preserved:
//   • Plaintext lives only inside the function's lexical scope
//     (no module-global capture).
//   • No network calls. The shared runtime is WASM-isolated.
//   • The caller is responsible for sha256-hashing + posting
//     the response — this function only generates.

import type { SlmRuntime } from './slm-runtime';

const DEFAULT_MAX_TOKENS = 384;
const DEFAULT_TEMPERATURE = 0.25;

export interface AutoServeRequest {
  /** Plaintext prompt that the citizen sent (after FE decrypt). */
  plaintextPrompt: string;
  /** Loaded shared SLM runtime — caller manages lifecycle. */
  runtime: SlmRuntime;
  /** Optional token-stream callback for UX feedback. */
  onToken?: (token: string, partial: string) => void;
  /** Override the default sampling cap. */
  maxTokens?: number;
  /** Override the default sampling temperature. */
  temperature?: number;
}

export interface AutoServeResponse {
  responseText: string;
  /**
   * Token count we report on the serve POST. We approximate by
   * the character-count of the streamed text divided by an
   * average-Indian-prompt heuristic (~4 chars / token). The BE
   * doesn't enforce ground-truth tokens — it uses the count to
   * compute the worker payout against the capacity's price.
   * Auto-serve uses the SAME approximation citizens used when
   * estimating tokens client-side in 13.7.1.
   */
  approxTokenCount: number;
  generationMs: number;
}

const CHARS_PER_TOKEN_HEURISTIC = 4;

export async function generateAutoServedResponse(
  req: AutoServeRequest
): Promise<AutoServeResponse> {
  const start = performance.now();
  const responseText = await req.runtime.generate({
    prompt: req.plaintextPrompt,
    maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    onToken: req.onToken
  });
  const generationMs = Math.round(performance.now() - start);
  const approxTokenCount = Math.max(
    1,
    Math.round(responseText.length / CHARS_PER_TOKEN_HEURISTIC)
  );
  return { responseText, approxTokenCount, generationMs };
}
