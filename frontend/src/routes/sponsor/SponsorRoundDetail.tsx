import { Link, useParams } from 'react-router-dom';
import { Action, Badge, Card, Money, Stat } from '@/components/ui';
import { useSponsorRounds } from '@/lib/hooks';

export function SponsorRoundDetail() {
  const { roundId } = useParams<{ roundId: string }>();
  const { data: rounds = [] } = useSponsorRounds();
  const round = rounds.find((r) => r.roundId === roundId);

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
            Round
          </p>
          <h1 className="text-display font-semibold">{round.modelName}</h1>
          <p className="mt-1 font-mono text-caption text-text-muted">
            {round.roundId.replace(/^bos:federated-round:/, '')}
          </p>
        </div>
        <Badge variant="trust">{round.status}</Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat
            label="Participants"
            value={`${round.updateCount ?? 0}/${round.maxParticipants}`}
            delta={`${round.aggregationMode}`}
          />
        </Card>
        <Card>
          <Stat
            label="Per update"
            value={<Money paise={round.payoutPaisePerUpdate} size="md" />}
            delta={`max ε ${round.maxEpsilon ?? '?'}`}
          />
        </Card>
        <Card>
          <Stat
            label="Privacy spent"
            value={`${(round.epsilonSpent ?? 0).toFixed(3)} ε`}
            delta={`Deadline ${new Date(round.deadlineAt).toLocaleString('en-IN')}`}
          />
        </Card>
      </div>

      <Card title="Plan">
        <ul className="space-y-1 text-body">
          <li>
            <span className="font-mono text-text-muted">Baseline hash:</span>{' '}
            <span className="break-all font-mono text-caption">{round.baselineModelHash}</span>
          </li>
          {round.aggregatedModelHash && (
            <li>
              <span className="font-mono text-text-muted">Aggregated hash:</span>{' '}
              <span className="break-all font-mono text-caption">{round.aggregatedModelHash}</span>
            </li>
          )}
          {round.slmModelPackId && (
            <li>
              <span className="font-mono text-text-muted">SLM pack:</span>{' '}
              <span className="font-mono">{round.slmModelPackId}</span>
            </li>
          )}
          {round.targetTask && (
            <li>
              <span className="font-mono text-text-muted">Target task:</span>{' '}
              <span className="font-mono">{round.targetTask}</span>
            </li>
          )}
        </ul>
      </Card>

      <Link to={`/sponsor/rounds/${encodeURIComponent(round.roundId)}/export`}>
        <Action variant="secondary">Download round NDJSON</Action>
      </Link>
    </main>
  );
}
