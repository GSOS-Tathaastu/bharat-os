import { Tabs, Card, Stat, Money, Action, Badge, Evidence } from '@/components/ui';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import {
  useActiveIdentity,
  useMeshBalance,
  useMeshSummary,
  useMeshWithdrawals,
  useProviderIdentities,
  useTrustPassport
} from '@/lib/hooks';
import { WorkerEarn } from './WorkerEarn';
import { WorkerTrust } from './WorkerTrust';

// Phase 12.0 — provider role labels used in the marketplace card.
// Kept here (not imported from earn-roles) because the role IDs
// on a providerIdentity map 1-to-1 to the providerRoleKind values,
// and we want a stable label even if the catalog tile copy changes.
const PROVIDER_ROLE_SHORT_LABEL: Record<string, string> = {
  'cab-driver': 'Cab / auto driver',
  'personal-driver': 'Personal driver',
  labourers: 'Daily-wage labour',
  'household-help': 'Maid / cook',
  kirana: 'Kirana / shop',
  'skilled-trades': 'Skilled trade'
};

const TABS = [
  { to: '/worker/earn', label: 'Earn', icon: '💼' },
  { to: '/labels', label: 'Labels', icon: '🏷' },
  { to: '/worker/trust', label: 'Trust', icon: '🛡' },
  { to: '/labs', label: 'Labs', icon: '🧪' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

function WorkerOverview() {
  const identity = useActiveIdentity();
  const { data: balance } = useMeshBalance(identity?.id);
  const { data: summary } = useMeshSummary(identity?.id);
  const { data: withdrawals = [] } = useMeshWithdrawals(identity?.id);
  const { data: passport } = useTrustPassport(identity?.id);
  const { data: providerIdentities = [] } = useProviderIdentities(identity?.id);

  const recentWithdrawal = withdrawals[0];
  const monthTotal = summary?.totalPaise ?? 0;
  const hasProviderProfiles = providerIdentities.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <section>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Welcome back
        </p>
        <h1 className="text-display font-semibold text-text">
          {identity?.displayName.split(' ')[0] ?? 'Worker'}
        </h1>
      </section>

      {/* Phase 12.0: two-ledger framing. Same balance underneath; the
          cards split the framing so it's honest that one motion is
          micro-tasks (live since Phase 10.x) and the other is the
          marketplace (substrate live since 12.0; bookings start
          flowing in Phase 12.1a). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          tone="trust"
          title="Micro-task earnings"
          actions={<Badge variant="trust">Live</Badge>}
        >
          <Money paise={monthTotal} size="xl" />
          <p className="mt-2 text-caption text-text-muted">
            Labeling, federated rounds, mesh inference, storage. Already
            paying out to your UPI.
          </p>
          <div className="mt-4 flex gap-2">
            <Link to="/labels">
              <Action variant="trust" size="sm">Find labels</Action>
            </Link>
            <Link to="/labs">
              <Action variant="secondary" size="sm">Federated + inference</Action>
            </Link>
          </div>
        </Card>

        <Card
          tone={hasProviderProfiles ? 'governance' : 'default'}
          title="Marketplace earnings"
          actions={
            <Badge variant={hasProviderProfiles ? 'pending' : 'neutral'}>
              {hasProviderProfiles ? 'Drafts' : 'Not yet set up'}
            </Badge>
          }
        >
          <Money paise={0} size="xl" />
          <p className="mt-2 text-caption text-text-muted">
            Citizens book you direct for cab, driver, labour, household work.
            Bookings flow in Phase 12.1a. No commission, ever.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {hasProviderProfiles ? (
              providerIdentities.map((p) => (
                <Badge key={p.providerIdentityId} variant="pending">
                  {PROVIDER_ROLE_SHORT_LABEL[p.roleKind] ?? p.roleKind} · {p.status}
                </Badge>
              ))
            ) : (
              <Link to="/">
                <Action variant="default" size="sm">Set up provider profile</Action>
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card tone="trust" title="Total earned this month" actions={<Badge variant="trust">UPI</Badge>}>
        <Money paise={monthTotal} size="xl" />
        <p className="mt-2 text-caption text-text-muted">
          {summary?.workingDays ?? 0} working days · {summary?.eventCount ?? 0} mesh events. Across both micro-task and marketplace.
        </p>
        <div className="mt-4 flex gap-2">
          <Action variant="trust" size="md">View earnings</Action>
          <Action variant="secondary" size="md">Cash out</Action>
        </div>
        <Evidence title="What's mesh contribution?">
          When your phone is plugged in and on WiFi, Bharat OS uses spare compute
          + storage for inference, storage-serve, storage-store, and federated
          training rounds (§7f). Each tick pays out in paise. Settles to your UPI.
          Marketplace bookings (Phase 12.1a+) join the same ledger so cash-out
          drains everything in one go.
        </Evidence>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Stat
            label="Available to withdraw"
            value={<Money paise={balance?.availablePaise ?? 0} size="lg" />}
            delta={`${balance?.unsettledEventCount ?? 0} unsettled events`}
          />
          {(balance?.availablePaise ?? 0) > 0 && (
            <Action variant="default" size="md" className="mt-3 w-full">
              Withdraw to UPI
            </Action>
          )}
        </Card>

        <Card>
          <Stat
            label="Trust level"
            value={<span className="text-display">{passport?.level ?? '—'}</span>}
            delta={`${passport?.verifiedAttestationCount ?? 0} verified · ${passport?.activeConsentCount ?? 0} active consents`}
          />
        </Card>
      </div>

      {recentWithdrawal && (
        <Card title="Recent cash-out" subtitle="Most recent withdrawal request">
          <div className="flex items-center justify-between">
            <div>
              <Money paise={recentWithdrawal.amountPaise} size="md" />
              <p className="text-caption text-text-muted">
                {recentWithdrawal.upiIdMasked} · {new Date(recentWithdrawal.requestedAt).toLocaleDateString('en-IN')}
              </p>
            </div>
            <Badge
              variant={
                recentWithdrawal.status === 'paid'
                  ? 'trust'
                  : recentWithdrawal.status === 'failed'
                    ? 'error'
                    : 'pending'
              }
            >
              {recentWithdrawal.status}
            </Badge>
          </div>
        </Card>
      )}
    </main>
  );
}

export function WorkerHome() {
  return (
    <>
      <Routes>
        <Route index element={<Navigate to="earn" replace />} />
        <Route path="earn" element={<WorkerEarn />} />
        <Route path="trust" element={<WorkerTrust />} />
        <Route path="overview" element={<WorkerOverview />} />
        <Route path="*" element={<WorkerOverview />} />
      </Routes>
      <Tabs items={TABS} />
    </>
  );
}
