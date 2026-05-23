import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { consentSummary } from './policy.mjs';

export const SKILL_TRACE_PROTOCOL_VERSION = 'bos.phase1.skill-trace.v0';

function retrySourceId(preflight) {
  return preflight.decision?.request?.metadata?.retryOfPreflightId;
}

function expandRelatedPreflights(rootPreflight, preflights) {
  const relatedIds = new Set([rootPreflight.preflightId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const preflight of preflights) {
      const sourceId = retrySourceId(preflight);
      if (relatedIds.has(preflight.preflightId) && sourceId && !relatedIds.has(sourceId)) {
        relatedIds.add(sourceId);
        changed = true;
      }
      if (sourceId && relatedIds.has(sourceId) && !relatedIds.has(preflight.preflightId)) {
        relatedIds.add(preflight.preflightId);
        changed = true;
      }
    }
  }

  return preflights
    .filter((preflight) => relatedIds.has(preflight.preflightId))
    .sort((left, right) => String(left.checkedAt).localeCompare(String(right.checkedAt)));
}

function actionFromPreflight(preflight) {
  const request = preflight.decision?.request ?? {};
  return {
    actorId: request.actorId,
    granteeId: request.granteeId,
    actionType: request.actionType,
    tool: request.tool,
    scopes: request.scopes ?? []
  };
}

function consentMatchesAction(consent, action) {
  if (!action.actorId) return false;
  if (consent.subjectId !== action.actorId) return false;
  if (action.granteeId && consent.granteeId !== action.granteeId) return false;

  const consentScopes = new Set(consent.scopes ?? []);
  return (action.scopes ?? []).some((scope) => consentScopes.has(scope));
}

function summarizePreflight(preflight) {
  return {
    preflightId: preflight.preflightId,
    retryOfPreflightId: retrySourceId(preflight),
    skillId: preflight.skillId,
    manifestId: preflight.manifestId,
    decisionId: preflight.decisionId,
    approved: preflight.approved,
    remediationStatus: preflight.remediation?.status ?? 'none',
    failedPolicyIds: preflight.remediation?.failedPolicyIds ?? [],
    checkedAt: preflight.checkedAt
  };
}

function summarizeExecution(execution) {
  return {
    executionId: execution.executionId,
    skillPreflightId: execution.skillPreflightId,
    decisionId: execution.decisionId,
    status: execution.status,
    toolId: execution.toolReceipt?.toolId ?? execution.decision?.request?.tool,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt
  };
}

export function createSkillInvocationTrace(
  rootPreflight,
  {
    preflights = [],
    executions = [],
    decisions = [],
    consents = [],
    ledgerEvents = []
  } = {}
) {
  const allPreflights = preflights.some((preflight) => preflight.preflightId === rootPreflight.preflightId)
    ? preflights
    : [...preflights, rootPreflight];
  const relatedPreflights = expandRelatedPreflights(rootPreflight, allPreflights);
  const relatedIds = new Set(relatedPreflights.map((preflight) => preflight.preflightId));
  const action = actionFromPreflight(rootPreflight);
  const relatedExecutions = executions
    .filter((execution) => relatedIds.has(execution.skillPreflightId))
    .sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)));
  const relatedDecisionIds = new Set([
    ...relatedPreflights.map((preflight) => preflight.decisionId),
    ...relatedExecutions.map((execution) => execution.decisionId)
  ]);
  const relatedDecisions = decisions
    .filter((decision) => relatedDecisionIds.has(decision.decisionId))
    .map((decision) => ({
      decisionId: decision.decisionId,
      approved: decision.approved,
      actionType: decision.request?.actionType,
      tool: decision.request?.tool,
      failedPolicyIds: (decision.checks ?? [])
        .filter((check) => check.status === 'fail')
        .map((check) => check.policyId),
      evaluatedAt: decision.evaluatedAt
    }))
    .sort((left, right) => String(left.evaluatedAt).localeCompare(String(right.evaluatedAt)));
  const relatedConsents = consents
    .filter((consent) => consentMatchesAction(consent, action))
    .map((consent) => consentSummary(consent))
    .sort((left, right) => String(left.issuedAt).localeCompare(String(right.issuedAt)));
  const relatedLedgerEvents = ledgerEvents
    .filter((event) =>
      relatedIds.has(event.preflightId) ||
      relatedDecisionIds.has(event.decisionId) ||
      relatedExecutions.some((execution) => execution.executionId === event.executionId) ||
      relatedConsents.some((consent) => consent.consentId === event.consentId)
    )
    .sort((left, right) => String(left.at).localeCompare(String(right.at)));
  const status = relatedExecutions.at(-1)?.status ?? (relatedPreflights.at(-1)?.approved ? 'approved' : 'blocked');
  const evidence = {
    rootPreflightId: relatedPreflights[0]?.preflightId ?? rootPreflight.preflightId,
    requestedPreflightId: rootPreflight.preflightId,
    preflights: relatedPreflights.map(summarizePreflight),
    executions: relatedExecutions.map(summarizeExecution),
    consentIds: relatedConsents.map((consent) => consent.consentId),
    decisionIds: relatedDecisions.map((decision) => decision.decisionId),
    ledgerEvents: relatedLedgerEvents.map((event) => stableStringify(event))
  };
  const evidenceHash = sha256Hex(stableStringify(evidence));
  const core = {
    protocolVersion: SKILL_TRACE_PROTOCOL_VERSION,
    objectType: 'skill-invocation-trace',
    rootPreflightId: relatedPreflights[0]?.preflightId ?? rootPreflight.preflightId,
    requestedPreflightId: rootPreflight.preflightId,
    skillId: rootPreflight.skillId,
    actorId: action.actorId,
    actionType: action.actionType,
    tool: action.tool,
    status,
    preflightIds: relatedPreflights.map((preflight) => preflight.preflightId),
    executionIds: relatedExecutions.map((execution) => execution.executionId),
    consentIds: relatedConsents.map((consent) => consent.consentId),
    decisionIds: relatedDecisions.map((decision) => decision.decisionId),
    preflights: relatedPreflights.map(summarizePreflight),
    executions: relatedExecutions.map(summarizeExecution),
    consents: relatedConsents,
    decisions: relatedDecisions,
    ledgerEvents: relatedLedgerEvents,
    privacy: {
      exposure: 'metadata_and_receipts_only',
      rawPiiIncluded: false,
      memoryPlaintextIncluded: false,
      privateKeyIncluded: false
    },
    evidenceHash,
    generatedAt: new Date().toISOString()
  };

  return {
    traceId: `bos:skill-trace:${evidenceHash.slice(0, 32)}`,
    ...core
  };
}
