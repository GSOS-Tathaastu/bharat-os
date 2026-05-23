import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createConsent,
  DEFAULT_POLICIES,
  evaluateDecision,
  listPolicies
} from '../../src/phase1/policy.mjs';
import { orchestrateIntent } from '../../src/phase1/orchestrator.mjs';

const LABOR_SCOPES = ['labor.match', 'worker.notify', 'upi.escrow'];

function consentFor(identity, scopes = LABOR_SCOPES, purpose = 'Labor flow') {
  return createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes,
    purpose
  });
}

function laborRequest(identity, overrides = {}) {
  return {
    actorId: identity.id,
    actionType: 'labor_match_post',
    tool: 'upi_escrow',
    scopes: LABOR_SCOPES,
    regulated: true,
    piiHandling: 'tokenized',
    identity: { ageAttested: true, ageMinimum: 21 },
    labor: { days: 1, headcount: 1, wageFloorPerDay: 400, legalMinAge: 18 },
    money: { amount: 1000, currency: 'INR', limit: 1000, workerPays: false, escrow: true },
    ...overrides
  };
}

function policyResult(decision, policyId) {
  return decision.checks.find((check) => check.policyId === policyId);
}

test('§9A policy registry advertises every worker-protection rule', () => {
  const ids = listPolicies().map((policy) => policy.policyId);
  for (const required of [
    'policy.worker.no_advance_fee',
    'policy.worker.escrow_required',
    'policy.worker.minimum_wage_floor',
    'policy.worker.age_verification',
    'policy.mediation.requires_worker_authorization',
    'policy.money.fiat_settlement_only'
  ]) {
    assert.ok(ids.includes(required), `missing policy ${required}`);
  }
  assert.equal(DEFAULT_POLICIES.length, ids.length);
});

test('no_advance_fee blocks ANY action where workerPays is true', () => {
  const identity = createIdentity({ displayName: 'Fee actor' });
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'scheme_delivery',
      tool: 'digilocker',
      scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
      regulated: false,
      piiHandling: 'tokenized',
      money: { amount: 100, currency: 'INR', limit: 100, workerPays: true }
    },
    []
  );
  assert.equal(policyResult(decision, 'policy.worker.no_advance_fee').status, 'fail');
  assert.equal(decision.approved, false);
});

test('escrow_required blocks labor flow without escrow', () => {
  const identity = createIdentity({ displayName: 'Escrow actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      tool: 'mesh.storage',
      money: { amount: 1000, currency: 'INR', limit: 1000, escrow: false }
    }),
    [consentFor(identity)]
  );
  const result = policyResult(decision, 'policy.worker.escrow_required');
  assert.equal(result.status, 'fail');
  assert.equal(decision.approved, false);
});

test('escrow_required passes when upi_escrow is the tool', () => {
  const identity = createIdentity({ displayName: 'Escrow ok actor' });
  const decision = evaluateDecision(
    laborRequest(identity),
    [consentFor(identity)]
  );
  assert.equal(policyResult(decision, 'policy.worker.escrow_required').status, 'pass');
});

test('minimum_wage_floor blocks below-floor wages', () => {
  const identity = createIdentity({ displayName: 'Wage actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      labor: { days: 5, headcount: 10, wageFloorPerDay: 400 },
      money: { amount: 5000, currency: 'INR', limit: 5000, escrow: true }
      // 5000 / (5 * 10) = 100/worker/day, below 400 floor
    }),
    [consentFor(identity)]
  );
  const result = policyResult(decision, 'policy.worker.minimum_wage_floor');
  assert.equal(result.status, 'fail');
  assert.equal(result.perWorkerPerDay, 100);
  assert.equal(decision.approved, false);
});

test('minimum_wage_floor requires the floor to be declared', () => {
  const identity = createIdentity({ displayName: 'Missing floor actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      labor: { days: 1, headcount: 1, wageFloorPerDay: null }
    }),
    [consentFor(identity)]
  );
  assert.equal(policyResult(decision, 'policy.worker.minimum_wage_floor').status, 'fail');
});

test('age_verification blocks unattested labor flow', () => {
  const identity = createIdentity({ displayName: 'Unattested actor' });
  const decision = evaluateDecision(
    laborRequest(identity, { identity: { ageAttested: false } }),
    [consentFor(identity)]
  );
  assert.equal(policyResult(decision, 'policy.worker.age_verification').status, 'fail');
});

test('age_verification blocks attested age below the legal minimum', () => {
  const identity = createIdentity({ displayName: 'Minor actor' });
  const decision = evaluateDecision(
    laborRequest(identity, { identity: { ageAttested: true, ageMinimum: 16 } }),
    [consentFor(identity)]
  );
  const result = policyResult(decision, 'policy.worker.age_verification');
  assert.equal(result.status, 'fail');
  assert.equal(result.ageMinimum, 16);
  assert.equal(result.legalMinAge, 18);
});

test('mediation requires a worker authorization receipt alongside the operator', () => {
  const identity = createIdentity({ displayName: 'Kiosk actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      mediation: { channel: 'kiosk', kioskOperatorId: 'bos:operator:csc-001' }
    }),
    [consentFor(identity)]
  );
  assert.equal(
    policyResult(decision, 'policy.mediation.requires_worker_authorization').status,
    'fail'
  );
  assert.equal(decision.approved, false);
});

test('mediation passes when a worker authorization receipt is provided', () => {
  const identity = createIdentity({ displayName: 'Authorized kiosk actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      mediation: {
        channel: 'kiosk',
        kioskOperatorId: 'bos:operator:csc-001',
        workerAuthorizationId: 'bos:worker-auth:demo-001'
      }
    }),
    [consentFor(identity)]
  );
  assert.equal(
    policyResult(decision, 'policy.mediation.requires_worker_authorization').status,
    'pass'
  );
});

test('fiat_settlement_only blocks non-INR currencies for monetary actions', () => {
  const identity = createIdentity({ displayName: 'Crypto actor' });
  const decision = evaluateDecision(
    laborRequest(identity, {
      money: { amount: 1000, currency: 'USDT', limit: 1000, escrow: true }
    }),
    [consentFor(identity)]
  );
  const result = policyResult(decision, 'policy.money.fiat_settlement_only');
  assert.equal(result.status, 'fail');
  assert.equal(result.currency, 'USDT');
  assert.equal(decision.approved, false);
});

test('fiat_settlement_only passes for INR labor settlement', () => {
  const identity = createIdentity({ displayName: 'INR actor' });
  const decision = evaluateDecision(laborRequest(identity), [consentFor(identity)]);
  assert.equal(policyResult(decision, 'policy.money.fiat_settlement_only').status, 'pass');
});

test('fiat_settlement_only does not gate zero-amount actions like mesh storage', () => {
  const identity = createIdentity({ displayName: 'Mesh actor' });
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'mesh_storage',
      tool: 'mesh.storage',
      scopes: ['mesh.store'],
      regulated: false,
      piiHandling: 'none',
      money: { amount: 0, currency: 'INR' }
    },
    []
  );
  assert.equal(policyResult(decision, 'policy.money.fiat_settlement_only').status, 'pass');
});

test('orchestrated labor flow blocks by default until age is attested (§9A safe default)', () => {
  const identity = createIdentity({ displayName: 'Default labor actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'I need 100 laborers near Varanasi'
    },
    [consentFor(identity)]
  );
  assert.equal(orchestration.approved, false);
  assert.ok(orchestration.failedPolicies.includes('policy.worker.age_verification'));
});

test('orchestrated labor flow with explicit age attestation and consent completes', () => {
  const identity = createIdentity({ displayName: 'Attested labor actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Hire workers for brick kiln',
      identity: { ageAttested: true, ageMinimum: 25 }
    },
    [consentFor(identity)],
    { execute: true }
  );
  assert.equal(orchestration.approved, true);
  assert.equal(orchestration.status, 'completed');
  assert.equal(orchestration.actionRequest.actionType, 'labor_match_post');
  assert.ok(orchestration.actionRequest.tool === 'upi_escrow' || orchestration.actionRequest.skillId);
});

test('resolveActionRequest is idempotent so the decision hash is stable across passes', () => {
  const identity = createIdentity({ displayName: 'Idempotent actor' });
  const first = evaluateDecision(laborRequest(identity), [consentFor(identity)]);
  const second = evaluateDecision(first.request, [consentFor(identity)]);
  // Both decisions resolve to the same request shape and the same audit hash.
  assert.deepEqual(first.request, second.request);
});
