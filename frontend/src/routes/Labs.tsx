import { useState } from 'react';
import { Action, Badge, Card, Evidence, Money, Stat, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useSlmCatalog,
  useInstalledSlms,
  useRecordSlmInstall,
  useRemoveSlmInstall,
  useFederatedRounds,
  useSubmitFederatedUpdate,
  useSponsorDirectory,
  type SlmModelPack,
  type InstalledSlm,
  type FederatedRound
} from '@/lib/hooks';
import {
  downloadAndPersist,
  opfsSupported,
  readSlmBlob,
  removeSlmBlob,
  clearAllInstalledPacks,
  estimateInstallFeasible,
  DownloadFailureError
} from '@/lib/opfs';
import { SlmTryPrompt } from '@/components/SlmTryPrompt';
import { DocSummariserPanel } from '@/components/DocSummariserPanel';
import { SkillAgentPanel } from '@/components/SkillAgentPanel';
import { ConsumerComplaintPanel } from '@/components/ConsumerComplaintPanel';
import { PmKisanStatusPanel } from '@/components/PmKisanStatusPanel';
import { CitizenDataOffersPanel } from '@/components/CitizenDataOffersPanel';
import { ComputeNetworkTestCard } from '@/components/ComputeNetworkTestCard';
import { loadSlmRuntime, releaseSharedSlmRuntime } from '@/lib/slm-runtime';

function formatGb(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 0.1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / 1_000_000;
  return `${Math.round(mb)} MB`;
}

function formatBillions(params: number): string {
  if (params >= 1_000_000_000) {
    const b = params / 1_000_000_000;
    return `${b.toFixed(b >= 10 ? 0 : 1)}B`;
  }
  if (params >= 1_000_000) {
    const m = params / 1_000_000;
    return `${Math.round(m)}M`;
  }
  return `${params}`;
}

const INSTALL_STATUS_VARIANT: Record<InstalledSlm['status'], 'trust' | 'error'> = {
  installed: 'trust',
  failed: 'error'
};

// Phase 2a.1.5 — map discriminated install failure codes to actionable
// user copy. The error code comes from DownloadFailureError in opfs.ts,
// which classifies QuotaExceededError / RangeError / AbortError / network
// loss / OPFS+crypto missing into stable codes the UI can branch on.
// Phase 2a.1.6 — also accept actualDownloadedBytes + quotaSnapshot so
// the message can quote real numbers ("downloaded 800 MB of 1.0 GB before
// failing; browser quota 10 GB, used 53 KB") which helps the user
// understand why a failure that LOOKS like quota exhaustion happens
// even when their quota is plentiful (Chromium internal swap state).
function formatGbCompact(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function mapFailureToUserMessage(
  code: string,
  err: Error,
  pack: SlmModelPack,
  actualDownloadedBytes: number = 0,
  quotaSnapshot?: { quotaBytes: number | null; usageBytes: number | null }
): string {
  const packName = `${pack.family}${pack.variant ? ' · ' + pack.variant : ''}`;
  const progress = actualDownloadedBytes > 0
    ? ` (downloaded ${formatGbCompact(actualDownloadedBytes)} of ${formatGbCompact(pack.diskBytes)} before failing)`
    : '';
  const quotaHint = quotaSnapshot?.quotaBytes != null
    ? ` Browser reports ${formatGbCompact(quotaSnapshot.quotaBytes)} quota, ${formatGbCompact(quotaSnapshot.usageBytes ?? 0)} used.`
    : '';
  switch (code) {
    case 'quota_exceeded':
      return `Install of ${packName} failed: browser storage quota exceeded${progress}.${quotaHint} If the browser shows plenty of quota free, you likely have stale install state — tap "Clear stale install state" below and retry.`;
    case 'oom':
      return `Install of ${packName} failed: phone ran out of memory${progress}. Close other apps + tabs and retry, or pick a smaller pack.`;
    case 'network_aborted':
      return `Install of ${packName} interrupted${progress}: network dropped. Reconnect to WiFi and try again — install is restart-safe.`;
    case 'no_opfs':
      return `Install of ${packName} failed: browser does not support on-device storage. Use Chrome / Edge 102+ on Android, or Safari 17+ on iOS.`;
    case 'no_crypto':
      return `Install of ${packName} failed: browser does not support SHA-256 verification. Use any 2023+ browser release.`;
    case 'no_streaming_fetch':
      return `Install of ${packName} failed: browser cannot stream large downloads. Use Chrome / Edge / Firefox / Safari 17+.`;
    case 'mirror_status':
      return `Install of ${packName} failed: the model mirror returned an error${progress}. Try again in a moment.`;
    case 'no_opfs_dir':
      return `Install of ${packName} failed: could not open browser's private storage. Restart the browser and try again.`;
    default:
      return `Install of ${packName} failed${progress}: ${err.message}`;
  }
}

export function LabsPage() {
  const identity = useActiveIdentity();
  const { data: catalog } = useSlmCatalog();
  const { data: installs = [] } = useInstalledSlms(identity?.id);
  const record = useRecordSlmInstall();
  const remove = useRemoveSlmInstall();
  const show = useToast((s) => s.show);

  // Per-pack install progress for the catalogue tiles.
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // The "Try a prompt" surface — open for one installed pack at a time.
  const [tryingPack, setTryingPack] = useState<{ modelPackId: string; family: string } | null>(null);

  const installedPackIds = new Set(installs.filter((i) => i.status === 'installed').map((i) => i.modelPackId));

  async function handleInstall(pack: SlmModelPack) {
    if (!identity) return;
    if (!opfsSupported()) {
      show('Browser lacks OPFS — install requires Chrome / Edge / Firefox 111+ / Safari 17+.', 'error');
      return;
    }

    // Phase 2a.1.5 — quota preflight. Catches "not enough free space"
    // BEFORE wasting the user's data on a download that can't land.
    // Returns ok=true on browsers that don't expose estimate() — the
    // actual install surfaces the real error.
    const feasibility = await estimateInstallFeasible(pack.diskBytes);
    if (!feasibility.ok) {
      const freeGb = (feasibility.freeBytes / 1_000_000_000).toFixed(1);
      const needGb = (pack.diskBytes / 1_000_000_000).toFixed(1);
      show(
        `Not enough free storage. Need ~${needGb} GB (×1.3 safety margin); your browser has ${freeGb} GB available. Free up some space and try again, or pick the smaller pack.`,
        'error'
      );
      return;
    }

    const ok = window.confirm(
      `Install ${pack.family}${pack.variant ? ' · ' + pack.variant : ''}? ` +
        `Downloads ${formatGb(pack.diskBytes)} from the operator's mirror, ` +
        `SHA-256-verifies against the registry, and stores in your browser's ` +
        `private storage. You can remove it anytime.`
    );
    if (!ok) return;

    setInstalling(pack.modelPackId);
    setProgress(0);
    try {
      const { observedHash, downloadedBytes } = await downloadAndPersist({
        url: pack.sourceUrl,
        modelPackId: pack.modelPackId,
        onProgress: (loaded, total) => {
          setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
        }
      });
      // Server-side createInstalledSlmRecord defends the
      // expected-vs-observed invariant; we pass the observed hash and
      // let the server be the source of truth. If they mismatch the
      // server returns 400 invalid_install_record.
      const verified = observedHash === pack.sourceHash;
      record.mutate(
        {
          identityId: identity.id,
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes,
          status: verified ? 'installed' : 'failed',
          failureReason: verified
            ? undefined
            : `SHA-256 mismatch: expected ${pack.sourceHash}, observed ${observedHash}`,
          observedHash
        },
        {
          onSuccess: () => {
            if (verified) {
              show(`Installed ${pack.family}. Tap "Try a prompt" to test it.`, 'success');
            } else {
              // Discard the corrupted blob from OPFS.
              removeSlmBlob(pack.modelPackId).catch(() => {});
              show('Install failed: SHA-256 mismatch — discarded.', 'error');
            }
          },
          onError: (err: Error) => show(err.message, 'error')
        }
      );
    } catch (err) {
      // Phase 2a.1.5 — discriminated error codes from DownloadFailureError
      // surface as actionable user copy instead of opaque DOMException text.
      // Phase 2a.1.6 — preserve real downloadedBytes + quota snapshot
      // through the error path so the BE install record + the user
      // message both reflect actual progress.
      const failureCode =
        err instanceof DownloadFailureError ? err.failureCode : 'unknown';
      const actualDownloadedBytes =
        err instanceof DownloadFailureError ? err.downloadedBytes : 0;
      const quotaSnapshot =
        err instanceof DownloadFailureError ? err.quotaSnapshot : undefined;
      const userMessage = mapFailureToUserMessage(
        failureCode,
        err as Error,
        pack,
        actualDownloadedBytes,
        quotaSnapshot
      );
      record.mutate(
        {
          identityId: identity.id,
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: actualDownloadedBytes,
          status: 'failed',
          failureReason: `${failureCode}: ${(err as Error).message}`
        },
        {
          onSuccess: () => show(userMessage, 'error')
        }
      );
    } finally {
      setInstalling(null);
      setProgress(0);
    }
  }

  function handleRemove(install: InstalledSlm) {
    if (!identity) return;
    const ok = window.confirm(`Remove ${install.pack?.family ?? install.modelPackId}?`);
    if (!ok) return;
    // Wipe OPFS first; even if the server delete fails we no longer
    // hold the bytes on this device.
    removeSlmBlob(install.modelPackId).catch(() => {});
    // Phase 13.0.0a — also release the shared wllama runtime if it
    // matches the removed pack, so WASM memory is freed without
    // waiting for a page navigation.
    void releaseSharedSlmRuntime(install.modelPackId);
    remove.mutate(
      { identityId: identity.id, installId: install.installId },
      {
        onSuccess: () => show('Install removed.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  async function handleTryPrompt(install: InstalledSlm) {
    // Only allow "Try a prompt" when the bytes are actually in OPFS.
    const blob = await readSlmBlob(install.modelPackId);
    if (!blob) {
      show('Model bytes missing from OPFS. Re-install the pack.', 'error');
      return;
    }
    setTryingPack({
      modelPackId: install.modelPackId,
      family: install.pack?.family ?? install.modelPackId
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Advanced
        </p>
        <h1 className="text-display font-semibold">Labs</h1>
        <p className="mt-2 text-body text-text-muted">
          Features that are not yet on the primary surfaces.
        </p>
      </div>

      {tryingPack && (
        <SlmTryPrompt
          modelPackId={tryingPack.modelPackId}
          family={tryingPack.family}
          onClose={() => setTryingPack(null)}
        />
      )}

      <Card
        title="On-device language model"
        subtitle="Phase 9.0a (registry) + 9.0b (install) + 9.0c (runtime) live. WASM lazy-loaded on first generation."
        actions={catalog && <Badge variant="neutral">{catalog.totalActive} packs available</Badge>}
      >
        {!opfsSupported() && (
          <Card tone="warning" className="mb-4">
            <p className="text-body font-semibold">OPFS not supported</p>
            <p className="text-caption text-text-muted mt-1">
              On-device SLM install needs Origin Private File System: Chrome / Edge,
              Firefox 111+, Safari 17+. Older browsers can still browse the
              catalogue.
            </p>
          </Card>
        )}

        {/* Phase 2a.1.6 — "Clear stale install state" affordance. Visible
            whenever there are failed install records OR a previous install
            attempt left partial OPFS / swap-file state. Wipes every entry
            under the SLM OPFS dir + DELETEs every failed BE install record
            for this identity, so the user can re-attempt cleanly. */}
        {installs.some((i) => i.status === 'failed') && (
          <Card tone="warning" className="mb-4">
            <p className="text-body font-semibold">Stuck install?</p>
            <p className="mt-1 text-caption text-text-muted">
              If a prior install failed mid-flight, the browser may keep a
              stale internal swap file that makes future installs fail with
              "QuotaExceededError" even when storage looks free. This wipes
              all on-device pack state for this identity so you can retry
              cleanly.
            </p>
            <div className="mt-3">
              <Action
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!identity) return;
                  const ok = window.confirm(
                    'Clear ALL on-device SLM state for this identity? You will need to re-download any installed packs.'
                  );
                  if (!ok) return;
                  const removed = await clearAllInstalledPacks();
                  // Best-effort: also delete every failed install record on the BE.
                  for (const i of installs.filter((x) => x.status === 'failed')) {
                    try {
                      remove.mutate({
                        identityId: identity.id,
                        installId: i.installId
                      });
                    } catch {
                      /* best-effort */
                    }
                  }
                  show(
                    `Cleared ${removed} OPFS entr${removed === 1 ? 'y' : 'ies'} + reset failed install records. Retry the install now.`,
                    'success'
                  );
                }}
              >
                Clear stale install state
              </Action>
            </div>
          </Card>
        )}

        {installs.length > 0 && (
          <div className="mb-4 border-b border-border pb-4">
            <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Installed
            </p>
            <ul className="flex flex-col gap-2">
              {installs.map((i) => (
                <li
                  key={i.installId}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border bg-white p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text">
                      {i.pack?.family ?? i.modelPackId}
                      {i.pack?.variant ? ` · ${i.pack.variant}` : ''}
                    </p>
                    <p className="truncate text-caption text-text-muted">
                      {i.runtimeBackend} · {formatGb(i.downloadedBytes)}
                      {i.pack?.status === 'revoked' ? ' · pack revoked since install' : ''}
                      {i.failureReason ? ` · ${i.failureReason}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={INSTALL_STATUS_VARIANT[i.status]}>{i.status}</Badge>
                    {i.status === 'installed' && (
                      <Action variant="trust" size="sm" onClick={() => handleTryPrompt(i)}>
                        Try a prompt
                      </Action>
                    )}
                    <Action variant="ghost" size="sm" onClick={() => handleRemove(i)}>
                      Remove
                    </Action>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Catalogue
        </p>
        {catalog && catalog.modelPacks.length === 0 && (
          <p className="text-body text-text-muted">
            No packs registered yet. Operator admin can register packs via the
            Phase 9.0a admin endpoints.
          </p>
        )}
        <div className="grid gap-2">
          {catalog?.modelPacks.map((pack) => {
            const isInstalling = installing === pack.modelPackId;
            return (
              <div
                key={pack.modelPackId}
                className="rounded-sm border border-border bg-white p-3"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-text">
                    {pack.family}
                    {pack.variant ? ` · ${pack.variant}` : ''}
                  </p>
                  <span className="text-caption uppercase tracking-wide text-text-muted">
                    {pack.runtime.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-caption text-text-muted">
                  {formatBillions(pack.parameterCount)} params · {pack.quantization} ·{' '}
                  {pack.license} · {formatGb(pack.diskBytes)} download
                </p>
                {pack.description && (
                  <p className="mt-1 text-caption text-text-muted">{pack.description}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Action
                    size="sm"
                    disabled={
                      installedPackIds.has(pack.modelPackId) ||
                      record.isPending ||
                      isInstalling
                    }
                    onClick={() => handleInstall(pack)}
                  >
                    {installedPackIds.has(pack.modelPackId)
                      ? 'Already installed'
                      : isInstalling
                        ? `Downloading… ${progress}%`
                        : `Install (${formatGb(pack.diskBytes)})`}
                  </Action>
                </div>
                {isInstalling && (
                  <progress
                    className="mt-2 block h-1 w-full"
                    value={progress}
                    max={100}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Evidence title="How on-device SLMs work">
          When you tap Install, the browser streams the GGUF model from a
          Bharat OS-curated mirror (HTTPS-only). The bytes write straight to
          your browser's Origin Private File System while SHA-256 is computed
          incrementally; on mismatch the blob is discarded and the install
          record stores status:&nbsp;failed honestly. On match, "Try a prompt"
          becomes available: the llama.cpp-wasm runtime lazy-loads from CDN
          on first use, the model loads into WASM memory, and generation
          streams locally. Nothing about your prompt or the response leaves
          your device.
        </Evidence>
      </Card>

      {/* Phase 13.0 adversarial fix MF-1 — key the panel on
          identity.id so a shared-device identity flip forces a full
          remount + unmount cleanup (unloads runtime, GCs lastResult
          / partialText / refs). Prevents citizen B from inheriting
          citizen A's pasted bytes on the same browser. */}
      <DocSummariserPanel
        key={identity?.id ?? 'anon'}
        identityId={identity?.id}
      />

      {/* Phase 13.4 — SLM-H skill agent panel. Subscribes to the
          last-doc-summary bridge; renders nothing until the
          DocSummariserPanel above publishes a parsed
          electricity_bill summary. Keyed on identity for the same
          remount-on-flip protection. */}
      <SkillAgentPanel
        key={`skill-${identity?.id ?? 'anon'}`}
        identityId={identity?.id}
      />

      {/* Phase 13.4.1 — SLM-H ConsumerComplaintPanel. Standalone
          panel (no bridge dependency); the citizen types a
          free-form description and gets a Consumer Protection Act
          2019-shaped complaint draft. Keyed on identity for the
          same remount-on-flip protection. */}
      <ConsumerComplaintPanel
        key={`complaint-${identity?.id ?? 'anon'}`}
        identityId={identity?.id}
      />

      {/* Phase 13.4.2 — SLM-H PmKisanStatusPanel. Standalone
          panel like ConsumerComplaintPanel; the citizen
          describes their PM-KISAN concern and gets guidance on
          the likely blocker + next steps. */}
      <PmKisanStatusPanel
        key={`pmkisan-${identity?.id ?? 'anon'}`}
        identityId={identity?.id}
      />

      {/* Phase 13.5 — Citizen data revenue. Lets the citizen
          publish per-data-point sale offers to Bharat OS sponsors.
          Keyed on identity for the same remount-on-flip protection. */}
      <CitizenDataOffersPanel
        key={`data-offers-${identity?.id ?? 'anon'}`}
        identityId={identity?.id}
      />

      {/* Phase 13.7.2 — Compute network test card. Citizen-side
          dispatch trigger. Polls own sent dispatches; the matching
          worker-side serve UI lives in /settings. */}
      <ComputeNetworkTestCard
        key={`compute-test-${identity?.id ?? 'anon'}`}
        identityId={identity?.id}
      />

      <FederatedRoundsCard
        installedPackIds={installedPackIds}
      />


      <Card title="OCR + health records" subtitle="Phase 2a.8 substrate">
        <p className="text-body text-text-muted">
          Camera capture → on-device OCR via Tesseract.js → ABHA structured
          upload. Original stays encrypted on your phone. Available today
          via the /shell/ developer surface.
        </p>
      </Card>

      <Card title="Voice + TTS" subtitle="Indic Whisper + IndicTTS">
        <p className="text-body text-text-muted">
          Speak your intent in any of 5 Indic languages. Currently surfaced
          via /shell/. Migration to /app/ post-MVP.
        </p>
      </Card>
    </main>
  );
}

// ─── Phase 9.0d federated rounds card ──────────────────────────────

interface FederatedRoundsCardProps {
  installedPackIds: Set<string>;
}

function FederatedRoundsCard({ installedPackIds }: FederatedRoundsCardProps) {
  const identity = useActiveIdentity();
  const { data: rounds = [], isLoading } = useFederatedRounds();
  const submit = useSubmitFederatedUpdate();
  const show = useToast((s) => s.show);
  const [joining, setJoining] = useState<string | null>(null);

  const openRounds = rounds.filter((r) => r.status === 'open');

  async function handleJoin(round: FederatedRound) {
    if (!identity) {
      show('Sign in first.', 'error');
      return;
    }
    if (round.slmModelPackId && !installedPackIds.has(round.slmModelPackId)) {
      show(
        'You need the round’s SLM pack installed first. Scroll up and tap Install.',
        'error'
      );
      return;
    }
    const ok = window.confirm(
      `Join ${round.modelName}? Your phone will compute a local gradient and ` +
        `submit a privacy-noised update. You earn ₹${(round.payoutPaisePerUpdate / 100).toFixed(2)} on accept.`
    );
    if (!ok) return;
    setJoining(round.roundId);
    try {
      // Phase 9.0d — load runtime, compute gradients (stub), submit.
      // For SLM rounds, the worker must have the OPFS bytes; for
      // non-SLM rounds (legacy 216-param classifier) the runtime
      // adapter still gives us a deterministic gradient.
      let runtime;
      if (round.slmModelPackId) {
        const blob = await readSlmBlob(round.slmModelPackId);
        if (!blob) {
          throw new Error('Model bytes missing from OPFS. Re-install the pack.');
        }
        runtime = await loadSlmRuntime({ ggufBytes: blob });
      } else {
        // Non-SLM round: skip runtime load entirely, derive a stub
        // gradient locally. We'd plug Phase 3.1 local-training in
        // here; for the FE+BE parity ship we mimic the same shape.
        runtime = await loadSlmRuntime({
          ggufBytes: new Blob([new Uint8Array([0x47, 0x47, 0x55, 0x46])])
        }).catch(() => null);
      }
      if (!runtime) {
        throw new Error('Could not initialise runtime for this round.');
      }
      const result = await runtime.computeGradients({
        samples: [
          { prompt: 'how do I apply for a small loan', completion: 'tap MFI consent on the Trust tab' },
          { prompt: 'where do I see my earnings', completion: 'Earn tab shows mesh + manual log' }
        ],
        targetTask: round.targetTask ?? round.modelName,
        loraConfig: round.loraConfig,
        epsilon: 0.5
      });

      // Encode gradient bytes for the BE. Make a fresh ArrayBuffer
      // copy so TS sees an ArrayBuffer-typed Uint8Array (not the
      // SharedArrayBuffer-permitting `Uint8Array<ArrayBufferLike>`
      // that Float32Array.buffer returns).
      const ab = new ArrayBuffer(result.vector.byteLength);
      new Uint8Array(ab).set(new Uint8Array(result.vector.buffer));
      const bytes = new Uint8Array(ab);
      const gradientBase64 = btoa(String.fromCharCode(...bytes));
      const hashBuf = await crypto.subtle.digest('SHA-256', ab);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await submit.mutateAsync({
        roundId: round.roundId,
        contributorId: identity.id,
        baselineModelHash: round.baselineModelHash ?? `sha256:${'0'.repeat(64)}`,
        gradientHash: `sha256:${hashHex}`,
        gradientBase64,
        gradientLength: result.vector.length,
        epsilon: result.epsilonSpent,
        sampleCount: result.samples
      });
      await runtime.unload();
      show(
        `Update submitted. ₹${(round.payoutPaisePerUpdate / 100).toFixed(2)} will appear in your Earn balance.`,
        'success'
      );
    } catch (err) {
      show(`Could not submit: ${(err as Error).message}`, 'error');
    } finally {
      setJoining(null);
    }
  }

  return (
    <Card
      title="Federated training rounds"
      subtitle="§7f · earn paise by helping train Bharat OS's models. DP-SGD privacy noise."
      actions={
        openRounds.length > 0 ? (
          <Badge variant="trust">{openRounds.length} open</Badge>
        ) : null
      }
    >
      {isLoading && <p className="text-body text-text-muted">Loading rounds…</p>}
      {!isLoading && openRounds.length === 0 && (
        <p className="text-body text-text-muted">
          No active rounds right now. Sponsors create rounds via the admin API;
          the seed-demo includes a starter round.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {openRounds.map((round) => (
          <FederatedRoundRow
            key={round.roundId}
            round={round}
            installedPackIds={installedPackIds}
            joining={joining}
            onJoin={() => handleJoin(round)}
            submitting={submit.isPending}
          />
        ))}
      </ul>
      <Evidence title="How federated rounds work (Phase 9.0d + 9.1)">
        Sponsors (banks, hospitals, govt) create rounds with a target task
        and a per-update payout, locking the full round budget into an
        escrow at creation time. Workers compute a small gradient locally,
        add DP-SGD privacy noise scaled to their ε budget, and submit
        the noised vector. Bharat OS aggregates updates via FedAvg or hash-
        combiner; per-accepted-update the sponsor's escrow is debited and
        the worker's mesh ledger is credited atomically. Raw gradients
        never leave the device unencrypted; only the aggregate model hash
        is published. v1 ships with a stub gradient computation — real
        LoRA fine-tuning needs a training-capable runtime backend (future
        polish).
      </Evidence>
    </Card>
  );
}

interface FederatedRoundRowProps {
  round: FederatedRound;
  installedPackIds: Set<string>;
  joining: string | null;
  submitting: boolean;
  onJoin: () => void;
}

function FederatedRoundRow({ round, installedPackIds, joining, submitting, onJoin }: FederatedRoundRowProps) {
  const isSlmRound = Boolean(round.slmModelPackId);
  const hasPack = !isSlmRound || installedPackIds.has(round.slmModelPackId!);
  const isJoining = joining === round.roundId;
  const { data: sponsor } = useSponsorDirectory(round.sponsorId);
  const remainingPaise = (round.escrowLockedPaise ?? 0) - (round.escrowDebitedPaise ?? 0);

  return (
    <li className="rounded-sm border border-border bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="font-semibold text-text">{round.modelName}</p>
        <Money paise={round.payoutPaisePerUpdate} size="sm" />
      </div>
      {round.sponsorId && (
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="governance">Sponsored by {sponsor?.displayName ?? round.sponsorId}</Badge>
          {remainingPaise > 0 && (
            <span className="text-caption text-text-muted">
              ₹{(remainingPaise / 100).toFixed(2)} remaining
            </span>
          )}
        </div>
      )}
      <p className="text-caption text-text-muted">
        {isSlmRound ? `SLM · ${round.targetTask ?? 'fine-tune'}` : 'classifier head'}
        {' · '}
        {round.updateCount}/{round.maxParticipants} workers
        {' · ε '}
        {round.epsilonSpent.toFixed(2)}/{round.maxEpsilon.toFixed(2)}
      </p>
      {isSlmRound && !hasPack && (
        <p className="mt-1 text-caption text-error">
          Requires the {round.slmModelPackId} pack — install it above first.
        </p>
      )}
      <Action
        variant="trust"
        size="sm"
        className="mt-2"
        disabled={!hasPack || isJoining || submitting}
        onClick={onJoin}
      >
        {isJoining ? 'Submitting…' : `Join (earn ₹${(round.payoutPaisePerUpdate / 100).toFixed(2)})`}
      </Action>
    </li>
  );
}
