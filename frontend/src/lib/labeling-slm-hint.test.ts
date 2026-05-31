// Phase 10.6 — labeling-slm-hint pure prompt + parser tests.

import { describe, expect, test } from 'vitest';
import { buildHintPrompt, parseHintCompletion } from './labeling-slm-hint';

describe('buildHintPrompt', () => {
  test('classification prompt lists option values', () => {
    const prompt = buildHintPrompt('classification', {
      text: 'I need a loan to buy a tractor.',
      options: [
        { value: 'business_loan', label: 'Business loan' },
        { value: 'personal_loan', label: 'Personal loan' }
      ]
    });
    expect(prompt).not.toBeNull();
    expect(prompt).toContain('I need a loan to buy a tractor.');
    expect(prompt).toContain('business_loan');
    expect(prompt).toContain('Answer with the option value ONLY');
  });

  test('preference_pair prompt renders both responses', () => {
    const prompt = buildHintPrompt('preference_pair', {
      prompt: 'Which is more helpful?',
      a: 'Reply A',
      b: 'Reply B'
    });
    expect(prompt).toContain('Reply A');
    expect(prompt).toContain('Reply B');
    expect(prompt).toContain('Answer with "a" or "b"');
  });

  test('span_annotation prompt indexes each word', () => {
    const prompt = buildHintPrompt('span_annotation', {
      text: 'I need 50000 rupees urgently',
      labelKind: 'amount'
    });
    expect(prompt).toContain('0: I');
    expect(prompt).toContain('2: 50000');
    expect(prompt).toContain('amount');
  });

  test('transcription prompt returns null with no ASR pre-fill', () => {
    expect(buildHintPrompt('transcription', {})).toBeNull();
    expect(
      buildHintPrompt('transcription', { asrPreFill: 'mujhe loan chahiye' })
    ).toContain('mujhe loan chahiye');
  });

  test('safety_label prompt lists categories', () => {
    const prompt = buildHintPrompt('safety_label', {
      text: 'go to hell',
      categories: [
        { value: 'harassment', label: 'Harassment' },
        { value: 'threat', label: 'Threat' }
      ]
    });
    expect(prompt).toContain('harassment');
    expect(prompt).toContain('threat');
    expect(prompt).toContain('answer "safe"');
  });

  test('buildHintPrompt returns null for malformed bodies', () => {
    expect(buildHintPrompt('classification', { text: 'x' })).toBeNull();
    expect(buildHintPrompt('classification', { options: [] })).toBeNull();
    expect(buildHintPrompt('preference_pair', { a: 'x' })).toBeNull();
    expect(buildHintPrompt('span_annotation', {})).toBeNull();
  });
});

describe('parseHintCompletion', () => {
  const clsBody = {
    text: 'I need a loan to buy a tractor.',
    options: [
      { value: 'business_loan', label: 'Business loan' },
      { value: 'personal_loan', label: 'Personal loan' }
    ]
  };

  test('classification picks up an option value mentioned in the completion', () => {
    expect(parseHintCompletion('classification', clsBody, 'business_loan')).toEqual({
      value: 'business_loan'
    });
    expect(
      parseHintCompletion('classification', clsBody, 'The answer is business_loan.')
    ).toEqual({ value: 'business_loan' });
  });

  test('classification falls back to label match when value not present', () => {
    expect(
      parseHintCompletion('classification', clsBody, 'I would pick Personal loan.')
    ).toEqual({ value: 'personal_loan' });
  });

  test('classification returns null when neither value nor label appears', () => {
    expect(parseHintCompletion('classification', clsBody, 'no idea')).toBeNull();
  });

  test('preference_pair parses bare "a" or "b" with word boundaries', () => {
    expect(parseHintCompletion('preference_pair', {}, 'a')).toEqual({ choice: 'a' });
    expect(parseHintCompletion('preference_pair', {}, 'Answer: B')).toEqual({ choice: 'b' });
    expect(parseHintCompletion('preference_pair', {}, 'and another thing')).toBeNull();
  });

  test('span_annotation picks numeric indices in the response', () => {
    const body = { text: 'I need 50000 rupees urgently' };
    const result = parseHintCompletion(
      'span_annotation',
      body,
      'I would highlight indices 2, 3 because they name the amount.'
    );
    expect(result).toEqual({ wordIndices: [2, 3], labelKind: 'span' });
  });

  test('span_annotation honours an explicit "none" answer', () => {
    const result = parseHintCompletion(
      'span_annotation',
      { text: 'Nothing to highlight here' },
      'none'
    );
    expect(result).toEqual({ wordIndices: [], labelKind: 'span' });
  });

  test('span_annotation drops out-of-range indices', () => {
    const result = parseHintCompletion(
      'span_annotation',
      { text: 'one two three' },
      'indices 0, 1, 99'
    );
    expect(result).toEqual({ wordIndices: [0, 1], labelKind: 'span' });
  });

  test('transcription strips surrounding quotes', () => {
    expect(parseHintCompletion('transcription', {}, '"hello there"')).toEqual({
      transcript: 'hello there'
    });
    expect(parseHintCompletion('transcription', {}, '   ')).toBeNull();
  });

  test('safety_label picks up category values mentioned by the SLM', () => {
    const body = {
      text: 'I will hurt you',
      categories: [
        { value: 'harassment', label: 'Harassment' },
        { value: 'threat', label: 'Threat' },
        { value: 'safe', label: 'Safe' }
      ]
    };
    expect(parseHintCompletion('safety_label', body, 'threat, harassment')).toEqual({
      values: ['harassment', 'threat']
    });
  });

  test('safety_label honours "safe" answer with empty values', () => {
    const body = {
      text: 'good morning',
      categories: [
        { value: 'harassment', label: 'Harassment' },
        { value: 'safe', label: 'Safe' }
      ]
    };
    expect(parseHintCompletion('safety_label', body, 'safe')).toEqual({ values: [] });
  });
});
