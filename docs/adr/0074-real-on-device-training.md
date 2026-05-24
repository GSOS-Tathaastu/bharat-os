# ADR 0074: Phase 3.1 — Real On-Device Training for §7f Rounds

## Status

Accepted

## Context

Phase 3.0 (ADR 0071) shipped the §7f federated round substrate
with a *placeholder* gradient hash on the client. The substrate
itself enforced the protocol — donation consent gate, DP epsilon
cap, signed updates, deterministic aggregation — but the
"gradient" was just `SHA-256(roundId : identityId : timestamp)`.
Honest scaffolding, but not training.

ADR 0071's future-work list named this gap: *"Real on-device
training via TensorFlow.js or ONNX Runtime Web. The placeholder
client gradient hash becomes a real gradient vector hash computed
after one local epoch on the user's data."*

The two big-library options (TF.js, ONNX Runtime Web) ship 1-5 MB
of bundle for our scale of model and require WebAssembly init. A
small classifier head — what real federated systems actually
fine-tune — fits in 200 lines of pure JS and runs in microseconds
per epoch. That's what Phase 3.1 ships.

## Decision

### New artifact — `src/phase1/local-training.mjs`

Pure-JS implementation of a multinomial logistic regression
classifier head over a fixed 36-feature × 6-class space (216
weights total). Browser-usable AND node-testable via Web Crypto
(available in Node 18+).

Public surface:

- **`extractFeatures(intentText, locale) → Float32Array(36)`** —
  bias + length + word-count + has-digit + ASCII / Devanagari /
  Tamil / Bengali script flags + locale one-hot (7 + other) + per-
  class trigger-word booleans (~22 triggers across the six
  classes).
- **`initWeights({ seed }) → Float32Array(216)`** — small uniform
  init, seeded for determinism.
- **`forward(features, weights) → Float32Array(6)`** — softmax
  probabilities.
- **`predict(features, weights) → { actionType, probability, probs }`**
  — argmax + the full distribution.
- **`trainOneEpoch(samples, weights, { learningRate })`** — one
  pass of mini-batch SGD over samples
  (`{ intentText, locale, actionType }`). Returns the average
  gradient, new weights, sample count, and average loss.
- **`addDifferentialPrivacyNoise(gradient, epsilon, { seed })`** —
  Gaussian mechanism with σ = 1/ε (sensitivity = 1 since
  features ∈ [0,1] and the bounded gradient inherits the bound).
- **`hashGradient(gradient)`** — SHA-256 over the float32 byte
  buffer, formatted as `sha256:<hex>` (matches the existing
  gradient-hash format the federated round substrate expects).
- **`composeFederatedUpdate({ samples, baselineWeights, epsilon,
  learningRate, seed })`** — one-shot helper: extract → train →
  noise → hash. Returns a versioned envelope with the gradient
  hash, sample count, average loss, and ε declaration.

### Browser integration

The shell's `joinFederatedRound` flow (Phase 3.0 added the placeholder)
now:

1. Loads `/shell/local-training.mjs` (aliased server-side to
   `src/phase1/local-training.mjs` so we have one canonical copy,
   same trick as `vault-transfer.mjs`).
2. Gathers labeled samples — `gatherLocalTrainingSamples` reads
   the user's orchestration history from `/api/orchestrations`,
   shapes each into `{ intentText, locale, actionType }`. Falls
   back to a small seeded warm-up corpus (6 samples across all 6
   classes) so a brand-new profile can still train something.
3. `composeFederatedUpdate(...)` runs the math.
4. Submits the resulting gradient hash + `sampleCount` to the
   existing `/api/federated/rounds/:id/updates/sign-and-submit`
   route.

The result row in the shell now reads
*"Trained locally on N samples · ε X · update accepted +₹Y"*
instead of just *"Joined — update accepted"*.

### What gets trained

Action-type prediction from intent text + locale. Every Bharat OS
user types intents in their own pattern; the federated round
averages the gradients across thousands of devices to improve the
global classifier without raw text ever leaving any device. This
is exactly the §7f vignette: *"the model trains on-device using
the user's own data; only encrypted gradient updates (with
differential privacy noise) leave the device."*

The current classifier replicates what the vernacular regex table
already does deterministically — but it can *learn* new trigger
patterns from real user data over time. The regex table is the
honest fallback; the classifier is the federation upside.

### Service worker

`bharat-os-shell-v19 → v20`; `local-training.mjs` added to the
app-shell precache list so the federated join flow works offline
once the SW activates.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| No raw user data leaves the device | Sample gathering, feature extraction, gradient computation, DP noise, hashing — all happen in the browser. The control plane only ever sees the SHA-256 of the noisy gradient. |
| Pointer, not payload | The gradient bytes themselves never persist anywhere. Server stores the hash + DP ε claim + payoutPaise; that's it. |
| Donation consent required | Unchanged from ADR 0071. The Phase 3.1 swap is purely the math; the consent gate enforces the binding. |
| DP epsilon enforced | The federated round substrate (ADR 0071) refuses any update exceeding `maxEpsilon`. Phase 3.1 *applies* noise at the round's ε (passed through `composeFederatedUpdate({ epsilon })`); the server checks the claim matches the round cap. |
| Reproducible / auditable | The whole training pipeline is deterministic when seeded — every test runs with explicit seeds so the gradient hashes match exactly across runs. |

## Tests

`tests/node/local-training.test.mjs` — 12 focused tests:

1. feature extractor returns stable-length Float32Array
2. feature extractor detects locale + script (Tamil, Devanagari)
3. forward pass produces a probability distribution summing to 1
4. one gradient step decreases cross-entropy loss on a single
   sample
5. **200 epochs on a 6-sample dataset reaches ≥5/6 accuracy** —
   the model actually learns
6. trainOneEpoch refuses empty sample sets
7. trainOneEpoch refuses unknown actionTypes
8. DP noise magnitude scales correctly with 1/ε (low-ε noise
   dominates high-ε noise by >100x in expectation)
9. DP noise refuses non-positive ε
10. hashGradient is deterministic + produces `sha256:<64-hex>`
11. composeFederatedUpdate end-to-end returns a versioned envelope
12. composeFederatedUpdate is deterministic when seeded

Full suite: **261 / 261 green** (was 249; +12 new). SW cache to v20.

## Consequences

- **§7f is now real, not staged.** A user joining a federated
  round actually runs gradient descent on their own data and
  contributes a noisy hash. The substrate's protocol-level
  guarantees (ADR 0071) now sit on top of actual math.
- **The demo is honest.** The §17 footprint tier table still puts
  Tier 4 (full generative SLM, 1.5-4 GB) as future work; the
  classifier head fits comfortably in the always-loaded Tier 1
  shell (~50 KB). The investor sees real training, not a video.
- **The placeholder gradient hash is gone.** No `sha256:roundId-
  timestamp` shortcut anywhere in the codebase.
- **Aggregation upgrade is now visible.** Phase 3.0's
  `aggregateRound` still hashes the sorted gradient hashes; once
  we want real FedAvg, we'd need contributors to ship the actual
  noisy gradient bytes (not just the hash) so the server can
  average them. That's a §15 trade-off — sharing bytes weakens
  pointer-not-payload — which we'd negotiate via a separate
  "explicit data donation" round type (ADR 0071 future-hardening
  item #3).
- **261/261 tests**, SW cache to v20, browser bundle unchanged.

## Future hardening (Phase 3.2+)

- **FedAvg over noisy gradients** — see *Consequences* above. Needs
  contributors to ship gradient bytes (or encrypted gradient
  bytes via secure aggregation) rather than just the hash.
  Architecturally: a new round type
  `federated_round_bytes_donation` with a stricter consent gate.
- **Privacy-budget accountant** — track cumulative ε per
  contributor across rounds, refuse participation when the
  per-month budget is spent. Today the per-update ε is enforced
  but the cumulative bound is not.
- **Larger head** — bump the feature space to include
  on-device-SLM embeddings (Tier 3, paraphrase-multilingual-
  MiniLM-L12-v2 from ADR 0061) once warmed up. Gives the head
  semantic features instead of trigger words; should generalize
  better.
- **Per-device shuffled mini-batches** with epoch counts > 1.
  Today one epoch is one pass; multi-epoch local training
  produces stronger updates but spends more ε per submission.
- **Secure aggregation** — cryptographic primitive so the server
  averages gradients it cannot read individually. Big upside for
  the §15 binding; significant Phase 3.2+ work.
- **Real benchmark** — measure accuracy lift on a held-out
  Indic-intent dataset after N federated rounds vs. the static
  regex baseline. Today we only test that loss decreases
  in-sample; production needs cross-user lift.
