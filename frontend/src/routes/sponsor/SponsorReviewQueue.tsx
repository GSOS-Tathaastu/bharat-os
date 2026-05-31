import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Action, Badge, Card, Evidence, useToast } from '@/components/ui';
import {
  useAcceptSubmission,
  useSponsorJobReviewQueue,
  useSponsorJobs,
  type LabelingSubmissionSurface
} from '@/lib/hooks';
import { LabelValueViewer } from '@/components/sponsor/LabelValueViewer';
import { RejectReasonSheet } from '@/components/sponsor/RejectReasonSheet';

export function SponsorReviewQueue() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: jobs = [] } = useSponsorJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  const { data: submissions = [], isPending } = useSponsorJobReviewQueue(jobId);
  const accept = useAcceptSubmission();
  const show = useToast((s) => s.show);

  const [rejectTarget, setRejectTarget] = useState<LabelingSubmissionSurface | null>(null);

  if (!jobId || !job) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Card tone="warning">
          <p className="text-body">Job not found.</p>
          <Link to="/sponsor/jobs" className="mt-2 inline-block">
            <Action size="sm">Back to jobs</Action>
          </Link>
        </Card>
      </main>
    );
  }

  function handleAccept(sub: LabelingSubmissionSurface) {
    accept.mutate(
      { jobId: jobId!, submissionId: sub.submissionId },
      {
        onSuccess: () => show('Accepted.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Review queue
          </p>
          <h1 className="text-display font-semibold">
            {job.description?.trim() || `${job.taskKind} · ${job.language}`}
          </h1>
          <p className="mt-1 text-caption text-text-muted">
            {submissions.length} pending sample review
          </p>
        </div>
        <Link to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}`}>
          <Action variant="ghost" size="sm">
            ← Job
          </Action>
        </Link>
      </header>

      <Evidence title="What lands here?">
        Submissions sampled at <span className="font-mono">{(job.qcSponsorReviewRateBps / 100).toFixed(2)}%</span>{' '}
        (job's <span className="font-mono">qcSponsorReviewRateBps</span>) appear
        here after worker submit. Workers are already paid; rejecting claws
        back via a negative mesh-contribution event + escrow refund. Accept is
        a no-op (mesh credit already landed). Worker identity is hashed per
        (job, worker) — same worker on a different job hashes to a different
        value.
      </Evidence>

      {isPending ? (
        <Card>
          <p className="text-body text-text-muted">Loading…</p>
        </Card>
      ) : submissions.length === 0 ? (
        <Card tone="trust">
          <p className="text-body font-semibold">Nothing waiting on you.</p>
          <p className="mt-1 text-body text-text-muted">
            Submissions sampled for sponsor review will appear here at the rate
            you set.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {submissions.map((sub) => (
            <li key={sub.submissionId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning">pending review</Badge>
                      <span className="text-caption text-text-muted">
                        Submitted {new Date(sub.submittedAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="mt-2 text-caption font-mono text-text-muted break-all">
                      {sub.identityHash}
                    </p>
                    <div className="mt-3 rounded-sm border border-border bg-surface-2 p-3">
                      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                        Worker label value
                      </p>
                      <div className="mt-1">
                        <LabelValueViewer taskKind={sub.taskKind} value={sub.labelValue} />
                      </div>
                      <p className="mt-2 text-caption text-text-muted">
                        Item id:{' '}
                        <span className="font-mono">
                          {sub.itemId.replace(/^bos:labeling-item:/, '')}
                        </span>{' '}
                        ·{' '}
                        <Link
                          to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}/export`}
                          className="underline"
                        >
                          See source in signed export
                        </Link>{' '}
                        <span className="text-text-muted">
                          (the review endpoint returns the worker label only;
                          source items will land inline in a polish phase)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Action
                    onClick={() => handleAccept(sub)}
                    disabled={accept.isPending}
                    size="sm"
                    variant="trust"
                  >
                    Accept
                  </Action>
                  <Action
                    onClick={() => setRejectTarget(sub)}
                    size="sm"
                    variant="destructive"
                  >
                    Reject + reason
                  </Action>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <RejectReasonSheet
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        submission={rejectTarget}
        jobId={jobId}
        perLabelPaise={job.perLabelPaise}
      />
    </main>
  );
}
