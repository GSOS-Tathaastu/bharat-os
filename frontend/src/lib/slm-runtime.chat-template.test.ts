// Phase 2a.1.7 — regression pins for the chat-template registry.
//
// We don't drive the wllama runtime here (it's real WASM); we pin the
// family-detection + template-wrapping logic that decides how a raw
// user prompt becomes a properly-templated wire prompt with the
// correct stop tokens for the loaded model.

import { describe, expect, it } from 'vitest';
import { pickChatTemplateForFamily } from './slm-runtime';

describe('pickChatTemplateForFamily', () => {
  it('picks the Qwen ChatML template for qwen family names', () => {
    const applier = pickChatTemplateForFamily('Qwen2.5-1.5B-Instruct');
    const { prompt, stopPrompts } = applier('You are helpful.', 'What is 2+2?');
    expect(prompt).toContain('<|im_start|>system');
    expect(prompt).toContain('You are helpful.');
    expect(prompt).toContain('<|im_start|>user');
    expect(prompt).toContain('What is 2+2?');
    expect(prompt).toContain('<|im_start|>assistant');
    // Assistant response begins after the trailing marker.
    expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
    expect(stopPrompts).toContain('<|im_end|>');
    expect(stopPrompts).toContain('<|endoftext|>');
  });

  it('picks the Phi-3 template for phi-3 family names', () => {
    const applier = pickChatTemplateForFamily('Phi-3.5-mini-instruct');
    const { prompt, stopPrompts } = applier('You are helpful.', 'What is 2+2?');
    expect(prompt).toContain('<|system|>');
    expect(prompt).toContain('<|user|>');
    expect(prompt).toContain('<|assistant|>');
    expect(prompt.endsWith('<|assistant|>\n')).toBe(true);
    expect(stopPrompts).toContain('<|end|>');
  });

  it('picks the Llama-3 template for llama-3 family names', () => {
    const applier = pickChatTemplateForFamily('Meta-Llama-3.2-1B-Instruct');
    const { prompt, stopPrompts } = applier('You are helpful.', 'What is 2+2?');
    expect(prompt).toContain('<|begin_of_text|>');
    expect(prompt).toContain('<|start_header_id|>system<|end_header_id|>');
    expect(prompt).toContain('<|start_header_id|>user<|end_header_id|>');
    expect(prompt).toContain('<|eot_id|>');
    expect(stopPrompts).toContain('<|eot_id|>');
  });

  it('falls back to raw prompt for unknown families (no template, no stops)', () => {
    const applier = pickChatTemplateForFamily('some-random-base-model-v1');
    const { prompt, stopPrompts } = applier('sys', 'user says hi');
    expect(prompt).toBe('sys\n\nuser says hi');
    expect(stopPrompts).toEqual([]);
  });

  it('handles case-insensitive family detection', () => {
    expect(pickChatTemplateForFamily('QWEN2.5')).toBe(
      pickChatTemplateForFamily('qwen2.5')
    );
    expect(pickChatTemplateForFamily('PHI-3.5-MINI')).toBe(
      pickChatTemplateForFamily('phi-3.5-mini')
    );
  });

  it('Qwen template preserves multi-line user prompts', () => {
    const applier = pickChatTemplateForFamily('qwen2.5-1.5b');
    const userPrompt = 'Line one\nLine two\nLine three';
    const { prompt } = applier('sys', userPrompt);
    expect(prompt).toContain(userPrompt);
  });

  it('the templates never include an unclosed system message', () => {
    for (const family of ['qwen2.5-1.5b', 'phi-3.5-mini', 'llama-3.2-1b']) {
      const { prompt } = pickChatTemplateForFamily(family)(
        'You are helpful.',
        'Test'
      );
      // The templates all mark the end of the system section with a
      // family-specific closer. Just verify the system content isn't
      // dangling at the very end (which would break the model).
      expect(prompt.endsWith('You are helpful.')).toBe(false);
    }
  });
});
