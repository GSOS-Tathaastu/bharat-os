import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Action, Badge, Card, Evidence, useToast } from '@/components/ui';
import { useAuditSignerPublicKey, useSponsorSelf } from '@/lib/hooks';
import { useSponsorAuthStore } from '@/lib/sponsor-auth-store';

const STATUS_VARIANT: Record<string, 'trust' | 'warning' | 'error' | 'neutral'> = {
  active: 'trust',
  suspended: 'warning',
  revoked: 'error'
};

export function SponsorSettings() {
  const { data: sponsor } = useSponsorSelf();
  const audit = useAuditSignerPublicKey();
  const clear = useSponsorAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const show = useToast((s) => s.show);

  function signOut() {
    // Cancel everything in-flight BEFORE clearing the token so no
    // late-landing onSuccess/onError fires against the wrong identity.
    qc.cancelQueries({ predicate: (q) => String(q.queryKey?.[0]).startsWith('sponsor-') });
    clear();
    qc.removeQueries({ predicate: (q) => String(q.queryKey?.[0]).startsWith('sponsor-') });
    navigate('/sponsor/', { replace: true });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      show('Copied.', 'success');
    } catch {
      show('Copy failed. Select manually.', 'error');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Settings
        </p>
        <h1 className="text-display font-semibold">Sponsor</h1>
      </header>

      <Card title="Profile" actions={sponsor && <Badge variant={STATUS_VARIANT[sponsor.status] ?? 'neutral'}>{sponsor.status}</Badge>}>
        {sponsor ? (
          <ul className="space-y-1 text-body">
            <li>
              <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Display name:
              </span>{' '}
              {sponsor.displayName}
            </li>
            <li>
              <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Sponsor ID:
              </span>{' '}
              <span className="font-mono break-all">{sponsor.sponsorId}</span>{' '}
              <button
                type="button"
                onClick={() => copy(sponsor.sponsorId)}
                className="ml-2 rounded-sm border border-border bg-white px-2 py-0.5 text-caption text-text-muted hover:border-primary"
              >
                Copy
              </button>
            </li>
            <li>
              <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Contact email:
              </span>{' '}
              {sponsor.contactEmail ?? '—'}
            </li>
            <li>
              <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Onboarded at:
              </span>{' '}
              {new Date(sponsor.onboardedAt).toLocaleString('en-IN')}
            </li>
          </ul>
        ) : (
          <p className="text-body text-text-muted">Loading…</p>
        )}
        <Evidence title="Why can't I edit my profile?">
          Sponsor records are issued by Bharat OS admins; displayName +
          contactEmail are set at onboarding. To change them, ask your admin to
          re-onboard (which generates a new bearer token + a new sponsorId).
        </Evidence>
      </Card>

      <Card title="Audit signer (Phase 10.5)" tone="trust">
        <p className="text-body text-text-muted">
          Every signed labeling-export bundle from any sponsor is signed by the
          same Bharat OS audit signer. Copy this public key to your audit
          pipeline so you can verify offline.
        </p>
        {audit.data ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-caption text-text">
              Public key (Ed25519 PEM)
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-sm border border-border bg-surface-2 p-2 text-xs">
              {audit.data.publicKeyPem}
            </pre>
            <button
              type="button"
              onClick={() => copy(audit.data!.publicKeyPem)}
              className="mt-2 rounded-sm border border-border bg-white px-3 py-1 text-caption text-text-muted hover:border-primary"
            >
              Copy PEM
            </button>
          </details>
        ) : (
          <p className="mt-2 text-caption text-text-muted">Loading…</p>
        )}
      </Card>

      <Card title="Session" tone="warning">
        <p className="text-body text-text-muted">
          Sign out wipes the bearer token from this device + clears every
          sponsor-scoped cache entry. The token itself stays valid server-side
          until you re-paste it.
        </p>
        <Action className="mt-3" variant="destructive" onClick={signOut}>
          Sign out
        </Action>
      </Card>
    </main>
  );
}
