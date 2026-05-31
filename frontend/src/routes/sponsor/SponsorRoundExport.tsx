import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Action, Badge, Card, Evidence, useToast } from '@/components/ui';
import { useSponsorRoundExport, useSponsorRounds } from '@/lib/hooks';

export function SponsorRoundExport() {
  const { roundId } = useParams<{ roundId: string }>();
  const { data: rounds = [] } = useSponsorRounds();
  const round = rounds.find((r) => r.roundId === roundId);
  const exportRound = useSponsorRoundExport();
  const show = useToast((s) => s.show);
  const [downloaded, setDownloaded] = useState(false);

  function handleDownload() {
    if (!roundId) return;
    exportRound.mutate(
      { roundId },
      {
        onSuccess: (res) => {
          const url = URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          setDownloaded(true);
          show(`Downloaded ${res.lines.length} lines.`, 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Card tone="warning">
          <p className="text-body">Round not found.</p>
          <Link to="/sponsor/rounds" className="mt-2 inline-block">
            <Action size="sm">Back to rounds</Action>
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Round audit
          </p>
          <h1 className="text-display font-semibold">{round.modelName}</h1>
        </div>
        <Link to={`/sponsor/rounds/${encodeURIComponent(round.roundId)}`}>
          <Action variant="ghost" size="sm">
            ← Round
          </Action>
        </Link>
      </header>

      <Card tone="warning">
        <Badge variant="warning">unsigned (Phase 9.1)</Badge>
        <p className="mt-2 text-body">
          Federated-round exports today are NDJSON without a trailer signature
          (the Phase 10.5 signing pattern lands for federated rounds in a
          future phase). The bundle still rotates worker identityHash per
          (round, worker) so cross-round correlation is prevented.
        </p>
      </Card>

      <Card>
        <Action onClick={handleDownload} disabled={exportRound.isPending}>
          {exportRound.isPending ? 'Preparing…' : 'Download round NDJSON'}
        </Action>
        {downloaded && (
          <p className="mt-2 text-caption text-trust-700">Bundle saved.</p>
        )}
      </Card>

      <Evidence title="What is in the bundle?">
        One line per accepted gradient update with{' '}
        <span className="font-mono">{`{updateId, roundId, sponsorId, identityHash, gradientHash, differentialPrivacyEpsilon, sampleCount, acceptedAt, payoutPaise}`}</span>
        . Phase 9.1: gradient bytes never leave the contributor's device unless
        the round uses <span className="font-mono">fedavg</span> mode AND the
        worker granted a separate consent.
      </Evidence>
    </main>
  );
}
