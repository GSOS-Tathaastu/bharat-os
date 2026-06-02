// Phase 13.7 — ComputeServingCapacityCard
//
// Worker-facing opt-in card. The worker declares they're willing
// to serve on-device SLM inferences to OTHER citizens for fiat-
// credit, names a per-1000-tokens price, a concurrency cap, a
// daily token cap, and device-state constraints (battery / WiFi
// / charging).
//
// v1 ships the substrate only — the actual dispatch + serve flow
// lands as Phase 13.7.1. The "How this works" details panel makes
// this honest.
//
// §15 bindings:
//   • The worker decides everything (price, caps, constraints)
//     before any compute serving happens.
//   • The capacity record carries POINTER + count meta only;
//     prompts and responses (when 13.7.1 lands) flow through a
//     WASM-isolated runtime, not through the registry.
//   • Revocable + pausable. DPDP §12 cascade wipes capacities on
//     identity erase.

import { useMemo, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  useComputeServingCapacities,
  useCreateComputeServingCapacity,
  useRevokeComputeServingCapacity,
  usePauseComputeServingCapacity,
  useComputeServingDispatchesPending,
  useServeComputeServingDispatch
} from '@/lib/hooks';
import {
  COMPUTE_SERVING_STATUS_LABEL,
  DEFAULT_PRICE_PER_K_PAISE,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_MAX_DAILY_TOKENS,
  DEFAULT_BATTERY_MIN_PERCENT,
  DEFAULT_TTL_DAYS,
  defaultExpiresAt,
  formatPricePerKTokens,
  sha256Pointer,
  type ComputeServingCapacity,
  type ComputeServingDispatch
} from '@/lib/compute-serving-capacity';
import type { ApiError } from '@/lib/api';

interface ComputeServingCapacityCardProps {
  identityId: string | null | undefined;
}

const STATUS_VARIANT: Record<
  ComputeServingCapacity['status'],
  'trust' | 'pending' | 'error' | 'neutral'
> = {
  active: 'trust',
  paused: 'pending',
  revoked: 'error',
  expired: 'neutral'
};

export function ComputeServingCapacityCard({ identityId }: ComputeServingCapacityCardProps) {
  const capacitiesQuery = useComputeServingCapacities(identityId);
  const createMut = useCreateComputeServingCapacity();
  const revokeMut = useRevokeComputeServingCapacity();
  const pauseMut = usePauseComputeServingCapacity();

  const [showForm, setShowForm] = useState<boolean>(false);
  const [formPriceRupees, setFormPriceRupees] = useState<number>(
    DEFAULT_PRICE_PER_K_PAISE / 100
  );
  const [formMaxConcurrent, setFormMaxConcurrent] = useState<number>(DEFAULT_MAX_CONCURRENT);
  const [formMaxDailyTokens, setFormMaxDailyTokens] = useState<number>(DEFAULT_MAX_DAILY_TOKENS);
  const [formBatteryMin, setFormBatteryMin] = useState<number>(DEFAULT_BATTERY_MIN_PERCENT);
  const [formRequireWifi, setFormRequireWifi] = useState<boolean>(true);
  const [formRequireCharging, setFormRequireCharging] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  const capacities = useMemo(() => {
    const all = capacitiesQuery.data?.capacities ?? [];
    return [...all].sort((a, b) =>
      String(b.publishedAt).localeCompare(String(a.publishedAt))
    );
  }, [capacitiesQuery.data]);

  async function handleCreate() {
    if (!identityId) return;
    setFormError(null);
    try {
      await createMut.mutateAsync({
        identityId,
        pricePerKTokensPaise: Math.round(formPriceRupees * 100),
        maxConcurrent: formMaxConcurrent,
        maxDailyTokens: formMaxDailyTokens,
        constraints: {
          batteryMinPercent: formBatteryMin,
          requireWifi: formRequireWifi,
          requireCharging: formRequireCharging
        },
        expiresAt: defaultExpiresAt(DEFAULT_TTL_DAYS)
      });
      setShowForm(false);
    } catch (err) {
      const code = (err as ApiError).code;
      if (code === 'duplicate_capacity') {
        setFormError(
          'You already have an identical active capacity. Revoke it first, or change the price / caps / constraints.'
        );
      } else if (code === 'invalid_compute_serving_capacity') {
        setFormError(
          (err as ApiError).message || 'The capacity was rejected by the server.'
        );
      } else {
        setFormError("Couldn't publish — try again in a moment.");
      }
    }
  }

  async function handleRevoke(cap: ComputeServingCapacity) {
    if (!identityId) return;
    await revokeMut.mutateAsync({
      identityId,
      capacityId: cap.capacityId,
      reason: 'worker-initiated opt-out'
    });
  }

  async function handlePause(cap: ComputeServingCapacity) {
    if (!identityId) return;
    await pauseMut.mutateAsync({ identityId, capacityId: cap.capacityId });
  }

  if (!identityId) return null;

  return (
    <Card
      title="Serve idle compute for fiat-credit"
      subtitle="Phase 13.7 · let your phone serve on-device SLM inferences to other Bharat OS citizens when you're idle. You set the price + caps + device-state rules. Revocable any time."
      actions={<Badge variant="trust">Worker revenue</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          v1 ships the opt-in substrate · dispatch + serve flow lands in 13.7.x
        </span>
      </div>

      {!showForm && (
        <Action variant="trust" onClick={() => setShowForm(true)}>
          Publish a serving capacity
        </Action>
      )}

      {showForm && (
        <div className="mt-2 rounded-sm border border-border bg-surface p-3">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Price per 1000 tokens (₹)
              </span>
              <input
                type="number"
                step="0.5"
                min={0.5}
                max={500}
                value={formPriceRupees}
                onChange={(e) =>
                  setFormPriceRupees(Math.max(0.5, Number(e.target.value) || 0.5))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Max concurrent dispatches
              </span>
              <input
                type="number"
                min={1}
                max={4}
                value={formMaxConcurrent}
                onChange={(e) =>
                  setFormMaxConcurrent(Math.max(1, Math.min(4, Math.floor(Number(e.target.value) || 1))))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Max tokens served per day
              </span>
              <input
                type="number"
                min={10_000}
                max={10_000_000}
                step={10_000}
                value={formMaxDailyTokens}
                onChange={(e) =>
                  setFormMaxDailyTokens(Math.max(10_000, Math.floor(Number(e.target.value) || 10_000)))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Minimum battery %
              </span>
              <input
                type="number"
                min={20}
                max={100}
                value={formBatteryMin}
                onChange={(e) =>
                  setFormBatteryMin(Math.max(20, Math.min(100, Math.floor(Number(e.target.value) || 20))))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <div className="mb-3 flex flex-wrap gap-3 text-body text-text">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formRequireWifi}
                onChange={(e) => setFormRequireWifi(e.target.checked)}
              />
              Require WiFi (don't serve over mobile data)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formRequireCharging}
                onChange={(e) => setFormRequireCharging(e.target.checked)}
              />
              Require charging (don't drain my battery)
            </label>
          </div>

          <p className="mb-3 text-caption text-text-muted">
            Capacity expires in {DEFAULT_TTL_DAYS} days · you can pause or revoke any time.
          </p>

          {formError && (
            <p className="mb-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <Action variant="trust" onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? 'Publishing…' : 'Publish capacity'}
            </Action>
            <Action
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
            >
              Cancel
            </Action>
          </div>
        </div>
      )}

      {capacities.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
            Your serving capacities ({capacities.length})
          </p>
          <ul className="space-y-2">
            {capacities.map((cap) => (
              <li key={cap.capacityId} className="rounded-sm border border-border bg-white p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[cap.status]}>
                    {COMPUTE_SERVING_STATUS_LABEL[cap.status]}
                  </Badge>
                  <span className="text-caption text-text-muted">
                    {formatPricePerKTokens(cap.pricePerKTokensPaise)}
                  </span>
                </div>
                <p className="text-body text-text">
                  Max {cap.maxConcurrent} concurrent · up to{' '}
                  {cap.maxDailyTokens.toLocaleString('en-IN')} tokens/day · expires{' '}
                  {cap.expiresAt.slice(0, 10)}
                </p>
                <p className="mt-1 text-caption text-text-muted">
                  Battery ≥ {cap.constraints.batteryMinPercent}%
                  {cap.constraints.requireWifi ? ' · WiFi required' : ''}
                  {cap.constraints.requireCharging ? ' · charging required' : ''}
                </p>
                {cap.status === 'active' && (
                  <div className="mt-2 flex gap-2">
                    <Action
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePause(cap)}
                      disabled={pauseMut.isPending}
                    >
                      Pause
                    </Action>
                    <Action
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(cap)}
                      disabled={revokeMut.isPending}
                    >
                      Revoke
                    </Action>
                  </div>
                )}
                {cap.status === 'paused' && (
                  <Action
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(cap)}
                    disabled={revokeMut.isPending}
                  >
                    Revoke
                  </Action>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {capacities.length === 0 && !showForm && (
        <p className="mt-3 text-caption text-text-muted">
          You haven't published a serving capacity yet. Once you do, you'll earn into
          your mesh balance for every dispatch served (₹X per 1000 tokens) — once the
          dispatch + serve flow ships in Phase 13.7.x.
        </p>
      )}

      {/* Phase 13.7.2 — pending dispatches assigned to this
          worker. Polls every 5s. Manual serve in v1 (worker
          types in responseHash + actualTokens); 13.7.3 will
          automate via the encryption substrate + Phase 9.0c
          runtime serve-mode. */}
      <PendingDispatchesSection workerId={identityId} />

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          When another Bharat OS citizen submits an intent that needs an SLM
          inference, the server can route the work to YOUR phone if your
          capacity is active. Your phone serves the inference via the same
          Phase 9.0c wllama runtime, signs the response hash, and your mesh
          balance ticks up. The Phase 13.7.1 BE substrate is live — your
          pending queue polls every 5 seconds. v1 manual-serve flow has you
          enter the actual tokens served + sha256 of your response text
          below. Phase 13.7.3 replaces this with the encryption substrate
          (citizen-encrypted prompt → your WASM runtime auto-decrypts and
          serves).
        </p>
      </details>
    </Card>
  );
}

// Phase 13.7.2 — pending dispatches section, mounted at the
// bottom of the capacity card. Honest manual-serve UI for v1.
function PendingDispatchesSection({ workerId }: { workerId: string }) {
  const pending = useComputeServingDispatchesPending(workerId);
  const dispatches = pending.data?.dispatches ?? [];
  if (pending.isPending) return null;
  if (dispatches.length === 0) {
    return (
      <p className="mt-4 text-caption text-text-muted">
        No pending compute dispatches. When a citizen sends one to your
        active capacity, it'll show up here within ~5 seconds.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
        Pending dispatches ({dispatches.length})
      </p>
      <ul className="space-y-2">
        {dispatches.map((d) => (
          <PendingDispatchRow key={d.dispatchId} dispatch={d} workerId={workerId} />
        ))}
      </ul>
    </div>
  );
}

function PendingDispatchRow({
  dispatch,
  workerId
}: {
  dispatch: ComputeServingDispatch;
  workerId: string;
}) {
  const serve = useServeComputeServingDispatch();
  const [showForm, setShowForm] = useState<boolean>(false);
  const [responseText, setResponseText] = useState<string>('');
  const [actualTokens, setActualTokens] = useState<number>(dispatch.estimatedTokens);
  const [error, setError] = useState<string | null>(null);

  async function handleServe() {
    setError(null);
    if (responseText.trim().length === 0) {
      setError('Enter the response text you served (used to derive sha256 hash).');
      return;
    }
    if (actualTokens < 1) {
      setError('Actual tokens must be at least 1.');
      return;
    }
    try {
      const responseHash = await sha256Pointer(responseText);
      await serve.mutateAsync({
        dispatchId: dispatch.dispatchId,
        workerId,
        actualTokens,
        responseHash
      });
      setShowForm(false);
      setResponseText('');
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      const code = apiErr.code;
      if (code === 'not_assigned') {
        setError("This dispatch isn't assigned to you.");
      } else if (code === 'dispatch_not_pending') {
        setError('Someone already served this dispatch.');
      } else if (code === 'dispatch_expired') {
        setError('This dispatch expired (15-minute TTL).');
      } else {
        setError("Couldn't serve — try again in a moment.");
      }
    }
  }

  return (
    <li className="rounded-sm border border-border bg-white p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge variant="pending">Pending</Badge>
        <span className="text-caption text-text-muted">
          ~{dispatch.estimatedTokens.toLocaleString('en-IN')} tokens estimated · expires{' '}
          {dispatch.expiresAt.slice(11, 19)} UTC
        </span>
      </div>
      <p className="text-caption text-text-muted">
        Prompt hash: <span className="font-mono">{dispatch.promptHash.slice(0, 24)}…</span>
      </p>
      {!showForm && (
        <Action
          variant="trust"
          size="sm"
          onClick={() => setShowForm(true)}
          className="mt-2"
        >
          Mark as served
        </Action>
      )}
      {showForm && (
        <div className="mt-2 rounded-sm border border-border bg-surface p-2">
          <p className="mb-2 text-caption text-text-muted">
            v1 manual serve: paste the response text your SLM produced + the actual
            token count served. We'll sha256 the text client-side and post it as
            the responseHash.
          </p>
          <label className="mb-2 block">
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Response text (any length — hashed client-side)
            </span>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={3}
              placeholder="Paste what your SLM produced for the citizen's prompt."
              className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
            />
          </label>
          <label className="mb-2 block">
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Actual tokens served
            </span>
            <input
              type="number"
              min={1}
              max={100_000}
              value={actualTokens}
              onChange={(e) =>
                setActualTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
            />
          </label>
          {error && (
            <p className="mb-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Action
              variant="trust"
              size="sm"
              onClick={handleServe}
              disabled={serve.isPending}
            >
              {serve.isPending ? 'Serving…' : 'Confirm served'}
            </Action>
            <Action variant="ghost" size="sm" onClick={() => { setShowForm(false); setError(null); }}>
              Cancel
            </Action>
          </div>
        </div>
      )}
    </li>
  );
}
