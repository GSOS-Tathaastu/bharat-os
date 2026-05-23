import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { verifyWorkerAuthorization } from './worker-authorization.mjs';

export const PHASE1_PROTOCOL_VERSION = 'bos.phase1.v0';

export const DEFAULT_POLICIES = [
  {
    policyId: 'policy.consent.required_for_regulated_action',
    layer: 'L4',
    severity: 'block',
    description: 'Regulated actions require an active consent artifact covering every requested scope.'
  },
  {
    policyId: 'policy.pii.no_raw_pii_to_model',
    layer: 'L3',
    severity: 'block',
    description: 'Raw PII must not be passed to model context.'
  },
  {
    policyId: 'policy.identity.aadhaar_optional',
    layer: 'L5',
    severity: 'block',
    description: 'Aadhaar cannot be mandatory; a fallback identity route must be available.'
  },
  {
    policyId: 'policy.worker.no_advance_fee',
    layer: 'L4',
    severity: 'block',
    description: 'Workers and vulnerable users must never pay to access work or services. §15 binding.'
  },
  {
    policyId: 'policy.worker.escrow_required',
    layer: 'L4',
    severity: 'block',
    description: 'Labor flows must hold the wage in escrow until verified completion. §9A worker protection.'
  },
  {
    policyId: 'policy.worker.minimum_wage_floor',
    layer: 'L4',
    severity: 'block',
    description: 'Per-worker per-day wage must meet the declared minimum wage floor. §9A worker protection.'
  },
  {
    policyId: 'policy.worker.age_verification',
    layer: 'L4',
    severity: 'block',
    description: 'Labor flows require attested worker age above the legal minimum. §9A child-labour safeguard.'
  },
  {
    policyId: 'policy.mediation.requires_worker_authorization',
    layer: 'L4',
    severity: 'block',
    description: 'Kiosk/assisted-channel actions require a separate worker authorization receipt; the operator cannot act in the worker’s name. §9A design problem A.'
  },
  {
    policyId: 'policy.money.fiat_settlement_only',
    layer: 'L4',
    severity: 'block',
    description: 'Monetary actions must settle in INR via UPI rails; no tokens or crypto. §15 binding.'
  },
  {
    policyId: 'policy.money.limit_required',
    layer: 'L4',
    severity: 'block',
    description: 'Any monetary action must declare a user-visible limit and currency.'
  }
];

// Currencies allowed for monetary settlement under §15 ("fiat-denominated,
// non-transferable credits on UPI"). UPI is INR-only today; this set may
// expand if MOSIP/UPI-export bridges into another rupee-pegged corridor (see
// §13C), but never to tokens or speculative assets.
export const ALLOWED_SETTLEMENT_CURRENCIES = new Set(['INR']);

export const ACTION_TEMPLATES = {
  regulated_onboarding: {
    regulated: true,
    defaultTool: 'account_aggregator',
    scopes: ['identity.verify', 'consent.record', 'regulated.workflow']
  },
  scheme_delivery: {
    regulated: true,
    defaultTool: 'digilocker',
    scopes: ['identity.verify', 'scheme.eligibility', 'consent.record']
  },
  health_record_read: {
    regulated: true,
    defaultTool: 'abha',
    scopes: ['health.record.read', 'consent.record']
  },
  labor_match_post: {
    regulated: true,
    defaultTool: 'upi_escrow',
    scopes: ['labor.match', 'worker.notify', 'upi.escrow']
  },
  mesh_storage: {
    regulated: false,
    defaultTool: 'mesh.storage',
    scopes: ['mesh.store']
  },
  memory_read: {
    regulated: true,
    defaultTool: 'memory.vault',
    scopes: ['memory.read', 'consent.record']
  },
  service_booking: {
    // §9B: the user's agent books a third-party service (cab, hotel, ticket,
    // food, grocery, professional services). Bharat OS owns the L6
    // marketplace; ONDC bridge is an internal Phase A density source.
    // Tokenized everywhere; the user pays the provider directly.
    regulated: true,
    defaultTool: 'bharat_marketplace',
    scopes: ['service.book', 'consent.record', 'upi.settle']
  }
};

export function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function normalizeScopes(scopes = []) {
  if (typeof scopes === 'string') {
    return scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
      .sort();
  }

  return [...new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))].sort();
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

// Keep resolveActionRequest idempotent: Number(null) is 0, so a second pass on
// an already-resolved request would silently flip `null` to `0`. Branch on
// null/undefined explicitly.
function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function grantPayloadFrom(consent) {
  return {
    protocolVersion: consent.protocolVersion,
    objectType: consent.objectType,
    subjectId: consent.subjectId,
    granteeId: consent.granteeId,
    scopes: consent.scopes,
    purpose: consent.purpose,
    constraints: consent.constraints ?? {},
    issuedAt: consent.issuedAt,
    expiresAt: consent.expiresAt
  };
}

function revocationPayloadFrom(consent, { reason, revokedAt, revokedBy }) {
  return {
    protocolVersion: PHASE1_PROTOCOL_VERSION,
    objectType: 'consent-revocation',
    consentId: consent.consentId,
    subjectId: consent.subjectId,
    granteeId: consent.granteeId,
    reason,
    revokedAt,
    revokedBy
  };
}

export function listPolicies() {
  return DEFAULT_POLICIES;
}

export function createConsent({
  subjectId,
  granteeId,
  scopes,
  purpose,
  ttlDays = 30,
  expiresAt,
  constraints = {}
}) {
  if (!subjectId) throw new Error('subjectId is required.');
  if (!granteeId) throw new Error('granteeId is required.');
  if (!purpose) throw new Error('purpose is required.');

  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) {
    throw new Error('at least one consent scope is required.');
  }

  const issuedAt = nowIso();
  const core = {
    protocolVersion: PHASE1_PROTOCOL_VERSION,
    objectType: 'consent-artifact',
    subjectId,
    granteeId,
    scopes: normalizedScopes,
    purpose,
    constraints,
    issuedAt,
    expiresAt: expiresAt ?? addDays(issuedAt, ttlDays)
  };

  return {
    consentId: idFrom('bos:consent', core),
    status: 'active',
    ...core
  };
}

export function revokeConsent(
  consent,
  { reason = 'revoked_by_subject', at = nowIso(), revokedBy = consent.subjectId } = {}
) {
  const revokedAt = at;
  const revocationCore = revocationPayloadFrom(consent, { reason, revokedAt, revokedBy });

  return {
    ...consent,
    status: 'revoked',
    revokedAt,
    revokeReason: reason,
    revocation: {
      revocationId: idFrom('bos:consent-revocation', revocationCore),
      ...revocationCore
    }
  };
}

export function consentLifecycle(consent, { at = nowIso() } = {}) {
  if (!consent) {
    return { status: 'missing', active: false, reason: 'missing_consent' };
  }

  if (consent.status === 'revoked') {
    return {
      status: 'revoked',
      active: false,
      reason: consent.revokeReason ?? 'revoked',
      revokedAt: consent.revokedAt
    };
  }

  const expiresAt = new Date(consent.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt <= new Date(at).getTime()) {
    return {
      status: 'expired',
      active: false,
      reason: 'expired',
      expiresAt: consent.expiresAt
    };
  }

  if (consent.status !== 'active') {
    return {
      status: consent.status ?? 'unknown',
      active: false,
      reason: 'inactive_status'
    };
  }

  return { status: 'active', active: true, reason: 'active', expiresAt: consent.expiresAt };
}

export function consentSummary(consent, options = {}) {
  const lifecycle = consentLifecycle(consent, options);
  return {
    consentId: consent.consentId,
    subjectId: consent.subjectId,
    granteeId: consent.granteeId,
    scopes: consent.scopes,
    purpose: consent.purpose,
    status: lifecycle.status,
    active: lifecycle.active,
    reason: lifecycle.reason,
    issuedAt: consent.issuedAt,
    expiresAt: consent.expiresAt,
    revokedAt: consent.revokedAt,
    revokeReason: consent.revokeReason,
    signatureCount: consent.signatures?.length ?? 0
  };
}

export function consentCovers(consent, { subjectId, granteeId, scopes, at = nowIso() }) {
  if (!consentLifecycle(consent, { at }).active) return false;
  if (consent.subjectId !== subjectId) return false;
  if (granteeId && consent.granteeId !== granteeId) return false;

  const consentScopes = new Set(consent.scopes ?? []);
  return normalizeScopes(scopes).every((scope) => consentScopes.has(scope));
}

function check(status, policyId, message, extra = {}) {
  return { status, policyId, message, ...extra };
}

function resolveActionRequest(request) {
  const template = ACTION_TEMPLATES[request.actionType] ?? {};
  const labor = request.labor ?? {};
  const mediation = request.mediation ?? null;
  return {
    requestId: request.requestId ?? idFrom('bos:intent', { at: nowIso(), request }),
    actorId: request.actorId,
    granteeId: request.granteeId ?? 'bharat-os-orchestrator',
    actionType: request.actionType ?? 'custom',
    tool: request.tool ?? template.defaultTool ?? 'unknown',
    scopes: normalizeScopes(request.scopes ?? template.scopes ?? []),
    regulated: request.regulated ?? template.regulated ?? false,
    piiHandling: request.piiHandling ?? 'none',
    identity: {
      aadhaarRequired: Boolean(request.identity?.aadhaarRequired),
      fallbackAvailable: request.identity?.fallbackAvailable !== false,
      fallbackType: request.identity?.fallbackType ?? 'pan_or_digilocker',
      ageAttested: Boolean(request.identity?.ageAttested),
      ageMinimum: numberOrNull(request.identity?.ageMinimum)
    },
    money: {
      amount: Number(request.money?.amount ?? 0),
      currency: request.money?.currency ?? 'INR',
      limit: request.money?.limit,
      workerPays: Boolean(request.money?.workerPays),
      escrow: Boolean(request.money?.escrow)
    },
    labor: {
      days: Number(labor.days ?? 1),
      headcount: Number(labor.headcount ?? 1),
      wageFloorPerDay: numberOrNull(labor.wageFloorPerDay),
      legalMinAge: numberOrNull(labor.legalMinAge) ?? 18
    },
    mediation: mediation
      ? {
          channel: mediation.channel ?? 'kiosk',
          kioskOperatorId: mediation.kioskOperatorId ?? null,
          workerAuthorizationId:
            mediation.workerAuthorization?.authorizationId ?? mediation.workerAuthorizationId ?? null,
          workerAuthorization: mediation.workerAuthorization ?? null
        }
      : null,
    metadata: request.metadata ?? {}
  };
}

export function evaluateDecision(request, consents = [], { at = nowIso(), publicRecords = [] } = {}) {
  const resolved = resolveActionRequest(request);
  const checks = [];

  if (!resolved.actorId) {
    checks.push(check('fail', 'policy.identity.actor_required', 'An actor identity is required.'));
  }

  if (resolved.regulated) {
    const candidateConsents = consents
      .filter((consent) => consent.subjectId === resolved.actorId)
      .filter((consent) => !resolved.granteeId || consent.granteeId === resolved.granteeId)
      .map((consent) => consentSummary(consent, { at }));
    const coveringConsents = consents.filter((consent) =>
      consentCovers(consent, {
        subjectId: resolved.actorId,
        granteeId: resolved.granteeId,
        scopes: resolved.scopes,
        at
      })
    );

    if (coveringConsents.length === 0) {
      checks.push(
        check(
          'fail',
          'policy.consent.required_for_regulated_action',
          'No active consent covers the regulated action scopes.',
          { requiredScopes: resolved.scopes, candidateConsents }
        )
      );
    } else {
      checks.push(
        check(
          'pass',
          'policy.consent.required_for_regulated_action',
          'Active consent covers the regulated action scopes.',
          { consentIds: coveringConsents.map((consent) => consent.consentId) }
        )
      );
    }
  } else {
    checks.push(
      check('pass', 'policy.consent.required_for_regulated_action', 'Action is not regulated.')
    );
  }

  if (resolved.piiHandling === 'raw') {
    checks.push(
      check('fail', 'policy.pii.no_raw_pii_to_model', 'Raw PII cannot be passed to model context.')
    );
  } else {
    checks.push(
      check('pass', 'policy.pii.no_raw_pii_to_model', 'PII handling is tokenized, summarized, or absent.')
    );
  }

  if (resolved.identity.aadhaarRequired && !resolved.identity.fallbackAvailable) {
    checks.push(
      check('fail', 'policy.identity.aadhaar_optional', 'Aadhaar is mandatory and no fallback is available.')
    );
  } else {
    checks.push(
      check('pass', 'policy.identity.aadhaar_optional', 'Aadhaar remains optional with a fallback path.')
    );
  }

  // policy.worker.no_advance_fee — §15 binding; applies to ANY action that has
  // workerPays set, not only labor flows.
  if (resolved.money.workerPays) {
    checks.push(
      check('fail', 'policy.worker.no_advance_fee', 'Workers cannot be charged to access or accept services.')
    );
  } else {
    checks.push(
      check('pass', 'policy.worker.no_advance_fee', 'No worker access fee detected.')
    );
  }

  // policy.worker.escrow_required — §9A: wage non-payment defense.
  if (resolved.actionType === 'labor_match_post') {
    const escrowed = resolved.money.escrow === true || resolved.tool === 'upi_escrow';
    if (!escrowed) {
      checks.push(
        check('fail', 'policy.worker.escrow_required', 'Labor flows must hold wages in escrow until verified completion.')
      );
    } else {
      checks.push(
        check('pass', 'policy.worker.escrow_required', 'Wage escrow is declared.')
      );
    }
  } else {
    checks.push(
      check('pass', 'policy.worker.escrow_required', 'Not a labor flow; escrow not required.')
    );
  }

  // policy.worker.minimum_wage_floor — §9A: minimum-wage-floor checks encoded
  // in the policy engine. Floor is per-worker-per-day in INR.
  if (resolved.actionType === 'labor_match_post') {
    const { amount } = resolved.money;
    const { days, headcount, wageFloorPerDay } = resolved.labor;
    const workerDays = Math.max(days * headcount, 1);
    const perWorkerPerDay = amount > 0 ? amount / workerDays : 0;
    if (wageFloorPerDay === null) {
      checks.push(
        check(
          'fail',
          'policy.worker.minimum_wage_floor',
          'Labor flows must declare a minimum wage floor (labor.wageFloorPerDay).'
        )
      );
    } else if (amount <= 0) {
      checks.push(
        check(
          'fail',
          'policy.worker.minimum_wage_floor',
          'Labor flows must declare a positive wage amount.'
        )
      );
    } else if (perWorkerPerDay < wageFloorPerDay) {
      checks.push(
        check(
          'fail',
          'policy.worker.minimum_wage_floor',
          `Wage ₹${perWorkerPerDay.toFixed(2)}/worker/day is below the declared floor of ₹${wageFloorPerDay}/day.`,
          { perWorkerPerDay, wageFloorPerDay }
        )
      );
    } else {
      checks.push(
        check(
          'pass',
          'policy.worker.minimum_wage_floor',
          `Wage meets the declared floor of ₹${wageFloorPerDay}/worker/day.`,
          { perWorkerPerDay, wageFloorPerDay }
        )
      );
    }
  } else {
    checks.push(
      check('pass', 'policy.worker.minimum_wage_floor', 'Not a labor flow.')
    );
  }

  // policy.worker.age_verification — §9A: child-labour safeguard.
  if (resolved.actionType === 'labor_match_post') {
    const { ageAttested, ageMinimum } = resolved.identity;
    const { legalMinAge } = resolved.labor;
    if (!ageAttested) {
      checks.push(
        check(
          'fail',
          'policy.worker.age_verification',
          'Worker age must be attested (identity.ageAttested=true) before a labor flow runs.'
        )
      );
    } else if (ageMinimum !== null && ageMinimum < legalMinAge) {
      checks.push(
        check(
          'fail',
          'policy.worker.age_verification',
          `Attested minimum age ${ageMinimum} is below the legal minimum ${legalMinAge}.`,
          { ageMinimum, legalMinAge }
        )
      );
    } else {
      checks.push(
        check('pass', 'policy.worker.age_verification', 'Worker age attested at or above the legal minimum.')
      );
    }
  } else {
    checks.push(
      check('pass', 'policy.worker.age_verification', 'Not a labor flow.')
    );
  }

  // policy.mediation.requires_worker_authorization — §9A design problem A:
  // a kiosk/CSC operator can help, but cannot ACT as the worker. The
  // mediation must carry a signed worker-authorization receipt (Phase 1.41
  // upgraded this from an opaque ID to a verified artifact).
  if (resolved.mediation && resolved.mediation.kioskOperatorId) {
    const auth = resolved.mediation.workerAuthorization;
    if (!auth) {
      checks.push(
        check(
          'fail',
          'policy.mediation.requires_worker_authorization',
          'Assisted/kiosk channel requires a signed worker authorization receipt (mediation.workerAuthorization).',
          { kioskOperatorId: resolved.mediation.kioskOperatorId }
        )
      );
    } else {
      const workerPublic = publicRecords.find((record) => record.id === auth.workerId);
      const verification = verifyWorkerAuthorization(auth, workerPublic, { at });
      if (!verification.valid) {
        checks.push(
          check(
            'fail',
            'policy.mediation.requires_worker_authorization',
            `Worker authorization invalid: ${verification.reasons.join('; ')}`,
            {
              kioskOperatorId: resolved.mediation.kioskOperatorId,
              workerAuthorizationId: resolved.mediation.workerAuthorizationId,
              workerId: auth.workerId,
              reasons: verification.reasons
            }
          )
        );
      } else if (auth.workerId !== resolved.actorId) {
        checks.push(
          check(
            'fail',
            'policy.mediation.requires_worker_authorization',
            'Worker authorization does not name this actor as the worker.',
            {
              authorizationWorkerId: auth.workerId,
              actorId: resolved.actorId
            }
          )
        );
      } else {
        checks.push(
          check(
            'pass',
            'policy.mediation.requires_worker_authorization',
            'Worker authorization is signed by the worker and verifies cleanly.',
            {
              kioskOperatorId: resolved.mediation.kioskOperatorId,
              workerAuthorizationId: resolved.mediation.workerAuthorizationId,
              workerId: auth.workerId
            }
          )
        );
      }
    }
  } else {
    checks.push(
      check('pass', 'policy.mediation.requires_worker_authorization', 'Self-service flow; no mediation present.')
    );
  }

  // policy.money.fiat_settlement_only — §15 binding: no tokens.
  if (resolved.money.amount > 0) {
    if (!ALLOWED_SETTLEMENT_CURRENCIES.has(resolved.money.currency)) {
      checks.push(
        check(
          'fail',
          'policy.money.fiat_settlement_only',
          `Settlement currency ${resolved.money.currency} is not on the fiat allow-list; tokens and crypto are out (§15).`,
          { currency: resolved.money.currency }
        )
      );
    } else {
      checks.push(
        check('pass', 'policy.money.fiat_settlement_only', 'Settlement currency is fiat (INR).')
      );
    }
  } else {
    checks.push(
      check('pass', 'policy.money.fiat_settlement_only', 'No monetary settlement in this action.')
    );
  }

  if (resolved.money.amount > 0 && (!resolved.money.limit || !resolved.money.currency)) {
    checks.push(
      check('fail', 'policy.money.limit_required', 'Monetary action requires an explicit limit and currency.')
    );
  } else {
    checks.push(
      check('pass', 'policy.money.limit_required', 'Monetary limits are explicit or not required.')
    );
  }

  const approved = checks.every((item) => item.status !== 'fail');
  const plan = approved
    ? [
        { step: 'verify_identity', layer: 'L5', status: 'ready' },
        { step: 'record_consent', layer: 'L4', status: resolved.regulated ? 'required' : 'optional' },
        { step: 'invoke_tool', layer: 'L3', tool: resolved.tool, status: 'ready' },
        { step: 'write_audit_receipt', layer: 'L4', status: 'ready' }
      ]
    : [
        { step: 'block_execution', layer: 'L4', status: 'blocked' },
        { step: 'explain_required_fixes', layer: 'L8', status: 'ready' }
      ];
  const core = {
    protocolVersion: PHASE1_PROTOCOL_VERSION,
    objectType: 'decision-evaluation',
    request: resolved,
    approved,
    checks,
    plan,
    evaluatedAt: at
  };

  return {
    decisionId: idFrom('bos:decision', core),
    auditHash: sha256Hex(stableStringify(core)),
    ...core
  };
}
