// Phase 13.1 — SLM-F on-device PII redactor hook.
//
// Composes:
//   - `pii-detectors.ts::scanWithRegex` — synchronous regex pass.
//     Always available; always returns a regex span list even when
//     no SLM is installed.
//   - `pii-redactor.ts::buildPiiScanPrompt / parsePiiScanCompletion`
//     — the SLM second pass.
//   - `slm-runtime.ts::getSharedSlmRuntime` (Phase 13.0.0a) — the
//     wllama runtime singleton shared with intent-parser /
//     booking-advisor / field-suggest / doc-summariser.
//
// The hook returns:
//   - `scan(text)` → kicks off regex (synchronous) + SLM (async if
//     installed) passes, then merges into a non-overlapping
//     `mergedSpans` array with regex-wins-on-overlap semantics.
//   - `status` — discriminated union: 'unavailable' (no identity /
//     no install / no blob), 'ready', 'loading', 'scanning',
//     'cooling-down', 'error'.
//   - `regexSpans`, `slmSpans`, `mergedSpans`, `redactedText`,
//     `lastScanText` (MF-3 byte-match invalidation reference).
//   - `applyAndClear(maskedText)` — caller invokes after the citizen
//     hits Apply on the sheet; clears the local scan so the chip
//     reverts to "Check for PII" state.
//   - `reset()` — drop scan state without touching the rate-limit.
//
// §15 bindings inherited from doc-summariser / shared-runtime:
//   - bytes-never-leave-device (no fetch())
//   - honest empty state (regex floor available without SLM;
//     SLM-augmentation only when installed)
//   - rate limit (per-text 3/60s + global 8/5min)
//   - cooldown auto-exits via setTimeout (Phase 13.0 MF-5)
//   - inflightRef carries a stable `piiKey` so a different text
//     submission can't get aliased to the prior result (MF-4)
//   - logger:'silent' on the shared runtime (Phase 13.0.0a /
//     ADR 0150)
//   - protocol version pinned in the parser
//   - no PII to ledger (we emit zero events; spans live only in
//     component state)

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { getSharedSlmRuntime, type SlmRuntime } from './slm-runtime';
import { useInstalledSlms } from './hooks';
import { djb2Hash } from './slm-parse-helpers';
import {
  scanWithRegex,
  applyMask,
  type PiiKind,
  type RegexSpan
} from './pii-detectors';
import {
  buildPiiScanPrompt,
  parsePiiScanCompletion,
  type SlmSpan
} from './pii-redactor';

const PER_TEXT_LIMIT = 3;
const PER_TEXT_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 8;
const GLOBAL_WINDOW_MS = 5 * 60_000;

const MAX_TOKENS = 128;
const TEMPERATURE = 0.15;

export type PiiScanSpan =
  | RegexSpan
  | SlmSpan;

export type SlmPiiRedactorStatus =
  | { kind: 'unavailable'; reason: 'no_identity' | 'no_install' | 'no_blob' }
  | { kind: 'ready' }
  | { kind: 'loading'; progress: number }
  | { kind: 'scanning' }
  | { kind: 'cooling-down'; retryInMs: number; cooldownUntil: number }
  | { kind: 'error'; message: string };

export interface SlmPiiScanResult {
  regexSpans: RegexSpan[];
  slmSpans: SlmSpan[];
  mergedSpans: PiiScanSpan[];
  redactedText: string;
  scannedText: string;
  modelPackId: string | null;
  generationMs: number | null;
}

interface UseOptions {
  identityId: string | null | undefined;
}

/**
 * Merge regex + SLM spans into a non-overlapping list. Regex wins
 * on overlap REGARDLESS of start order — a regex span that starts
 * AFTER an SLM span but overlaps it displaces the SLM span. This is
 * the §15 trust-anchor contract: deterministic regex hits always
 * survive against contextful SLM proposals.
 *
 * Pure function so it's unit-testable in isolation.
 *
 * Phase 13.1 adversarial fix M1 — earlier single-pass sort-by-start
 * implementation incorrectly dropped a regex span when an SLM span
 * started before and overlapped it. Now: place regex spans first
 * (they're already non-overlapping per scanWithRegex), then admit
 * SLM spans only when they don't overlap any kept regex span.
 */
export function mergeSpans(
  regexSpans: ReadonlyArray<RegexSpan>,
  slmSpans: ReadonlyArray<SlmSpan>
): PiiScanSpan[] {
  // Regex spans are already non-overlapping (scanWithRegex
  // guarantees this). Sort them by start for the merge walk.
  const regexSorted: PiiScanSpan[] = [...regexSpans].sort((a, b) => a.start - b.start);
  const slmSorted = [...slmSpans].sort((a, b) => a.start - b.start);
  // Walk SLM spans; keep each one whose range does NOT overlap any
  // regex span. We also dedupe overlapping SLM spans among
  // themselves (longer-first preference on equal start).
  const slmKept: PiiScanSpan[] = [];
  for (const slm of slmSorted) {
    // Overlap with any regex span?
    let overlapsRegex = false;
    for (const rx of regexSorted) {
      if (rx.end <= slm.start) continue; // rx entirely before slm
      if (rx.start >= slm.end) break;   // rx entirely after slm (regex sorted)
      overlapsRegex = true;
      break;
    }
    if (overlapsRegex) continue;
    // Overlap with a previously-kept SLM span?
    if (slmKept.length > 0) {
      const last = slmKept[slmKept.length - 1];
      if (slm.start < last.end) continue;
    }
    slmKept.push(slm);
  }
  // Final merge in input-position order.
  const merged = [...regexSorted, ...slmKept].sort((a, b) => a.start - b.start);
  return merged;
}

export function useSlmPiiRedactor({ identityId }: UseOptions) {
  const installs = useInstalledSlms(identityId);
  const installed = (installs.data ?? []).find((i) => i.status === 'installed');
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const mountedRef = useRef(true);
  const inflightRef = useRef<{
    piiKey: string;
    promise: Promise<SlmPiiScanResult | null>;
  } | null>(null);
  const perTextTimestamps = useRef<Map<string, number[]>>(new Map());
  const globalTimestamps = useRef<number[]>([]);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<SlmPiiRedactorStatus>(
    identityId
      ? { kind: 'ready' }
      : { kind: 'unavailable', reason: 'no_identity' }
  );
  const [lastResult, setLastResult] = useState<SlmPiiScanResult | null>(null);
  // Phase 13.1 adversarial fix M6 — track whether the citizen has
  // explicitly Apply'd the most recent scan. Send-side gate reads
  // this to detect "scan completed → citizen dismissed sheet →
  // tapping Send while PII detected but never applied". Flips
  // true inside markApplied; flips false on every fresh scan().
  const [appliedSinceScan, setAppliedSinceScan] = useState(false);

  const safeSetStatus = useCallback((s: SlmPiiRedactorStatus) => {
    if (mountedRef.current) setStatus(s);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Identity / install change → recompute the unavailable / ready
  // bucket without disturbing in-flight scans.
  useEffect(() => {
    if (!identityId) {
      safeSetStatus({ kind: 'unavailable', reason: 'no_identity' });
      return;
    }
    setStatus((prev) =>
      prev.kind === 'unavailable' && prev.reason === 'no_identity'
        ? { kind: 'ready' }
        : prev
    );
  }, [identityId, safeSetStatus]);

  // Phase 13.0.0a — shared runtime; unmount only drops local refs +
  // clears the cooldown timer. No unload (would pull rug from other
  // SLM consumers).
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
    (piiKey: string): { ok: boolean; retryInMs: number } => {
      const now = Date.now();
      const perText = perTextTimestamps.current.get(piiKey) ?? [];
      const recent = perText.filter((t) => now - t < PER_TEXT_WINDOW_MS);
      if (recent.length === 0) {
        // Phase 13.1 adversarial fix S8 — delete empty entries
        // so the Map doesn't grow unbounded across a long session.
        perTextTimestamps.current.delete(piiKey);
      } else {
        perTextTimestamps.current.set(piiKey, recent);
      }
      if (recent.length >= PER_TEXT_LIMIT) {
        return { ok: false, retryInMs: PER_TEXT_WINDOW_MS - (now - recent[0]) };
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

  const scan = useCallback(
    async (text: string): Promise<SlmPiiScanResult | null> => {
      if (!text || !text.trim()) return null;
      const piiKey = djb2Hash(text.trim().slice(0, 1000));
      // Synchronous regex pass — runs even with no SLM installed.
      const regexSpans = scanWithRegex(text);

      // No SLM installed (or no identity) → return regex-only
      // result immediately, no rate-limit consumed.
      if (!installed) {
        const result: SlmPiiScanResult = {
          regexSpans,
          slmSpans: [],
          mergedSpans: mergeSpans(regexSpans, []),
          redactedText: applyMask(text, regexSpans),
          scannedText: text,
          modelPackId: null,
          generationMs: null
        };
        if (mountedRef.current) {
          setLastResult(result);
          setAppliedSinceScan(false);
        }
        safeSetStatus({ kind: 'unavailable', reason: 'no_install' });
        return result;
      }

      // Cancel any stale cooldown timer.
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const rate = checkRateLimit(piiKey);
      if (!rate.ok) {
        // Still return the regex-only result (honest-hide — citizen
        // gets the deterministic floor regardless of rate-limit).
        const result: SlmPiiScanResult = {
          regexSpans,
          slmSpans: [],
          mergedSpans: mergeSpans(regexSpans, []),
          redactedText: applyMask(text, regexSpans),
          scannedText: text,
          modelPackId: installed.modelPackId,
          generationMs: null
        };
        if (mountedRef.current) {
          setLastResult(result);
          setAppliedSinceScan(false);
        }
        // Phase 13.1 adversarial fix M5 — stamp a wall-clock
        // deadline so the chip can render a LIVE-decrementing
        // countdown instead of a frozen "retry in 60s".
        safeSetStatus({
          kind: 'cooling-down',
          retryInMs: rate.retryInMs,
          cooldownUntil: Date.now() + rate.retryInMs
        });
        cooldownTimerRef.current = setTimeout(() => {
          cooldownTimerRef.current = null;
          if (mountedRef.current) safeSetStatus({ kind: 'ready' });
        }, rate.retryInMs);
        return result;
      }

      // MF-4 — same piiKey re-tap → share the in-flight promise.
      // Different piiKey → refuse with null so the chip can't
      // render a stale result against new text.
      if (inflightRef.current) {
        return inflightRef.current.piiKey === piiKey
          ? inflightRef.current.promise
          : null;
      }

      const job = (async (): Promise<SlmPiiScanResult | null> => {
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
          safeSetStatus({ kind: 'scanning' });
          // Phase 13.1 adversarial fix S9 — snapshot the runtime
          // locally so an unmount during the await can't null
          // runtimeRef.current under our feet (which would otherwise
          // TypeError on `.generate`).
          const rt = runtimeRef.current;
          if (!rt) {
            safeSetStatus({ kind: 'unavailable', reason: 'no_blob' });
            return null;
          }
          const prompt = buildPiiScanPrompt(text);
          const startedAt = performance.now();
          const completion = await rt.generate({
            prompt,
            maxTokens: MAX_TOKENS,
            temperature: TEMPERATURE
          });
          const generationMs = Math.round(performance.now() - startedAt);

          // Stamp rate-limit AFTER success.
          const now = Date.now();
          const per = perTextTimestamps.current.get(piiKey) ?? [];
          per.push(now);
          perTextTimestamps.current.set(piiKey, per);
          globalTimestamps.current.push(now);

          const parsed = parsePiiScanCompletion(completion, text);
          const slmSpans = parsed.spans;
          const merged = mergeSpans(regexSpans, slmSpans);
          const result: SlmPiiScanResult = {
            regexSpans,
            slmSpans,
            mergedSpans: merged,
            redactedText: applyMask(text, merged),
            scannedText: text,
            modelPackId: installed.modelPackId,
            generationMs
          };
          safeSetStatus({ kind: 'ready' });
          if (mountedRef.current) {
          setLastResult(result);
          setAppliedSinceScan(false);
        }
          return result;
        } catch (_err) {
          // SF-4 — stamp global on catch so a corrupt-GGUF retry
          // loop can't bypass the rate-limit.
          globalTimestamps.current.push(Date.now());
          // MF-2 — citizen-safe generic error message.
          safeSetStatus({
            kind: 'error',
            message: "Couldn't scan on this device. Tap again to retry."
          });
          // Return regex-only result so the chip still has spans
          // to show.
          const fallback: SlmPiiScanResult = {
            regexSpans,
            slmSpans: [],
            mergedSpans: mergeSpans(regexSpans, []),
            redactedText: applyMask(text, regexSpans),
            scannedText: text,
            modelPackId: installed.modelPackId,
            generationMs: null
          };
          if (mountedRef.current) setLastResult(fallback);
          return fallback;
        }
      })();
      inflightRef.current = { piiKey, promise: job };
      try {
        return await job;
      } finally {
        inflightRef.current = null;
      }
    },
    [installed, checkRateLimit, safeSetStatus]
  );

  const reset = useCallback(() => {
    setLastResult(null);
    setAppliedSinceScan(false);
    safeSetStatus(
      identityId
        ? installed
          ? { kind: 'ready' }
          : { kind: 'unavailable', reason: 'no_install' }
        : { kind: 'unavailable', reason: 'no_identity' }
    );
  }, [identityId, installed, safeSetStatus]);

  // Phase 13.1 adversarial fix M6 — markApplied is called by the
  // PiiReviewSheet's onApply hookup site after the citizen
  // explicitly accepts a mask. Drives the Send-side gate that
  // surfaces "you scanned and found PII but never masked it".
  const markApplied = useCallback(() => {
    setAppliedSinceScan(true);
  }, []);

  /** True when a scan completed against the CURRENT text, found
   *  at least one span, and the citizen has NOT explicitly Apply'd
   *  a mask since. Send-side gate reads this to confirm before
   *  posting raw PII. */
  const hasPendingPii = (() => {
    if (!lastResult) return false;
    if (lastResult.mergedSpans.length === 0) return false;
    if (appliedSinceScan) return false;
    return true;
  })();

  return {
    status,
    scan,
    reset,
    lastResult,
    markApplied,
    hasPendingPii,
    hasSlm: Boolean(installed),
    modelPackId: installed?.modelPackId ?? null
  };
}
