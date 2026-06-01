import { Link } from 'react-router-dom';
import { Action, Badge, Card } from '@/components/ui';
import { useProviderContextStore } from '@/lib/provider-context-store';
import { formatRateBasis } from '@/lib/format-paise';
import type { ProviderIdentity } from '@/lib/hooks';

interface ProviderProfileProps {
  provider: ProviderIdentity;
  ownedActive: ProviderIdentity[];
}

export function ProviderProfile({ provider, ownedActive }: ProviderProfileProps) {
  const setActive = useProviderContextStore((s) => s.setActiveProvider);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <header>
        <h1 className="text-display font-semibold">Profile</h1>
        <p className="mt-1 text-body text-text-muted">
          Profile basics + which provider hat you&rsquo;re wearing.
        </p>
      </header>

      <Card title={provider.displayName}>
        <div className="flex flex-wrap gap-2">
          <Badge variant="trust">KYC {provider.kycLevel}</Badge>
          <Badge variant="governance">{provider.status}</Badge>
          {provider.kycLevel1Submission && (
            <Badge variant="pending">KYC L1 submitted</Badge>
          )}
        </div>
        {provider.status === 'draft' && !provider.kycLevel1Submission && (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-body text-text">
              Your provider profile is still a draft. Complete a quick KYC
              Level 1 record so an operator can review and activate it.
            </p>
            <div className="mt-2">
              <Link to={`/onboarding/kyc-level-1?providerId=${encodeURIComponent(provider.providerIdentityId)}&returnTo=/provider`}>
                <Action>Complete KYC Level 1</Action>
              </Link>
            </div>
          </div>
        )}
        {provider.status === 'draft' && provider.kycLevel1Submission && (() => {
          const wasRejected = Boolean(
            provider.lastTransition
            && provider.lastTransition.from === 'submitted'
            && provider.lastTransition.to === 'draft'
          );
          return wasRejected ? (
            <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
              <p className="text-body text-text">
                An operator sent your KYC submission back for changes.
                {provider.lastTransition?.reason ? (
                  <> Reason: <em>&ldquo;{provider.lastTransition.reason}&rdquo;</em></>
                ) : null}
              </p>
              <div className="mt-2">
                <Link to={`/onboarding/kyc-level-1?providerId=${encodeURIComponent(provider.providerIdentityId)}&returnTo=/provider`}>
                  <Action>Edit and resubmit</Action>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-trust-100 bg-trust-50 p-3">
              <p className="text-body text-text">
                KYC Level 1 submitted on{' '}
                {new Date(provider.kycLevel1Submission.submittedAt).toLocaleDateString()}.
                An operator will review and elevate your profile.
              </p>
              <div className="mt-2">
                <Link to={`/onboarding/kyc-level-1?providerId=${encodeURIComponent(provider.providerIdentityId)}&returnTo=/provider`}>
                  <Action variant="ghost">Edit submission</Action>
                </Link>
              </div>
            </div>
          );
        })()}
        {provider.ratePaisePerHour > 0 && (
          <p className="mt-2 text-body text-text">
            {formatRateBasis(provider.ratePaisePerHour, 'per-hour')}
          </p>
        )}
        {provider.ratePaisePerService > 0 && (
          <p className="text-body text-text">
            {formatRateBasis(provider.ratePaisePerService, 'per-service')}
          </p>
        )}
        {provider.description && (
          <p className="mt-2 text-body text-text-muted">{provider.description}</p>
        )}
      </Card>

      {ownedActive.length > 1 && (
        <Card title="Switch hat">
          <div className="space-y-2">
            {ownedActive.map((p) => (
              <button
                key={p.providerIdentityId}
                type="button"
                onClick={() => setActive(p.providerIdentityId)}
                className={
                  'flex w-full items-center justify-between rounded-md border p-2 text-left ' +
                  (p.providerIdentityId === provider.providerIdentityId
                    ? 'border-accent bg-trust-50'
                    : 'border-border')
                }
              >
                <span className="text-body text-text">{p.displayName}</span>
                <span className="text-caption text-text-muted">{p.roleKind}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="text-body text-text-muted">
          Profile edits + KYC re-attestation live on the onboarding
          form for now (per-role wizards ship in Phase 12.2).
        </p>
        <div className="mt-2">
          <Link to={`/earn/provider-onboarding?role=${encodeURIComponent(provider.roleKind)}`}>
            <Action variant="ghost">Edit on onboarding form</Action>
          </Link>
        </div>
      </Card>
    </main>
  );
}
