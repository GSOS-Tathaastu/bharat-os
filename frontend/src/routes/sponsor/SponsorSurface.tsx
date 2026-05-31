import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ToastRoot, useToast } from '@/components/ui';
import { useSponsorAuthStore } from '@/lib/sponsor-auth-store';
import { SponsorTopBar } from '@/components/sponsor/SponsorTopBar';
import { SponsorBottomNav } from '@/components/sponsor/SponsorBottomNav';
import { SponsorEntryPage } from '@/routes/sponsor/SponsorEntryPage';
import { SponsorDashboard } from '@/routes/sponsor/SponsorDashboard';
import { SponsorJobsList } from '@/routes/sponsor/SponsorJobsList';
import { SponsorJobCreate } from '@/routes/sponsor/SponsorJobCreate';
import { SponsorJobDetail } from '@/routes/sponsor/SponsorJobDetail';
import { SponsorReviewQueue } from '@/routes/sponsor/SponsorReviewQueue';
import { SponsorJobExport } from '@/routes/sponsor/SponsorJobExport';
import { SponsorRoundsList } from '@/routes/sponsor/SponsorRoundsList';
import { SponsorRoundCreate } from '@/routes/sponsor/SponsorRoundCreate';
import { SponsorRoundDetail } from '@/routes/sponsor/SponsorRoundDetail';
import { SponsorRoundExport } from '@/routes/sponsor/SponsorRoundExport';
import { SponsorEscrow } from '@/routes/sponsor/SponsorEscrow';
import { SponsorSettings } from '@/routes/sponsor/SponsorSettings';

// Phase 12.0.5 — top-level /app/sponsor/* surface.
//
// Gating rule: if no bearer token is in the Zustand store, render
// the entry page (which paste-captures one). Otherwise mount the
// nested sponsor routes with the sponsor topbar + bottomnav.
//
// Auth guard: subscribe to TanStack Query's error events. Any
// 401/403 from a sponsor-bearer query → clear the store + toast +
// navigate to the entry page.

export function SponsorSurface() {
  const sponsorId = useSponsorAuthStore((s) => s.sponsorId);
  const bearerToken = useSponsorAuthStore((s) => s.bearerToken);
  const clear = useSponsorAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const show = useToast((s) => s.show);

  // Set document title per §15 — never include the sponsor's
  // displayName so a shared-machine tab strip doesn't leak it.
  useEffect(() => {
    const prev = document.title;
    document.title = 'Sponsor console — Bharat OS';
    return () => {
      document.title = prev;
    };
  }, []);

  // Auth guard — react to query failures.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      // TanStack Query v5 emits action.type 'failed' (not 'error'),
      // plus 'success' / 'fetch' / 'invalidate' / etc. We don't
      // filter on action.type — we look at whether the query's
      // CURRENT state carries an error. That works regardless of
      // which transition produced it (initial fetch, refetch, etc.).
      const err = event.query.state.error as
        | (Error & { status?: number; code?: string })
        | undefined
        | null;
      if (!err) return;
      const key = event.query.queryKey?.[0]?.toString() ?? '';
      if (!key.startsWith('sponsor-')) return;
      if (err.status === 401 || err.code === 'invalid_token' || err.code === 'missing_authorization') {
        clear();
        queryClient.removeQueries({
          predicate: (q) => String(q.queryKey?.[0]).startsWith('sponsor-')
        });
        show('Sponsor session ended — paste your bearer token again.', 'error');
        navigate('/sponsor/', { replace: true });
      }
    });
    return () => unsub();
  }, [clear, navigate, queryClient, show]);

  if (!sponsorId || !bearerToken) {
    // No token yet — pin the entry page across every /sponsor/* path.
    return (
      <div className="min-h-dvh bg-white">
        <Routes>
          <Route path="*" element={<SponsorEntryPage />} />
        </Routes>
        <ToastRoot />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-2 pb-20 sm:pb-0">
      <SponsorTopBar />
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SponsorDashboard />} />
        <Route path="jobs" element={<SponsorJobsList />} />
        <Route path="jobs/new" element={<SponsorJobCreate />} />
        <Route path="jobs/:jobId" element={<SponsorJobDetail />} />
        <Route path="jobs/:jobId/review" element={<SponsorReviewQueue />} />
        <Route path="jobs/:jobId/export" element={<SponsorJobExport />} />
        <Route path="rounds" element={<SponsorRoundsList />} />
        <Route path="rounds/new" element={<SponsorRoundCreate />} />
        <Route path="rounds/:roundId" element={<SponsorRoundDetail />} />
        <Route path="rounds/:roundId/export" element={<SponsorRoundExport />} />
        <Route path="escrow" element={<SponsorEscrow />} />
        <Route path="settings" element={<SponsorSettings />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
      <SponsorBottomNav />
    </div>
  );
}
