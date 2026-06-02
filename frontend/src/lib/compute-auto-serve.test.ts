// Phase 13.7.4 — compute-auto-serve helper tests.
//
// We pass a stub `SlmRuntime` so we don't drag wllama into the
// test env. The stub records the prompt it was called with and
// returns a fixed response, validating the public contract:
// - Prompt text is forwarded unchanged.
// - Response text is returned verbatim.
// - approxTokenCount is computed via the ~4-chars-per-token
//   heuristic.
// - onToken is called per token.

import { describe, expect, it, vi } from 'vitest';
import { generateAutoServedResponse } from './compute-auto-serve';
import type { SlmRuntime, GenerateOptions } from './slm-runtime';

function stubRuntime(responseText: string): SlmRuntime {
  return {
    metadata: { family: 'stub', contextSize: 2048, vocabSize: 32_000 },
    async generate(opts: GenerateOptions) {
      // Drive onToken once per character so the test sees the
      // streaming contract used by the production runtime.
      let partial = '';
      for (const ch of responseText) {
        partial += ch;
        opts.onToken?.(ch, partial);
      }
      return responseText;
    },
    async computeGradients() {
      throw new Error('not implemented in stub');
    },
    async unload() {
      // no-op
    }
  };
}

describe('generateAutoServedResponse', () => {
  it('forwards plaintext prompt + returns response text + token estimate', async () => {
    const runtime = stubRuntime('Bill is ₹2,956 for May. Pay by 24 May.');
    const result = await generateAutoServedResponse({
      plaintextPrompt: 'Summarise this bill.',
      runtime
    });
    expect(result.responseText).toBe('Bill is ₹2,956 for May. Pay by 24 May.');
    // 38 chars (single-byte content) / 4 chars per token ≈ 10 tokens.
    expect(result.approxTokenCount).toBeGreaterThanOrEqual(8);
    expect(result.approxTokenCount).toBeLessThanOrEqual(12);
    expect(result.generationMs).toBeGreaterThanOrEqual(0);
  });

  it('invokes onToken for each token', async () => {
    const runtime = stubRuntime('abcde');
    const onToken = vi.fn();
    await generateAutoServedResponse({
      plaintextPrompt: 'p',
      runtime,
      onToken
    });
    expect(onToken).toHaveBeenCalledTimes(5);
    expect(onToken.mock.calls[0]).toEqual(['a', 'a']);
    expect(onToken.mock.calls[4]).toEqual(['e', 'abcde']);
  });

  it('approxTokenCount is at least 1 even for trivial responses', async () => {
    const runtime = stubRuntime('a');
    const result = await generateAutoServedResponse({
      plaintextPrompt: 'p',
      runtime
    });
    expect(result.approxTokenCount).toBeGreaterThanOrEqual(1);
  });

  it('forwards maxTokens + temperature overrides to runtime.generate', async () => {
    const generate = vi.fn(async () => 'response');
    const runtime: SlmRuntime = {
      metadata: { family: 'stub', contextSize: 2048, vocabSize: 32_000 },
      generate,
      async computeGradients() {
        throw new Error('not implemented in stub');
      },
      async unload() {}
    };
    await generateAutoServedResponse({
      plaintextPrompt: 'p',
      runtime,
      maxTokens: 99,
      temperature: 0.5
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'p', maxTokens: 99, temperature: 0.5 })
    );
  });
});
