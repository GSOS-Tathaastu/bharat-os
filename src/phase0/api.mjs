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

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../..');
const consoleRoot = path.join(repoRoot, 'public/operator-console');
const shellRoot = path.join(repoRoot, 'public/shell');

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
  for await (const chunk of request) {
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
    nodes: await store.listNodes()
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

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
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
        const relativePath =
          url.pathname === '/shell/' ? 'index.html' : decodeURIComponent(url.pathname.slice('/shell/'.length));
        const requestedPath = path.resolve(shellRoot, relativePath);
        if (!requestedPath.startsWith(shellRoot)) {
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
            'GET /api',
            'GET /shell/',
            'GET /console/',
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
            'POST /api/integrity/verify',
            'GET /api/ledger',
            'GET /api/ledger.ndjson',
            'GET /api/trust-passports',
            'GET /api/trust-passports/:identityId',
            'POST /api/trust-passports/:identityId/sign',
            'GET /api/identities',
            'POST /api/identities',
            'GET /api/identities/:identityId/contribution',
            'GET /api/worker-authorizations',
            'POST /api/worker-authorizations',
            'GET /api/worker-authorizations/:authorizationId',
            'POST /api/worker-authorizations/:authorizationId/verify',
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
          const orchestration = orchestrateIntent(body, consents, {
            execute: Boolean(body.execute),
            publicRecords
          });
          await store.saveDecision(orchestration.decision);
          await store.saveSkillPreflight(orchestration.skillPreflight);
          if (orchestration.execution) {
            await store.saveToolExecution(orchestration.execution);
          }
          await store.saveOrchestration(orchestration);
          jsonResponse(response, 201, { ok: true, orchestration });
          return;
        }
        return methodNotAllowed(response, ['GET', 'POST']);
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

  return server;
}
