import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { evaluateSkillPreflight, skillForTool } from './skills.mjs';
import { executeToolAction } from './tools.mjs';
import {
  inferActionTypeFromNormalized,
  localizeResponse,
  normalizeIntent as normalizeIntentV,
  VERNACULAR_INTENT_ALIASES as VERNACULAR_INTENT_ALIASES_V,
  VERNACULAR_PROTOCOL_VERSION
} from './vernacular.mjs';

// Re-export the vernacular surface so existing import sites keep working while
// the canonical implementation lives in the L8 module (see ADR 0043).
export { VERNACULAR_INTENT_ALIASES_V as VERNACULAR_INTENT_ALIASES };
export { VERNACULAR_PROTOCOL_VERSION };

export const ORCHESTRATOR_PROTOCOL_VERSION = 'bos.phase1.orchestrator.v0';

export const ORCHESTRATION_TEMPLATES = {
  regulated_onboarding: {
    label: 'Regulated onboarding',
    tool: 'account_aggregator',
    regulated: true,
    scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
    piiHandling: 'tokenized',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    plan: ['parse_intent', 'verify_identity_route', 'check_consent', 'invoke_account_aggregator', 'write_receipt']
  },
  scheme_delivery: {
    label: 'Scheme delivery',
    tool: 'digilocker',
    regulated: true,
    scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
    piiHandling: 'tokenized',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    plan: ['parse_intent', 'fetch_document_refs', 'evaluate_scheme_policy', 'write_receipt']
  },
  health_record_read: {
    label: 'Health record read',
    tool: 'abha',
    regulated: true,
    scopes: ['health.record.read', 'consent.record'],
    piiHandling: 'summary',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    plan: ['parse_intent', 'check_health_consent', 'fetch_abha_summary', 'write_receipt']
  },
  labor_match_post: {
    label: 'Labor matching',
    tool: 'upi_escrow',
    regulated: true,
    scopes: ['labor.match', 'worker.notify', 'upi.escrow'],
    piiHandling: 'tokenized',
    identity: {
      aadhaarRequired: false,
      fallbackAvailable: true,
      // Default: orchestrator does NOT assert age. Callers must explicitly
      // attest, which is what makes §9A age verification effective.
      ageAttested: false,
      ageMinimum: null
    },
    money: {
      amount: 1000,
      currency: 'INR',
      limit: 1000,
      workerPays: false,
      escrow: true
    },
    labor: { days: 1, headcount: 1, wageFloorPerDay: 400, legalMinAge: 18 },
    plan: ['parse_job_request', 'check_worker_protection', 'create_upi_escrow', 'notify_workers', 'write_receipt']
  },
  mesh_storage: {
    label: 'Mesh storage',
    tool: 'mesh.storage',
    regulated: false,
    scopes: ['mesh.store'],
    piiHandling: 'none',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    plan: ['classify_payload', 'select_storage_policy', 'route_to_mesh', 'write_receipt']
  },
  trust_attestation: {
    // §9C vignette 15 — Sneha shares a Trust Passport attestation with a
    // landlord. Selective disclosure only; the verifier sees bands and
    // booleans, never the raw values. §13A #7 Trust-as-a-service.
    label: 'Trust Passport attestation',
    tool: 'trust_passport_attestation',
    regulated: true,
    scopes: ['trust.attest', 'consent.record'],
    piiHandling: 'attestation_only',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    money: { amount: 0, currency: 'INR', limit: 0, workerPays: false, escrow: false },
    plan: [
      'parse_attestation_request',
      'select_claims_for_disclosure',
      'mint_signed_attestation',
      'write_receipt'
    ]
  },
  daily_brief: {
    // §9C vignette 16b — Priya's morning brief, composed entirely
    // on-device by the §7e router. No network leg, no revenue line
    // (§15 citizen-facing binding).
    label: 'On-device daily brief',
    tool: 'daily_brief_compose',
    regulated: false,
    scopes: ['memory.read', 'consent.record'],
    piiHandling: 'on_device_only',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    plan: [
      'parse_brief_request',
      'gather_local_signals',
      'compose_on_device',
      'write_receipt'
    ]
  },
  service_booking: {
    // §9B service brokering: the user's agent books a third-party service
    // through Bharat OS's own L6 marketplace. ONDC bridge is an internal
    // Phase A density source, not the substrate. User pays the provider for
    // what they consume; Bharat OS never charges the user for access (§15).
    label: 'Service booking (Bharat OS marketplace)',
    tool: 'bharat_marketplace',
    regulated: true,
    scopes: ['service.book', 'consent.record', 'upi.settle'],
    piiHandling: 'tokenized',
    identity: { aadhaarRequired: false, fallbackAvailable: true },
    money: { amount: 0, currency: 'INR', limit: 0, workerPays: false, escrow: false },
    plan: [
      'parse_service_intent',
      'marketplace_search_native',
      'marketplace_search_ondc_bridge',
      'rank_by_trust_passport',
      'present_choice',
      'confirm_booking',
      'write_receipt'
    ]
  }
};

function nowIso() {
  return new Date().toISOString();
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function normalizeScopes(scopes) {
  if (!scopes) return undefined;
  if (typeof scopes === 'string') {
    return scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return scopes;
}

export function normalizeIntent(intentText = '', options = {}) {
  return normalizeIntentV(intentText, options);
}

export function inferActionType(intentText = '', options = {}) {
  return inferActionTypeFromNormalized(normalizeIntentV(intentText, options));
}

export function listOrchestrationTemplates() {
  return Object.entries(ORCHESTRATION_TEMPLATES).map(([actionType, template]) => ({
    actionType,
    label: template.label,
    tool: template.tool,
    regulated: template.regulated,
    scopes: template.scopes,
    piiHandling: template.piiHandling,
    plan: template.plan
  }));
}

export function buildActionRequest(intent) {
  const normalizedIntent = normalizeIntentV(intent.intentText, { locale: intent.locale ?? 'en-IN' });
  const actionType = intent.actionType ?? inferActionTypeFromNormalized(normalizedIntent);
  const template = ORCHESTRATION_TEMPLATES[actionType];
  if (!template) {
    throw new Error(`No orchestration template registered for ${actionType}.`);
  }
  const tool = intent.tool ?? template.tool;
  const selectedSkill = skillForTool(tool);

  return {
    actorId: intent.actorId,
    granteeId: intent.granteeId ?? 'bharat-os-orchestrator',
    actionType,
    tool,
    skillId: intent.skillId ?? selectedSkill.skillId,
    skillManifestId: selectedSkill.manifestId,
    scopes: normalizeScopes(intent.scopes) ?? template.scopes,
    regulated: intent.regulated ?? template.regulated,
    piiHandling: intent.piiHandling ?? template.piiHandling,
    identity: {
      ...template.identity,
      ...(intent.identity ?? {})
    },
    money: {
      ...(template.money ?? { amount: 0, currency: 'INR' }),
      ...(intent.money ?? {})
    },
    labor: {
      ...(template.labor ?? {}),
      ...(intent.labor ?? {})
    },
    mediation: intent.mediation ?? template.mediation ?? null,
    metadata: {
      intentText: intent.intentText ?? '',
      locale: intent.locale ?? 'en-IN',
      detectedLocale: normalizedIntent.detectedLocale,
      detectedLanguageId: normalizedIntent.detectedLanguageId,
      normalizedText: normalizedIntent.normalizedText,
      matchedAliases: normalizedIntent.matchedAliases.map((alias) => ({
        actionType: alias.actionType,
        label: alias.label,
        languageId: alias.languageId
      })),
      languageConfidence: normalizedIntent.confidence,
      skillName: selectedSkill.name,
      skillDataExposure: selectedSkill.permissions.dataExposure,
      channel: intent.channel ?? 'text',
      ...(intent.metadata ?? {})
    }
  };
}

function consentRequirement(actionRequest) {
  return {
    subjectId: actionRequest.actorId,
    granteeId: actionRequest.granteeId,
    scopes: actionRequest.scopes,
    required: Boolean(actionRequest.regulated)
  };
}

function buildPlan(actionRequest, skillPreflight, execute) {
  const template = ORCHESTRATION_TEMPLATES[actionRequest.actionType];
  const approved = Boolean(skillPreflight.approved);
  const steps = [
    { step: 'intent_received', layer: 'L8', status: 'complete' },
    {
      step: 'intent_normalized',
      layer: 'L7',
      actionType: actionRequest.actionType,
      locale: actionRequest.metadata?.detectedLocale,
      status: 'complete'
    },
    {
      step: 'skill_selected',
      layer: 'L6',
      skillId: actionRequest.skillId,
      tool: actionRequest.tool,
      status: 'complete'
    },
    {
      step: 'skill_preflight',
      layer: 'L6',
      preflightId: skillPreflight.preflightId,
      status: approved ? 'passed' : 'blocked'
    },
    { step: 'policy_and_consent_checked', layer: 'L4', status: approved ? 'passed' : 'blocked' }
  ];

  for (const templateStep of template.plan) {
    steps.push({
      step: templateStep,
      layer: templateStep.includes('mesh') ? 'L2' : templateStep.includes('receipt') ? 'L4' : 'L3',
      status: approved ? (execute ? 'ready_or_executed' : 'planned') : 'blocked'
    });
  }

  return steps;
}

function deriveLifecycleStatus(skillPreflightApproved, execution) {
  if (execution) return 'completed';
  if (skillPreflightApproved) return 'planned';
  return 'blocked';
}

export function orchestrateIntent(intent, consents = [], { execute = false, at = nowIso(), publicRecords = [], flags = [] } = {}) {
  const actionRequest = buildActionRequest(intent);
  const normalizedIntent = {
    normalizedText: actionRequest.metadata.normalizedText,
    detectedLocale: actionRequest.metadata.detectedLocale,
    detectedLanguageId: actionRequest.metadata.detectedLanguageId,
    matchedAliases: actionRequest.metadata.matchedAliases,
    confidence: actionRequest.metadata.languageConfidence
  };
  const skillPreflight = evaluateSkillPreflight(actionRequest.skillId, actionRequest, consents, { at, publicRecords, flags });
  let decision = skillPreflight.decision;
  let execution = null;

  if (execute && skillPreflight.approved) {
    execution = executeToolAction(skillPreflight.decision.request, consents, {
      at,
      skillPreflightId: skillPreflight.preflightId,
      publicRecords,
      flags
    });
    decision = execution.decision;
  }

  const lifecycleStatus = deriveLifecycleStatus(skillPreflight.approved, execution);
  const localizedResponse = localizeResponse(
    actionRequest.actionType,
    lifecycleStatus,
    normalizedIntent.detectedLocale
  );

  const core = {
    protocolVersion: ORCHESTRATOR_PROTOCOL_VERSION,
    objectType: 'intent-orchestration',
    intent: {
      intentText: intent.intentText ?? '',
      locale: intent.locale ?? 'en-IN',
      detectedLocale: normalizedIntent.detectedLocale,
      detectedLanguageId: normalizedIntent.detectedLanguageId,
      normalizedText: normalizedIntent.normalizedText,
      matchedAliases: normalizedIntent.matchedAliases,
      languageConfidence: normalizedIntent.confidence,
      channel: intent.channel ?? 'text',
      actorId: intent.actorId
    },
    actionRequest,
    consentRequirement: consentRequirement(actionRequest),
    skillPreflightId: skillPreflight.preflightId,
    approved: skillPreflight.approved && decision.approved,
    decisionId: decision.decisionId,
    executionId: execution?.executionId ?? null,
    executed: Boolean(execution),
    status: execution ? execution.status : skillPreflight.approved ? 'planned' : 'blocked',
    localizedResponse,
    plan: buildPlan(actionRequest, skillPreflight, execute),
    failedPolicies: decision.checks
      .filter((check) => check.status === 'fail')
      .map((check) => check.policyId),
    createdAt: at
  };

  return {
    orchestrationId: idFrom('bos:orchestration', core),
    auditHash: sha256Hex(stableStringify(core)),
    skillPreflight,
    decision,
    execution,
    ...core
  };
}
