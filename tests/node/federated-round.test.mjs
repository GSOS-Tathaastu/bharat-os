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
  aggregateRoundFedAvg,
  BYTES_DONATION_CONSENT_PURPOSE,
  BYTES_DONATION_CONSENT_SCOPES,
  createFederatedRound,
  createGradientUpdate,
  DONATION_CONSENT_PURPOSE,
  DONATION_CONSENT_SCOPES,
  expireRound,
  FEDERATED_AGGREGATION_MODES,
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
  // Phase 9.0d — SLM target fields default to null on legacy rounds.
  assert.equal(round.slmModelPackId, null);
  assert.equal(round.targetTask, null);
  assert.equal(round.loraConfig, null);
});

test('createFederatedRound carries SLM target fields when provided (Phase 9.0d)', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const round = createFederatedRound({
    createdBy: researcher.id,
    modelName: 'phi-3-mini-indic-intent',
    baselineModelHash: 'sha256:baseline',
    slmModelPackId: 'bos:slm:phi-3-mini-4k-q4_k_m',
    targetTask: 'indic-intent-routing',
    loraConfig: { rank: 8, target: ['q_proj', 'v_proj'] }
  });
  assert.equal(round.slmModelPackId, 'bos:slm:phi-3-mini-4k-q4_k_m');
  assert.equal(round.targetTask, 'indic-intent-routing');
  assert.deepEqual(round.loraConfig, { rank: 8, target: ['q_proj', 'v_proj'] });
});

test('describeRound surfaces SLM target fields (Phase 9.0d)', async () => {
  const { describeRound } = await import('../../src/phase1/federated-round.mjs');
  const researcher = createIdentity({ displayName: 'R' });
  const round = createFederatedRound({
    createdBy: researcher.id,
    modelName: 'm',
    baselineModelHash: 'sha256:b',
    slmModelPackId: 'bos:slm:test',
    targetTask: 'task-a',
    loraConfig: { rank: 4 }
  });
  const desc = describeRound(round);
  assert.equal(desc.slmModelPackId, 'bos:slm:test');
  assert.equal(desc.targetTask, 'task-a');
  assert.deepEqual(desc.loraConfig, { rank: 4 });
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

// ─── Phase 3.2 — FedAvg + bytes donation + budget ───────────────────────

function bytesDonationConsent(contributor, { roundId, ttlSeconds = 24 * 60 * 60 } = {}) {
  return signConsent(
    createConsent({
      subjectId: contributor.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: BYTES_DONATION_CONSENT_SCOPES,
      purpose: BYTES_DONATION_CONSENT_PURPOSE,
      ttlSeconds,
      constraints: roundId ? { roundId } : {}
    }),
    contributor
  );
}

function float32ToBase64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  return Buffer.from(u8).toString('base64');
}

function buildBytesUpdate(contributor, round, { gradient, epsilon = 0.3 } = {}) {
  return signGradientUpdate(
    createGradientUpdate({
      roundId: round.roundId,
      contributorId: contributor.id,
      baselineModelHash: round.baselineModelHash,
      gradientHash: 'sha256:bytes-update',
      gradientBytesBase64: float32ToBase64(gradient),
      gradientLength: gradient.length,
      differentialPrivacyEpsilon: epsilon,
      sampleCount: 8
    }),
    contributor
  );
}

test('aggregation mode defaults to hash_combiner; fedavg requires opt-in', () => {
  const r1 = createFederatedRound({
    createdBy: 'bos:person:x',
    modelName: 'm',
    baselineModelHash: 'b'
  });
  assert.equal(r1.aggregationMode, 'hash_combiner');
  const r2 = createFederatedRound({
    createdBy: 'bos:person:x',
    modelName: 'm',
    baselineModelHash: 'b',
    aggregationMode: 'fedavg'
  });
  assert.equal(r2.aggregationMode, 'fedavg');
  assert.deepEqual([...FEDERATED_AGGREGATION_MODES].sort(), ['fedavg', 'hash_combiner']);
  assert.throws(
    () =>
      createFederatedRound({
        createdBy: 'bos:person:x',
        modelName: 'm',
        baselineModelHash: 'b',
        aggregationMode: 'not-real'
      }),
    /aggregationMode must be one of/
  );
});

test('fedavg round refuses an update without gradientBytesBase64', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      aggregationMode: 'fedavg'
    })
  );
  const noBytes = buildUpdate(contributor, round); // hash-only update
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update: noBytes,
        consents: [bytesDonationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)]
      }),
    /require update\.gradientBytesBase64/
  );
});

test('fedavg round refuses a hash-only-donation consent — needs bytes donation', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      aggregationMode: 'fedavg'
    })
  );
  const grad = new Float32Array([0.1, -0.2, 0.05, 0.4]);
  const update = buildBytesUpdate(contributor, round, { gradient: grad });
  // Provide only the weaker hash-only donation consent.
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [donationConsent(contributor)], // not enough!
        publicRecords: [publicIdentity(contributor)]
      }),
    /federated_bytes_donation/
  );
});

test('fedavg round accepts updates with bytes + bytes-donation consent', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      aggregationMode: 'fedavg'
    })
  );
  const grad = new Float32Array([0.5, -0.5, 0.25, -0.25]);
  const update = buildBytesUpdate(contributor, round, { gradient: grad });
  const { round: next, update: accepted } = submitGradientUpdate({
    round,
    update,
    consents: [bytesDonationConsent(contributor)],
    publicRecords: [publicIdentity(contributor)]
  });
  assert.equal(accepted.accepted, true);
  assert.equal(next.updateCount, 1);
  assert.ok(accepted.gradientBytesBase64);
});

test('aggregateRoundFedAvg computes element-wise mean of accepted update gradients', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      aggregationMode: 'fedavg'
    })
  );
  const gA = new Float32Array([1.0, 2.0, 3.0, 4.0]);
  const gB = new Float32Array([3.0, 4.0, 5.0, 6.0]);
  const consents = [bytesDonationConsent(a), bytesDonationConsent(b)];
  const records = [publicIdentity(a), publicIdentity(b)];
  let working = round;
  const { round: r1, update: u1 } = submitGradientUpdate({
    round: working,
    update: buildBytesUpdate(a, round, { gradient: gA }),
    consents,
    publicRecords: records
  });
  working = r1;
  const { round: r2, update: u2 } = submitGradientUpdate({
    round: working,
    update: buildBytesUpdate(b, round, { gradient: gB }),
    consents,
    publicRecords: records
  });
  working = r2;
  const aggregated = aggregateRoundFedAvg(working, [u1, u2]);
  assert.equal(aggregated.status, 'completed');
  assert.equal(aggregated.aggregatedGradientLength, 4);
  assert.ok(aggregated.aggregatedGradientBytesBase64);
  // Decode back and verify the means: (1+3)/2=2, (2+4)/2=3, etc.
  // (Node Buffer.slice is a view on a shared pool, so copy bytes
  // into a fresh ArrayBuffer before constructing the Float32Array.)
  const bytes = Buffer.from(aggregated.aggregatedGradientBytesBase64, 'base64');
  const fresh = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fresh).set(bytes);
  const avg = new Float32Array(fresh);
  assert.ok(Math.abs(avg[0] - 2.0) < 1e-5);
  assert.ok(Math.abs(avg[1] - 3.0) < 1e-5);
  assert.ok(Math.abs(avg[2] - 4.0) < 1e-5);
  assert.ok(Math.abs(avg[3] - 5.0) < 1e-5);
});

test('aggregateRoundFedAvg refuses to run on a hash_combiner round', () => {
  const round = openRound(
    createFederatedRound({
      createdBy: 'bos:person:r',
      modelName: 'm',
      baselineModelHash: 'b'
      // default aggregationMode: 'hash_combiner'
    })
  );
  assert.throws(
    () => aggregateRoundFedAvg(round, []),
    /requires aggregationMode === 'fedavg'/
  );
});

test('aggregate() dispatches to fedavg when the round is fedavg-mode', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const c = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      aggregationMode: 'fedavg'
    })
  );
  const grad = new Float32Array([0.1, 0.2, 0.3, 0.4]);
  const { round: r1, update } = submitGradientUpdate({
    round,
    update: buildBytesUpdate(c, round, { gradient: grad }),
    consents: [bytesDonationConsent(c)],
    publicRecords: [publicIdentity(c)]
  });
  const aggregated = aggregateRound(r1, [update]);
  assert.equal(aggregated.aggregatedGradientLength, 4);
  assert.ok(aggregated.aggregatedGradientBytesBase64);
});

test('submitGradientUpdate enforces the per-contributor privacy budget when allUpdates is passed', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  // Round with a low budget cap so we can blow past it.
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      maxEpsilon: 1.0,
      contributorBudget: { windowHours: 720, epsilonCap: 0.5 }
    })
  );
  // History already used ε=0.4 in this window.
  const history = [
    {
      contributorId: contributor.id,
      accepted: true,
      differentialPrivacyEpsilon: 0.4,
      submittedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    }
  ];
  const update = buildUpdate(contributor, round, { epsilon: 0.3 }); // would push to 0.7
  assert.throws(
    () =>
      submitGradientUpdate({
        round,
        update,
        consents: [donationConsent(contributor)],
        publicRecords: [publicIdentity(contributor)],
        allUpdates: history
      }),
    /privacy budget exhausted/
  );
});

test('submitGradientUpdate budget check is skipped when allUpdates is not passed (legacy callers)', () => {
  const researcher = createIdentity({ displayName: 'R' });
  const contributor = createIdentity({ displayName: 'C' });
  const round = openRound(
    createFederatedRound({
      createdBy: researcher.id,
      modelName: 'm',
      baselineModelHash: 'baseline',
      contributorBudget: { windowHours: 720, epsilonCap: 0.5 }
    })
  );
  const update = buildUpdate(contributor, round, { epsilon: 0.3 });
  // No allUpdates → no budget check. Should succeed.
  const { round: next, update: accepted } = submitGradientUpdate({
    round,
    update,
    consents: [donationConsent(contributor)],
    publicRecords: [publicIdentity(contributor)]
    // allUpdates omitted
  });
  assert.equal(accepted.accepted, true);
  assert.equal(next.updateCount, 1);
});

test('signature stays stable across hash_combiner vs fedavg modes (canonical payload is mode-agnostic)', () => {
  const c = createIdentity({ displayName: 'C' });
  // Build the same logical update under both modes; signatures
  // verify in both directions as long as gradientBytesBase64 doesn't
  // enter the canonical payload.
  const hashOnlyRound = openRound(
    createFederatedRound({ createdBy: 'bos:person:r', modelName: 'm', baselineModelHash: 'b' })
  );
  const grad = new Float32Array([1, 2, 3]);
  const update = signGradientUpdate(
    createGradientUpdate({
      roundId: hashOnlyRound.roundId,
      contributorId: c.id,
      baselineModelHash: hashOnlyRound.baselineModelHash,
      gradientHash: 'sha256:abc',
      gradientBytesBase64: float32ToBase64(grad),
      gradientLength: 3,
      differentialPrivacyEpsilon: 0.5,
      sampleCount: 1
    }),
    c
  );
  // Signature must verify even though gradientBytesBase64 is present.
  // (Signature is over the canonical payload, which excludes bytes.)
  const { update: accepted } = submitGradientUpdate({
    round: hashOnlyRound,
    update,
    consents: [donationConsent(c)],
    publicRecords: [publicIdentity(c)]
  });
  assert.equal(accepted.accepted, true);
});
