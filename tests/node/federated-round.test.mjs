// Phase 3.0 — §7f federated round substrate tests.
//
// Verifies the round lifecycle, signed-update contract, donation-
// consent enforcement, DP epsilon cap, and aggregation determinism.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publicIdentity } from '../../src/phase0/core.mjs';
import { signConsent } from '../../src/phase1/integrity.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  aggregateRound,
  createFederatedRound,
  createGradientUpdate,
  DONATION_CONSENT_PURPOSE,
  DONATION_CONSENT_SCOPES,
  expireRound,
  FEDERATED_PAYOUT_PAISE_PER_UPDATE,
  FEDERATED_ROUND_PROTOCOL_VERSION,
  FEDERATED_ROUND_WORKLOAD,
  openRound,
  signGradientUpdate,
  submitGradientUpdate
} from '../../src/phase1/federated-round.mjs';
import {
  createMeshContributionEvent,
  MESH_WORKLOAD_TYPES
} from '../../src/phase1/mesh-contribution.mjs';

function donationConsent(contributor, { roundId, ttlSeconds = 24 * 60 * 60 } = {}) {
  return signConsent(
    createConsent({
      subjectId: contributor.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: DONATION_CONSENT_SCOPES,
      purpose: DONATION_CONSENT_PURPOSE,
      ttlSeconds,
      constraints: roundId ? { roundId } : {}
    }),
    contributor
  );
}

function buildUpdate(contributor, round, { epsilon = 0.5, gradientHash = 'abc' } = {}) {
  return signGradientUpdate(
    createGradientUpdate({
      roundId: round.roundId,
      contributorId: contributor.id,
      baselineModelHash: round.baselineModelHash,
      gradientHash,
      differentialPrivacyEpsilon: epsilon,
      sampleCount: 256
    }),
    contributor
  );
}

test('createFederatedRound emits a versioned, deterministic round id with a deadline', () => {
  const researcher = createIdentity({ displayName: 'Researcher' });
  const round = createFederatedRound({
    createdBy: researcher.id,
    modelName: 'indic-asr-tiny',
    baselineModelHash: 'sha256:baseline-v1',
    maxParticipants: 10,
    maxEpsilon: 1.0,
    deadlineSecondsFromNow: 3600
  });
  assert.equal(round.protocolVersion, FEDERATED_ROUND_PROTOCOL_VERSION);
  assert.equal(round.objectType, 'federated-round');
  assert.equal(round.status, 'created');
  assert.equal(round.maxParticipants, 10);
  assert.equal(round.maxEpsilon, 1.0);
  assert.equal(round.updateCount, 0);
  assert.equal(round.epsilonSpent, 0);
  assert.equal(round.payoutPaisePerUpdate, FEDERATED_PAYOUT_PAISE_PER_UPDATE);
  assert.ok(round.roundId.startsWith('bos:fed-round:'));
});

test('round lifecycle: created → accepting_updates → completed', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = createFederatedRound({
    createdBy: researcher.id,
    modelName: 'm',
    baselineModelHash: 'baseline'
  });
  const opened = openRound(round);
  assert.equal(opened.status, 'accepting_updates');
  assert.ok(opened.openedAt);

  const update = buildUpdate(contributor, opened, { gradientHash: 'g1' });
  const { round: afterSubmit, update: accepted } = submitGradientUpdate({
    round: opened,
    update,
    consents: [donationConsent(contributor)],
    publicRecords: [publicIdentity(contributor)]
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.payoutPaise, FEDERATED_PAYOUT_PAISE_PER_UPDATE);
  assert.equal(afterSubmit.updateCount, 1);
  assert.equal(afterSubmit.epsilonSpent, 0.5);

  const aggregated = aggregateRound(afterSubmit, [accepted]);
  assert.equal(aggregated.status, 'completed');
  assert.ok(aggregated.aggregatedModelHash.length === 64);
  assert.ok(aggregated.aggregatedAt);
});

test('submitGradientUpdate refuses without a donation-purpose consent', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline'
    })
  );
  const update = buildUpdate(contributor, round);

  // Bare workflow consent (different purpose) should NOT satisfy.
  const workflowConsent = signConsent(
    createConsent({
      subjectId: contributor.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['training.donate', 'consent.record'],
      purpose: 'tenant_verification',
      ttlSeconds: 3600
    }),
    contributor
  );
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [workflowConsent],
        publicRecords: [publicIdentity(contributor)]
      }),
    /no active 'federated_donation' consent/
  );
});

test('submitGradientUpdate refuses an unsigned update', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline'
    })
  );
  const unsigned = createGradientUpdate({
    roundId: round.roundId,
    contributorId: contributor.id,
    baselineModelHash: round.baselineModelHash,
    gradientHash: 'g',
    differentialPrivacyEpsilon: 0.5
  });
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update: unsigned,
        consents: [donationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)]
      }),
    /signature is missing or does not verify/
  );
});

test('submitGradientUpdate refuses an update that exceeds the DP epsilon cap', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      maxEpsilon: 0.5
    })
  );
  const update = buildUpdate(contributor, round, { epsilon: 1.5 });
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [donationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)]
      }),
    /exceeds round cap/
  );
});

test('submitGradientUpdate refuses when baselineModelHash drifts from the round', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline-A'
    })
  );
  const update = signGradientUpdate(
    createGradientUpdate({
      roundId: round.roundId,
      contributorId: contributor.id,
      baselineModelHash: 'baseline-B', // wrong
      gradientHash: 'g',
      differentialPrivacyEpsilon: 0.5
    }),
    contributor
  );
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [donationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)]
      }),
    /baselineModelHash must match/
  );
});

test('submitGradientUpdate refuses past the deadline', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      deadlineSecondsFromNow: -1, // already expired
      at: past
    })
  );
  const update = buildUpdate(contributor, round);
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [donationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)]
      }),
    /deadline has passed/
  );
});

test('aggregateRound produces a deterministic hash from the sorted gradient hashes', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contribA = createIdentity({ displayName: 'A' });
  const contribB = createIdentity({ displayName: 'B' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline'
    })
  );
  const consents = [donationConsent(contribA), donationConsent(contribB)];
  const records = [publicIdentity(contribA), publicIdentity(contribB)];
  let working = round;
  const { round: r1, update: u1 } = submitGradientUpdate({
    round: working,
    update: buildUpdate(contribA, round, { gradientHash: 'g-A' }),
    consents,
    publicRecords: records
  });
  working = r1;
  const { round: r2, update: u2 } = submitGradientUpdate({
    round: working,
    update: buildUpdate(contribB, round, { gradientHash: 'g-B' }),
    consents,
    publicRecords: records
  });
  working = r2;

  const aggregatedAB = aggregateRound(working, [u1, u2]);
  const aggregatedBA = aggregateRound(working, [u2, u1]);
  assert.equal(
    aggregatedAB.aggregatedModelHash,
    aggregatedBA.aggregatedModelHash,
    'aggregation is order-independent (sorted gradient hashes)'
  );
});

test('expireRound only flips status once the deadline has actually passed', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      deadlineSecondsFromNow: 3600
    })
  );
  const stillActive = expireRound(round);
  assert.equal(stillActive.status, 'accepting_updates');

  const past = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const expired = expireRound(round, { at: past });
  assert.equal(expired.status, 'expired');
});

test('mesh-contribution accepts the new federated_round workload class and honours the explicit payout', () => {
  assert.ok(MESH_WORKLOAD_TYPES.includes(FEDERATED_ROUND_WORKLOAD));
  const operator = createIdentity({ displayName: 'Op' });
  const event = createMeshContributionEvent({
    operatorId: operator.id,
    workloadType: FEDERATED_ROUND_WORKLOAD,
    payoutPaise: 500,
    roundId: 'bos:fed-round:test'
  });
  assert.equal(event.workloadType, FEDERATED_ROUND_WORKLOAD);
  assert.equal(event.payoutPaise, 500);
  assert.equal(event.roundId, 'bos:fed-round:test');
  assert.equal(event.tokens, null);
  assert.equal(event.bytes, null);
});

test('round respects maxParticipants cap', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const c = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      maxParticipants: 1
    })
  );
  const u1 = buildUpdate(c, round, { gradientHash: 'g1' });
  const { round: r1 } = submitGradientUpdate({
    round,
    update: u1,
    consents: [donationConsent(c)],
    publicRecords: [publicIdentity(c)]
  });
  const u2 = buildUpdate(c, round, { gradientHash: 'g2' });
  assert.throws(
    () =>
      submitGradientUpdate({
        round: r1,
        update: u2,
        consents: [donationConsent(c)],
        publicRecords: [publicIdentity(c)]
      }),
    /max participants/
  );
});
