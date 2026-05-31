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
export interface OrchestrationPlanStep {
  step: string;
  layer?: string;
  status?: string;
  actionType?: string;
  skillId?: string;
  tool?: string;
}

export interface OrchestrationDecision {
  approved?: boolean;
  reasons?: Array<{ code?: string; message?: string }> | string[];
}

export interface ConsentRequirement {
  subjectId?: string;
  granteeId?: string;
  scopes?: string[];
  required?: boolean;
}

export interface Orchestration {
  orchestrationId: string;
  intent: { intentText?: string };
  actionRequest?: { actorId?: string; actionType?: string; skillId?: string };
  skillPreflight?: { approved?: boolean; decision?: OrchestrationDecision };
  decision?: OrchestrationDecision;
  execution?: { status?: string } | null;
  plan?: OrchestrationPlanStep[];
  status?: 'planned' | 'completed' | 'blocked';
  failedPolicies?: string[];
  consentRequirement?: ConsentRequirement;
  localizedResponse?: { text?: string; locale?: string; fallbackUsed?: boolean };
  createdAt: string;
}

export interface SendIntentResponse {
  ok: boolean;
  orchestration: Orchestration;
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

// --- Generic consent grants (Phase 1.3 substrate / Phase 11.8) -------
//
// The orchestrator's `consentRequirement` from a blocked intent
// names {subjectId, granteeId, scopes}. Phase 11.8 wires the
// matching FE: list active consents, grant new ones (signed by
// the citizen so the artifact is authentic), revoke per-row from
// the Trust tab. Auto-re-send after grant happens at the call
// site (CitizenIntent) — once the consent is saved, the next
// orchestration POST sees it via the store's `listConsents`
// pass into `orchestrateIntent`.
export interface ConsentArtifact {
  consentId: string;
  subjectId: string;
  granteeId: string;
  scopes: string[];
  purpose: string;
  status: 'active' | 'revoked' | 'expired';
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revokeReason?: string | null;
  constraints?: Record<string, unknown>;
  lifecycle?: { status: string; active: boolean; reason: string; expiresAt?: string };
}

export function useConsents(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['consents', identityId],
    queryFn: () =>
      api<{ consents: ConsentArtifact[] }>(`/api/consents?subjectId=${encodeURIComponent(identityId!)}`).then((r) =>
        r.consents.filter((c) => c.subjectId === identityId)
      ),
    enabled: Boolean(identityId)
  });
}

export interface GrantConsentInput {
  identityId: string;
  granteeId: string;
  scopes: string[];
  purpose: string;
  ttlDays?: number;
}

/**
 * Phase 11.8 — grant a generic Phase 1.3 consent. Signed by the
 * citizen (subject role) so the artifact is authentic. After this
 * resolves, the caller re-sends the original intent through
 * `useSendIntent`; the orchestrator picks up the new consent from
 * the store and unblocks.
 */
export function useGrantConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, granteeId, scopes, purpose, ttlDays = 30 }: GrantConsentInput) =>
      api<{ ok: boolean; consent: ConsentArtifact }>('/api/consents', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: identityId,
          granteeId,
          scopes,
          purpose,
          ttlDays,
          signWithIdentityId: identityId,
          signRole: 'subject'
        })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['consents', identityId] });
    }
  });
}

export function useRevokeConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      identityId,
      consentId,
      reason
    }: {
      identityId: string;
      consentId: string;
      reason?: string;
    }) =>
      api<{ ok: boolean; consent: ConsentArtifact }>(
        `/api/consents/${encodeURIComponent(consentId)}/revoke`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: reason ?? 'revoked_by_citizen',
            revokedBy: identityId,
            signWithIdentityId: identityId,
            signRole: 'revoker'
          })
        }
      ),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['consents', identityId] });
    }
  });
}

/**
 * Phase 11.7 — citizen intent submit.
 *
 * The BE orchestrator reads `intentText` + `actorId` + `locale` as
 * FLAT keys on the request body (see `buildActionRequest` in
 * src/phase1/orchestrator.mjs). Earlier shape `{intent:{intentText},
 * actionRequest:{actorId}}` silently fell through to the
 * `mesh_storage` fallback and the recent-activity filter on
 * `actionRequest.actorId` never matched — citizens typed "Book a
 * cab" and saw nothing happen.
 */
export function useSendIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, intentText }: { identityId: string; intentText: string }) =>
      api<SendIntentResponse>('/api/orchestrations', {
        method: 'POST',
        body: JSON.stringify({
          intentText,
          actorId: identityId,
          locale: 'en-IN'
        })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['orchestrations', identityId] });
    }
  });
}

// --- MFI consent (Phase 6.1) ------------------------------------------
export interface MfiConsent {
  consentId: string;
  workerId: string;
  mfiName: string;
  purpose: string;
  financialYear: string;
  ttlSeconds: number;
  expiresAt: string;
  maxReads: number;
  readsRemaining: number;
  revokedAt?: string | null;
  revocationReason?: string | null;
  issuedAt: string;
}

export function useMfiConsents(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['mfi-consents', identityId],
    queryFn: () =>
      api<{ consents: MfiConsent[] }>(
        `/api/identities/${encodeURIComponent(identityId!)}/income-verification/consents`
      ).then((r) => r.consents),
    enabled: Boolean(identityId)
  });
}

export interface IssueConsentInput {
  identityId: string;
  mfiName: string;
  purpose: string;
  financialYear: string;
  ttlSeconds: number;
  maxReads: number;
}

export interface IssueConsentResponse {
  ok: true;
  consent: MfiConsent;
  mfiFetchUrl: string;
}

export function useIssueMfiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueConsentInput) =>
      api<IssueConsentResponse>(
        `/api/identities/${encodeURIComponent(input.identityId)}/income-verification/consents`,
        {
          method: 'POST',
          body: JSON.stringify({
            mfiName: input.mfiName,
            purpose: input.purpose,
            financialYear: input.financialYear,
            ttlSeconds: input.ttlSeconds,
            maxReads: input.maxReads
          })
        }
      ),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['mfi-consents', identityId] });
    }
  });
}

export function useRevokeMfiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      identityId,
      consentId,
      reason
    }: {
      identityId: string;
      consentId: string;
      reason: string;
    }) =>
      api(
        `/api/identities/${encodeURIComponent(identityId)}/income-verification/consents/${encodeURIComponent(consentId)}/revoke`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      ),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['mfi-consents', identityId] });
    }
  });
}

// Verifier-side bundle fetch. `useMfiBundle` is read once per consentId;
// the server burns one read counter per call.
export interface MfiBundle {
  status: 'valid' | 'expired' | 'revoked' | 'exhausted' | 'signature_invalid' | 'unknown_worker' | 'malformed';
  consent?: MfiConsent;
  bundle?: {
    workerId: string;
    workerDisplayName: string;
    mfiName: string;
    financialYear: string;
    issuedAt: string;
    aggregates: {
      totalEarningsPaise: number;
      monthsWithIncome: number;
      earningsByMonth: Array<{ month: string; paise: number }>;
    };
    attestations: Array<{ subject: string; claim: string; issuedAt: string }>;
    collectiveMemberships: Array<{ collectiveName: string; role: string; verified: boolean }>;
    eshramRegistrations: Array<{ uanMasked: string; verified: boolean }>;
    schemeEntitlements: Array<{ schemeCode: string; verified: boolean }>;
    signature: string;
    disclaimer: string;
  };
  reason?: string;
}

export function useMfiBundle(consentId: string | null) {
  return useQuery({
    queryKey: ['mfi-bundle', consentId],
    queryFn: () => api<MfiBundle>(`/api/income-verification/${encodeURIComponent(consentId!)}`),
    enabled: Boolean(consentId),
    retry: false,
    staleTime: Infinity // server burns a read; never auto-refetch
  });
}

// --- SLM model packs + installs (Phase 9.0a / 9.0b) ------------------
export interface SlmModelPack {
  modelPackId: string;
  family: string;
  variant?: string | null;
  parameterCount: number;
  quantization: string;
  diskBytes: number;
  ramRequiredMb: number;
  runtime: string;
  sourceUrl: string;
  sourceHash: string;
  license: string;
  capabilities: string[];
  contextWindow?: number | null;
  description?: string | null;
  status: 'registered' | 'revoked';
}

export interface SlmCatalogResponse {
  modelPacks: SlmModelPack[];
  totalRegistered: number;
  totalActive: number;
  supportedRuntimes: string[];
  supportedQuantizations: string[];
  supportedLicenses: string[];
  supportedCapabilities: string[];
}

export function useSlmCatalog() {
  return useQuery({
    queryKey: ['slm-catalog'],
    queryFn: () => api<SlmCatalogResponse>('/api/slm-model-packs?activeOnly=true')
  });
}

export interface InstalledSlm {
  installId: string;
  identityId: string;
  modelPackId: string;
  runtimeBackend: string;
  downloadedBytes: number;
  status: 'installed' | 'failed';
  failureReason?: string | null;
  installedAt: string;
  pack?: {
    family?: string;
    variant?: string;
    quantization?: string;
    parameterCount?: number;
    diskBytes?: number;
    license?: string;
    status?: string;
  } | null;
}

export function useInstalledSlms(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['installed-slms', identityId],
    queryFn: () =>
      api<{ installs: InstalledSlm[] }>(
        `/api/identities/${encodeURIComponent(identityId!)}/installed-slms`
      ).then((r) => r.installs),
    enabled: Boolean(identityId)
  });
}

export function useRecordSlmInstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      identityId,
      modelPackId,
      runtimeBackend,
      downloadedBytes,
      status,
      failureReason,
      observedHash
    }: {
      identityId: string;
      modelPackId: string;
      runtimeBackend: string;
      downloadedBytes: number;
      status: 'installed' | 'failed';
      failureReason?: string;
      observedHash?: string;
    }) =>
      api(`/api/identities/${encodeURIComponent(identityId)}/installed-slms`, {
        method: 'POST',
        body: JSON.stringify({
          modelPackId,
          runtimeBackend,
          downloadedBytes,
          status,
          failureReason,
          observedHash
        })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['installed-slms', identityId] });
    }
  });
}

// --- DPDP §12 export + erasure (Phase 4.0) ----------------------------

export interface ErasurePreview {
  identityId: string;
  sections: Record<string, { count: number; description: string }>;
  warning: string;
}

export function useErasurePreview(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['erasure-preview', identityId],
    queryFn: () =>
      api<ErasurePreview>(`/api/identities/${encodeURIComponent(identityId!)}/erasure-preview`),
    enabled: false // explicit fetch only — opens when user starts the flow
  });
}

export function useDownloadMyData() {
  return useMutation({
    mutationFn: async ({ identityId }: { identityId: string }) => {
      const response = await fetch(
        `/api/identities/${encodeURIComponent(identityId)}/export`
      );
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bharat-os-export-${identityId.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return blob.size;
    }
  });
}

export function useEraseIdentity() {
  return useMutation({
    mutationFn: ({ identityId }: { identityId: string }) =>
      api(`/api/identities/${encodeURIComponent(identityId)}?confirm=YES_DELETE`, {
        method: 'DELETE'
      })
  });
}

export function useRemoveSlmInstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, installId }: { identityId: string; installId: string }) =>
      api(`/api/identities/${encodeURIComponent(identityId)}/installed-slms/${encodeURIComponent(installId)}`, {
        method: 'DELETE'
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['installed-slms', identityId] });
    }
  });
}

// --- Federated rounds (Phase 3.x + 9.0d SLM extension) ---------------
export interface FederatedRound {
  roundId: string;
  status: 'created' | 'open' | 'closed' | 'completed' | 'expired';
  modelName: string;
  createdBy: string;
  baselineModelHash: string;
  maxParticipants: number;
  updateCount: number;
  maxEpsilon: number;
  epsilonSpent: number;
  payoutPaisePerUpdate: number;
  deadlineAt: string;
  // Phase 9.0d additions:
  slmModelPackId?: string | null;
  targetTask?: string | null;
  loraConfig?: unknown;
  // Phase 9.1 additions:
  sponsorId?: string | null;
  escrowLockedPaise?: number;
  escrowDebitedPaise?: number;
}

export interface SponsorDirectoryEntry {
  sponsorId: string;
  displayName: string;
  status: 'active' | 'suspended' | 'revoked';
}

// Phase 9.1 — public sponsor directory lookup. Returns sponsor name
// + status only (no escrow numbers). Used by the FE rounds card to
// render "Sponsored by X" badges.
export function useSponsorDirectory(sponsorId: string | null | undefined) {
  return useQuery({
    queryKey: ['sponsor-directory', sponsorId],
    queryFn: () =>
      api<{ sponsor: SponsorDirectoryEntry }>(`/api/sponsors/${encodeURIComponent(sponsorId!)}`).then(
        (r) => r.sponsor
      ),
    enabled: Boolean(sponsorId),
    staleTime: 5 * 60 * 1000 // sponsor display names don't churn
  });
}

// --- Phase 10 labeling marketplace ----------------------------------

export type LabelingTaskKind =
  | 'preference_pair'
  | 'classification'
  | 'span_annotation'
  | 'transcription'
  | 'safety_label';

export interface LabelingJobSurface {
  jobId: string;
  sponsorId: string;
  taskKind: LabelingTaskKind;
  language: string;
  modality: 'text' | 'voice' | 'image';
  perLabelPaise: number;
  description: string | null;
  itemCount: number;
  submissionsAccepted: number;
  deadlineAt: string;
}

export interface LabelingJobItem {
  itemId: string;
  jobId: string;
  taskKind: LabelingTaskKind;
  body: unknown;
}

export function useLabelingJobs(language?: string) {
  return useQuery({
    queryKey: ['labeling-jobs', language],
    queryFn: () =>
      api<{ jobs: LabelingJobSurface[] }>(
        `/api/labeling-jobs${language ? `?language=${encodeURIComponent(language)}` : ''}`
      ).then((r) => r.jobs)
  });
}

export interface NextItemResponse {
  item: LabelingJobItem | null;
  reason?: 'no_eligible_items' | 'below_worker_score_gate';
  workerScore?: number;
  gate?: number;
}

export function useLabelingNextItem(jobId: string | null, workerId: string | null | undefined) {
  return useQuery({
    queryKey: ['labeling-next-item', jobId, workerId],
    queryFn: () =>
      api<NextItemResponse>(
        `/api/labeling-jobs/${encodeURIComponent(jobId!)}/next-item?workerId=${encodeURIComponent(workerId!)}`
      ),
    enabled: Boolean(jobId && workerId),
    staleTime: 0
  });
}

// Phase 10.4 — sponsor-side QC verdict + worker score returned on
// every submit. FE renders an honest verdict line ("Accepted",
// "Sampled for sponsor review", "Golden-set mismatch — no payout").
export type QcVerdict = 'accepted' | 'sampled_for_sponsor_review' | 'golden_set_mismatch';

export interface SubmitLabelResponse {
  ok: true;
  submission: { submissionId: string; jobId: string; itemId: string; status: string };
  meshContributionEvent: { payoutPaise: number } | null;
  workerScore: number;
  qcVerdict: QcVerdict;
}

export function useSubmitLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      itemId,
      workerId,
      labelValue
    }: {
      jobId: string;
      itemId: string;
      workerId: string;
      labelValue: unknown;
    }) =>
      api<SubmitLabelResponse>(`/api/labeling-jobs/${encodeURIComponent(jobId)}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ itemId, workerId, labelValue })
      }),
    onSuccess: (_data, { workerId, jobId }) => {
      qc.invalidateQueries({ queryKey: ['labeling-next-item', jobId, workerId] });
      qc.invalidateQueries({ queryKey: ['labeling-jobs'] });
      qc.invalidateQueries({ queryKey: ['mesh-balance', workerId] });
      qc.invalidateQueries({ queryKey: ['mesh-summary', workerId] });
      qc.invalidateQueries({ queryKey: ['labeling-stats', workerId] });
    }
  });
}

// Phase 10.4 — worker-facing labeling stats. Used by the Labels
// page to render "Your score: 0.92" + per-job acceptance breakdown.
export interface LabelingStatsResponse {
  identityId: string;
  overall: {
    submissionCount: number;
    score: number;
  };
  perJob: Array<{
    jobId: string;
    submissionCount: number;
    acceptedCount: number;
    pendingReviewCount: number;
    rejectedCount: number;
    score: number;
  }>;
}

export function useLabelingStats(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['labeling-stats', identityId],
    queryFn: () =>
      api<LabelingStatsResponse>(
        `/api/identities/${encodeURIComponent(identityId!)}/labeling-stats`
      ),
    enabled: Boolean(identityId)
  });
}

// --- Phase 12.0.3 worker sweep: e-Shram + schemes + tax + collective
// memberships + trust attestation mint --------------------------------

export interface EshramRegistration {
  registrationId: string;
  issuerId: string;
  memberId: string;
  issuerName?: string;
  uanMasked: string;
  occupationCategory: string;
  occupationDetail?: string;
  state?: string;
  district?: string;
  educationLevel: string;
  monthlyIncomeBracket?: string;
  ncoCode?: string;
  registeredAt: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  revokedAt?: string | null;
}

export function useEshramRegistrations(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ['eshram-registrations', memberId],
    queryFn: () =>
      api<{ registrations: EshramRegistration[] }>(
        `/api/identities/${encodeURIComponent(memberId!)}/eshram-registrations`
      ).then((r) =>
        r.registrations
          .filter((reg) => reg.status === 'active')
          .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)))
      ),
    enabled: Boolean(memberId)
  });
}

export interface SchemeEntitlement {
  entitlementId: string;
  issuerId: string;
  memberId: string;
  issuerName?: string;
  schemeCode: string;
  schemeName: string;
  monetaryBenefitPaise?: number;
  benefitFrequency?: string;
  cycleStart?: string;
  cycleEnd?: string;
  eligibilityNote?: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
}

export function useSchemeEntitlements(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ['scheme-entitlements', memberId],
    queryFn: () =>
      api<{ entitlements: SchemeEntitlement[] }>(
        `/api/identities/${encodeURIComponent(memberId!)}/scheme-entitlements`
      ).then((r) =>
        r.entitlements
          .filter((e) => e.status === 'active')
          .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)))
      ),
    enabled: Boolean(memberId)
  });
}

export interface TaxSummaryWindow {
  fromIso: string;
  toIso: string;
}

export interface TaxRegimeOption {
  label: string;
  taxableIncomePaise: number;
  estimatedTaxPaise: number;
}

export interface TaxSummary {
  protocolVersion: string;
  financialYear: string;
  window: TaxSummaryWindow;
  entryCount: number;
  grossIncomePaise: number;
  grossIncomeRupees: number;
  newRegime: TaxRegimeOption;
  oldRegime: TaxRegimeOption;
  presumptive44AD?: TaxRegimeOption;
  gst?: { applicable: boolean; estimatedPayablePaise?: number };
  recommendation: {
    cheapestOption: string;
    cheapestTaxPaise: number;
    allOptions: TaxRegimeOption[];
  };
  disclaimer: string;
}

export function useTaxSummary(
  identityId: string | null | undefined,
  financialYear: string
) {
  return useQuery({
    queryKey: ['tax-summary', identityId, financialYear],
    queryFn: () =>
      api<{ summary: TaxSummary }>(
        `/api/identities/${encodeURIComponent(identityId!)}/tax/summary?financialYear=${encodeURIComponent(financialYear)}`
      ).then((r) => r.summary),
    enabled: Boolean(identityId && financialYear)
  });
}

export interface CollectiveMembership {
  membershipId: string;
  collectiveId: string;
  collectiveName: string;
  memberId: string;
  memberRole: string;
  region?: string;
  joinedAt?: string | null;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  revokedAt?: string | null;
  revokedReason?: string | null;
}

export function useCollectiveMemberships(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ['collective-memberships', memberId],
    queryFn: () =>
      api<{ memberships: CollectiveMembership[] }>(
        `/api/identities/${encodeURIComponent(memberId!)}/collective-memberships?status=active`
      ).then((r) => r.memberships),
    enabled: Boolean(memberId)
  });
}

/**
 * Phase 12.0.3 — mint a Trust Passport attestation about yourself.
 * The orchestrator's `trust_attestation` action type composes a
 * signed, selective-disclosure attestation envelope; a sponsor /
 * landlord / lender reads it via /verify/.
 */
export interface MintAttestationInput {
  identityId: string;
  /** Free-form what-they-want-to-verify, e.g. "rental application". */
  reason: string;
  /** Which Trust Passport fields to expose (bands / booleans). */
  discloseScopes?: string[];
}

export function useMintTrustAttestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MintAttestationInput) =>
      api<SendIntentResponse & { attestation?: { attestationId?: string } }>(
        '/api/orchestrations',
        {
          method: 'POST',
          body: JSON.stringify({
            actionType: 'trust_attestation',
            actorId: input.identityId,
            intentText: input.reason,
            execute: true,
            scopes: ['trust.attest', 'consent.record'],
            metadata: {
              discloseScopes: input.discloseScopes ?? []
            }
          })
        }
      ),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['trust-passport', input.identityId] });
      qc.invalidateQueries({ queryKey: ['orchestrations', input.identityId] });
    }
  });
}

// --- Phase 12.0.2 daily brief (§9C vignette 16b) ----------------------
//
// The orchestrator's `daily_brief` action type is fully wired BE-side:
// when POST /api/orchestrations carries {actionType: 'daily_brief',
// actorId}, the server calls gatherDailyBriefSignals() and threads
// the structured signals object into actionRequest.metadata.signals.
// The signals come back even when the orchestration is blocked on
// consent — so the FE can render the structured part of the brief
// (mesh earnings, expiring consents, recent activity, open flags)
// before any consent grant.

export interface DailyBriefSignals {
  protocolVersion: string;
  horizonHours: number;
  asOf: string;
  recent: Array<{
    orchestrationId: string;
    actionType: string;
    status: string;
    at: string | null;
    summary: string;
  }>;
  mesh: {
    earnedPaise: number;
    tokens: number;
    bytes: number;
    eventCount: number;
  };
  expiringConsents: Array<{
    consentId: string;
    purpose: string;
    expiresAt: string;
    scopes: string[];
  }>;
  openFlags: number;
}

export interface DailyBriefResult {
  orchestration: Orchestration & {
    actionRequest?: {
      metadata?: { signals?: DailyBriefSignals; subjectDisplayName?: string };
    };
  };
}

export function useDailyBrief(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['daily-brief', identityId],
    queryFn: async (): Promise<DailyBriefResult> => {
      const result = await api<{ orchestration: Orchestration }>('/api/orchestrations', {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'daily_brief',
          actorId: identityId,
          execute: true
        })
      });
      return result as DailyBriefResult;
    },
    enabled: Boolean(identityId),
    // Refresh every 5 minutes — the signals refresh as the citizen
    // uses the app, but they don't need to be real-time.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000
  });
}

// --- Phase 12.0.2 personal memory records (My notes) ------------------
//
// Encrypted-at-rest notes the citizen owns. Plaintext is encrypted
// with the citizen's vault key on the server; reads go through the
// consent gate (memory.read + consent.record). For the v1 demo we
// render the summary (label + sensitivity + createdAt) in the list
// and offer a "Read note" action that consent-grants + decrypts.

export type MemorySensitivity = 'personal' | 'sensitive' | 'public';

export interface MemorySummary {
  recordId: string;
  ownerId: string;
  label?: string;
  contentType?: string;
  plaintextBytes?: number;
  scopes?: string[];
  source?: { type?: string };
  tags?: string[];
  sensitivity?: MemorySensitivity;
  createdAt: string;
}

export function useMemoryRecords(identityId: string | null | undefined) {
  return useQuery({
    queryKey: ['memory-records', identityId],
    queryFn: () =>
      api<{ memory: MemorySummary[] }>(
        `/api/memory-records?ownerId=${encodeURIComponent(identityId!)}`
      ).then((r) =>
        r.memory.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      ),
    enabled: Boolean(identityId)
  });
}

export interface CreateMemoryRecordInput {
  identityId: string;
  text: string;
  label?: string;
  sensitivity?: MemorySensitivity;
  tags?: string[];
}

export function useCreateMemoryRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemoryRecordInput) =>
      api<{ ok: boolean; memory: MemorySummary }>('/api/memory-records', {
        method: 'POST',
        body: JSON.stringify({
          identityId: input.identityId,
          text: input.text,
          label: input.label,
          sensitivity: input.sensitivity ?? 'personal',
          tags: input.tags ?? [],
          contentType: 'text/plain; charset=utf-8',
          scopes: ['memory.read', 'consent.record']
        })
      }),
    onSuccess: (_data, { identityId }) => {
      qc.invalidateQueries({ queryKey: ['memory-records', identityId] });
    }
  });
}

export interface ReadMemoryRecordResult {
  ok: boolean;
  approved?: boolean;
  decision?: OrchestrationDecision;
  memory?: MemorySummary;
  plaintext?: string | null;
}

export function useReadMemoryRecord() {
  return useMutation({
    mutationFn: ({
      recordId,
      identityId
    }: {
      recordId: string;
      identityId: string;
    }) =>
      api<ReadMemoryRecordResult>(
        `/api/memory-records/${encodeURIComponent(recordId)}/read`,
        {
          method: 'POST',
          body: JSON.stringify({
            identityId,
            granteeId: 'bharat-os-orchestrator',
            piiHandling: 'summary'
          })
        }
      )
  });
}

// --- Phase 12.0.1 sign-up / sign-in via phone OTP ---------------------
//
// The BE substrate is already in place:
//   POST /api/identities                       create a fresh identity
//   POST /api/phone-otp/send                   send OTP for a new identity
//   POST /api/phone-otp/verify                 verify OTP, attaches phone
//   POST /api/recovery/start                   find identity by phone, send OTP
//   POST /api/recovery/verify                  verify OTP, return identity
//
// These hooks wrap that substrate for the demo sign-up + sign-in flow.

export interface SignUpStartInput {
  displayName: string;
  phone: string;
}

export interface OtpSendResponse {
  ok: boolean;
  otpId: string;
  expiresAt: string;
  phoneMasked: string;
  /** Dev-only OTP reveal — only present when SMS provider is 'log'. */
  _devOtpCode?: string;
}

/**
 * Sign up = create identity → send OTP. We chain the two calls
 * here so the caller hands us {displayName, phone} and gets back
 * the identity (already created server-side) + an otpId to
 * verify against. The phone is NOT yet attached to the identity
 * until the verify step.
 */
export function useSignUpStart() {
  return useMutation({
    mutationFn: async ({ displayName, phone }: SignUpStartInput) => {
      const createRes = await api<{ ok: boolean; identity: Identity }>('/api/identities', {
        method: 'POST',
        body: JSON.stringify({ displayName })
      });
      const sendRes = await api<OtpSendResponse>('/api/phone-otp/send', {
        method: 'POST',
        body: JSON.stringify({
          identityId: createRes.identity.id,
          phone,
          purpose: 'phone_verify'
        })
      });
      return { identity: createRes.identity, otp: sendRes };
    }
  });
}

export interface SignUpVerifyInput {
  otpId: string;
  code: string;
}

export interface OtpVerifyResponse {
  ok: boolean;
  status: string;
  otp: { otpId: string; status: string; attempts: number };
  identity?: Identity;
}

export function useSignUpVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ otpId, code }: SignUpVerifyInput) =>
      api<OtpVerifyResponse>('/api/phone-otp/verify', {
        method: 'POST',
        body: JSON.stringify({ otpId, code })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identities'] });
    }
  });
}

export interface SignInStartInput {
  phone: string;
}

export interface RecoveryStartResponse {
  ok: boolean;
  recoveryId: string;
  otpId: string;
  expiresAt: string;
  phoneMasked: string;
  note: string;
  _devOtpCode?: string;
}

export function useSignInStart() {
  return useMutation({
    mutationFn: ({ phone }: SignInStartInput) =>
      api<RecoveryStartResponse>('/api/recovery/start', {
        method: 'POST',
        body: JSON.stringify({ phone })
      })
  });
}

export interface SignInVerifyInput {
  otpId: string;
  code: string;
}

export interface RecoveryVerifyResponse {
  ok: boolean;
  status?: string;
  recoveryBundle?: {
    identity: Identity;
    recoveryPhrase?: string;
    memoryRecordRefs?: unknown[];
  };
  otp?: { otpId: string; status: string; attempts: number };
}

export function useSignInVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ otpId, code }: SignInVerifyInput) =>
      api<RecoveryVerifyResponse>('/api/recovery/verify', {
        method: 'POST',
        body: JSON.stringify({ otpId, code })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['identities'] });
    }
  });
}

// --- Phase 12.0 provider identities ----------------------------------
export type ProviderRoleKind =
  | 'cab-driver'
  | 'personal-driver'
  | 'labourers'
  | 'household-help'
  | 'kirana'
  | 'skilled-trades';

export type ProviderIdentityStatus = 'draft' | 'submitted' | 'active' | 'suspended' | 'revoked';
export type ProviderKycLevel = 'none' | 'basic' | 'verified';

export interface ProviderIdentity {
  providerIdentityId: string;
  protocolVersion: string;
  objectType: string;
  rootIdentityId?: string; // omitted on public record
  roleKind: ProviderRoleKind;
  roleWave: 1 | 2;
  displayName: string;
  serviceArea?: Record<string, unknown> | null;
  ratePaisePerHour: number;
  ratePaisePerService: number;
  description?: string | null;
  kycLevel: ProviderKycLevel;
  status: ProviderIdentityStatus;
  createdAt: string;
  submittedAt?: string | null;
  activatedAt?: string | null;
}

export function useProviderIdentities(rootIdentityId: string | null | undefined) {
  return useQuery({
    queryKey: ['provider-identities', rootIdentityId],
    queryFn: () =>
      api<{ providerIdentities: ProviderIdentity[] }>(
        `/api/identities/${encodeURIComponent(rootIdentityId!)}/provider-identities`
      ).then((r) => r.providerIdentities),
    enabled: Boolean(rootIdentityId)
  });
}

export interface CreateProviderIdentityInput {
  rootIdentityId: string;
  roleKind: ProviderRoleKind;
  displayName: string;
  ratePaisePerHour?: number;
  ratePaisePerService?: number;
  serviceArea?: Record<string, unknown> | null;
  description?: string | null;
}

export function useCreateProviderIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProviderIdentityInput) =>
      api<{ providerIdentity: ProviderIdentity }>(
        `/api/identities/${encodeURIComponent(input.rootIdentityId)}/provider-identities`,
        {
          method: 'POST',
          body: JSON.stringify({
            roleKind: input.roleKind,
            displayName: input.displayName,
            ratePaisePerHour: input.ratePaisePerHour,
            ratePaisePerService: input.ratePaisePerService,
            serviceArea: input.serviceArea,
            description: input.description
          })
        }
      ),
    onSuccess: (_data, { rootIdentityId }) => {
      qc.invalidateQueries({ queryKey: ['provider-identities', rootIdentityId] });
    }
  });
}

export interface UpdateProviderProfileInput {
  rootIdentityId: string;
  providerIdentityId: string;
  displayName?: string;
  ratePaisePerHour?: number;
  ratePaisePerService?: number;
  serviceArea?: Record<string, unknown> | null;
  description?: string | null;
}

export function useUpdateProviderProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProviderProfileInput) =>
      api<{ providerIdentity: ProviderIdentity }>(
        `/api/provider-identities/${encodeURIComponent(input.providerIdentityId)}/profile`,
        {
          method: 'POST',
          body: JSON.stringify({
            rootIdentityId: input.rootIdentityId,
            displayName: input.displayName,
            ratePaisePerHour: input.ratePaisePerHour,
            ratePaisePerService: input.ratePaisePerService,
            serviceArea: input.serviceArea,
            description: input.description
          })
        }
      ),
    onSuccess: (_data, { rootIdentityId }) => {
      qc.invalidateQueries({ queryKey: ['provider-identities', rootIdentityId] });
    }
  });
}

// Phase 10.5 — Audit signer public record (Ed25519 public key + id).
// Used on the citizen Settings transparency strip so anyone can
// inspect the key used to sign labeling-job audit bundles. Public
// endpoint; no auth required.
export interface AuditSignerPublicRecord {
  protocolVersion: string;
  id: string;
  displayName: string;
  publicKeyPem: string;
  createdAt: string;
}

export function useAuditSignerPublicKey() {
  return useQuery({
    queryKey: ['audit-signer-public-key'],
    queryFn: () => api<AuditSignerPublicRecord>('/api/audit-signer/public-key'),
    staleTime: 24 * 60 * 60 * 1000
  });
}

// Phase 10.5 — pure URL builder for the sponsor-side signed export
// endpoint. The FE doesn't fetch this directly (sponsors download it
// from their own tooling using their bearer token); we expose it so
// the sponsor console can construct the link, and so the citizen-
// side Settings panel can quote the exact endpoint shape under the
// transparency strip.
export function labelingExportNdjsonUrl(sponsorId: string, jobId: string): string {
  return `/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs/${encodeURIComponent(jobId)}/export.ndjson`;
}

export function useFederatedRounds() {
  return useQuery({
    queryKey: ['federated-rounds'],
    queryFn: () => api<{ rounds: FederatedRound[] }>('/api/federated/rounds').then((r) => r.rounds)
  });
}

/**
 * Phase 9.0d — server-side sign-and-submit gradient update.
 * Body matches the existing Phase 3.x endpoint shape. Server signs
 * with the contributor's stored private key (still server-side in
 * Phase 2a; moves to device hardware keystore in Phase 2b per ADR
 * 0066) and on accept auto-creates a `federated_round` mesh-
 * contribution event for the round's per-update payout.
 */
export function useSubmitFederatedUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roundId,
      contributorId,
      baselineModelHash,
      gradientHash,
      gradientBase64,
      gradientLength,
      epsilon,
      sampleCount
    }: {
      roundId: string;
      contributorId: string;
      baselineModelHash: string;
      gradientHash: string;
      gradientBase64: string;
      gradientLength: number;
      epsilon: number;
      sampleCount: number;
    }) =>
      api(
        `/api/federated/rounds/${encodeURIComponent(roundId)}/updates/sign-and-submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            contributorId,
            baselineModelHash,
            gradientHash,
            gradientBytesBase64: gradientBase64,
            gradientLength,
            differentialPrivacyEpsilon: epsilon,
            sampleCount
          })
        }
      ),
    onSuccess: (_data, { contributorId }) => {
      qc.invalidateQueries({ queryKey: ['federated-rounds'] });
      qc.invalidateQueries({ queryKey: ['mesh-balance', contributorId] });
      qc.invalidateQueries({ queryKey: ['mesh-summary', contributorId] });
    }
  });
}

// --- Mesh-contribution event recording (Phase 9.0d real ticks) --------

/**
 * Record a mesh-contribution event. Phase 9.0d wires this from the
 * Try Prompt UI so every `runtime.generate()` call records a real
 * inference tick instead of the demo-seeded events that have been
 * filling the ledger until now.
 */
export function useRecordMeshEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      operatorId: string;
      workloadType: 'inference' | 'federated_round';
      tokens?: number;
      payoutPaise?: number;
      roundId?: string;
    }) =>
      api('/api/mesh/contributions', {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          // Demo defaults — the worker is assumed to be in a chargeable
          // state when actively using the runtime in the browser.
          charging: true,
          wifi: true,
          batteryPercent: 100
        })
      }),
    onSuccess: (_data, { operatorId }) => {
      qc.invalidateQueries({ queryKey: ['mesh-balance', operatorId] });
      qc.invalidateQueries({ queryKey: ['mesh-summary', operatorId] });
    }
  });
}
