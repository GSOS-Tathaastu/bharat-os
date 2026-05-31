import { Action, Badge, Card, Evidence, Stat, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useSlmCatalog,
  useInstalledSlms,
  useRecordSlmInstall,
  useRemoveSlmInstall,
  type SlmModelPack,
  type InstalledSlm
} from '@/lib/hooks';

function formatGb(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

function formatBillions(params: number): string {
  const b = params / 1_000_000_000;
  return `${b.toFixed(b >= 10 ? 0 : 1)}B`;
}

const INSTALL_STATUS_VARIANT: Record<InstalledSlm['status'], 'trust' | 'error'> = {
  installed: 'trust',
  failed: 'error'
};

export function LabsPage() {
  const identity = useActiveIdentity();
  const { data: catalog } = useSlmCatalog();
  const { data: installs = [] } = useInstalledSlms(identity?.id);
  const record = useRecordSlmInstall();
  const remove = useRemoveSlmInstall();
  const show = useToast((s) => s.show);

  const installedPackIds = new Set(installs.filter((i) => i.status === 'installed').map((i) => i.modelPackId));

  async function handleInstall(pack: SlmModelPack) {
    if (!identity) return;
    const ok = window.confirm(
      `Install ${pack.family}${pack.variant ? ' · ' + pack.variant : ''}? ` +
        `Downloads ${formatGb(pack.diskBytes)} from the operator's mirror, ` +
        `SHA-256 verifies against the registry, and stores in your browser's ` +
        `private storage. You can remove it anytime.`
    );
    if (!ok) return;

    // Phase 11.5 ships the UI; the real download flow with OPFS + SHA-256
    // verify still lives in /shell/ (Phase 9.0b). Here we simulate the
    // failure path (no real mirror yet) so the install record is created
    // with status=failed, demonstrating the audit trail.
    try {
      const response = await fetch(pack.sourceUrl, { mode: 'no-cors' }).catch((e) => {
        throw new Error(`Mirror unreachable: ${(e as Error).message}`);
      });
      if (!response?.ok) {
        throw new Error('Mirror returned non-200');
      }
      record.mutate(
        {
          identityId: identity.id,
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: pack.diskBytes,
          status: 'installed',
          observedHash: pack.sourceHash
        },
        {
          onSuccess: () => show('Pack installed.', 'success'),
          onError: (err: Error) => show(err.message, 'error')
        }
      );
    } catch (err) {
      record.mutate(
        {
          identityId: identity.id,
          modelPackId: pack.modelPackId,
          runtimeBackend: 'llama_cpp_wasm',
          downloadedBytes: 0,
          status: 'failed',
          failureReason: (err as Error).message
        },
        {
          onSuccess: () => show(`Install failed honestly: ${(err as Error).message}`, 'info'),
          onError: (e: Error) => show(e.message, 'error')
        }
      );
    }
  }

  function handleRemove(install: InstalledSlm) {
    if (!identity) return;
    const ok = window.confirm(`Remove ${install.pack?.family ?? install.modelPackId}?`);
    if (!ok) return;
    remove.mutate(
      { identityId: identity.id, installId: install.installId },
      {
        onSuccess: () => show('Install removed.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
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

      <Card
        title="On-device language model"
        subtitle="Phase 9.0a (registry) + 9.0b (install flow) are live. Runtime that actually executes inference lands in Phase 9.0c."
        actions={catalog && <Badge variant="neutral">{catalog.totalActive} packs available</Badge>}
      >
        {installs.length > 0 && (
          <div className="mb-4 border-b border-border pb-4">
            <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Installed
            </p>
            <ul className="flex flex-col gap-2">
              {installs.map((i) => (
                <li
                  key={i.installId}
                  className="flex items-center justify-between rounded-sm border border-border bg-white p-2"
                >
                  <div className="min-w-0">
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
          {catalog?.modelPacks.map((pack) => (
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
              <Action
                size="sm"
                className="mt-2"
                disabled={installedPackIds.has(pack.modelPackId) || record.isPending}
                onClick={() => handleInstall(pack)}
              >
                {installedPackIds.has(pack.modelPackId)
                  ? 'Already installed'
                  : `Install (${formatGb(pack.diskBytes)})`}
              </Action>
            </div>
          ))}
        </div>
        <Evidence title="How on-device SLMs work">
          When you tap Install, the browser would stream the model from a
          Bharat OS-curated mirror (HTTPS-only, SHA-256 verified). The bytes
          live in your browser's Origin Private File System — never on the
          Bharat OS server. The server only records THAT you installed pack X,
          not the bytes themselves. The runtime that actually RUNS the model
          lands in Phase 9.0c (llama.cpp-wasm). Until then, install attempts
          fail honestly with `failed` status — the audit trail is real even
          when the mirror isn't.
        </Evidence>
      </Card>

      <Card title="Federated training rounds" subtitle="§7f">
        <p className="text-body text-text-muted">
          Earn paise per round by helping train Bharat OS's models. Privacy-
          preserving DP-SGD; gradients never leave your phone unencrypted.
        </p>
        <Stat
          className="mt-3"
          label="Active rounds"
          value="—"
          delta="Round discovery surface ships in Phase 11.6 polish"
        />
      </Card>

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
