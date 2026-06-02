// Phase 13.4 — SLM-H skill-agent registry tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildSkillAgent,
  revokeSkillAgent,
  filterSkillAgentsByPackFamily,
  SKILL_AGENT_PROTOCOL_VERSION,
  SKILL_AGENT_CATEGORIES,
  SKILL_AGENT_SUPPORTED_DOC_KINDS,
  SKILL_AGENT_FORBIDDEN_REGISTRY_SUBSTRINGS,
  PERMITTED_SKILL_AGENT_KEYS
} from '../../src/phase1/skill-agent.mjs';
import { SKILL_AGENT_SEED_LIST } from '../../src/phase1/skill-agent-seed.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'skill-agent-tests');

function validInput(overrides = {}) {
  return {
    category: 'utility_bill_explainer',
    displayName: 'Electricity bill explainer',
    shortDescription: 'Reads a discom bill summary and suggests next steps.',
    supportedDocKinds: ['electricity_bill'],
    requiredCapabilities: ['inference'],
    compatibleModelPackFamilies: [],
    license: 'apache-2.0',
    maxInputChars: 4000,
    maxOutputChars: 1200,
    registeredBy: 'test-runner',
    ...overrides
  };
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ──────────────────────────────────────────────────

test('SKILL_AGENT_PROTOCOL_VERSION is pinned', () => {
  assert.equal(SKILL_AGENT_PROTOCOL_VERSION, 'bos.phase13.skill-agent.v1');
});

test('buildSkillAgent — happy path produces a content-derived skillId', () => {
  const skill = buildSkillAgent(validInput());
  assert.ok(skill.skillId.startsWith('bos:skill-agent:'));
  assert.equal(skill.category, 'utility_bill_explainer');
  assert.equal(skill.status, 'registered');
  assert.equal(skill.protocolVersion, SKILL_AGENT_PROTOCOL_VERSION);
  assert.equal(skill.revokedBy, null);
  assert.equal(skill.revokedAt, null);
  assert.equal(skill.revokeReason, null);
  // Sorted on accept so canonical form is stable.
  assert.deepEqual(skill.supportedDocKinds, ['electricity_bill']);
  assert.deepEqual(skill.requiredCapabilities, ['inference']);
});

test('buildSkillAgent — same input twice yields the same skillId (content-addressed)', () => {
  const a = buildSkillAgent(validInput());
  const b = buildSkillAgent(validInput());
  assert.equal(a.skillId, b.skillId);
});

test('buildSkillAgent — different displayName yields different skillId', () => {
  const a = buildSkillAgent(validInput());
  const b = buildSkillAgent(validInput({ displayName: 'Different name' }));
  assert.notEqual(a.skillId, b.skillId);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of SKILL_AGENT_FORBIDDEN_REGISTRY_SUBSTRINGS) {
    assert.throws(
      () => buildSkillAgent({ ...validInput(), [forbidden]: 'leak' }),
      new RegExp(`${forbidden} is not a permitted skill-agent field`)
    );
  }
});

test('PERMITTED_SKILL_AGENT_KEYS contains exactly the documented set', () => {
  // Spell-check: a typo like `regsteredAt` would otherwise pass.
  const expected = [
    'skillId', 'category', 'displayName', 'shortDescription',
    'supportedDocKinds', 'requiredCapabilities',
    'compatibleModelPackFamilies', 'license', 'maxInputChars',
    'maxOutputChars', 'protocolVersion', 'status', 'registeredBy',
    'registeredAt', 'revokedBy', 'revokedAt', 'revokeReason'
  ];
  assert.deepEqual([...PERMITTED_SKILL_AGENT_KEYS].sort(), [...expected].sort());
});

test('rejects off-allowlist category', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), category: 'malware_dropper' }),
    /category must be one of/
  );
});

test('rejects off-allowlist license', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), license: 'wtfpl' }),
    /license must be one of/
  );
});

test('rejects off-allowlist supportedDocKind', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), supportedDocKinds: ['not_a_real_kind'] }),
    /not in the allowlist/
  );
});

test('rejects off-allowlist requiredCapability', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), requiredCapabilities: ['mind_reading'] }),
    /not in the allowlist/
  );
});

test('rejects duplicate entries in supportedDocKinds', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), supportedDocKinds: ['electricity_bill', 'electricity_bill'] }),
    /duplicate entry/
  );
});

test('rejects maxInputChars / maxOutputChars outside bounds', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), maxInputChars: 0 }),
    /maxInputChars must be an integer in \[64,/
  );
  assert.throws(
    () => buildSkillAgent({ ...validInput(), maxInputChars: 99_999 }),
    /maxInputChars must be an integer in/
  );
  assert.throws(
    () => buildSkillAgent({ ...validInput(), maxOutputChars: 99_999 }),
    /maxOutputChars must be an integer in/
  );
});

test('rejects displayName / shortDescription over caps', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), displayName: 'x'.repeat(200) }),
    /displayName exceeds 120/
  );
  assert.throws(
    () => buildSkillAgent({ ...validInput(), shortDescription: 'x'.repeat(300) }),
    /shortDescription exceeds 240/
  );
});

test('rejects skillId that does not match the content-derived hash', () => {
  assert.throws(
    () => buildSkillAgent({ ...validInput(), skillId: 'bos:skill-agent:spoofed' }),
    /skillId does not match content-derived hash/
  );
});

test('compatibleModelPackFamilies — empty array means "any"', () => {
  const skill = buildSkillAgent(validInput({ compatibleModelPackFamilies: [] }));
  assert.deepEqual(skill.compatibleModelPackFamilies, []);
  // Filter on empty = pass-through.
  assert.deepEqual(
    filterSkillAgentsByPackFamily([skill], ['phi-3-mini']),
    [skill]
  );
});

test('filterSkillAgentsByPackFamily — narrows by installed families', () => {
  const phi = buildSkillAgent(validInput({ compatibleModelPackFamilies: ['phi-3-mini'] }));
  const gemma = buildSkillAgent(validInput({
    displayName: 'Gemma-only skill',
    compatibleModelPackFamilies: ['gemma-2b-it']
  }));
  const both = [phi, gemma];
  assert.deepEqual(
    filterSkillAgentsByPackFamily(both, ['phi-3-mini']).map((s) => s.displayName),
    ['Electricity bill explainer']
  );
  assert.deepEqual(
    filterSkillAgentsByPackFamily(both, ['gemma-2b-it']).map((s) => s.displayName),
    ['Gemma-only skill']
  );
  // No installed families = pass-through.
  assert.deepEqual(filterSkillAgentsByPackFamily(both, []).length, 2);
});

test('revokeSkillAgent transitions status with operator + reason', () => {
  const skill = buildSkillAgent(validInput());
  const revoked = revokeSkillAgent(skill, {
    revokedBy: 'ops-lead',
    reason: 'prompt regression in v0'
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedBy, 'ops-lead');
  assert.equal(revoked.revokeReason, 'prompt regression in v0');
  assert.ok(revoked.revokedAt);
});

test('revokeSkillAgent rejects double-revoke', () => {
  const skill = buildSkillAgent(validInput());
  const revoked = revokeSkillAgent(skill, { revokedBy: 'ops-lead' });
  assert.throws(
    () => revokeSkillAgent(revoked, { revokedBy: 'someone-else' }),
    /not in a registered state/
  );
});

// Convergence: BE allowlists must match the FE substrate.
test('Phase 13.4 — BE SKILL_AGENT_CATEGORIES matches FE skill-agent.ts', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'skill-agent.ts');
  const source = await fs.readFile(fePath, 'utf8');
  // Match either bare `[...] as const` or `Object.freeze([...] as const)`.
  const re = /export const SKILL_AGENT_CATEGORIES = (?:Object\.freeze\()?\[([\s\S]+?)\] as const\)?;/;
  const match = re.exec(source);
  assert.ok(match, 'FE SKILL_AGENT_CATEGORIES not found');
  const feMembers = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...SKILL_AGENT_CATEGORIES].sort(), feMembers);
});

test('Phase 13.4 — BE SKILL_AGENT_SUPPORTED_DOC_KINDS matches FE DocKind union', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'doc-summariser.ts');
  const source = await fs.readFile(fePath, 'utf8');
  const re = /export type DocKind =\s*([\s\S]+?);/;
  const match = re.exec(source);
  assert.ok(match);
  const feMembers = match[1]
    .split('|')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...SKILL_AGENT_SUPPORTED_DOC_KINDS].sort(), feMembers);
});

// Seed list sanity.
test('SKILL_AGENT_SEED_LIST contains at least one well-formed entry', () => {
  assert.ok(SKILL_AGENT_SEED_LIST.length >= 1);
  for (const seed of SKILL_AGENT_SEED_LIST) {
    const skill = buildSkillAgent(seed);
    assert.ok(skill.skillId);
    assert.equal(skill.status, 'registered');
  }
});

// Phase 13.4.1 — the seed list now ships TWO skills covering two
// distinct categories. A future regression that drops one entry
// (e.g. an over-eager dedupe) fails loudly here.
test('Phase 13.4.1 — seed list covers both utility_bill_explainer + consumer_complaint_drafter', () => {
  const categories = SKILL_AGENT_SEED_LIST.map((s) => s.category).sort();
  assert.deepEqual(categories, ['consumer_complaint_drafter', 'utility_bill_explainer']);
  // The two seeds must produce distinct content-derived skillIds.
  const skillIds = new Set(SKILL_AGENT_SEED_LIST.map((s) => buildSkillAgent(s).skillId));
  assert.equal(skillIds.size, SKILL_AGENT_SEED_LIST.length);
});

// ─── Store + HTTP integration ───────────────────────────────────────

async function withApiServer(handler) {
  const { store } = await freshSqlite('http');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('GET /api/skill-agents — seed-populated catalog (first hit triggers seeding)', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/skill-agents`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.protocolVersion, SKILL_AGENT_PROTOCOL_VERSION);
    assert.deepEqual(body.supportedCategories, SKILL_AGENT_CATEGORIES);
    assert.deepEqual(body.supportedDocKinds, SKILL_AGENT_SUPPORTED_DOC_KINDS);
    assert.ok(body.skillAgents.length >= 2, 'catalog should be seeded with both v1 skills');
    const billExplainer = body.skillAgents.find(
      (s) => s.category === 'utility_bill_explainer'
    );
    assert.ok(billExplainer, 'electricity bill explainer should be seeded');
    assert.equal(billExplainer.status, 'registered');
    assert.deepEqual(billExplainer.supportedDocKinds, ['electricity_bill']);
    // Phase 13.4.1 — consumer complaint drafter is the second seed.
    const complaintDrafter = body.skillAgents.find(
      (s) => s.category === 'consumer_complaint_drafter'
    );
    assert.ok(complaintDrafter, 'consumer complaint drafter should be seeded');
    assert.equal(complaintDrafter.status, 'registered');
    assert.deepEqual(complaintDrafter.supportedDocKinds, ['generic']);
  });
});

test('GET /api/skill-agents?activeOnly=true excludes revoked', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    // Prime + revoke the seed.
    await fetch(`${baseUrl}/api/skill-agents`);
    const all = await store.listSkillAgents();
    const billExplainer = all.find((s) => s.category === 'utility_bill_explainer');
    assert.ok(billExplainer);
    await store.saveSkillAgent(revokeSkillAgent(billExplainer, { revokedBy: 'test' }));

    const activeRes = await fetch(`${baseUrl}/api/skill-agents?activeOnly=true`);
    const active = await activeRes.json();
    const stillThere = active.skillAgents.find(
      (s) => s.skillId === billExplainer.skillId
    );
    assert.equal(stillThere, undefined, 'revoked skill should be filtered out');

    const allRes = await fetch(`${baseUrl}/api/skill-agents`);
    const allBody = await allRes.json();
    const revokedRow = allBody.skillAgents.find(
      (s) => s.skillId === billExplainer.skillId
    );
    assert.ok(revokedRow, 'revoked skill should still appear without activeOnly');
    assert.equal(revokedRow.status, 'revoked');
  });
});

test('GET /api/skill-agents/:skillId returns the registered record', async () => {
  await withApiServer(async ({ baseUrl }) => {
    // First hit primes the seed.
    const catalogRes = await fetch(`${baseUrl}/api/skill-agents`);
    const catalog = await catalogRes.json();
    const seed = catalog.skillAgents[0];
    const r = await fetch(`${baseUrl}/api/skill-agents/${encodeURIComponent(seed.skillId)}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.skillAgent.skillId, seed.skillId);
  });
});

test('GET /api/skill-agents/:skillId returns 404 for unknown', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/skill-agents/bos:skill-agent:does-not-exist`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error.code, 'unknown_skill_agent');
  });
});

test('seeding is idempotent — second GET does not duplicate the seed', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    await fetch(`${baseUrl}/api/skill-agents`);
    const firstCount = (await store.listSkillAgents()).length;
    await fetch(`${baseUrl}/api/skill-agents`);
    await fetch(`${baseUrl}/api/skill-agents`);
    const finalCount = (await store.listSkillAgents()).length;
    assert.equal(firstCount, finalCount);
  });
});
