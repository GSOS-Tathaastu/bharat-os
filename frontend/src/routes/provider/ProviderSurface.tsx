import { useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Action, Card } from '@/components/ui';
import {
  useActiveIdentity,
  useProviderIdentities,
  type ProviderIdentity
} from '@/lib/hooks';
import { useProviderContextStore } from '@/lib/provider-context-store';
import { ProviderBottomNav } from './ProviderBottomNav';
import { ProviderInbox } from './ProviderInbox';
import { ProviderActive } from './ProviderActive';
import { ProviderHistory } from './ProviderHistory';
import { ProviderProfile } from './ProviderProfile';
import { ProviderSettings } from './ProviderSettings';
import { ProviderBookingDetail } from './ProviderBookingDetail';

// Phase 12.1a.2 — Provider surface.
//
// Auth model: root identity (Phase 12.0.1 phone OTP) + provider
// context (which provider-identity hat the citizen is wearing).
// The provider-context-store holds the last-active providerIdentityId
// across sessions; on first hit the surface picks the only active
// profile if there is one, OR shows a picker if there are several,
// OR redirects to /earn if the citizen owns no active provider.
//
// 5-tab bottom nav (Inbox / Active / History / Profile / Settings).
// Inbox is the default landing tab.

function resolveActiveProvider(
  candidates: ProviderIdentity[],
  rememberedId: string | null
): ProviderIdentity | null {
  const active = candidates.filter((p) => p.status === 'active');
  if (active.length === 0) return null;
  if (rememberedId) {
    const match = active.find((p) => p.providerIdentityId === rememberedId);
    if (match) return match;
  }
  return active[0];
}

export function ProviderSurface() {
  const identity = useActiveIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const remembered = useProviderContextStore((s) => s.activeProviderIdentityId);
  const setActive = useProviderContextStore((s) => s.setActiveProvider);
  const providersQuery = useProviderIdentities(identity?.id);

  const activeProvider = useMemo(
    () => resolveActiveProvider(providersQuery.data ?? [], remembered),
    [providersQuery.data, remembered]
  );

  useEffect(() => {
    if (activeProvider && activeProvider.providerIdentityId !== remembered) {
      setActive(activeProvider.providerIdentityId);
    }
  }, [activeProvider, remembered, setActive]);

  if (!identity) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Card tone="warning">
          <p className="text-body">Sign in first.</p>
        </Card>
      </main>
    );
  }

  if (providersQuery.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-body text-text-muted">Loading provider profile…</p>
      </main>
    );
  }

  const ownedActive = (providersQuery.data ?? []).filter((p) => p.status === 'active');

  if (!activeProvider) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-3">
        <Card title="No active provider profile">
          <p className="text-body">
            {ownedActive.length === 0 && (providersQuery.data?.length ?? 0) > 0
              ? 'You have provider profile drafts but none are active yet. An operator must KYC-attest and activate.'
              : 'Create a provider profile first to start accepting marketplace bookings.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Action onClick={() => navigate('/earn/provider-onboarding')}>
              Onboard a profile
            </Action>
            <Action variant="ghost" onClick={() => navigate('/worker')}>
              Back to earn
            </Action>
          </div>
        </Card>
      </main>
    );
  }

  const onIndex = location.pathname === '/provider' || location.pathname === '/provider/';

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="inbox" replace />} />
        <Route path="inbox" element={<ProviderInbox provider={activeProvider} rootIdentityId={identity.id} />} />
        <Route path="active" element={<ProviderActive provider={activeProvider} rootIdentityId={identity.id} />} />
        <Route path="history" element={<ProviderHistory provider={activeProvider} rootIdentityId={identity.id} />} />
        <Route path="profile" element={<ProviderProfile provider={activeProvider} ownedActive={ownedActive} />} />
        <Route path="settings" element={<ProviderSettings provider={activeProvider} />} />
        <Route path="bookings/:bookingId" element={<ProviderBookingDetail provider={activeProvider} rootIdentityId={identity.id} />} />
        <Route path="*" element={<Navigate to="inbox" replace />} />
      </Routes>
      {onIndex ? null : <ProviderBottomNav provider={activeProvider} />}
    </>
  );
}
