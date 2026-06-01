import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createIdentity, publicIdentity } from './core.mjs';
import { renderBootstrapMarkdown, simulateDemandBootstrap } from './simulate.mjs';
import {
  consentLifecycle,
  consentSummary,
  createConsent,
  evaluateDecision,
  ACTION_TEMPLATES,
  listPolicies,
  revokeConsent
} from '../phase1/policy.mjs';
import { createBlockedToolExecution, executeToolAction, listTools } from '../phase1/tools.mjs';
import {
  listOrchestrationTemplates,
  orchestrateIntent
} from '../phase1/orchestrator.mjs';
import {
  normaliseIntentAnnotation,
  compareIntentAnnotation,
  buildIntentAnnotationLedgerEvent
} from './intent-annotation.mjs';
import {
  withIdempotency,
  IdempotencyError
} from './idempotency.mjs';
import {
  createMemoryRecord,
  memoryProvenance,
  memorySummary,
  readMemoryRecordWithConsent,
  searchMemoryRecords
} from '../phase1/memory.mjs';
import {
  evaluateSkillPreflight,
  listSkills,
  readSkill,
  skillForTool,
  verifySkillManifestIntegrity
} from '../phase1/skills.mjs';
import { createSkillInvocationTrace } from '../phase1/skill-trace.mjs';
import {
  publicRecordsFromIdentities,
  signConsent,
  signConsentRevocation,
  verifyArtifactIntegrity
} from '../phase1/integrity.mjs';
import {
  createTrustPassport,
  createTrustPassports,
  signTrustPassportSnapshot,
  verifyTrustPassportSnapshot
} from '../phase1/trust-passport.mjs';
import {
  createWorkerAuthorization,
  signWorkerAuthorization,
  verifyWorkerAuthorization
} from '../phase1/worker-authorization.mjs';
import {
  createFlagReport,
  flagSummaryForSubject,
  resolveFlagReport,
  signFlagReport,
  verifyFlagReport
} from '../phase1/flag-report.mjs';
import {
  aggregateMeshByMonth,
  createMeshContributionEvent,
  meshContributionSummary,
  meshMonthlyStatement,
  MESH_PAYOUT_RATES
} from '../phase1/mesh-contribution.mjs';
import {
  claimPairingSession,
  completePairingSession,
  createPairingSession,
  expirePairingSession,
  lookupByClaimCode,
  recordSdp
} from '../phase1/pairing-session.mjs';
import { generateRecoveryPhrase } from '../phase1/device-pairing.mjs';
import { gatherDailyBriefSignals } from '../phase1/daily-brief.mjs';
import {
  collectUserData,
  DEFAULT_DPO_CONTACT,
  erasureManifest,
  redactLedgerEntry
} from '../phase1/dpdp-rights.mjs';
import { applySecurityHeaders } from './security-headers.mjs';
import {
  clientKey,
  createLimiter,
  policyFor
} from './rate-limiter.mjs';
import { generateRequestId, logger, safePath } from './logger.mjs';
import { recordBackupFreshness, recordRequest, renderMetrics } from './metrics.mjs';
import { listSnapshots } from './backup.mjs';
import { readVapidConfig, sendPushToIdentity } from './web-push.mjs';
import { normalisePhone, sendSms } from './sms-provider.mjs';
import {
  createPhoneOtp,
  PHONE_OTP_PURPOSES,
  verifyPhoneOtp
} from '../phase1/phone-otp.mjs';
import {
  buildRecoveryBundle,
  findIdentityByPhone,
  startAccountRecovery,
  verifyAccountRecovery
} from '../phase1/account-recovery.mjs';
import {
  applyRecoveryCooldown,
  assertNoCooldown,
  clearRecoveryCooldown,
  cooldownState,
  COOLDOWN_SCOPES
} from '../phase1/recovery-cooldown.mjs';
import { checkAdminAuth } from './admin-auth.mjs';
import {
  aggregateByMonth,
  createEarningsEntry,
  EARNINGS_CATEGORIES,
  monthlyStatement
} from '../phase1/earnings-log.mjs';
import { taxSummary } from '../phase1/tax-summary.mjs';
import {
  aggregateAttestationsForWorker,
  ATTESTATION_CATEGORIES,
  ATTESTATION_TIERS,
  buildTier2SignaturePayload,
  createPortableAttestationToken,
  PORTABLE_ATTESTATION_PROTOCOL_VERSION,
  signTier0,
  signTier1,
  verifyTier2
} from '../phase1/portable-attestation.mjs';
import { sha256Hex } from './core.mjs';
import {
  buildIncomeVerificationBundle,
  createIncomeVerificationConsent,
  recordConsentRead,
  revokeIncomeVerificationConsent,
  verifyIncomeVerificationConsent
} from '../phase1/income-verification.mjs';
import {
  computeAvailableBalance,
  createWithdrawalRequest as createMeshWithdrawalRequest,
  markWithdrawalAccepted,
  markWithdrawalFailed,
  markWithdrawalPaid,
  maskUpiId,
  MESH_WITHDRAWAL_LIMITS
} from '../phase1/mesh-withdrawal.mjs';
import {
  createBlessedCollectiveRecord,
  createMembershipAttestation,
  MEMBER_ROLES,
  revokeMembershipAttestation,
  verifyMembershipAttestation
} from '../phase1/collective-membership.mjs';
import {
  createEShramRegistration,
  createSchemeEntitlement,
  OCCUPATION_CATEGORIES,
  revokeEShramRegistration,
  revokeSchemeEntitlement,
  WELFARE_SCHEME_CODES
} from '../phase1/eshram-registration.mjs';
import { resetCircuit } from './sms-provider.mjs';
import {
  applyRetention,
  ensureBackupDir,
  snapshotPath
} from './backup.mjs';

const MAX_REQUEST_BODY_BYTES = 1024 * 1024; // 1 MiB — guards against OOM
const TRUST_PROXY = process.env?.BHARAT_OS_TRUST_PROXY === '1';
const ENABLE_HSTS = process.env?.BHARAT_OS_HSTS === '1';

// Optional CORS allowlist via env. Comma-separated list of origins
// permitted to call the API; empty string = same-origin only.
const CORS_ALLOWLIST = (process.env?.BHARAT_OS_CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
import {
  signTrustAttestation,
  verifyTrustAttestation
} from '../phase1/trust-attestation.mjs';
import {
  aggregateRound,
  createFederatedRound,
  createGradientUpdate,
  describeRound,
  FEDERATED_ROUND_WORKLOAD,
  openRound,
  submitGradientUpdate
} from '../phase1/federated-round.mjs';
import { createHealthDocumentCapture } from '../phase1/health-document.mjs';
import {
  createProfileAuthChallenge,
  createProfileCredentialRecord,
  verifyProfileCredentialAssertion
} from '../phase1/profile-auth.mjs';
import {
  createPushSubscriptionRecord,
  createWorkerNotification
} from '../phase1/worker-notification.mjs';
import {
  createTtsModelPack,
  createTtsRuntimePlan,
  createVoiceModelPack,
  createVoiceRuntimePlan,
  INDIC_ASR_LOCALES,
  INDIC_TTS_LOCALES
} from '../phase1/voice-runtime.mjs';
import {
  createOnDeviceModelPack,
  createOnDeviceRuntimePlan,
  ON_DEVICE_TASKS
} from '../phase1/on-device-model.mjs';
import {
  createSlmModelPack,
  filterCompatibleSlmModelPacks,
  revokeSlmModelPack,
  SLM_RUNTIMES,
  SLM_QUANTIZATIONS,
  SLM_LICENSES,
  SLM_CAPABILITIES
} from '../phase1/slm-model-pack.mjs';
import {
  createInstalledSlmRecord,
  INSTALLED_SLM_STATUSES
} from '../phase1/installed-slm.mjs';
import {
  createSponsor,
  publicSponsor,
  publicSponsorDirectory,
  depositEscrow,
  lockEscrow,
  debitLockedEscrow,
  refundLockedEscrow,
  revokeSponsor,
  SPONSOR_STATUSES
} from '../phase1/sponsor.mjs';
import { checkSponsorAuth } from './sponsor-auth.mjs';
import {
  createLabelingJob,
  createLabelingJobItem,
  createLabelingSubmission,
  workerCanClaim,
  totalLaunchCostPaise,
  computeWorkerScore,
  matchesGoldenAnswer,
  shouldSampleForReview,
  LABELING_TASK_KINDS,
  LABELING_MODALITIES,
  QC_REJECTED_STATUSES
} from '../phase1/labeling-job.mjs';
import {
  buildLabelingExportLines,
  bundleNdjson,
  LABELING_EXPORT_PROTOCOL_VERSION
} from '../phase1/labeling-export.mjs';
import {
  createProviderIdentity,
  attestProviderKyc,
  transitionProviderStatus,
  updateProviderProfile,
  publicProviderRecord,
  PROVIDER_ROLE_KINDS,
  PROVIDER_KYC_LEVELS,
  PROVIDER_IDENTITY_STATUSES
} from '../phase1/provider-identity.mjs';
import {
  validateRoleAnswers,
  getProviderRoleForm,
  PROVIDER_ROLE_FORMS
} from '../phase1/provider-role-forms.mjs';
import {
  haversineMeters,
  distanceBand,
  rankProviders,
  DEFAULT_QUERY_RADIUS_M,
  MAX_QUERY_RADIUS_M
} from '../phase1/marketplace-discovery.mjs';
import {
  createBooking,
  acceptBooking,
  rejectBooking,
  cancelBooking,
  markBookingComplete,
  citizenConfirmComplete,
  fileDispute,
  adjudicateDispute,
  maybeAutoRelease,
  publicBookingForCitizen,
  publicBookingForProvider,
  BOOKING_TERMINAL_STATUSES,
  BOOKING_REFUND_TERMINAL_STATUSES,
  BOOKING_PAYOUT_TERMINAL_STATUSES,
  BOOKING_PRICING_BASES
} from '../phase1/booking.mjs';
import {
  createCitizenEscrow,
  depositCitizenEscrow,
  lockCitizenEscrow,
  debitLockedCitizenEscrow,
  refundLockedCitizenEscrow,
  publicCitizenEscrow,
  availableCitizenEscrow
} from '../phase1/citizen-escrow.mjs';
import {
  requireProviderOwnerAuth,
  requireBookingPartyAuth,
  requireCitizenOwnerAuth,
  ProviderAuthError
} from './provider-auth.mjs';
import {
  buildProviderNewBookingPush,
  buildCitizenBookingAcceptedPush,
  buildCitizenMarkedCompletePush,
  buildProviderPayoutPush,
  buildCitizenRefundPush,
  buildProviderDisputeFiledPush,
  buildCitizenDisputeFiledPush
} from './booking-push.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../..');
const consoleRoot = path.join(repoRoot, 'public/operator-console');
const shellRoot = path.join(repoRoot, 'public/shell');
const verifyRoot = path.join(repoRoot, 'public/verify');
const legalRoot = path.join(repoRoot, 'public/legal');
const signsRoot = path.join(repoRoot, 'public/signs');

function jsonResponse(response, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(`${body}\n`);
}

function textResponse(response, statusCode, value, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  response.end(value);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webmanifest' || ext === '.json') return 'application/manifest+json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

async function staticResponse(response, filePath) {
  const body = await fs.readFile(filePath);
  const base = path.basename(filePath);
  // PWA app-shell assets need to be cacheable so the service worker can
  // store them for offline use. Everything else stays no-store so dev
  // iteration on the console doesn't fight the cache.
  const cacheable = ['manifest.webmanifest', 'icon.svg', 'service-worker.js'].includes(base);
  response.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'cache-control': cacheable ? 'public, max-age=3600' : 'no-store'
  });
  response.end(body);
}

function notFound(response, path) {
  jsonResponse(response, 404, {
    error: {
      code: 'not_found',
      message: `No Phase 0 API route for ${path}.`
    }
  });
}

function methodNotAllowed(response, allowed) {
  response.writeHead(405, {
    allow: allowed.join(', '),
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(
    `${JSON.stringify({
      error: {
        code: 'method_not_allowed',
        message: `Allowed methods: ${allowed.join(', ')}`
      }
    })}\n`
  );
}

async function readRequestJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      const error = new Error(
        `request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`
      );
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function parseInteger(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

function parseNumber(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }
  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

function toolIdFromActionRequest(request) {
  return request.tool ?? ACTION_TEMPLATES[request.actionType]?.defaultTool;
}

function ledgerQueryFromParams(searchParams) {
  return {
    limit: parseInteger(searchParams.get('limit'), 100, 'limit'),
    type: searchParams.get('type') ?? undefined
  };
}

function ndjsonFromItems(items) {
  const lines = items.map((item) => JSON.stringify(item));
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function reportSummary(report) {
  return {
    reportId: report.reportId,
    seed: report.seed,
    createdAt: report.createdAt,
    inputs: report.inputs,
    results: report.results
  };
}

function controlPlaneSummary(controlPlane, controlPlaneId) {
  return {
    controlPlaneId,
    protocolVersion: controlPlane.protocolVersion,
    createdAt: controlPlane.createdAt,
    nodeCount: Object.keys(controlPlane.nodes ?? {}).length,
    manifestCount: Object.keys(controlPlane.manifests ?? {}).length,
    commitmentCount: (controlPlane.commitments ?? []).length,
    ledgerEventCount: (controlPlane.ledger ?? []).length
  };
}

function nodeRowsFrom(controlPlane, limit = 30) {
  return Object.values(controlPlane?.nodes ?? {})
    .sort(
      (left, right) =>
        right.usedBytes - left.usedBytes ||
        right.trustScore - left.trustScore ||
        left.nodeId.localeCompare(right.nodeId)
    )
    .slice(0, limit)
    .map((node) => ({
      nodeId: node.nodeId,
      operatorId: node.operatorId,
      kycVerified: node.kycVerified,
      wifi: node.wifi,
      charging: node.charging,
      batteryPercent: node.batteryPercent,
      trustScore: node.trustScore,
      storageBytes: node.storageBytes,
      usedBytes: node.usedBytes,
      utilization: node.storageBytes > 0 ? node.usedBytes / node.storageBytes : 0,
      lastSeenAt: node.lastSeenAt
    }));
}

async function identityPublicRecords(store) {
  return publicRecordsFromIdentities(await store.listIdentities());
}

async function trustPassportContext(store) {
  const identities = await store.listIdentities();
  return {
    identities,
    consents: await store.listConsents(),
    memoryRecords: await store.listMemoryRecords(),
    skillPreflights: await store.listSkillPreflights(),
    toolExecutions: await store.listToolExecutions(),
    ledgerEvents: await store.listLedger({ limit: undefined }),
    publicRecords: publicRecordsFromIdentities(identities),
    nodes: await store.listNodes(),
    flagReports: await store.listFlagReports().catch(() => [])
  };
}

async function readIntegrityArtifact(store, artifactType, artifactId) {
  if (!artifactType) throw new Error('artifactType is required.');
  if (!artifactId) throw new Error('id is required.');

  if (artifactType === 'consent') return store.readConsent(artifactId);
  if (artifactType === 'decision') return store.readDecision(artifactId);
  if (artifactType === 'tool-execution') return store.readToolExecution(artifactId);
  if (artifactType === 'orchestration') return store.readOrchestration(artifactId);
  if (artifactType === 'skill-preflight') return store.readSkillPreflight(artifactId);
  if (artifactType === 'skill') return readSkill(artifactId);

  throw new Error(`Unsupported integrity artifact type: ${artifactType}.`);
}

function summarizeIntegrity(result) {
  if (!result) return null;
  return {
    artifactType: result.artifactType,
    valid: result.valid,
    idValid: result.idValid,
    auditHashValid: result.auditHashValid,
    signatureValid: result.signatureValid,
    signatureCount: result.signatures?.length ?? 0,
    reasons: result.reasons ?? []
  };
}

async function dashboardSnapshot(store) {
  const reports = await store.listSimulationReports();
  const identities = await store.listIdentities();
  const publicRecords = publicRecordsFromIdentities(identities);
  const consents = await store.listConsents();
  const decisions = await store.listDecisions();
  const toolExecutions = await store.listToolExecutions();
  const orchestrations = await store.listOrchestrations();
  const skillPreflights = await store.listSkillPreflights();
  const memoryRecords = await store.listMemoryRecords();
  const recentLedgerEvents = await store.listLedger({ limit: 20 });
  const consentSummaries = consents.map((consent) => consentSummary(consent));
  const activeConsents = consents.filter((consent) => consentLifecycle(consent).active);
  const latestActiveConsent = activeConsents
    .sort((left, right) => String(right.issuedAt).localeCompare(String(left.issuedAt)))
    .at(0);
  const latestReport = reports
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .at(0);
  const latestDecision = decisions
    .sort((left, right) => String(right.evaluatedAt).localeCompare(String(left.evaluatedAt)))
    .at(0);
  const latestToolExecution = toolExecutions
    .sort((left, right) => String(right.finishedAt).localeCompare(String(left.finishedAt)))
    .at(0);
  const latestOrchestration = orchestrations
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .at(0);
  const latestSkillPreflight = skillPreflights
    .sort((left, right) => String(right.checkedAt).localeCompare(String(left.checkedAt)))
    .at(0);
  const bootstrap = await maybeReadControlPlane(store, 'bootstrap');

  return {
    latestReport: latestReport ? reportSummary(latestReport) : null,
    reports: reports.map(reportSummary),
    controlPlane: bootstrap ? controlPlaneSummary(bootstrap, 'bootstrap') : null,
    nodes: bootstrap ? nodeRowsFrom(bootstrap, 30) : [],
    phase1: {
      policyCount: listPolicies().length,
      toolCount: listTools().length,
      skillCount: listSkills().length,
      consentCount: consents.length,
      activeConsentCount: consentSummaries.filter((consent) => consent.status === 'active').length,
      revokedConsentCount: consentSummaries.filter((consent) => consent.status === 'revoked').length,
      expiredConsentCount: consentSummaries.filter((consent) => consent.status === 'expired').length,
      signedConsentCount: consents.filter((consent) => (consent.signatures ?? []).length > 0).length,
      decisionCount: decisions.length,
      toolExecutionCount: toolExecutions.length,
      orchestrationCount: orchestrations.length,
      skillPreflightCount: skillPreflights.length,
      memoryRecordCount: memoryRecords.length,
      latestMemoryRecord: memoryRecords
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .map(memorySummary)
        .at(0) ?? null,
      latestActiveConsent: latestActiveConsent ? consentSummary(latestActiveConsent) : null,
      integrity: {
        consentCount: consents.length,
        signedConsentCount: consents.filter((consent) => (consent.signatures ?? []).length > 0).length,
        validConsentCount: consents.filter((consent) => verifyArtifactIntegrity(consent, publicRecords).valid).length,
        latestDecision: summarizeIntegrity(latestDecision ? verifyArtifactIntegrity(latestDecision, publicRecords) : null),
        latestToolExecution: summarizeIntegrity(
          latestToolExecution ? verifyArtifactIntegrity(latestToolExecution, publicRecords) : null
        ),
        latestOrchestration: summarizeIntegrity(
          latestOrchestration ? verifyArtifactIntegrity(latestOrchestration, publicRecords) : null
        ),
        latestSkillPreflight: summarizeIntegrity(
          latestSkillPreflight ? verifyArtifactIntegrity(latestSkillPreflight, publicRecords) : null
        )
      },
      latestDecision: latestDecision
        ? {
            decisionId: latestDecision.decisionId,
            actionType: latestDecision.request?.actionType,
            approved: latestDecision.approved,
            evaluatedAt: latestDecision.evaluatedAt,
            failedChecks: latestDecision.checks?.filter((check) => check.status === 'fail').length ?? 0
          }
        : null,
      latestToolExecution: latestToolExecution
        ? {
            executionId: latestToolExecution.executionId,
            skillPreflightId: latestToolExecution.skillPreflightId,
            status: latestToolExecution.status,
            toolId: latestToolExecution.toolReceipt?.toolId ?? latestToolExecution.decision?.request?.tool,
            actionType: latestToolExecution.decision?.request?.actionType,
            finishedAt: latestToolExecution.finishedAt
          }
        : null,
      latestSkillPreflight: latestSkillPreflight
        ? {
            preflightId: latestSkillPreflight.preflightId,
            skillId: latestSkillPreflight.skillId,
            manifestId: latestSkillPreflight.manifestId,
            decisionId: latestSkillPreflight.decisionId,
            actionType: latestSkillPreflight.decision?.request?.actionType,
            approved: latestSkillPreflight.approved,
            integrityValid: latestSkillPreflight.integrity?.valid,
            checkedAt: latestSkillPreflight.checkedAt
          }
        : null,
      latestOrchestration: latestOrchestration
        ? {
            orchestrationId: latestOrchestration.orchestrationId,
            actionType: latestOrchestration.actionRequest?.actionType,
            skillId: latestOrchestration.actionRequest?.skillId,
            skillPreflightId: latestOrchestration.skillPreflightId,
            locale: latestOrchestration.intent?.detectedLocale ?? latestOrchestration.intent?.locale,
            status: latestOrchestration.status,
            approved: latestOrchestration.approved,
            executed: latestOrchestration.executed,
            createdAt: latestOrchestration.createdAt
          }
        : null
    },
    ledger: {
      recentEvents: recentLedgerEvents
    },
    updatedAt: new Date().toISOString()
  };
}

async function maybeReadControlPlane(store, controlPlaneId) {
  try {
    return await store.readControlPlane(controlPlaneId);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function createPhase0ApiServer({ store, startedAt = new Date().toISOString() }) {
  if (!store) {
    throw new Error('store is required.');
  }

  const limiter = createLimiter();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    // Phase 4.1 — request preamble. Every response gets the security
    // headers + a request ID + access-log timing.
    const requestId = generateRequestId();
    const startNs = process.hrtime.bigint();
    applySecurityHeaders(response, { enableHsts: ENABLE_HSTS });
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');

    // CORS preflight + allowlist. Default is same-origin only; the
    // env var BHARAT_OS_CORS_ORIGINS opens it to a named list.
    const origin = request.headers.origin;
    if (origin && CORS_ALLOWLIST.includes(origin)) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('access-control-allow-credentials', 'true');
      response.setHeader('vary', 'origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('access-control-allow-headers', 'content-type, authorization, x-request-id');
      response.setHeader('access-control-max-age', '600');
      response.writeHead(204);
      response.end();
      return;
    }

    // Rate limiting — applies to /api/* and the legal/static pages.
    // Probes and the health endpoint use the 'probe' policy with a
    // higher capacity so ops scrapers don't trigger 429s.
    const key = clientKey(request, { trustProxy: TRUST_PROXY });
    const policy = policyFor(request.method ?? 'GET', url.pathname);
    const rate = limiter.consume(key, policy);
    response.setHeader('x-ratelimit-policy', policy);
    response.setHeader('x-ratelimit-remaining', Math.floor(rate.remaining).toString());
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil(rate.retryAfterSeconds));
      response.setHeader('retry-after', retryAfter.toString());
      logger.warn('rate_limited', {
        requestId,
        clientKey: key,
        policy,
        path: safePath(url.pathname),
        method: request.method
      });
      jsonResponse(response, 429, {
        error: {
          code: 'rate_limited',
          message: `Too many requests on the '${policy}' policy. Retry in ${retryAfter}s.`
        }
      });
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      recordRequest({
        method: request.method ?? 'GET',
        pathname: url.pathname,
        status: 429,
        durationSeconds
      });
      return;
    }

    // Response-finish observability — records access log + metric
    // exactly once when the response stream closes.
    let observed = false;
    const observe = () => {
      if (observed) return;
      observed = true;
      const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      recordRequest({
        method: request.method ?? 'GET',
        pathname: url.pathname,
        status: response.statusCode ?? 0,
        durationSeconds
      });
      logger.access('http_request', {
        requestId,
        method: request.method,
        path: safePath(url.pathname),
        status: response.statusCode,
        durationMs: Math.round(durationSeconds * 1000),
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 200),
        clientKey: key
      });
    };
    response.on('finish', observe);
    response.on('close', observe);

    try {
      // Health probes — Phase 4.1. /healthz is liveness (process
      // alive); /readyz is readiness (store reachable + writable).
      if (request.method === 'GET' && url.pathname === '/healthz') {
        jsonResponse(response, 200, { ok: true, uptimeSeconds: process.uptime() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const checks = { store: 'unknown' };
        try {
          await store.listIdentities();
          checks.store = 'ok';
          jsonResponse(response, 200, { ok: true, checks });
        } catch (error) {
          checks.store = `error: ${error.message}`;
          logger.error('readyz_failed', { requestId, reason: error.message });
          jsonResponse(response, 503, { ok: false, checks });
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/metrics') {
        // Phase 5.6 — refresh the backup-freshness gauges on every
        // scrape so Grafana sees current values without depending
        // on /api/admin/backup-status traffic. One readdir + stat
        // per scrape is fine (typical scrape interval ≥ 15s).
        if (store.rootPath) {
          try {
            const backupDir = path.join(store.rootPath, 'backups');
            const snapshots = await listSnapshots(backupDir);
            const latest = snapshots[0];
            recordBackupFreshness(
              latest
                ? { createdAt: latest.createdAt, bytes: latest.bytes, kind: latest.kind }
                : { createdAt: null }
            );
          } catch (_error) {
            // Best-effort. Gauge stays at last-known.
          }
        }
        const body = renderMetrics();
        response.writeHead(200, {
          'content-type': 'text/plain; version=0.0.4; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end(body);
        return;
      }

      // Phase 5.5 — backup status. Reports the most recent snapshots
      // produced by `scripts/snapshot-store.mjs`. Useful as an ops
      // signal that the backup cron is healthy + as a manual
      // verification surface before disaster-recovery testing.
      //
      // §15: snapshot metadata (filename + size + mtime) is
      // operational, not user data — it never contains identity
      // refs. The endpoint sits on the regular rate-limited surface
      // (the 'read' policy) so a misconfigured scrape can't pin
      // the API.
      if (request.method === 'GET' && url.pathname === '/api/admin/backup-status') {
        const rootPath = store.rootPath ?? null;
        if (!rootPath) {
          jsonResponse(response, 503, {
            ok: false,
            error: 'store has no rootPath — cannot enumerate snapshots'
          });
          return;
        }
        const backupDir = path.join(rootPath, 'backups');
        const snapshots = await listSnapshots(backupDir);
        const latest = snapshots[0] ?? null;
        const nowMs = Date.now();
        const latestAgeSeconds = latest
          ? Math.max(0, Math.floor((nowMs - Date.parse(latest.createdAt)) / 1000))
          : null;
        // Phase 5.6 — refresh the /metrics gauges so a scrape that
        // hits /metrics shortly after this endpoint reflects the
        // latest known snapshot.
        recordBackupFreshness(
          latest
            ? { createdAt: latest.createdAt, bytes: latest.bytes, kind: latest.kind }
            : { createdAt: null }
        );
        jsonResponse(response, 200, {
          ok: true,
          backupDir,
          snapshotCount: snapshots.length,
          latest: latest
            ? {
                name: latest.name,
                kind: latest.kind,
                bytes: latest.bytes,
                createdAt: latest.createdAt,
                ageSeconds: latestAgeSeconds
              }
            : null,
          snapshots: snapshots.slice(0, 20).map((s) => ({
            name: s.name,
            kind: s.kind,
            bytes: s.bytes,
            createdAt: s.createdAt
          }))
        });
        return;
      }

      // Phase 5.7 — ops admin endpoints. All gated by
      // `BHARAT_OS_ADMIN_TOKEN` shared secret via
      // Authorization: Bearer <token>; refuse with 503 when the
      // token isn't configured (safe default).

      // POST /api/admin/sms/circuit/reset
      // Body: { provider?: string }
      //   - provider given → reset that one
      //   - provider omitted → reset every provider
      // Emits a `sms.circuit.reset` ledger event with operator
      // attribution.
      if (
        request.method === 'POST' &&
        url.pathname === '/api/admin/sms/circuit/reset'
      ) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const body = await readRequestJson(request).catch(() => ({}));
        const provider = typeof body.provider === 'string' ? body.provider.trim() : null;
        resetCircuit(provider || undefined);
        await store.appendLedger({
          type: 'sms.circuit.reset',
          provider: provider || 'all',
          operator: auth.operator,
          at: new Date().toISOString()
        });
        logger.info('admin_circuit_reset', {
          requestId,
          operator: auth.operator,
          provider: provider || 'all'
        });
        jsonResponse(response, 200, {
          ok: true,
          provider: provider || 'all',
          operator: auth.operator
        });
        return;
      }

      // POST /api/admin/identities/:id/recovery-cooldown/clear
      // Body: { reason: string }
      // SIM-swap incident-response: ops confirms identity via a
      // secondary channel and lifts the 24h Phase 5.2 cooldown so
      // the legitimate user can resume sensitive actions.
      // ALWAYS audited via `cooldown_override.applied` ledger event.
      const cooldownClearMatch =
        /^\/api\/admin\/identities\/([^/]+)\/recovery-cooldown\/clear$/.exec(
          url.pathname
        );
      if (request.method === 'POST' && cooldownClearMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const identityId = decodeURIComponent(cooldownClearMatch[1]);
        const body = await readRequestJson(request).catch(() => ({}));
        const reason = (typeof body.reason === 'string' ? body.reason : '').trim();
        if (!reason || reason.length < 8) {
          jsonResponse(response, 400, {
            error: {
              code: 'reason_required',
              message:
                'Provide a `reason` (>=8 chars) describing the out-of-band identity verification. ' +
                'This is the audit-trail anchor for an irreversible operator action.'
            }
          });
          return;
        }
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const state = cooldownState(identity);
        const cleared = clearRecoveryCooldown(identity);
        await store.saveIdentity(cleared);
        await store.appendLedger({
          type: 'cooldown_override.applied',
          identityId,
          operator: auth.operator,
          reason: reason.slice(0, 240),
          priorCooldownUntil: state.until,
          at: new Date().toISOString()
        });
        // Phase 7.1 — push a "your cooldown was lifted by ops"
        // alert to paired devices. If the recovery wasn't the
        // legitimate user, this is their second chance to escalate.
        // §15: payload body contains no PII (operator label is in
        // the ledger, NOT the push body).
        await sendPushToIdentity(
          store,
          identityId,
          {
            type: 'cooldown_override_alert',
            title: 'Your recovery cooldown was lifted by Bharat OS support',
            body:
              'If you contacted support, no action needed. If not, tap to ' +
              'report this — your account may be under attack.'
          },
          {
            urgency: 'high',
            ledgerType: 'cooldown_override.pushed',
            requestId,
            logger
          }
        );
        logger.info('admin_cooldown_cleared', {
          requestId,
          operator: auth.operator,
          identityId
        });
        jsonResponse(response, 200, {
          ok: true,
          identityId,
          priorCooldown: state,
          operator: auth.operator,
          message:
            'Cooldown cleared. The identity can resume sensitive actions. The override is in the audit ledger.'
        });
        return;
      }

      // POST /api/admin/backup/snapshot
      // Body: { keep?: number }   (default 7)
      // Triggers a snapshot immediately instead of waiting for the
      // cron. Useful before risky operations (planned migration,
      // schema change), or just to verify the snapshot pipeline is
      // working in the live deploy.
      if (
        request.method === 'POST' &&
        url.pathname === '/api/admin/backup/snapshot'
      ) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const rootPath = store.rootPath ?? null;
        if (!rootPath || typeof store.snapshotTo !== 'function') {
          jsonResponse(response, 503, {
            error: {
              code: 'snapshot_unavailable',
              message: 'Store has no snapshotTo() method or no rootPath.'
            }
          });
          return;
        }
        const body = await readRequestJson(request).catch(() => ({}));
        const keep = Number.isFinite(body.keep) && body.keep > 0 ? Math.floor(body.keep) : 7;
        const kind = store.dbPath ? 'sqlite' : 'file';
        const { backupDir, fullPath } = snapshotPath({ rootPath, kind });
        await ensureBackupDir(backupDir);
        const startedMs = Date.now();
        let report;
        try {
          report = await store.snapshotTo(fullPath);
        } catch (error) {
          logger.error('admin_snapshot_failed', { requestId, reason: error.message });
          jsonResponse(response, 500, {
            error: { code: 'snapshot_failed', message: error.message }
          });
          return;
        }
        const integrity =
          typeof store.verifyIntegrity === 'function'
            ? await store.verifyIntegrity(fullPath)
            : { ok: true, messages: ['integrity-check not supported on this backend'] };
        if (!integrity.ok) {
          // Discard the corrupt snapshot; do NOT touch retention.
          try {
            const fsModule = await import('node:fs/promises');
            await fsModule.rm(fullPath, { recursive: true, force: true });
          } catch (_error) {
            // best-effort
          }
          logger.error('admin_snapshot_integrity_failed', {
            requestId,
            messages: integrity.messages
          });
          jsonResponse(response, 500, {
            error: {
              code: 'snapshot_integrity_failed',
              messages: integrity.messages
            }
          });
          return;
        }
        const removed = await applyRetention(backupDir, { keep });
        const durationMs = Date.now() - startedMs;
        await store.appendLedger({
          type: 'backup.snapshot.created',
          kind: report.kind,
          bytes: report.bytes,
          targetPath: report.targetPath,
          operator: auth.operator,
          trigger: 'admin_endpoint',
          at: new Date().toISOString()
        });
        logger.info('admin_snapshot_complete', {
          requestId,
          operator: auth.operator,
          bytes: report.bytes,
          durationMs
        });
        jsonResponse(response, 200, {
          ok: true,
          snapshot: report,
          integrity: { ok: true, messages: integrity.messages },
          retentionRemoved: removed.length,
          durationMs,
          operator: auth.operator
        });
        return;
      }

      // Phase 9.0a — Tier-4 SLM registry, admin write.
      // POST /api/admin/slm-model-packs        → register a new pack
      // DELETE /api/admin/slm-model-packs/:id  → revoke (soft-delete)
      //   Body on DELETE: { reason?: string }
      // All gated by `BHARAT_OS_ADMIN_TOKEN` (Phase 5.7). Both emit
      // ledger events (`slm_model_pack.registered` /
      // `slm_model_pack.revoked`) with operator attribution.
      if (request.method === 'POST' && url.pathname === '/api/admin/slm-model-packs') {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const body = await readRequestJson(request);
        let pack;
        try {
          pack = createSlmModelPack({
            modelPackId: body.modelPackId,
            family: body.family,
            variant: body.variant,
            parameterCount: body.parameterCount,
            quantization: body.quantization,
            diskBytes: body.diskBytes,
            ramRequiredMb: body.ramRequiredMb,
            runtime: body.runtime,
            sourceUrl: body.sourceUrl,
            sourceHash: body.sourceHash,
            license: body.license,
            capabilities: body.capabilities,
            contextWindow: body.contextWindow,
            description: body.description,
            registeredBy: auth.operator
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_slm_model_pack', message: error.message }
          });
          return;
        }
        const existing = await store.readSlmModelPack(pack.modelPackId).catch(() => null);
        if (existing && existing.status !== 'revoked') {
          jsonResponse(response, 409, {
            error: {
              code: 'duplicate_pack',
              message: `SLM model pack ${pack.modelPackId} is already registered. Revoke it first or use a different modelPackId.`
            }
          });
          return;
        }
        await store.saveSlmModelPack(pack);
        logger.info('admin_slm_pack_registered', {
          requestId,
          operator: auth.operator,
          modelPackId: pack.modelPackId,
          family: pack.family,
          runtime: pack.runtime
        });
        jsonResponse(response, 201, { ok: true, modelPack: pack });
        return;
      }

      const slmRevokeMatch = /^\/api\/admin\/slm-model-packs\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'DELETE' && slmRevokeMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const modelPackId = decodeURIComponent(slmRevokeMatch[1]);
        const existing = await store.readSlmModelPack(modelPackId).catch(() => null);
        if (!existing) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_pack', message: 'SLM model pack not found.' }
          });
          return;
        }
        const body = await readRequestJson(request).catch(() => ({}));
        const revoked = revokeSlmModelPack(existing, {
          revokedBy: auth.operator,
          reason: body?.reason ?? null
        });
        await store.saveSlmModelPack(revoked);
        logger.info('admin_slm_pack_revoked', {
          requestId,
          operator: auth.operator,
          modelPackId,
          reason: revoked.revocationReason
        });
        jsonResponse(response, 200, { ok: true, modelPack: revoked });
        return;
      }

      // Phase 9.1 — sponsor onboarding (admin-gated). Admin posts
      // body { displayName, contactEmail? }; response returns
      // { sponsor, bearerToken }. Bearer token is shown ONCE; we
      // store only its sha256. Operator records the token in their
      // own secrets store + hands it to the sponsor securely.
      if (request.method === 'POST' && url.pathname === '/api/admin/sponsors') {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const body = await readRequestJson(request);
        let result;
        try {
          result = createSponsor({
            displayName: body.displayName,
            contactEmail: body.contactEmail,
            onboardedBy: auth.operator
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_sponsor', message: error.message }
          });
          return;
        }
        await store.saveSponsor(result.sponsor);
        logger.info('admin_sponsor_onboarded', {
          requestId,
          operator: auth.operator,
          sponsorId: result.sponsor.sponsorId,
          displayName: result.sponsor.displayName
        });
        jsonResponse(response, 201, {
          ok: true,
          sponsor: publicSponsor(result.sponsor),
          bearerToken: result.bearerToken,
          warning:
            'This bearerToken is shown ONCE. Store it securely + hand it to the sponsor. ' +
            'Bharat OS only retains its sha256.'
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/sponsors') {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const sponsors = await store.listSponsors();
        jsonResponse(response, 200, {
          sponsors: sponsors.map(publicSponsor)
        });
        return;
      }

      // POST /api/admin/sponsors/:id/deposit — admin tops up sponsor
      // escrow after confirming an off-system fiat wire / NEFT.
      // Body: { amountPaise: number, reference?: string }
      const sponsorDepositMatch = /^\/api\/admin\/sponsors\/([^/]+)\/deposit$/.exec(url.pathname);
      if (request.method === 'POST' && sponsorDepositMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const sponsorId = decodeURIComponent(sponsorDepositMatch[1]);
        const sponsor = await store.readSponsor(sponsorId).catch(() => null);
        if (!sponsor) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_sponsor', message: 'sponsor not found.' }
          });
          return;
        }
        const body = await readRequestJson(request);
        let updated;
        try {
          updated = depositEscrow(sponsor, body.amountPaise);
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_deposit', message: error.message }
          });
          return;
        }
        await store.saveSponsor(updated);
        await store.appendLedger({
          type: 'sponsor_escrow.deposited',
          sponsorId,
          amountPaise: Number(body.amountPaise),
          reference: typeof body.reference === 'string' ? body.reference.slice(0, 120) : null,
          operator: auth.operator,
          balancePaise: updated.escrowBalancePaise,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, {
          ok: true,
          sponsor: publicSponsor(updated)
        });
        return;
      }

      // DELETE /api/admin/sponsors/:id — admin revokes a sponsor.
      // Soft-delete (status: revoked) so the audit trail of past
      // rounds stays resolvable.
      const sponsorRevokeMatch = /^\/api\/admin\/sponsors\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'DELETE' && sponsorRevokeMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const sponsorId = decodeURIComponent(sponsorRevokeMatch[1]);
        const sponsor = await store.readSponsor(sponsorId).catch(() => null);
        if (!sponsor) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_sponsor', message: 'sponsor not found.' }
          });
          return;
        }
        const revoked = revokeSponsor(sponsor, { revokedBy: auth.operator });
        await store.saveSponsor(revoked);
        logger.info('admin_sponsor_revoked', {
          requestId,
          operator: auth.operator,
          sponsorId
        });
        jsonResponse(response, 200, {
          ok: true,
          sponsor: publicSponsor(revoked)
        });
        return;
      }

      // Phase 9.1 — public sponsor directory lookup (no auth).
      // Returns sponsorId + displayName + status ONLY. Used by the
      // FE rounds card to render "Sponsored by X" badges without
      // exposing escrow numbers or contact info. The authenticated
      // self-view lives at /api/sponsors/:id/self.
      const sponsorDirectoryMatch = /^\/api\/sponsors\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && sponsorDirectoryMatch) {
        const sponsorId = decodeURIComponent(sponsorDirectoryMatch[1]);
        const sponsor = await store.readSponsor(sponsorId).catch(() => null);
        if (!sponsor) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_sponsor', message: 'sponsor not found.' }
          });
          return;
        }
        jsonResponse(response, 200, { sponsor: publicSponsorDirectory(sponsor) });
        return;
      }

      // GET /api/sponsors/:id/self — sponsor-authenticated self view
      // including escrow balance. Bearer token required.
      const sponsorSelfMatch = /^\/api\/sponsors\/([^/]+)\/self$/.exec(url.pathname);
      if (request.method === 'GET' && sponsorSelfMatch) {
        const sponsorId = decodeURIComponent(sponsorSelfMatch[1]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        jsonResponse(response, 200, { sponsor: publicSponsor(sponsor) });
        return;
      }

      // POST /api/sponsors/:id/federated-rounds — sponsor creates
      // a funded round. We lock the required escrow up-front so the
      // round can pay every accepted worker update without overrunning.
      // Body matches POST /api/federated/rounds + we compute the
      // total lock as maxParticipants * payoutPaisePerUpdate.
      const sponsorRoundCreateMatch = /^\/api\/sponsors\/([^/]+)\/federated-rounds$/.exec(url.pathname);
      if (request.method === 'POST' && sponsorRoundCreateMatch) {
        const sponsorId = decodeURIComponent(sponsorRoundCreateMatch[1]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const body = await readRequestJson(request);
        const maxParticipants = Math.max(1, Math.min(10_000, Math.floor(Number(body.maxParticipants ?? 100))));
        const payoutPaisePerUpdate = Math.max(0, Math.floor(Number(body.payoutPaisePerUpdate ?? 0)));
        const escrowRequired = maxParticipants * payoutPaisePerUpdate;
        if (escrowRequired <= 0) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_round_economics',
              message: 'maxParticipants * payoutPaisePerUpdate must be > 0.'
            }
          });
          return;
        }
        let lockedSponsor;
        try {
          lockedSponsor = lockEscrow(sponsor, escrowRequired);
        } catch (error) {
          jsonResponse(response, 402, {
            error: {
              code: 'insufficient_escrow',
              message: error.message,
              requiredPaise: escrowRequired,
              availablePaise:
                lockedSponsor === undefined
                  ? sponsor.escrowBalancePaise - sponsor.escrowLockedPaise
                  : undefined
            }
          });
          return;
        }
        let round;
        try {
          round = openRound(
            createFederatedRound({
              createdBy: body.createdBy ?? sponsorId,
              modelName: body.modelName,
              baselineModelHash: body.baselineModelHash,
              maxParticipants,
              maxEpsilon: body.maxEpsilon,
              payoutPaisePerUpdate,
              deadlineSecondsFromNow: body.deadlineSecondsFromNow,
              aggregationMode: body.aggregationMode,
              contributorBudget: body.contributorBudget,
              slmModelPackId: body.slmModelPackId,
              targetTask: body.targetTask,
              loraConfig: body.loraConfig,
              sponsorId,
              escrowLockedPaise: escrowRequired
            })
          );
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_round', message: error.message }
          });
          return;
        }
        await store.saveSponsor(lockedSponsor);
        await store.saveFederatedRound(round);
        await store.appendLedger({
          type: 'sponsor_escrow.locked',
          sponsorId,
          roundId: round.roundId,
          amountPaise: escrowRequired,
          balancePaise: lockedSponsor.escrowBalancePaise,
          lockedPaise: lockedSponsor.escrowLockedPaise,
          at: new Date().toISOString()
        });
        logger.info('sponsor_round_created', {
          requestId,
          sponsorId,
          roundId: round.roundId,
          escrowLockedPaise: escrowRequired
        });
        jsonResponse(response, 201, {
          ok: true,
          round,
          sponsor: publicSponsor(lockedSponsor)
        });
        return;
      }

      // GET /api/sponsors/:id/federated-rounds — sponsor lists own
      // rounds.
      const sponsorRoundsListMatch = /^\/api\/sponsors\/([^/]+)\/federated-rounds$/.exec(url.pathname);
      if (request.method === 'GET' && sponsorRoundsListMatch) {
        const sponsorId = decodeURIComponent(sponsorRoundsListMatch[1]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const all = await store.listFederatedRounds();
        const mine = all.filter((r) => r.sponsorId === sponsorId).map(describeRound);
        jsonResponse(response, 200, { rounds: mine });
        return;
      }

      // GET /api/sponsors/:id/federated-rounds/:roundId/export —
      // signed JSONL bundle of accepted updates for sponsor audit.
      // Pointer-not-payload: per-update record carries the gradient
      // HASH only, not the bytes. Rotates identityHash per
      // (round, identity) so the sponsor cannot correlate the same
      // worker across multiple rounds.
      const sponsorRoundExportMatch =
        /^\/api\/sponsors\/([^/]+)\/federated-rounds\/([^/]+)\/export$/.exec(url.pathname);
      if (request.method === 'GET' && sponsorRoundExportMatch) {
        const sponsorId = decodeURIComponent(sponsorRoundExportMatch[1]);
        const roundId = decodeURIComponent(sponsorRoundExportMatch[2]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const round = await store.readFederatedRound(roundId).catch(() => null);
        if (!round || round.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_round', message: 'round not found for this sponsor.' }
          });
          return;
        }
        const allUpdates = await store.listFederatedUpdates();
        const updates = allUpdates.filter((u) => u.roundId === roundId);
        // identityHash per-(round, identity) so sponsor cannot
        // cross-round correlate — same as Phase 10 plan in ADR 0110.
        const { sha256Hex } = await import('./core.mjs');
        const lines = updates.map((u) => {
          const identityHash = sha256Hex(`${roundId}::${u.contributorId}`);
          return JSON.stringify({
            updateId: u.updateId,
            roundId,
            sponsorId,
            identityHash: 'sha256:' + identityHash,
            gradientHash: u.gradientHash,
            differentialPrivacyEpsilon: u.differentialPrivacyEpsilon,
            sampleCount: u.sampleCount,
            acceptedAt: u.submittedAt,
            payoutPaise: u.payoutPaise
          });
        });
        const body = lines.join('\n') + (lines.length ? '\n' : '');
        textResponse(
          response,
          200,
          body,
          'application/x-ndjson; charset=utf-8'
        );
        return;
      }

      // Phase 10.5 — Audit signer public key endpoint. Anyone can
      // fetch this to verify a labeling-export bundle's trailer.
      // Lazy-bootstraps the audit signer on first hit so the system
      // can run without a separate key-init step. Returns the public
      // record only — the private key never leaves the server.
      if (request.method === 'GET' && url.pathname === '/api/audit-signer/public-key') {
        let signer = await store.readAuditSigner().catch(() => null);
        if (!signer) {
          const fresh = createIdentity({ displayName: 'Bharat OS audit signer' });
          await store.saveAuditSigner(fresh);
          signer = fresh;
        }
        jsonResponse(response, 200, publicIdentity(signer));
        return;
      }

      // Phase 10.5 — Signed labeling-job audit export. Sponsor-bearer
      // gated. Returns NDJSON: header + per-accepted-submission +
      // trailer with content sha256 + Ed25519 signature from the
      // audit signer. identityHash rotates per (job, worker) so the
      // sponsor cannot cross-job correlate workers. Emits a
      // `labeling_export.signed` ledger event with the content hash.
      const sponsorJobExportMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/export\.ndjson$/.exec(
          url.pathname
        );
      if (request.method === 'GET' && sponsorJobExportMatch) {
        const sponsorId = decodeURIComponent(sponsorJobExportMatch[1]);
        const jobId = decodeURIComponent(sponsorJobExportMatch[2]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_job', message: 'job not found for this sponsor.' }
          });
          return;
        }
        let signer = await store.readAuditSigner().catch(() => null);
        if (!signer) {
          signer = createIdentity({ displayName: 'Bharat OS audit signer' });
          await store.saveAuditSigner(signer);
        }
        const allSubs = await store.listLabelingSubmissions({ jobId });
        const exportedAt = new Date().toISOString();
        const lines = buildLabelingExportLines({
          job,
          submissions: allSubs,
          signerIdentity: signer,
          exportedAt
        });
        const body = bundleNdjson(lines);
        const trailer = JSON.parse(lines[lines.length - 1]);
        await store.appendLedger({
          type: 'labeling_export.signed',
          jobId,
          sponsorId,
          signerId: signer.id,
          contentSha256: trailer.contentSha256,
          submissionCount: lines.length - 2,
          exportedAt,
          protocolVersion: LABELING_EXPORT_PROTOCOL_VERSION
        });
        textResponse(
          response,
          200,
          body,
          'application/x-ndjson; charset=utf-8'
        );
        return;
      }

      // Phase 12.0 — providerIdentity routes.
      //
      // Auth model:
      //   POST /api/identities/:rootId/provider-identities — caller
      //     identifies themselves as the root via a body field; in
      //     v1 we trust the route (FE owns the rootId from
      //     localStorage). Phase 13+ Bharat ID will harden this
      //     with signed requests.
      //   GET  /api/identities/:rootId/provider-identities — same
      //     trust model; lists provider identities bound to that root.
      //   GET  /api/provider-identities/:id — PUBLIC. Returns the
      //     stripped public record (no rootIdentityId, no KYC
      //     envelope, no transition history).
      //   POST /api/provider-identities/:id/profile — body must
      //     carry rootIdentityId; substrate refuses if it doesn't
      //     match the stored provider's rootIdentityId.
      //   POST /api/admin/provider-identities/:id/kyc-attest —
      //     admin-token-gated. Operator attests KYC level.
      //   POST /api/admin/provider-identities/:id/transition —
      //     admin-token-gated. Operator transitions status.
      const provIdRootListMatch = /^\/api\/identities\/([^/]+)\/provider-identities$/.exec(url.pathname);
      if (provIdRootListMatch) {
        const rootIdentityId = decodeURIComponent(provIdRootListMatch[1]);
        if (request.method === 'GET') {
          const all = await store.listProviderIdentities({ rootIdentityId });
          jsonResponse(response, 200, { providerIdentities: all });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          // Ensure the root identity exists — better error than
          // letting a draft float in the table without a real root.
          const root = await store.readIdentity(rootIdentityId).catch(() => null);
          if (!root) {
            jsonResponse(response, 404, {
              error: { code: 'unknown_root_identity', message: 'root identity not found.' }
            });
            return;
          }
          // Phase 12.1b.3 — optional role-answer values; validated
          // against the canonical role schema before creating the
          // provider record.
          let providerRoleAnswers = null;
          if (Object.prototype.hasOwnProperty.call(body, 'roleAnswerValues')) {
            const verdict = validateRoleAnswers(body.roleKind, body.roleAnswerValues);
            if (!verdict.ok) {
              jsonResponse(response, 400, {
                error: { code: 'invalid_role_answers', errors: verdict.errors }
              });
              return;
            }
            providerRoleAnswers = verdict.envelope;
          }
          let provider;
          try {
            provider = createProviderIdentity({
              rootIdentityId,
              roleKind: body.roleKind,
              displayName: body.displayName,
              serviceArea: body.serviceArea,
              ratePaisePerHour: body.ratePaisePerHour,
              ratePaisePerService: body.ratePaisePerService,
              description: body.description,
              roleAnswers: providerRoleAnswers
            });
          } catch (err) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_provider_identity', message: err.message }
            });
            return;
          }
          await store.saveProviderIdentity(provider);
          jsonResponse(response, 201, { providerIdentity: provider });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      const provIdPublicReadMatch = /^\/api\/provider-identities\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && provIdPublicReadMatch) {
        const providerIdentityId = decodeURIComponent(provIdPublicReadMatch[1]);
        const p = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!p) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_provider', message: 'provider identity not found.' }
          });
          return;
        }
        jsonResponse(response, 200, { providerIdentity: publicProviderRecord(p) });
        return;
      }

      const provIdProfileMatch = /^\/api\/provider-identities\/([^/]+)\/profile$/.exec(url.pathname);
      if (request.method === 'POST' && provIdProfileMatch) {
        const providerIdentityId = decodeURIComponent(provIdProfileMatch[1]);
        const body = await readRequestJson(request);
        const existing = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!existing) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_provider', message: 'provider identity not found.' }
          });
          return;
        }
        if (!body.rootIdentityId || body.rootIdentityId !== existing.rootIdentityId) {
          jsonResponse(response, 403, {
            error: { code: 'not_owner', message: 'rootIdentityId mismatch — not your provider identity.' }
          });
          return;
        }
        // Phase 12.1b.3 — when the FE submits raw `roleAnswerValues`,
        // re-validate against the canonical role schema before
        // accepting. The FE may also submit a pre-built envelope
        // via `roleAnswers` (used by tests / admin tooling); the
        // re-validation path is mandatory when raw values arrive.
        let roleAnswers;
        if (Object.prototype.hasOwnProperty.call(body, 'roleAnswerValues')) {
          const verdict = validateRoleAnswers(existing.roleKind, body.roleAnswerValues);
          if (!verdict.ok) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_role_answers', errors: verdict.errors }
            });
            return;
          }
          roleAnswers = verdict.envelope;
        } else if (Object.prototype.hasOwnProperty.call(body, 'roleAnswers')) {
          // Pre-built envelope path — verify the envelope's values
          // against the schema so a misbehaving caller cannot
          // smuggle ad-hoc keys.
          const candidate = body.roleAnswers;
          if (candidate != null && typeof candidate !== 'object') {
            jsonResponse(response, 400, {
              error: { code: 'invalid_role_answers', errors: { __schema: 'not_object' } }
            });
            return;
          }
          const verdict = validateRoleAnswers(existing.roleKind, candidate?.values ?? null);
          if (!verdict.ok) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_role_answers', errors: verdict.errors }
            });
            return;
          }
          roleAnswers = candidate == null ? null : verdict.envelope;
        }
        let next;
        try {
          next = updateProviderProfile(existing, {
            displayName: body.displayName,
            serviceArea: body.serviceArea,
            ratePaisePerHour: body.ratePaisePerHour,
            ratePaisePerService: body.ratePaisePerService,
            description: body.description,
            roleAnswers
          });
        } catch (err) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_profile_update', message: err.message }
          });
          return;
        }
        await store.saveProviderIdentity(next);
        // Phase 12.1b.3 — emit an audit-trail event so a future
        // operator console can answer "what did this provider
        // change and when?" The payload carries the field names
        // (not values) that were updated, preserving pointer-not-
        // payload.
        const updatedFields = [];
        if (body.displayName !== undefined) updatedFields.push('displayName');
        if (body.serviceArea !== undefined) updatedFields.push('serviceArea');
        if (body.ratePaisePerHour !== undefined) updatedFields.push('ratePaisePerHour');
        if (body.ratePaisePerService !== undefined) updatedFields.push('ratePaisePerService');
        if (body.description !== undefined) updatedFields.push('description');
        if (roleAnswers !== undefined) updatedFields.push('roleAnswers');
        await store.appendLedger({
          type: 'provider_identity.updated',
          providerIdentityId: next.providerIdentityId,
          rootIdentityId: next.rootIdentityId,
          updatedFields,
          at: next.updatedAt
        });
        jsonResponse(response, 200, { providerIdentity: next });
        return;
      }

      const provIdKycMatch = /^\/api\/admin\/provider-identities\/([^/]+)\/kyc-attest$/.exec(url.pathname);
      if (request.method === 'POST' && provIdKycMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const operator = auth.operator;
        const providerIdentityId = decodeURIComponent(provIdKycMatch[1]);
        const body = await readRequestJson(request);
        const existing = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!existing) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_provider', message: 'provider identity not found.' }
          });
          return;
        }
        let next;
        try {
          next = attestProviderKyc(existing, {
            kycLevel: body.kycLevel,
            operatorId: operator,
            evidenceRefs: body.evidenceRefs,
            notes: body.notes
          });
        } catch (err) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_kyc_attest', message: err.message }
          });
          return;
        }
        await store.saveProviderIdentity(next);
        await store.appendLedger({
          type: 'provider_identity.kyc_attested',
          providerIdentityId,
          rootIdentityId: existing.rootIdentityId,
          kycLevel: next.kycLevel,
          operatorId: operator
        });
        jsonResponse(response, 200, { providerIdentity: next });
        return;
      }

      const provIdTransitionMatch = /^\/api\/admin\/provider-identities\/([^/]+)\/transition$/.exec(url.pathname);
      if (request.method === 'POST' && provIdTransitionMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const operator = auth.operator;
        const providerIdentityId = decodeURIComponent(provIdTransitionMatch[1]);
        const body = await readRequestJson(request);
        const existing = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!existing) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_provider', message: 'provider identity not found.' }
          });
          return;
        }
        let next;
        try {
          next = transitionProviderStatus(existing, body.nextStatus, {
            operatorId: operator,
            reason: body.reason
          });
        } catch (err) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_transition', message: err.message }
          });
          return;
        }
        await store.saveProviderIdentity(next);
        await store.appendLedger({
          type: 'provider_identity.transitioned',
          providerIdentityId,
          rootIdentityId: existing.rootIdentityId,
          from: existing.status,
          to: next.status,
          operatorId: operator,
          reason: body.reason ?? null
        });
        jsonResponse(response, 200, { providerIdentity: next });
        return;
      }

      // Phase 12.1b.3 — public read of the per-role light form
      // schemas. Citizens / FE renderers fetch the schema for the
      // role they're onboarding so the substrate stays the single
      // source of truth.
      if (request.method === 'GET' && url.pathname === '/api/provider-role-forms') {
        jsonResponse(response, 200, { forms: PROVIDER_ROLE_FORMS });
        return;
      }
      const roleFormMatch = /^\/api\/provider-role-forms\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && roleFormMatch) {
        const roleKind = decodeURIComponent(roleFormMatch[1]);
        const schema = getProviderRoleForm(roleKind);
        if (!schema) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_role_kind', message: 'no light-form schema registered for that role.' }
          });
          return;
        }
        jsonResponse(response, 200, { form: schema });
        return;
      }

      // Phase 12.1a.1 — Marketplace discovery.
      //
      // GET /api/marketplace/providers?lat&lng&radiusMeters&role&limit
      //   Public. Ranked list of active providers whose
      //   point-radius service area overlaps the citizen's search
      //   bubble. Returns publicProviderRecord shape (centroid
      //   coarsened to 2 decimals) plus a coarse distanceBand pill
      //   ('<1km' / '1-3km' / …) — never exact metres. NO ONDC.
      //   Rate-limited by the wrapping limiter (policyFor → 'read').
      //
      //   Ledger emits one marketplace.searched event per call with
      //   only coarse latBucket/lngBucket (1 decimal ~11 km) and NO
      //   citizen identity — even when a session is present. The
      //   discovery endpoint runs anonymous from the audit POV.
      if (request.method === 'GET' && url.pathname === '/api/marketplace/providers') {
        const latRaw = url.searchParams.get('lat');
        const lngRaw = url.searchParams.get('lng');
        const radiusRaw = url.searchParams.get('radiusMeters');
        const roleRaw = url.searchParams.get('role');
        const limitRaw = url.searchParams.get('limit');
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        if (latRaw == null || lngRaw == null || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_geo_query', message: 'lat and lng are required finite numbers in [-90,90]/[-180,180].' }
          });
          return;
        }
        let radiusMeters = DEFAULT_QUERY_RADIUS_M;
        if (radiusRaw != null) {
          const r = Math.trunc(Number(radiusRaw));
          if (!Number.isFinite(r) || r < 100 || r > MAX_QUERY_RADIUS_M) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_geo_query', message: `radiusMeters must be an integer in [100, ${MAX_QUERY_RADIUS_M}].` }
            });
            return;
          }
          radiusMeters = r;
        }
        let role = null;
        if (roleRaw != null && roleRaw !== '') {
          if (!PROVIDER_ROLE_KINDS.includes(roleRaw)) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_role', message: `role must be one of: ${PROVIDER_ROLE_KINDS.join(', ')}.` }
            });
            return;
          }
          role = roleRaw;
        }
        let limit = 30;
        if (limitRaw != null) {
          const l = Math.trunc(Number(limitRaw));
          if (Number.isFinite(l) && l >= 1 && l <= 100) limit = l;
        }
        // Defensive coarsening — the FE is supposed to round to 1
        // decimal before calling, but server re-rounds so a misbehaving
        // client can't sneak high-precision coords in.
        const queryLat = Math.round(lat * 10) / 10;
        const queryLng = Math.round(lng * 10) / 10;
        const candidates = await store.listProviderIdentities({ status: 'active', roleKind: role || undefined });
        const ranked = rankProviders({
          origin: { lat: queryLat, lng: queryLng },
          candidates,
          radiusMeters,
          role,
          limit
        });
        const results = ranked.map(({ provider, distanceMeters, withinServiceRadius }) => ({
          ...publicProviderRecord(provider),
          distanceBand: distanceBand(distanceMeters),
          withinServiceRadius
        }));
        // Anonymous audit row. No userId, no rootIdentityId.
        await store.appendLedger({
          type: 'marketplace.searched',
          latBucket: queryLat,
          lngBucket: queryLng,
          radiusMeters,
          role: role || null,
          providerCount: results.length,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, {
          query: { latBucket: queryLat, lngBucket: queryLng, radiusMeters, role, limit },
          results
        });
        return;
      }

      // POST /api/marketplace/providers/:providerIdentityId/express-interest
      //   Citizen-side stub for the deferred booking flow (12.1a.2).
      //   Emits a typed `marketplace.interest_expressed` ledger event
      //   carrying (providerIdentityId, citizenRootIdentityId, role, at)
      //   so Phase 12.1a.2 has a real precedent row to upgrade into a
      //   booking entity. No state change on the provider record. No
      //   escrow lock. The FE pairs this with the existing intent
      //   orchestration path to surface a human-readable confirmation.
      const expressInterestMatch = /^\/api\/marketplace\/providers\/([^/]+)\/express-interest$/.exec(url.pathname);
      if (request.method === 'POST' && expressInterestMatch) {
        const providerIdentityId = decodeURIComponent(expressInterestMatch[1]);
        const body = await readRequestJson(request);
        const citizenRootIdentityId = typeof body.citizenRootIdentityId === 'string' ? body.citizenRootIdentityId.trim() : '';
        if (!citizenRootIdentityId) {
          jsonResponse(response, 400, {
            error: { code: 'citizen_required', message: 'citizenRootIdentityId is required.' }
          });
          return;
        }
        // PRIV-1 (adversarial review) — verify the citizen identity
        // actually exists in the store before writing it to the audit
        // ledger. Without this, an attacker could forge interest rows
        // under arbitrary IDs. Session-binding (full auth) lands in
        // 12.1a.2 when the booking flow needs it; existence check is
        // enough to keep the audit trail honest.
        const citizenIdentity = await store.readIdentity(citizenRootIdentityId).catch(() => null);
        if (!citizenIdentity) {
          jsonResponse(response, 404, {
            error: { code: 'citizen_not_found', message: 'citizenRootIdentityId does not resolve to a known identity.' }
          });
          return;
        }
        const provider = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!provider || provider.status !== 'active') {
          jsonResponse(response, 404, {
            error: { code: 'provider_not_bookable', message: 'provider not found or not active.' }
          });
          return;
        }
        // EC-2 (adversarial review) — normalise CRLF, strip leading
        // UTF-8 BOM, trim, collapse empty to null. Required for
        // replay safety + downstream ledger consumers.
        const note = body.note == null
          ? null
          : (String(body.note).replace(/\r\n/g, '\n').replace(/^﻿/, '').slice(0, 280).trim() || null);
        const at = new Date().toISOString();
        await store.appendLedger({
          type: 'marketplace.interest_expressed',
          providerIdentityId,
          citizenRootIdentityId,
          roleKind: provider.roleKind,
          note,
          at
        });
        jsonResponse(response, 201, {
          ok: true,
          providerIdentityId,
          roleKind: provider.roleKind,
          at
        });
        return;
      }

      // ── Phase 12.1a.2 — booking endpoints ─────────────────────────

      // Helper: settlement on a citizen_confirmed / auto_released
      // booking. Debit locked from citizen escrow, emit payout event
      // to provider's mesh balance bookkeeping. Returns the ledger
      // events that should be appended atomically with the booking
      // write via casUpdateBooking.
      async function settleBookingPayout(booking, { at }) {
        const events = [];
        let escrow = await store.readCitizenEscrow(booking.citizenRootIdentityId).catch(() => null);
        if (escrow) {
          escrow = debitLockedCitizenEscrow(escrow, booking.rateSnapshot.quotedAmountPaise, { at });
          await store.saveCitizenEscrow(escrow);
        }
        events.push({
          type: 'booking.escrow_released',
          bookingId: booking.bookingId,
          providerIdentityId: booking.providerIdentityId,
          providerRootIdentityId: booking.providerRootIdentityId,
          amountPaise: booking.rateSnapshot.quotedAmountPaise,
          at
        });
        events.push({
          type: 'booking.payout',
          bookingId: booking.bookingId,
          providerRootIdentityId: booking.providerRootIdentityId,
          amountPaise: booking.rateSnapshot.quotedAmountPaise,
          at
        });
        return events;
      }

      async function refundBookingEscrow(booking, { at, reason }) {
        const events = [];
        let escrow = await store.readCitizenEscrow(booking.citizenRootIdentityId).catch(() => null);
        if (escrow) {
          // refundLocked unlocks without debiting; balance restored
          // for the citizen's next booking.
          escrow = refundLockedCitizenEscrow(escrow, booking.rateSnapshot.quotedAmountPaise, { at });
          await store.saveCitizenEscrow(escrow);
        }
        events.push({
          type: 'booking.escrow_refunded',
          bookingId: booking.bookingId,
          citizenRootIdentityId: booking.citizenRootIdentityId,
          amountPaise: booking.rateSnapshot.quotedAmountPaise,
          reason: reason || null,
          at
        });
        return events;
      }

      // Lazy auto-release / expiry sweep over a single booking.
      // Returns the latest booking record after any auto transition
      // has been applied + persisted. Called by every read path.
      async function lazyAutoSweep(booking) {
        if (!booking) return booking;
        if (BOOKING_TERMINAL_STATUSES.has(booking.status)) return booking;
        const { booking: next, released, expired, transitions } = maybeAutoRelease(booking, {
          now: Date.now(),
          nowIsoStr: new Date().toISOString()
        });
        if (!released && !expired) return booking;
        const at = next.updatedAt;
        const ledgerEvents = [];
        if (released) {
          ledgerEvents.push({
            type: 'booking.auto_released',
            bookingId: next.bookingId,
            providerRootIdentityId: next.providerRootIdentityId,
            at
          });
          ledgerEvents.push(...await settleBookingPayout(next, { at }));
        } else if (expired) {
          ledgerEvents.push({
            type: 'booking.expired',
            bookingId: next.bookingId,
            at
          });
          ledgerEvents.push(...await refundBookingEscrow(next, { at, reason: 'expired_unaccepted' }));
        }
        try {
          await store.casUpdateBooking(booking.bookingId, booking.seq, next, ledgerEvents);
        } catch (err) {
          // Concurrent sweep won the race; just re-read.
          if (err?.code === 'stale_seq') {
            return await store.readBooking(booking.bookingId).catch(() => booking);
          }
          throw err;
        }
        if (released) {
          await sendPushToIdentity(
            store,
            next.providerRootIdentityId,
            buildProviderPayoutPush({ booking: next, outcome: 'auto_released' }),
            { ledgerType: 'booking.push.provider_payout', requestId }
          ).catch(() => null);
        } else if (expired) {
          await sendPushToIdentity(
            store,
            next.citizenRootIdentityId,
            buildCitizenRefundPush({ booking: next, reason: 'expired_unaccepted' }),
            { ledgerType: 'booking.push.citizen_refund', requestId }
          ).catch(() => null);
        }
        return next;
      }

      function bookingProjection(booking, role) {
        return role === 'provider' ? publicBookingForProvider(booking) : publicBookingForCitizen(booking);
      }

      function staleSeqResponse(currentBooking, role) {
        jsonResponse(response, 409, {
          error: {
            code: 'stale_seq',
            message: 'booking has been updated by another party; reload and try again.',
            currentSeq: currentBooking.seq,
            currentStatus: currentBooking.status
          },
          booking: bookingProjection(currentBooking, role)
        });
      }

      // POST /api/marketplace/bookings — citizen creates a booking,
      // locks escrow atomically. Server re-validates expectedAmountPaise
      // against the freshly-computed rate snapshot to catch rate drift.
      if (request.method === 'POST' && url.pathname === '/api/marketplace/bookings') {
        const body = await readRequestJson(request);
        const citizenId = typeof body.citizenRootIdentityId === 'string' ? body.citizenRootIdentityId.trim() : '';
        if (!citizenId) {
          jsonResponse(response, 400, {
            error: { code: 'citizen_required', message: 'citizenRootIdentityId is required.' }
          });
          return;
        }
        const citizen = await store.readIdentity(citizenId).catch(() => null);
        if (!citizen) {
          jsonResponse(response, 404, {
            error: { code: 'citizen_not_found', message: 'citizenRootIdentityId does not resolve to a known identity.' }
          });
          return;
        }
        const providerIdentityId = typeof body.providerIdentityId === 'string' ? body.providerIdentityId.trim() : '';
        const provider = await store.readProviderIdentity(providerIdentityId).catch(() => null);
        if (!provider) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_provider', message: 'provider not found.' }
          });
          return;
        }
        let booking;
        try {
          booking = createBooking({
            citizenRootIdentityId: citizenId,
            provider,
            pricingBasis: body.pricingBasis,
            estimatedHours: body.estimatedHours,
            pickup: body.pickup ?? null,
            citizenNote: body.citizenNote ?? null,
            expectedAmountPaise: body.expectedAmountPaise ?? null
          });
        } catch (err) {
          const code = err.code || 'invalid_booking';
          const status = code === 'rate_drift' ? 409
            : code === 'provider_not_bookable' ? 403
            : code === 'cannot_book_self' ? 403
            : 400;
          jsonResponse(response, status, {
            error: { code, message: err.message, ...(err.currentQuotedAmountPaise ? { currentQuotedAmountPaise: err.currentQuotedAmountPaise } : {}) }
          });
          return;
        }
        // ESCROW-CAS (adversarial review) — atomic check+lock on the
        // citizen escrow envelope. Two parallel booking-creates
        // racing through the available-balance check are serialized
        // by the BEGIN IMMEDIATE inside casUpdateCitizenEscrow; one
        // wins, the other sees stale_seq and we retry once with the
        // refreshed envelope. A second stale_seq surfaces as 409 so
        // the FE can re-render the citizen's updated balance.
        let escrow = await store.readCitizenEscrow(citizenId).catch(() => null);
        let priorSeq = escrow ? Number(escrow.seq || 0) : null;
        const tryLock = async () => {
          if (!escrow) {
            escrow = createCitizenEscrow(citizenId, { createdAt: booking.createdAt });
            priorSeq = null;
          }
          if (availableCitizenEscrow(escrow) < booking.rateSnapshot.quotedAmountPaise) {
            const err = new Error('insufficient available citizen escrow.');
            err.code = 'insufficient_escrow';
            err.availablePaise = availableCitizenEscrow(escrow);
            throw err;
          }
          const nextEscrow = lockCitizenEscrow(escrow, booking.rateSnapshot.quotedAmountPaise, { at: booking.createdAt });
          await store.casUpdateCitizenEscrow(citizenId, priorSeq, nextEscrow);
          escrow = nextEscrow;
        };
        let lockOk = false;
        try {
          await tryLock();
          lockOk = true;
        } catch (err) {
          if (err?.code === 'stale_seq') {
            // Re-read and try once more.
            escrow = await store.readCitizenEscrow(citizenId).catch(() => null);
            priorSeq = escrow ? Number(escrow.seq || 0) : null;
            try {
              await tryLock();
              lockOk = true;
            } catch (err2) {
              if (err2?.code === 'insufficient_escrow') {
                jsonResponse(response, 402, {
                  error: { code: 'insufficient_escrow', message: err2.message, availablePaise: err2.availablePaise ?? null, requiredPaise: booking.rateSnapshot.quotedAmountPaise }
                });
                return;
              }
              if (err2?.code === 'stale_seq') {
                jsonResponse(response, 409, {
                  error: { code: 'escrow_concurrent_update', message: 'citizen escrow was updated concurrently; reload and try again.' }
                });
                return;
              }
              throw err2;
            }
          } else if (err?.code === 'insufficient_escrow') {
            jsonResponse(response, 402, {
              error: { code: 'insufficient_escrow', message: err.message, availablePaise: err.availablePaise ?? null, requiredPaise: booking.rateSnapshot.quotedAmountPaise }
            });
            return;
          } else {
            throw err;
          }
        }
        if (!lockOk) {
          jsonResponse(response, 500, { error: { code: 'lock_failed', message: 'escrow lock failed.' } });
          return;
        }
        await store.saveBooking(booking);
        await store.appendLedger({
          type: 'booking.created',
          bookingId: booking.bookingId,
          providerIdentityId: booking.providerIdentityId,
          roleKind: booking.roleKind,
          pickupBubble1dp: booking.pickupPoint ? booking.pickupPoint.bubble1dp : null,
          at: booking.createdAt
        });
        await store.appendLedger({
          type: 'booking.escrow_locked',
          bookingId: booking.bookingId,
          amountPaise: booking.rateSnapshot.quotedAmountPaise,
          at: booking.createdAt
        });
        await sendPushToIdentity(
          store,
          booking.providerRootIdentityId,
          buildProviderNewBookingPush({ booking }),
          { ledgerType: 'booking.push.provider_new', requestId }
        ).catch(() => null);
        jsonResponse(response, 201, {
          ok: true,
          booking: publicBookingForCitizen(booking)
        });
        return;
      }

      // GET /api/marketplace/bookings/:bookingId — party-aware
      // projection. Either party can read; auto-sweeps first.
      const bookingDetailMatch = /^\/api\/marketplace\/bookings\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && bookingDetailMatch) {
        const bookingId = decodeURIComponent(bookingDetailMatch[1]);
        let authResult;
        try {
          authResult = await requireBookingPartyAuth({ store, bookingId, request, body: null, requestId });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            jsonResponse(response, err.status, { error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        const sweptBooking = await lazyAutoSweep(authResult.booking);
        jsonResponse(response, 200, {
          booking: bookingProjection(sweptBooking, authResult.role)
        });
        return;
      }

      // POST /api/marketplace/bookings/:bookingId/<action>
      const bookingActionMatch = /^\/api\/marketplace\/bookings\/([^/]+)\/(accept|reject|cancel|mark-complete|confirm-complete|dispute)$/.exec(url.pathname);
      if (request.method === 'POST' && bookingActionMatch) {
        const bookingId = decodeURIComponent(bookingActionMatch[1]);
        const action = bookingActionMatch[2];
        const body = await readRequestJson(request);
        let authResult;
        try {
          authResult = await requireBookingPartyAuth({ store, bookingId, request, body, requestId });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            jsonResponse(response, err.status, { error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        let { booking, role } = authResult;
        // Pre-sweep so stale data doesn't cause spurious 409s.
        booking = await lazyAutoSweep(booking);
        const expectedSeq = Number(body.expectedSeq);
        if (!Number.isFinite(expectedSeq) || expectedSeq !== booking.seq) {
          staleSeqResponse(booking, role);
          return;
        }
        const at = new Date().toISOString();
        let next;
        let ledgerEvents = [];
        let pushTarget = null;
        let pushPayload = null;
        let pushLedgerType = null;
        try {
          if (action === 'accept') {
            if (role !== 'provider') throw Object.assign(new Error('only the provider can accept'), { code: 'not_provider' });
            next = acceptBooking(booking, { at });
            ledgerEvents.push({ type: 'booking.accepted', bookingId, at });
            pushTarget = next.citizenRootIdentityId;
            pushPayload = buildCitizenBookingAcceptedPush({ booking: next });
            pushLedgerType = 'booking.push.citizen_accepted';
          } else if (action === 'reject') {
            if (role !== 'provider') throw Object.assign(new Error('only the provider can reject'), { code: 'not_provider' });
            next = rejectBooking(booking, { at, reason: body.reason });
            ledgerEvents.push({ type: 'booking.rejected', bookingId, reason: next.rejectReason, at });
            ledgerEvents.push(...await refundBookingEscrow(next, { at, reason: 'rejected_by_provider' }));
            pushTarget = next.citizenRootIdentityId;
            pushPayload = buildCitizenRefundPush({ booking: next, reason: 'rejected_by_provider' });
            pushLedgerType = 'booking.push.citizen_refund';
          } else if (action === 'cancel') {
            if (role !== 'citizen') throw Object.assign(new Error('only the citizen can cancel'), { code: 'not_citizen' });
            next = cancelBooking(booking, { at, reason: body.reason, by: 'citizen' });
            ledgerEvents.push({ type: 'booking.cancelled', bookingId, reason: next.cancelReason, at });
            ledgerEvents.push(...await refundBookingEscrow(next, { at, reason: 'cancelled_by_citizen' }));
            pushTarget = next.providerRootIdentityId;
            pushPayload = buildCitizenRefundPush({ booking: next, reason: 'cancelled_by_citizen' });
            pushLedgerType = 'booking.push.provider_cancelled';
          } else if (action === 'mark-complete') {
            if (role !== 'provider') throw Object.assign(new Error('only the provider can mark complete'), { code: 'not_provider' });
            next = markBookingComplete(booking, { at });
            ledgerEvents.push({ type: 'booking.provider_marked_complete', bookingId, at });
            pushTarget = next.citizenRootIdentityId;
            pushPayload = buildCitizenMarkedCompletePush({ booking: next });
            pushLedgerType = 'booking.push.citizen_marked_complete';
          } else if (action === 'confirm-complete') {
            if (role !== 'citizen') throw Object.assign(new Error('only the citizen can confirm complete'), { code: 'not_citizen' });
            next = citizenConfirmComplete(booking, { at });
            ledgerEvents.push({ type: 'booking.citizen_confirmed', bookingId, at });
            ledgerEvents.push(...await settleBookingPayout(next, { at }));
            pushTarget = next.providerRootIdentityId;
            pushPayload = buildProviderPayoutPush({ booking: next, outcome: 'citizen_confirmed' });
            pushLedgerType = 'booking.push.provider_payout';
          } else if (action === 'dispute') {
            next = fileDispute(booking, { filedBy: role, reason: body.reason, at });
            ledgerEvents.push({
              type: 'booking.disputed',
              bookingId,
              filedBy: role,
              reason: next.disputeReason,
              at
            });
            pushTarget = role === 'citizen' ? next.providerRootIdentityId : next.citizenRootIdentityId;
            pushPayload = role === 'citizen'
              ? buildProviderDisputeFiledPush({ booking: next })
              : buildCitizenDisputeFiledPush({ booking: next });
            pushLedgerType = 'booking.push.dispute_filed';
          }
        } catch (err) {
          const code = err.code || 'invalid_transition';
          const status = code === 'booking_status_locked' || code === 'not_provider' || code === 'not_citizen' ? 409 : 400;
          jsonResponse(response, status, {
            error: { code, message: err.message, ...(err.from ? { from: err.from } : {}), ...(err.to ? { to: err.to } : {}) }
          });
          return;
        }
        try {
          await store.casUpdateBooking(bookingId, expectedSeq, next, ledgerEvents);
        } catch (err) {
          if (err?.code === 'stale_seq') {
            const current = await store.readBooking(bookingId).catch(() => booking);
            staleSeqResponse(current, role);
            return;
          }
          throw err;
        }
        if (pushTarget && pushPayload && pushLedgerType) {
          await sendPushToIdentity(store, pushTarget, pushPayload, { ledgerType: pushLedgerType, requestId }).catch(() => null);
        }
        jsonResponse(response, 200, { ok: true, booking: bookingProjection(next, role) });
        return;
      }

      // GET /api/citizens/:rootIdentityId/bookings?status — citizen's
      // own booking list. PRIV-1 (adversarial review) — service-layer
      // auth via requireCitizenOwnerAuth so an attacker who guesses a
      // citizenRootIdentityId cannot enumerate that citizen's bookings.
      // Sweeps all returned bookings for auto-release / expiry.
      const citizenBookingsListMatch = /^\/api\/citizens\/([^/]+)\/bookings$/.exec(url.pathname);
      if (request.method === 'GET' && citizenBookingsListMatch) {
        const citizenRootIdentityId = decodeURIComponent(citizenBookingsListMatch[1]);
        try {
          await requireCitizenOwnerAuth({ store, citizenRootIdentityId, request, body: null, requestId });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            jsonResponse(response, err.status, { error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        const status = url.searchParams.get('status') || undefined;
        const all = await store.listBookings({ citizenRootIdentityId, status });
        const swept = await Promise.all(all.map((b) => lazyAutoSweep(b)));
        // Sort newest first.
        swept.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        jsonResponse(response, 200, {
          bookings: swept.map(publicBookingForCitizen)
        });
        return;
      }

      // GET /api/citizens/:rootIdentityId/escrow — owner-gated
      // projection of the citizen's escrow envelope. PRIV-2
      // (adversarial review) — was 'public projection'; now
      // requires acting identity match.
      const citizenEscrowMatch = /^\/api\/citizens\/([^/]+)\/escrow$/.exec(url.pathname);
      if (request.method === 'GET' && citizenEscrowMatch) {
        const citizenRootIdentityId = decodeURIComponent(citizenEscrowMatch[1]);
        try {
          await requireCitizenOwnerAuth({ store, citizenRootIdentityId, request, body: null, requestId });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            jsonResponse(response, err.status, { error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        const escrow = await store.readCitizenEscrow(citizenRootIdentityId).catch(() => null);
        if (!escrow) {
          jsonResponse(response, 200, {
            escrow: {
              citizenEscrowId: null,
              fundingMode: 'bookkeeping-v1',
              escrowBalancePaise: 0,
              escrowLockedPaise: 0,
              availablePaise: 0,
              updatedAt: null
            }
          });
          return;
        }
        jsonResponse(response, 200, { escrow: publicCitizenEscrow(escrow) });
        return;
      }

      // GET /api/provider-identities/:providerIdentityId/bookings
      //   ?status&actingRootIdentityId — provider's inbox / active /
      //   history. Owner-auth gated. Sweeps all returned bookings.
      const providerBookingsListMatch = /^\/api\/provider-identities\/([^/]+)\/bookings$/.exec(url.pathname);
      if (request.method === 'GET' && providerBookingsListMatch) {
        const providerIdentityId = decodeURIComponent(providerBookingsListMatch[1]);
        try {
          await requireProviderOwnerAuth({ store, providerIdentityId, request, body: null, requestId });
        } catch (err) {
          if (err instanceof ProviderAuthError) {
            jsonResponse(response, err.status, { error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        const status = url.searchParams.get('status') || undefined;
        const all = await store.listBookings({ providerIdentityId, status });
        const swept = await Promise.all(all.map((b) => lazyAutoSweep(b)));
        swept.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        jsonResponse(response, 200, {
          bookings: swept.map(publicBookingForProvider)
        });
        return;
      }

      // POST /api/admin/citizens/:rootIdentityId/escrow/deposit
      //   Admin-token gated. Bookkeeping-v1: stands in for a real
      //   PSP-verified UPI credit until Phase 12.2+ payment rail.
      const citizenDepositMatch = /^\/api\/admin\/citizens\/([^/]+)\/escrow\/deposit$/.exec(url.pathname);
      if (request.method === 'POST' && citizenDepositMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const citizenRootIdentityId = decodeURIComponent(citizenDepositMatch[1]);
        const body = await readRequestJson(request);
        const amount = Number(body.amountPaise);
        if (!Number.isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_amount', message: 'amountPaise must be a positive integer.' }
          });
          return;
        }
        const citizen = await store.readIdentity(citizenRootIdentityId).catch(() => null);
        if (!citizen) {
          jsonResponse(response, 404, {
            error: { code: 'citizen_not_found', message: 'unknown citizen.' }
          });
          return;
        }
        let escrow = await store.readCitizenEscrow(citizenRootIdentityId).catch(() => null);
        if (!escrow) escrow = createCitizenEscrow(citizenRootIdentityId);
        escrow = depositCitizenEscrow(escrow, amount);
        await store.saveCitizenEscrow(escrow);
        await store.appendLedger({
          type: 'citizen_escrow.deposited',
          citizenRootIdentityId,
          amountPaise: amount,
          operatorId: auth.operator,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, escrow: publicCitizenEscrow(escrow) });
        return;
      }

      // GET /api/admin/bookings?status=disputed — operator queue.
      if (request.method === 'GET' && url.pathname === '/api/admin/bookings') {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const status = url.searchParams.get('status') || 'disputed';
        const all = await store.listBookings({ status });
        jsonResponse(response, 200, {
          bookings: all.map((b) => ({
            ...publicBookingForCitizen(b),
            citizenRootIdentityId: b.citizenRootIdentityId,
            providerRootIdentityId: b.providerRootIdentityId
          }))
        });
        return;
      }

      // POST /api/admin/bookings/:bookingId/adjudicate — operator
      //   adjudicates a disputed booking. Two outcomes for v1.
      const adjudicateMatch = /^\/api\/admin\/bookings\/([^/]+)\/adjudicate$/.exec(url.pathname);
      if (request.method === 'POST' && adjudicateMatch) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const bookingId = decodeURIComponent(adjudicateMatch[1]);
        const body = await readRequestJson(request);
        const booking = await store.readBooking(bookingId).catch(() => null);
        if (!booking) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_booking', message: 'booking not found.' }
          });
          return;
        }
        const expectedSeq = Number(body.expectedSeq);
        if (!Number.isFinite(expectedSeq) || expectedSeq !== booking.seq) {
          jsonResponse(response, 409, {
            error: { code: 'stale_seq', message: 'booking has been updated; reload and try again.', currentSeq: booking.seq }
          });
          return;
        }
        const at = new Date().toISOString();
        let next;
        try {
          next = adjudicateDispute(booking, { outcome: body.outcome, operatorId: auth.operator, at });
        } catch (err) {
          const code = err.code || 'invalid_adjudication';
          jsonResponse(response, code === 'booking_status_locked' ? 409 : 400, {
            error: { code, message: err.message }
          });
          return;
        }
        const ledgerEvents = [{
          type: 'booking.adjudicated',
          bookingId,
          outcome: body.outcome,
          operatorId: auth.operator,
          at
        }];
        if (next.status === 'citizen_confirmed') {
          ledgerEvents.push(...await settleBookingPayout(next, { at }));
        } else if (next.status === 'cancelled_after_dispute') {
          ledgerEvents.push(...await refundBookingEscrow(next, { at, reason: 'dispute_refund' }));
        }
        try {
          await store.casUpdateBooking(bookingId, expectedSeq, next, ledgerEvents);
        } catch (err) {
          if (err?.code === 'stale_seq') {
            jsonResponse(response, 409, { error: { code: 'stale_seq', message: err.message } });
            return;
          }
          throw err;
        }
        // Notify both parties.
        if (next.status === 'citizen_confirmed') {
          await sendPushToIdentity(store, next.providerRootIdentityId, buildProviderPayoutPush({ booking: next, outcome: 'citizen_confirmed' }), { ledgerType: 'booking.push.provider_payout', requestId }).catch(() => null);
        } else {
          await sendPushToIdentity(store, next.citizenRootIdentityId, buildCitizenRefundPush({ booking: next, reason: 'dispute_refund' }), { ledgerType: 'booking.push.citizen_refund', requestId }).catch(() => null);
        }
        jsonResponse(response, 200, { ok: true, booking: publicBookingForCitizen(next) });
        return;
      }

      // POST /api/admin/bookings/sweep-stale — operator backstop.
      //   Runs lazyAutoSweep over every non-terminal booking. Safe
      //   to call on a cron; CAS makes it idempotent.
      if (request.method === 'POST' && url.pathname === '/api/admin/bookings/sweep-stale') {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const all = await store.listBookings();
        const nonTerminal = all.filter((b) => !BOOKING_TERMINAL_STATUSES.has(b.status));
        let released = 0;
        let expired = 0;
        for (const b of nonTerminal) {
          const before = b.status;
          const after = await lazyAutoSweep(b);
          if (after.status !== before) {
            if (after.status === 'auto_released') released += 1;
            if (after.status === 'expired_unaccepted') expired += 1;
          }
        }
        jsonResponse(response, 200, {
          ok: true,
          examined: nonTerminal.length,
          autoReleased: released,
          expired
        });
        return;
      }

      // Phase 10.1 — labeling-job lifecycle endpoints. Sponsor-bearer
      // gated for create/upload/launch; public for worker-side
      // discovery; worker-anchored for submissions.

      // POST /api/sponsors/:id/labeling-jobs — create a DRAFT job
      // (no escrow lock yet). Upload items + launch separately.
      const sponsorJobCreateMatch = /^\/api\/sponsors\/([^/]+)\/labeling-jobs$/.exec(url.pathname);
      if (request.method === 'POST' && sponsorJobCreateMatch) {
        const sponsorId = decodeURIComponent(sponsorJobCreateMatch[1]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const body = await readRequestJson(request);
        let job;
        try {
          job = createLabelingJob({
            sponsorId,
            taskKind: body.taskKind,
            language: body.language,
            modality: body.modality,
            perLabelPaise: body.perLabelPaise,
            bharatOsFeePaise: body.bharatOsFeePaise,
            itemCount: body.itemCount,
            ipTerms: body.ipTerms,
            consentPurposeCode: body.consentPurposeCode,
            description: body.description,
            deadlineSecondsFromNow: body.deadlineSecondsFromNow,
            // Phase 10.4 — QC config.
            qcGoldenItemRateBps: body.qcGoldenItemRateBps,
            qcMinWorkerScore: body.qcMinWorkerScore,
            qcSponsorReviewRateBps: body.qcSponsorReviewRateBps
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_labeling_job', message: error.message }
          });
          return;
        }
        await store.saveLabelingJob(job);
        jsonResponse(response, 201, { ok: true, job });
        return;
      }

      // GET /api/sponsors/:id/labeling-jobs — sponsor lists own jobs.
      if (request.method === 'GET' && sponsorJobCreateMatch) {
        const sponsorId = decodeURIComponent(sponsorJobCreateMatch[1]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const all = await store.listLabelingJobs();
        jsonResponse(response, 200, {
          jobs: all.filter((j) => j.sponsorId === sponsorId)
        });
        return;
      }

      // POST /api/sponsors/:id/labeling-jobs/:jobId/items — upload corpus.
      // Body: { items: [{body, goldenAnswer?}, ...] }. Server creates a
      // labeling-job-item per entry + bumps job.itemsUploaded counter.
      const sponsorJobItemsMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/items$/.exec(url.pathname);
      if (request.method === 'POST' && sponsorJobItemsMatch) {
        const sponsorId = decodeURIComponent(sponsorJobItemsMatch[1]);
        const jobId = decodeURIComponent(sponsorJobItemsMatch[2]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_job', message: 'labeling job not found for this sponsor.' }
          });
          return;
        }
        if (job.status !== 'draft') {
          jsonResponse(response, 409, {
            error: {
              code: 'job_not_draft',
              message: 'items can only be uploaded while the job is in draft.'
            }
          });
          return;
        }
        const body = await readRequestJson(request);
        const incoming = Array.isArray(body.items) ? body.items : [];
        if (incoming.length === 0) {
          jsonResponse(response, 400, {
            error: { code: 'no_items', message: 'items array required.' }
          });
          return;
        }
        if (job.itemsUploaded + incoming.length > job.itemCount) {
          jsonResponse(response, 400, {
            error: {
              code: 'exceeds_item_count',
              message: `job declared ${job.itemCount} items; ${job.itemsUploaded} already uploaded.`
            }
          });
          return;
        }
        let created = 0;
        for (const raw of incoming) {
          let item;
          try {
            item = createLabelingJobItem({
              jobId,
              taskKind: job.taskKind,
              body: raw.body,
              goldenAnswer: raw.goldenAnswer ?? null
            });
          } catch (_error) {
            continue; // skip malformed entries silently in v1
          }
          await store.saveLabelingJobItem(item);
          created += 1;
        }
        const updatedJob = {
          ...job,
          itemsUploaded: job.itemsUploaded + created
        };
        await store.saveLabelingJob(updatedJob);
        jsonResponse(response, 201, {
          ok: true,
          job: updatedJob,
          itemsCreated: created
        });
        return;
      }

      // POST /api/sponsors/:id/labeling-jobs/:jobId/launch — flip
      // draft → active + lock escrow for the full job cost.
      const sponsorJobLaunchMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/launch$/.exec(url.pathname);
      if (request.method === 'POST' && sponsorJobLaunchMatch) {
        const sponsorId = decodeURIComponent(sponsorJobLaunchMatch[1]);
        const jobId = decodeURIComponent(sponsorJobLaunchMatch[2]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_job', message: 'labeling job not found.' }
          });
          return;
        }
        if (job.status !== 'draft') {
          jsonResponse(response, 409, {
            error: { code: 'job_not_draft', message: `cannot launch in status ${job.status}.` }
          });
          return;
        }
        if (job.itemsUploaded < job.itemCount) {
          jsonResponse(response, 400, {
            error: {
              code: 'items_incomplete',
              message: `uploaded ${job.itemsUploaded}/${job.itemCount} items; upload the rest before launch.`
            }
          });
          return;
        }
        const cost = totalLaunchCostPaise(job);
        let lockedSponsor;
        try {
          lockedSponsor = lockEscrow(sponsor, cost);
        } catch (error) {
          jsonResponse(response, 402, {
            error: {
              code: 'insufficient_escrow',
              message: error.message,
              requiredPaise: cost,
              availablePaise: sponsor.escrowBalancePaise - sponsor.escrowLockedPaise
            }
          });
          return;
        }
        const launched = {
          ...job,
          status: 'active',
          launchedAt: new Date().toISOString(),
          escrowLockedPaise: cost
        };
        await store.saveSponsor(lockedSponsor);
        await store.saveLabelingJob(launched);
        await store.appendLedger({
          type: 'sponsor_escrow.locked',
          sponsorId,
          jobId,
          amountPaise: cost,
          balancePaise: lockedSponsor.escrowBalancePaise,
          lockedPaise: lockedSponsor.escrowLockedPaise,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, {
          ok: true,
          job: launched,
          sponsor: publicSponsor(lockedSponsor)
        });
        return;
      }

      // Public listing of ACTIVE labeling jobs — used by the worker
      // /app/labels/ surface. Filter by language so workers see only
      // jobs they can attempt. No sponsor-bearer required; the worker
      // surface is open by design (jobs are public marketplace
      // listings).
      if (
        parts[0] === 'api'
        && parts[1] === 'labeling-jobs'
        && parts.length === 2
        && request.method === 'GET'
      ) {
        const all = await store.listLabelingJobs();
        const language = url.searchParams.get('language');
        const taskKind = url.searchParams.get('taskKind');
        let active = all.filter((j) => j.status === 'active');
        if (language) active = active.filter((j) => j.language === language);
        if (taskKind) active = active.filter((j) => j.taskKind === taskKind);
        // Strip sensitive sponsor-only fields; worker doesn't need
        // escrow numbers, just the per-label payout + task-kind +
        // remaining items.
        const surface = active.map((j) => ({
          jobId: j.jobId,
          sponsorId: j.sponsorId,
          taskKind: j.taskKind,
          language: j.language,
          modality: j.modality,
          perLabelPaise: j.perLabelPaise,
          description: j.description,
          itemCount: j.itemCount,
          submissionsAccepted: j.submissionsAccepted,
          deadlineAt: j.deadlineAt
        }));
        jsonResponse(response, 200, { jobs: surface });
        return;
      }

      // GET /api/labeling-jobs/:jobId/next-item — worker fetches the
      // next item to label. Returns null when no item is available
      // for this worker (already submitted all available, all items
      // consumed, OR worker's score on this job is below the
      // sponsor's gate — Phase 10.4).
      const nextItemMatch = /^\/api\/labeling-jobs\/([^/]+)\/next-item$/.exec(url.pathname);
      if (request.method === 'GET' && nextItemMatch) {
        const jobId = decodeURIComponent(nextItemMatch[1]);
        const workerId = url.searchParams.get('workerId');
        if (!workerId) {
          jsonResponse(response, 400, {
            error: { code: 'missing_worker_id', message: 'workerId query param required.' }
          });
          return;
        }
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.status !== 'active') {
          jsonResponse(response, 404, {
            error: { code: 'unknown_or_inactive_job', message: 'job not available.' }
          });
          return;
        }
        const prevSubs = await store.listLabelingSubmissions({ jobId, workerId });
        // Phase 10.4 — score gate. Honest disclosure: when a worker
        // fails the gate we say so explicitly + return their current
        // score + the threshold so the FE can render a useful card.
        const gate = Number(job.qcMinWorkerScore ?? 0);
        if (gate > 0) {
          const score = computeWorkerScore(prevSubs);
          if (score < gate) {
            jsonResponse(response, 200, {
              item: null,
              reason: 'below_worker_score_gate',
              workerScore: score,
              gate
            });
            return;
          }
        }
        const items = await store.listLabelingJobItems({ jobId });
        const submittedItemIds = new Set(prevSubs.map((s) => s.itemId));
        const item = items.find((it) => !it.consumed && !submittedItemIds.has(it.itemId));
        if (!item) {
          jsonResponse(response, 200, { item: null, reason: 'no_eligible_items' });
          return;
        }
        // Strip golden answer before sending to the worker (server
        // keeps it for the QC pipeline).
        const { goldenAnswer: _golden, ...workerSurface } = item;
        jsonResponse(response, 200, { item: workerSurface });
        return;
      }

      // POST /api/labeling-jobs/:jobId/submissions — worker submits a
      // label. Server creates the submission + bumps counters +
      // debits sponsor escrow + records mesh-contribution event.
      const submissionMatch = /^\/api\/labeling-jobs\/([^/]+)\/submissions$/.exec(url.pathname);
      if (request.method === 'POST' && submissionMatch) {
        const jobId = decodeURIComponent(submissionMatch[1]);
        const body = await readRequestJson(request);
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.status !== 'active') {
          jsonResponse(response, 404, {
            error: { code: 'unknown_or_inactive_job', message: 'job not available.' }
          });
          return;
        }
        const item = await store.readLabelingJobItem(body.itemId).catch(() => null);
        if (!item || item.jobId !== jobId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_item', message: 'item not found for this job.' }
          });
          return;
        }
        const worker = await store.readIdentity(body.workerId).catch(() => null);
        if (!worker) return notFound(response);
        const prevSubs = await store.listLabelingSubmissions({ jobId, workerId: body.workerId });
        if (!workerCanClaim(job, item, prevSubs)) {
          jsonResponse(response, 409, {
            error: {
              code: 'cannot_claim',
              message: 'worker already submitted for this item or item consumed.'
            }
          });
          return;
        }
        // Phase 10.4 — QC pipeline:
        //   1. If item.goldenAnswer is set, compute golden-match.
        //      Mismatch → status: 'rejected_golden_mismatch', no
        //      mesh credit, no escrow debit. Honest rejection.
        //   2. Otherwise, server samples a fraction of accepted
        //      submissions for sponsor review (job-config rate).
        //      Sampled → status: 'pending_sponsor_review' — worker
        //      gets the mesh credit immediately (we don't punish
        //      good workers for being sampled) but the sponsor can
        //      claw it back via the reject endpoint below.
        let submission;
        const goldenVerdict = matchesGoldenAnswer(job.taskKind, body.labelValue, item.goldenAnswer);
        const goldenMismatch = goldenVerdict === false;
        const baseStatus = goldenMismatch ? 'rejected_golden_mismatch' : 'accepted';
        try {
          submission = createLabelingSubmission({
            jobId,
            itemId: item.itemId,
            workerId: body.workerId,
            taskKind: job.taskKind,
            labelValue: body.labelValue,
            status: baseStatus,
            rejectionReason: goldenMismatch ? 'golden_set_mismatch' : null
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_submission', message: error.message }
          });
          return;
        }

        // For accepted submissions, optionally flip to
        // 'pending_sponsor_review' via deterministic sample. Caller
        // hash includes submissionId so reruns are idempotent.
        if (!goldenMismatch && shouldSampleForReview(submission.submissionId, job.qcSponsorReviewRateBps)) {
          submission = { ...submission, status: 'pending_sponsor_review' };
        }

        await store.saveLabelingSubmission(submission);

        // Item consumed regardless of status — the worker did the
        // work, the slot is filled. submissionsRejected counts
        // golden mismatches; submissionsAccepted counts both
        // accepted and pending_sponsor_review (sponsor can flip the
        // latter via the reject endpoint, which decrements counts).
        const updatedJob = {
          ...job,
          submissionsAccepted:
            submission.status === 'rejected_golden_mismatch'
              ? job.submissionsAccepted
              : job.submissionsAccepted + 1,
          submissionsRejected:
            submission.status === 'rejected_golden_mismatch'
              ? job.submissionsRejected + 1
              : job.submissionsRejected,
          escrowDebitedPaise:
            submission.status === 'rejected_golden_mismatch'
              ? job.escrowDebitedPaise
              : job.escrowDebitedPaise + job.perLabelPaise
        };
        await store.saveLabelingJob(updatedJob);
        const updatedItem = { ...item, consumed: true, submissionsCount: item.submissionsCount + 1 };
        await store.saveLabelingJobItem(updatedItem);

        let meshEvent = null;
        if (submission.status !== 'rejected_golden_mismatch' && job.perLabelPaise > 0) {
          // Debit sponsor escrow for this label.
          const sponsor = await store.readSponsor(job.sponsorId).catch(() => null);
          if (sponsor) {
            try {
              const debited = debitLockedEscrow(sponsor, job.perLabelPaise);
              await store.saveSponsor(debited);
              await store.appendLedger({
                type: 'sponsor_escrow.debited',
                sponsorId: job.sponsorId,
                jobId,
                submissionId: submission.submissionId,
                amountPaise: job.perLabelPaise,
                balancePaise: debited.escrowBalancePaise,
                lockedPaise: debited.escrowLockedPaise,
                at: new Date().toISOString()
              });
            } catch (escrowError) {
              logger.warn('sponsor_escrow_debit_failed', {
                requestId,
                sponsorId: job.sponsorId,
                jobId,
                reason: escrowError.message
              });
            }
          }
          // Record the worker's mesh-contribution event.
          meshEvent = createMeshContributionEvent({
            operatorId: body.workerId,
            workloadType: 'labeling',
            payoutPaise: job.perLabelPaise,
            jobId,
            itemId: item.itemId
          });
          await store.saveMeshContributionEvent(meshEvent);
        }

        // Worker score after this submission — surface to the FE so
        // it can render the running score honestly.
        const allWorkerSubs = await store.listLabelingSubmissions({ jobId, workerId: body.workerId });
        const workerScore = computeWorkerScore(allWorkerSubs);

        jsonResponse(response, 201, {
          ok: true,
          submission,
          meshContributionEvent: meshEvent,
          workerScore,
          qcVerdict: goldenMismatch
            ? 'golden_set_mismatch'
            : submission.status === 'pending_sponsor_review'
              ? 'sampled_for_sponsor_review'
              : 'accepted'
        });
        return;
      }

      // Phase 10.4 — sponsor-side QC. Two routes:
      //   GET .../labeling-jobs/:jobId/submissions?status=pending_sponsor_review
      //     — sponsor lists submissions waiting for human review.
      //   POST .../labeling-jobs/:jobId/submissions/:subId/reject
      //     — sponsor rejects a sampled submission with a reason.
      //       We claw back the worker's mesh credit (negative
      //       payoutPaise event) + refund the sponsor escrow.
      //       Sponsor can also POST .../accept to approve a sampled
      //       submission explicitly (clears pending status).
      const sponsorReviewListMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/submissions$/.exec(url.pathname);
      if (request.method === 'GET' && sponsorReviewListMatch) {
        const sponsorId = decodeURIComponent(sponsorReviewListMatch[1]);
        const jobId = decodeURIComponent(sponsorReviewListMatch[2]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_job', message: 'job not found for this sponsor.' }
          });
          return;
        }
        const statusFilter = url.searchParams.get('status');
        const all = await store.listLabelingSubmissions({ jobId });
        const filtered = statusFilter ? all.filter((s) => s.status === statusFilter) : all;
        // Pointer-not-payload: strip worker identity; sponsor sees
        // rotating identityHash per (jobId, workerId) — same posture
        // as the Phase 9.1 federated-round export.
        const { sha256Hex } = await import('./core.mjs');
        const surface = filtered.map((s) => ({
          submissionId: s.submissionId,
          itemId: s.itemId,
          taskKind: s.taskKind,
          labelValue: s.labelValue,
          status: s.status,
          submittedAt: s.submittedAt,
          identityHash: 'sha256:' + sha256Hex(`${jobId}::${s.workerId}`)
        }));
        jsonResponse(response, 200, { submissions: surface });
        return;
      }

      const sponsorRejectMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/submissions\/([^/]+)\/reject$/.exec(
          url.pathname
        );
      const sponsorAcceptMatch =
        /^\/api\/sponsors\/([^/]+)\/labeling-jobs\/([^/]+)\/submissions\/([^/]+)\/accept$/.exec(
          url.pathname
        );
      if (request.method === 'POST' && (sponsorRejectMatch || sponsorAcceptMatch)) {
        const isReject = Boolean(sponsorRejectMatch);
        const match = sponsorRejectMatch ?? sponsorAcceptMatch;
        const sponsorId = decodeURIComponent(match[1]);
        const jobId = decodeURIComponent(match[2]);
        const submissionId = decodeURIComponent(match[3]);
        const sponsor = await checkSponsorAuth(request, response, { store, sponsorId, requestId });
        if (!sponsor) return;
        const job = await store.readLabelingJob(jobId).catch(() => null);
        if (!job || job.sponsorId !== sponsorId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_job', message: 'job not found for this sponsor.' }
          });
          return;
        }
        const submission = await store.readLabelingSubmission(submissionId).catch(() => null);
        if (!submission || submission.jobId !== jobId) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_submission', message: 'submission not found.' }
          });
          return;
        }
        if (submission.status !== 'pending_sponsor_review') {
          jsonResponse(response, 409, {
            error: {
              code: 'not_pending_review',
              message: `submission status is ${submission.status}; cannot adjudicate.`
            }
          });
          return;
        }
        if (isReject) {
          const body = await readRequestJson(request).catch(() => ({}));
          const reason = String(body.reason ?? '').trim().slice(0, 400);
          if (!reason || reason.length < 4) {
            jsonResponse(response, 400, {
              error: { code: 'reason_required', message: 'reject requires a non-empty reason (>= 4 chars).' }
            });
            return;
          }
          const updatedSubmission = {
            ...submission,
            status: 'rejected_sponsor_review',
            rejectionReason: reason
          };
          await store.saveLabelingSubmission(updatedSubmission);

          // Claw back the worker's mesh credit via a negative
          // mesh-event. Refund the sponsor's escrow.
          if (job.perLabelPaise > 0) {
            const clawbackEvent = createMeshContributionEvent({
              operatorId: submission.workerId,
              workloadType: 'labeling',
              payoutPaise: -job.perLabelPaise,
              jobId,
              itemId: submission.itemId
            });
            await store.saveMeshContributionEvent(clawbackEvent);

            const refundedSponsor = lockEscrow(sponsor, job.perLabelPaise);
            await store.saveSponsor(refundedSponsor);
            await store.appendLedger({
              type: 'sponsor_escrow.refunded',
              sponsorId,
              jobId,
              submissionId,
              amountPaise: job.perLabelPaise,
              balancePaise: refundedSponsor.escrowBalancePaise,
              lockedPaise: refundedSponsor.escrowLockedPaise,
              reason: 'rejected_sponsor_review',
              at: new Date().toISOString()
            });
          }

          // Adjust job-level counters: previously accepted now
          // rejected.
          const updatedJob = {
            ...job,
            submissionsAccepted: Math.max(0, job.submissionsAccepted - 1),
            submissionsRejected: job.submissionsRejected + 1,
            escrowDebitedPaise: Math.max(0, job.escrowDebitedPaise - job.perLabelPaise)
          };
          await store.saveLabelingJob(updatedJob);
          jsonResponse(response, 200, {
            ok: true,
            submission: updatedSubmission,
            clawedBackPaise: job.perLabelPaise
          });
          return;
        }
        // Accept path: flip pending → accepted; no mesh / escrow
        // changes (those already happened on submit).
        const updatedSubmission = { ...submission, status: 'accepted' };
        await store.saveLabelingSubmission(updatedSubmission);
        jsonResponse(response, 200, { ok: true, submission: updatedSubmission });
        return;
      }

      // Phase 10.4 — worker-facing stats endpoint. Returns per-job
      // scores + a global summary. Used by the FE to render
      // "Your score: 0.92" on the Labels surface.
      const labelingStatsMatch =
        /^\/api\/identities\/([^/]+)\/labeling-stats$/.exec(url.pathname);
      if (request.method === 'GET' && labelingStatsMatch) {
        const identityId = decodeURIComponent(labelingStatsMatch[1]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const all = await store.listLabelingSubmissions({ workerId: identityId });
        const byJob = new Map();
        for (const sub of all) {
          if (!byJob.has(sub.jobId)) byJob.set(sub.jobId, []);
          byJob.get(sub.jobId).push(sub);
        }
        const perJob = Array.from(byJob.entries()).map(([jobId, subs]) => ({
          jobId,
          submissionCount: subs.length,
          acceptedCount: subs.filter((s) => s.status === 'accepted').length,
          pendingReviewCount: subs.filter((s) => s.status === 'pending_sponsor_review').length,
          rejectedCount: subs.filter((s) => QC_REJECTED_STATUSES.has(s.status)).length,
          score: computeWorkerScore(subs)
        }));
        const overallScore = computeWorkerScore(all);
        jsonResponse(response, 200, {
          identityId,
          overall: {
            submissionCount: all.length,
            score: overallScore
          },
          perJob
        });
        return;
      }

      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/shell')) {
        response.writeHead(302, { location: '/shell/' });
        response.end();
        return;
      }

      if (request.method === 'GET' && url.pathname === '/console') {
        response.writeHead(302, { location: '/console/' });
        response.end();
        return;
      }

      // Phase 11.0 — /app/ surface (Vite-built React SPA). Static
      // bundle lives at public/app/build/. Client-side routing
      // means any /app/* path that doesn't match a real file falls
      // back to index.html so React Router can resolve it.
      if (request.method === 'GET' && url.pathname === '/app') {
        response.writeHead(302, { location: '/app/' });
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/app/')) {
        const appBuildRoot = path.join(repoRoot, 'public/app/build');
        const relativePath =
          url.pathname === '/app/' ? 'index.html' : decodeURIComponent(url.pathname.slice('/app/'.length));
        const requestedPath = path.resolve(appBuildRoot, relativePath);
        if (!requestedPath.startsWith(appBuildRoot)) {
          return notFound(response, url.pathname);
        }
        // SPA fallback: any non-file path under /app/ returns
        // index.html so client-side routing works.
        try {
          const fsModule = await import('node:fs/promises');
          await fsModule.stat(requestedPath);
          await staticResponse(response, requestedPath);
        } catch (_error) {
          await staticResponse(response, path.join(appBuildRoot, 'index.html'));
        }
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/shell/')) {
        // §7c vault transfer module is shared with `src/phase1` (canonical
        // artifact tested by node:test) — alias the shell-import path so we
        // don't have two copies.
        if (url.pathname === '/shell/vault-transfer.mjs') {
          await staticResponse(
            response,
            path.join(repoRoot, 'src/phase1/vault-transfer.mjs')
          );
          return;
        }
        // §7f Phase 3.1 — same alias trick for the on-device training
        // module so the browser and node:test share one canonical file.
        if (url.pathname === '/shell/local-training.mjs') {
          await staticResponse(
            response,
            path.join(repoRoot, 'src/phase1/local-training.mjs')
          );
          return;
        }
        const relativePath =
          url.pathname === '/shell/' ? 'index.html' : decodeURIComponent(url.pathname.slice('/shell/'.length));
        const requestedPath = path.resolve(shellRoot, relativePath);
        if (!requestedPath.startsWith(shellRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/verify') {
        response.writeHead(302, { location: '/verify/' });
        response.end();
        return;
      }

      if (request.method === 'GET' && (url.pathname === '/legal' || url.pathname === '/legal/')) {
        // No legal/ index page yet; default to privacy.
        response.writeHead(302, { location: '/legal/privacy.html' });
        response.end();
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/legal/')) {
        const relativePath = decodeURIComponent(url.pathname.slice('/legal/'.length));
        const requestedPath = path.resolve(legalRoot, relativePath);
        if (!requestedPath.startsWith(legalRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/verify/')) {
        const relativePath =
          url.pathname === '/verify/'
            ? 'index.html'
            : decodeURIComponent(url.pathname.slice('/verify/'.length));
        const requestedPath = path.resolve(verifyRoot, relativePath);
        if (!requestedPath.startsWith(verifyRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }

      // Phase 5.9 — `/sign/<tokenId>` lands the customer on the
      // minimal signing page. The HTML is purely static; the page
      // discovers the tokenId from `location.pathname` and calls
      // the API endpoints over fetch. No Bharat OS install required.
      if (request.method === 'GET' && url.pathname.startsWith('/sign/')) {
        // Every /sign/* path renders the same index.html shell;
        // the tokenId is read client-side from the URL. This avoids
        // having to template the HTML server-side.
        const requestedPath = path.resolve(signsRoot, 'index.html');
        if (!requestedPath.startsWith(signsRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }
      // Static assets under /signs/ (CSS, JS) served the same way
      // as /shell/.
      if (request.method === 'GET' && url.pathname.startsWith('/signs/')) {
        const relativePath =
          url.pathname === '/signs/'
            ? 'index.html'
            : decodeURIComponent(url.pathname.slice('/signs/'.length));
        const requestedPath = path.resolve(signsRoot, relativePath);
        if (!requestedPath.startsWith(signsRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/console/')) {
        const relativePath = url.pathname === '/console/' ? 'index.html' : decodeURIComponent(url.pathname.slice('/console/'.length));
        const requestedPath = path.resolve(consoleRoot, relativePath);
        if (!requestedPath.startsWith(consoleRoot)) {
          return notFound(response, url.pathname);
        }
        await staticResponse(response, requestedPath);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        jsonResponse(response, 200, {
          ok: true,
          service: 'bharat-os-phase0-api',
          startedAt
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api') {
        jsonResponse(response, 200, {
          service: 'bharat-os-phase0-api',
          routes: [
            'GET /health',
            'GET /healthz',
            'GET /readyz',
            'GET /metrics',
            'GET /api/admin/backup-status',
            'POST /api/admin/sms/circuit/reset',
            'POST /api/admin/identities/:id/recovery-cooldown/clear',
            'POST /api/admin/backup/snapshot',
            'GET /api',
            'GET /shell/',
            'GET /console/',
            'GET /verify/',
            'GET /legal/privacy.html',
            'GET /legal/terms.html',
            'GET /api/dashboard',
            'GET /api/policies',
            'GET /api/skills',
            'GET /api/skills/:skillId',
            'POST /api/skills/:skillId/preflight',
            'GET /api/skill-preflights',
            'GET /api/skill-preflights/:preflightId',
            'POST /api/skill-preflights/:preflightId/consent',
            'POST /api/skill-preflights/:preflightId/retry',
            'POST /api/skill-preflights/:preflightId/execute',
            'GET /api/skill-preflights/:preflightId/trace',
            'GET /api/tools',
            'GET /api/tool-executions',
            'POST /api/tools/execute',
            'GET /api/orchestration-templates',
            'GET /api/orchestrations',
            'POST /api/orchestrations',
            'GET /api/consents',
            'POST /api/consents',
            'GET /api/consents/:consentId',
            'POST /api/consents/:consentId/revoke',
            'GET /api/decisions',
            'POST /api/decisions/evaluate',
            'GET /api/memory-search',
            'GET /api/memory-records',
            'POST /api/memory-records',
            'GET /api/memory-records/:recordId',
            'GET /api/memory-records/:recordId/provenance',
            'POST /api/memory-records/:recordId/read',
            'GET /api/health-documents',
            'POST /api/health-documents',
            'GET /api/health-documents/:captureId',
            'POST /api/profile-auth/challenges',
            'GET /api/profile-auth/credentials',
            'POST /api/profile-auth/credentials',
            'POST /api/profile-auth/assertions',
            'GET /api/push/subscriptions',
            'POST /api/push/subscriptions',
            'DELETE /api/push/subscriptions/:subscriptionId',
            'GET /api/worker-notifications',
            'POST /api/worker-notifications',
            'GET /api/voice/runtime',
            'GET /api/voice/model-packs',
            'POST /api/voice/model-packs',
            'GET /api/tts/runtime',
            'GET /api/tts/model-packs',
            'POST /api/tts/model-packs',
            'GET /api/on-device/runtime',
            'GET /api/on-device/model-packs',
            'POST /api/on-device/model-packs',
            'POST /api/integrity/verify',
            'GET /api/ledger',
            'GET /api/ledger.ndjson',
            'GET /api/trust-passports',
            'GET /api/trust-passports/:identityId',
            'POST /api/trust-passports/:identityId/sign',
            'GET /api/identities',
            'POST /api/identities',
            'GET /api/identities/:identityId/contribution',
            'GET /api/identities/:identityId/recovery-phrase',
            'GET /api/identities/:identityId/vault-snapshot',
            'GET /api/identities/:identityId/export',
            'GET /api/identities/:identityId/erasure-preview',
            'GET /api/push-public-key',
            'POST /api/identities/:identityId/earnings',
            'GET /api/identities/:identityId/earnings',
            'GET /api/identities/:identityId/earnings/summary',
            'DELETE /api/identities/:identityId/earnings/:entryId',
            'GET /api/identities/:identityId/mesh/summary',
            'GET /api/identities/:identityId/mesh/balance',
            'POST /api/identities/:identityId/mesh/withdrawals',
            'GET /api/identities/:identityId/mesh/withdrawals',
            'POST /api/admin/mesh/withdrawals/:requestId/accepted',
            'POST /api/admin/mesh/withdrawals/:requestId/paid',
            'POST /api/admin/mesh/withdrawals/:requestId/failed',
            'GET /api/slm-model-packs',
            'GET /api/slm-model-packs/:modelPackId',
            'POST /api/admin/slm-model-packs',
            'DELETE /api/admin/slm-model-packs/:modelPackId',
            'POST /api/admin/sponsors',
            'GET /api/admin/sponsors',
            'POST /api/admin/sponsors/:sponsorId/deposit',
            'DELETE /api/admin/sponsors/:sponsorId',
            'GET /api/sponsors/:sponsorId  (public directory)',
            'GET /api/sponsors/:sponsorId/self  (bearer-gated, with escrow)',
            'GET /api/sponsors/:sponsorId/federated-rounds  (bearer-gated)',
            'POST /api/sponsors/:sponsorId/federated-rounds  (bearer-gated)',
            'GET /api/sponsors/:sponsorId/federated-rounds/:roundId/export  (bearer-gated)',
            'POST /api/sponsors/:sponsorId/labeling-jobs  (bearer-gated; create draft)',
            'GET /api/sponsors/:sponsorId/labeling-jobs  (bearer-gated; list own)',
            'POST /api/sponsors/:sponsorId/labeling-jobs/:jobId/items  (bearer-gated)',
            'POST /api/sponsors/:sponsorId/labeling-jobs/:jobId/launch  (bearer-gated; locks escrow)',
            'GET /api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson  (bearer-gated; signed audit bundle)',
            'GET /api/audit-signer/public-key  (public; verify export bundles)',
            'GET /api/labeling-jobs  (public worker discovery)',
            'GET /api/labeling-jobs/:jobId/next-item?workerId=…  (next-item dispatch)',
            'POST /api/labeling-jobs/:jobId/submissions  (worker label submission)',
            'GET /api/identities/:rootIdentityId/provider-identities  (Phase 12.0 — owned)',
            'POST /api/identities/:rootIdentityId/provider-identities  (Phase 12.0 — create draft)',
            'GET /api/provider-identities/:providerIdentityId  (public, marketplace)',
            'POST /api/provider-identities/:providerIdentityId/profile  (root owner — edit)',
            'POST /api/admin/provider-identities/:providerIdentityId/kyc-attest  (operator)',
            'POST /api/admin/provider-identities/:providerIdentityId/transition  (operator status change)',
            'GET /api/marketplace/providers?lat&lng&radiusMeters&role&limit  (Phase 12.1a.1 — discovery)',
            'POST /api/marketplace/providers/:providerIdentityId/express-interest  (Phase 12.1a.1 — booking stub)',
            'POST /api/marketplace/bookings  (Phase 12.1a.2 — citizen creates booking, locks escrow)',
            'GET /api/marketplace/bookings/:bookingId  (Phase 12.1a.2 — party-aware projection)',
            'POST /api/marketplace/bookings/:bookingId/accept|reject|cancel|mark-complete|confirm-complete|dispute  (Phase 12.1a.2 — CAS+expectedSeq)',
            'GET /api/citizens/:rootIdentityId/bookings?status  (Phase 12.1a.2 — citizen booking list)',
            'GET /api/citizens/:rootIdentityId/escrow  (Phase 12.1a.2 — citizen escrow projection)',
            'GET /api/provider-identities/:providerIdentityId/bookings?status  (Phase 12.1a.2 — provider inbox; owner-auth)',
            'POST /api/admin/citizens/:rootIdentityId/escrow/deposit  (Phase 12.1a.2 — bookkeeping-v1 funding)',
            'GET /api/admin/bookings?status  (Phase 12.1a.2 — operator queue)',
            'POST /api/admin/bookings/:bookingId/adjudicate  (Phase 12.1a.2 — operator dispute resolution)',
            'POST /api/admin/bookings/sweep-stale  (Phase 12.1a.2 — operator backstop)',
            'GET /api/identities/:identityId/installed-slms',
            'POST /api/identities/:identityId/installed-slms',
            'DELETE /api/identities/:identityId/installed-slms/:installId',
            'GET /app/*  (Phase 11 SPA — public/app/build/)',
            'POST /api/identities/:collectiveId/collective-memberships',
            'GET /api/identities/:memberId/collective-memberships',
            'POST /api/identities/:collectiveId/collective-memberships/:membershipId/revoke',
            'GET /api/blessed-collectives',
            'POST /api/admin/blessed-collectives',
            'DELETE /api/admin/blessed-collectives/:collectiveId',
            'POST /api/identities/:issuerId/eshram-registrations',
            'GET /api/identities/:memberId/eshram-registrations',
            'POST /api/identities/:issuerId/eshram-registrations/:registrationId/revoke',
            'POST /api/identities/:issuerId/scheme-entitlements',
            'GET /api/identities/:memberId/scheme-entitlements',
            'POST /api/identities/:issuerId/scheme-entitlements/:entitlementId/revoke',
            'GET /api/identities/:identityId/tax/summary',
            'POST /api/portable-attestation/init',
            'POST /api/portable-attestation/:tokenId/sign-tier0',
            'POST /api/portable-attestation/:tokenId/sign-tier1/send',
            'POST /api/portable-attestation/:tokenId/sign-tier1/verify',
            'GET /api/portable-attestation/:tokenId/sign-tier2/payload',
            'POST /api/portable-attestation/:tokenId/sign-tier2',
            'GET /api/identities/:identityId/portable-attestation/summary',
            'POST /api/identities/:identityId/income-verification/consents',
            'GET /api/identities/:identityId/income-verification/consents',
            'POST /api/identities/:identityId/income-verification/consents/:consentId/revoke',
            'GET /api/income-verification/:consentId',
            'GET /sign/:tokenId',
            'DELETE /api/identities/:identityId?confirm=YES_DELETE',
            'GET /api/dpdp/grievance',
            'POST /api/phone-otp/send',
            'POST /api/phone-otp/verify',
            'POST /api/recovery/start',
            'POST /api/recovery/verify',
            'GET /api/attestations',
            'GET /api/attestations/:attestationId',
            'GET /api/attestations/:attestationId/verify',
            'POST /api/attestations/:attestationId/verify',
            'GET /api/worker-authorizations',
            'POST /api/worker-authorizations',
            'GET /api/worker-authorizations/:authorizationId',
            'POST /api/worker-authorizations/:authorizationId/verify',
            'GET /api/flags',
            'POST /api/flags',
            'GET /api/flags/:flagId',
            'POST /api/flags/:flagId/resolve',
            'GET /api/flags/summary/:subjectActorId',
            'GET /api/mesh/contributions',
            'POST /api/mesh/contributions',
            'GET /api/mesh/contributions/summary/:operatorId',
            'GET /api/federated/rounds',
            'POST /api/federated/rounds',
            'POST /api/federated/rounds/:roundId/updates',
            'POST /api/federated/rounds/:roundId/updates/sign-and-submit',
            'POST /api/federated/rounds/:roundId/aggregate',
            'GET /api/federated/budget/:contributorId',
            'GET /api/mesh/rates',
            'POST /api/pairing/sessions',
            'GET /api/pairing/sessions/:sessionId',
            'POST /api/pairing/sessions/:sessionId/claim',
            'POST /api/pairing/sessions/:sessionId/sdp',
            'POST /api/pairing/sessions/:sessionId/complete',
            'GET /api/pairing/sessions/by-code/:claimCode',
            'GET /api/nodes',
            'GET /api/manifests',
            'GET /api/reports',
            'GET /api/reports/:reportId',
            'GET /api/reports/:reportId.md',
            'GET /api/control-planes/:controlPlaneId',
            'POST /api/simulations/bootstrap'
          ]
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'orchestration-templates') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { templates: listOrchestrationTemplates() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skills' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { skills: listSkills() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skills' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { skill: readSkill(decodeURIComponent(parts[2])) });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skills' && parts.length === 4 && parts[3] === 'preflight') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const preflight = evaluateSkillPreflight(decodeURIComponent(parts[2]), body, consents, {
          publicRecords
        });
        await store.saveDecision(preflight.decision);
        await store.saveSkillPreflight(preflight);
        jsonResponse(response, 200, {
          ok: true,
          preflight
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { preflights: await store.listSkillPreflights() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { preflight: await store.readSkillPreflight(decodeURIComponent(parts[2])) });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 4 && parts[3] === 'consent') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const preflight = await store.readSkillPreflight(decodeURIComponent(parts[2]));
        const grant = preflight.remediation?.consentGrant;
        if (!grant) {
          throw new Error('Stored preflight does not include a consent grant remediation template.');
        }
        let consent = createConsent({
          subjectId: grant.subjectId,
          granteeId: grant.granteeId,
          scopes: grant.scopes,
          purpose: body.purpose ?? grant.purpose,
          ttlDays: parseInteger(body.ttlDays, 30, 'ttlDays'),
          expiresAt: body.expiresAt,
          constraints: {
            ...(grant.constraints ?? {}),
            ...(body.constraints ?? {})
          }
        });
        if (body.signWithIdentityId) {
          const signer = await store.readIdentity(body.signWithIdentityId);
          consent = signConsent(consent, signer, { role: body.signRole ?? 'subject' });
        }
        await store.saveConsent(consent);
        const publicRecords = await identityPublicRecords(store);
        jsonResponse(response, 201, {
          ok: true,
          preflightId: preflight.preflightId,
          consent,
          lifecycle: consentLifecycle(consent),
          integrity: verifyArtifactIntegrity(consent, publicRecords)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 4 && parts[3] === 'retry') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const sourcePreflight = await store.readSkillPreflight(decodeURIComponent(parts[2]));
        const consents = await store.listConsents();
        const retry = evaluateSkillPreflight(
          sourcePreflight.skillId,
          {
            ...sourcePreflight.decision?.request,
            metadata: {
              ...(sourcePreflight.decision?.request?.metadata ?? {}),
              retryOfPreflightId: sourcePreflight.preflightId
            }
          },
          consents
        );
        await store.saveDecision(retry.decision);
        await store.saveSkillPreflight(retry);
        jsonResponse(response, 201, { ok: true, sourcePreflightId: sourcePreflight.preflightId, preflight: retry });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 4 && parts[3] === 'execute') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const preflight = await store.readSkillPreflight(decodeURIComponent(parts[2]));
        if (!preflight.approved) {
          throw new Error('Stored preflight must be approved before execution.');
        }
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const execution = executeToolAction(preflight.decision.request, consents, {
          skillPreflightId: preflight.preflightId,
          publicRecords
        });
        await store.saveDecision(execution.decision);
        await store.saveToolExecution(execution);
        jsonResponse(response, 201, {
          ok: execution.status === 'completed',
          preflightId: preflight.preflightId,
          execution,
          integrity: verifyArtifactIntegrity(execution, publicRecords)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'skill-preflights' && parts.length === 4 && parts[3] === 'trace') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const preflight = await store.readSkillPreflight(decodeURIComponent(parts[2]));
        jsonResponse(response, 200, {
          trace: createSkillInvocationTrace(preflight, {
            preflights: await store.listSkillPreflights(),
            executions: await store.listToolExecutions(),
            decisions: await store.listDecisions(),
            consents: await store.listConsents(),
            ledgerEvents: await store.listLedger({ limit: undefined, newestFirst: false })
          })
        });
        return;
      }

      // Phase 12.1b.2 — captive-portal-aware health probe. Cheap
      // GET that the FE useOnlineStatus hook polls on a 30s
      // interval ONLY while offline so it can detect the
      // "navigator.onLine says yes but a wifi captive portal is
      // hijacking us" case + decide when to drain the queue.
      // GET (HEAD also accepted via Node's http.IncomingMessage).
      if (parts[0] === 'api' && parts[1] === 'health' && parts.length === 2) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return methodNotAllowed(response, ['GET', 'HEAD']);
        }
        response.setHeader('cache-control', 'no-store');
        response.setHeader('content-type', 'application/json; charset=utf-8');
        const payload = JSON.stringify({ ok: true, at: new Date().toISOString() }) + '\n';
        if (request.method === 'HEAD') {
          response.writeHead(200);
          response.end();
        } else {
          response.writeHead(200);
          response.end(payload);
        }
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'orchestrations' && parts.length === 2) {
        if (request.method === 'GET') {
          jsonResponse(response, 200, { orchestrations: await store.listOrchestrations() });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          // Phase 12.1b.2 — Idempotency-Key from header. Lower-case
          // canonical match per the substrate's 32-hex contract.
          const headers = request.headers || {};
          const idempotencyKey = (
            headers['idempotency-key'] ??
            headers['Idempotency-Key']
          ) || null;
          const consents = await store.listConsents();
          const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
          const flags = await store.listFlagReports();

          // Phase 12.1b.1 — optional on-device SLM annotation. Validated
          // + clipped here so a misbehaving FE can't pollute the ledger.
          // NEVER overrides server-side actionType inference.
          let intentAnnotation = null;
          const rawAnnotation = body.intentAnnotation ?? body.metadata?.intentAnnotation ?? null;
          if (rawAnnotation != null) {
            try {
              intentAnnotation = normaliseIntentAnnotation(rawAnnotation);
            } catch (err) {
              jsonResponse(response, 400, {
                error: { code: 'invalid_intent_annotation', message: err.message }
              });
              return;
            }
          }

          // §9C vignette 16b — daily_brief needs the on-device signals
          // gathered (recent activity, mesh earnings, expiring consents,
          // open §9A flags) before the tool can render the brief. This
          // is the server stand-in for the Phase 2b on-device gather
          // step; the §15 binding (no PII leaves the user's profile
          // boundary) is preserved because the signals only ever live
          // inside the orchestration response back to the same client.
          let augmentedBody = { ...body, intentAnnotation };
          if (body.actionType === 'daily_brief' && body.actorId) {
            const horizonHours = Number(body.metadata?.horizonHours ?? 24);
            const signals = await gatherDailyBriefSignals(store, body.actorId, {
              horizonHours
            }).catch(() => null);
            const subjectIdentity = await store
              .readIdentity(body.actorId)
              .catch(() => null);
            augmentedBody = {
              ...body,
              intentAnnotation,
              metadata: {
                ...(body.metadata ?? {}),
                signals,
                subjectDisplayName: subjectIdentity?.displayName ?? null
              }
            };
          }

          // Phase 12.1b.2 — wrap the orchestration work in
          // `withIdempotency` so a citizen's offline queue can
          // replay safely. On replay (same actorId + key +
          // matching request fingerprint) the substrate returns
          // the cached response body and the orchestrator code
          // path is NEVER re-entered — so downstream effects
          // (decision rows, skill preflight, push notifications,
          // escrow holds) fire exactly ONCE per real mutation.
          //
          // The request body excludes the daily_brief signals
          // augmentation (server-side enrichment) and the
          // intentAnnotation echo (already validated) when
          // computing the fingerprint, so a citizen replaying the
          // same intent text + locale always matches.
          let idempotencyOutcome;
          try {
            idempotencyOutcome = await withIdempotency(
              store,
              {
                scope: 'orchestration.create',
                actorId: body.actorId,
                idempotencyKey,
                requestBody: {
                  intentText: body.intentText ?? '',
                  actorId: body.actorId ?? '',
                  locale: body.locale ?? 'en-IN',
                  actionType: body.actionType ?? null,
                  intentAnnotation: intentAnnotation
                }
              },
              async () => {
                const orchestration = orchestrateIntent(augmentedBody, consents, {
                  execute: Boolean(body.execute),
                  publicRecords,
                  flags
                });
                await store.saveDecision(orchestration.decision);
                await store.saveSkillPreflight(orchestration.skillPreflight);
                if (orchestration.execution) {
                  await store.saveToolExecution(orchestration.execution);
                }
                await store.saveOrchestration(orchestration);

                // Phase 12.1b.1 — record the SLM-vs-substrate
                // verdict on the ledger. Fires exactly ONCE per
                // real mutation because we're inside the
                // worker closure.
                const verdict = compareIntentAnnotation(
                  intentAnnotation,
                  orchestration.actionRequest?.actionType ?? null
                );
                if (verdict !== 'absent') {
                  await store.appendLedger(
                    buildIntentAnnotationLedgerEvent({
                      orchestrationId: orchestration.orchestrationId,
                      annotation: intentAnnotation,
                      serverActionType: orchestration.actionRequest?.actionType ?? null,
                      verdict,
                      at: orchestration.createdAt
                    })
                  );
                }

                // §13A #7 — auto-sign trust attestation. Same
                // worker closure → fires ONCE.
                let signedAttestation = null;
                if (
                  body.actionType === 'trust_attestation' &&
                  orchestration.execution?.toolReceipt?.toolId ===
                    'trust_passport_attestation' &&
                  orchestration.execution.status === 'completed'
                ) {
                  const subject = await store.readIdentity(body.actorId).catch(() => null);
                  if (subject) {
                    signedAttestation = signTrustAttestation(
                      orchestration.execution.toolReceipt,
                      subject
                    );
                    await store.saveAttestation(signedAttestation);
                  }
                }

                return {
                  ok: true,
                  orchestration,
                  attestation: signedAttestation
                };
              }
            );
          } catch (err) {
            if (err instanceof IdempotencyError) {
              jsonResponse(response, err.status, {
                error: { code: err.code, message: err.message }
              });
              return;
            }
            throw err;
          }
          // Surface the replay status on a response header so a
          // future debugging / telemetry surface can detect it
          // without parsing the body.
          if (idempotencyOutcome.source === 'replay') {
            response.setHeader('X-Bharat-Os-Idempotent-Replay', '1');
          }
          jsonResponse(
            response,
            idempotencyOutcome.source === 'replay' ? 200 : 201,
            idempotencyOutcome.body
          );
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      // §13A #7 — verifier-side attestation read + signature
      // verification. Both routes are public-read (the attestation
      // envelope is signed; verification needs only the subject's
      // public record). The verifier flow is intentionally
      // server-side: the page just renders the result.
      if (parts[0] === 'api' && parts[1] === 'attestations' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const attestations = await store.listAttestations();
        jsonResponse(response, 200, {
          attestations: attestations.map((att) => ({
            attestationId: att.attestationId,
            subjectId: att.subjectId,
            verifierName: att.verifierName,
            purpose: att.purpose,
            issuedAt: att.issuedAt,
            expiresAt: att.expiresAt,
            claimCount: Array.isArray(att.claims) ? att.claims.length : 0
          }))
        });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'attestations' &&
        parts.length === 3
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const attestationId = decodeURIComponent(parts[2]);
        const attestation = await store.readAttestation(attestationId).catch(() => null);
        if (!attestation) return notFound(response);
        jsonResponse(response, 200, { attestation });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'attestations' &&
        parts.length === 4 &&
        parts[3] === 'verify'
      ) {
        if (request.method !== 'POST' && request.method !== 'GET') {
          return methodNotAllowed(response, ['GET', 'POST']);
        }
        const attestationId = decodeURIComponent(parts[2]);
        const attestation = await store.readAttestation(attestationId).catch(() => null);
        if (!attestation) return notFound(response);
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const result = verifyTrustAttestation(attestation, publicRecords);
        jsonResponse(response, 200, { attestationId, ...result });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'tools' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { tools: listTools() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'tool-executions' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { executions: await store.listToolExecutions() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'tools' && parts[2] === 'execute') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const skill = skillForTool(toolIdFromActionRequest(body));
        const preflight = evaluateSkillPreflight(skill.skillId, body, consents, { publicRecords });
        const execution = preflight.approved
          ? executeToolAction(preflight.decision.request, consents, {
              at: preflight.checkedAt,
              skillPreflightId: preflight.preflightId,
              publicRecords
            })
          : createBlockedToolExecution(preflight.decision, {
              skillPreflightId: preflight.preflightId
            });
        await store.saveDecision(preflight.decision);
        await store.saveSkillPreflight(preflight);
        await store.saveToolExecution(execution);
        jsonResponse(response, 201, { ok: execution.status === 'completed', preflight, execution });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'policies') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { policies: listPolicies() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'consents' && parts.length === 2) {
        if (request.method === 'GET') {
          const storedConsents = await store.listConsents();
          jsonResponse(response, 200, {
            consents: storedConsents.map((consent) => ({
              ...consent,
              lifecycle: consentLifecycle(consent)
            }))
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          let consent = createConsent(body);
          if (body.signWithIdentityId) {
            const signer = await store.readIdentity(body.signWithIdentityId);
            consent = signConsent(consent, signer, { role: body.signRole ?? 'subject' });
          }
          await store.saveConsent(consent);
          jsonResponse(response, 201, { ok: true, consent });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'consents' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const consent = await store.readConsent(decodeURIComponent(parts[2]));
        jsonResponse(response, 200, { consent: { ...consent, lifecycle: consentLifecycle(consent) } });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'consents' && parts.length === 4 && parts[3] === 'revoke') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const consent = await store.readConsent(decodeURIComponent(parts[2]));
        let revoked = revokeConsent(consent, {
          reason: body.reason ?? 'revoked_by_operator',
          revokedBy: body.revokedBy ?? body.signWithIdentityId ?? consent.subjectId
        });
        if (body.signWithIdentityId) {
          const signer = await store.readIdentity(body.signWithIdentityId);
          revoked = signConsentRevocation(revoked, signer, { role: body.signRole ?? 'revoker' });
        }
        await store.saveConsent(revoked);
        const lifecycle = consentLifecycle(revoked);
        jsonResponse(response, 200, {
          ok: true,
          consent: { ...revoked, lifecycle },
          lifecycle
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'decisions' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { decisions: await store.listDecisions() });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'decisions' && parts[2] === 'evaluate') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const decision = evaluateDecision(body, consents, { publicRecords });
        await store.saveDecision(decision);
        jsonResponse(response, 201, { ok: true, decision });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'memory-search') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const records = await store.listMemoryRecords();
        jsonResponse(response, 200, {
          memory: searchMemoryRecords(records, {
            ownerId: url.searchParams.get('ownerId') ?? url.searchParams.get('identityId') ?? undefined,
            query: url.searchParams.get('query') ?? undefined,
            tags: url.searchParams.get('tags') ?? undefined,
            scopes: url.searchParams.get('scopes') ?? undefined,
            limit: parseInteger(url.searchParams.get('limit'), 20, 'limit')
          })
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'memory-records' && parts.length === 2) {
        if (request.method === 'GET') {
          const ownerId = url.searchParams.get('ownerId');
          const records = await store.listMemoryRecords();
          jsonResponse(response, 200, {
            memory: records
              .filter((record) => !ownerId || record.ownerId === ownerId)
              .map(memorySummary)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const identity = await store.readIdentity(body.identityId);
          const { record, bundle } = createMemoryRecord(identity, body.text, {
            label: body.label,
            contentType: body.contentType ?? 'text/plain; charset=utf-8',
            scopes: body.scopes ?? ['memory.read', 'consent.record'],
            source: body.source ?? { type: 'api' },
            tags: body.tags ?? [],
            sensitivity: body.sensitivity ?? 'personal'
          });
          await store.saveBundle(bundle);
          await store.saveMemoryRecord(record);
          jsonResponse(response, 201, { ok: true, memory: memorySummary(record) });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'memory-records' && parts.length === 4 && parts[3] === 'provenance') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const record = await store.readMemoryRecord(decodeURIComponent(parts[2]));
        jsonResponse(response, 200, { provenance: memoryProvenance(record) });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'memory-records' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const record = await store.readMemoryRecord(decodeURIComponent(parts[2]));
        jsonResponse(response, 200, { memory: memorySummary(record) });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'memory-records' && parts.length === 4 && parts[3] === 'read') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const record = await store.readMemoryRecord(decodeURIComponent(parts[2]));
        const identity = await store.readIdentity(body.identityId ?? record.ownerId);
        const bundle = await store.readBundle(record.manifestId);
        const consents = await store.listConsents();
        const result = readMemoryRecordWithConsent(identity, record, bundle, consents, {
          granteeId: body.granteeId ?? 'bharat-os-orchestrator',
          piiHandling: body.piiHandling ?? 'summary'
        });
        await store.saveDecision(result.decision);
        jsonResponse(response, result.approved ? 200 : 403, {
          ok: result.approved,
          approved: result.approved,
          decision: result.decision,
          memory: memorySummary(record),
          plaintext: result.plaintext
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'health-documents' && parts.length === 2) {
        if (request.method === 'GET') {
          jsonResponse(response, 200, { captures: await store.listHealthDocumentCaptures() });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const capture = createHealthDocumentCapture(body);
          const consents = await store.listConsents();
          const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
          const skill = readSkill('bos:skill:abha-document-upload');
          const preflight = evaluateSkillPreflight(
            skill,
            {
              actorId: capture.actorId,
              actionType: 'health_document_upload',
              scopes: ['health.record.write', 'consent.record'],
              piiHandling: 'summary',
              identity: { aadhaarRequired: false, fallbackAvailable: true },
              metadata: {
                healthDocumentCapture: capture,
                documentType: capture.documentType,
                captureId: capture.captureId,
                sourceTextHash: capture.structured.sourceTextHash
              }
            },
            consents,
            { publicRecords }
          );
          const execution = preflight.approved
            ? executeToolAction(preflight.decision.request, consents, {
                at: preflight.checkedAt,
                skillPreflightId: preflight.preflightId,
                publicRecords
              })
            : createBlockedToolExecution(preflight.decision, {
                skillPreflightId: preflight.preflightId
              });
          await store.saveDecision(preflight.decision);
          await store.saveSkillPreflight(preflight);
          await store.saveToolExecution(execution);

          const persistedCapture = {
            ...capture,
            status: execution.status === 'completed' ? 'uploaded' : 'blocked',
            skillPreflightId: preflight.preflightId,
            decisionId: preflight.decisionId,
            executionId: execution.executionId,
            abhaUpload: execution.toolReceipt
          };
          if (execution.status === 'completed') {
            await store.saveHealthDocumentCapture(persistedCapture);
          }

          jsonResponse(response, execution.status === 'completed' ? 201 : 403, {
            ok: execution.status === 'completed',
            capture: persistedCapture,
            preflight,
            execution
          });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'health-documents' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const captureId = decodeURIComponent(parts[2]);
        jsonResponse(response, 200, { capture: await store.readHealthDocumentCapture(captureId) });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'profile-auth' && parts[2] === 'challenges') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const challenge = createProfileAuthChallenge({
          identityId: body.identityId,
          ceremony: body.ceremony ?? 'register'
        });
        jsonResponse(response, 201, { ok: true, challenge });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'profile-auth' && parts[2] === 'credentials') {
        if (request.method === 'GET') {
          const identityId = url.searchParams.get('identityId');
          const credentials = await store.listProfileCredentials();
          jsonResponse(response, 200, {
            credentials: credentials.filter((credential) => !identityId || credential.identityId === identityId)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const credential = createProfileCredentialRecord({
            identityId: body.identityId,
            credentialId: body.credentialId,
            challenge: body.challenge,
            publicKeyAlgorithm: body.publicKeyAlgorithm,
            transports: body.transports ?? [],
            userVerified: body.userVerified
          });
          await store.saveProfileCredential(credential);
          jsonResponse(response, 201, { ok: true, credential });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'profile-auth' && parts[2] === 'assertions') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const credentials = await store.listProfileCredentials();
        const credential = credentials.find(
          (candidate) =>
            candidate.identityId === body.identityId &&
            (!body.credentialId || candidate.credentialId === body.credentialId)
        );
        const verification = verifyProfileCredentialAssertion({
          credential,
          credentialId: body.credentialId,
          challenge: body.challenge
        });
        jsonResponse(response, verification.valid ? 200 : 403, { ok: verification.valid, verification });
        return;
      }

      // Phase 8.4 — DELETE /api/push/subscriptions/:subscriptionId
      // for the worker-initiated "Turn off notifications" flow.
      // Returns 200 with `{ deleted: true }` on success, 404 with
      // `{ deleted: false }` if the record was already gone. The
      // 410 Gone auto-cleanup from Phase 7.0 also reuses the
      // underlying `store.deletePushSubscription` — same delete,
      // different trigger. Emits a `push_subscription.deleted`
      // ledger event for the audit trail. §15: no body needed —
      // possession of the subscriptionId from the worker's own
      // listing is the authorization (same posture as Phase 6.1's
      // MFI consent revoke).
      if (
        parts[0] === 'api'
        && parts[1] === 'push'
        && parts[2] === 'subscriptions'
        && parts.length === 4
      ) {
        if (request.method !== 'DELETE') return methodNotAllowed(response, ['DELETE']);
        const subscriptionId = decodeURIComponent(parts[3]);
        const existing = await (store.readPushSubscription
          ? store.readPushSubscription(subscriptionId).catch(() => null)
          : Promise.resolve(null));
        const deleted = await store.deletePushSubscription(subscriptionId);
        if (deleted && typeof store.appendLedger === 'function') {
          await store.appendLedger({
            type: 'push_subscription.deleted',
            subscriptionId,
            identityId: existing?.identityId ?? null,
            at: new Date().toISOString()
          }).catch(() => {});
        }
        jsonResponse(response, deleted ? 200 : 404, {
          ok: deleted,
          deleted,
          subscriptionId
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'push' && parts[2] === 'subscriptions') {
        if (request.method === 'GET') {
          const identityId = url.searchParams.get('identityId');
          const subscriptions = await store.listPushSubscriptions();
          jsonResponse(response, 200, {
            subscriptions: subscriptions.filter(
              (subscription) => !identityId || subscription.identityId === identityId
            )
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          // Phase 7.0 — when `storeDeliveryKeys: true`, the
          // subscription record persists the raw endpoint + p256dh
          // + auth so the server can SEND Web Push notifications
          // (RFC 8030/8291). Required for the SIM-swap recovery
          // alert + §9A worker-notification delivery. §15 trade-off
          // documented in ADR 0101.
          // Refuse if the operator wants delivery keys stored but
          // VAPID isn't configured — saves us from a useless
          // record + the user a confused subscription that never
          // delivers.
          if (body.storeDeliveryKeys === true && !readVapidConfig()) {
            jsonResponse(response, 503, {
              error: {
                code: 'push_disabled',
                message:
                  'Web Push not configured. Set BHARAT_OS_VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT (see scripts/generate-vapid-keys.mjs).'
              }
            });
            return;
          }
          const subscription = createPushSubscriptionRecord({
            identityId: body.identityId,
            endpoint: body.endpoint,
            keys: body.keys ?? {},
            permission: body.permission ?? 'granted',
            source: body.source ?? 'shell',
            userAgent: body.userAgent,
            storeDeliveryKeys: body.storeDeliveryKeys === true
          });
          await store.savePushSubscription(subscription);
          // Strip raw endpoint + keys from the response — the
          // client already has them; no need to echo back.
          const { endpoint: _e, keys: _k, ...safe } = subscription;
          jsonResponse(response, 201, { ok: true, subscription: safe });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'worker-notifications') {
        if (request.method === 'GET') {
          const workerId = url.searchParams.get('workerId');
          const notifications = await store.listWorkerNotifications();
          jsonResponse(response, 200, {
            notifications: notifications.filter(
              (notification) => !workerId || notification.workerId === workerId
            )
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const subscriptions = await store.listPushSubscriptions();
          const subscription = [...subscriptions]
            .filter((candidate) => candidate.identityId === body.workerId)
            .sort((a, b) => String(b.subscribedAt).localeCompare(String(a.subscribedAt)))[0];
          const notification = createWorkerNotification({
            workerId: body.workerId,
            jobReference: body.jobReference,
            title: body.title,
            body: body.body,
            locale: body.locale,
            urgency: body.urgency,
            subscription
          });

          // Phase 7.2 — when the worker's subscription is
          // delivery-keyed (Phase 7.0 `storeDeliveryKeys: true`),
          // send a REAL Web Push via Phase 7.1's helper instead of
          // the Phase 2a.4 local-only scaffold. Updates the
          // notification record with the actual delivery outcome.
          // §15: the push body uses the notification's title +
          // body verbatim (caller is responsible for ensuring no
          // PII in them — same contract as ADR 0053).
          const pushResult = await sendPushToIdentity(
            store,
            body.workerId,
            {
              type: 'worker_job_alert',
              title: notification.content.title,
              body: notification.content.body,
              jobReference: notification.jobReference,
              locale: notification.content.locale
            },
            {
              urgency: notification.content.urgency === 'high' ? 'high' : 'normal',
              ledgerType: 'worker_notification.pushed',
              requestId,
              logger
            }
          );
          if (!pushResult.skipped && pushResult.sent > 0) {
            // Flip the scaffold's vapidIntegrated: false to true +
            // mark delivered. The notification record IS user data
            // (DPDP §11 export surface) so we don't include the
            // push endpoint here — only the outcome.
            notification.delivery = {
              ...notification.delivery,
              status: 'delivered_web_push',
              vapidIntegrated: true,
              sent: true,
              sentToEndpoints: pushResult.sent,
              reason: null
            };
          } else if (!pushResult.skipped && pushResult.failed > 0) {
            notification.delivery = {
              ...notification.delivery,
              status: 'web_push_failed',
              vapidIntegrated: true,
              sent: false,
              reason: `${pushResult.failed} push delivery failure(s)`
            };
          }
          await store.saveWorkerNotification(notification);
          const httpStatus =
            notification.delivery.status === 'blocked_no_subscription'
              ? 202
              : notification.delivery.status === 'web_push_failed'
                ? 502
                : 201;
          jsonResponse(response, httpStatus, {
            ok:
              notification.delivery.status !== 'blocked_no_subscription' &&
              notification.delivery.status !== 'web_push_failed',
            notification
          });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'voice' && parts[2] === 'runtime') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const locale = url.searchParams.get('locale') ?? 'en-IN';
        const webSpeechAvailable = url.searchParams.get('webSpeechAvailable') === 'true';
        const secureContext = url.searchParams.get('secureContext') !== 'false';
        const modelPacks = await store.listVoiceModelPacks();
        const plan = createVoiceRuntimePlan({
          locale,
          modelPacks,
          webSpeechAvailable,
          secureContext
        });
        jsonResponse(response, 200, {
          ok: true,
          plan,
          supportedLocales: INDIC_ASR_LOCALES
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'voice' && parts[2] === 'model-packs') {
        if (request.method === 'GET') {
          const locale = url.searchParams.get('locale');
          const modelPacks = await store.listVoiceModelPacks();
          jsonResponse(response, 200, {
            modelPacks: modelPacks.filter((pack) => !locale || pack.locale === locale)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const modelPack = createVoiceModelPack({
            locale: body.locale,
            modelId: body.modelId,
            engine: body.engine,
            bytes: body.bytes,
            sha256: body.sha256,
            source: body.source
          });
          await store.saveVoiceModelPack(modelPack);
          jsonResponse(response, 201, { ok: true, modelPack });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'tts' && parts[2] === 'runtime') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const locale = url.searchParams.get('locale') ?? 'en-IN';
        const speechSynthesisAvailable = url.searchParams.get('speechSynthesisAvailable') === 'true';
        const modelPacks = await store.listTtsModelPacks();
        const plan = createTtsRuntimePlan({
          locale,
          modelPacks,
          speechSynthesisAvailable
        });
        jsonResponse(response, 200, {
          ok: true,
          plan,
          supportedLocales: INDIC_TTS_LOCALES
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'tts' && parts[2] === 'model-packs') {
        if (request.method === 'GET') {
          const locale = url.searchParams.get('locale');
          const modelPacks = await store.listTtsModelPacks();
          jsonResponse(response, 200, {
            modelPacks: modelPacks.filter((pack) => !locale || pack.locale === locale)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const modelPack = createTtsModelPack({
            locale: body.locale,
            modelId: body.modelId,
            engine: body.engine,
            bytes: body.bytes,
            sha256: body.sha256,
            source: body.source
          });
          await store.saveTtsModelPack(modelPack);
          jsonResponse(response, 201, { ok: true, modelPack });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'on-device' && parts[2] === 'runtime') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const task = url.searchParams.get('task') ?? 'intent_planning';
        const webGpuAvailable = url.searchParams.get('webGpuAvailable') === 'true';
        const wasmAvailable = url.searchParams.get('wasmAvailable') !== 'false';
        const modelPacks = await store.listOnDeviceModelPacks();
        const plan = createOnDeviceRuntimePlan({
          task,
          modelPacks,
          webGpuAvailable,
          wasmAvailable
        });
        jsonResponse(response, 200, { ok: true, plan, supportedTasks: ON_DEVICE_TASKS });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'on-device' && parts[2] === 'model-packs') {
        if (request.method === 'GET') {
          const task = url.searchParams.get('task');
          const modelPacks = await store.listOnDeviceModelPacks();
          jsonResponse(response, 200, {
            modelPacks: modelPacks.filter((pack) => !task || pack.capabilities?.includes(task))
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const modelPack = createOnDeviceModelPack({
            modelId: body.modelId,
            family: body.family,
            runtime: body.runtime,
            bytes: body.bytes,
            sha256: body.sha256,
            capabilities: body.capabilities,
            localeCoverage: body.localeCoverage,
            source: body.source
          });
          await store.saveOnDeviceModelPack(modelPack);
          jsonResponse(response, 201, { ok: true, modelPack });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      // Phase 9.0a — Tier-4 SLM registry, public read. Returns every
      // registered pack (including revoked, marked with `status:
      // 'revoked'`) so the shell can display history honestly. Pass
      // `?compatible=true` plus optional `deviceRamMb`, `freeDiskBytes`,
      // `supportedRuntimes` (CSV) to filter to packs the device can
      // actually run. `?activeOnly=true` excludes revoked packs.
      // Admin curation lives at POST/DELETE under /api/admin/slm-model-packs
      // (Phase 5.7-gated, below).
      if (parts[0] === 'api' && parts[1] === 'slm-model-packs' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const all = await store.listSlmModelPacks();
        const activeOnly = url.searchParams.get('activeOnly') === 'true';
        const compatible = url.searchParams.get('compatible') === 'true';
        const candidates = activeOnly
          ? all.filter((pack) => pack.status !== 'revoked')
          : all;
        let modelPacks = candidates;
        if (compatible) {
          const supportedRuntimes = url.searchParams.get('supportedRuntimes');
          modelPacks = filterCompatibleSlmModelPacks(candidates, {
            deviceRamMb: url.searchParams.get('deviceRamMb'),
            freeDiskBytes: url.searchParams.get('freeDiskBytes'),
            supportedRuntimes: supportedRuntimes ? supportedRuntimes.split(',').map((r) => r.trim()).filter(Boolean) : []
          });
        }
        jsonResponse(response, 200, {
          modelPacks,
          totalRegistered: all.length,
          totalActive: all.filter((pack) => pack.status !== 'revoked').length,
          supportedRuntimes: SLM_RUNTIMES,
          supportedQuantizations: SLM_QUANTIZATIONS,
          supportedLicenses: SLM_LICENSES,
          supportedCapabilities: SLM_CAPABILITIES
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'slm-model-packs' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const modelPackId = decodeURIComponent(parts[2]);
        const pack = await store.readSlmModelPack(modelPackId);
        if (!pack) {
          jsonResponse(response, 404, { error: { code: 'unknown_pack', message: 'SLM model pack not found.' } });
          return;
        }
        jsonResponse(response, 200, { modelPack: pack });
        return;
      }

      // Phase 9.0b — per-identity SLM install records. Pointer-not-
      // payload (the model bytes themselves live in client-side OPFS
      // / IndexedDB; the server tracks status + which pack + how
      // many bytes downloaded). DPDP §12(3) cascade entry already
      // wired in eraseUserData.
      //
      //   GET    /api/identities/:id/installed-slms
      //   POST   /api/identities/:id/installed-slms
      //   DELETE /api/identities/:id/installed-slms/:installId
      //
      // POST is worker-initiated: after the client downloads + SHA-
      // 256-verifies the pack, it posts a record so the server can
      // surface "installed" status across paired devices via the
      // identity's Trust Passport.
      if (
        parts[0] === 'api'
        && parts[1] === 'identities'
        && parts.length >= 4
        && parts[3] === 'installed-slms'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);

        if (parts.length === 4 && request.method === 'GET') {
          const all = await store.listInstalledSlms();
          const installs = all.filter((record) => record.identityId === identityId);
          // Decorate with referenced pack metadata so the shell
          // doesn't need a second round-trip per row. Stale-tolerant
          // — if the registry has revoked a pack the worker
          // installed earlier, we still surface the install but mark
          // packStatus: 'revoked' honestly.
          const decorated = await Promise.all(
            installs.map(async (record) => {
              const pack = await store.readSlmModelPack(record.modelPackId).catch(() => null);
              return {
                ...record,
                pack: pack
                  ? {
                      family: pack.family,
                      variant: pack.variant,
                      quantization: pack.quantization,
                      parameterCount: pack.parameterCount,
                      diskBytes: pack.diskBytes,
                      license: pack.license,
                      status: pack.status
                    }
                  : null
              };
            })
          );
          jsonResponse(response, 200, { installs: decorated });
          return;
        }

        if (parts.length === 4 && request.method === 'POST') {
          const body = await readRequestJson(request);
          // The model pack must exist + not be revoked (revoked
          // packs can be installed-from-earlier but we refuse NEW
          // installs of them — same posture as `filterCompatibleSlm
          // ModelPacks`).
          const pack = await store.readSlmModelPack(body.modelPackId).catch(() => null);
          if (!pack) {
            jsonResponse(response, 404, {
              error: { code: 'unknown_pack', message: 'SLM model pack not found in the registry.' }
            });
            return;
          }
          if (pack.status === 'revoked' && body.status === 'installed') {
            jsonResponse(response, 409, {
              error: {
                code: 'pack_revoked',
                message: `SLM model pack ${pack.modelPackId} has been revoked by the operator. Refusing to record a new install.`
              }
            });
            return;
          }
          // Bind expectedHash to the registry's sourceHash so the
          // client can't claim a different hash than the registry
          // advertises. (The client passes observedHash from its own
          // SHA-256 compute; the module's invariant check fails the
          // record if expected !== observed when status=installed.)
          let record;
          try {
            record = createInstalledSlmRecord({
              identityId,
              modelPackId: body.modelPackId,
              runtimeBackend: body.runtimeBackend,
              downloadedBytes: body.downloadedBytes,
              status: body.status,
              failureReason: body.failureReason,
              storageLocation: body.storageLocation,
              expectedHash: pack.sourceHash,
              observedHash: body.observedHash
            });
          } catch (error) {
            jsonResponse(response, 400, {
              error: { code: 'invalid_install_record', message: error.message }
            });
            return;
          }
          await store.saveInstalledSlm(record);
          jsonResponse(response, 201, { ok: true, install: record });
          return;
        }

        if (parts.length === 5 && request.method === 'DELETE') {
          const installId = decodeURIComponent(parts[4]);
          const existing = await store.readInstalledSlm(installId).catch(() => null);
          if (!existing || existing.identityId !== identityId) {
            jsonResponse(response, 404, {
              error: { code: 'unknown_install', message: 'SLM install record not found.' }
            });
            return;
          }
          await store.deleteInstalledSlm(installId);
          jsonResponse(response, 200, { ok: true, installId, removed: true });
          return;
        }

        return methodNotAllowed(response, parts.length === 4 ? ['GET', 'POST'] : ['DELETE']);
      }

      if (parts[0] === 'api' && parts[1] === 'integrity' && parts[2] === 'verify') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const artifact =
          body.artifact ??
          (await readIntegrityArtifact(
            store,
            body.artifactType ?? body.type,
            body.id ?? body.consentId ?? body.decisionId ?? body.executionId ?? body.orchestrationId
          ));
        const publicRecords = await identityPublicRecords(store);
        const integrity = artifact.objectType === 'skill-manifest'
          ? verifySkillManifestIntegrity(artifact)
          : verifyArtifactIntegrity(artifact, publicRecords);
        jsonResponse(response, 200, {
          ok: true,
          integrity
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'dashboard') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, await dashboardSnapshot(store));
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'ledger') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, {
          events: await store.listLedger(ledgerQueryFromParams(url.searchParams))
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'ledger.ndjson') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const events = await store.listLedger(ledgerQueryFromParams(url.searchParams));
        textResponse(response, 200, ndjsonFromItems(events), 'application/x-ndjson; charset=utf-8');
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'trust-passports' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const context = await trustPassportContext(store);
        const identityId = url.searchParams.get('identityId');
        const identities = identityId
          ? context.identities.filter((identity) => identity.id === identityId)
          : context.identities;
        jsonResponse(response, 200, {
          passports: createTrustPassports(identities, context)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'trust-passports' && parts.length === 4 && parts[3] === 'sign') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const context = await trustPassportContext(store);
        const identityId = decodeURIComponent(parts[2]);
        const identity = context.identities.find((candidate) => candidate.id === identityId) ?? (await store.readIdentity(identityId));
        const passport = createTrustPassport(identity, context);
        const signer = await store.readIdentity(body.signerId ?? identity.id);
        const snapshot = signTrustPassportSnapshot(passport, signer, { role: body.role ?? 'subject' });
        jsonResponse(response, 201, {
          ok: true,
          snapshot,
          integrity: verifyTrustPassportSnapshot(snapshot, context.publicRecords)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'trust-passports' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const context = await trustPassportContext(store);
        const identityId = decodeURIComponent(parts[2]);
        const identity = context.identities.find((candidate) => candidate.id === identityId) ?? (await store.readIdentity(identityId));
        jsonResponse(response, 200, {
          passport: createTrustPassport(identity, context)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'worker-authorizations' && parts.length === 2) {
        if (request.method === 'GET') {
          jsonResponse(response, 200, { authorizations: await store.listWorkerAuthorizations() });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          let auth = createWorkerAuthorization({
            workerId: body.workerId,
            operatorId: body.operatorId,
            jobReference: body.jobReference,
            scopes: body.scopes,
            purpose: body.purpose,
            ttlDays: body.ttlDays,
            expiresAt: body.expiresAt
          });
          if (body.signWithIdentityId) {
            const signer = await store.readIdentity(body.signWithIdentityId);
            auth = signWorkerAuthorization(auth, signer);
          }
          await store.saveWorkerAuthorization(auth);
          jsonResponse(response, 201, { ok: true, authorization: auth });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'worker-authorizations' &&
        parts.length === 4 &&
        parts[3] === 'verify'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const authorizationId = decodeURIComponent(parts[2]);
        const auth = await store.readWorkerAuthorization(authorizationId);
        const workerIdentity = await store.readIdentity(auth.workerId).catch(() => null);
        const verification = verifyWorkerAuthorization(
          auth,
          workerIdentity ? publicIdentity(workerIdentity) : null
        );
        jsonResponse(response, 200, { ok: verification.valid, verification });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'worker-authorizations' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const authorizationId = decodeURIComponent(parts[2]);
        const auth = await store.readWorkerAuthorization(authorizationId);
        jsonResponse(response, 200, { authorization: auth });
        return;
      }

      // §9A flag reports
      if (parts[0] === 'api' && parts[1] === 'flags' && parts.length === 2) {
        if (request.method === 'GET') {
          const subjectFilter = url.searchParams.get('subjectActorId');
          const statusFilter = url.searchParams.get('status');
          let flags = await store.listFlagReports();
          if (subjectFilter) {
            flags = flags.filter((flag) => flag.subjectActorId === subjectFilter);
          }
          if (statusFilter) {
            flags = flags.filter((flag) => flag.status === statusFilter);
          }
          jsonResponse(response, 200, { flags });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          let report = createFlagReport({
            reporterId: body.reporterId,
            subjectActorId: body.subjectActorId,
            category: body.category,
            severity: body.severity,
            jobReference: body.jobReference,
            summary: body.summary
          });
          if (body.signWithIdentityId) {
            const signer = await store.readIdentity(body.signWithIdentityId);
            report = signFlagReport(report, signer);
          }
          await store.saveFlagReport(report);
          const reporterPublic = await store
            .readIdentity(report.reporterId)
            .catch(() => null)
            .then((identity) => (identity ? publicIdentity(identity) : null));
          jsonResponse(response, 201, {
            ok: true,
            flag: report,
            integrity: verifyFlagReport(report, reporterPublic)
          });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'flags' &&
        parts.length === 4 &&
        parts[2] === 'summary'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const subjectActorId = decodeURIComponent(parts[3]);
        const flags = await store.listFlagReports();
        jsonResponse(response, 200, { summary: flagSummaryForSubject(subjectActorId, flags) });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'flags' &&
        parts.length === 4 &&
        parts[3] === 'resolve'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const flagId = decodeURIComponent(parts[2]);
        const body = await readRequestJson(request);
        const existing = await store.readFlagReport(flagId);
        const resolved = resolveFlagReport(existing, {
          status: body.status,
          reason: body.reason,
          resolvedBy: body.resolvedBy
        });
        await store.saveFlagReport(resolved);
        jsonResponse(response, 200, { ok: true, flag: resolved });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'flags' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const flagId = decodeURIComponent(parts[2]);
        const flag = await store.readFlagReport(flagId);
        jsonResponse(response, 200, { flag });
        return;
      }

      // §13B mesh contribution events
      if (parts[0] === 'api' && parts[1] === 'mesh' && parts[2] === 'rates' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { rates: MESH_PAYOUT_RATES });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'mesh' &&
        parts[2] === 'contributions' &&
        parts.length === 5 &&
        parts[3] === 'summary'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const operatorId = decodeURIComponent(parts[4]);
        const events = await store.listMeshContributionEvents();
        jsonResponse(response, 200, {
          summary: meshContributionSummary(operatorId, events)
        });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'mesh' &&
        parts[2] === 'contributions' &&
        parts.length === 3
      ) {
        if (request.method === 'GET') {
          const operatorFilter = url.searchParams.get('operatorId');
          let events = await store.listMeshContributionEvents();
          if (operatorFilter) {
            events = events.filter((event) => event.operatorId === operatorFilter);
          }
          const limit = url.searchParams.get('limit');
          if (limit) {
            const n = Number(limit);
            if (Number.isFinite(n) && n > 0) {
              events = events
                .sort((a, b) => String(b.at).localeCompare(String(a.at)))
                .slice(0, n);
            }
          }
          jsonResponse(response, 200, { events });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const event = createMeshContributionEvent({
            operatorId: body.operatorId,
            nodeId: body.nodeId,
            workloadType: body.workloadType,
            tokens: body.tokens,
            bytes: body.bytes,
            peerId: body.peerId,
            charging: body.charging,
            wifi: body.wifi,
            batteryPercent: body.batteryPercent,
            // Phase 9.0d — propagate explicit payout + round id for
            // federated_round events; ignored for token/byte-priced
            // workloads where payout is derived from the rate table.
            payoutPaise: body.payoutPaise,
            roundId: body.roundId
          });
          await store.saveMeshContributionEvent(event);
          jsonResponse(response, 201, { ok: true, event });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      // §7f Phase 3.0 federated learning rounds — ADR 0071.
      // Researchers create rounds, contributors submit signed
      // gradient updates under a per-round donation consent. The
      // control plane stores hashes + DP epsilon only, never the
      // gradient vector itself (§15 pointer-not-payload).
      if (
        parts[0] === 'api' &&
        parts[1] === 'federated' &&
        parts[2] === 'rounds' &&
        parts.length === 3
      ) {
        if (request.method === 'GET') {
          const rounds = await store.listFederatedRounds();
          jsonResponse(response, 200, {
            rounds: rounds.map(describeRound)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const round = openRound(
            createFederatedRound({
              createdBy: body.createdBy,
              modelName: body.modelName,
              baselineModelHash: body.baselineModelHash,
              maxParticipants: body.maxParticipants,
              maxEpsilon: body.maxEpsilon,
              payoutPaisePerUpdate: body.payoutPaisePerUpdate,
              deadlineSecondsFromNow: body.deadlineSecondsFromNow,
              aggregationMode: body.aggregationMode,
              contributorBudget: body.contributorBudget,
              // Phase 9.0d — optional SLM round target.
              slmModelPackId: body.slmModelPackId,
              targetTask: body.targetTask,
              loraConfig: body.loraConfig
            })
          );
          await store.saveFederatedRound(round);
          jsonResponse(response, 201, { ok: true, round });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      // §7f Phase 3.2 — per-contributor privacy-budget read.
      // Returns the contributor's running ε spend across recent
      // accepted updates, plus the projection at the round-default
      // budget. The shell uses this to show *"X.X ε remaining this
      // month"* on the federated card.
      if (
        parts[0] === 'api' &&
        parts[1] === 'federated' &&
        parts[2] === 'budget' &&
        parts.length === 4
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const contributorId = decodeURIComponent(parts[3]);
        const allUpdates = await store.listFederatedUpdates();
        const windowHours = Number(url.searchParams.get('windowHours') ?? 720);
        const epsilonCap = Number(url.searchParams.get('epsilonCap') ?? 8.0);
        const requested = Number(url.searchParams.get('requestedEpsilon') ?? 0);
        const { computeBudgetUsage, projectBudget } = await import(
          '../phase1/privacy-budget.mjs'
        );
        const usage = computeBudgetUsage(contributorId, allUpdates, { windowHours });
        const projection = requested > 0
          ? projectBudget(contributorId, allUpdates, requested, { windowHours, epsilonCap })
          : null;
        jsonResponse(response, 200, { usage, projection });
        return;
      }

      // Demo-mode convenience: sign + submit in one call. The
      // contributor private key still lives on the server (Phase 2a
      // limitation per ADR 0066 — Phase 2b moves it to the device
      // hardware keystore, at which point this route goes away in
      // favour of client-side signing).
      if (
        parts[0] === 'api' &&
        parts[1] === 'federated' &&
        parts[2] === 'rounds' &&
        parts.length === 6 &&
        parts[4] === 'updates' &&
        parts[5] === 'sign-and-submit'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const roundId = decodeURIComponent(parts[3]);
        const round = await store.readFederatedRound(roundId).catch(() => null);
        if (!round) return notFound(response);
        const body = await readRequestJson(request);
        const contributor = await store.readIdentity(body.contributorId).catch(() => null);
        if (!contributor) return notFound(response);
        const update = signGradientUpdate(
          createGradientUpdate({
            roundId,
            contributorId: contributor.id,
            baselineModelHash: body.baselineModelHash,
            gradientHash: body.gradientHash,
            gradientBytesBase64: body.gradientBytesBase64 ?? null,
            gradientLength: body.gradientLength ?? null,
            differentialPrivacyEpsilon: body.differentialPrivacyEpsilon,
            sampleCount: body.sampleCount
          }),
          contributor
        );
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const allUpdates = await store.listFederatedUpdates();
        const { round: nextRound, update: accepted } = submitGradientUpdate({
          round,
          update,
          consents,
          publicRecords,
          allUpdates
        });
        // Phase 9.1 — for sponsor-funded rounds, debit the
        // round's escrow lock by the payout we're about to credit
        // the worker. Round bookkeeping increments
        // `escrowDebitedPaise` so the sponsor's audit export can
        // reconcile per-round spend.
        let debitedRound = nextRound;
        if (
          accepted.payoutPaise > 0 &&
          nextRound.sponsorId &&
          (nextRound.escrowLockedPaise ?? 0) > (nextRound.escrowDebitedPaise ?? 0)
        ) {
          const sponsor = await store.readSponsor(nextRound.sponsorId).catch(() => null);
          if (sponsor) {
            try {
              const debited = debitLockedEscrow(sponsor, accepted.payoutPaise);
              await store.saveSponsor(debited);
              debitedRound = {
                ...nextRound,
                escrowDebitedPaise:
                  (nextRound.escrowDebitedPaise ?? 0) + accepted.payoutPaise
              };
              await store.appendLedger({
                type: 'sponsor_escrow.debited',
                sponsorId: nextRound.sponsorId,
                roundId: nextRound.roundId,
                updateId: accepted.updateId,
                amountPaise: accepted.payoutPaise,
                balancePaise: debited.escrowBalancePaise,
                lockedPaise: debited.escrowLockedPaise,
                at: new Date().toISOString()
              });
            } catch (escrowError) {
              // Escrow under-funded for this debit — log + carry
              // on. The worker still earns the mesh credit (the
              // payment is owed); reconciliation is an ops issue.
              logger.warn('sponsor_escrow_debit_failed', {
                requestId,
                sponsorId: nextRound.sponsorId,
                roundId: nextRound.roundId,
                reason: escrowError.message
              });
            }
          }
        }
        await store.saveFederatedRound(debitedRound);
        await store.saveFederatedUpdate(accepted);
        let meshEvent = null;
        if (accepted.payoutPaise > 0) {
          meshEvent = createMeshContributionEvent({
            operatorId: accepted.contributorId,
            workloadType: FEDERATED_ROUND_WORKLOAD,
            payoutPaise: accepted.payoutPaise,
            roundId: debitedRound.roundId
          });
          await store.saveMeshContributionEvent(meshEvent);
        }
        jsonResponse(response, 201, {
          ok: true,
          round: debitedRound,
          update: accepted,
          meshContributionEvent: meshEvent
        });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'federated' &&
        parts[2] === 'rounds' &&
        parts.length === 5 &&
        parts[4] === 'updates'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const roundId = decodeURIComponent(parts[3]);
        const round = await store.readFederatedRound(roundId).catch(() => null);
        if (!round) return notFound(response);

        const body = await readRequestJson(request);
        if (!body?.update?.signature) {
          throw new Error('signed `update` payload is required.');
        }
        const consents = await store.listConsents();
        const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
        const allUpdates = await store.listFederatedUpdates();
        const { round: nextRound, update: accepted } = submitGradientUpdate({
          round,
          update: body.update,
          consents,
          publicRecords,
          allUpdates
        });
        await store.saveFederatedRound(nextRound);
        await store.saveFederatedUpdate(accepted);

        // The accepted update pays the contributor via the §7f
        // mesh workload class. The mesh-contribution event surfaces
        // in the operator's earnings ticker alongside inference /
        // storage events.
        let meshEvent = null;
        if (accepted.payoutPaise > 0) {
          meshEvent = createMeshContributionEvent({
            operatorId: accepted.contributorId,
            nodeId: body.nodeId ?? null,
            workloadType: FEDERATED_ROUND_WORKLOAD,
            payoutPaise: accepted.payoutPaise,
            roundId: nextRound.roundId,
            charging: body.charging ?? true,
            wifi: body.wifi ?? true,
            batteryPercent: body.batteryPercent
          });
          await store.saveMeshContributionEvent(meshEvent);
        }
        jsonResponse(response, 201, {
          ok: true,
          round: nextRound,
          update: accepted,
          meshContributionEvent: meshEvent
        });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'federated' &&
        parts[2] === 'rounds' &&
        parts.length === 5 &&
        parts[4] === 'aggregate'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const roundId = decodeURIComponent(parts[3]);
        const round = await store.readFederatedRound(roundId).catch(() => null);
        if (!round) return notFound(response);
        const updates = (await store.listFederatedUpdates()).filter(
          (u) => u.roundId === roundId && u.accepted
        );
        const aggregated = aggregateRound(round, updates);
        await store.saveFederatedRound(aggregated);
        jsonResponse(response, 200, { ok: true, round: aggregated });
        return;
      }

      // §7c device-pairing sessions — WebRTC signaling relay only.
      // The server never sees the identity vault; the actual transfer
      // happens browser-to-browser over the data channel.
      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 3
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const session = createPairingSession({
          issuerIdentityId: body.issuerIdentityId,
          issuerDisplayName: body.issuerDisplayName,
          issuerPublicKeyFingerprint: body.issuerPublicKeyFingerprint,
          ttlSeconds: body.ttlSeconds
        });
        await store.savePairingSession(session);
        jsonResponse(response, 201, { ok: true, session });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 5 &&
        parts[3] === 'by-code'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const claimCode = decodeURIComponent(parts[4]);
        const sessions = await store.listPairingSessions();
        const session = lookupByClaimCode(sessions, claimCode);
        if (!session) {
          jsonResponse(response, 404, {
            error: {
              code: 'pairing_session_not_found',
              message: 'No active pairing session matches this code (may be expired or already claimed).'
            }
          });
          return;
        }
        jsonResponse(response, 200, { session });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 4
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const sessionId = decodeURIComponent(parts[3]);
        const existing = await store.readPairingSession(sessionId);
        const session = expirePairingSession(existing);
        if (session !== existing) await store.savePairingSession(session);
        jsonResponse(response, 200, { session });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 5 &&
        parts[4] === 'claim'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const sessionId = decodeURIComponent(parts[3]);
        const body = await readRequestJson(request);
        const existing = await store.readPairingSession(sessionId);
        const claimed = claimPairingSession(existing, {
          receiverFingerprint: body.receiverFingerprint,
          sdpAnswer: body.sdpAnswer
        });
        await store.savePairingSession(claimed);
        jsonResponse(response, 200, { ok: true, session: claimed });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 5 &&
        parts[4] === 'sdp'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const sessionId = decodeURIComponent(parts[3]);
        const body = await readRequestJson(request);
        const existing = await store.readPairingSession(sessionId);
        const updated = recordSdp(existing, { offer: body.offer, answer: body.answer });
        await store.savePairingSession(updated);
        jsonResponse(response, 200, { ok: true, session: updated });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'pairing' &&
        parts[2] === 'sessions' &&
        parts.length === 5 &&
        parts[4] === 'complete'
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const sessionId = decodeURIComponent(parts[3]);
        const body = await readRequestJson(request);
        const existing = await store.readPairingSession(sessionId);
        const completed = completePairingSession(existing, {
          bytesTransferred: body.bytesTransferred
        });
        await store.savePairingSession(completed);
        jsonResponse(response, 200, { ok: true, session: completed });
        return;
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'contribution'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const identityId = decodeURIComponent(parts[2]);
        const contribution = await store.computeContribution(identityId);
        jsonResponse(response, 200, { contribution });
        return;
      }

      // §7c recovery phrase — deterministic from publicKey, exposed
      // so the initiator can present it to the user and seal the
      // vault under it. Reuses the CLI helper.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'recovery-phrase'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        jsonResponse(response, 200, { recovery: generateRecoveryPhrase(identity) });
        return;
      }

      // §7c vault snapshot — Phase 2a.17.
      //
      // Returns the secret material the §7c initiator needs to build an
      // encrypted vault bundle: the identity's `privateKeyPem`, its
      // `vaultKeyBase64`, and a list of memory-record refs (no
      // ciphertexts, no plaintexts — just the manifest IDs the receiver
      // can fetch later under a fresh consent grant).
      //
      // DEMO-ONLY caveat: a production deployment must NOT expose
      // private key material via a network endpoint. The Phase 2b
      // AOSP shell will keep the private key in the device hardware
      // keystore; this endpoint exists only because Phase 2a stores
      // identities on the demo server so multi-tab/multi-device
      // pairing works in a browser. Documented in ADR 0066.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'vault-snapshot'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const allRecords = await store.listMemoryRecords();
        const memoryRecordRefs = allRecords
          .filter((record) => record.ownerId === identityId)
          .map((record) => ({
            recordId: record.recordId,
            manifestId: record.manifestId ?? null,
            label: record.label ?? null,
            createdAt: record.createdAt ?? null
          }));
        jsonResponse(response, 200, {
          identity: {
            id: identity.id,
            displayName: identity.displayName,
            publicKeyPem: identity.publicKeyPem,
            privateKeyPem: identity.privateKeyPem,
            vaultKeyBase64: identity.vaultKeyBase64,
            attestations: identity.attestations ?? {}
          },
          memoryRecordRefs,
          warning:
            'Demo endpoint. Production Bharat OS keeps privateKeyPem in the device hardware keystore (Phase 2b AOSP shell). See ADR 0066.'
        });
        return;
      }

      // DPDP §11 right-to-access — Phase 4.0 ADR 0079.
      // Returns the complete user-data export bundle for the identity.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'export'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const identityId = decodeURIComponent(parts[2]);
        const exportBundle = await collectUserData(store, identityId).catch(
          (error) => ({ error: error.message })
        );
        if (exportBundle.error) return notFound(response);
        // Set Content-Disposition so the browser offers a download
        // rather than rendering inline.
        const filename = `bharat-os-export-${identityId.slice(0, 24)}-${Date.now()}.json`;
        const body = JSON.stringify(exportBundle, null, 2);
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'no-store'
        });
        response.end(`${body}\n`);
        return;
      }

      // DPDP §12(3) right-to-erasure preview. Returns the deletion
      // plan WITHOUT touching the filesystem. The shell shows this
      // to the user before they confirm the destructive action.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'erasure-preview'
      ) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const identityId = decodeURIComponent(parts[2]);
        const manifest = await erasureManifest(store, identityId).catch(
          (error) => ({ error: error.message })
        );
        if (manifest.error) return notFound(response);
        jsonResponse(response, 200, { manifest });
        return;
      }

      // DPDP §13 grievance contact — DPO details, response SLA.
      if (parts[0] === 'api' && parts[1] === 'dpdp' && parts[2] === 'grievance' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        jsonResponse(response, 200, { contact: DEFAULT_DPO_CONTACT });
        return;
      }

      // Phase 7.0 — Web Push VAPID public key. Public; shell uses
      // this to construct the browser Push API subscription. When
      // VAPID isn't configured the endpoint returns 503 with
      // `push_disabled` — same pattern as Phase 5.7 admin-auth.
      if (parts[0] === 'api' && parts[1] === 'push-public-key' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const vapid = readVapidConfig();
        if (!vapid) {
          jsonResponse(response, 503, {
            error: {
              code: 'push_disabled',
              message:
                'Web Push not configured. Set BHARAT_OS_VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT (see scripts/generate-vapid-keys.mjs).'
            }
          });
          return;
        }
        jsonResponse(response, 200, {
          publicKey: vapid.publicKey,
          subject: vapid.subject
        });
        return;
      }

      // Phase 6.0 — earnings log endpoints.
      //
      // The single-player worker tool: cross-platform earnings
      // tracker. All data is USER-TYPED (we never scrape Swiggy /
      // Zomato / Uber APIs); the worker enters daily totals per
      // category. Data stays scoped to the identity that owns it
      // and is included in the DPDP export + erasure cascade.
      //
      // §15: amounts in paise (INTEGER) to avoid float rounding;
      // categories are coarse (delivery/ride/service/cash/other)
      // so per-platform fingerprinting isn't possible from the
      // record alone.
      //
      //   POST   /api/identities/:id/earnings
      //   GET    /api/identities/:id/earnings?from=YYYY-MM-DD&to=...&category=
      //   GET    /api/identities/:id/earnings/summary?month=YYYY-MM
      //   DELETE /api/identities/:id/earnings/:entryId

      // POST /api/identities/:id/earnings — create entry
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'earnings' &&
        request.method === 'POST'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const body = await readRequestJson(request).catch(() => ({}));
        let entry;
        try {
          entry = createEarningsEntry({
            identityId,
            date: body.date,
            category: body.category,
            amountPaise: body.amountPaise,
            hoursWorked: body.hoursWorked,
            note: body.note
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_earnings_entry', message: error.message }
          });
          return;
        }
        if (typeof store.saveEarningsEntry !== 'function') {
          jsonResponse(response, 503, {
            error: {
              code: 'earnings_unsupported',
              message: 'earnings log requires the SQLite store backend'
            }
          });
          return;
        }
        await store.saveEarningsEntry(entry);
        jsonResponse(response, 201, { ok: true, entry });
        return;
      }

      // GET /api/identities/:id/earnings — list entries
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'earnings' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        if (typeof store.listEarningsEntries !== 'function') {
          jsonResponse(response, 200, { entries: [] });
          return;
        }
        const fromDate = url.searchParams.get('from') ?? undefined;
        const toDate = url.searchParams.get('to') ?? undefined;
        const category = url.searchParams.get('category') ?? undefined;
        if (category && !EARNINGS_CATEGORIES.includes(category)) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_category',
              message: `category must be one of: ${EARNINGS_CATEGORIES.join(', ')}`
            }
          });
          return;
        }
        const entries = await store.listEarningsEntries({
          identityId,
          fromDate,
          toDate,
          category
        });
        jsonResponse(response, 200, { entries });
        return;
      }

      // GET /api/identities/:id/earnings/summary?month=YYYY-MM
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'earnings' &&
        parts[4] === 'summary' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const month = url.searchParams.get('month');
        if (!month) {
          jsonResponse(response, 400, {
            error: { code: 'month_required', message: 'Provide ?month=YYYY-MM' }
          });
          return;
        }
        if (typeof store.listEarningsEntries !== 'function') {
          jsonResponse(response, 200, {
            summary: aggregateByMonth([], month),
            statement: null
          });
          return;
        }
        const entries = await store.listEarningsEntries({ identityId });
        let summary;
        try {
          summary = aggregateByMonth(entries, month);
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_month', message: error.message }
          });
          return;
        }
        jsonResponse(response, 200, {
          summary,
          statement: monthlyStatement(summary)
        });
        return;
      }

      // Phase 5.9 — portable work-history attestation endpoints.
      //
      // The worker-initiated QR handshake flow:
      //   1. Worker: POST /api/portable-attestation/init
      //      → returns { tokenId, signUrl, qrPayload }
      //      Worker displays the QR for the customer.
      //   2. Customer scans QR → opens /sign/<tokenId> in their
      //      browser (no Bharat OS install needed).
      //   3. Customer picks a signing tier:
      //      • Tier 0 (anonymous tap):
      //        POST /api/portable-attestation/:tokenId/sign-tier0
      //      • Tier 1 (OTP confirmed) — two steps:
      //        POST /api/portable-attestation/:tokenId/sign-tier1/send
      //          (body: { phone })
      //        POST /api/portable-attestation/:tokenId/sign-tier1/verify
      //          (body: { phone, code })
      //      • Tier 2 (Bharat OS signed) — customer signs locally
      //        and submits:
      //        POST /api/portable-attestation/:tokenId/sign-tier2
      //          (body: { customerId, signature })
      //   4. Worker views summary on the Earn tab:
      //      GET /api/identities/:id/portable-attestation/summary
      //
      // ADDITIVE-ONLY — there is no negative-attestation path.
      // No "rate one star" route. Absence of signatures is not a
      // negative signal.

      // POST /api/portable-attestation/init
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 3 &&
        parts[2] === 'init' &&
        request.method === 'POST'
      ) {
        const body = await readRequestJson(request).catch(() => ({}));
        const identity = await store.readIdentity(body.workerId).catch(() => null);
        if (!identity) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_worker',
              message: 'workerId must refer to an existing identity'
            }
          });
          return;
        }
        let token;
        try {
          token = createPortableAttestationToken({
            workerId: body.workerId,
            category: body.category,
            workerGps: body.workerGps,
            ttlSeconds: body.ttlSeconds
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_token_init', message: error.message }
          });
          return;
        }
        await store.savePortableAttestation(token);
        jsonResponse(response, 201, {
          ok: true,
          tokenId: token.tokenId,
          expiresAt: token.expiresAt,
          signUrl: `/sign/${encodeURIComponent(token.tokenId)}`,
          qrPayload: token.tokenId,
          disclaimer:
            'Bharat OS records what others sign about this delivery. ' +
            'We do NOT verify identity (Aadhaar does that) and do NOT ' +
            'guarantee performance (the platform that dispatched the ' +
            'job does that).'
        });
        return;
      }

      // Helper for the three sign-tier endpoints: load + validate
      // the token, return { token, ready: true } or write the
      // appropriate error response.
      async function loadPendingToken(tokenIdRaw) {
        const tokenId = decodeURIComponent(tokenIdRaw);
        const token = await store.readPortableAttestation(tokenId).catch(() => null);
        if (!token) {
          notFound(response);
          return null;
        }
        if (token.status === 'signed') {
          jsonResponse(response, 409, {
            error: {
              code: 'token_already_signed',
              message: 'This delivery receipt has already been signed.'
            }
          });
          return null;
        }
        const now = new Date().toISOString();
        if (token.expiresAt && now >= token.expiresAt) {
          jsonResponse(response, 410, {
            error: {
              code: 'token_expired',
              message: 'This delivery receipt has expired.'
            }
          });
          return null;
        }
        return token;
      }

      // POST /api/portable-attestation/:tokenId/sign-tier0
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 4 &&
        parts[3] === 'sign-tier0' &&
        request.method === 'POST'
      ) {
        const token = await loadPendingToken(parts[2]);
        if (!token) return;
        // Use the rate-limiter's `clientKey` as the IP source so we
        // honour the same X-Forwarded-For trust setting.
        const ip = clientKey(request, { trustProxy: TRUST_PROXY });
        const signed = signTier0(token, { clientIp: ip });
        await store.savePortableAttestation(signed);
        jsonResponse(response, 200, { ok: true, attestation: signed });
        return;
      }

      // POST /api/portable-attestation/:tokenId/sign-tier1/send
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 5 &&
        parts[3] === 'sign-tier1' &&
        parts[4] === 'send' &&
        request.method === 'POST'
      ) {
        const token = await loadPendingToken(parts[2]);
        if (!token) return;
        const body = await readRequestJson(request).catch(() => ({}));
        const phone = normalisePhone(body.phone);
        if (!phone) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_phone', message: 'Provide a valid phone number.' }
          });
          return;
        }
        const otp = createPhoneOtp({
          identityId: token.workerId,
          phone,
          purpose: 'sensitive_action'
        });
        const { code, ...persisted } = otp;
        await store.savePhoneOtp(persisted);
        const sms = await sendSms({
          phone,
          body:
            `Bharat OS sign code: ${code}. Confirms a delivery receipt. ` +
            `Valid 5 minutes. Ignore if you didn't ask for this.`
        });
        jsonResponse(response, 201, {
          ok: true,
          otpId: persisted.otpId,
          expiresAt: persisted.expiresAt,
          phoneMasked: persisted.phoneMasked,
          providerMessageId: sms.providerMessageId
        });
        return;
      }

      // POST /api/portable-attestation/:tokenId/sign-tier1/verify
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 5 &&
        parts[3] === 'sign-tier1' &&
        parts[4] === 'verify' &&
        request.method === 'POST'
      ) {
        const token = await loadPendingToken(parts[2]);
        if (!token) return;
        const body = await readRequestJson(request).catch(() => ({}));
        if (!body.otpId || !body.code) {
          jsonResponse(response, 400, {
            error: {
              code: 'missing_fields',
              message: 'otpId and code are required.'
            }
          });
          return;
        }
        const otp = await store.readPhoneOtp(body.otpId).catch(() => null);
        if (!otp) return notFound(response);
        const result = verifyPhoneOtp(otp, body.code);
        await store.savePhoneOtp(result.otp);
        if (result.status !== 'verified') {
          jsonResponse(response, 400, {
            ok: false,
            status: result.status,
            otp: {
              otpId: result.otp.otpId,
              status: result.otp.status,
              attempts: result.otp.attempts,
              expiresAt: result.otp.expiresAt
            }
          });
          return;
        }
        const signed = signTier1(token, { customerPhone: otp.phone });
        await store.savePortableAttestation(signed);
        jsonResponse(response, 200, { ok: true, attestation: signed });
        return;
      }

      // GET /api/portable-attestation/:tokenId/sign-tier2/payload
      // Returns the canonical payload string the customer's Bharat
      // OS app must sign with their private key. Decoupling the
      // payload from the POST lets clients fetch + sign offline
      // (e.g., behind a captive portal) before submitting.
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 5 &&
        parts[3] === 'sign-tier2' &&
        parts[4] === 'payload' &&
        request.method === 'GET'
      ) {
        const token = await loadPendingToken(parts[2]);
        if (!token) return;
        jsonResponse(response, 200, {
          ok: true,
          tokenId: token.tokenId,
          payload: buildTier2SignaturePayload(token),
          protocolVersion: PORTABLE_ATTESTATION_PROTOCOL_VERSION
        });
        return;
      }

      // POST /api/portable-attestation/:tokenId/sign-tier2
      // Body: { customerId, signature }
      // The customer's Bharat OS app has already signed
      // buildTier2SignaturePayload(token) locally and POSTs the
      // resulting signature. The server verifies via the customer's
      // public record.
      if (
        parts[0] === 'api' &&
        parts[1] === 'portable-attestation' &&
        parts.length === 4 &&
        parts[3] === 'sign-tier2' &&
        request.method === 'POST'
      ) {
        const token = await loadPendingToken(parts[2]);
        if (!token) return;
        const body = await readRequestJson(request).catch(() => ({}));
        if (!body.customerId || !body.signature) {
          jsonResponse(response, 400, {
            error: {
              code: 'missing_fields',
              message: 'customerId and signature are required.'
            }
          });
          return;
        }
        const customer = await store.readIdentity(body.customerId).catch(() => null);
        if (!customer) {
          jsonResponse(response, 404, {
            error: { code: 'unknown_customer', message: 'customerId does not resolve to an identity' }
          });
          return;
        }
        if (customer.id === token.workerId) {
          jsonResponse(response, 400, {
            error: {
              code: 'self_sign',
              message: 'A worker cannot sign their own work record.'
            }
          });
          return;
        }
        // The customer's Bharat OS app signed
        // `buildTier2SignaturePayload(token)` locally with their
        // Ed25519 private key. Server only needs the public record
        // to verify — never sees / handles the customer's private
        // key (the §15-aligned model).
        const payloadText = buildTier2SignaturePayload(token);
        const attestation = {
          ...token,
          status: 'signed',
          tier: ATTESTATION_TIERS.BHARAT_OS_SIGNED,
          signerData: {
            customerId: customer.id,
            payloadHash: sha256Hex(payloadText)
          },
          signature: body.signature,
          signedAt: new Date().toISOString()
        };
        const verify = verifyTier2(attestation, customer);
        if (!verify.ok) {
          jsonResponse(response, 400, {
            error: { code: 'signature_invalid', message: verify.reason }
          });
          return;
        }
        await store.savePortableAttestation(attestation);
        jsonResponse(response, 200, { ok: true, attestation });
        return;
      }

      // GET /api/identities/:id/portable-attestation/summary?category=
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'portable-attestation' &&
        parts[4] === 'summary' &&
        request.method === 'GET'
      ) {
        const workerId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(workerId).catch(() => null);
        if (!identity) return notFound(response);
        const category = url.searchParams.get('category') ?? undefined;
        if (category && !ATTESTATION_CATEGORIES.includes(category)) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_category',
              message: `category must be one of: ${ATTESTATION_CATEGORIES.join(', ')}`
            }
          });
          return;
        }
        if (typeof store.listPortableAttestations !== 'function') {
          jsonResponse(response, 200, {
            summary: aggregateAttestationsForWorker([], { workerId, category })
          });
          return;
        }
        const attestations = await store.listPortableAttestations({
          workerId,
          category,
          status: 'signed'
        });
        const summary = aggregateAttestationsForWorker(attestations, {
          workerId,
          category
        });
        jsonResponse(response, 200, { summary });
        return;
      }

      // Phase 6.1 — MFI income-verification endpoints.
      //
      //   POST /api/identities/:id/income-verification/consents
      //     Body: { mfiName, purpose, financialYear, ttlSeconds?,
      //             maxReads? }
      //     Worker creates a signed consent authorising the named
      //     MFI to read their income-verification bundle. Returns
      //     the consent (incl. `consentId` which doubles as the
      //     bearer token).
      //
      //   GET /api/identities/:id/income-verification/consents
      //     Worker lists the consents they've issued.
      //
      //   POST /api/identities/:id/income-verification/consents/:consentId/revoke
      //     Worker revokes a consent before expiry.
      //
      //   GET /api/income-verification/:consentId
      //     MFI presents the consentId. Server verifies the consent
      //     is valid + non-expired + within maxReads, increments
      //     the read count, builds the signed bundle from current
      //     earnings/mesh/portable-attestation data, returns it.

      // POST /api/identities/:id/income-verification/consents
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'income-verification' &&
        parts[4] === 'consents' &&
        request.method === 'POST'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const body = await readRequestJson(request).catch(() => ({}));
        let consent;
        try {
          consent = createIncomeVerificationConsent({
            identity,
            mfiName: body.mfiName,
            purpose: body.purpose,
            financialYear: body.financialYear,
            ttlSeconds: body.ttlSeconds,
            maxReads: body.maxReads
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_consent', message: error.message }
          });
          return;
        }
        await store.saveIncomeVerificationConsent(consent);
        await store.appendLedger({
          type: 'income_verification_consent.issued',
          consentId: consent.consentId,
          workerId: consent.workerId,
          mfiName: consent.mfiName,
          financialYear: consent.financialYear,
          expiresAt: consent.expiresAt,
          maxReads: consent.maxReads,
          at: new Date().toISOString()
        });
        jsonResponse(response, 201, {
          ok: true,
          consent,
          mfiFetchUrl: `/api/income-verification/${encodeURIComponent(consent.consentId)}`,
          note:
            'Share the consentId with the MFI privately (it is a bearer token; ' +
            'anyone with it can read your bundle once). The MFI fetches the ' +
            'signed bundle via the URL above.'
        });
        return;
      }

      // GET /api/identities/:id/income-verification/consents
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'income-verification' &&
        parts[4] === 'consents' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const consents =
          typeof store.listIncomeVerificationConsents === 'function'
            ? await store.listIncomeVerificationConsents({ workerId: identityId })
            : [];
        jsonResponse(response, 200, { consents });
        return;
      }

      // POST /api/identities/:id/income-verification/consents/:consentId/revoke
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 7 &&
        parts[3] === 'income-verification' &&
        parts[4] === 'consents' &&
        parts[6] === 'revoke' &&
        request.method === 'POST'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const consentId = decodeURIComponent(parts[5]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const consent = await store
          .readIncomeVerificationConsent(consentId)
          .catch(() => null);
        if (!consent) return notFound(response);
        if (consent.workerId !== identityId) {
          // §15 — refusing to leak ownership info via differential
          // status codes; same 404 as a non-existent consent.
          return notFound(response);
        }
        const revoked = revokeIncomeVerificationConsent(consent);
        await store.saveIncomeVerificationConsent(revoked);
        await store.appendLedger({
          type: 'income_verification_consent.revoked',
          consentId,
          workerId: identityId,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, consent: revoked });
        return;
      }

      // GET /api/income-verification/:consentId  (MFI fetch)
      if (
        parts[0] === 'api' &&
        parts[1] === 'income-verification' &&
        parts.length === 3 &&
        request.method === 'GET'
      ) {
        const consentId = decodeURIComponent(parts[2]);
        const consent = await store
          .readIncomeVerificationConsent(consentId)
          .catch(() => null);
        if (!consent) return notFound(response);
        const worker = await store.readIdentity(consent.workerId).catch(() => null);
        if (!worker) return notFound(response);
        const check = verifyIncomeVerificationConsent(consent, worker);
        if (!check.ok) {
          const status =
            check.status === 'expired'
              ? 410
              : check.status === 'revoked'
                ? 410
                : check.status === 'exhausted'
                  ? 410
                  : check.status === 'unknown_worker'
                    ? 404
                    : 400;
          jsonResponse(response, status, {
            error: {
              code: `consent_${check.status}`,
              message: `Consent ${check.status}.`
            }
          });
          return;
        }
        const [
          earningsEntries,
          meshEvents,
          portableAttestations,
          collectiveMemberships,
          blessedCollectives,
          eshramRegistrations,
          schemeEntitlements
        ] = await Promise.all([
          typeof store.listEarningsEntries === 'function'
            ? store.listEarningsEntries({ identityId: worker.id })
            : Promise.resolve([]),
          typeof store.listMeshContributionEvents === 'function'
            ? store.listMeshContributionEvents()
            : Promise.resolve([]),
          typeof store.listPortableAttestations === 'function'
            ? store.listPortableAttestations({ workerId: worker.id, status: 'signed' })
            : Promise.resolve([]),
          // Phase 6.2 — surface verified collective memberships
          // (signed by a blessed collective AND currently valid).
          typeof store.listCollectiveMemberships === 'function'
            ? store.listCollectiveMemberships({ memberId: worker.id, status: 'active' })
            : Promise.resolve([]),
          typeof store.listBlessedCollectives === 'function'
            ? store.listBlessedCollectives()
            : Promise.resolve([]),
          // Phase 6.3 — verified e-Shram registration + welfare
          // scheme entitlements.
          typeof store.listEShramRegistrations === 'function'
            ? store.listEShramRegistrations({ memberId: worker.id, status: 'active' })
            : Promise.resolve([]),
          typeof store.listSchemeEntitlements === 'function'
            ? store.listSchemeEntitlements({ memberId: worker.id, status: 'active' })
            : Promise.resolve([])
        ]);
        const bundle = buildIncomeVerificationBundle({
          identity: worker,
          consent,
          earningsEntries,
          meshContributionEvents: meshEvents,
          portableAttestations,
          collectiveMemberships,
          blessedCollectives,
          eshramRegistrations,
          schemeEntitlements
        });
        // Burn one read. Persist + audit.
        const consumed = recordConsentRead(consent);
        await store.saveIncomeVerificationConsent(consumed);
        await store.appendLedger({
          type: 'income_verification_bundle.read',
          consentId,
          workerId: worker.id,
          mfiName: consent.mfiName,
          readCount: consumed.readCount,
          maxReads: consumed.maxReads,
          at: new Date().toISOString()
        });
        // Phase 7.1 — push to the worker that an MFI just read
        // their bundle. Lets the user catch a stolen consentId
        // (someone else presenting it) in near-real-time. §15:
        // mfiName is the consent's own label — already known to
        // the worker (they signed it).
        await sendPushToIdentity(
          store,
          worker.id,
          {
            type: 'income_verification_read',
            title: `${consent.mfiName} just read your income summary`,
            body:
              `If you shared the consent link with them, no action needed. ` +
              `If you didn't, tap to revoke any remaining consents.`,
            mfiName: consent.mfiName,
            consentId
          },
          {
            urgency: 'normal',
            ledgerType: 'income_verification.pushed',
            requestId,
            logger
          }
        );
        jsonResponse(response, 200, { bundle });
        return;
      }

      // Phase 6.2 — collective-membership endpoints.
      //
      //   POST /api/identities/:collectiveId/collective-memberships
      //     Body: { memberId, collectiveName, memberRole?, region?,
      //             joinedAt?, ttlDays? }
      //     The collective (identified by :collectiveId, which must
      //     have a privateKey server-side per Phase 2a's ADR 0066
      //     demo-mode caveat) signs a membership attestation for
      //     :memberId. Worker MUST be a known identity. Emits
      //     `collective_membership.issued` ledger event.
      //
      //   GET /api/identities/:memberId/collective-memberships
      //     Lists memberships where :memberId is the member.
      //     Optional `status=active|revoked` filter.
      //
      //   POST /api/identities/:collectiveId/collective-memberships/:membershipId/revoke
      //     Body: { reason }  (≥ 4 chars)
      //     Collective revokes a previously-issued membership.
      //     404 if caller isn't the original issuer (no ownership
      //     leak via differential status).
      //
      //   GET /api/blessed-collectives
      //     Public — returns the admin-curated trust list. Consuming
      //     surfaces (MFI bundle, aggregator integrations, etc.)
      //     read this to know which collectives to honor.
      //
      //   POST /api/admin/blessed-collectives
      //     Admin-gated (Phase 5.7). Body: { collectiveId,
      //     collectiveName, notes? }. Adds a collective to the
      //     trust list.
      //
      //   DELETE /api/admin/blessed-collectives/:collectiveId
      //     Admin-gated. Removes a collective from the trust list.

      // POST /api/identities/:collectiveId/collective-memberships
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'collective-memberships' &&
        request.method === 'POST'
      ) {
        const collectiveId = decodeURIComponent(parts[2]);
        const collective = await store.readIdentity(collectiveId).catch(() => null);
        if (!collective) return notFound(response);
        if (!collective.privateKeyPem) {
          jsonResponse(response, 503, {
            error: {
              code: 'collective_missing_private_key',
              message:
                'The collective identity has no private key on this server. ' +
                'In Phase 2a demo mode, signing identities must have the ' +
                'privateKey present. Phase 2b moves signing client-side.'
            }
          });
          return;
        }
        const body = await readRequestJson(request).catch(() => ({}));
        const memberId = body.memberId;
        const member = memberId
          ? await store.readIdentity(memberId).catch(() => null)
          : null;
        if (!member) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_member',
              message: 'memberId must refer to an existing identity'
            }
          });
          return;
        }
        let membership;
        try {
          membership = createMembershipAttestation({
            collective,
            memberId,
            collectiveName: body.collectiveName ?? collective.displayName ?? null,
            memberRole: body.memberRole,
            region: body.region,
            joinedAt: body.joinedAt,
            ttlDays: body.ttlDays
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_membership', message: error.message }
          });
          return;
        }
        await store.saveCollectiveMembership(membership);
        await store.appendLedger({
          type: 'collective_membership.issued',
          membershipId: membership.membershipId,
          collectiveId: membership.collectiveId,
          memberId: membership.memberId,
          memberRole: membership.memberRole,
          region: membership.region,
          expiresAt: membership.expiresAt,
          at: new Date().toISOString()
        });
        jsonResponse(response, 201, { ok: true, membership });
        return;
      }

      // GET /api/identities/:memberId/collective-memberships
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'collective-memberships' &&
        request.method === 'GET'
      ) {
        const memberId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(memberId).catch(() => null);
        if (!identity) return notFound(response);
        const status = url.searchParams.get('status') ?? undefined;
        if (status && !['active', 'revoked'].includes(status)) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_status', message: 'status must be active|revoked' }
          });
          return;
        }
        const memberships =
          typeof store.listCollectiveMemberships === 'function'
            ? await store.listCollectiveMemberships({ memberId, status })
            : [];
        jsonResponse(response, 200, { memberships });
        return;
      }

      // POST /api/identities/:collectiveId/collective-memberships/:membershipId/revoke
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 6 &&
        parts[3] === 'collective-memberships' &&
        parts[5] === 'revoke' &&
        request.method === 'POST'
      ) {
        const collectiveId = decodeURIComponent(parts[2]);
        const membershipId = decodeURIComponent(parts[4]);
        const collective = await store.readIdentity(collectiveId).catch(() => null);
        if (!collective) return notFound(response);
        const membership = await store
          .readCollectiveMembership(membershipId)
          .catch(() => null);
        if (!membership) return notFound(response);
        if (membership.collectiveId !== collectiveId) {
          // §15 — non-issuer revoke attempt; 404 mirrors the
          // income-verification pattern (no ownership leak).
          return notFound(response);
        }
        const body = await readRequestJson(request).catch(() => ({}));
        let revoked;
        try {
          revoked = revokeMembershipAttestation(membership, { reason: body.reason });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_revocation', message: error.message }
          });
          return;
        }
        await store.saveCollectiveMembership(revoked);
        await store.appendLedger({
          type: 'collective_membership.revoked',
          membershipId,
          collectiveId,
          memberId: membership.memberId,
          reason: revoked.revokedReason,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, membership: revoked });
        return;
      }

      // GET /api/blessed-collectives  (public read; trust list)
      if (
        parts[0] === 'api' &&
        parts[1] === 'blessed-collectives' &&
        parts.length === 2 &&
        request.method === 'GET'
      ) {
        const blessed =
          typeof store.listBlessedCollectives === 'function'
            ? await store.listBlessedCollectives()
            : [];
        jsonResponse(response, 200, { blessed });
        return;
      }

      // POST /api/admin/blessed-collectives  (admin-gated)
      if (
        parts[0] === 'api' &&
        parts[1] === 'admin' &&
        parts[2] === 'blessed-collectives' &&
        parts.length === 3 &&
        request.method === 'POST'
      ) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const body = await readRequestJson(request).catch(() => ({}));
        let record;
        try {
          record = createBlessedCollectiveRecord({
            collectiveId: body.collectiveId,
            collectiveName: body.collectiveName,
            blessedBy: auth.operator,
            notes: body.notes
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_blessing', message: error.message }
          });
          return;
        }
        // Sanity: the collective must exist as an identity. Avoids
        // blessing a typo'd ID.
        const collective = await store
          .readIdentity(record.collectiveId)
          .catch(() => null);
        if (!collective) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_collective',
              message: 'collectiveId must refer to an existing identity'
            }
          });
          return;
        }
        await store.saveBlessedCollective(record);
        await store.appendLedger({
          type: 'blessed_collective.added',
          collectiveId: record.collectiveId,
          collectiveName: record.collectiveName,
          operator: auth.operator,
          at: record.blessedAt
        });
        jsonResponse(response, 201, { ok: true, blessed: record });
        return;
      }

      // DELETE /api/admin/blessed-collectives/:collectiveId
      if (
        parts[0] === 'api' &&
        parts[1] === 'admin' &&
        parts[2] === 'blessed-collectives' &&
        parts.length === 4 &&
        request.method === 'DELETE'
      ) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const collectiveId = decodeURIComponent(parts[3]);
        if (typeof store.deleteBlessedCollective !== 'function') {
          return notFound(response);
        }
        const removed = await store.deleteBlessedCollective(collectiveId);
        if (!removed) return notFound(response);
        await store.appendLedger({
          type: 'blessed_collective.removed',
          collectiveId,
          operator: auth.operator,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, collectiveId });
        return;
      }

      // Phase 6.3 — e-Shram registrations + welfare-scheme
      // entitlements. Same blessed-issuer pattern as Phase 6.2:
      // anyone can sign; only blessed issuers surface in
      // consuming flows.
      //
      //   POST   /api/identities/:issuerId/eshram-registrations
      //   GET    /api/identities/:memberId/eshram-registrations
      //   POST   .../eshram-registrations/:registrationId/revoke
      //   POST   /api/identities/:issuerId/scheme-entitlements
      //   GET    /api/identities/:memberId/scheme-entitlements
      //   POST   .../scheme-entitlements/:entitlementId/revoke

      // POST /api/identities/:issuerId/eshram-registrations
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'eshram-registrations' &&
        request.method === 'POST'
      ) {
        const issuerId = decodeURIComponent(parts[2]);
        const issuer = await store.readIdentity(issuerId).catch(() => null);
        if (!issuer) return notFound(response);
        if (!issuer.privateKeyPem) {
          jsonResponse(response, 503, {
            error: {
              code: 'issuer_missing_private_key',
              message:
                'Issuer identity has no privateKey on this server (Phase 2a demo-mode caveat).'
            }
          });
          return;
        }
        const body = await readRequestJson(request).catch(() => ({}));
        const member = body.memberId
          ? await store.readIdentity(body.memberId).catch(() => null)
          : null;
        if (!member) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_member',
              message: 'memberId must refer to an existing identity'
            }
          });
          return;
        }
        let registration;
        try {
          registration = createEShramRegistration({
            issuer,
            memberId: body.memberId,
            issuerName: body.issuerName ?? issuer.displayName ?? null,
            uan: body.uan,
            occupationCategory: body.occupationCategory,
            occupationDetail: body.occupationDetail,
            state: body.state,
            district: body.district,
            educationLevel: body.educationLevel,
            monthlyIncomeBracket: body.monthlyIncomeBracket,
            ncoCode: body.ncoCode,
            registeredAt: body.registeredAt,
            ttlDays: body.ttlDays
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_registration', message: error.message }
          });
          return;
        }
        await store.saveEShramRegistration(registration);
        await store.appendLedger({
          type: 'eshram_registration.issued',
          registrationId: registration.registrationId,
          issuerId: registration.issuerId,
          memberId: registration.memberId,
          uanMasked: registration.uanMasked,
          state: registration.state,
          occupationCategory: registration.occupationCategory,
          expiresAt: registration.expiresAt,
          at: new Date().toISOString()
        });
        jsonResponse(response, 201, { ok: true, registration });
        return;
      }

      // GET /api/identities/:memberId/eshram-registrations
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'eshram-registrations' &&
        request.method === 'GET'
      ) {
        const memberId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(memberId).catch(() => null);
        if (!identity) return notFound(response);
        const status = url.searchParams.get('status') ?? undefined;
        if (status && !['active', 'revoked'].includes(status)) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_status', message: 'status must be active|revoked' }
          });
          return;
        }
        const registrations =
          typeof store.listEShramRegistrations === 'function'
            ? await store.listEShramRegistrations({ memberId, status })
            : [];
        jsonResponse(response, 200, { registrations });
        return;
      }

      // POST /api/identities/:issuerId/eshram-registrations/:registrationId/revoke
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 6 &&
        parts[3] === 'eshram-registrations' &&
        parts[5] === 'revoke' &&
        request.method === 'POST'
      ) {
        const issuerId = decodeURIComponent(parts[2]);
        const registrationId = decodeURIComponent(parts[4]);
        const issuer = await store.readIdentity(issuerId).catch(() => null);
        if (!issuer) return notFound(response);
        const registration = await store
          .readEShramRegistration(registrationId)
          .catch(() => null);
        if (!registration) return notFound(response);
        if (registration.issuerId !== issuerId) {
          // §15 — non-issuer revoke leaks no ownership.
          return notFound(response);
        }
        const body = await readRequestJson(request).catch(() => ({}));
        let revoked;
        try {
          revoked = revokeEShramRegistration(registration, { reason: body.reason });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_revocation', message: error.message }
          });
          return;
        }
        await store.saveEShramRegistration(revoked);
        await store.appendLedger({
          type: 'eshram_registration.revoked',
          registrationId,
          issuerId,
          memberId: registration.memberId,
          reason: revoked.revokedReason,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, registration: revoked });
        return;
      }

      // POST /api/identities/:issuerId/scheme-entitlements
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'scheme-entitlements' &&
        request.method === 'POST'
      ) {
        const issuerId = decodeURIComponent(parts[2]);
        const issuer = await store.readIdentity(issuerId).catch(() => null);
        if (!issuer) return notFound(response);
        if (!issuer.privateKeyPem) {
          jsonResponse(response, 503, {
            error: {
              code: 'issuer_missing_private_key',
              message:
                'Issuer identity has no privateKey on this server (Phase 2a demo-mode caveat).'
            }
          });
          return;
        }
        const body = await readRequestJson(request).catch(() => ({}));
        const member = body.memberId
          ? await store.readIdentity(body.memberId).catch(() => null)
          : null;
        if (!member) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_member',
              message: 'memberId must refer to an existing identity'
            }
          });
          return;
        }
        let entitlement;
        try {
          entitlement = createSchemeEntitlement({
            issuer,
            memberId: body.memberId,
            issuerName: body.issuerName ?? issuer.displayName ?? null,
            schemeCode: body.schemeCode,
            schemeName: body.schemeName,
            enrolledAt: body.enrolledAt,
            benefitPaise: body.benefitPaise,
            benefitDescription: body.benefitDescription,
            validThrough: body.validThrough,
            ttlDays: body.ttlDays
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_entitlement', message: error.message }
          });
          return;
        }
        await store.saveSchemeEntitlement(entitlement);
        await store.appendLedger({
          type: 'scheme_entitlement.issued',
          entitlementId: entitlement.entitlementId,
          issuerId: entitlement.issuerId,
          memberId: entitlement.memberId,
          schemeCode: entitlement.schemeCode,
          expiresAt: entitlement.expiresAt,
          at: new Date().toISOString()
        });
        jsonResponse(response, 201, { ok: true, entitlement });
        return;
      }

      // GET /api/identities/:memberId/scheme-entitlements
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 4 &&
        parts[3] === 'scheme-entitlements' &&
        request.method === 'GET'
      ) {
        const memberId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(memberId).catch(() => null);
        if (!identity) return notFound(response);
        const schemeCode = url.searchParams.get('schemeCode') ?? undefined;
        if (schemeCode && !WELFARE_SCHEME_CODES.includes(schemeCode)) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_scheme_code',
              message: `schemeCode must be one of: ${WELFARE_SCHEME_CODES.join(', ')}`
            }
          });
          return;
        }
        const entitlements =
          typeof store.listSchemeEntitlements === 'function'
            ? await store.listSchemeEntitlements({ memberId, schemeCode })
            : [];
        jsonResponse(response, 200, { entitlements });
        return;
      }

      // POST /api/identities/:issuerId/scheme-entitlements/:entitlementId/revoke
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 6 &&
        parts[3] === 'scheme-entitlements' &&
        parts[5] === 'revoke' &&
        request.method === 'POST'
      ) {
        const issuerId = decodeURIComponent(parts[2]);
        const entitlementId = decodeURIComponent(parts[4]);
        const issuer = await store.readIdentity(issuerId).catch(() => null);
        if (!issuer) return notFound(response);
        const entitlement = await store
          .readSchemeEntitlement(entitlementId)
          .catch(() => null);
        if (!entitlement) return notFound(response);
        if (entitlement.issuerId !== issuerId) return notFound(response);
        const body = await readRequestJson(request).catch(() => ({}));
        let revoked;
        try {
          revoked = revokeSchemeEntitlement(entitlement, { reason: body.reason });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_revocation', message: error.message }
          });
          return;
        }
        await store.saveSchemeEntitlement(revoked);
        await store.appendLedger({
          type: 'scheme_entitlement.revoked',
          entitlementId,
          issuerId,
          memberId: entitlement.memberId,
          reason: revoked.revokedReason,
          at: new Date().toISOString()
        });
        jsonResponse(response, 200, { ok: true, entitlement: revoked });
        return;
      }

      // Phase 6.0c — year-end tax helper.
      //
      // GET /api/identities/:id/tax/summary?financialYear=YYYY-YY
      //   &digitalShare=0.95          (optional; default 0.95)
      //   &isGoodsSupplier=false      (optional; default false)
      //
      // Computes new-regime + old-regime + 44AD presumptive
      // comparison from the worker's logged earnings (Phase 6.0a).
      // ALWAYS returns a `disclaimer` field — every consumer surface
      // MUST display it ("consult a CA before filing").
      //
      // §15: tax math is local-compute over already-on-device
      // earnings data. We never store PAN. We never auto-file.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'tax' &&
        parts[4] === 'summary' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const financialYear = url.searchParams.get('financialYear');
        if (!financialYear) {
          jsonResponse(response, 400, {
            error: {
              code: 'financial_year_required',
              message: 'Provide ?financialYear=YYYY-YY (e.g., 2025-26)'
            }
          });
          return;
        }
        const digitalShareRaw = url.searchParams.get('digitalShare');
        const digitalReceiptShare =
          digitalShareRaw !== null && digitalShareRaw !== ''
            ? Number(digitalShareRaw)
            : 0.95;
        if (
          !Number.isFinite(digitalReceiptShare) ||
          digitalReceiptShare < 0 ||
          digitalReceiptShare > 1
        ) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_digital_share',
              message: 'digitalShare must be a number between 0 and 1'
            }
          });
          return;
        }
        const isGoodsSupplier =
          url.searchParams.get('isGoodsSupplier') === 'true';
        const entries =
          typeof store.listEarningsEntries === 'function'
            ? await store.listEarningsEntries({ identityId })
            : [];
        let summary;
        try {
          summary = taxSummary({
            entries,
            financialYear,
            digitalReceiptShare,
            isGoodsSupplier
          });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_tax_input', message: error.message }
          });
          return;
        }
        jsonResponse(response, 200, { summary });
        return;
      }

      // Phase 6.0b — mesh-contribution dashboard.
      //
      // GET /api/identities/:id/mesh/summary?month=YYYY-MM
      //
      // Aggregates the worker's mesh-contribution events for a
      // single calendar month + returns a per-day timeline so the
      // shell can render a dashboard card. Substrate (events
      // themselves) is from Phase 3.x; this is UX promotion of
      // existing data.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'mesh' &&
        parts[4] === 'summary' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const month = url.searchParams.get('month');
        if (!month) {
          jsonResponse(response, 400, {
            error: { code: 'month_required', message: 'Provide ?month=YYYY-MM' }
          });
          return;
        }
        const events = await store.listMeshContributionEvents().catch(() => []);
        let summary;
        try {
          summary = aggregateMeshByMonth(events, month, { operatorId: identityId });
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_month', message: error.message }
          });
          return;
        }
        jsonResponse(response, 200, {
          summary,
          statement: meshMonthlyStatement(summary)
        });
        return;
      }

      // Phase 6.1b — mesh-earnings UPI cash-out.
      //
      //   GET /api/identities/:id/mesh/balance
      //     Returns the worker's currently-available (unsettled)
      //     mesh-contribution payout.
      //
      //   POST /api/identities/:id/mesh/withdrawals
      //     Body: { upiId }
      //     Worker initiates a cash-out for the FULL available
      //     balance (partial withdrawals are a future-polish item).
      //     Bharat OS bundles every unsettled event into a single
      //     signed request; once persisted, those events become
      //     SETTLED (held in this withdrawal) so a concurrent
      //     request can't double-claim.
      //
      //   GET /api/identities/:id/mesh/withdrawals
      //     Lists the worker's withdrawal history.
      //
      //   POST /api/admin/mesh/withdrawals/:requestId/accepted
      //     POST /api/admin/mesh/withdrawals/:requestId/paid
      //     POST /api/admin/mesh/withdrawals/:requestId/failed
      //     Ops-only state transitions (Phase 5.7 admin-auth).
      //     The payout-provider integration boundary lives here:
      //     ops marks the withdrawal as the partner reports back.

      // GET /api/identities/:id/mesh/balance
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'mesh' &&
        parts[4] === 'balance' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const events =
          typeof store.listMeshContributionEvents === 'function'
            ? await store.listMeshContributionEvents()
            : [];
        const withdrawals =
          typeof store.listMeshWithdrawals === 'function'
            ? await store.listMeshWithdrawals({ workerId: identityId })
            : [];
        const balance = computeAvailableBalance(events, withdrawals, {
          operatorId: identityId
        });
        jsonResponse(response, 200, { balance });
        return;
      }

      // POST /api/identities/:id/mesh/withdrawals
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'mesh' &&
        parts[4] === 'withdrawals' &&
        request.method === 'POST'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const body = await readRequestJson(request).catch(() => ({}));
        const events =
          typeof store.listMeshContributionEvents === 'function'
            ? await store.listMeshContributionEvents()
            : [];
        const priorWithdrawals =
          typeof store.listMeshWithdrawals === 'function'
            ? await store.listMeshWithdrawals({ workerId: identityId })
            : [];
        let request_;
        try {
          request_ = createMeshWithdrawalRequest({
            identity,
            meshEvents: events,
            priorWithdrawals,
            upiId: body.upiId
          });
        } catch (error) {
          const code = /insufficient_balance/.test(error.message)
            ? 'insufficient_balance'
            : /amount_exceeds_ceiling/.test(error.message)
              ? 'amount_exceeds_ceiling'
              : /upiId/.test(error.message)
                ? 'invalid_upi_id'
                : 'invalid_withdrawal_request';
          jsonResponse(response, 400, {
            error: { code, message: error.message }
          });
          return;
        }
        await store.saveMeshWithdrawal(request_);
        await store.appendLedger({
          type: 'mesh_withdrawal.requested',
          requestId: request_.requestId,
          workerId: request_.workerId,
          amountPaise: request_.amountPaise,
          upiMasked: request_.upiIdMasked,
          eventCount: request_.eventCount,
          at: request_.requestedAt
        });
        jsonResponse(response, 201, { ok: true, withdrawal: request_ });
        return;
      }

      // GET /api/identities/:id/mesh/withdrawals
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'mesh' &&
        parts[4] === 'withdrawals' &&
        request.method === 'GET'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const withdrawals =
          typeof store.listMeshWithdrawals === 'function'
            ? await store.listMeshWithdrawals({ workerId: identityId })
            : [];
        jsonResponse(response, 200, { withdrawals });
        return;
      }

      // POST /api/admin/mesh/withdrawals/:requestId/accepted|paid|failed
      if (
        parts[0] === 'api' &&
        parts[1] === 'admin' &&
        parts[2] === 'mesh' &&
        parts[3] === 'withdrawals' &&
        parts.length === 6 &&
        request.method === 'POST'
      ) {
        const auth = checkAdminAuth(request, response, { requestId });
        if (!auth) return;
        const transition = parts[5];
        if (!['accepted', 'paid', 'failed'].includes(transition)) {
          jsonResponse(response, 400, {
            error: {
              code: 'unknown_transition',
              message: 'transition must be accepted | paid | failed'
            }
          });
          return;
        }
        const withdrawalId = decodeURIComponent(parts[4]);
        const withdrawal = await store
          .readMeshWithdrawal(withdrawalId)
          .catch(() => null);
        if (!withdrawal) return notFound(response);
        const body = await readRequestJson(request).catch(() => ({}));
        let updated;
        try {
          if (transition === 'accepted') {
            updated = markWithdrawalAccepted(withdrawal, {
              providerReference: body.providerReference
            });
          } else if (transition === 'paid') {
            updated = markWithdrawalPaid(withdrawal, {
              providerReference: body.providerReference
            });
          } else {
            updated = markWithdrawalFailed(withdrawal, { reason: body.reason });
          }
        } catch (error) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_transition', message: error.message }
          });
          return;
        }
        await store.saveMeshWithdrawal(updated);
        await store.appendLedger({
          type: `mesh_withdrawal.${updated.status}`,
          requestId: updated.requestId,
          workerId: updated.workerId,
          operator: auth.operator,
          providerReference: updated.providerReference ?? null,
          failureReason: updated.failureReason ?? null,
          at: new Date().toISOString()
        });
        logger.info('admin_mesh_withdrawal_transition', {
          requestId,
          operator: auth.operator,
          withdrawalId,
          status: updated.status
        });
        // Phase 7.1 — push when the withdrawal reaches `paid` or
        // `failed`. The worker hears about their cash-out (or its
        // failure) without needing to refresh the app. §15: the
        // push body uses the masked UPI ID, never the raw one;
        // the rupee amount is the worker's own self-asserted
        // figure (not PII in the §15 sense).
        if (updated.status === 'paid') {
          await sendPushToIdentity(
            store,
            updated.workerId,
            {
              type: 'mesh_withdrawal_paid',
              title: `₹${(updated.amountPaise / 100).toFixed(2)} sent to your UPI`,
              body:
                `Your mesh-contribution payout to ${updated.upiIdMasked} is ` +
                `complete. Reference: ${updated.providerReference ?? 'n/a'}.`,
              amountPaise: updated.amountPaise,
              upiIdMasked: updated.upiIdMasked
            },
            {
              urgency: 'normal',
              ledgerType: 'mesh_withdrawal.pushed',
              requestId,
              logger
            }
          );
        } else if (updated.status === 'failed') {
          await sendPushToIdentity(
            store,
            updated.workerId,
            {
              type: 'mesh_withdrawal_failed',
              title: 'Your mesh-contribution payout failed',
              body:
                `The ₹${(updated.amountPaise / 100).toFixed(2)} payout to ` +
                `${updated.upiIdMasked} couldn't complete: ${updated.failureReason ?? 'unknown'}. ` +
                `The amount has been returned to your available balance.`,
              amountPaise: updated.amountPaise,
              upiIdMasked: updated.upiIdMasked,
              failureReason: updated.failureReason
            },
            {
              urgency: 'high',
              ledgerType: 'mesh_withdrawal.pushed',
              requestId,
              logger
            }
          );
        }
        jsonResponse(response, 200, { ok: true, withdrawal: updated });
        return;
      }

      // DELETE /api/identities/:id/earnings/:entryId
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 5 &&
        parts[3] === 'earnings' &&
        request.method === 'DELETE'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const entryId = decodeURIComponent(parts[4]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        if (typeof store.readEarningsEntry !== 'function') {
          return notFound(response);
        }
        const entry = await store.readEarningsEntry(entryId).catch(() => null);
        if (!entry || entry.identityId !== identityId) return notFound(response);
        await store.deleteEarningsEntry(entryId);
        jsonResponse(response, 200, { ok: true, entryId });
        return;
      }

      // Phase 4.3 — phone-OTP send.
      //
      // Body: { identityId, phone, purpose? }
      // Returns: { ok, otpId, expiresAt, phoneMasked, providerMessageId }
      //
      // The plaintext OTP is generated, handed to the SMS provider,
      // then discarded by this handler. Storage holds only the
      // salted hash. Rate-limited under the 'expensive' policy
      // (10/5min) by the route prefix detection in policyFor().
      if (
        parts[0] === 'api' &&
        parts[1] === 'phone-otp' &&
        parts[2] === 'send' &&
        parts.length === 3
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const phone = normalisePhone(body.phone);
        if (!phone) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_phone', message: 'Provide a 10-digit Indian number or E.164 (+91…).' }
          });
          return;
        }
        if (!body.identityId) {
          jsonResponse(response, 400, {
            error: { code: 'missing_identity', message: 'identityId is required.' }
          });
          return;
        }
        const identity = await store.readIdentity(body.identityId).catch(() => null);
        if (!identity) return notFound(response);
        const purpose = body.purpose ?? 'phone_verify';
        if (!PHONE_OTP_PURPOSES.includes(purpose)) {
          jsonResponse(response, 400, {
            error: {
              code: 'invalid_purpose',
              message: `purpose must be one of: ${PHONE_OTP_PURPOSES.join(', ')}`
            }
          });
          return;
        }
        const otp = createPhoneOtp({
          identityId: body.identityId,
          phone,
          purpose
        });
        // Strip the plaintext code BEFORE persisting. Storage gets
        // only { codeHash, salt }.
        const { code, ...persisted } = otp;
        await store.savePhoneOtp(persisted);
        // Send the SMS — using the configured provider (default
        // 'log' in dev). Failures bubble up to the caller; we don't
        // persist a "sent" state if the provider rejected.
        const smsResult = await sendSms({
          phone,
          body: `Bharat OS code: ${code}. Valid for 5 minutes. Never share this code.`
        });
        jsonResponse(response, 201, {
          ok: true,
          otpId: persisted.otpId,
          expiresAt: persisted.expiresAt,
          phoneMasked: persisted.phoneMasked,
          providerMessageId: smsResult.providerMessageId,
          // Phase 12.0.1 — dev-only OTP reveal so the investor demo
          // doesn't need anyone to read the server console. ONLY
          // returned when the configured SMS provider is the `log`
          // provider; production SMS providers (gupshup, twilio,
          // msg91) NEVER carry this field. The reveal is the same
          // information already visible in the structured log stream
          // when BHARAT_OS_LOG_OTP_BODIES=1 — so this isn't a new
          // leak surface, just a more demo-friendly one.
          ...((process.env.BHARAT_OS_SMS_PROVIDER ?? 'log') === 'log'
            ? { _devOtpCode: code }
            : {})
        });
        return;
      }

      // Phase 4.3 — phone-OTP verify.
      //
      // Body: { otpId, code }
      // Returns: { ok, status, otp: <persisted summary> }
      // On success, the phone is attached to the identity's
      // attestations block as a verified attestation.
      if (
        parts[0] === 'api' &&
        parts[1] === 'phone-otp' &&
        parts[2] === 'verify' &&
        parts.length === 3
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        if (!body.otpId || !body.code) {
          jsonResponse(response, 400, {
            error: {
              code: 'missing_fields',
              message: 'otpId and code are both required.'
            }
          });
          return;
        }
        const otp = await store.readPhoneOtp(body.otpId).catch(() => null);
        if (!otp) return notFound(response);
        const result = verifyPhoneOtp(otp, body.code);
        // Persist the updated OTP regardless of outcome (attempts
        // counter, expiry state, etc).
        await store.savePhoneOtp(result.otp);

        if (result.status === 'verified') {
          // On success: attach the phone as a verified attestation
          // on the identity. Future regulated workflows can use
          // this as evidence the phone is the user's.
          const identity = await store.readIdentity(otp.identityId).catch(() => null);
          if (identity) {
            const updated = {
              ...identity,
              attestations: {
                ...(identity.attestations ?? {}),
                phone_verified: {
                  status: 'verified',
                  issuer: 'phone_otp',
                  verifiedAt: result.otp.verifiedAt,
                  phoneMasked: result.otp.phoneMasked
                  // Full phone NOT stored on the public identity
                  // record — only the OTP store has it. Verifiers
                  // see only the mask.
                }
              }
            };
            await store.saveIdentity(updated);
          }
        }

        jsonResponse(response, result.status === 'verified' ? 200 : 400, {
          ok: result.status === 'verified',
          status: result.status,
          otp: {
            otpId: result.otp.otpId,
            status: result.otp.status,
            attempts: result.otp.attempts,
            expiresAt: result.otp.expiresAt,
            verifiedAt: result.otp.verifiedAt
          }
        });
        return;
      }

      // Phase 5.0 — account recovery start.
      //
      // Body: { phone }
      // 1. Find an identity whose phone_verified attestation
      //    matches the given phone.
      // 2. Issue an account_recovery-purpose OTP to that phone.
      // 3. Return { ok, recoveryId, otpId, phoneMasked, expiresAt }.
      //
      // §15: the response never reveals WHICH identity matched —
      // only that one did (or didn't). Even an attacker who knows
      // a Bharat OS user's phone number cannot learn their
      // identity ID without the OTP.
      if (
        parts[0] === 'api' &&
        parts[1] === 'recovery' &&
        parts[2] === 'start' &&
        parts.length === 3
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const phone = normalisePhone(body.phone);
        if (!phone) {
          jsonResponse(response, 400, {
            error: { code: 'invalid_phone', message: 'Provide a valid phone number.' }
          });
          return;
        }
        // Phase 5.2 — per-phone rate-limit. SIM-swap defense:
        // applied IDENTICALLY to registered and unregistered
        // phones BEFORE the identity lookup so a 429 vs 200 can
        // never reveal which phones are Bharat OS accounts.
        const phoneRate = limiter.consume(`phone:${phone}`, 'recovery_per_phone');
        if (!phoneRate.allowed) {
          const retryAfter = Math.max(1, Math.ceil(phoneRate.retryAfterSeconds));
          response.setHeader('retry-after', retryAfter.toString());
          jsonResponse(response, 429, {
            error: {
              code: 'rate_limited',
              message: `Too many recovery attempts for this phone. Retry in ${retryAfter}s.`
            }
          });
          return;
        }
        const identities = await store.listIdentities();
        const matched = findIdentityByPhone(identities, phone);
        // Anti-enumeration sentinel reused for: (a) no-match, and
        // (b) matched-but-cooling-down. The attacker probing a SIM-
        // swapped phone for a second recovery cannot tell whether
        // the prior one succeeded.
        const noMatchSentinel = () => {
          jsonResponse(response, 200, {
            ok: true,
            recoveryId: 'bos:account-recovery:no-match-sentinel',
            phoneMasked: '+91*****',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            note: 'If this phone is registered with Bharat OS, a code has been sent.'
          });
        };
        if (!matched) {
          noMatchSentinel();
          return;
        }
        if (cooldownState(matched).active) {
          // §15 — cooldown is itself a sensitive signal (it implies
          // a recent recovery succeeded). Mask it behind the
          // sentinel.
          noMatchSentinel();
          return;
        }
        const request_ = startAccountRecovery({
          identity: matched,
          phone
        });
        // Strip plaintext code before persisting.
        const { code, ...persisted } = request_.otp;
        await store.savePhoneOtp(persisted);
        // Hand the plaintext code to the SMS provider.
        const sms = await sendSms({
          phone,
          body:
            `Bharat OS recovery code: ${code}. Valid for 5 minutes. ` +
            `If you didn't request this, ignore — someone may be trying to take over your account.`
        });
        jsonResponse(response, 201, {
          ok: true,
          recoveryId: request_.recoveryId,
          otpId: persisted.otpId,
          phoneMasked: persisted.phoneMasked,
          expiresAt: persisted.expiresAt,
          providerMessageId: sms.providerMessageId,
          note: 'If this phone is registered with Bharat OS, a code has been sent.',
          // Phase 12.0.1 — same dev-only OTP reveal as /api/phone-otp/send.
          // The §15 anti-enumeration sentinel (returning the same
          // shape for matched + unmatched phones) is preserved: the
          // sentinel branch above also doesn't include _devOtpCode,
          // so revealing the code on a real match doesn't leak the
          // is-this-phone-registered signal.
          ...((process.env.BHARAT_OS_SMS_PROVIDER ?? 'log') === 'log'
            ? { _devOtpCode: code }
            : {})
        });
        return;
      }

      // Phase 5.0 — account recovery verify.
      //
      // Body: { otpId, code }
      // 1. Read the OTP (must be account_recovery purpose).
      // 2. Verify the code via verifyAccountRecovery.
      // 3. On success, return the recovery bundle: full identity
      //    (incl. privateKey + vaultKey) + deterministic recovery
      //    phrase + memory-record refs. The new device persists
      //    the identity as device owner.
      //
      // The bundle is the same shape vault-snapshot returns; the
      // gating mechanism (OTP vs free GET) is the §15 difference.
      if (
        parts[0] === 'api' &&
        parts[1] === 'recovery' &&
        parts[2] === 'verify' &&
        parts.length === 3
      ) {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        if (!body.otpId || !body.code) {
          jsonResponse(response, 400, {
            error: {
              code: 'missing_fields',
              message: 'otpId and code are required.'
            }
          });
          return;
        }
        const otp = await store.readPhoneOtp(body.otpId).catch(() => null);
        if (!otp || otp.purpose !== 'account_recovery') return notFound(response);
        const result = verifyAccountRecovery(otp, body.code);
        await store.savePhoneOtp(result.otp);
        if (result.status !== 'verified') {
          jsonResponse(response, 400, {
            ok: false,
            status: result.status,
            otp: {
              otpId: result.otp.otpId,
              status: result.otp.status,
              attempts: result.otp.attempts,
              expiresAt: result.otp.expiresAt
            }
          });
          return;
        }
        const identity = await store.readIdentity(otp.identityId).catch(() => null);
        if (!identity) return notFound(response);
        // Compose the recovery bundle. The deterministic recovery
        // phrase saves the user from having to type it — they get
        // back into Bharat OS without needing to remember it. The
        // phrase is still THEIR data, derived from THEIR publicKey.
        const recoveryPhrase = generateRecoveryPhrase(identity).phrase;
        const allMemory = await store.listMemoryRecords();
        const memoryRecordRefs = allMemory
          .filter((record) => record.ownerId === identity.id)
          .map((record) => ({
            recordId: record.recordId,
            manifestId: record.manifestId ?? null,
            label: record.label ?? null,
            createdAt: record.createdAt ?? null
          }));
        // Phase 5.2 — apply the 24h post-recovery cooldown to the
        // recovered identity. Sensitive endpoints (deletion, repeat
        // recovery, attestation-grant) refuse during this window so
        // a SIM-swap attacker can't immediately empty the account.
        const cooledIdentity = applyRecoveryCooldown(identity, {
          at: Date.now(),
          reason: 'account_recovery'
        });
        await store.saveIdentity(cooledIdentity);
        const bundle = buildRecoveryBundle({
          identity: cooledIdentity,
          recoveryPhrase,
          memoryRecordRefs
        });
        // Audit: the recovery succeeded. The ledger captures the
        // masked phone + the rebound identity ID so a SIM-swap
        // takeover can be detected after-the-fact.
        await store.appendLedger({
          type: 'account_recovery.completed',
          identityId: identity.id,
          phoneMasked: otp.phoneMasked,
          recoveryOtpId: otp.otpId,
          cooldownUntil: cooledIdentity.recoveryCooldown?.until,
          at: new Date().toISOString()
        });

        // Phase 7.0 — push a SIM-swap detection alert to every
        // paired device that had a stored push subscription. The
        // legitimate user sees "your account was just recovered"
        // within seconds on devices the attacker doesn't have.
        // Best-effort: failures don't block the response. The
        // 24h cooldown (Phase 5.2) is the actual defensive
        // protection; this push is the detection signal.
        await sendPushToIdentity(
          store,
          identity.id,
          {
            type: 'account_recovery_alert',
            title: 'Your Bharat OS account was just recovered',
            body:
              `If this was you, no action needed. If it was NOT, ` +
              `tap to contact support — your cooldown window ends at ` +
              `${cooledIdentity.recoveryCooldown?.until}.`,
            cooldownUntil: cooledIdentity.recoveryCooldown?.until
          },
          {
            urgency: 'high',
            ledgerType: 'recovery_alert.pushed',
            requestId,
            logger
          }
        );

        jsonResponse(response, 200, {
          ok: true,
          status: 'verified',
          recoveryBundle: bundle,
          recoveryCooldown: cooledIdentity.recoveryCooldown
        });
        return;
      }

      // DPDP §12(3) right-to-erasure (execute). Destroys every per-
      // user record + redacts ledger entries. Requires
      // `?confirm=YES_DELETE` in the query string AND a matching
      // body acknowledging the irreversibility — belt-and-braces
      // against accidental hits.
      if (
        parts[0] === 'api' &&
        parts[1] === 'identities' &&
        parts.length === 3 &&
        request.method === 'DELETE'
      ) {
        const identityId = decodeURIComponent(parts[2]);
        const identity = await store.readIdentity(identityId).catch(() => null);
        if (!identity) return notFound(response);
        const confirm = url.searchParams.get('confirm');
        if (confirm !== 'YES_DELETE') {
          jsonResponse(response, 400, {
            error: 'erasure requires ?confirm=YES_DELETE in the query string',
            preview_endpoint: `/api/identities/${encodeURIComponent(identityId)}/erasure-preview`
          });
          return;
        }
        // Phase 5.2 — refuse deletion during the post-recovery
        // cooldown. A SIM-swap attacker who just recovered the
        // account cannot also immediately destroy it; the
        // legitimate user has 24h to spot the recovery (via push
        // / ops alert / paired-device notification) and override.
        try {
          assertNoCooldown(identity, { scope: COOLDOWN_SCOPES.IDENTITY_DELETION });
        } catch (error) {
          if (error.code === 'RECOVERY_COOLDOWN_ACTIVE') {
            response.setHeader('retry-after', String(error.secondsRemaining));
            jsonResponse(response, 423, {
              error: {
                code: 'recovery_cooldown_active',
                message:
                  'This account was recently recovered. Deletion is paused for 24 hours so a recovery attempt cannot destroy the account. ' +
                  `Resumes at ${error.until}.`,
                scope: error.scope,
                until: error.until,
                secondsRemaining: error.secondsRemaining
              }
            });
            return;
          }
          throw error;
        }
        const report = await store.eraseUserData(identityId, { redactLedgerEntry });
        jsonResponse(response, 200, {
          ok: true,
          identityId,
          report,
          message:
            'Erasure complete. Your identity has been removed; ledger entries that mentioned you are now anonymous. You cannot recover this account.'
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'identities') {
        if (request.method === 'GET') {
          const identities = await store.listIdentities();
          jsonResponse(response, 200, {
            identities: identities.map(publicIdentity)
          });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const identity = createIdentity({
            displayName: body.displayName ?? body.name,
            attestations: body.attestations ?? {}
          });
          await store.saveIdentity(identity);
          jsonResponse(response, 201, { ok: true, identity: publicIdentity(identity) });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
      }

      if (parts[0] === 'api' && parts[1] === 'nodes') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const nodes = await store.listNodes();
        const bootstrap = await maybeReadControlPlane(store, 'bootstrap');
        jsonResponse(response, 200, {
          nodes: bootstrap ? Object.values(bootstrap.nodes ?? {}) : nodes,
          bootstrap: bootstrap ? controlPlaneSummary(bootstrap, 'bootstrap') : null
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'manifests') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const manifests = await store.listManifests();
        jsonResponse(response, 200, {
          manifests: manifests.map((manifest) => ({
            manifestId: manifest.manifestId,
            ownerId: manifest.ownerId,
            contentType: manifest.contentType,
            plaintextBytes: manifest.plaintextBytes,
            chunkCount: manifest.chunks?.length ?? 0,
            createdAt: manifest.createdAt
          }))
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'reports' && parts.length === 2) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const reports = await store.listSimulationReports();
        jsonResponse(response, 200, {
          reports: reports.map(reportSummary)
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'reports' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const wantsMarkdown = parts[2].endsWith('.md');
        const reportId = wantsMarkdown ? parts[2].slice(0, -3) : parts[2];
        const report = await store.readSimulationReport(reportId);
        if (wantsMarkdown) {
          textResponse(response, 200, renderBootstrapMarkdown(report), 'text/markdown; charset=utf-8');
        } else {
          jsonResponse(response, 200, report);
        }
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'control-planes' && parts.length === 3) {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const controlPlane = await store.readControlPlane(parts[2]);
        jsonResponse(response, 200, {
          summary: controlPlaneSummary(controlPlane, parts[2]),
          controlPlane
        });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'simulations' && parts[2] === 'bootstrap') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readRequestJson(request);
        const simulation = simulateDemandBootstrap({
          seed: body.seed ?? url.searchParams.get('seed') ?? 'bharat-os-phase0',
          nodeCount: parseInteger(body.nodeCount ?? url.searchParams.get('nodes'), 1000, 'nodeCount'),
          objectCount: parseInteger(body.objectCount ?? url.searchParams.get('objects'), 100, 'objectCount'),
          averageObjectBytes: parseInteger(
            body.averageObjectBytes ?? url.searchParams.get('avgObjectBytes'),
            64 * 1024,
            'averageObjectBytes'
          ),
          objectJitter: parseNumber(body.objectJitter ?? url.searchParams.get('jitter'), 0.35, 'objectJitter'),
          chunkSizeBytes: parseInteger(body.chunkSizeBytes ?? url.searchParams.get('chunkSize'), 16 * 1024, 'chunkSizeBytes'),
          replicationFactor: parseInteger(body.replicationFactor ?? url.searchParams.get('replication'), 3, 'replicationFactor'),
          batteryThreshold: parseInteger(body.batteryThreshold ?? url.searchParams.get('batteryThreshold'), 40, 'batteryThreshold'),
          requireKyc:
            body.requireKyc !== undefined
              ? parseBoolean(body.requireKyc, true)
              : !parseBoolean(body.noKyc ?? url.searchParams.get('noKyc'), false)
        });

        await store.saveIdentity(simulation.owner);
        await store.saveControlPlane(simulation.controlPlane, 'bootstrap');
        await store.saveSimulationReport(simulation.report);

        jsonResponse(response, 201, {
          ok: true,
          report: reportSummary(simulation.report),
          controlPlane: controlPlaneSummary(simulation.controlPlane, 'bootstrap')
        });
        return;
      }

      return notFound(response, url.pathname);
    } catch (error) {
      if (error.code === 'ENOENT') {
        jsonResponse(response, 404, {
          error: {
            code: 'not_found',
            message: error.message
          }
        });
        return;
      }

      if (error instanceof SyntaxError) {
        jsonResponse(response, 400, {
          error: {
            code: 'bad_json',
            message: error.message
          }
        });
        return;
      }

      jsonResponse(response, 500, {
        error: {
          code: 'internal_error',
          message: error.message
        }
      });
    }
  });

  // Phase 4.1 — generous timeouts to absorb slow networks without
  // pinning a slow-loris client. Node defaults are quite forgiving;
  // explicit values document the intent and make the limits
  // tunable.
  server.headersTimeout = 30_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 5_000;

  return server;
}

// Graceful shutdown wrapper — drains in-flight requests on SIGTERM /
// SIGINT instead of dropping them. The CLI entry point uses this.
export function installGracefulShutdown(server, { drainTimeoutMs = 10_000 } = {}) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown_initiated', { signal });
    const forceTimer = setTimeout(() => {
      logger.warn('shutdown_force', { signal, after_ms: drainTimeoutMs });
      process.exit(1);
    }, drainTimeoutMs);
    forceTimer.unref?.();
    server.close((err) => {
      if (err) logger.error('shutdown_close_error', { reason: err.message });
      else logger.info('shutdown_complete', { signal });
      clearTimeout(forceTimer);
      process.exit(err ? 1 : 0);
    });
  };
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => shutdown(signal));
  }
}

export async function listenPhase0Api({ store, host = '127.0.0.1', port = 8787 }) {
  await store.init();
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.info('server_listening', { host, port });
  installGracefulShutdown(server);
  return server;
}
