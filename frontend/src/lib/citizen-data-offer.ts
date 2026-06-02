// Phase 13.5 — FE types + helpers for the citizen-data-offer
// substrate. Mirrors src/phase1/citizen-data-offer.mjs.
//
// Convergence tests in vitest + Node assert the enums match.

export const CITIZEN_DATA_OFFER_PROTOCOL_VERSION = 'bos.phase13.citizen-data-offer.v1';

export const DATA_POINT_KINDS = Object.freeze([
  'intent_text',
  'doc_summary',
  'pii_redaction',
  'skill_run',
  'mesh_contribution'
] as const);
export type DataPointKind = (typeof DATA_POINT_KINDS)[number];

export const SPONSOR_PURPOSES = Object.freeze([
  'model_training',
  'model_evaluation',
  'safety_benchmark',
  'product_research',
  'academic_research',
  'gov_audit'
] as const);
export type SponsorPurpose = (typeof SPONSOR_PURPOSES)[number];

export const CITIZEN_DATA_OFFER_STATUSES = Object.freeze([
  'active',
  'paused',
  'revoked',
  'exhausted'
] as const);
export type CitizenDataOfferStatus = (typeof CITIZEN_DATA_OFFER_STATUSES)[number];

export const DATA_POINT_KIND_LABEL: Record<DataPointKind, string> = {
  intent_text: 'Intent prompts',
  doc_summary: 'Document summaries',
  pii_redaction: 'PII-redacted text',
  skill_run: 'Skill-agent runs',
  mesh_contribution: 'Federated learning contributions'
};

export const DATA_POINT_KIND_DESCRIPTION: Record<DataPointKind, string> = {
  intent_text:
    'The text of intents you submitted to Bharat OS (anonymized; never your reply targets).',
  doc_summary:
    'Output of the on-device document summariser (titles, TLDRs, bullet structure).',
  pii_redaction:
    'PII-redacted text + redaction trail (counts only; never the redacted PII itself).',
  skill_run:
    'Input + output pairs from your SLM-H skill runs (consumer complaints / PM-KISAN / bills).',
  mesh_contribution:
    'Federated learning gradient contributions (already DP-noised; high-level meta only).'
};

export const SPONSOR_PURPOSE_LABEL: Record<SponsorPurpose, string> = {
  model_training: 'Model training',
  model_evaluation: 'Model evaluation',
  safety_benchmark: 'Safety / red-team benchmark',
  product_research: 'Product research',
  academic_research: 'Academic research',
  gov_audit: 'Government compliance audit'
};

export interface CitizenDataOffer {
  offerId: string;
  publisherId: string;
  dataPointKind: DataPointKind;
  pricePerSalePaise: number;
  maxSales: number;
  salesCount: number;
  sponsorPurposeAllowlist: SponsorPurpose[];
  protocolVersion: typeof CITIZEN_DATA_OFFER_PROTOCOL_VERSION;
  status: CitizenDataOfferStatus;
  publishedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  pausedAt: string | null;
}

export interface CitizenDataOffersResponse {
  offers: CitizenDataOffer[];
  protocolVersion: string;
  supportedDataPointKinds: readonly string[];
  supportedSponsorPurposes: readonly string[];
  supportedStatuses: readonly string[];
}

// Phase 13.5 — default TTL when the citizen publishes from the
// panel. 30 days; can be customised via the form in a later
// sub-phase.
export const DEFAULT_OFFER_TTL_DAYS = 30;

/**
 * Compute an ISO-8601 expiresAt N days from now. The BE clamps to
 * [24 hours, 365 days]; this helper just picks a reasonable default.
 */
export function defaultExpiresAt(days = DEFAULT_OFFER_TTL_DAYS): string {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
