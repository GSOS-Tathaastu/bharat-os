import { useState } from 'react';
import { Action, Card, Sheet } from '@/components/ui';

interface DisputeFileSheetProps {
  open: boolean;
  onClose: () => void;
  onFile: (reason: string) => void;
  busy?: boolean;
}

// Phase 12.1a.2 — Shared dispute filing sheet for citizen + provider.
// Reason ≥ 4 chars enforced client-side mirroring the substrate.

export function DisputeFileSheet({ open, onClose, onFile, busy = false }: DisputeFileSheetProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return (
    <Sheet open={open} onClose={onClose} title="File a dispute">
      <div className="space-y-3">
        <Card tone="warning">
          <p className="text-body">
            An operator will review. Escrow stays locked until the
            dispute is adjudicated.
          </p>
        </Card>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 600))}
          placeholder="What went wrong? (4–600 characters)"
          className="w-full rounded-md border border-border bg-surface p-2 text-body"
          rows={4}
        />
        <p className="text-caption text-text-muted">{trimmed.length}/600</p>
        <div className="flex flex-wrap gap-2">
          <Action onClick={() => onFile(trimmed)} disabled={busy || trimmed.length < 4}>
            {busy ? 'Filing…' : 'File dispute'}
          </Action>
          <Action variant="ghost" onClick={onClose}>
            Cancel
          </Action>
        </div>
      </div>
    </Sheet>
  );
}
