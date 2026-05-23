import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  buildActionRequest,
  inferActionType,
  listOrchestrationTemplates,
  normalizeIntent,
  orchestrateIntent
} from '../../src/phase1/orchestrator.mjs';

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

test('orchestrator infers action type from plain-language intent', () => {
  assert.equal(inferActionType('Show me my diabetes records'), 'health_record_read');
  assert.equal(inferActionType('Which government scheme am I eligible for?'), 'scheme_delivery');
  assert.equal(inferActionType('I need 100 laborers near Varanasi'), 'labor_match_post');
  assert.equal(inferActionType('Open a bank current account'), 'regulated_onboarding');
});

test('orchestrator normalizes first Hindi and Hinglish regulated intents', () => {
  assert.equal(inferActionType('Mujhe sarkari yojana ke labh chahiye'), 'scheme_delivery');
  assert.equal(inferActionType('मुझे सरकारी योजना के लाभ चाहिए'), 'scheme_delivery');
  assert.equal(inferActionType('Mera bank khata kholna hai', { locale: 'hi-Latn-IN' }), 'regulated_onboarding');
  assert.equal(inferActionType('Varanasi mein mazdoor chahiye'), 'labor_match_post');

  const normalized = normalizeIntent('Mujhe sarkari yojana ke labh chahiye');
  assert.equal(normalized.detectedLocale, 'hi-Latn-IN');
  assert.equal(normalized.matchedAliases[0].actionType, 'scheme_delivery');
  assert.match(normalized.normalizedText, /scheme/);
});

test('orchestrator builds action requests from templates', () => {
  const request = buildActionRequest({
    actorId: 'bos:person:test',
    intentText: 'Which government scheme am I eligible for?'
  });

  assert.equal(request.actionType, 'scheme_delivery');
  assert.equal(request.tool, 'digilocker');
  assert.equal(request.skillId, 'bos:skill:digilocker-docrefs');
  assert.match(request.skillManifestId, /^bos:skill-manifest:/);
  assert.equal(request.regulated, true);
  assert.deepEqual(request.scopes, ['identity.verify', 'scheme.eligibility', 'consent.record']);
});

test('orchestrator carries vernacular normalization evidence into action metadata', () => {
  const request = buildActionRequest({
    actorId: 'bos:person:test',
    intentText: 'Mujhe sarkari yojana ke labh chahiye'
  });

  assert.equal(request.actionType, 'scheme_delivery');
  assert.equal(request.metadata.detectedLocale, 'hi-Latn-IN');
  assert.equal(request.metadata.matchedAliases[0].actionType, 'scheme_delivery');
  assert.match(request.metadata.normalizedText, /benefit/);
  assert.equal(request.metadata.skillName, 'DigiLocker Document References');
});

test('orchestrator blocks regulated intent without consent', () => {
  const identity = createIdentity({ displayName: 'Blocked orchestration actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Open a current account for my exports business'
    },
    []
  );

  assert.equal(orchestration.approved, false);
  assert.equal(orchestration.status, 'blocked');
  assert.match(orchestration.skillPreflightId, /^bos:skill-preflight:/);
  assert.equal(orchestration.skillPreflight.approved, false);
  assert.ok(orchestration.failedPolicies.includes('policy.consent.required_for_regulated_action'));
});

test('orchestrator does not execute tools when skill preflight blocks', () => {
  const identity = createIdentity({ displayName: 'Preflight blocked orchestration actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Which government scheme am I eligible for?'
    },
    [],
    { execute: true }
  );

  assert.equal(orchestration.skillPreflight.approved, false);
  assert.equal(orchestration.status, 'blocked');
  assert.equal(orchestration.executed, false);
  assert.equal(orchestration.execution, null);
  assert.ok(orchestration.plan.some((step) => step.step === 'skill_preflight' && step.status === 'blocked'));
});

test('orchestrator executes approved intent through selected tool', () => {
  const identity = createIdentity({ displayName: 'Approved orchestration actor' });
  const scopes = ['identity.verify', 'scheme.eligibility', 'consent.record'];
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes,
    purpose: 'Scheme orchestration'
  });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Which government scheme am I eligible for?',
      actionType: 'scheme_delivery'
    },
    [consent],
    { execute: true }
  );

  assert.equal(orchestration.approved, true);
  assert.equal(orchestration.status, 'completed');
  assert.equal(orchestration.executed, true);
  assert.equal(orchestration.actionRequest.skillId, 'bos:skill:digilocker-docrefs');
  assert.ok(orchestration.plan.some((step) => step.step === 'skill_selected' && step.layer === 'L6'));
  assert.ok(orchestration.plan.some((step) => step.step === 'skill_preflight' && step.status === 'passed'));
  assert.match(orchestration.skillPreflightId, /^bos:skill-preflight:/);
  assert.equal(orchestration.skillPreflight.approved, true);
  assert.equal(orchestration.decisionId, orchestration.skillPreflight.decisionId);
  assert.equal(orchestration.execution.skillPreflightId, orchestration.skillPreflightId);
  assert.equal(orchestration.execution.toolReceipt.toolId, 'digilocker');
});

test('store persists orchestration receipts', async () => {
  const { store } = await freshStore('orchestrator-store');
  const identity = createIdentity({ displayName: 'Store orchestration actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Back up this file to the mesh',
      actionType: 'mesh_storage'
    },
    [],
    { execute: true }
  );
  await store.saveOrchestration(orchestration);

  assert.equal((await store.readOrchestration(orchestration.orchestrationId)).orchestrationId, orchestration.orchestrationId);
  assert.equal((await store.listOrchestrations()).length, 1);
});

test('CLI orchestrates and executes approved intent', async () => {
  const { root, store } = await freshStore('orchestrator-cli');
  const identity = createIdentity({ displayName: 'CLI orchestration actor' });
  await store.saveIdentity(identity);
  await store.saveConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
      purpose: 'CLI orchestration'
    })
  );

  const templates = spawnSync(process.execPath, [cliPath, 'intent', 'templates', '--store', root], {
    encoding: 'utf8'
  });
  assert.equal(templates.status, 0, templates.stderr);
  assert.ok(JSON.parse(templates.stdout).templates.length >= 5);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'intent',
      'orchestrate',
      '--actor-id',
      identity.id,
      '--intent',
      'Which government scheme am I eligible for?',
      '--execute',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.orchestration.status, 'completed');
  assert.equal(output.orchestration.actionRequest.tool, 'digilocker');
  assert.match(output.orchestration.skillPreflightId, /^bos:skill-preflight:/);
  assert.equal((await store.listOrchestrations()).length, 1);
  assert.equal((await store.listSkillPreflights()).length, 1);
  assert.equal((await store.listToolExecutions()).length, 1);
});

test('orchestration templates are available for UI selection', () => {
  const templates = listOrchestrationTemplates();
  assert.ok(templates.some((template) => template.actionType === 'regulated_onboarding'));
  assert.ok(templates.every((template) => template.tool));
});
