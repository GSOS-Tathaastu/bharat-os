import { Link } from 'react-router-dom';
import { Action, Badge, Card, Money } from '@/components/ui';
import { useSponsorRounds } from '@/lib/hooks';

export function SponsorRoundsList() {
  const { data: rounds = [], isPending } = useSponsorRounds();
  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Federated rounds
          </p>
          <h1 className="text-display font-semibold">Your rounds</h1>
        </div>
        <Link to="/sponsor/rounds/new">
          <Action>+ New federated round</Action>
        </Link>
      </header>
      {isPending ? (
        <Card>
          <p className="text-body text-text-muted">Loading…</p>
        </Card>
      ) : rounds.length === 0 ? (
        <Card tone="trust">
          <p className="text-body font-semibold">No federated rounds yet.</p>
          <p className="mt-1 text-body text-text-muted">
            Start one to crowd-source gradient updates from Bharat OS workers
            (Phase 9.1).
          </p>
          <Link to="/sponsor/rounds/new" className="mt-3 inline-block">
            <Action size="sm">Create a round</Action>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rounds.map((round) => (
            <li key={round.roundId}>
              <Link to={`/sponsor/rounds/${encodeURIComponent(round.roundId)}`}>
                <Card className="hover:border-primary transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">{round.modelName}</p>
                      <p className="mt-1 text-caption text-text-muted">
                        <span className="font-mono">
                          {round.roundId.replace(/^bos:federated-round:/, '')}
                        </span>
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        {round.aggregationMode} · max {round.maxParticipants} · updates{' '}
                        {round.updateCount ?? 0}
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        Pays <Money paise={round.payoutPaisePerUpdate} size="sm" /> per accepted
                        update
                      </p>
                    </div>
                    <Badge variant="trust">{round.status}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
