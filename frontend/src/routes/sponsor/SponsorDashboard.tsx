import { Link } from 'react-router-dom';
import { Action, Badge, Card, Evidence, Money, Stat } from '@/components/ui';
import { useSponsorJobs, useSponsorRounds, useSponsorSelf } from '@/lib/hooks';

export function SponsorDashboard() {
  const { data: sponsor, isPending } = useSponsorSelf();
  const { data: jobs = [] } = useSponsorJobs();
  const { data: rounds = [] } = useSponsorRounds();

  const balance = sponsor?.escrowBalancePaise ?? 0;
  const locked = sponsor?.escrowLockedPaise ?? 0;
  const available = balance - locked;

  const draftJobs = jobs.filter((j) => j.status === 'draft').length;
  const activeJobs = jobs.filter((j) => j.status === 'active').length;
  // Honest metric: we don't have a cheap cross-job aggregate of
  // pending submissions; per-job count needs N queue fetches. Until
  // that endpoint exists, show "jobs sampling" so the headline is
  // honest rather than wrong.
  const jobsSampling = jobs.filter(
    (j) => j.status === 'active' && j.qcSponsorReviewRateBps > 0
  ).length;

  const activeRounds = rounds.filter((r) =>
    ['accepting_updates', 'aggregating', 'open'].includes(r.status)
  ).length;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Dashboard
          </p>
          <h1 className="text-display font-semibold">
            {isPending ? 'Loading…' : sponsor?.displayName ?? 'Sponsor'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sponsor/jobs/new">
            <Action>+ New labeling job</Action>
          </Link>
          <Link to="/sponsor/rounds/new">
            <Action variant="secondary">+ New federated round</Action>
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card tone="trust">
          <Stat
            label="Available escrow"
            value={<Money paise={available} size="lg" />}
            delta={`${jobs.length} jobs · ${rounds.length} rounds`}
          />
        </Card>
        <Card tone="governance">
          <Stat
            label="Locked"
            value={<Money paise={locked} size="lg" />}
            delta={`${activeJobs + activeRounds} active commitments`}
          />
        </Card>
        <Card>
          <Stat
            label="Total balance"
            value={<Money paise={balance} size="lg" />}
            delta={sponsor?.contactEmail ? sponsor.contactEmail : 'no contact on file'}
          />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Labeling jobs" actions={<Badge variant="trust">{jobs.length}</Badge>}>
          <p className="text-body">
            {draftJobs} draft · {activeJobs} active
          </p>
          <Link to="/sponsor/jobs" className="mt-3 inline-block">
            <Action size="sm" variant="secondary">
              View all
            </Action>
          </Link>
        </Card>
        <Card title="Federated rounds" actions={<Badge variant="trust">{rounds.length}</Badge>}>
          <p className="text-body">{activeRounds} active</p>
          <Link to="/sponsor/rounds" className="mt-3 inline-block">
            <Action size="sm" variant="secondary">
              View all
            </Action>
          </Link>
        </Card>
        <Card
          title="Review queue"
          subtitle="Jobs sampling submissions for sponsor review"
        >
          <p className="text-body">
            {jobsSampling === 0
              ? 'No jobs are sampling right now.'
              : `${jobsSampling} active job${jobsSampling === 1 ? '' : 's'} ${
                  jobsSampling === 1 ? 'is' : 'are'
                } sampling — open a job to see pending submissions.`}
          </p>
          <Link to="/sponsor/jobs" className="mt-3 inline-block">
            <Action size="sm" variant="secondary">
              Open jobs
            </Action>
          </Link>
        </Card>
      </div>

      <Evidence title="What does this dashboard show?">
        Available + locked + balance match the BE-side <span className="font-mono">publicSponsor</span>{' '}
        record (Phase 9.1). Locked escrow corresponds to the sum of round + job
        commitments — when a worker's submission is accepted, locked → debited;
        on sponsor reject (Phase 10.4 clawback) locked is replenished from the
        debit pool. Numbers update on every sponsor query refresh (default 30s).
      </Evidence>
    </main>
  );
}
