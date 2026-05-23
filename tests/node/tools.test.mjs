import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { verifyReceiptIntegrity } from '../../src/phase1/integrity.mjs';
import {
  evaluateSkillPreflight,
  listSkills,
  readSkill,
  skillForTool,
  verifySkillManifestIntegrity
} from '../../src/phase1/skills.mjs';
import { executeToolAction, listTools } from '../../src/phase1/tools.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');
const cliPath = path.join(repoRoot, 'bin', 'bos.mjs');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('tool registry includes mocked IndiaStack adapters', () => {
  const tools = listTools().map((tool) => tool.toolId);
  assert.ok(tools.includes('uidai_offline_ekyc'));
  assert.ok(tools.includes('digilocker'));
  assert.ok(tools.includes('account_aggregator'));
  assert.ok(tools.includes('abha'));
  assert.ok(tools.includes('upi_escrow'));
});

test('skill registry maps L6 skills to policy-gated tools without raw PII', () => {
  const skills = listSkills();
  const toolIds = new Set(listTools().map((tool) => tool.toolId));

  assert.ok(skills.some((skill) => skill.skillId === 'bos:skill:digilocker-docrefs'));
  assert.ok(skills.every((skill) => skill.layer === 'L6'));
  assert.ok(skills.every((skill) => toolIds.has(skill.toolBinding.toolId)));
  assert.ok(skills.every((skill) => skill.permissions.rawPiiAllowed === false));
  assert.ok(skills.every((skill) => skill.developer.kycVerified === true));

  const skill = readSkill('bos:skill:account-aggregator-summary');
  assert.equal(skill.toolBinding.toolId, 'account_aggregator');
  assert.equal(skill.permissions.dataExposure, 'derived_financial_summary');
  assert.equal(skillForTool('digilocker').skillId, 'bos:skill:digilocker-docrefs');
});

test('skill manifests are versioned and tamper evident', () => {
  const skill = readSkill('bos:skill:digilocker-docrefs');
  const integrity = verifySkillManifestIntegrity(skill);

  assert.equal(skill.version, '0.1.0');
  assert.match(skill.manifestId, /^bos:skill-manifest:/);
  assert.match(skill.manifestHash, /^[a-f0-9]{64}$/);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.idValid, true);
  assert.equal(integrity.manifestHashValid, true);

  const tampered = {
    ...skill,
    permissions: {
      ...skill.permissions,
      rawPiiAllowed: true
    }
  };
  const tamperedIntegrity = verifySkillManifestIntegrity(tampered);
  assert.equal(tamperedIntegrity.valid, false);
  assert.equal(tamperedIntegrity.manifestHashValid, false);
  assert.ok(tamperedIntegrity.reasons.includes('raw PII must not be allowed in Phase 1 skills'));
});

test('skill preflight checks integrity, consent, and policy before execution', () => {
  const identity = createIdentity({ displayName: 'Skill preflight actor' });
  const blocked = evaluateSkillPreflight('bos:skill:digilocker-docrefs', { actorId: identity.id }, []);
  assert.equal(blocked.integrity.valid, true);
  assert.equal(blocked.approved, false);
  assert.ok(blocked.decision.checks.some((check) => check.policyId === 'policy.consent.required_for_regulated_action'));
  assert.equal(blocked.remediation.status, 'action_required');
  assert.equal(blocked.remediation.consentGrant.subjectId, identity.id);
  assert.deepEqual(blocked.remediation.consentGrant.scopes, ['consent.record', 'identity.verify', 'scheme.eligibility']);
  assert.equal(blocked.remediation.consentGrant.constraints.skillId, 'bos:skill:digilocker-docrefs');

  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
    purpose: 'Skill preflight'
  });
  const approved = evaluateSkillPreflight('bos:skill:digilocker-docrefs', { actorId: identity.id }, [consent]);
  assert.equal(approved.approved, true);
  assert.equal(approved.remediation.status, 'none');
  assert.match(approved.preflightId, /^bos:skill-preflight:/);
  assert.match(approved.auditHash, /^[a-f0-9]{64}$/);
  assert.equal(verifyReceiptIntegrity(approved).valid, true);
  assert.equal(approved.decision.request.tool, 'digilocker');
  assert.equal(approved.decision.request.metadata.skillId, 'bos:skill:digilocker-docrefs');
});

test('store persists skill preflight receipts and ledger evidence', async () => {
  const { store } = await freshStore('skills-preflight-store');
  const identity = createIdentity({ displayName: 'Stored skill preflight actor' });
  const preflight = evaluateSkillPreflight(
    'bos:skill:mesh-storage',
    {
      actorId: identity.id,
      piiHandling: 'none'
    },
    []
  );

  await store.saveDecision(preflight.decision);
  await store.saveSkillPreflight(preflight);

  assert.equal((await store.readSkillPreflight(preflight.preflightId)).preflightId, preflight.preflightId);
  assert.equal((await store.listSkillPreflights()).length, 1);
  const events = await store.listLedger({ type: 'skill_preflight.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].preflightId, preflight.preflightId);
  assert.equal(events[0].actorId, identity.id);
});

test('CLI lists and reads skill manifests', async () => {
  const { root } = await freshStore('skills-cli');

  const listed = spawnSync(process.execPath, [cliPath, 'skill', 'list', '--store', root], {
    encoding: 'utf8'
  });
  assert.equal(listed.status, 0, listed.stderr);
  const listOutput = JSON.parse(listed.stdout);
  assert.ok(listOutput.skills.some((skill) => skill.skillId === 'bos:skill:digilocker-docrefs'));

  const read = spawnSync(
    process.execPath,
    [cliPath, 'skill', 'read', '--id', 'bos:skill:digilocker-docrefs', '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(read.status, 0, read.stderr);
  const readOutput = JSON.parse(read.stdout);
  assert.equal(readOutput.skill.toolBinding.toolId, 'digilocker');
  assert.equal(readOutput.skill.permissions.rawPiiAllowed, false);
  assert.match(readOutput.skill.manifestHash, /^[a-f0-9]{64}$/);
});

test('CLI preflights skill manifests before execution', async () => {
  const { root, store } = await freshStore('skills-preflight-cli');
  const identity = createIdentity({ displayName: 'CLI skill preflight actor' });
  await store.saveIdentity(identity);
  await store.saveConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
      purpose: 'CLI skill preflight'
    })
  );

  const result = spawnSync(
    process.execPath,
    [cliPath, 'skill', 'preflight', '--id', 'bos:skill:digilocker-docrefs', '--actor-id', identity.id, '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.preflight.approved, true);
  assert.match(output.preflight.preflightId, /^bos:skill-preflight:/);
  assert.equal(output.preflight.integrity.valid, true);
  assert.equal(output.preflight.decision.request.tool, 'digilocker');
  assert.equal((await store.listSkillPreflights()).length, 1);

  const verified = spawnSync(
    process.execPath,
    [cliPath, 'integrity', 'verify', '--artifact', 'skill-preflight', '--id', output.preflight.preflightId, '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).integrity.valid, true);
});

test('CLI creates consent from blocked skill preflight remediation', async () => {
  const { root, store } = await freshStore('skills-preflight-grant-cli');
  const identity = createIdentity({ displayName: 'CLI remediation actor' });
  await store.saveIdentity(identity);

  const blocked = spawnSync(
    process.execPath,
    [cliPath, 'skill', 'preflight', '--id', 'bos:skill:digilocker-docrefs', '--actor-id', identity.id, '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(blocked.status, 0, blocked.stderr);
  const blockedOutput = JSON.parse(blocked.stdout);
  assert.equal(blockedOutput.preflight.approved, false);
  assert.equal(blockedOutput.preflight.remediation.status, 'action_required');

  const grant = spawnSync(
    process.execPath,
    [
      cliPath,
      'skill',
      'grant-consent',
      '--preflight-id',
      blockedOutput.preflight.preflightId,
      '--sign-with-identity-id',
      identity.id,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(grant.status, 0, grant.stderr);
  const grantOutput = JSON.parse(grant.stdout);
  assert.equal(grantOutput.consent.subjectId, identity.id);
  assert.equal(grantOutput.consent.constraints.skillId, 'bos:skill:digilocker-docrefs');
  assert.equal(grantOutput.consent.signatures.length, 1);
  assert.equal(grantOutput.lifecycle.status, 'active');
  assert.equal(grantOutput.integrity.valid, true);
  assert.equal(grantOutput.integrity.signatureValid, true);

  const retry = spawnSync(
    process.execPath,
    [
      cliPath,
      'skill',
      'retry-preflight',
      '--preflight-id',
      blockedOutput.preflight.preflightId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(retry.status, 0, retry.stderr);
  const retryOutput = JSON.parse(retry.stdout);
  assert.equal(retryOutput.sourcePreflightId, blockedOutput.preflight.preflightId);
  assert.equal(retryOutput.preflight.approved, true);
  assert.equal(
    retryOutput.preflight.decision.request.metadata.retryOfPreflightId,
    blockedOutput.preflight.preflightId
  );

  const executed = spawnSync(
    process.execPath,
    [
      cliPath,
      'skill',
      'execute-preflight',
      '--preflight-id',
      retryOutput.preflight.preflightId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(executed.status, 0, executed.stderr);
  const executedOutput = JSON.parse(executed.stdout);
  assert.equal(executedOutput.preflightId, retryOutput.preflight.preflightId);
  assert.equal(executedOutput.execution.status, 'completed');
  assert.equal(executedOutput.execution.skillPreflightId, retryOutput.preflight.preflightId);
  assert.equal(executedOutput.execution.toolReceipt.toolId, 'digilocker');
  assert.equal(executedOutput.integrity.artifactType, 'tool-execution');
  assert.equal(executedOutput.integrity.valid, true);

  const trace = spawnSync(
    process.execPath,
    [
      cliPath,
      'skill',
      'trace',
      '--preflight-id',
      blockedOutput.preflight.preflightId,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );
  assert.equal(trace.status, 0, trace.stderr);
  const traceOutput = JSON.parse(trace.stdout);
  assert.equal(traceOutput.trace.objectType, 'skill-invocation-trace');
  assert.match(traceOutput.trace.evidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(traceOutput.trace.privacy.rawPiiIncluded, false);
  assert.ok(traceOutput.trace.preflightIds.includes(retryOutput.preflight.preflightId));
  assert.ok(traceOutput.trace.executionIds.includes(executedOutput.execution.executionId));
  assert.ok(traceOutput.trace.consentIds.includes(grantOutput.consent.consentId));

  const approved = evaluateSkillPreflight('bos:skill:digilocker-docrefs', { actorId: identity.id }, await store.listConsents());
  assert.equal(approved.approved, true);
});

test('CLI verifies skill manifest integrity', async () => {
  const { root } = await freshStore('skills-integrity-cli');

  const verified = spawnSync(
    process.execPath,
    [cliPath, 'integrity', 'verify', '--artifact', 'skill', '--id', 'bos:skill:digilocker-docrefs', '--store', root],
    { encoding: 'utf8' }
  );
  assert.equal(verified.status, 0, verified.stderr);
  const output = JSON.parse(verified.stdout);
  assert.equal(output.integrity.artifactType, 'skill-manifest');
  assert.equal(output.integrity.valid, true);
  assert.equal(output.integrity.manifestHashValid, true);
});

test('tool execution is blocked when policy/consent fails', () => {
  const identity = createIdentity({ displayName: 'Blocked tool actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'regulated_onboarding',
      scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
      regulated: true,
      piiHandling: 'tokenized'
    },
    []
  );

  assert.equal(execution.status, 'blocked');
  assert.equal(execution.decision.approved, false);
  assert.equal(execution.toolReceipt, null);
});

test('approved regulated action executes Account Aggregator mock without raw transactions', () => {
  const identity = createIdentity({ displayName: 'AA actor' });
  const scopes = ['identity.verify', 'consent.record', 'regulated.workflow'];
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes,
    purpose: 'AA mock'
  });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'regulated_onboarding',
      scopes,
      regulated: true,
      piiHandling: 'tokenized'
    },
    [consent]
  );

  assert.equal(execution.status, 'completed');
  assert.equal(execution.decision.approved, true);
  assert.equal(execution.toolReceipt.toolId, 'account_aggregator');
  assert.equal(execution.toolReceipt.rawTransactionsReturned, false);
});

test('UPI escrow mock enforces user-visible monetary limit', () => {
  const identity = createIdentity({ displayName: 'UPI actor' });
  const scopes = ['labor.match', 'worker.notify', 'upi.escrow'];
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes,
    purpose: 'UPI escrow'
  });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'labor_match_post',
      tool: 'upi_escrow',
      scopes,
      regulated: true,
      piiHandling: 'tokenized',
      identity: { ageAttested: true, ageMinimum: 21 },
      labor: { days: 1, headcount: 1, wageFloorPerDay: 400, legalMinAge: 18 },
      money: { amount: 5000, currency: 'INR', limit: 1000, workerPays: false, escrow: true }
    },
    [consent]
  );

  assert.equal(execution.status, 'failed');
  assert.match(execution.error, /exceeds the declared user limit/);
});

test('store persists tool execution receipts', async () => {
  const { store } = await freshStore('tools-store');
  const identity = createIdentity({ displayName: 'Tool store actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'mesh_storage',
      scopes: ['mesh.store'],
      regulated: false,
      piiHandling: 'none'
    },
    []
  );

  await store.saveToolExecution(execution);
  assert.equal((await store.readToolExecution(execution.executionId)).executionId, execution.executionId);
  assert.equal((await store.listToolExecutions()).length, 1);
});

test('CLI executes a mocked tool and persists receipt', async () => {
  const { root, store } = await freshStore('tools-cli');
  const identity = createIdentity({ displayName: 'CLI tool actor' });
  await store.saveIdentity(identity);
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['scheme.eligibility', 'consent.record', 'identity.verify'],
    purpose: 'CLI DigiLocker tool'
  });
  await store.saveConsent(consent);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'tool',
      'execute',
      '--actor-id',
      identity.id,
      '--action-type',
      'scheme_delivery',
      '--tool',
      'digilocker',
      '--scopes',
      'scheme.eligibility,consent.record,identity.verify',
      '--regulated',
      '--pii-handling',
      'tokenized',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.preflight.preflightId, /^bos:skill-preflight:/);
  assert.equal(output.preflight.approved, true);
  assert.equal(output.execution.status, 'completed');
  assert.equal(output.execution.skillPreflightId, output.preflight.preflightId);
  assert.equal(output.execution.toolReceipt.toolId, 'digilocker');
  assert.equal((await store.listSkillPreflights()).length, 1);
  assert.equal((await store.listToolExecutions()).length, 1);
});
