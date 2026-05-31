import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Action, Card, Evidence, Field, useToast } from '@/components/ui';
import { useSponsorAuthStore } from '@/lib/sponsor-auth-store';
import { useSponsorSelfProbe } from '@/lib/hooks';

// Phase 12.0.5 — sponsor bearer-token paste form. §15:
//
//   • Bearer token field is type="password" + autoComplete="off" so
//     it doesn't end up in the browser's password manager unless the
//     sponsor explicitly opts in. (Modern browsers may still capture
//     it; trade-off accepted.)
//   • Token is held in local component state ONLY until the probe
//     succeeds — only then does it land in the Zustand store.
//   • Token is NEVER put into a URL/query string.
//   • On 401/403/404 we surface the BE error verbatim inline.

export function SponsorEntryPage() {
  const navigate = useNavigate();
  const setAuth = useSponsorAuthStore((s) => s.setAuth);
  const probe = useSponsorSelfProbe();
  const show = useToast((s) => s.show);

  const [sponsorId, setSponsorId] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!sponsorId.startsWith('bos:sponsor:')) {
      setError('Sponsor ID should look like bos:sponsor:….');
      return;
    }
    if (!token.startsWith('bos:sponsor-token:')) {
      setError('Bearer token should look like bos:sponsor-token:….');
      return;
    }
    probe.mutate(
      { sponsorId: sponsorId.trim(), token: token.trim() },
      {
        onSuccess: ({ sponsor }) => {
          setAuth(sponsor.sponsorId, token.trim());
          show(`Signed in as ${sponsor.displayName}.`, 'success');
          navigate('/sponsor/dashboard', { replace: true });
        },
        onError: (err: Error & { status?: number; code?: string; body?: unknown }) => {
          if (err.status === 401) {
            setError('Token rejected. Double-check the sponsor ID and the token you pasted.');
          } else if (err.status === 403) {
            setError('This sponsor is suspended or revoked. Contact your onboarder.');
          } else if (err.status === 404) {
            setError('Sponsor not found.');
          } else {
            setError(err.message);
          }
        }
      }
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <header className="mb-6 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-white text-heading font-semibold">
          ⚒
        </span>
        <h1 className="mt-3 text-display font-semibold">Sponsor console</h1>
        <p className="mt-1 text-body text-text-muted">
          Bharat OS marketplace — fund labeling + federated rounds.
        </p>
      </header>

      <Card>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field
            label="Sponsor ID"
            placeholder="bos:sponsor:…"
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="font-mono"
          />
          <div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bearer-token" className="text-caption font-semibold text-text">
                Bearer token
              </label>
              <div className="relative">
                <input
                  id="bearer-token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="bos:sponsor-token:…"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-sm border border-border bg-white px-3 pr-16 font-mono text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-white px-2 py-0.5 text-caption text-text-muted hover:border-primary"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-sm bg-error-50 px-3 py-2 text-caption text-error">{error}</p>
          )}

          <Action disabled={probe.isPending} className="w-full">
            {probe.isPending ? 'Signing in…' : 'Sign in'}
          </Action>
        </form>

        <Evidence title="Where do I get a sponsor token?">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              A Bharat OS admin creates your sponsor record and a bearer token
              via <span className="font-mono">POST /api/admin/sponsors</span>.
            </li>
            <li>
              They send the <span className="font-mono">sponsorId</span> +{' '}
              <span className="font-mono">bearerToken</span> to you out-of-band
              (email / secure channel) — the token is shown ONCE at creation
              and only its SHA-256 hash is stored server-side.
            </li>
            <li>Paste both fields here to sign in.</li>
          </ol>
          <p className="mt-3">
            New to Bharat OS? Reach out to the operator who's running this
            deployment to request a sponsor account. A lost token means
            re-onboarding (new sponsorId + new token); there is no reset
            endpoint by design.
          </p>
        </Evidence>
      </Card>

      <p className="mt-4 text-center text-caption text-text-muted">
        Looking for the citizen / worker app?{' '}
        <a className="underline" href="/app/">
          /app/
        </a>
      </p>
    </main>
  );
}
