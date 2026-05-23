import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { evaluateDecision, PHASE1_PROTOCOL_VERSION } from './policy.mjs';
import { listTools } from './tools.mjs';

export const SKILL_PROTOCOL_VERSION = 'bos.phase1.skills.v0';
export const DEFAULT_SKILL_VERSION = '0.1.0';

const CORE_DEVELOPER = {
  developerId: 'bos:developer:bharat-os-core',
  displayName: 'Bharat OS Core',
  kycVerified: true
};

const SKILL_DEFINITIONS = [
  {
    skillId: 'bos:skill:uidai-offline-ekyc',
    name: 'Offline eKYC',
    category: 'identity',
    actionType: 'regulated_onboarding',
    toolId: 'uidai_offline_ekyc',
    summary: 'Creates a mock identity attestation token without exposing Aadhaar payloads.',
    requiredScopes: ['identity.verify', 'consent.record'],
    dataExposure: 'attestation_token_only'
  },
  {
    skillId: 'bos:skill:digilocker-docrefs',
    name: 'DigiLocker Document References',
    category: 'documents',
    actionType: 'scheme_delivery',
    toolId: 'digilocker',
    summary: 'Fetches document references for scheme workflows without returning raw files.',
    requiredScopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
    dataExposure: 'document_references_only'
  },
  {
    skillId: 'bos:skill:account-aggregator-summary',
    name: 'Account Aggregator Summary',
    category: 'finance',
    actionType: 'regulated_onboarding',
    toolId: 'account_aggregator',
    summary: 'Produces derived financial signals without raw transactions.',
    requiredScopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
    dataExposure: 'derived_financial_summary'
  },
  {
    skillId: 'bos:skill:abha-summary',
    name: 'ABHA Health Summary',
    category: 'health',
    actionType: 'health_record_read',
    toolId: 'abha',
    summary: 'Returns health summary metadata and record references without raw health records.',
    requiredScopes: ['health.record.read', 'consent.record'],
    dataExposure: 'health_summary_metadata'
  },
  {
    skillId: 'bos:skill:abha-document-upload',
    name: 'ABHA Structured Document Upload',
    category: 'health',
    actionType: 'health_document_upload',
    toolId: 'abha',
    summary: 'Uploads structured health observations extracted from a captured document without storing raw image or OCR text.',
    requiredScopes: ['health.record.write', 'consent.record'],
    dataExposure: 'structured_health_observations'
  },
  {
    skillId: 'bos:skill:upi-escrow',
    name: 'UPI Escrow',
    category: 'payments',
    actionType: 'labor_match_post',
    toolId: 'upi_escrow',
    summary: 'Creates consent-bound escrow receipts with explicit user-visible limits.',
    requiredScopes: ['labor.match', 'worker.notify', 'upi.escrow'],
    dataExposure: 'payment_receipt_only'
  },
  {
    skillId: 'bos:skill:mesh-storage',
    name: 'Mesh Storage',
    category: 'mesh',
    actionType: 'mesh_storage',
    toolId: 'mesh.storage',
    summary: 'Routes storage intent to the mesh control plane without including payloads.',
    requiredScopes: ['mesh.store'],
    dataExposure: 'pointer_metadata_only'
  },
  {
    skillId: 'bos:skill:bharat-marketplace',
    name: 'Bharat OS Service Marketplace',
    category: 'commerce',
    actionType: 'service_booking',
    toolId: 'bharat_marketplace',
    summary: 'Bharat OS native L6 marketplace for cab / hotel / ticket / food / grocery / professional-services booking. The OS owns provider registry, matching, settlement, policy, and audit. May internally use the ONDC bridge during Phase A density bootstrap. §9B substrate.',
    requiredScopes: ['service.book', 'consent.record', 'upi.settle'],
    dataExposure: 'booking_reference_only'
  },
  {
    skillId: 'bos:skill:ondc-bridge',
    name: 'ONDC Bridge (Phase A only)',
    category: 'commerce',
    actionType: 'service_booking',
    toolId: 'ondc_beckn',
    summary: 'Outbound bridge to the ONDC / Beckn open commerce network. Used by the native marketplace as one discovery source during Phase A density bootstrap. Not the substrate (§9B).',
    requiredScopes: ['service.book', 'consent.record', 'upi.settle'],
    dataExposure: 'booking_reference_only'
  }
];

function skillManifest(definition, tool) {
  const payload = {
    protocolVersion: SKILL_PROTOCOL_VERSION,
    objectType: 'skill-manifest',
    skillId: definition.skillId,
    name: definition.name,
    version: definition.version ?? DEFAULT_SKILL_VERSION,
    layer: 'L6',
    category: definition.category,
    actionType: definition.actionType,
    status: 'prototype_mock',
    developer: CORE_DEVELOPER,
    toolBinding: {
      toolId: definition.toolId,
      toolLayer: tool?.layer ?? 'L3',
      mocked: tool?.mocked !== false
    },
    permissions: {
      requiredScopes: definition.requiredScopes,
      consentRequired: definition.requiredScopes.some((scope) => scope !== 'mesh.store'),
      regulatedData: definition.requiredScopes.some((scope) => scope !== 'mesh.store'),
      rawPiiAllowed: false,
      dataExposure: definition.dataExposure
    },
    sandbox: {
      network: 'mocked_or_policy_gated_tool_adapter',
      storage: 'receipt_only',
      modelContext: 'no_raw_pii',
      audit: 'required'
    },
    summary: definition.summary
  };
  const manifestHash = sha256Hex(stableStringify(payload));

  return {
    manifestId: `bos:skill-manifest:${manifestHash.slice(0, 32)}`,
    manifestHash,
    ...payload
  };
}

export function listSkills() {
  const toolsById = new Map(listTools().map((tool) => [tool.toolId, tool]));
  return SKILL_DEFINITIONS.map((definition) => skillManifest(definition, toolsById.get(definition.toolId)));
}

export function readSkill(skillId) {
  const skill = listSkills().find((candidate) => candidate.skillId === skillId);
  if (!skill) throw new Error(`No skill registered for ${skillId}.`);
  return skill;
}

export function skillForTool(toolId) {
  const skill = listSkills().find((candidate) => candidate.toolBinding.toolId === toolId);
  if (!skill) throw new Error(`No skill registered for tool ${toolId}.`);
  return skill;
}

export function canonicalSkillManifestPayload(skill) {
  return {
    protocolVersion: skill.protocolVersion,
    objectType: skill.objectType,
    skillId: skill.skillId,
    name: skill.name,
    version: skill.version,
    layer: skill.layer,
    category: skill.category,
    actionType: skill.actionType,
    status: skill.status,
    developer: skill.developer,
    toolBinding: skill.toolBinding,
    permissions: skill.permissions,
    sandbox: skill.sandbox,
    summary: skill.summary
  };
}

export function verifySkillManifestIntegrity(skill) {
  const payload = canonicalSkillManifestPayload(skill);
  const expectedHash = sha256Hex(stableStringify(payload));
  const expectedManifestId = `bos:skill-manifest:${expectedHash.slice(0, 32)}`;
  const reasons = [];

  if (skill.objectType !== 'skill-manifest') reasons.push('invalid skill manifest object type');
  if (skill.protocolVersion !== SKILL_PROTOCOL_VERSION) reasons.push('invalid skill protocol version');
  if (!skill.version) reasons.push('skill version is required');
  if (!skill.skillId?.startsWith('bos:skill:')) reasons.push('invalid skill ID');
  if (skill.manifestId !== expectedManifestId) reasons.push('skill manifest ID does not match canonical payload');
  if (skill.manifestHash !== expectedHash) reasons.push('skill manifest hash does not match canonical payload');
  if (!skill.developer?.kycVerified) reasons.push('skill developer is not KYC verified');
  if (skill.permissions?.rawPiiAllowed !== false) reasons.push('raw PII must not be allowed in Phase 1 skills');
  if (skill.sandbox?.audit !== 'required') reasons.push('skill audit sandbox posture must be required');
  if (!skill.toolBinding?.toolId) reasons.push('skill tool binding is required');

  return {
    artifactType: 'skill-manifest',
    valid: reasons.length === 0,
    idValid: skill.manifestId === expectedManifestId,
    manifestHashValid: skill.manifestHash === expectedHash,
    actualManifestId: skill.manifestId,
    expectedManifestId,
    actualManifestHash: skill.manifestHash,
    expectedManifestHash: expectedHash,
    skillId: skill.skillId,
    version: skill.version,
    reasons
  };
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function integrityBlockedDecision(request, integrity, at) {
  const core = {
    protocolVersion: PHASE1_PROTOCOL_VERSION,
    objectType: 'decision-evaluation',
    request,
    approved: false,
    checks: [
      {
        status: 'fail',
        policyId: 'policy.skill.integrity_required',
        message: 'Skill manifest integrity must verify before invocation.',
        reasons: integrity.reasons
      }
    ],
    plan: [{ step: 'block_execution', layer: 'L6', status: 'blocked' }],
    evaluatedAt: at
  };

  return {
    decisionId: idFrom('bos:decision', core),
    auditHash: sha256Hex(stableStringify(core)),
    ...core
  };
}

export function canonicalSkillPreflightPayload(preflight) {
  return {
    protocolVersion: preflight.protocolVersion,
    objectType: preflight.objectType,
    skillId: preflight.skillId,
    manifestId: preflight.manifestId,
    approved: preflight.approved,
    integrity: preflight.integrity,
    decisionId: preflight.decisionId,
    decision: preflight.decision,
    requiredScopes: preflight.requiredScopes,
    remediation: preflight.remediation,
    checkedAt: preflight.checkedAt
  };
}

function remediationFor(skill, request, decision, integrity) {
  const failedPolicyIds = (decision.checks ?? [])
    .filter((check) => check.status === 'fail')
    .map((check) => check.policyId);
  const consentFailure = (decision.checks ?? []).find(
    (check) => check.status === 'fail' && check.policyId === 'policy.consent.required_for_regulated_action'
  );
  const actions = [];
  let consentGrant = null;

  if (!integrity.valid) {
    actions.push({
      action: 'refresh_skill_manifest',
      layer: 'L6',
      reason: 'skill_integrity_failed'
    });
  }

  if (consentFailure) {
    consentGrant = {
      subjectId: request.actorId,
      granteeId: request.granteeId,
      scopes: consentFailure.requiredScopes ?? request.scopes,
      purpose: `Skill invocation: ${skill.name}`,
      constraints: {
        skillId: skill.skillId,
        skillManifestId: skill.manifestId,
        dataExposure: skill.permissions.dataExposure
      }
    };
    actions.push({
      action: 'request_consent',
      layer: 'L4',
      reason: 'missing_active_consent',
      consentGrant
    });
  }

  if (failedPolicyIds.includes('policy.pii.no_raw_pii_to_model')) {
    actions.push({
      action: 'change_pii_handling',
      layer: 'L3',
      reason: 'raw_pii_blocked',
      value: 'tokenized'
    });
  }

  if (failedPolicyIds.includes('policy.identity.aadhaar_optional')) {
    actions.push({
      action: 'provide_identity_fallback',
      layer: 'L5',
      reason: 'aadhaar_cannot_be_mandatory'
    });
  }

  if (failedPolicyIds.includes('policy.worker.no_advance_fee')) {
    actions.push({
      action: 'remove_worker_fee',
      layer: 'L4',
      reason: 'worker_access_fee_blocked'
    });
  }

  if (failedPolicyIds.includes('policy.worker.escrow_required')) {
    actions.push({
      action: 'enable_wage_escrow',
      layer: 'L4',
      reason: 'wage_escrow_required',
      hint: 'set money.escrow=true or route through the upi_escrow tool'
    });
  }

  if (failedPolicyIds.includes('policy.worker.minimum_wage_floor')) {
    actions.push({
      action: 'raise_wage_or_declare_floor',
      layer: 'L4',
      reason: 'wage_below_declared_floor',
      hint: 'set labor.wageFloorPerDay and ensure money.amount/(days*headcount) >= floor'
    });
  }

  if (failedPolicyIds.includes('policy.worker.age_verification')) {
    actions.push({
      action: 'attest_worker_age',
      layer: 'L5',
      reason: 'age_attestation_missing_or_below_minimum',
      hint: 'set identity.ageAttested=true and identity.ageMinimum >= labor.legalMinAge'
    });
  }

  if (failedPolicyIds.includes('policy.mediation.requires_worker_authorization')) {
    actions.push({
      action: 'attach_worker_authorization',
      layer: 'L4',
      reason: 'kiosk_operator_cannot_act_as_worker',
      hint: 'include a separate mediation.workerAuthorizationId signed by the worker'
    });
  }

  if (failedPolicyIds.includes('policy.money.fiat_settlement_only')) {
    actions.push({
      action: 'switch_to_fiat_settlement',
      layer: 'L4',
      reason: 'tokens_or_crypto_blocked',
      hint: 'set money.currency to INR; §15 forbids tokens'
    });
  }

  if (failedPolicyIds.includes('policy.money.limit_required')) {
    actions.push({
      action: 'declare_money_limit',
      layer: 'L4',
      reason: 'monetary_limit_required'
    });
  }

  return {
    status: actions.length > 0 ? 'action_required' : 'none',
    failedPolicyIds,
    consentGrant,
    actions
  };
}

export function evaluateSkillPreflight(
  skillOrId,
  {
    actorId,
    granteeId = 'bharat-os-orchestrator',
    actionType,
    scopes,
    piiHandling = 'tokenized',
    identity = { aadhaarRequired: false, fallbackAvailable: true },
    money = { amount: 0, currency: 'INR' },
    labor,
    mediation,
    metadata = {}
  } = {},
  consents = [],
  options = {}
) {
  const publicRecords = options.publicRecords ?? [];
  const flags = options.flags ?? [];
  const skill = typeof skillOrId === 'string' ? readSkill(skillOrId) : skillOrId;
  const integrity = verifySkillManifestIntegrity(skill);
  const requestedScopes = scopes ?? skill.permissions.requiredScopes;
  const checkedAt = options.at ?? new Date().toISOString();
  const request = {
    actorId,
    granteeId,
    actionType: actionType ?? skill.actionType,
    tool: skill.toolBinding.toolId,
    scopes: requestedScopes,
    regulated: skill.permissions.regulatedData,
    piiHandling,
    identity,
    money,
    labor,
    mediation,
    metadata: {
      skillId: skill.skillId,
      skillManifestId: skill.manifestId,
      dataExposure: skill.permissions.dataExposure,
      ...metadata
    }
  };
  const decision = integrity.valid
    ? evaluateDecision(request, consents, { ...options, at: checkedAt, publicRecords, flags })
    : integrityBlockedDecision(request, integrity, checkedAt);
  const remediation = remediationFor(skill, request, decision, integrity);
  const core = {
    protocolVersion: SKILL_PROTOCOL_VERSION,
    objectType: 'skill-preflight',
    skillId: skill.skillId,
    manifestId: skill.manifestId,
    approved: Boolean(integrity.valid && decision.approved),
    integrity,
    decisionId: decision.decisionId,
    decision,
    requiredScopes: requestedScopes,
    remediation,
    checkedAt
  };

  return {
    preflightId: idFrom('bos:skill-preflight', core),
    auditHash: sha256Hex(stableStringify(core)),
    ...core
  };
}
