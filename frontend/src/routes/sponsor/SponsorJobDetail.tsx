import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Action, Badge, Card, Evidence, Money, Stat, useToast } from '@/components/ui';
import {
  useLaunchSponsorJob,
  useSponsorJobs,
  type LabelingJobFull
} from '@/lib/hooks';
import { EscrowInsufficientCallout } from '@/components/sponsor/EscrowInsufficientCallout';
import { JobItemsUploader } from '@/components/sponsor/JobItemsUploader';

const STATUS_VARIANT: Record<LabelingJobFull['status'], 'pending' | 'trust' | 'warning' | 'neutral' | 'error'> = {
  draft: 'pending',
  funded: 'pending',
  active: 'trust',
  paused: 'warning',
  complete: 'trust',
  cancelled: 'error'
};

export function SponsorJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: jobs = [], isPending } = useSponsorJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  const launch = useLaunchSponsorJob();
  const navigate = useNavigate();
  const show = useToast((s) => s.show);

  const [escrowError, setEscrowError] = useState<{ requiredPaise: number; availablePaise: number } | null>(
    null
  );

  if (isPending) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Card>
          <p className="text-body text-text-muted">Loading…</p>
        </Card>
      </main>
    );
  }
  if (!job || !jobId) {
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

  const projectedLock = job.itemCount * (job.perLabelPaise + job.bharatOsFeePaise);
  const itemsRemaining = Math.max(0, job.itemCount - job.itemsUploaded);
  const isDraft = job.status === 'draft';
  const canLaunch = isDraft && job.itemsUploaded >= job.itemCount;

  function handleLaunch() {
    setEscrowError(null);
    launch.mutate(
      { jobId: jobId! },
      {
        onSuccess: () => {
          setEscrowError(null);
          show('Job launched. Workers can claim items now.', 'success');
        },
        onError: (err: Error & { status?: number; body?: { error?: { code?: string; requiredPaise?: number; availablePaise?: number } } }) => {
          if (err.status === 402 && err.body?.error?.requiredPaise != null) {
            setEscrowError({
              requiredPaise: err.body.error.requiredPaise,
              availablePaise: err.body.error.availablePaise ?? 0
            });
            return;
          }
          show(err.message, 'error');
        }
      }
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Job
          </p>
          <h1 className="text-display font-semibold">
            {job.description?.trim() || `${job.taskKind} · ${job.language}`}
          </h1>
          <p className="mt-1 text-caption font-mono text-text-muted">
            {job.jobId.replace(/^bos:labeling-job:/, '')}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat
            label="Items uploaded"
            value={`${job.itemsUploaded}/${job.itemCount}`}
            delta={itemsRemaining > 0 ? `${itemsRemaining} more needed` : 'ready to launch'}
          />
        </Card>
        <Card>
          <Stat
            label="Submissions"
            value={`${job.submissionsAccepted}`}
            delta={`+${job.submissionsRejected} rejected`}
          />
        </Card>
        <Card>
          <Stat
            label="Escrow locked"
            value={<Money paise={job.escrowLockedPaise} size="md" />}
            delta={`Debited ${(job.escrowDebitedPaise / 100).toFixed(2)} ₹`}
          />
        </Card>
      </div>

      <Card title="Plan + economics">
        <ul className="space-y-1 text-body">
          <li>
            <span className="font-mono text-text-muted">Task:</span> {job.taskKind} · {job.modality}
          </li>
          <li>
            <span className="font-mono text-text-muted">Language:</span> {job.language}
          </li>
          <li>
            <span className="font-mono text-text-muted">Per label:</span>{' '}
            <Money paise={job.perLabelPaise} size="sm" />
          </li>
          <li>
            <span className="font-mono text-text-muted">Bharat OS fee:</span>{' '}
            <Money paise={job.bharatOsFeePaise} size="sm" />
          </li>
          <li>
            <span className="font-mono text-text-muted">IP terms:</span> {job.ipTerms}
          </li>
          <li>
            <span className="font-mono text-text-muted">Consent code:</span>{' '}
            <span className="font-mono">{job.consentPurposeCode}</span>
          </li>
          <li>
            <span className="font-mono text-text-muted">QC sample for review:</span>{' '}
            {(job.qcSponsorReviewRateBps / 100).toFixed(2)}%
          </li>
          <li>
            <span className="font-mono text-text-muted">QC min worker score:</span>{' '}
            {job.qcMinWorkerScore.toFixed(2)}
          </li>
          <li>
            <span className="font-mono text-text-muted">Projected escrow lock on launch:</span>{' '}
            <Money paise={projectedLock} size="sm" />
          </li>
          <li>
            <span className="font-mono text-text-muted">Deadline:</span>{' '}
            {new Date(job.deadlineAt).toLocaleString('en-IN')}
          </li>
        </ul>
      </Card>

      {isDraft && <JobItemsUploader job={job} />}

      {escrowError && <EscrowInsufficientCallout {...escrowError} />}

      <Card title="Status actions">
        {isDraft ? (
          canLaunch ? (
            <>
              <p className="text-body text-text-muted">
                All {job.itemCount} items uploaded. Launch locks{' '}
                <Money paise={projectedLock} size="sm" /> of escrow and opens the
                job to workers.
              </p>
              <Action onClick={handleLaunch} disabled={launch.isPending} className="mt-3">
                {launch.isPending ? 'Launching…' : 'Launch job'}
              </Action>
            </>
          ) : (
            <p className="text-body text-text-muted">
              Upload {itemsRemaining} more item{itemsRemaining === 1 ? '' : 's'} before launching.
            </p>
          )
        ) : (
          <>
            <p className="text-body text-text-muted">
              Job is {job.status}. Items + plan are locked — to change anything,
              revoke and re-create.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}/review`}>
                <Action size="sm" variant="secondary">
                  Open review queue
                </Action>
              </Link>
              <Link to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}/export`}>
                <Action size="sm" variant="secondary">
                  Download signed audit bundle
                </Action>
              </Link>
            </div>
          </>
        )}
      </Card>

      <Evidence title="What is in the audit export?">
        Phase 10.5 ships a signed NDJSON bundle with one accepted-submission
        line per row. The bundle's trailer carries a SHA-256 + Ed25519 signature
        from the Bharat OS audit signer (<span className="font-mono">
          /api/audit-signer/public-key
        </span>
        ). Worker identity is hashed per (job, worker) so the same worker on
        a different job hashes to a different value — no cross-job correlation.
      </Evidence>
    </main>
  );
}
