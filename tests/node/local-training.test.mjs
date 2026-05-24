// Phase 3.1 — on-device training math tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDifferentialPrivacyNoise,
  CLASS_DIM,
  composeFederatedUpdate,
  crossEntropyLoss,
  extractFeatures,
  FEATURE_DIM,
  forward,
  hashGradient,
  initWeights,
  LOCAL_TRAINING_PROTOCOL_VERSION,
  predict,
  TRAINING_CLASSES,
  trainOneEpoch,
  WEIGHT_DIM
} from '../../src/phase1/local-training.mjs';

test('feature extractor returns a stable-length Float32Array', () => {
  const f = extractFeatures('Book me a cab from office to home', 'en-IN');
  assert.equal(f.length, FEATURE_DIM);
  assert.equal(f instanceof Float32Array, true);
  // bias is always 1
  assert.equal(f[0], 1);
  // ascii-letter flag for English text
  assert.equal(f[4], 1);
});

test('feature extractor detects locale and script', () => {
  const tamil = extractFeatures('என் சர்க்கரை நோய் பதிவு காட்டு', 'ta-IN');
  // Tamil script flag
  assert.equal(tamil[6], 1);

  const hindi = extractFeatures('मुझे ऋण चाहिए', 'hi-IN');
  // Devanagari script flag
  assert.equal(hindi[5], 1);
});

test('forward pass returns a probability distribution that sums to 1', () => {
  const weights = initWeights({ seed: 42 });
  const features = extractFeatures('Book a cab', 'en-IN');
  const probs = forward(features, weights);
  assert.equal(probs.length, CLASS_DIM);
  let sum = 0;
  for (const p of probs) {
    assert.ok(p >= 0, 'probability is non-negative');
    assert.ok(p <= 1, 'probability is at most 1');
    sum += p;
  }
  assert.ok(Math.abs(sum - 1) < 1e-5, `softmax sums to 1, got ${sum}`);
});

test('one gradient step decreases cross-entropy loss on a single sample', () => {
  const weights = initWeights({ seed: 7 });
  const features = extractFeatures('Book a cab from office to home', 'en-IN');
  const labelIdx = TRAINING_CLASSES.indexOf('service_booking');
  const lossBefore = crossEntropyLoss(features, labelIdx, weights);
  const { weights: trained } = trainOneEpoch(
    [{ intentText: 'Book a cab from office to home', locale: 'en-IN', actionType: 'service_booking' }],
    weights,
    { learningRate: 1.0 }
  );
  const lossAfter = crossEntropyLoss(features, labelIdx, trained);
  assert.ok(lossAfter < lossBefore, `loss should decrease, before=${lossBefore}, after=${lossAfter}`);
});

test('training many epochs on a tiny dataset reaches near-perfect accuracy', () => {
  const samples = [
    { intentText: 'Book a cab from office to home', locale: 'en-IN', actionType: 'service_booking' },
    { intentText: 'Mujhe loan chahiye', locale: 'hi-Latn-IN', actionType: 'regulated_onboarding' },
    { intentText: 'Show me my health record', locale: 'en-IN', actionType: 'health_record_read' },
    { intentText: 'Mujhe sarkari yojana chahiye', locale: 'hi-Latn-IN', actionType: 'scheme_delivery' },
    { intentText: 'Hire 50 workers for brick kiln', locale: 'en-IN', actionType: 'labor_match_post' },
    { intentText: 'Backup my files on the mesh', locale: 'en-IN', actionType: 'mesh_storage' }
  ];
  let weights = initWeights({ seed: 11 });
  for (let epoch = 0; epoch < 200; epoch += 1) {
    ({ weights } = trainOneEpoch(samples, weights, { learningRate: 0.5 }));
  }
  let correct = 0;
  for (const sample of samples) {
    const features = extractFeatures(sample.intentText, sample.locale);
    const { actionType } = predict(features, weights);
    if (actionType === sample.actionType) correct += 1;
  }
  assert.ok(correct >= 5, `expected at least 5/6 correct after 200 epochs, got ${correct}/6`);
});

test('trainOneEpoch refuses an empty sample set', () => {
  const weights = initWeights({ seed: 1 });
  assert.throws(() => trainOneEpoch([], weights), /non-empty array/);
});

test('trainOneEpoch refuses samples with no known actionType', () => {
  const weights = initWeights({ seed: 1 });
  assert.throws(
    () =>
      trainOneEpoch(
        [{ intentText: 'x', locale: 'en-IN', actionType: 'not_a_real_action' }],
        weights
      ),
    /no samples with a known actionType/
  );
});

test('addDifferentialPrivacyNoise applies noise scaled to 1/epsilon', () => {
  const gradient = new Float32Array(WEIGHT_DIM);
  for (let i = 0; i < WEIGHT_DIM; i += 1) gradient[i] = 0; // zero gradient to isolate noise
  const lowEps = addDifferentialPrivacyNoise(gradient, 0.1, { seed: 13 });
  const highEps = addDifferentialPrivacyNoise(gradient, 10, { seed: 13 });
  let lowMag = 0;
  let highMag = 0;
  for (let i = 0; i < WEIGHT_DIM; i += 1) {
    lowMag += lowEps[i] * lowEps[i];
    highMag += highEps[i] * highEps[i];
  }
  // Lower epsilon = more noise = larger magnitude.
  assert.ok(
    lowMag > highMag * 100,
    `low-epsilon noise magnitude should dominate, lowMag=${lowMag}, highMag=${highMag}`
  );
});

test('addDifferentialPrivacyNoise refuses non-positive epsilon', () => {
  const gradient = new Float32Array(WEIGHT_DIM);
  assert.throws(() => addDifferentialPrivacyNoise(gradient, 0), /positive finite/);
  assert.throws(() => addDifferentialPrivacyNoise(gradient, -0.1), /positive finite/);
});

test('hashGradient is deterministic and produces a sha256 hex string', async () => {
  const g1 = new Float32Array([1, 2, 3, 4]);
  const g2 = new Float32Array([1, 2, 3, 4]);
  const g3 = new Float32Array([1, 2, 3, 5]);
  const h1 = await hashGradient(g1);
  const h2 = await hashGradient(g2);
  const h3 = await hashGradient(g3);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.ok(/^sha256:[0-9a-f]{64}$/.test(h1));
});

test('composeFederatedUpdate runs end-to-end and returns a versioned envelope', async () => {
  const samples = [
    { intentText: 'Book a cab', locale: 'en-IN', actionType: 'service_booking' },
    { intentText: 'Show health record', locale: 'en-IN', actionType: 'health_record_read' }
  ];
  const result = await composeFederatedUpdate({
    samples,
    epsilon: 0.5,
    seed: 99
  });
  assert.equal(result.protocolVersion, LOCAL_TRAINING_PROTOCOL_VERSION);
  assert.ok(/^sha256:[0-9a-f]{64}$/.test(result.gradientHash));
  assert.equal(result.sampleCount, 2);
  assert.equal(result.differentialPrivacyEpsilon, 0.5);
  assert.equal(result.weightDim, WEIGHT_DIM);
  assert.deepEqual(result.classes, TRAINING_CLASSES);
  assert.ok(result.averageLoss > 0);
});

test('composeFederatedUpdate is deterministic when seeded', async () => {
  const samples = [
    { intentText: 'Book a cab', locale: 'en-IN', actionType: 'service_booking' }
  ];
  const a = await composeFederatedUpdate({ samples, epsilon: 0.5, seed: 1234 });
  const b = await composeFederatedUpdate({ samples, epsilon: 0.5, seed: 1234 });
  assert.equal(a.gradientHash, b.gradientHash);
});
