import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Action, Card, Evidence, Field, Money, useToast } from '@/components/ui';
import {
  useCreateSponsorRound,
  useSlmCatalog,
  useSponsorSelf,
  type CreateSponsorRoundInput
} from '@/lib/hooks';
import { EscrowInsufficientCallout } from '@/components/sponsor/EscrowInsufficientCallout';

export function SponsorRoundCreate() {
  const navigate = useNavigate();
  const { data: sponsor } = useSponsorSelf();
  const { data: catalog } = useSlmCatalog();
  const create = useCreateSponsorRound();
  const show = useToast((s) => s.show);

  const [modelName, setModelName] = useState('phi-3-mini');
  const [baselineModelHash, setBaselineModelHash] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('100');
  const [payoutRupees, setPayoutRupees] = useState('2');
  const [maxEpsilon, setMaxEpsilon] = useState('1.5');
  const [deadlineHours, setDeadlineHours] = useState('24');
  const [aggregationMode, setAggregationMode] = useState<'hash_combiner' | 'fedavg'>('hash_combiner');
  const [slmModelPackId, setSlmModelPackId] = useState('');
  const [targetTask, setTargetTask] = useState('');
  const [escrowError, setEscrowError] = useState<{ requiredPaise: number; availablePaise: number } | null>(null);

  const payoutPaisePerUpdate = Math.max(0, Math.round(Number(payoutRupees || '0') * 100));
  const maxParticipantsNum = Math.max(0, parseInt(maxParticipants || '0', 10));
  const projectedLock = maxParticipantsNum * payoutPaisePerUpdate;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEscrowError(null);
    if (!modelName.trim() || !baselineModelHash.trim()) {
      show('Model name and baseline model hash are required.', 'error');
      return;
    }
    const input: CreateSponsorRoundInput = {
      modelName: modelName.trim(),
      baselineModelHash: baselineModelHash.trim(),
      maxParticipants: maxParticipantsNum,
      payoutPaisePerUpdate,
      maxEpsilon: Number(maxEpsilon || '1.5'),
      deadlineSecondsFromNow: Math.max(60, Math.round(Number(deadlineHours || '24') * 3600)),
      aggregationMode,
      slmModelPackId: slmModelPackId.trim() || undefined,
      targetTask: targetTask.trim() || undefined
    };
    create.mutate(input, {
      onSuccess: ({ round }) => {
        show('Round opened.', 'success');
        navigate(`/sponsor/rounds/${encodeURIComponent(round.roundId)}`);
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
            New federated round
          </p>
          <h1 className="text-display font-semibold">Open a round</h1>
        </div>
        <Link to="/sponsor/rounds">
          <Action variant="ghost" size="sm">
            Cancel
          </Action>
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card title="Model">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Model name"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="phi-3-mini"
            />
            <Field
              label="Baseline model hash"
              value={baselineModelHash}
              onChange={(e) => setBaselineModelHash(e.target.value)}
              placeholder="sha256:…"
              className="font-mono"
            />
            <div>
              <p className="mb-1 text-caption font-semibold text-text">SLM model pack (optional)</p>
              <select
                value={slmModelPackId}
                onChange={(e) => setSlmModelPackId(e.target.value)}
                className="h-10 w-full rounded-sm border border-border bg-white px-3 text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="">(none)</option>
                {(catalog?.modelPacks ?? []).map((p) => (
                  <option key={p.modelPackId} value={p.modelPackId}>
                    {p.family} · {p.parameterCount?.toLocaleString?.() ?? '?'} params
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Target task (optional)"
              value={targetTask}
              onChange={(e) => setTargetTask(e.target.value)}
              placeholder="indic-intent-v1"
            />
          </div>
        </Card>

        <Card title="Economics + privacy">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Max participants"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
            <Field
              label="Payout per update (₹)"
              value={payoutRupees}
              onChange={(e) => setPayoutRupees(e.target.value)}
            />
            <Field
              label="Max DP epsilon"
              value={maxEpsilon}
              onChange={(e) => setMaxEpsilon(e.target.value)}
              helper="≤ 100 (substrate sanity cap)."
            />
            <Field
              label="Deadline (hours)"
              value={deadlineHours}
              onChange={(e) => setDeadlineHours(e.target.value)}
            />
            <div className="sm:col-span-2">
              <p className="mb-1 text-caption font-semibold text-text">Aggregation</p>
              <div className="flex gap-2">
                {(['hash_combiner', 'fedavg'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAggregationMode(m)}
                    className={
                      'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold ' +
                      (aggregationMode === m
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-border bg-white text-text-muted hover:border-primary')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-sm border border-primary-100 bg-primary-50 p-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Projected escrow lock
            </p>
            <Money paise={projectedLock} size="lg" />
            <p className="mt-1 text-caption text-text-muted">
              Available:{' '}
              <Money
                paise={(sponsor?.escrowBalancePaise ?? 0) - (sponsor?.escrowLockedPaise ?? 0)}
                size="sm"
              />
            </p>
          </div>
        </Card>

        {escrowError && <EscrowInsufficientCallout {...escrowError} />}

        <div className="flex gap-2">
          <Action disabled={create.isPending}>
            {create.isPending ? 'Opening round…' : 'Open round'}
          </Action>
          <Link to="/sponsor/rounds">
            <Action variant="ghost">Cancel</Action>
          </Link>
        </div>

        <Evidence title="What does a federated round do?">
          §7f: workers train on-device and submit signed gradient updates with
          DP noise (max epsilon caps the privacy budget per update).{' '}
          <span className="font-mono">hash_combiner</span> aggregates only
          gradient hashes (Phase 3.0 default, strongest pointer-not-payload).{' '}
          <span className="font-mono">fedavg</span> needs the noisy bytes
          (Phase 3.2) and demands a separate worker consent.
        </Evidence>
      </form>
    </main>
  );
}
