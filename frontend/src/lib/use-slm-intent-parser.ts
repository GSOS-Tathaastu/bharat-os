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
import { useProfileStore, getActiveProfile } from './profile-store';
import { buildProfileFragment } from './profile-prompt-fragment';
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
  // Phase 13.3 + MF-1 — subscribe to ONLY the profile-store
  // `updatedAt` tripwire so the parse() callback re-memoises when
  // the citizen toggles a preference. Reading the actual profile
  // happens lazily inside parse() via getActiveProfile(identityId)
  // which calls useProfileStore.getState() synchronously, avoiding
  // stale-closure capture of the whole profile across toggles.
  const profileUpdatedAt = useProfileStore((s) => s.updatedAt);
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
          // Phase 13.3 — inject the personalization preamble.
          // getActiveProfile() with no second arg reads
          // useProfileStore.getState() FRESH, so toggles between
          // renders are picked up on the next parse() without
          // requiring a hook remount.
          const profile = getActiveProfile(identityId);
          const profileFragment = buildProfileFragment(profile);
          const prompt = buildIntentParsePrompt(intentText, profileFragment);
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
        } catch (_err) {
          // Phase 13.3 adversarial fix SF-2 — citizen-safe generic
          // message. Raw wllama exceptions can echo prompt bytes;
          // the prompt now includes the personalization preamble,
          // widening the leak surface (allowlist-derived so PII
          // risk is structural-zero, but the binding still applies).
          // Mirrors Phase 13.0 MF-2 fix on doc-summariser.
          safeSetStatus({
            kind: 'error',
            message: "The model couldn't finish on this device. Tap Check to retry."
          });
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
    // Phase 13.3 MF-1 — identityId + profileUpdatedAt in deps so the
    // callback re-memoises on identity flip + on every profile
    // toggle. The actual profile read uses getState() inside the
    // callback so the closure can never go stale across toggles.
    [active, identityId, profileUpdatedAt, safeSetStatus]
  );

  const reset = useCallback(() => safeSetStatus(active ? { kind: 'ready' } : { kind: 'unavailable', reason: 'no_install' }), [active, safeSetStatus]);

  return {
    status,
    parse,
    reset,
    modelPackId: active?.modelPackId ?? null
  };
}
