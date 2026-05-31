import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Action, Card, Evidence, Field, Money, useToast } from '@/components/ui';
import { useCreateSponsorJob, useSponsorSelf, type CreateSponsorJobInput, type LabelingJobFull } from '@/lib/hooks';
import { EscrowInsufficientCallout } from '@/components/sponsor/EscrowInsufficientCallout';

const TASK_KINDS: Array<{ value: LabelingJobFull['taskKind']; label: string }> = [
  { value: 'preference_pair', label: 'Preference pair' },
  { value: 'classification', label: 'Classification' },
  { value: 'span_annotation', label: 'Span annotation' },
  { value: 'transcription', label: 'Transcription' },
  { value: 'safety_label', label: 'Safety label' }
];

const MODALITIES: Array<LabelingJobFull['modality']> = ['text', 'voice', 'image'];
const IP_TERMS: Array<{ value: LabelingJobFull['ipTerms']; label: string }> = [
  { value: 'non_exclusive', label: 'Non-exclusive' },
  { value: 'exclusive', label: 'Exclusive' },
  { value: 'cc_by_4_0', label: 'CC BY 4.0' }
];

export function SponsorJobCreate() {
  const navigate = useNavigate();
  const { data: sponsor } = useSponsorSelf();
  const create = useCreateSponsorJob();
  const show = useToast((s) => s.show);

  const [taskKind, setTaskKind] = useState<LabelingJobFull['taskKind']>('classification');
  const [language, setLanguage] = useState('hi');
  const [modality, setModality] = useState<LabelingJobFull['modality']>('text');
  const [perLabelRupees, setPerLabelRupees] = useState('4');
  const [feeRupees, setFeeRupees] = useState('0');
  const [itemCount, setItemCount] = useState('10');
  const [ipTerms, setIpTerms] = useState<LabelingJobFull['ipTerms']>('non_exclusive');
  const [consentPurposeCode, setConsentPurposeCode] = useState('bos:consent:labeling.classification');
  const [description, setDescription] = useState('');
  const [qcGolden, setQcGolden] = useState('1000');
  const [qcMinScore, setQcMinScore] = useState('0.7');
  const [qcReview, setQcReview] = useState('500');
  const [escrowError, setEscrowError] = useState<{ requiredPaise: number; availablePaise: number } | null>(null);

  const perLabelPaise = Math.max(0, Math.round(Number(perLabelRupees || '0') * 100));
  const feePaise = Math.max(0, Math.round(Number(feeRupees || '0') * 100));
  const itemCountNum = Math.max(0, parseInt(itemCount || '0', 10));
  const projectedLock = itemCountNum * (perLabelPaise + feePaise);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEscrowError(null);
    if (!description.trim()) {
      show('Add a description so workers know what they will label.', 'error');
      return;
    }
    if (!consentPurposeCode.trim()) {
      show('Consent purpose code is required.', 'error');
      return;
    }
    if (perLabelPaise <= 0 || itemCountNum <= 0) {
      show('Set a per-label rate and an item count.', 'error');
      return;
    }
    const input: CreateSponsorJobInput = {
      taskKind,
      language: language.trim(),
      modality,
      perLabelPaise,
      bharatOsFeePaise: feePaise,
      itemCount: itemCountNum,
      ipTerms,
      consentPurposeCode: consentPurposeCode.trim(),
      description: description.trim(),
      qcGoldenItemRateBps: parseInt(qcGolden || '0', 10),
      qcMinWorkerScore: Number(qcMinScore || '0'),
      qcSponsorReviewRateBps: parseInt(qcReview || '0', 10)
    };
    create.mutate(input, {
      onSuccess: ({ job }) => {
        show(`Draft job created. Upload your corpus next.`, 'success');
        navigate(`/sponsor/jobs/${encodeURIComponent(job.jobId)}`);
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
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            New labeling job
          </p>
          <h1 className="text-display font-semibold">Draft a job</h1>
        </div>
        <Link to="/sponsor/jobs">
          <Action variant="ghost" size="sm">
            Cancel
          </Action>
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card title="Task">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-caption font-semibold text-text">Kind</p>
              <select
                value={taskKind}
                onChange={(e) => setTaskKind(e.target.value as typeof taskKind)}
                className="h-10 w-full rounded-sm border border-border bg-white px-3 text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                {TASK_KINDS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Language code"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="hi"
              helper="Use ISO 639-1 codes (hi, mr, ta, bn, en, …)."
            />
            <div>
              <p className="mb-1 text-caption font-semibold text-text">Modality</p>
              <div className="flex gap-2">
                {MODALITIES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModality(m)}
                    className={
                      'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold capitalize ' +
                      (modality === m
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-border bg-white text-text-muted hover:border-primary')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Workers see this on the marketplace."
            />
          </div>
        </Card>

        <Card title="Economics">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Per label (₹)"
              type="number"
              inputMode="numeric"
              value={perLabelRupees}
              onChange={(e) => setPerLabelRupees(e.target.value)}
            />
            <Field
              label="Bharat OS fee per label (₹)"
              type="number"
              inputMode="numeric"
              value={feeRupees}
              onChange={(e) => setFeeRupees(e.target.value)}
              helper="Optional platform fee."
            />
            <Field
              label="Item count"
              type="number"
              inputMode="numeric"
              value={itemCount}
              onChange={(e) => setItemCount(e.target.value)}
              helper="Final cap; cannot exceed at upload."
            />
          </div>
          <div className="mt-3 rounded-sm border border-primary-100 bg-primary-50 p-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Projected escrow lock on launch
            </p>
            <Money paise={projectedLock} size="lg" />
            <p className="mt-1 text-caption text-text-muted">
              Sponsor available escrow:{' '}
              <Money paise={(sponsor?.escrowBalancePaise ?? 0) - (sponsor?.escrowLockedPaise ?? 0)} size="sm" />
            </p>
          </div>
        </Card>

        <Card title="QC pipeline (Phase 10.4)">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Golden items (bps)"
              value={qcGolden}
              onChange={(e) => setQcGolden(e.target.value)}
              helper="1000 = 10% of items as golden."
            />
            <Field
              label="Min worker score (0..1)"
              value={qcMinScore}
              onChange={(e) => setQcMinScore(e.target.value)}
              helper="Workers below this gated on this job."
            />
            <Field
              label="Sponsor review sample (bps)"
              value={qcReview}
              onChange={(e) => setQcReview(e.target.value)}
              helper="500 = 5% sampled into your review queue."
            />
          </div>
        </Card>

        <Card title="Compliance">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-caption font-semibold text-text">IP terms</p>
              <div className="flex gap-2">
                {IP_TERMS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setIpTerms(t.value)}
                    className={
                      'flex-1 rounded-sm border-2 px-2 py-2 text-caption font-semibold ' +
                      (ipTerms === t.value
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-border bg-white text-text-muted hover:border-primary')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Consent purpose code"
              value={consentPurposeCode}
              onChange={(e) => setConsentPurposeCode(e.target.value)}
              className="font-mono"
            />
          </div>
        </Card>

        {escrowError && <EscrowInsufficientCallout {...escrowError} />}

        <div className="flex gap-2">
          <Action disabled={create.isPending}>
            {create.isPending ? 'Creating draft…' : 'Create draft job'}
          </Action>
          <Link to="/sponsor/jobs">
            <Action variant="ghost">Cancel</Action>
          </Link>
        </div>

        <Evidence title="What happens next?">
          The draft locks no escrow yet. After creating it, you upload your
          corpus (JSONL / JSON array of <span className="font-mono">{`{body, goldenAnswer?}`}</span>{' '}
          entries), then launch — Bharat OS verifies that <span className="font-mono">
            itemCount × (perLabelPaise + bharatOsFeePaise)
          </span>{' '}
          is available and locks it. Once active, workers can claim items from
          the marketplace.
        </Evidence>
      </form>
    </main>
  );
}
