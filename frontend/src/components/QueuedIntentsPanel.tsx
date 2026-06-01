import { useEffect, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  listAll,
  removeRow,
  updateRow,
  type QueueRow
} from '@/lib/offline-queue';
import { useQueueDrainer } from '@/lib/use-queue-drainer';

// Phase 12.1b.2 — Queued intents panel.
//
// Lists every row in the citizen's per-identity offline queue
// (queued + sending + failed_permanent). The literal phrase
// "queued — not yet on Bharat OS" appears at the top so the
// citizen cannot believe a queued intent has been executed.

interface QueuedIntentsPanelProps {
  identityId: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

export function QueuedIntentsPanel({ identityId }: QueuedIntentsPanelProps) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [tick, setTick] = useState(0);
  const { drain } = useQueueDrainer(identityId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await listAll(identityId);
        if (!cancelled) setRows(all);
      } catch {
        if (!cancelled) setRows([]);
      }
    }
    void load();
  }, [identityId, tick]);

  async function handleDiscard(localId: string) {
    await removeRow(identityId, localId);
    setTick((t) => t + 1);
  }

  async function handleRetry(localId: string) {
    await updateRow(identityId, localId, { status: 'queued', lastError: null });
    await drain();
    setTick((t) => t + 1);
  }

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-body text-text-muted">
          Nothing queued. Intents you send while offline appear here
          until they reach Bharat OS.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card tone="warning">
        <p className="text-body font-semibold">
          {rows.length} queued &mdash; not yet on Bharat OS
        </p>
        <p className="mt-1 text-caption text-text-muted">
          These intents are stored on this phone only. They will send
          automatically when you&rsquo;re back online.
        </p>
      </Card>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.localId}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-text">
                    {row.payload.intentText.length > 100
                      ? row.payload.intentText.slice(0, 100) + '…'
                      : row.payload.intentText}
                  </p>
                  <p className="mt-1 text-caption text-text-muted">
                    queued {relativeTime(row.enqueuedAt)}
                    {row.attemptCount > 0 && ` · ${row.attemptCount} attempts`}
                    {row.lastError && ` · ${row.lastError}`}
                  </p>
                </div>
                <Badge
                  variant={
                    row.status === 'failed_permanent'
                      ? 'warning'
                      : row.status === 'sending'
                        ? 'governance'
                        : 'pending'
                  }
                >
                  {row.status === 'failed_permanent'
                    ? "Didn't go through"
                    : row.status === 'sending'
                      ? 'Sending…'
                      : 'Queued'}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.status === 'failed_permanent' && (
                  <Action variant="ghost" onClick={() => handleRetry(row.localId)}>
                    Retry
                  </Action>
                )}
                <Action variant="ghost" onClick={() => handleDiscard(row.localId)}>
                  Discard
                </Action>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
