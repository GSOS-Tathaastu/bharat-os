import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { useSponsorAuthStore } from '@/lib/sponsor-auth-store';
import { useSponsorSelf } from '@/lib/hooks';

const STATUS_VARIANT: Record<string, 'trust' | 'warning' | 'error'> = {
  active: 'trust',
  suspended: 'warning',
  revoked: 'error'
};

export function SponsorTopBar() {
  const { data: sponsor } = useSponsorSelf();
  const clear = useSponsorAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const qc = useQueryClient();

  function signOut() {
    // Cancel everything in-flight BEFORE clearing the token so no
    // late-landing onSuccess/onError fires against the now-cleared
    // identity (would briefly leak old-sponsor invalidations into a
    // freshly-signed-in different sponsor).
    qc.cancelQueries({ predicate: (q) => String(q.queryKey?.[0]).startsWith('sponsor-') });
    clear();
    qc.removeQueries({ predicate: (q) => String(q.queryKey?.[0]).startsWith('sponsor-') });
    navigate('/sponsor/', { replace: true });
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link to="/sponsor/dashboard" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-white font-semibold">
            ⚒
          </span>
          <span className="hidden sm:inline text-heading font-semibold">Sponsor console</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {sponsor && (
            <>
              <span className="hidden sm:inline text-caption text-text-muted">
                {sponsor.displayName}
              </span>
              <Badge variant={STATUS_VARIANT[sponsor.status] ?? 'neutral'}>
                {sponsor.status}
              </Badge>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            className="rounded-sm border border-border bg-white px-3 py-1 text-caption text-text-muted hover:border-error hover:text-error"
            aria-label="Sign out of sponsor console"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
