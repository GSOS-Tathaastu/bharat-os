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
            'POST /api/identities/:collectiveId/collective-memberships',
            'GET /api/identities/:memberId/collective-memberships',
            'POST /api/identities/:collectiveId/collective-memberships/:membershipId/revoke',
            'GET /api/blessed-collectives',
            'POST /api/admin/blessed-collectives',
            'DELETE /api/admin/blessed-collectives/:collectiveId',
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

      if (parts[0] === 'api' && parts[1] === 'orchestrations' && parts.length === 2) {
        if (request.method === 'GET') {
          jsonResponse(response, 200, { orchestrations: await store.listOrchestrations() });
          return;
        }
        if (request.method === 'POST') {
          const body = await readRequestJson(request);
          const consents = await store.listConsents();
          const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
          const flags = await store.listFlagReports();

          // §9C vignette 16b — daily_brief needs the on-device signals
          // gathered (recent activity, mesh earnings, expiring consents,
          // open §9A flags) before the tool can render the brief. This
          // is the server stand-in for the Phase 2b on-device gather
          // step; the §15 binding (no PII leaves the user's profile
          // boundary) is preserved because the signals only ever live
          // inside the orchestration response back to the same client.
          let augmentedBody = body;
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
              metadata: {
                ...(body.metadata ?? {}),
                signals,
                subjectDisplayName: subjectIdentity?.displayName ?? null
              }
            };
          }

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

          // §13A #7 — when the just-executed action minted a trust
          // attestation, auto-sign it with the subject's identity and
          // persist to the attestations index so the verifier flow
          // (`/api/attestations/:id` + `/verify/`) can read it back.
          // Phase 2b moves the signing step to the device hardware
          // keystore; here it happens on the server because the
          // private key is server-stored (see ADR 0066's demo-mode
          // warning).
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

          jsonResponse(response, 201, {
            ok: true,
            orchestration,
            attestation: signedAttestation
          });
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
          const subscription = createPushSubscriptionRecord({
            identityId: body.identityId,
            endpoint: body.endpoint,
            keys: body.keys ?? {},
            permission: body.permission ?? 'granted',
            source: body.source ?? 'shell',
            userAgent: body.userAgent
          });
          await store.savePushSubscription(subscription);
          jsonResponse(response, 201, { ok: true, subscription });
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
          await store.saveWorkerNotification(notification);
          jsonResponse(response, notification.delivery.status === 'blocked_no_subscription' ? 202 : 201, {
            ok: notification.delivery.status !== 'blocked_no_subscription',
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
            batteryPercent: body.batteryPercent
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
              contributorBudget: body.contributorBudget
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
        await store.saveFederatedRound(nextRound);
        await store.saveFederatedUpdate(accepted);
        let meshEvent = null;
        if (accepted.payoutPaise > 0) {
          meshEvent = createMeshContributionEvent({
            operatorId: accepted.contributorId,
            workloadType: FEDERATED_ROUND_WORKLOAD,
            payoutPaise: accepted.payoutPaise,
            roundId: nextRound.roundId
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
          blessedCollectives
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
            : Promise.resolve([])
        ]);
        const bundle = buildIncomeVerificationBundle({
          identity: worker,
          consent,
          earningsEntries,
          meshContributionEvents: meshEvents,
          portableAttestations,
          collectiveMemberships,
          blessedCollectives
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
          providerMessageId: smsResult.providerMessageId
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
          note: 'If this phone is registered with Bharat OS, a code has been sent.'
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
