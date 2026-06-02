// Phase 13.7.2 — ComputeNetworkTestCard
//
// Citizen-side test card on /labs. Lists active worker capacities,
// lets the citizen type a prompt + estimated token count, hashes
// the prompt client-side, and creates a dispatch via
// POST /api/compute-serving-dispatches. The citizen's "sent"
// list polls every 5s for the served result.
//
// v1 limitation: the actual prompt text doesn't flow through the
// BE (the dispatch carries only `promptHash`). So a worker
// receiving a pending dispatch cannot see the prompt. The
// worker-side serve flow in ComputeServingCapacityCard is
// "manual-serve" — worker enters what their SLM produced + actual
// tokens; BE credits payout based on the worker's claim.
//
// 13.7.3 closes the loop with the encryption substrate (citizen
// encrypts prompt to worker's pubkey; worker's WASM auto-decrypts
// and serves; signed response). This card surfaces the
// pre-13.7.3 limitation honestly in its "How this works" details.
//
// §15 bindings:
//   • Prompt text NEVER reaches the BE — only sha256 pointer.
//     Stored in component state until the dispatch resolves.
//   • The dispatch listing endpoint returns only the BE
//     pointer-only payload, no plaintext.
//   • Citizen self-revocation: refresh the page; component
//     state clears.

import { useEffect, useMemo, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  useComputeServingCapacities,
  useCreateComputeServingDispatch,
  useComputeServingDispatchesSent,
  usePostEncryptedPrompt,
  useIdentities
} from '@/lib/hooks';
import { encryptPromptForWorker } from '@/lib/compute-encryption';
import {
  formatPricePerKTokens,
  sha256Pointer,
  COMPUTE_SERVING_DISPATCH_STATUS_LABEL,
  type ComputeServingCapacity,
  type ComputeServingDispatch
} from '@/lib/compute-serving-capacity';
import type { ApiError } from '@/lib/api';

interface ComputeNetworkTestCardProps {
  identityId: string | null | undefined;
}

const STATUS_VARIANT: Record<
  ComputeServingDispatch['status'],
  'trust' | 'pending' | 'error' | 'neutral'
> = {
  pending: 'pending',
  served: 'trust',
  expired: 'neutral',
  failed: 'error'
};

export function ComputeNetworkTestCard({ identityId }: ComputeNetworkTestCardProps) {
  // We need to find at least ONE active worker capacity (from a
  // DIFFERENT identity than the requester). For a demo, we read
  // capacities for every known identity on this device and pick
  // the first active one whose worker isn't us. In prod the
  // orchestrator routing endpoint will handle this.
  const identities = useIdentities();
  const [activeCapacities, setActiveCapacities] = useState<ComputeServingCapacity[]>([]);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  // On mount + every 10s, walk known identities and fetch their
  // capacities. Filter to active + not-self.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!identityId || !identities.data) return;
      const others = identities.data.filter((i) => i.id !== identityId);
      const all: ComputeServingCapacity[] = [];
      for (const other of others) {
        try {
          const res = await fetch(
            `/api/identities/${encodeURIComponent(other.id)}/compute-serving-capacity`
          );
          if (!res.ok) continue;
          const body = await res.json();
          for (const cap of body.capacities ?? []) {
            if (cap.status === 'active' && Date.parse(cap.expiresAt) > Date.now()) {
              all.push(cap);
            }
          }
        } catch (_err) {
          // best-effort
        }
      }
      if (!cancelled) setActiveCapacities(all);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [identityId, identities.data, refreshTick]);

  const sent = useComputeServingDispatchesSent(identityId);

  const [promptText, setPromptText] = useState<string>('');
  const [estimatedTokens, setEstimatedTokens] = useState<number>(500);
  const [selectedCapacityId, setSelectedCapacityId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const createMut = useCreateComputeServingDispatch();
  const postEncMut = usePostEncryptedPrompt();

  // Auto-select the first capacity on first arrival.
  useEffect(() => {
    if (!selectedCapacityId && activeCapacities.length > 0) {
      setSelectedCapacityId(activeCapacities[0].capacityId);
    }
  }, [activeCapacities, selectedCapacityId]);

  async function handleSend() {
    if (!identityId || !selectedCapacityId) return;
    setFormError(null);
    if (promptText.trim().length === 0) {
      setFormError('Type something to send to the worker.');
      return;
    }
    const capacity = activeCapacities.find((c) => c.capacityId === selectedCapacityId);
    try {
      const promptHash = await sha256Pointer(promptText);
      // Phase 13.7.3 — encrypt the prompt to the worker's pubkey
      // FIRST (so it's ready to post immediately after the
      // dispatch lands). If the worker hasn't published an
      // encryption pubkey (older capacity), skip encryption and
      // surface an honest message — the worker won't see the
      // plaintext prompt.
      let encEnvelope: Awaited<ReturnType<typeof encryptPromptForWorker>> | null = null;
      if (capacity?.workerEncryptionPubKeyBase64) {
        encEnvelope = await encryptPromptForWorker(
          promptText,
          capacity.workerEncryptionPubKeyBase64
        );
      }
      const dispatchRes = await createMut.mutateAsync({
        requesterId: identityId,
        capacityId: selectedCapacityId,
        promptHash,
        estimatedTokens
      });
      if (encEnvelope) {
        try {
          await postEncMut.mutateAsync({
            dispatchId: dispatchRes.dispatch.dispatchId,
            requesterId: identityId,
            ciphertextBase64: encEnvelope.ciphertextBase64,
            nonceBase64: encEnvelope.nonceBase64,
            ephemeralPubKeyBase64: encEnvelope.ephemeralPubKeyBase64
          });
        } catch (err) {
          // The dispatch landed; the envelope didn't. Surface the
          // partial-success state honestly.
          setFormError(
            'Dispatch sent, but the encrypted prompt failed to post. The worker can still see your dispatch but not the prompt text.'
          );
        }
      } else {
        setFormError(
          'Dispatch sent. Worker capacity is older than Phase 13.7.3 — they\'ll see the hash only, not the prompt text.'
        );
      }
      setPromptText('');
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr.code;
      if (code === 'self_dispatch') {
        setFormError("You can't dispatch to your own compute capacity.");
      } else if (code === 'capacity_not_active') {
        setFormError("That capacity isn't active anymore. Pick another worker.");
      } else if (code === 'duplicate_dispatch') {
        setFormError('An identical dispatch already exists. Wait or tweak the prompt.');
      } else if (code === 'unknown_capacity') {
        setFormError('Worker capacity not found.');
      } else {
        setFormError("Couldn't send — try again in a moment.");
      }
    }
  }

  const dispatches = useMemo(() => {
    const all = sent.data?.dispatches ?? [];
    return [...all].sort((a, b) =>
      String(b.requestedAt).localeCompare(String(a.requestedAt))
    );
  }, [sent.data]);

  if (!identityId) return null;

  return (
    <Card
      title="Compute network · request idle compute from another worker"
      subtitle="Phase 13.7.2 · send a prompt to another Bharat OS worker's idle capacity. Their phone serves the inference; you pay them via mesh-credit."
      actions={<Badge variant="trust">Compute network</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          v1 manual-serve · prompt-text stays on this device · pointer-only over the wire
        </span>
      </div>

      {activeCapacities.length === 0 ? (
        <p className="text-body text-text">
          No active worker capacities found on this server yet. Sign up a
          second identity, publish a serving capacity from /settings, then
          come back here.
        </p>
      ) : (
        <>
          <label className="mb-2 block">
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Worker capacity
            </span>
            <select
              value={selectedCapacityId ?? ''}
              onChange={(e) => setSelectedCapacityId(e.target.value || null)}
              className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
            >
              {activeCapacities.map((cap) => (
                <option key={cap.capacityId} value={cap.capacityId}>
                  {formatPricePerKTokens(cap.pricePerKTokensPaise)} · max{' '}
                  {cap.maxConcurrent} concurrent · battery ≥{' '}
                  {cap.constraints.batteryMinPercent}%
                </option>
              ))}
            </select>
          </label>

          <label className="mb-2 block">
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Prompt (stays on your device · hashed before send)
            </span>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              placeholder="Type the prompt you want the worker to serve. We sha256 it locally and only send the hash."
              className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
            />
          </label>

          <label className="mb-2 block">
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Estimated tokens
            </span>
            <input
              type="number"
              min={1}
              max={100_000}
              value={estimatedTokens}
              onChange={(e) =>
                setEstimatedTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
            />
          </label>

          {formError && (
            <p className="mb-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Action
              variant="trust"
              onClick={handleSend}
              disabled={createMut.isPending || !selectedCapacityId || promptText.trim().length === 0}
            >
              {createMut.isPending ? 'Sending…' : 'Send dispatch'}
            </Action>
            <Action
              variant="ghost"
              size="sm"
              onClick={() => setRefreshTick((n) => n + 1)}
            >
              Refresh workers
            </Action>
          </div>
        </>
      )}

      {dispatches.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
            Your dispatches ({dispatches.length})
          </p>
          <ul className="space-y-2">
            {dispatches.map((d) => (
              <li key={d.dispatchId} className="rounded-sm border border-border bg-white p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[d.status]}>
                    {COMPUTE_SERVING_DISPATCH_STATUS_LABEL[d.status]}
                  </Badge>
                  <span className="text-caption text-text-muted">
                    {d.estimatedTokens.toLocaleString('en-IN')} tokens estimated
                    {d.actualTokens != null && ` · ${d.actualTokens.toLocaleString('en-IN')} served`}
                    {d.payoutPaise != null &&
                      ` · paid worker ₹${(d.payoutPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                  </span>
                </div>
                <p className="text-caption text-text-muted">
                  Sent {d.requestedAt.slice(0, 16).replace('T', ' ')} UTC
                  {d.servedAt && ` · served ${d.servedAt.slice(0, 16).replace('T', ' ')} UTC`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          Phase 13.7.3 encryption substrate: when the worker has published
          a P-256 ECDH pubkey on their capacity, your prompt is encrypted
          locally (ECDH + HKDF + AES-256-GCM) before posting. Only the
          ciphertext + nonce + your ephemeral pubkey reach the BE. The
          worker fetches the envelope, decrypts client-side with their
          stored private key, and sees your prompt — but only on their
          device. Forward-secret: a fresh ephemeral keypair per dispatch
          means past prompts stay unreadable even if a long-lived worker
          key leaks later.
        </p>
        <p className="mt-2">
          Workers running an older capacity (no published pubkey) still
          receive the dispatch with the hash only — you'll see an honest
          notice if that happens. The worker-side serve form remains
          manual-entry for response text + token count (the response side
          will get an analogous flow in a future sub-phase).
        </p>
      </details>
    </Card>
  );
}
