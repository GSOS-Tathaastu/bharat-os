import { useState, type ComponentType } from 'react';
import { Action, Badge, Card, Evidence, Money, Stat, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useLabelingJobs,
  useLabelingNextItem,
  useSubmitLabel,
  useSponsorDirectory,
  type LabelingJobSurface
} from '@/lib/hooks';
import { PreferencePairTask } from '@/components/labeling/PreferencePairTask';
import { ClassificationTask } from '@/components/labeling/ClassificationTask';
import { SpanAnnotationTask } from '@/components/labeling/SpanAnnotationTask';
import { TranscriptionTask } from '@/components/labeling/TranscriptionTask';
import { SafetyLabelTask } from '@/components/labeling/SafetyLabelTask';
import type { LabelingTaskProps } from '@/components/labeling/types';

// Phase 10.2 — Labels tab on /app/worker/. Worker discovers active
// labeling jobs filtered to their language, picks one, taps through
// items submitting labels. For v1 we ship the preference_pair task
// kind only — simplest UI to render: two options A/B, worker picks
// one. Other task kinds (classification, span, transcription,
// safety_label) come in Phase 10.3.

export function LabelsPage() {
  const identity = useActiveIdentity();
  const { data: jobs = [], isLoading } = useLabelingJobs();
  const [activeJob, setActiveJob] = useState<LabelingJobSurface | null>(null);

  if (activeJob) {
    return (
      <LabelingSession
        job={activeJob}
        onClose={() => setActiveJob(null)}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Earn from labeling
        </p>
        <h1 className="text-display font-semibold">Label tasks for sponsors</h1>
        <p className="mt-2 text-body text-text-muted">
          Sponsors (banks, hospitals, LLM trainers) pay per accepted label.
          Pick a task, label items in your language, payouts land in your
          Earn balance.
        </p>
      </div>

      {isLoading && (
        <Card>
          <p className="text-body text-text-muted">Loading available jobs…</p>
        </Card>
      )}

      {!isLoading && jobs.length === 0 && (
        <Card>
          <p className="text-body text-text-muted">
            No active labeling jobs right now. Sponsors create jobs via the
            admin API; the seed-demo includes a sample preference-pair job.
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {jobs.map((job) => (
          <LabelingJobCard
            key={job.jobId}
            job={job}
            onOpen={() => identity && setActiveJob(job)}
            disabled={!identity}
          />
        ))}
      </div>

      <Card title="How labeling works" tone="trust">
        <Evidence title="Privacy + pay">
          You only see one item at a time. Your label is bound to your
          identity but sponsors never get your raw identity — they get a
          per-job identityHash so they can't track you across jobs. Per-
          label payouts (e.g. ₹4–₹40) settle into your mesh balance + drain
          to UPI via cash-out. Sponsors fund the job up-front (locked
          escrow); you get paid on accept whether or not the sponsor
          re-funds. Refund-on-failed semantics protect you from sponsor-
          side QC disputes (future polish).
        </Evidence>
      </Card>
    </main>
  );
}

interface LabelingJobCardProps {
  job: LabelingJobSurface;
  onOpen: () => void;
  disabled?: boolean;
}

function LabelingJobCard({ job, onOpen, disabled }: LabelingJobCardProps) {
  const { data: sponsor } = useSponsorDirectory(job.sponsorId);
  const remainingItems = job.itemCount - job.submissionsAccepted;
  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="font-semibold text-text">
          {job.description ?? job.taskKind.replace(/_/g, ' ')}
        </p>
        <Money paise={job.perLabelPaise} size="sm" />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {sponsor && <Badge variant="governance">Sponsored by {sponsor.displayName}</Badge>}
        <Badge variant="neutral">{job.taskKind.replace(/_/g, ' ')}</Badge>
        <Badge variant="neutral">{job.language}</Badge>
      </div>
      <p className="text-caption text-text-muted">
        {remainingItems} of {job.itemCount} items remaining · deadline{' '}
        {new Date(job.deadlineAt).toLocaleDateString('en-IN')}
      </p>
      <Action
        variant="trust"
        size="md"
        className="mt-3"
        disabled={disabled || remainingItems <= 0}
        onClick={onOpen}
      >
        Start labeling
      </Action>
    </Card>
  );
}

interface LabelingSessionProps {
  job: LabelingJobSurface;
  onClose: () => void;
}

function LabelingSession({ job, onClose }: LabelingSessionProps) {
  const identity = useActiveIdentity();
  const workerId = identity?.id ?? null;
  const { data, isLoading, refetch } = useLabelingNextItem(job.jobId, workerId);
  const submit = useSubmitLabel();
  const show = useToast((s) => s.show);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalEarnedPaise, setTotalEarnedPaise] = useState(0);

  async function handleSubmit(labelValue: unknown) {
    if (!data?.item || !workerId) return;
    try {
      const result = await submit.mutateAsync({
        jobId: job.jobId,
        itemId: data.item.itemId,
        workerId,
        labelValue
      });
      const earned = result.meshContributionEvent?.payoutPaise ?? 0;
      setSubmittedCount((n) => n + 1);
      setTotalEarnedPaise((t) => t + earned);
      show(earned > 0 ? `+₹${(earned / 100).toFixed(2)} earned` : 'Submitted.', 'success');
      await refetch();
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Labeling session
          </p>
          <h1 className="text-heading font-semibold">{job.description ?? job.taskKind}</h1>
        </div>
        <Action variant="ghost" size="sm" onClick={onClose}>
          ✕ Close
        </Action>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Submitted" value={submittedCount} />
        <Stat label="Earned this session" value={<Money paise={totalEarnedPaise} size="md" />} />
      </div>

      {isLoading && (
        <Card>
          <p className="text-body text-text-muted">Loading next item…</p>
        </Card>
      )}

      {!isLoading && data?.item === null && (
        <Card tone="trust">
          <p className="text-body font-semibold">All caught up on this job.</p>
          <p className="text-caption text-text-muted">
            {data.reason === 'no_eligible_items'
              ? 'You have labeled every item you are eligible for. Try another job.'
              : 'No items available right now.'}
          </p>
          <Action variant="secondary" className="mt-3" onClick={onClose}>
            Back to jobs
          </Action>
        </Card>
      )}

      {!isLoading && data?.item && (
        <TaskRenderer
          item={data.item}
          submitting={submit.isPending}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  );
}

const TASK_RENDERERS: Record<string, ComponentType<LabelingTaskProps>> = {
  preference_pair: PreferencePairTask,
  classification: ClassificationTask,
  span_annotation: SpanAnnotationTask,
  transcription: TranscriptionTask,
  safety_label: SafetyLabelTask
};

function TaskRenderer({ item, submitting, onSubmit }: LabelingTaskProps) {
  const Renderer = TASK_RENDERERS[item.taskKind];
  if (Renderer) {
    return <Renderer item={item} submitting={submitting} onSubmit={onSubmit} />;
  }
  return (
    <Card>
      <p className="text-body text-text-muted">
        Task kind <code>{item.taskKind}</code> not supported in /app/. Use the
        /shell/ developer surface.
      </p>
    </Card>
  );
}
