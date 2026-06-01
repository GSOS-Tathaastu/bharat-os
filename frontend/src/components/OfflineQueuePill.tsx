import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import { useOnlineStatus } from '@/lib/use-online-status';
import { readQueueCounts } from '@/lib/use-queue-drainer';

// Phase 12.1b.2 — Offline-queue status pill.
//
// Surfaces the citizen's queue + connection state in one line:
//   • Hidden when online + empty queue.
//   • Grey   "Offline — your next intent will queue on this phone"
//   • Amber  "Queued (N) — will send when back online"
//   • Red    "N didn't go through — tap to review"
//
// The pill is the §15 "no silent acceptance" surface — visible
// + non-dismissible while items remain.

interface OfflineQueuePillProps {
  identityId: string | null | undefined;
  refreshTick?: number;
}

export function OfflineQueuePill({ identityId, refreshTick }: OfflineQueuePillProps) {
  const { isOnline } = useOnlineStatus();
  const [counts, setCounts] = useState<{ queued: number; failed: number; total: number }>({ queued: 0, failed: 0, total: 0 });

  useEffect(() => {
    if (!identityId) return;
    let cancelled = false;
    async function load() {
      try {
        const c = await readQueueCounts(identityId!);
        if (!cancelled) setCounts(c);
      } catch {
        // IDB unavailable; treat as empty.
      }
    }
    void load();
    const id = window.setInterval(load, 4_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [identityId, refreshTick]);

  if (!identityId) return null;
  const total = counts.total;
  const queued = counts.queued;
  const failed = counts.failed;

  if (isOnline && total === 0) return null;

  if (!isOnline && queued === 0) {
    return (
      <Badge variant="neutral">
        Offline &mdash; your next intent will queue on this phone
      </Badge>
    );
  }
  if (failed > 0) {
    return (
      <Badge variant="warning">
        {failed} didn&rsquo;t go through &mdash; review in queue tab
        {queued > 0 && ` · ${queued} still waiting`}
      </Badge>
    );
  }
  if (queued > 0) {
    return (
      <Badge variant={isOnline ? 'governance' : 'pending'}>
        {isOnline ? `Sending queued (${queued})…` : `Queued (${queued}) — will send when back online`}
      </Badge>
    );
  }
  return null;
}
