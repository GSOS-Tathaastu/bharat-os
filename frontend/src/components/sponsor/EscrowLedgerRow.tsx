import { Badge, Money } from '@/components/ui';
import type { LedgerEvent } from '@/lib/hooks';

interface EscrowLedgerRowProps {
  event: LedgerEvent;
}

const TYPE_LABEL: Record<string, string> = {
  'sponsor_escrow.deposited': 'Deposit',
  'sponsor_escrow.locked': 'Locked',
  'sponsor_escrow.debited': 'Debited',
  'sponsor_escrow.refunded': 'Refunded',
  'labeling_export.signed': 'Export signed'
};

const TYPE_TONE: Record<string, 'trust' | 'pending' | 'warning' | 'neutral'> = {
  'sponsor_escrow.deposited': 'trust',
  'sponsor_escrow.locked': 'pending',
  'sponsor_escrow.debited': 'warning',
  'sponsor_escrow.refunded': 'trust',
  'labeling_export.signed': 'neutral'
};

export function EscrowLedgerRow({ event }: EscrowLedgerRowProps) {
  const label = TYPE_LABEL[event.type] ?? event.type;
  const tone = TYPE_TONE[event.type] ?? 'neutral';
  const isExport = event.type === 'labeling_export.signed';
  return (
    <li className="rounded-sm border border-border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Badge variant={tone}>{label}</Badge>
          {event.jobId && (
            <p className="mt-1 text-caption text-text-muted">
              job <span className="font-mono">{event.jobId.replace(/^bos:labeling-job:/, '')}</span>
            </p>
          )}
          {event.roundId && (
            <p className="mt-1 text-caption text-text-muted">
              round{' '}
              <span className="font-mono">
                {event.roundId.replace(/^bos:federated-round:/, '')}
              </span>
            </p>
          )}
          {event.reference && (
            <p className="mt-1 text-caption text-text-muted">{event.reference}</p>
          )}
          {isExport && event.contentSha256 && (
            <p className="mt-1 font-mono text-caption text-text-muted break-all">
              sha256: {event.contentSha256.slice(0, 32)}…
            </p>
          )}
          <p className="mt-1 text-caption text-text-muted">
            {new Date(event.at).toLocaleString('en-IN')}
          </p>
        </div>
        {event.amountPaise != null && (
          <div className="text-right">
            <Money paise={event.amountPaise} size="sm" />
          </div>
        )}
      </div>
    </li>
  );
}
