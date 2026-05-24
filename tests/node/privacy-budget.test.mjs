// Phase 3.2 — privacy-budget accountant.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertWithinBudget,
  computeBudgetUsage,
  DEFAULT_FEDERATED_BUDGET,
  PRIVACY_BUDGET_PROTOCOL_VERSION,
  projectBudget
} from '../../src/phase1/privacy-budget.mjs';

function update(contributorId, epsilon, hoursAgo, accepted = true) {
  return {
    contributorId,
    differentialPrivacyEpsilon: epsilon,
    accepted,
    submittedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
  };
}

test('computeBudgetUsage returns zero spend on an empty history', () => {
  const usage = computeBudgetUsage('bos:person:alice', []);
  assert.equal(usage.protocolVersion, PRIVACY_BUDGET_PROTOCOL_VERSION);
  assert.equal(usage.epsilonSpent, 0);
  assert.equal(usage.updateCount, 0);
  assert.equal(usage.mostRecentAt, null);
});

test('computeBudgetUsage sums only accepted updates from the same contributor', () => {
  const updates = [
    update('alice', 0.5, 1),
    update('alice', 0.3, 2),
    update('alice', 0.2, 3, false), // rejected — doesn't count
    update('bob', 9.9, 1) // different contributor
  ];
  const usage = computeBudgetUsage('alice', updates);
  assert.ok(Math.abs(usage.epsilonSpent - 0.8) < 1e-9);
  assert.equal(usage.updateCount, 2);
});

test('computeBudgetUsage excludes updates outside the window', () => {
  const updates = [
    update('alice', 0.5, 1), // inside 24h window
    update('alice', 7.0, 25) // outside 24h window
  ];
  const usage = computeBudgetUsage('alice', updates, { windowHours: 24 });
  assert.ok(Math.abs(usage.epsilonSpent - 0.5) < 1e-9);
  assert.equal(usage.updateCount, 1);
});

test('projectBudget reports the cumulative projection', () => {
  const updates = [update('alice', 4.0, 1), update('alice', 3.0, 2)];
  const projection = projectBudget('alice', updates, 0.5, {
    epsilonCap: 8.0,
    windowHours: 720
  });
  assert.equal(projection.wouldExceed, false);
  assert.ok(Math.abs(projection.currentSpend - 7.0) < 1e-9);
  assert.ok(Math.abs(projection.projectedSpend - 7.5) < 1e-9);
});

test('projectBudget flags exceeded budgets', () => {
  const updates = [update('alice', 7.5, 1)];
  const projection = projectBudget('alice', updates, 1.0, {
    epsilonCap: 8.0
  });
  assert.equal(projection.wouldExceed, true);
  assert.equal(projection.requestedEpsilon, 1.0);
});

test('assertWithinBudget throws with a structured error when over cap', () => {
  const updates = [update('alice', 7.5, 1)];
  try {
    assertWithinBudget('alice', updates, 1.0, { epsilonCap: 8.0 });
    assert.fail('expected throw');
  } catch (error) {
    assert.equal(error.code, 'PRIVACY_BUDGET_EXHAUSTED');
    assert.ok(/privacy budget exhausted/.test(error.message));
    assert.equal(error.projection.wouldExceed, true);
  }
});

test('assertWithinBudget returns projection when under cap', () => {
  const updates = [update('alice', 0.5, 1)];
  const projection = assertWithinBudget('alice', updates, 0.5, { epsilonCap: 8.0 });
  assert.equal(projection.wouldExceed, false);
});

test('default budget caps mirror the OWASP/Google heuristic (ε=8 over 30 days)', () => {
  assert.equal(DEFAULT_FEDERATED_BUDGET.windowHours, 720); // 30 days
  assert.equal(DEFAULT_FEDERATED_BUDGET.epsilonCap, 8.0);
});

test('assertWithinBudget refuses non-positive requestedEpsilon', () => {
  assert.throws(() => assertWithinBudget('alice', [], 0), /positive finite/);
  assert.throws(() => assertWithinBudget('alice', [], -0.5), /positive finite/);
});
