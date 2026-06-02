// Phase 13.4 — SLM-H on-device skill-agent hook.
//
// Generic over a `SkillDefinition<TInput, TFields>`: the hook is
// skill-agnostic and the concrete skill (e.g.
// `ELECTRICITY_BILL_EXPLAINER`) supplies the prompt builder +
// parser + caps. Same shape as `useSlmDocSummariser` so the FE
// has one consistent SLM-consumer contract.
//
// §15 bindings inherited from useSlmDocSummariser:
//   • bytes-never-leave-device — runs the shared wllama runtime,
//     never fetch().
//   • honest empty state — returns 'unavailable' when no install
//     / no identity. The panel hides; no upsell.
//   • rate limit — per-input 2/60s + global 6/5min.
//   • no token storage — partial text lives in component state
//     until reset() / unmount.
//
// Phase 13.0.0a shared runtime: the runtime is a module-level
// singleton; unmount drops the local ref but does NOT unload the
// runtime (other consumers may still be live). Pack uninstall
// paths call releaseSharedSlmRuntime explicitly.

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { getSharedSlmRuntime, type SlmRuntime } from './slm-runtime';
import { useInstalledSlms } from './hooks';
import { djb2Hash } from './slm-parse-helpers';
import { useProfileStore, getActiveProfile } from './profile-store';
import { buildProfileFragment } from './profile-prompt-fragment';
import type { SkillDefinition, SkillResult } from './skill-agent';

const PER_INPUT_LIMIT = 2;
const PER_INPUT_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 6;
const GLOBAL_WINDOW_MS = 5 * 60_000;

const MAX_TOKENS = 384;
const TEMPERATURE = 0.25;

export type SlmSkillAgentStatus =
  | { kind: 'unavailable'; reason: 'no_identity' | 'no_install' | 'no_blob' }
  | { kind: 'ready' }
  | { kind: 'loading'; progress: number }
  | { kind: 'running'; streamedChars: number }
  | { kind: 'cooling-down'; retryInMs: number }
  | { kind: 'error'; message: string };

export interface SlmSkillAgentRunResult<TFields> {
  parsed: SkillResult<TFields> | null;
  rawCompletion: string;
  generationMs: number;
  modelPackId: string;
}

interface UseOptions<TInput, TFields> {
  identityId: string | null | undefined;
  skill: SkillDefinition<TInput, TFields>;
}

function inputKey(input: unknown): string {
  // Stable, bounded fingerprint of the input for rate-limit
  // bucketing. Truncates to the first 1000 chars of the JSON
  // serialisation so a deeply nested input doesn't explode
  // djb2Hash().
  try {
    return djb2Hash(JSON.stringify(input).slice(0, 1000));
  } catch {
    return djb2Hash(String(input).slice(0, 1000));
  }
}

export function useSlmSkillAgent<TInput, TFields>({
  identityId,
  skill
}: UseOptions<TInput, TFields>) {
  const installs = useInstalledSlms(identityId);
  const profileUpdatedAt = useProfileStore((s) => s.updatedAt);
  const installed = (installs.data ?? []).find((i) => i.status === 'installed');
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const mountedRef = useRef(true);
  const inflightRef = useRef<{
    inputKey: string;
    promise: Promise<SlmSkillAgentRunResult<TFields> | null>;
  } | null>(null);
  const perInputTimestamps = useRef<Map<string, number[]>>(new Map());
  const globalTimestamps = useRef<number[]>([]);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamedTextRef = useRef<string>('');
  const [partialText, setPartialText] = useState<string>('');
  const [status, setStatus] = useState<SlmSkillAgentStatus>(
    installed
      ? { kind: 'ready' }
      : { kind: 'unavailable', reason: 'no_install' }
  );

  const safeSetStatus = useCallback((s: SlmSkillAgentStatus) => {
    if (mountedRef.current) setStatus(s);
  }, []);

  const safeSetPartial = useCallback((t: string) => {
    if (mountedRef.current) setPartialText(t);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!identityId) {
      safeSetStatus({ kind: 'unavailable', reason: 'no_identity' });
      return;
    }
    if (!installed) {
      safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
      return;
    }
    setStatus((prev) => (prev.kind === 'unavailable' ? { kind: 'ready' } : prev));
  }, [identityId, installed, safeSetStatus]);

  useEffect(() => {
    return () => {
      runtimeRef.current = null;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  const checkRateLimit = useCallback(
    (key: string): { ok: boolean; retryInMs: number } => {
      const now = Date.now();
      const perInput = perInputTimestamps.current.get(key) ?? [];
      const recent = perInput.filter((t) => now - t < PER_INPUT_WINDOW_MS);
      perInputTimestamps.current.set(key, recent);
      if (recent.length >= PER_INPUT_LIMIT) {
        return { ok: false, retryInMs: PER_INPUT_WINDOW_MS - (now - recent[0]) };
      }
      const recentGlobal = globalTimestamps.current.filter(
        (t) => now - t < GLOBAL_WINDOW_MS
      );
      globalTimestamps.current = recentGlobal;
      if (recentGlobal.length >= GLOBAL_LIMIT) {
        return { ok: false, retryInMs: GLOBAL_WINDOW_MS - (now - recentGlobal[0]) };
      }
      return { ok: true, retryInMs: 0 };
    },
    []
  );

  const run = useCallback(
    async (input: TInput): Promise<SlmSkillAgentRunResult<TFields> | null> => {
      if (!installed) {
        safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
        return null;
      }
      const key = inputKey(input);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const rate = checkRateLimit(key);
      if (!rate.ok) {
        safeSetStatus({ kind: 'cooling-down', retryInMs: rate.retryInMs });
        cooldownTimerRef.current = setTimeout(() => {
          cooldownTimerRef.current = null;
          if (mountedRef.current) safeSetStatus({ kind: 'ready' });
        }, rate.retryInMs);
        return null;
      }
      if (inflightRef.current) {
        return inflightRef.current.inputKey === key
          ? inflightRef.current.promise
          : null;
      }
      const job = (async (): Promise<SlmSkillAgentRunResult<TFields> | null> => {
        try {
          if (!runtimeRef.current) {
            safeSetStatus({ kind: 'loading', progress: 0 });
            try {
              const runtime = await getSharedSlmRuntime(
                installed.modelPackId,
                () => readSlmBlob(installed.modelPackId),
                {
                  logger: 'silent',
                  onProgress: (loaded, total) => {
                    const pct =
                      total > 0
                        ? Math.min(100, Math.round((loaded / total) * 100))
                        : 0;
                    safeSetStatus({ kind: 'loading', progress: pct });
                  }
                }
              );
              runtimeRef.current = runtime;
            } catch (loadErr) {
              if ((loadErr as Error).message === 'no_blob') {
                safeSetStatus({ kind: 'unavailable', reason: 'no_blob' });
                return null;
              }
              throw loadErr;
            }
          }
          streamedTextRef.current = '';
          safeSetPartial('');
          safeSetStatus({ kind: 'running', streamedChars: 0 });
          // Phase 13.3 — personalization preamble (fresh-read via
          // getState; MF-1 stale-closure fix).
          const profile = getActiveProfile(identityId);
          const profileFragment = buildProfileFragment(profile);
          const prompt = skill.buildPrompt(input, profileFragment);
          const startedAt = performance.now();
          const completion = await runtimeRef.current!.generate({
            prompt,
            maxTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            onToken: (_token, full) => {
              streamedTextRef.current = full;
              safeSetPartial(full);
              safeSetStatus({ kind: 'running', streamedChars: full.length });
            }
          });
          const generationMs = Math.round(performance.now() - startedAt);

          const now = Date.now();
          const per = perInputTimestamps.current.get(key) ?? [];
          per.push(now);
          perInputTimestamps.current.set(key, per);
          globalTimestamps.current.push(now);

          const parsed = skill.parseCompletion(completion);
          safeSetStatus({ kind: 'ready' });
          return {
            parsed,
            rawCompletion: completion,
            generationMs,
            modelPackId: installed.modelPackId
          };
        } catch (_err) {
          globalTimestamps.current.push(Date.now());
          safeSetStatus({
            kind: 'error',
            message:
              "The model couldn't finish on this device. Tap Run to retry."
          });
          return null;
        }
      })();
      inflightRef.current = { inputKey: key, promise: job };
      try {
        return await job;
      } finally {
        inflightRef.current = null;
      }
    },
    [installed, identityId, profileUpdatedAt, checkRateLimit, safeSetStatus, safeSetPartial, skill]
  );

  const reset = useCallback(() => {
    streamedTextRef.current = '';
    safeSetPartial('');
    safeSetStatus(
      installed ? { kind: 'ready' } : { kind: 'unavailable', reason: 'no_install' }
    );
  }, [installed, safeSetStatus, safeSetPartial]);

  return {
    status,
    run,
    reset,
    partialText,
    modelPackId: installed?.modelPackId ?? null,
    hasSlm: Boolean(installed)
  };
}
