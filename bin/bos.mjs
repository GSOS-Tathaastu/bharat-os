#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createEncryptedObject,
  createIdentity,
  createNode,
  publicIdentity,
  readEncryptedObject
} from '../src/phase0/core.mjs';
import { renderBootstrapMarkdown, simulateDemandBootstrap } from '../src/phase0/simulate.mjs';
import { BosStore } from '../src/phase0/store.mjs';
import {
  consentLifecycle,
  consentSummary,
  createConsent,
  evaluateDecision,
  ACTION_TEMPLATES,
  listPolicies,
  revokeConsent
} from '../src/phase1/policy.mjs';
import { createBlockedToolExecution, executeToolAction, listTools, SERVICE_VERTICALS } from '../src/phase1/tools.mjs';
import { listOrchestrationTemplates, orchestrateIntent } from '../src/phase1/orchestrator.mjs';
import {
  listSupportedLanguages,
  localizeResponse,
  normalizeIntent
} from '../src/phase1/vernacular.mjs';
import {
  createMemoryRecord,
  memoryProvenance,
  memorySummary,
  readMemoryRecordWithConsent,
  searchMemoryRecords
} from '../src/phase1/memory.mjs';
import {
  evaluateSkillPreflight,
  listSkills,
  readSkill,
  skillForTool,
  verifySkillManifestIntegrity
} from '../src/phase1/skills.mjs';
import { createSkillInvocationTrace } from '../src/phase1/skill-trace.mjs';
import {
  publicRecordsFromIdentities,
  signConsent,
  signConsentRevocation,
  verifyArtifactIntegrity
} from '../src/phase1/integrity.mjs';
import {
  createWorkerAuthorization,
  signWorkerAuthorization,
  verifyWorkerAuthorization
} from '../src/phase1/worker-authorization.mjs';
import {
  createFlagReport,
  flagSummaryForSubject,
  resolveFlagReport,
  signFlagReport
} from '../src/phase1/flag-report.mjs';
import {
  createPairingPayload,
  generateRecoveryPhrase,
  verifyPairingPayload,
  verifyRecoveryPhrase
} from '../src/phase1/device-pairing.mjs';

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { positionals, options };
}

function asBoolean(value) {
  if (value === true) return true;
  if (value === false || value === undefined) return false;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

function asInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${name} must be an integer.`);
  }
  return parsed;
}

function asNumber(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number.`);
  }
  return parsed;
}

function toolIdFromActionRequest(request) {
  return request.tool ?? ACTION_TEMPLATES[request.actionType]?.defaultTool;
}

function usage() {
  return {
    commands: [
      'init [--store .bharat-os]',
      'identity create --name NAME [--store .bharat-os]',
      'identity list [--store .bharat-os]',
      'node register --operator-id ID --storage-bytes BYTES [--kyc] [--store .bharat-os]',
      'object put --identity-id ID --file PATH [--content-type TYPE] [--chunk-size BYTES] [--store .bharat-os]',
      'object get --identity-id ID --manifest-id ID --out PATH [--store .bharat-os]',
      'simulate bootstrap [--nodes 1000] [--objects 100] [--avg-object-bytes 65536] [--store .bharat-os] [--report-out report.md]',
      'policy list [--store .bharat-os]',
      'skill list [--store .bharat-os]',
      'skill read --id SKILL_ID [--store .bharat-os]',
      'skill preflight --id SKILL_ID --actor-id ID [--scopes a,b] [--store .bharat-os]',
      'skill grant-consent --preflight-id ID [--sign-with-identity-id ID] [--store .bharat-os]',
      'skill retry-preflight --preflight-id ID [--store .bharat-os]',
      'skill execute-preflight --preflight-id ID [--store .bharat-os]',
      'skill trace --preflight-id ID [--store .bharat-os]',
      'tool list [--store .bharat-os]',
      'tool execute --actor-id ID --action-type ACTION [--tool TOOL] [--scopes a,b] [--regulated] [--store .bharat-os]',
      'intent templates [--store .bharat-os]',
      'intent orchestrate --actor-id ID --intent TEXT [--action-type ACTION] [--execute] [--store .bharat-os]',
      'consent list [--store .bharat-os]',
      'consent create --subject-id ID --grantee-id ID --scopes a,b --purpose TEXT [--ttl-days 30] [--expires-at ISO] [--sign-with-identity-id ID] [--store .bharat-os]',
      'consent revoke --id ID [--reason TEXT] [--sign-with-identity-id ID] [--store .bharat-os]',
      'decision evaluate --actor-id ID --action-type ACTION [--scopes a,b] [--regulated] [--pii-handling tokenized] [--store .bharat-os]',
      'memory put --identity-id ID --label LABEL (--text TEXT | --file PATH) [--scopes memory.read,consent.record] [--store .bharat-os]',
      'memory list [--identity-id ID] [--store .bharat-os]',
      'memory search [--identity-id ID] [--query TEXT] [--tags a,b] [--scopes a,b] [--limit 20] [--store .bharat-os]',
      'memory provenance --record-id ID [--store .bharat-os]',
      'memory read --identity-id ID --record-id ID [--grantee-id ID] [--store .bharat-os]',
      'ledger list [--limit 100] [--type EVENT_TYPE] [--store .bharat-os]',
      'integrity verify --artifact consent|decision|tool-execution|orchestration|skill-preflight|skill --id ID [--store .bharat-os]',
      'contribution show --identity-id ID [--store .bharat-os]',
      'worker-auth create --worker-id ID --operator-id ID --job-reference REF --scopes a,b --purpose TEXT [--ttl-days 1] [--sign-with-identity-id ID] [--store .bharat-os]',
      'worker-auth list [--store .bharat-os]',
      'worker-auth verify --id ID [--store .bharat-os]',
      `service book --actor-id ID --vertical ${SERVICE_VERTICALS.join('|')} [--from FROM] [--to TO] [--amount N] [--currency INR] [--limit N] [--include-ondc-bridge true|false] [--store .bharat-os]`,
      'vernacular normalize --intent "TEXT" [--locale en-IN] [--store .bharat-os]',
      'vernacular languages [--store .bharat-os]',
      'device recovery-phrase --identity-id ID [--store .bharat-os]',
      'device verify-phrase --identity-id ID --phrase "twelve words" [--store .bharat-os]',
      'device pair --identity-id ID [--ttl-seconds 300] [--store .bharat-os]',
      'flag create --reporter-id ID --subject-id ID --category advance_fee|wage_non_payment|unsafe_conditions|underage_worker|no_show|fraud|exploitation|abuse|other [--severity low|medium|high] [--job-reference REF] --summary "TEXT" [--sign-with-identity-id ID] [--store .bharat-os]',
      'flag list [--subject-id ID] [--status pending|under_review|resolved|dismissed] [--store .bharat-os]',
      'flag summary --subject-id ID [--store .bharat-os]',
      'flag resolve --id ID --status resolved|dismissed|under_review --reason "TEXT" --resolved-by ID [--store .bharat-os]'
    ]
  };
}

async function readIntegrityArtifact(store, artifactType, artifactId) {
  if (!artifactType) throw new Error('--artifact is required.');
  if (!artifactId) throw new Error('--id is required.');

  if (artifactType === 'consent') return store.readConsent(artifactId);
  if (artifactType === 'decision') return store.readDecision(artifactId);
  if (artifactType === 'tool-execution') return store.readToolExecution(artifactId);
  if (artifactType === 'orchestration') return store.readOrchestration(artifactId);
  if (artifactType === 'skill-preflight') return store.readSkillPreflight(artifactId);
  if (artifactType === 'skill') return readSkill(artifactId);

  throw new Error(`Unsupported integrity artifact type: ${artifactType}.`);
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [command, subcommand] = positionals;
  const storePath = path.resolve(options.store ?? '.bharat-os');
  const store = new BosStore(storePath);

  if (!command || command === 'help' || command === '--help') {
    print(usage());
    return;
  }

  if (command === 'init') {
    await store.init();
    print({ ok: true, store: storePath });
    return;
  }

  if (command === 'identity' && subcommand === 'create') {
    if (!options.name) throw new Error('--name is required.');
    const identity = createIdentity({ displayName: options.name });
    await store.saveIdentity(identity);
    print({ ok: true, identity: publicIdentity(identity) });
    return;
  }

  if (command === 'identity' && subcommand === 'list') {
    const identities = await store.listIdentities();
    print({ identities: identities.map(publicIdentity) });
    return;
  }

  if (command === 'node' && subcommand === 'register') {
    if (!options['operator-id']) throw new Error('--operator-id is required.');
    const storageBytes = Number(options['storage-bytes']);
    if (!Number.isInteger(storageBytes)) throw new Error('--storage-bytes must be an integer.');
    const node = createNode({
      operatorId: options['operator-id'],
      storageBytes,
      kycVerified: asBoolean(options.kyc),
      charging: !asBoolean(options['not-charging']),
      wifi: !asBoolean(options['no-wifi']),
      batteryPercent: Number(options.battery ?? 100),
      trustScore: Number(options.trust ?? 50)
    });
    await store.saveNode(node);
    print({ ok: true, node });
    return;
  }

  if (command === 'object' && subcommand === 'put') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    if (!options.file) throw new Error('--file is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const bytes = await fs.readFile(path.resolve(options.file));
    const bundle = createEncryptedObject(identity, bytes, {
      contentType: options['content-type'] ?? 'application/octet-stream',
      chunkSizeBytes: Number(options['chunk-size'] ?? 262144)
    });
    await store.saveBundle(bundle);
    print({
      ok: true,
      manifestId: bundle.manifest.manifestId,
      chunks: bundle.manifest.chunks.length,
      plaintextBytes: bundle.manifest.plaintextBytes
    });
    return;
  }

  if (command === 'object' && subcommand === 'get') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    if (!options['manifest-id']) throw new Error('--manifest-id is required.');
    if (!options.out) throw new Error('--out is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const bundle = await store.readBundle(options['manifest-id']);
    const plaintext = readEncryptedObject(identity, bundle);
    await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await fs.writeFile(path.resolve(options.out), plaintext);
    print({ ok: true, out: path.resolve(options.out), bytes: plaintext.length });
    return;
  }

  if (command === 'simulate' && subcommand === 'bootstrap') {
    const simulation = simulateDemandBootstrap({
      seed: options.seed ?? 'bharat-os-phase0',
      nodeCount: asInteger(options.nodes, 1000, 'nodes'),
      objectCount: asInteger(options.objects, 100, 'objects'),
      averageObjectBytes: asInteger(options['avg-object-bytes'], 64 * 1024, 'avg-object-bytes'),
      objectJitter: asNumber(options.jitter, 0.35, 'jitter'),
      chunkSizeBytes: asInteger(options['chunk-size'], 16 * 1024, 'chunk-size'),
      replicationFactor: asInteger(options.replication, 3, 'replication'),
      batteryThreshold: asInteger(options['battery-threshold'], 40, 'battery-threshold'),
      requireKyc: !asBoolean(options['no-kyc'])
    });

    await store.saveIdentity(simulation.owner);
    await store.saveControlPlane(simulation.controlPlane, 'bootstrap');
    await store.saveSimulationReport(simulation.report);

    let markdownReportPath = null;
    if (options['report-out']) {
      markdownReportPath = path.resolve(options['report-out']);
      await fs.mkdir(path.dirname(markdownReportPath), { recursive: true });
      await fs.writeFile(markdownReportPath, renderBootstrapMarkdown(simulation.report), 'utf8');
    }

    print({
      ok: true,
      reportId: simulation.report.reportId,
      controlPlaneId: 'bootstrap',
      store: storePath,
      markdownReportPath,
      summary: simulation.report.results
    });
    return;
  }

  if (command === 'policy' && subcommand === 'list') {
    print({ policies: listPolicies() });
    return;
  }

  if (command === 'skill' && subcommand === 'list') {
    print({ skills: listSkills() });
    return;
  }

  if (command === 'skill' && subcommand === 'read') {
    if (!options.id) throw new Error('--id is required.');
    print({ skill: readSkill(options.id) });
    return;
  }

  if (command === 'skill' && subcommand === 'preflight') {
    if (!options.id) throw new Error('--id is required.');
    if (!options['actor-id']) throw new Error('--actor-id is required.');
    const consents = await store.listConsents();
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    const preflight = evaluateSkillPreflight(
      options.id,
      {
        actorId: options['actor-id'],
        granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator',
        scopes: options.scopes,
        piiHandling: options['pii-handling'] ?? 'tokenized',
        identity: {
          aadhaarRequired: asBoolean(options['aadhaar-required']),
          fallbackAvailable: !asBoolean(options['no-fallback'])
        },
        money: {
          amount: asNumber(options.amount, 0, 'amount'),
          currency: options.currency ?? 'INR',
          limit: options.limit === undefined ? undefined : asNumber(options.limit, undefined, 'limit'),
          workerPays: asBoolean(options['worker-pays'])
        }
      },
      consents,
      { publicRecords }
    );
    await store.saveDecision(preflight.decision);
    await store.saveSkillPreflight(preflight);
    print({
      ok: true,
      preflight
    });
    return;
  }

  if (command === 'skill' && subcommand === 'grant-consent') {
    if (!options['preflight-id']) throw new Error('--preflight-id is required.');
    const preflight = await store.readSkillPreflight(options['preflight-id']);
    const grant = preflight.remediation?.consentGrant;
    if (!grant) {
      throw new Error('Stored preflight does not include a consent grant remediation template.');
    }
    let consent = createConsent({
      subjectId: grant.subjectId,
      granteeId: grant.granteeId,
      scopes: grant.scopes,
      purpose: options.purpose ?? grant.purpose,
      ttlDays: asInteger(options['ttl-days'], 30, 'ttl-days'),
      expiresAt: options['expires-at'],
      constraints: grant.constraints
    });
    if (options['sign-with-identity-id']) {
      const signer = await store.readIdentity(options['sign-with-identity-id']);
      consent = signConsent(consent, signer, { role: options['sign-role'] ?? 'subject' });
    }
    await store.saveConsent(consent);
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    print({
      ok: true,
      preflightId: preflight.preflightId,
      consent,
      lifecycle: consentLifecycle(consent),
      integrity: verifyArtifactIntegrity(consent, publicRecords)
    });
    return;
  }

  if (command === 'skill' && subcommand === 'retry-preflight') {
    if (!options['preflight-id']) throw new Error('--preflight-id is required.');
    const sourcePreflight = await store.readSkillPreflight(options['preflight-id']);
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
    print({ ok: true, sourcePreflightId: sourcePreflight.preflightId, preflight: retry });
    return;
  }

  if (command === 'skill' && subcommand === 'execute-preflight') {
    if (!options['preflight-id']) throw new Error('--preflight-id is required.');
    const preflight = await store.readSkillPreflight(options['preflight-id']);
    if (!preflight.approved) {
      throw new Error('Stored preflight must be approved before execution.');
    }
    const consents = await store.listConsents();
    const execution = executeToolAction(preflight.decision.request, consents, {
      skillPreflightId: preflight.preflightId
    });
    await store.saveDecision(execution.decision);
    await store.saveToolExecution(execution);
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    print({
      ok: execution.status === 'completed',
      preflightId: preflight.preflightId,
      execution,
      integrity: verifyArtifactIntegrity(execution, publicRecords)
    });
    return;
  }

  if (command === 'skill' && subcommand === 'trace') {
    if (!options['preflight-id']) throw new Error('--preflight-id is required.');
    const preflight = await store.readSkillPreflight(options['preflight-id']);
    print({
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

  if (command === 'tool' && subcommand === 'list') {
    print({ tools: listTools() });
    return;
  }

  if (command === 'consent' && subcommand === 'list') {
    const consents = await store.listConsents();
    print({ consents: consents.map((consent) => consentSummary(consent)) });
    return;
  }

  if (command === 'consent' && subcommand === 'create') {
    let consent = createConsent({
      subjectId: options['subject-id'],
      granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator',
      scopes: options.scopes ?? '',
      purpose: options.purpose,
      ttlDays: asInteger(options['ttl-days'], 30, 'ttl-days'),
      expiresAt: options['expires-at']
    });
    if (options['sign-with-identity-id']) {
      const signer = await store.readIdentity(options['sign-with-identity-id']);
      consent = signConsent(consent, signer, { role: options['sign-role'] ?? 'subject' });
    }
    await store.saveConsent(consent);
    print({ ok: true, consent });
    return;
  }

  if (command === 'consent' && subcommand === 'revoke') {
    if (!options.id) throw new Error('--id is required.');
    const consent = await store.readConsent(options.id);
    let revoked = revokeConsent(consent, {
      reason: options.reason ?? 'revoked_by_operator',
      revokedBy: options['sign-with-identity-id'] ?? options['revoked-by'] ?? consent.subjectId
    });
    if (options['sign-with-identity-id']) {
      const signer = await store.readIdentity(options['sign-with-identity-id']);
      revoked = signConsentRevocation(revoked, signer, { role: options['sign-role'] ?? 'revoker' });
    }
    await store.saveConsent(revoked);
    print({ ok: true, consent: revoked, lifecycle: consentLifecycle(revoked) });
    return;
  }

  if (command === 'decision' && subcommand === 'evaluate') {
    const consents = await store.listConsents();
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    const decision = evaluateDecision(
      {
        actorId: options['actor-id'],
        granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator',
        actionType: options['action-type'],
        tool: options.tool,
        scopes: options.scopes,
        regulated: asBoolean(options.regulated),
        piiHandling: options['pii-handling'] ?? 'tokenized',
        identity: {
          aadhaarRequired: asBoolean(options['aadhaar-required']),
          fallbackAvailable: !asBoolean(options['no-fallback']),
          fallbackType: options['fallback-type'] ?? 'pan_or_digilocker'
        },
        money: {
          amount: asNumber(options.amount, 0, 'amount'),
          currency: options.currency ?? 'INR',
          limit: options.limit === undefined ? undefined : asNumber(options.limit, undefined, 'limit'),
          workerPays: asBoolean(options['worker-pays'])
        }
      },
      consents,
      { publicRecords }
    );
    await store.saveDecision(decision);
    print({ ok: true, decision });
    return;
  }

  if (command === 'tool' && subcommand === 'execute') {
    const consents = await store.listConsents();
    const requestPayload = {
      actorId: options['actor-id'],
      granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator',
      actionType: options['action-type'],
      tool: options.tool,
      scopes: options.scopes,
      regulated: asBoolean(options.regulated),
      piiHandling: options['pii-handling'] ?? 'tokenized',
      identity: {
        aadhaarRequired: asBoolean(options['aadhaar-required']),
        fallbackAvailable: !asBoolean(options['no-fallback']),
        fallbackType: options['fallback-type'] ?? 'pan_or_digilocker'
      },
      money: {
        amount: asNumber(options.amount, 0, 'amount'),
        currency: options.currency ?? 'INR',
        limit: options.limit === undefined ? undefined : asNumber(options.limit, undefined, 'limit'),
        workerPays: asBoolean(options['worker-pays'])
      },
      metadata: {
        documents: options.documents ? String(options.documents).split(',') : undefined,
        storageClass: options['storage-class']
      }
    };
    const skill = skillForTool(toolIdFromActionRequest(requestPayload));
    const preflight = evaluateSkillPreflight(skill.skillId, requestPayload, consents);
    const execution = preflight.approved
      ? executeToolAction(preflight.decision.request, consents, {
          at: preflight.checkedAt,
          skillPreflightId: preflight.preflightId
        })
      : createBlockedToolExecution(preflight.decision, {
          skillPreflightId: preflight.preflightId
        });
    await store.saveDecision(preflight.decision);
    await store.saveSkillPreflight(preflight);
    await store.saveToolExecution(execution);
    print({ ok: execution.status === 'completed', preflight, execution });
    return;
  }

  if (command === 'intent' && subcommand === 'templates') {
    print({ templates: listOrchestrationTemplates() });
    return;
  }

  if (command === 'intent' && subcommand === 'orchestrate') {
    const consents = await store.listConsents();
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    const orchestration = orchestrateIntent(
      {
        actorId: options['actor-id'],
        granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator',
        intentText: options.intent ?? '',
        actionType: options['action-type'],
        tool: options.tool,
        scopes: options.scopes,
        regulated: options.regulated === undefined ? undefined : asBoolean(options.regulated),
        piiHandling: options['pii-handling'],
        locale: options.locale ?? 'en-IN',
        channel: options.channel ?? 'text',
        identity: {
          aadhaarRequired: asBoolean(options['aadhaar-required']),
          fallbackAvailable: !asBoolean(options['no-fallback'])
        },
        money: {
          amount: asNumber(options.amount, 0, 'amount'),
          currency: options.currency ?? 'INR',
          limit: options.limit === undefined ? undefined : asNumber(options.limit, undefined, 'limit'),
          workerPays: asBoolean(options['worker-pays'])
        }
      },
      consents,
      { execute: asBoolean(options.execute), publicRecords }
    );
    await store.saveDecision(orchestration.decision);
    await store.saveSkillPreflight(orchestration.skillPreflight);
    if (orchestration.execution) {
      await store.saveToolExecution(orchestration.execution);
    }
    await store.saveOrchestration(orchestration);
    print({ ok: true, orchestration });
    return;
  }

  if (command === 'memory' && subcommand === 'put') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    if (!options.label) throw new Error('--label is required.');
    if (!options.text && !options.file) throw new Error('--text or --file is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const plaintext = options.file ? await fs.readFile(path.resolve(options.file)) : options.text;
    const { record, bundle } = createMemoryRecord(identity, plaintext, {
      label: options.label,
      contentType: options['content-type'] ?? (options.file ? 'application/octet-stream' : 'text/plain; charset=utf-8'),
      scopes: options.scopes ?? 'memory.read,consent.record',
      source: {
        type: options['source-type'] ?? (options.file ? 'file' : 'user_supplied'),
        ref: options.file ? path.basename(options.file) : options['source-ref']
      },
      tags: options.tags ?? ''
    });
    await store.saveBundle(bundle);
    await store.saveMemoryRecord(record);
    print({ ok: true, memory: memorySummary(record) });
    return;
  }

  if (command === 'memory' && subcommand === 'list') {
    const records = await store.listMemoryRecords();
    const filtered = options['identity-id']
      ? records.filter((record) => record.ownerId === options['identity-id'])
      : records;
    print({ memory: filtered.map(memorySummary) });
    return;
  }

  if (command === 'memory' && subcommand === 'search') {
    const records = await store.listMemoryRecords();
    print({
      memory: searchMemoryRecords(records, {
        ownerId: options['identity-id'],
        query: options.query,
        tags: options.tags,
        scopes: options.scopes,
        limit: asInteger(options.limit, 20, 'limit')
      })
    });
    return;
  }

  if (command === 'memory' && subcommand === 'provenance') {
    if (!options['record-id']) throw new Error('--record-id is required.');
    const record = await store.readMemoryRecord(options['record-id']);
    print({ provenance: memoryProvenance(record) });
    return;
  }

  if (command === 'memory' && subcommand === 'read') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    if (!options['record-id']) throw new Error('--record-id is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const record = await store.readMemoryRecord(options['record-id']);
    const bundle = await store.readBundle(record.manifestId);
    const consents = await store.listConsents();
    const result = readMemoryRecordWithConsent(identity, record, bundle, consents, {
      granteeId: options['grantee-id'] ?? 'bharat-os-orchestrator'
    });
    await store.saveDecision(result.decision);
    print({
      ok: result.approved,
      approved: result.approved,
      decision: result.decision,
      memory: memorySummary(record),
      plaintext: result.plaintext
    });
    return;
  }

  if (command === 'integrity' && subcommand === 'verify') {
    const artifact = await readIntegrityArtifact(store, options.artifact, options.id);
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    const integrity = artifact.objectType === 'skill-manifest'
      ? verifySkillManifestIntegrity(artifact)
      : verifyArtifactIntegrity(artifact, publicRecords);
    print({ ok: true, integrity });
    return;
  }

  if (command === 'ledger' && subcommand === 'list') {
    print({
      events: await store.listLedger({
        limit: asInteger(options.limit, 100, 'limit'),
        type: options.type
      })
    });
    return;
  }

  if (command === 'contribution' && subcommand === 'show') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    const contribution = await store.computeContribution(options['identity-id']);
    print({ contribution });
    return;
  }

  if (command === 'worker-auth' && subcommand === 'create') {
    if (!options['worker-id']) throw new Error('--worker-id is required.');
    if (!options['operator-id']) throw new Error('--operator-id is required.');
    if (!options['job-reference']) throw new Error('--job-reference is required.');
    if (!options.scopes) throw new Error('--scopes is required.');
    if (!options.purpose) throw new Error('--purpose is required.');
    const scopes = String(options.scopes)
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    let auth = createWorkerAuthorization({
      workerId: options['worker-id'],
      operatorId: options['operator-id'],
      jobReference: options['job-reference'],
      scopes,
      purpose: options.purpose,
      ttlDays: asInteger(options['ttl-days'], 1, 'ttl-days')
    });
    if (options['sign-with-identity-id']) {
      const signer = await store.readIdentity(options['sign-with-identity-id']);
      auth = signWorkerAuthorization(auth, signer);
    }
    await store.saveWorkerAuthorization(auth);
    print({ ok: true, authorization: auth });
    return;
  }

  if (command === 'worker-auth' && subcommand === 'list') {
    print({ authorizations: await store.listWorkerAuthorizations() });
    return;
  }

  if (command === 'worker-auth' && subcommand === 'verify') {
    if (!options.id) throw new Error('--id is required.');
    const auth = await store.readWorkerAuthorization(options.id);
    const publicRecord = await store
      .readIdentity(auth.workerId)
      .catch(() => null)
      .then((identity) => (identity ? publicIdentity(identity) : null));
    const result = verifyWorkerAuthorization(auth, publicRecord);
    print({ ok: result.valid, verification: result });
    return;
  }

  if (command === 'service' && subcommand === 'book') {
    if (!options['actor-id']) throw new Error('--actor-id is required.');
    if (!options.vertical) throw new Error('--vertical is required.');
    if (!SERVICE_VERTICALS.includes(options.vertical)) {
      throw new Error(`--vertical must be one of: ${SERVICE_VERTICALS.join(', ')}`);
    }
    const consents = await store.listConsents();
    const publicRecords = publicRecordsFromIdentities(await store.listIdentities());
    const amount = asNumber(options.amount, 0, 'amount');
    const includeOndcBridge =
      options['include-ondc-bridge'] === undefined
        ? true
        : asBoolean(options['include-ondc-bridge']);
    const execution = executeToolAction(
      {
        actorId: options['actor-id'],
        actionType: 'service_booking',
        tool: 'bharat_marketplace',
        scopes: ['service.book', 'consent.record', 'upi.settle'],
        regulated: true,
        piiHandling: 'tokenized',
        money: {
          amount,
          currency: options.currency ?? 'INR',
          limit: options.limit === undefined ? Math.max(amount, 1) : asNumber(options.limit, undefined, 'limit')
        },
        metadata: {
          vertical: options.vertical,
          from: options.from ?? null,
          to: options.to ?? null,
          includeOndcBridge
        }
      },
      consents,
      { publicRecords }
    );
    await store.saveDecision(execution.decision);
    await store.saveToolExecution(execution);
    print({ ok: execution.status === 'completed', execution });
    return;
  }

  if (command === 'vernacular' && subcommand === 'normalize') {
    if (!options.intent) throw new Error('--intent is required.');
    const normalized = normalizeIntent(options.intent, { locale: options.locale ?? 'en-IN' });
    const localized = localizeResponse(
      normalized.matchedAliases[0]?.actionType ?? null,
      'planned',
      normalized.detectedLocale
    );
    print({ normalized, localized });
    return;
  }

  if (command === 'vernacular' && subcommand === 'languages') {
    print({ languages: listSupportedLanguages() });
    return;
  }

  if (command === 'device' && subcommand === 'recovery-phrase') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    const identity = await store.readIdentity(options['identity-id']);
    print({ recovery: generateRecoveryPhrase(identity) });
    return;
  }

  if (command === 'device' && subcommand === 'verify-phrase') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    if (!options.phrase) throw new Error('--phrase is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const result = verifyRecoveryPhrase(identity, options.phrase);
    print({ ok: result.valid, ...result });
    return;
  }

  if (command === 'device' && subcommand === 'pair') {
    if (!options['identity-id']) throw new Error('--identity-id is required.');
    const identity = await store.readIdentity(options['identity-id']);
    const payload = createPairingPayload(identity, {
      ttlSeconds: asInteger(options['ttl-seconds'], 300, 'ttl-seconds')
    });
    print({
      pairing: payload,
      verification: verifyPairingPayload(payload, identity)
    });
    return;
  }

  if (command === 'flag' && subcommand === 'create') {
    if (!options['reporter-id']) throw new Error('--reporter-id is required.');
    if (!options['subject-id']) throw new Error('--subject-id is required.');
    if (!options.category) throw new Error('--category is required.');
    if (!options.summary) throw new Error('--summary is required.');
    let report = createFlagReport({
      reporterId: options['reporter-id'],
      subjectActorId: options['subject-id'],
      category: options.category,
      severity: options.severity ?? 'medium',
      jobReference: options['job-reference'],
      summary: options.summary
    });
    if (options['sign-with-identity-id']) {
      const signer = await store.readIdentity(options['sign-with-identity-id']);
      report = signFlagReport(report, signer);
    }
    await store.saveFlagReport(report);
    print({ ok: true, flag: report });
    return;
  }

  if (command === 'flag' && subcommand === 'list') {
    let flags = await store.listFlagReports();
    if (options['subject-id']) {
      flags = flags.filter((flag) => flag.subjectActorId === options['subject-id']);
    }
    if (options.status) {
      flags = flags.filter((flag) => flag.status === options.status);
    }
    print({ flags });
    return;
  }

  if (command === 'flag' && subcommand === 'summary') {
    if (!options['subject-id']) throw new Error('--subject-id is required.');
    const flags = await store.listFlagReports();
    print({ summary: flagSummaryForSubject(options['subject-id'], flags) });
    return;
  }

  if (command === 'flag' && subcommand === 'resolve') {
    if (!options.id) throw new Error('--id is required.');
    if (!options.status) throw new Error('--status is required.');
    if (!options.reason) throw new Error('--reason is required.');
    if (!options['resolved-by']) throw new Error('--resolved-by is required.');
    const existing = await store.readFlagReport(options.id);
    const resolved = resolveFlagReport(existing, {
      status: options.status,
      reason: options.reason,
      resolvedBy: options['resolved-by']
    });
    await store.saveFlagReport(resolved);
    print({ ok: true, flag: resolved });
    return;
  }

  throw new Error(`Unknown command: ${positionals.join(' ')}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
