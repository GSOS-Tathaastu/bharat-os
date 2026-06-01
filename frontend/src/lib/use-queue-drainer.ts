// Phase 12.1b.2 — Offline queue drainer.
//
// Mounted once in App.tsx. Triggers on:
//   • offline→online transition
//   • initial mount when already online + identity hydrated
//   • a successful direct send (we know the network is good)
//
// Sequential FIFO, single-flight via Web Locks (multi-tab safe).
// Reuses the SAME Idempotency-Key stored on each queue row across
// every attempt so a mid-drain reconnect flicker doesn't produce
// a duplicate orchestration on the server.

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import {
  listAll,
  listByStatus,
  updateRow,
  removeRow,
  purgeStale,
  QUEUE_MAX_ATTEMPTS,
  type QueueRow
} from './offline-queue';
import { useOnlineStatus } from './use-online-status';

const LOCK_NAME = 'bharat-os-queue-drain';

interface DrainOutcome {
  attempted: number;
  succeeded: number;
  failedTransient: number;
  failedTerminal: number;
}

async function postOrchestration(row: QueueRow) {
  const response = await api<{ ok: true; orchestration: { orchestrationId: string } }>(
    '/api/orchestrations',
    {
      method: 'POST',
      headers: {
        'idempotency-key': row.idempotencyKey
      },
      body: JSON.stringify({
        intentText: row.payload.intentText,
        actorId: '__use_from_row__',
        locale: row.payload.locale,
        intentAnnotation: row.payload.intentAnnotation ?? null
      })
    }
  );
  return response;
}

// Drain one row at a time. Returns when the queue is empty OR a
// transient failure breaks the loop (so the next online event
// can re-arm).
// SF-1 (adversarial fix) — rows stranded in 'sending' status by a
// previous tab close or IDB transaction abort would otherwise stay
// hung forever (listByStatus('queued') skips them). At drain start,
// sweep any 'sending' row older than this window back to 'queued'.
const STALE_SENDING_MS = 5 * 60 * 1000;

export async function drainQueueOnce(actorId: string): Promise<DrainOutcome> {
  const outcome: DrainOutcome = {
    attempted: 0,
    succeeded: 0,
    failedTransient: 0,
    failedTerminal: 0
  };
  // SF-1: recover stranded rows before listing queued ones.
  const stale = await listByStatus(actorId, 'sending');
  const now = Date.now();
  for (const row of stale) {
    const lastMs = row.lastAttemptAt ? Date.parse(row.lastAttemptAt) : 0;
    if (!Number.isFinite(lastMs) || now - lastMs > STALE_SENDING_MS) {
      await updateRow(actorId, row.localId, { status: 'queued' });
    }
  }
  let queued = await listByStatus(actorId, 'queued');
  while (queued.length > 0) {
    const row = queued[0];
    outcome.attempted += 1;
    await updateRow(actorId, row.localId, {
      status: 'sending',
      lastAttemptAt: new Date().toISOString()
    });
    try {
      // Server uses the row's idempotency key. On replay it
      // returns the cached body verbatim (200 + X-Bharat-OS-
      // Idempotent-Replay: 1) so a duplicate POST after a
      // flicker doesn't create a second orchestration.
      const payloadActorId = actorId;
      await api<{ ok: true; orchestration: { orchestrationId: string } }>(
        '/api/orchestrations',
        {
          method: 'POST',
          headers: { 'idempotency-key': row.idempotencyKey },
          body: JSON.stringify({
            intentText: row.payload.intentText,
            actorId: payloadActorId,
            locale: row.payload.locale,
            actionType: row.payload.actionType ?? null,
            intentAnnotation: row.payload.intentAnnotation ?? null
          })
        }
      );
      await removeRow(actorId, row.localId);
      outcome.succeeded += 1;
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string; message?: string };
      const isTransient =
        e.status == null || e.status >= 500 || e.status === 408 || e.status === 429;
      const attemptCount = row.attemptCount + 1;
      if (!isTransient || attemptCount >= QUEUE_MAX_ATTEMPTS) {
        await updateRow(actorId, row.localId, {
          status: 'failed_permanent',
          attemptCount,
          lastError: e.code ?? e.message ?? 'unknown_error'
        });
        if (isTransient) outcome.failedTransient += 1;
        else outcome.failedTerminal += 1;
      } else {
        await updateRow(actorId, row.localId, {
          status: 'queued',
          attemptCount,
          lastError: e.code ?? e.message ?? 'unknown_error'
        });
        outcome.failedTransient += 1;
        // Break on transient — wait for next online event.
        break;
      }
    }
    queued = await listByStatus(actorId, 'queued');
  }
  return outcome;
}

// SF-2 (adversarial fix) — module-scoped serialization chain so a
// React strict-mode double-mount (and any environment lacking
// navigator.locks) still serializes concurrent drains instead of
// interleaving them. Web Locks remains the primary path when
// available.
let fallbackChain: Promise<unknown> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return await navigator.locks!.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return await fn();
    });
  }
  // Fallback (jsdom / no Web Locks): chain through a module-level
  // promise so concurrent callers run sequentially.
  const next = fallbackChain.then(() => fn(), () => fn());
  fallbackChain = next.catch(() => undefined);
  return await next;
}

interface UseQueueDrainerOptions {
  // SF-3 (adversarial fix) — caller-provided hook so a successful
  // background drain can surface a toast like "Sent N queued
  // intents". The drainer itself stays toast-agnostic.
  onDrainSuccess?: (succeededCount: number) => void;
}

export function useQueueDrainer(actorId: string | null | undefined, opts: UseQueueDrainerOptions = {}) {
  const qc = useQueryClient();
  const { isOnline } = useOnlineStatus();
  const lastStateRef = useRef<boolean | null>(null);
  const onDrainSuccessRef = useRef(opts.onDrainSuccess);
  onDrainSuccessRef.current = opts.onDrainSuccess;

  const drain = useCallback(async () => {
    if (!actorId) return null;
    const result = await withLock(() => drainQueueOnce(actorId));
    if (result && result.succeeded > 0) {
      qc.invalidateQueries({ queryKey: ['orchestrations', actorId] });
      qc.invalidateQueries({ queryKey: ['offline-queue', actorId] });
      onDrainSuccessRef.current?.(result.succeeded);
    }
    return result;
  }, [actorId, qc]);

  // Drain on offline→online transition + once on mount when online.
  useEffect(() => {
    if (!actorId) return;
    const prev = lastStateRef.current;
    lastStateRef.current = isOnline;
    if (prev === false && isOnline === true) {
      void drain();
    } else if (prev === null && isOnline === true) {
      // First mount — purge stale + drain anything left from a
      // prior session.
      void purgeStale(actorId).catch(() => 0);
      void drain();
    }
  }, [isOnline, actorId, drain]);

  return { drain };
}

// Public utility — read the current queue counts for the UI pill.
export async function readQueueCounts(actorId: string): Promise<{ queued: number; failed: number; total: number }> {
  const all = await listAll(actorId);
  return {
    queued: all.filter((r) => r.status === 'queued' || r.status === 'sending').length,
    failed: all.filter((r) => r.status === 'failed_permanent').length,
    total: all.length
  };
}
