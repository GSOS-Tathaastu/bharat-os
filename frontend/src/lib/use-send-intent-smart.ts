// Phase 12.1b.2 — "Smart" send-intent hook with offline-queue
// fallback. The original `useSendIntent` in hooks.ts is unchanged
// (legacy callers / tests still hit the POST directly). This hook
// wraps it with:
//
//   • Idempotency-Key derivation at the boundary (sha256 of
//     actorId + intent text + annotation + enqueueIso + nonce).
//   • Online → POST directly with the header.
//   • Offline (navigator.onLine === false) → enqueue locally via
//     offline-queue.ts and return a synthetic "queued" outcome.
//   • Network-error mid-POST → enqueue and return "queued" so the
//     citizen never sees a confusing error toast.
//
// The drainer (use-queue-drainer.ts) takes care of replay on the
// next online event.

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { deriveIdempotencyKey, newClientNonce } from './idempotency-key';
import { enqueueIntent, type QueuePayload, QueueFullError } from './offline-queue';
import type { Orchestration } from './hooks';

export type SmartSendResult =
  | { kind: 'sent'; orchestration: Orchestration }
  | { kind: 'queued'; localId: string; reason: 'offline' | 'network_error' }
  | { kind: 'queue_full' }
  | { kind: 'crypto_unavailable' };

export interface SmartSendInput {
  identityId: string;
  intentText: string;
  intentAnnotation?: unknown;
  locale?: string;
  actionType?: string | null;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function attemptPost(input: SmartSendInput, idempotencyKey: string): Promise<Orchestration> {
  const body = await api<{ ok: true; orchestration: Orchestration }>(
    '/api/orchestrations',
    {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify({
        intentText: input.intentText,
        actorId: input.identityId,
        locale: input.locale ?? 'en-IN',
        actionType: input.actionType ?? null,
        intentAnnotation: input.intentAnnotation ?? null
      })
    }
  );
  return body.orchestration;
}

async function enqueueLocally(
  input: SmartSendInput,
  idempotencyKey: string,
  enqueuedAt: string
): Promise<{ localId: string }> {
  const payload: QueuePayload = {
    intentText: input.intentText,
    locale: input.locale ?? 'en-IN',
    intentAnnotation: input.intentAnnotation ?? null,
    actionType: input.actionType ?? null
  };
  const row = await enqueueIntent(input.identityId, {
    idempotencyKey,
    payload,
    enqueuedAt
  });
  return { localId: row.localId };
}

export function useSmartSendIntent() {
  const qc = useQueryClient();
  const send = useCallback(
    async (input: SmartSendInput): Promise<SmartSendResult> => {
      if (!input.identityId) throw new Error('identityId is required.');
      const enqueuedAt = new Date().toISOString();
      let idempotencyKey: string;
      try {
        idempotencyKey = await deriveIdempotencyKey({
          actorId: input.identityId,
          intentText: input.intentText,
          intentAnnotation: input.intentAnnotation,
          enqueuedAtIso: enqueuedAt,
          clientNonce: newClientNonce()
        });
      } catch (err) {
        // MF-1 (adversarial fix) — turn an insecure-context crypto
        // failure into a typed outcome rather than an unhandled
        // promise rejection so CitizenHome can render an honest
        // toast and the citizen knows to switch to HTTPS.
        const msg = (err as Error).message || '';
        if (/SubtleCrypto|getRandomValues/.test(msg)) {
          return { kind: 'crypto_unavailable' };
        }
        throw err;
      }
      // Offline path first: skip the POST entirely if the browser
      // already says we're offline. Avoids a noisy console + spurious
      // CORS preflight failures.
      if (!isOnline()) {
        try {
          const { localId } = await enqueueLocally(input, idempotencyKey, enqueuedAt);
          qc.invalidateQueries({ queryKey: ['offline-queue', input.identityId] });
          return { kind: 'queued', localId, reason: 'offline' };
        } catch (err) {
          if (err instanceof QueueFullError) return { kind: 'queue_full' };
          throw err;
        }
      }
      try {
        const orchestration = await attemptPost(input, idempotencyKey);
        qc.invalidateQueries({ queryKey: ['orchestrations', input.identityId] });
        return { kind: 'sent', orchestration };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        // Treat a network failure (no status — fetch threw a
        // TypeError) OR a 5xx as "should queue and retry."
        const looksLikeNetwork = e.status == null;
        if (looksLikeNetwork) {
          try {
            const { localId } = await enqueueLocally(input, idempotencyKey, enqueuedAt);
            qc.invalidateQueries({ queryKey: ['offline-queue', input.identityId] });
            return { kind: 'queued', localId, reason: 'network_error' };
          } catch (qErr) {
            if (qErr instanceof QueueFullError) return { kind: 'queue_full' };
            throw qErr;
          }
        }
        throw err;
      }
    },
    [qc]
  );
  return { send };
}
