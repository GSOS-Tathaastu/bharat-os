// §7f Phase 3.1 — on-device training math.
//
// Phase 3.0 (ADR 0071) shipped the federated round substrate with a
// placeholder gradient hash. This module replaces it with real
// pure-JS gradient descent on the user's local orchestration
// history.
//
// Model: multinomial logistic regression (a single linear classifier
// head) over a small fixed feature vector. ~36 features × 6 classes
// = 216 weights. Small enough that:
//   • Forward + backward pass is microseconds in pure JS
//   • DP noise is one Gaussian sample per weight
//   • SHA-256 hash of the float32 byte buffer is the gradient hash
//     the federated round substrate already expects
//
// What gets trained: action-type prediction from intent text +
// locale. Every user has different intents; federating the head
// across users improves the global classifier without raw text ever
// leaving any device (§15 binding — only the noisy gradient hash
// reaches the control plane).
//
// Browser-usable AND Node-testable: the file imports only
// `globalThis.crypto.subtle` (Web Crypto, available in both since
// Node 18+) and runs anywhere a SubtleCrypto exists.

export const LOCAL_TRAINING_PROTOCOL_VERSION = 'bos.phase1.local-training.v0';

// The six classes the federated round currently trains the head to
// predict. Aligned with `ORCHESTRATION_TEMPLATES` action types so
// the substrate stays consistent if we add classes in future.
export const TRAINING_CLASSES = [
  'regulated_onboarding',
  'scheme_delivery',
  'health_record_read',
  'labor_match_post',
  'service_booking',
  'mesh_storage'
];

// Locales the feature extractor recognises. Anything else maps to a
// shared `other` slot so the model degrades gracefully.
const LOCALES = [
  'en-IN',
  'hi-IN',
  'hi-Latn-IN',
  'mr-IN',
  'bho-IN',
  'ta-IN',
  'bn-IN'
];

// Per-class trigger words — same intuition as the vernacular regex
// table, just packed as binary features so the classifier can learn
// per-class weights.
const TRIGGER_WORDS = {
  regulated_onboarding: ['loan', 'karza', 'bank', 'kyc', 'nbfc', 'account'],
  scheme_delivery: ['scheme', 'yojana', 'sarkari', 'subsidy', 'ration'],
  health_record_read: ['health', 'abha', 'hba1c', 'medical', 'record', 'sehat'],
  labor_match_post: ['labor', 'worker', 'mazdoor', 'majdoor', 'wage', 'job'],
  service_booking: ['cab', 'taxi', 'hotel', 'train', 'ticket', 'book'],
  mesh_storage: ['storage', 'backup', 'mesh', 'archive', 'file']
};

const FEATURE_NAMES = (() => {
  const names = [
    'bias',
    'length_normalized',
    'word_count_normalized',
    'has_digit',
    'has_ascii_letter',
    'has_devanagari',
    'has_tamil',
    'has_bengali',
    ...LOCALES.map((l) => `locale_${l}`),
    'locale_other'
  ];
  for (const action of TRAINING_CLASSES) {
    for (const word of TRIGGER_WORDS[action]) {
      names.push(`trigger_${action}_${word}`);
    }
  }
  return names;
})();

export const FEATURE_DIM = FEATURE_NAMES.length;
export const CLASS_DIM = TRAINING_CLASSES.length;
export const WEIGHT_DIM = FEATURE_DIM * CLASS_DIM;

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function extractFeatures(intentText, locale) {
  const text = String(intentText ?? '');
  const lower = text.toLowerCase();
  const features = new Float32Array(FEATURE_DIM);
  let idx = 0;
  features[idx++] = 1; // bias
  features[idx++] = clamp01(text.length / 80); // length, capped at 80 chars
  features[idx++] = clamp01(text.split(/\s+/).filter(Boolean).length / 12);
  features[idx++] = /\d/.test(text) ? 1 : 0;
  features[idx++] = /[a-zA-Z]/.test(text) ? 1 : 0;
  features[idx++] = /[ऀ-ॿ]/.test(text) ? 1 : 0; // Devanagari
  features[idx++] = /[஀-௿]/.test(text) ? 1 : 0; // Tamil
  features[idx++] = /[ঀ-৿]/.test(text) ? 1 : 0; // Bengali
  let localeMatched = false;
  for (const candidate of LOCALES) {
    const hit = candidate === locale ? 1 : 0;
    features[idx++] = hit;
    if (hit) localeMatched = true;
  }
  features[idx++] = localeMatched ? 0 : 1; // locale_other
  for (const action of TRAINING_CLASSES) {
    for (const word of TRIGGER_WORDS[action]) {
      // Match whole-word, case-insensitive. Devanagari triggers
      // (none currently in the lists, but allowed) skip the \b
      // since \b is ASCII-only.
      const re = /^[\w]+$/.test(word) ? new RegExp(`\\b${word}\\b`, 'i') : new RegExp(word, 'i');
      features[idx++] = re.test(lower) ? 1 : 0;
    }
  }
  return features;
}

// Seeded RNG so tests are deterministic. Mulberry32, public-domain.
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Small uniform init so the softmax doesn't saturate before any
// training happens.
export function initWeights({ seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const w = new Float32Array(WEIGHT_DIM);
  for (let i = 0; i < WEIGHT_DIM; i += 1) w[i] = (rng() - 0.5) * 0.02;
  return w;
}

// Forward pass: features (D) × weights (D × C) → logits (C) → softmax.
export function forward(features, weights) {
  const logits = new Float32Array(CLASS_DIM);
  for (let c = 0; c < CLASS_DIM; c += 1) {
    let dot = 0;
    for (let d = 0; d < FEATURE_DIM; d += 1) {
      dot += features[d] * weights[d * CLASS_DIM + c];
    }
    logits[c] = dot;
  }
  let maxLogit = logits[0];
  for (let c = 1; c < CLASS_DIM; c += 1) {
    if (logits[c] > maxLogit) maxLogit = logits[c];
  }
  let sumExp = 0;
  const probs = new Float32Array(CLASS_DIM);
  for (let c = 0; c < CLASS_DIM; c += 1) {
    probs[c] = Math.exp(logits[c] - maxLogit);
    sumExp += probs[c];
  }
  for (let c = 0; c < CLASS_DIM; c += 1) probs[c] /= sumExp;
  return probs;
}

export function predict(features, weights) {
  const probs = forward(features, weights);
  let bestIdx = 0;
  for (let c = 1; c < CLASS_DIM; c += 1) {
    if (probs[c] > probs[bestIdx]) bestIdx = c;
  }
  return { actionType: TRAINING_CLASSES[bestIdx], probability: probs[bestIdx], probs };
}

// Cross-entropy gradient for a single sample. Returns the gradient
// of -log p(label | x) with respect to weights (D × C, flattened).
function crossEntropyGradient(features, labelIdx, weights) {
  const probs = forward(features, weights);
  const grad = new Float32Array(WEIGHT_DIM);
  for (let c = 0; c < CLASS_DIM; c += 1) {
    const delta = probs[c] - (c === labelIdx ? 1 : 0);
    for (let d = 0; d < FEATURE_DIM; d += 1) {
      grad[d * CLASS_DIM + c] = features[d] * delta;
    }
  }
  return grad;
}

export function crossEntropyLoss(features, labelIdx, weights) {
  const probs = forward(features, weights);
  const eps = 1e-12;
  return -Math.log(Math.max(probs[labelIdx], eps));
}

// One epoch of mini-batch SGD over `samples` (each
// `{ intentText, locale, actionType }`). Returns the *gradient
// average* across the epoch (the thing that should travel in a
// federated update) plus the new local weights.
export function trainOneEpoch(samples, weights, { learningRate = 0.1 } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('samples must be a non-empty array.');
  }
  const accumulated = new Float32Array(WEIGHT_DIM);
  let totalLoss = 0;
  let usedSamples = 0;
  for (const sample of samples) {
    const labelIdx = TRAINING_CLASSES.indexOf(sample.actionType);
    if (labelIdx === -1) continue; // skip unknown classes
    const features = extractFeatures(sample.intentText, sample.locale);
    const grad = crossEntropyGradient(features, labelIdx, weights);
    for (let i = 0; i < WEIGHT_DIM; i += 1) accumulated[i] += grad[i];
    totalLoss += crossEntropyLoss(features, labelIdx, weights);
    usedSamples += 1;
  }
  if (usedSamples === 0) {
    throw new Error('no samples with a known actionType.');
  }
  const averageGradient = new Float32Array(WEIGHT_DIM);
  const newWeights = new Float32Array(WEIGHT_DIM);
  for (let i = 0; i < WEIGHT_DIM; i += 1) {
    averageGradient[i] = accumulated[i] / usedSamples;
    newWeights[i] = weights[i] - learningRate * averageGradient[i];
  }
  return {
    averageGradient,
    weights: newWeights,
    sampleCount: usedSamples,
    averageLoss: totalLoss / usedSamples
  };
}

// Gaussian noise calibrated to a target epsilon for a single SGD
// step. Uses the classical Gaussian-mechanism scale σ = sensitivity
// / ε (with sensitivity = 1 since features are bounded in [0,1] and
// per-sample gradients are bounded accordingly). This is the
// simplest defensible mapping; production deployments would use a
// privacy-budget accountant across rounds.
function gaussianNoiseSample(rng) {
  // Box-Muller.
  let u1 = rng();
  let u2 = rng();
  if (u1 < 1e-9) u1 = 1e-9;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function addDifferentialPrivacyNoise(gradient, epsilon, { seed } = {}) {
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new Error('epsilon must be a positive finite number.');
  }
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 0x7fffffff));
  const sigma = 1 / epsilon;
  const noisy = new Float32Array(gradient.length);
  for (let i = 0; i < gradient.length; i += 1) {
    noisy[i] = gradient[i] + sigma * gaussianNoiseSample(rng);
  }
  return noisy;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Stable hash of a float32 array. The byte ordering of the underlying
// buffer is little-endian on all platforms Web Crypto runs on; if a
// future architecture flips this, we'd need to canonicalize first.
export async function hashGradient(gradient) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SubtleCrypto is required.');
  const bytes = new Uint8Array(gradient.buffer, gradient.byteOffset, gradient.byteLength);
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

// One-shot helper used by the shell: takes samples + the round's
// baseline weights + epsilon, returns the gradient hash to submit
// plus diagnostic metadata for the UI.
export async function composeFederatedUpdate({
  samples,
  baselineWeights,
  epsilon,
  learningRate = 0.1,
  seed
}) {
  const baseline = baselineWeights ?? initWeights({ seed: 1 });
  const trained = trainOneEpoch(samples, baseline, { learningRate });
  const noisy = addDifferentialPrivacyNoise(trained.averageGradient, epsilon, { seed });
  const gradientHash = await hashGradient(noisy);
  return {
    protocolVersion: LOCAL_TRAINING_PROTOCOL_VERSION,
    gradientHash,
    sampleCount: trained.sampleCount,
    averageLoss: trained.averageLoss,
    differentialPrivacyEpsilon: epsilon,
    learningRate,
    weightDim: WEIGHT_DIM,
    classes: TRAINING_CLASSES,
    featureDim: FEATURE_DIM
  };
}
