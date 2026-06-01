// Phase 13.0 — SLM-E on-device document summariser hook.
//
// Wraps the Phase 9.0c wllama runtime to produce a streaming
// ParsedDocSummary from a pasted Indian-paperwork document. Lazy-
// init: the wllama runtime + GGUF blob are only loaded the first
// time the citizen taps "Summarise on my phone".
//
// First SLM consumer in the repo to pass `onToken` so the panel
// can stream tokens into the UI for a perceived-latency win — the
// pitch beat lives in the first-token-in-2s moment.
//
// §15 bindings inherited:
//   • bytes-never-leave-device: generation runs in WASM via the
//     SlmRuntime contract; no fetch() of doc text.
//   • honest empty state: returns 'unavailable' when no install /
//     no identity. Panel hides; no upsell.
//   • rate limit: per-docKey 2/60s + global 6/5min. Summariser is
//     heavier (maxTokens 384 vs intent-parser 96) so the budget is
//     tighter than booking-advisor's 3/12.
//   • no token storage: streamed tokens live only in component
//     state via streamedTextRef; cleared on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { loadSlmRuntime, type SlmRuntime } from './slm-runtime';
import { useInstalledSlms } from './hooks';
import {
  buildDocSummaryPrompt,
  parseDocSummaryCompletion,
  type DocKind,
  type ParsedDocSummary
} from './doc-summariser';

// Summariser-specific caps. Heavier generate budget so the cooling-
// down window must reflect that — 2 per minute per document hash,
// 6 per 5 minutes globally.
const PER_DOC_LIMIT = 2;
const PER_DOC_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 6;
const GLOBAL_WINDOW_MS = 5 * 60_000;

const MAX_TOKENS = 384;
const TEMPERATURE = 0.25;

export type SlmDocSummariserStatus =
  | { kind: 'unavailable'; reason: 'no_identity' | 'no_install' | 'no_blob' }
  | { kind: 'ready' }
  | { kind: 'loading'; progress: number }
  | { kind: 'summarising'; streamedChars: number }
  | { kind: 'cooling-down'; retryInMs: number }
  | { kind: 'error'; message: string };

export interface SlmDocSummariserResult {
  parsed: ParsedDocSummary | null;
  rawCompletion: string;
  generationMs: number;
  modelPackId: string;
}

interface UseOptions {
  identityId: string | null | undefined;
}

// Stable, small, deterministic hash for the per-doc rate-limit key.
// djb2 — no crypto needed; collision is harmless (the cost is "one
// genuine paste hits the same cooling window as a similar paste",
// which is fine for the rate-limit intent).
function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export function useSlmDocSummariser({ identityId }: UseOptions) {
  const installs = useInstalledSlms(identityId);
  const installed = (installs.data ?? []).find((i) => i.status === 'installed');
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const mountedRef = useRef(true);
  // Phase 13.0 adversarial fix MF-4 — inflightRef carries docKey so
  // a second summarise() with a DIFFERENT docKind / text does not
  // silently get aliased to the first call's result. Same key →
  // share the promise (legitimate dedup). Different key → refuse.
  const inflightRef = useRef<{
    docKey: string;
    promise: Promise<SlmDocSummariserResult | null>;
  } | null>(null);
  const perDocTimestamps = useRef<Map<string, number[]>>(new Map());
  const globalTimestamps = useRef<number[]>([]);
  // Phase 13.0 adversarial fix MF-5 — auto-exit cooling-down via
  // setTimeout so the Summarise CTA isn't permanently disabled
  // after the rate-limit window. Captured in a ref so the unmount
  // cleanup + new summarise() entry can clear stale timers.
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Streamed-text scratch so the chip can render partial output
  // during generation without forcing a re-render on every token.
  const streamedTextRef = useRef<string>('');
  const [partialText, setPartialText] = useState<string>('');
  const [status, setStatus] = useState<SlmDocSummariserStatus>(
    installed
      ? { kind: 'ready' }
      : { kind: 'unavailable', reason: 'no_install' }
  );

  const safeSetStatus = useCallback((s: SlmDocSummariserStatus) => {
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

  // Identity / install change → recompute the unavailable / ready
  // bucket. Existing loading / summarising / cooling-down / error
  // states are preserved so a mid-flight generation isn't disrupted
  // by an unrelated install-list refetch.
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

  // Unmount cleanup: unload the runtime so WASM memory is released.
  // Summariser maxTokens 384 is the longest-running of all SLM
  // hooks, maximising the unmount-during-load race window — this
  // matches the use-slm-intent-parser pattern and is REQUIRED.
  // Phase 13.0 adversarial fix MF-5 — also clear any pending
  // cooling-down auto-exit timer.
  useEffect(() => {
    return () => {
      const rt = runtimeRef.current;
      if (rt) {
        void rt.unload();
        runtimeRef.current = null;
      }
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  const checkRateLimit = useCallback(
    (docKey: string): { ok: boolean; retryInMs: number } => {
      const now = Date.now();
      const perDoc = perDocTimestamps.current.get(docKey) ?? [];
      const recent = perDoc.filter((t) => now - t < PER_DOC_WINDOW_MS);
      perDocTimestamps.current.set(docKey, recent);
      if (recent.length >= PER_DOC_LIMIT) {
        return { ok: false, retryInMs: PER_DOC_WINDOW_MS - (now - recent[0]) };
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

  const summarise = useCallback(
    async (
      docKind: DocKind,
      docText: string
    ): Promise<SlmDocSummariserResult | null> => {
      if (!installed) {
        safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
        return null;
      }
      const trimmed = docText.trim();
      if (!trimmed) return null;
      const docKey = `${docKind}:${djb2Hash(trimmed.slice(0, 1000))}`;
      // Phase 13.0 adversarial fix MF-5 — defensively clear any
      // stale cooldown timer from a prior call before the new check.
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const rate = checkRateLimit(docKey);
      if (!rate.ok) {
        safeSetStatus({ kind: 'cooling-down', retryInMs: rate.retryInMs });
        // Auto-exit cooldown when the window expires so the CTA
        // doesn't stay disabled forever.
        cooldownTimerRef.current = setTimeout(() => {
          cooldownTimerRef.current = null;
          if (mountedRef.current) safeSetStatus({ kind: 'ready' });
        }, rate.retryInMs);
        return null;
      }
      // Phase 13.0 adversarial fix MF-4 — only share the in-flight
      // promise when the new call targets the SAME (docKind, text)
      // bucket. Different bucket → refuse with null so the panel
      // doesn't render a chip from the prior call against the new
      // textarea content.
      if (inflightRef.current) {
        return inflightRef.current.docKey === docKey
          ? inflightRef.current.promise
          : null;
      }
      const job = (async (): Promise<SlmDocSummariserResult | null> => {
        try {
          if (!runtimeRef.current) {
            safeSetStatus({ kind: 'loading', progress: 0 });
            const blob = await readSlmBlob(installed.modelPackId);
            if (!blob) {
              safeSetStatus({ kind: 'unavailable', reason: 'no_blob' });
              return null;
            }
            const runtime = await loadSlmRuntime({
              ggufBytes: blob,
              // Phase 13.0 adversarial fix SF-2 — silent logger so a
              // malformed-prompt error from wllama doesn't echo doc
              // bytes to the DevTools console.
              logger: 'silent',
              onProgress: (loaded, total) => {
                // Phase 13.0 adversarial fix SF-5 — clamp to 100
                // so wllama edge cases that report loaded>total
                // don't surface as "Loading model… 103%".
                const pct =
                  total > 0
                    ? Math.min(100, Math.round((loaded / total) * 100))
                    : 0;
                safeSetStatus({ kind: 'loading', progress: pct });
              }
            });
            runtimeRef.current = runtime;
          }
          streamedTextRef.current = '';
          safeSetPartial('');
          safeSetStatus({ kind: 'summarising', streamedChars: 0 });
          const prompt = buildDocSummaryPrompt(docKind, trimmed);
          const startedAt = performance.now();
          const completion = await runtimeRef.current!.generate({
            prompt,
            maxTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            onToken: (_token, full) => {
              streamedTextRef.current = full;
              safeSetPartial(full);
              safeSetStatus({ kind: 'summarising', streamedChars: full.length });
            }
          });
          const generationMs = Math.round(performance.now() - startedAt);

          // Stamp the rate-limit timestamps AFTER a successful
          // generation so failed loads don't burn the budget.
          const now = Date.now();
          const per = perDocTimestamps.current.get(docKey) ?? [];
          per.push(now);
          perDocTimestamps.current.set(docKey, per);
          globalTimestamps.current.push(now);

          const parsed = parseDocSummaryCompletion(completion, docKind);
          safeSetStatus({ kind: 'ready' });
          return {
            parsed,
            rawCompletion: completion,
            generationMs,
            modelPackId: installed.modelPackId
          };
        } catch (_err) {
          // Phase 13.0 adversarial fix MF-2 + SF-4 — citizen-safe
          // generic error message (the raw exception could echo
          // prompt bytes), and stamp the global budget so a corrupt
          // GGUF can't be retried forever without rate-limit.
          globalTimestamps.current.push(Date.now());
          safeSetStatus({
            kind: 'error',
            message:
              "The model couldn't finish on this device. Tap Summarise to retry."
          });
          return null;
        }
      })();
      inflightRef.current = { docKey, promise: job };
      try {
        return await job;
      } finally {
        inflightRef.current = null;
      }
    },
    [installed, checkRateLimit, safeSetStatus, safeSetPartial]
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
    summarise,
    reset,
    partialText,
    modelPackId: installed?.modelPackId ?? null,
    hasSlm: Boolean(installed)
  };
}
