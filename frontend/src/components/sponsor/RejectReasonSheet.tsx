import { useEffect, useState } from 'react';
import { Action, Card, Money, Sheet, useToast } from '@/components/ui';
import { useRejectSubmission, type LabelingSubmissionSurface } from '@/lib/hooks';

interface RejectReasonSheetProps {
  open: boolean;
  onClose: () => void;
  submission: LabelingSubmissionSurface | null;
  jobId: string;
  perLabelPaise: number;
}

export function RejectReasonSheet({
  open,
  onClose,
  submission,
  jobId,
  perLabelPaise
}: RejectReasonSheetProps) {
  const [reason, setReason] = useState('');
  const reject = useRejectSubmission();
  const show = useToast((s) => s.show);

  useEffect(() => {
    if (open) setReason('');
  }, [open, submission]);

  function handleSubmit() {
    if (!submission) return;
    if (reason.trim().length < 4) {
      show('Reason must be at least 4 characters.', 'error');
      return;
    }
    reject.mutate(
      { jobId, submissionId: submission.submissionId, reason: reason.trim() },
      {
        onSuccess: (res) => {
          show(
            `Rejected. Clawed back ${(res.clawedBackPaise / 100).toFixed(2)} ₹ from worker mesh balance.`,
            'success'
          );
          onClose();
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Reject submission">
      {submission && (
        <div className="space-y-3">
          <Card>
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Worker (anonymised)
            </p>
            <p className="mt-1 font-mono text-caption break-all">{submission.identityHash}</p>
          </Card>
          <Card tone="warning">
            <p className="text-body">
              Rejecting this submission emits a negative mesh-contribution event
              with payoutPaise = <Money paise={-perLabelPaise} size="sm" />, and
              refunds the locked escrow into your available pool.
            </p>
            <p className="mt-2 text-caption text-text-muted">
              Reason must be at least 4 characters and will be persisted with
              the submission row. Workers see it on their Labels tab.
            </p>
          </Card>
          <div>
            <p className="mb-1 text-caption font-semibold text-text">Reason</p>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Specific + factual. Workers read this."
              className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-error focus:outline-none focus:ring-2 focus:ring-error-100"
            />
          </div>
          <div className="flex gap-2">
            <Action variant="destructive" onClick={handleSubmit} disabled={reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Reject + clawback'}
            </Action>
            <Action variant="ghost" onClick={onClose}>
              Cancel
            </Action>
          </div>
        </div>
      )}
    </Sheet>
  );
}
