import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Identity } from './api';
import { useIdentityStore } from './identity-store';

// Phase 11.0 — TanStack Query hooks per surface.
//
// Conventions:
//   query keys are arrays starting with the resource name, then any
//   scoping (identityId, etc). Mutations invalidate the relevant keys
//   on success.

// --- Identity ---------------------------------------------------------
interface IdentitiesResponse {
  identities: Identity[];
}

export function useIdentities() {
  return useQuery({
    queryKey: ['identities'],
    queryFn: () => api<IdentitiesResponse>('/api/identities').then((r) => r.identities)
  });
}

export function useActiveIdentity(): Identity | undefined {
  const id = useIdentityStore((s) => s.activeIdentityId);
  const { data } = useIdentities();
  return data?.find((i) => i.id === id);
}

// --- Mesh balance + summary (Phase 6.0b / 6.1b) ----------------------
interface MeshBalance {
  availablePaise: number;
  unsettledEventCount: number;
  minWithdrawalPaise: number;
}

export function useMeshBalance(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['mesh-balance', identityId],
    queryFn: () => api<MeshBalance>(`/api/identities/${encodeURIComponent(identityId!)}/mesh/balance`),
    enabled: Boolean(identityId)
  });
}

interface MeshSummary {
  month: string;
  totalPaise: number;
  workingDays: number;
  eventCount: number;
  byWorkload: Record<string, { paise: number; eventCount: number }>;
  daily: Array<{ date: string; paise: number; eventCount: number }>;
}

export function useMeshSummary(identityId: string | null | undefined, month?: string) {
  return useQuery({
    queryKey: ['mesh-summary', identityId, month],
    queryFn: () =>
      api<MeshSummary>(
        `/api/identities/${encodeURIComponent(identityId!)}/mesh/summary${
          month ? `?month=${month}` : ''
        }`
      ),
    enabled: Boolean(identityId)
  });
}

// --- Withdrawals (Phase 6.1b) -----------------------------------------
export interface MeshWithdrawal {
  requestId: string;
  status: 'pending' | 'provider_accepted' | 'paid' | 'failed';
  amountPaise: number;
  upiIdMasked: string;
  requestedAt: string;
  providerReference?: string | null;
  failureReason?: string | null;
}

export function useMeshWithdrawals(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['mesh-withdrawals', identityId],
    queryFn: () =>
      api<{ withdrawals: MeshWithdrawal[] }>(
        `/api/identities/${encodeURIComponent(identityId!)}/mesh/withdrawals`
      ).then((r) => r.withdrawals),
    enabled: Boolean(identityId)
  });
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, upiId }: { identityId: string; upiId: string }) =>
      api(`/api/identities/${encodeURIComponent(identityId)}/mesh/withdrawals`, {
        method: 'POST',
        body: JSON.stringify({ upiId })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['mesh-balance', identityId] });
      qc.invalidateQueries({ queryKey: ['mesh-withdrawals', identityId] });
    }
  });
}

// --- Earnings (Phase 6.0a) --------------------------------------------
export interface EarningsEntry {
  entryId: string;
  category: string;
  amountPaise: number;
  hours?: number;
  date: string;
  note?: string;
}

export function useEarnings(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['earnings', identityId],
    queryFn: () =>
      api<{ entries: EarningsEntry[] }>(
        `/api/identities/${encodeURIComponent(identityId!)}/earnings`
      ).then((r) => r.entries),
    enabled: Boolean(identityId)
  });
}

// --- Trust Passport (Phase 1.16+) -------------------------------------
export interface TrustPassport {
  identityId: string;
  level: string;
  verifiedAttestationCount: number;
  activeConsentCount: number;
  netContributionScore?: number;
  computedAt: string;
}

export function useTrustPassport(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['trust-passport', identityId],
    queryFn: () =>
      api<{ trustPassport: TrustPassport }>(
        `/api/trust-passports?identityId=${encodeURIComponent(identityId!)}`
      ).then((r) => r.trustPassport),
    enabled: Boolean(identityId)
  });
}

// --- Orchestrations / recent activity ---------------------------------
export interface Orchestration {
  orchestrationId: string;
  intent: { intentText?: string };
  actionRequest?: { actorId?: string; actionType?: string };
  createdAt: string;
}

export function useRecentOrchestrations(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['orchestrations', identityId],
    queryFn: () =>
      api<{ orchestrations: Orchestration[] }>(`/api/orchestrations`).then((r) =>
        r.orchestrations
          .filter((o) => o.actionRequest?.actorId === identityId)
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 5)
      ),
    enabled: Boolean(identityId)
  });
}

export function useSendIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, intentText }: { identityId: string; intentText: string }) =>
      api('/api/orchestrations', {
        method: 'POST',
        body: JSON.stringify({
          intent: { intentText, locale: 'en-IN' },
          actionRequest: { actorId: identityId }
        })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['orchestrations', identityId] });
    }
  });
}
