import { Action, Badge, Card, Evidence, Stat } from '@/components/ui';
import { useActiveIdentity, useTrustPassport } from '@/lib/hooks';

export function WorkerTrust() {
  const identity = useActiveIdentity();
  const { data: passport } = useTrustPassport(identity?.id);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <h1 className="text-display font-semibold">Trust Passport</h1>

      <Card tone="trust" title="Your verified profile" actions={<Badge variant="trust">{passport?.level ?? '—'}</Badge>}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Verified IDs" value={passport?.verifiedAttestationCount ?? 0} />
          <Stat label="Active consents" value={passport?.activeConsentCount ?? 0} />
          <Stat label="Network standing" value={passport?.netContributionScore ?? '—'} />
        </div>
        <Evidence title="What is a Trust Passport?">
          A pointer-not-payload summary of who has attested to you, what consent
          grants are live, and your net contribution to the mesh. Verifiers
          read this signed snapshot — they never see your raw data.
        </Evidence>
      </Card>

      <Card title="Share income with a lender (MFI)" subtitle="Issue a one-time bundle.">
        <p className="text-body text-text-muted mb-4">
          Bharat OS hands a named MFI a signed summary of your earnings +
          portable attestations + verified memberships. You issue the consent;
          they read it ONCE; it burns. The MFI never sees raw entries.
        </p>
        <Action variant="default" size="md">Issue MFI consent</Action>
      </Card>
    </main>
  );
}
