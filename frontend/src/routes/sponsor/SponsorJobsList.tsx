import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Action, Badge, Card, Money } from '@/components/ui';
import { useSponsorJobs, type LabelingJobFull } from '@/lib/hooks';

const STATUS_VARIANT: Record<LabelingJobFull['status'], 'pending' | 'trust' | 'warning' | 'neutral' | 'error'> = {
  draft: 'pending',
  funded: 'pending',
  active: 'trust',
  paused: 'warning',
  complete: 'trust',
  cancelled: 'error'
};

const FILTERS: Array<{ id: 'all' | LabelingJobFull['status']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'complete', label: 'Complete' }
];

export function SponsorJobsList() {
  const { data: jobs = [], isPending } = useSponsorJobs();
  const [filter, setFilter] = useState<typeof FILTERS[number]['id']>('all');

  const filtered = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Labeling jobs
          </p>
          <h1 className="text-display font-semibold">Your jobs</h1>
        </div>
        <Link to="/sponsor/jobs/new">
          <Action>+ New labeling job</Action>
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              'rounded-sm border-2 px-3 py-1 text-caption font-semibold ' +
              (filter === f.id
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-white text-text-muted hover:border-primary')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <Card>
          <p className="text-body text-text-muted">Loading…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card tone="trust">
          <p className="text-body font-semibold">
            {filter === 'all' ? 'No labeling jobs yet.' : `No ${filter} jobs.`}
          </p>
          <p className="mt-1 text-body text-text-muted">
            Draft your first to lock escrow on launch. Bharat OS workers see
            active jobs in their /app/labels/ tab once you launch.
          </p>
          <Link to="/sponsor/jobs/new" className="mt-3 inline-block">
            <Action size="sm">Create a job</Action>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((job) => (
            <li key={job.jobId}>
              <Link to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}`}>
                <Card className="hover:border-primary transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">
                        {job.description?.trim() || `${job.taskKind} · ${job.language}`}
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        <span className="font-mono">
                          {job.jobId.replace(/^bos:labeling-job:/, '')}
                        </span>
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        {job.taskKind} · {job.language} · {job.modality} ·{' '}
                        {job.itemsUploaded}/{job.itemCount} items
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        {job.submissionsAccepted} accepted · {job.submissionsRejected} rejected
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                      <p className="mt-2 text-caption text-text-muted">
                        <Money paise={job.perLabelPaise} size="sm" /> / label
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
