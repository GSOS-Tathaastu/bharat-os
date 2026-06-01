// Phase 12.1b.3 — SLM field-suggest hook.
//
// Layered on top of useSlmIntentParser's runtime so we don't load
// the wllama bytes twice. Provides per-field rate limiting (6
// invocations per field per rolling 60 seconds + 30 globally per
// 5 minutes), inflight-singleton (the runtime serialises itself,
// this hook just dedupes outer button-spam), and a typed result
// shape the SlmSuggestChip can render.
//
// §15: never auto-fills the textarea. The chip surfaces the
// suggestion to the citizen, who taps "Use this" to accept.

import { useCallback, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { getSharedSlmRuntime, type SlmRuntime } from './slm-runtime';
import { useInstalledSlms } from './hooks';
import type { FieldSpec } from './dynamic-form';

const PER_FIELD_LIMIT = 6;
const PER_FIELD_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 30;
const GLOBAL_WINDOW_MS = 5 * 60_000;

export type SuggestStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'generating' }
  | { kind: 'cooling-down'; retryInMs: number }
  | { kind: 'unavailable'; reason: string };

interface UseSlmFieldSuggestOptions {
  identityId: string | null | undefined;
}

interface SuggestInput {
  field: FieldSpec;
  roleLabel: string;
  currentValue: string | null;
}

export interface SuggestResult {
  suggestion: string;
  fieldId: string;
  generatedAt: string;
}

function buildPrompt({ field, roleLabel, currentValue }: SuggestInput): string {
  const hint = field.suggest?.promptHint ?? `Suggest a short value for the field "${field.label}".`;
  return [
    'You are helping a Bharat OS provider fill in a short profile field.',
    hint,
    '',
    `Role: ${roleLabel}`,
    `Field label: ${field.label}`,
    `What the provider has typed so far: ${currentValue && currentValue.trim() ? currentValue.trim() : '(nothing)'}`,
    '',
    'Reply with ONE short line of plain text — no quotes, no extra words, no JSON.',
    'YOUR ANSWER:'
  ].join('\n');
}

function trimSuggestion(raw: string): string {
  return raw
    .replace(/^["'`\s]+/, '')
    .replace(/["'`\s]+$/, '')
    .split('\n')[0]
    .trim()
    .slice(0, 240);
}

export function useSlmFieldSuggest({ identityId }: UseSlmFieldSuggestOptions) {
  const installs = useInstalledSlms(identityId);
  const installed = (installs.data ?? []).find((i) => i.status === 'installed');
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const inflightRef = useRef<Promise<SuggestResult | null> | null>(null);
  const perFieldTimestamps = useRef<Map<string, number[]>>(new Map());
  const globalTimestamps = useRef<number[]>([]);
  const [status, setStatus] = useState<SuggestStatus>(
    installed ? { kind: 'idle' } : { kind: 'unavailable', reason: 'no_install' }
  );

  const checkRateLimit = useCallback((fieldId: string): { ok: boolean; retryInMs: number } => {
    const now = Date.now();
    const perField = perFieldTimestamps.current.get(fieldId) ?? [];
    const recentPerField = perField.filter((t) => now - t < PER_FIELD_WINDOW_MS);
    perFieldTimestamps.current.set(fieldId, recentPerField);
    if (recentPerField.length >= PER_FIELD_LIMIT) {
      const oldest = recentPerField[0];
      return { ok: false, retryInMs: PER_FIELD_WINDOW_MS - (now - oldest) };
    }
    const recentGlobal = globalTimestamps.current.filter((t) => now - t < GLOBAL_WINDOW_MS);
    globalTimestamps.current = recentGlobal;
    if (recentGlobal.length >= GLOBAL_LIMIT) {
      const oldest = recentGlobal[0];
      return { ok: false, retryInMs: GLOBAL_WINDOW_MS - (now - oldest) };
    }
    return { ok: true, retryInMs: 0 };
  }, []);

  const suggest = useCallback(
    async (input: SuggestInput): Promise<SuggestResult | null> => {
      if (!installed) {
        setStatus({ kind: 'unavailable', reason: 'no_install' });
        return null;
      }
      const rate = checkRateLimit(input.field.id);
      if (!rate.ok) {
        setStatus({ kind: 'cooling-down', retryInMs: rate.retryInMs });
        return null;
      }
      if (inflightRef.current) return inflightRef.current;
      const job = (async (): Promise<SuggestResult | null> => {
        try {
          if (!runtimeRef.current) {
            setStatus({ kind: 'loading' });
            try {
              runtimeRef.current = await getSharedSlmRuntime(
                installed.modelPackId,
                () => readSlmBlob(installed.modelPackId),
                { logger: 'silent' }
              );
            } catch (loadErr) {
              if ((loadErr as Error).message === 'no_blob') {
                setStatus({ kind: 'unavailable', reason: 'no_blob' });
                return null;
              }
              throw loadErr;
            }
          }
          setStatus({ kind: 'generating' });
          const prompt = buildPrompt(input);
          const out = await runtimeRef.current!.generate({
            prompt,
            maxTokens: 64,
            temperature: 0.3
          });
          const suggestion = trimSuggestion(out);
          const now = Date.now();
          const perField = perFieldTimestamps.current.get(input.field.id) ?? [];
          perField.push(now);
          perFieldTimestamps.current.set(input.field.id, perField);
          globalTimestamps.current.push(now);
          setStatus({ kind: 'idle' });
          if (!suggestion) return null;
          return {
            fieldId: input.field.id,
            suggestion,
            generatedAt: new Date(now).toISOString()
          };
        } catch (err) {
          setStatus({ kind: 'unavailable', reason: (err as Error).message || 'generate_failed' });
          return null;
        }
      })();
      inflightRef.current = job;
      try {
        return await job;
      } finally {
        inflightRef.current = null;
      }
    },
    [installed, checkRateLimit]
  );

  return { status, suggest, hasSlm: Boolean(installed) };
}
