// Phase 12.1b.1 — On-device SLM intent-parser hook.
//
// Wraps the Phase 9.0c wllama runtime to produce a typed
// `ParsedIntent` from a free-form intentText. Lazy-init: the wllama
// runtime + GGUF blob are only loaded the first time the citizen
// taps "Parse with my SLM" — citizens with no SLM installed pay
// zero bytes for the runtime + never see the chip.
//
// Reuse contract: any FE surface that wants on-device intent parsing
// (CitizenHome today; future Phase 12.1b dynamic forms + negotiation
// agent) calls this hook the same way. The shared
// `buildIntentParsePrompt` + `parseIntentCompletion` keep the
// prompt/parse contract honest across consumers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { getSharedSlmRuntime, type SlmRuntime } from './slm-runtime';
import { buildIntentParsePrompt, parseIntentCompletion, type ParsedIntent } from './intent-parser';
import { useInstalledSlms } from './hooks';

export type SlmParserStatus =
  | { kind: 'unavailable'; reason: 'no_identity' | 'no_install' | 'unsupported' }
  | { kind: 'ready' }
  | { kind: 'loading'; progress: number }
  | { kind: 'parsing' }
  | { kind: 'error'; message: string };

export interface SlmParserResult {
  parsed: ParsedIntent | null;
  rawCompletion: string;
  generationMs: number;
}

interface UseSlmIntentParserOptions {
  identityId: string | null | undefined;
}

// Pick the first 'installed'-status install. The citizen can curate
// which model is "the active intent parser" via the existing Phase
// 9.0b install list — for v1 there's only one installable SLM
// (Phi-3-mini per ADR 0134's demo pack), so this is honest about
// not pretending we have a chooser yet.
function pickActiveInstall(
  installs: Array<{ status: string; modelPackId: string }> | undefined
): { modelPackId: string } | null {
  if (!installs || installs.length === 0) return null;
  const installed = installs.find((i) => i.status === 'installed');
  return installed ? { modelPackId: installed.modelPackId } : null;
}

export function useSlmIntentParser({ identityId }: UseSlmIntentParserOptions) {
  const installs = useInstalledSlms(identityId);
  const active = pickActiveInstall(installs.data ?? undefined);
  const runtimeRef = useRef<SlmRuntime | null>(null);
  // SF-1 (adversarial fix) — guards setStatus from firing after
  // unmount when a long WASM load resolves late.
  const mountedRef = useRef(true);
  // SF-2 (adversarial fix) — dedup concurrent parse() invocations
  // so a rapid double-tap doesn't race two blob reads + runtime
  // loads against each other. Returns the same in-flight promise.
  const inflightRef = useRef<Promise<SlmParserResult | null> | null>(null);
  const [status, setStatus] = useState<SlmParserStatus>({ kind: 'unavailable', reason: 'no_install' });

  const safeSetStatus = useCallback((s: SlmParserStatus) => {
    if (mountedRef.current) setStatus(s);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!identityId) {
      safeSetStatus({ kind: 'unavailable', reason: 'no_identity' });
      return;
    }
    if (!active) {
      safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
      return;
    }
    setStatus((prev) => (prev.kind === 'unavailable' ? { kind: 'ready' } : prev));
  }, [identityId, active, safeSetStatus]);

  // Phase 13.0.0a — runtime is now shared module-level via
  // getSharedSlmRuntime. Unmount no longer calls unload() (that
  // would pull the rug from concurrent SLM consumers). Drop the
  // local ref so a remount re-binds to the shared runtime cleanly.
  useEffect(() => {
    return () => {
      runtimeRef.current = null;
    };
  }, []);

  const parse = useCallback(
    async (intentText: string): Promise<SlmParserResult | null> => {
      if (!active) {
        safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
        return null;
      }
      if (!intentText.trim()) return null;
      // SF-2 — return the in-flight promise on concurrent calls.
      if (inflightRef.current) return inflightRef.current;
      const job = (async () => {
        try {
          if (!runtimeRef.current) {
            safeSetStatus({ kind: 'loading', progress: 0 });
            try {
              const runtime = await getSharedSlmRuntime(
                active.modelPackId,
                () => readSlmBlob(active.modelPackId),
                {
                  logger: 'silent',
                  onProgress: (loaded, total) => {
                    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
                    safeSetStatus({ kind: 'loading', progress: pct });
                  }
                }
              );
              runtimeRef.current = runtime;
            } catch (loadErr) {
              if ((loadErr as Error).message === 'no_blob') {
                safeSetStatus({ kind: 'error', message: 'Model bytes not in this browser. Install the pack again.' });
                return null;
              }
              throw loadErr;
            }
          }
          safeSetStatus({ kind: 'parsing' });
          const prompt = buildIntentParsePrompt(intentText);
          const startedAt = performance.now();
          const completion = await runtimeRef.current!.generate({
            prompt,
            maxTokens: 96,
            temperature: 0.1
          });
          const generationMs = Math.round(performance.now() - startedAt);
          const parsed = parseIntentCompletion(completion);
          safeSetStatus({ kind: 'ready' });
          return { parsed, rawCompletion: completion, generationMs };
        } catch (err) {
          safeSetStatus({ kind: 'error', message: (err as Error).message || 'Intent parsing failed.' });
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
    [active, safeSetStatus]
  );

  const reset = useCallback(() => safeSetStatus(active ? { kind: 'ready' } : { kind: 'unavailable', reason: 'no_install' }), [active, safeSetStatus]);

  return {
    status,
    parse,
    reset,
    modelPackId: active?.modelPackId ?? null
  };
}
