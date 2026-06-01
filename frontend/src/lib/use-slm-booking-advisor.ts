// Phase 12.1b.4 — SLM-D booking-advisor hook.
//
// Reuses the Phase 13.0.0a shared wllama runtime singleton so the
// model bytes are loaded at most once across all SLM consumers
// (intent parser, field suggest, advisor, doc summariser, and any
// future SLM-F/G/H spec). Rate-limited so a provider tapping the
// chip repeatedly doesn't lock the device.

import { useCallback, useRef, useState } from 'react';
import { readSlmBlob } from './opfs';
import { getSharedSlmRuntime, type SlmRuntime } from './slm-runtime';
import { useInstalledSlms } from './hooks';
import {
  buildBookingAdvisorPrompt,
  parseBookingAdvisorCompletion,
  type BookingAdvisorContext,
  type ParsedAdvisorResponse
} from './booking-advisor';

// Per-booking + global caps. Booking decisions are made once or
// twice, not spammed.
const PER_BOOKING_LIMIT = 3;
const PER_BOOKING_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 12;
const GLOBAL_WINDOW_MS = 5 * 60_000;

export type AdvisorStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'thinking' }
  | { kind: 'cooling-down'; retryInMs: number }
  | { kind: 'unavailable'; reason: string };

interface UseOptions {
  identityId: string | null | undefined;
}

interface AskInput {
  bookingId: string;
  context: BookingAdvisorContext;
}

export interface AdvisorResult {
  parsed: ParsedAdvisorResponse;
  generationMs: number;
}

export function useSlmBookingAdvisor({ identityId }: UseOptions) {
  const installs = useInstalledSlms(identityId);
  const installed = (installs.data ?? []).find((i) => i.status === 'installed');
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const inflightRef = useRef<Promise<AdvisorResult | null> | null>(null);
  const perBookingTimestamps = useRef<Map<string, number[]>>(new Map());
  const globalTimestamps = useRef<number[]>([]);
  const [status, setStatus] = useState<AdvisorStatus>(
    installed ? { kind: 'idle' } : { kind: 'unavailable', reason: 'no_install' }
  );

  const checkRateLimit = useCallback((bookingId: string): { ok: boolean; retryInMs: number } => {
    const now = Date.now();
    const perBooking = perBookingTimestamps.current.get(bookingId) ?? [];
    const recent = perBooking.filter((t) => now - t < PER_BOOKING_WINDOW_MS);
    perBookingTimestamps.current.set(bookingId, recent);
    if (recent.length >= PER_BOOKING_LIMIT) {
      return { ok: false, retryInMs: PER_BOOKING_WINDOW_MS - (now - recent[0]) };
    }
    const recentGlobal = globalTimestamps.current.filter((t) => now - t < GLOBAL_WINDOW_MS);
    globalTimestamps.current = recentGlobal;
    if (recentGlobal.length >= GLOBAL_LIMIT) {
      return { ok: false, retryInMs: GLOBAL_WINDOW_MS - (now - recentGlobal[0]) };
    }
    return { ok: true, retryInMs: 0 };
  }, []);

  const ask = useCallback(
    async (input: AskInput): Promise<AdvisorResult | null> => {
      if (!installed) {
        setStatus({ kind: 'unavailable', reason: 'no_install' });
        return null;
      }
      const rate = checkRateLimit(input.bookingId);
      if (!rate.ok) {
        setStatus({ kind: 'cooling-down', retryInMs: rate.retryInMs });
        return null;
      }
      if (inflightRef.current) return inflightRef.current;
      const job = (async (): Promise<AdvisorResult | null> => {
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
          setStatus({ kind: 'thinking' });
          const prompt = buildBookingAdvisorPrompt(input.context);
          const startedAt = performance.now();
          const out = await runtimeRef.current!.generate({
            prompt,
            maxTokens: 96,
            temperature: 0.2
          });
          const generationMs = Math.round(performance.now() - startedAt);
          const parsed = parseBookingAdvisorCompletion(out);
          const now = Date.now();
          const per = perBookingTimestamps.current.get(input.bookingId) ?? [];
          per.push(now);
          perBookingTimestamps.current.set(input.bookingId, per);
          globalTimestamps.current.push(now);
          setStatus({ kind: 'idle' });
          if (!parsed) return null;
          return { parsed, generationMs };
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

  return { status, ask, hasSlm: Boolean(installed) };
}
