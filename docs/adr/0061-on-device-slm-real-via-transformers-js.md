# ADR 0061: Real On-Device SLM via transformers.js (Multilingual MiniLM)

## Status

Accepted

## Context

Phase 2a queue item #7 in `BHARAT_OS.md` §17 — and §7e's whole
*Adaptive Model Router* thesis — both depend on a real on-device small
language model. ADR 0056 added the scaffold (metadata, API endpoints,
runtime-plan shape) but the runtime itself stayed deterministic. The
diagnostics panel honestly labeled 2a.7 as *placeholder*.

For the investor demo, the §1 "AI runs on your phone, not in someone
else's cloud" promise needs to be materialized at least once, with a
visible model download + a visibly-real classification. Without that,
the §7e architecture is theory.

The constraint is size. §17 footprint tiers are explicit: Tier 4
(1.5–4 GB SLM) is opt-in, flagship-only, not the default load. We
need a model that fits **Tier 3 (~30–150 MB)** and is **genuinely
multilingual** so §1 / §7a / §17 stay honest.

## Decision

Phase 2a.12 ships a real on-device intent classifier built on
**transformers.js + `Xenova/paraphrase-multilingual-MiniLM-L12-v2`**:

- **Model**: ~120 MB quantized multilingual MiniLM (50+ languages,
  including all five Bharat OS L8 languages). Embedding model, not
  generative — fits the size budget while remaining real ML.
- **Runtime**: transformers.js loaded from
  `cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2`. WASM backend by
  default; uses WebGPU when available. Browser cache (IndexedDB)
  persists weights after first download.
- **Classification approach**: embed the user's intent + six canonical
  action descriptions (English + code-mixed Indic-script + romanized
  phrases per action), then pick top action by cosine similarity. The
  top score and all-action scores ship in the orchestration metadata.
- **User-triggered warm-up**: a "Load on-device AI (≈120 MB, cached
  after)" button in the shell starts the download with a visible
  progress bar. Cached on subsequent loads.
- **Routing rule**: when the classifier is loaded *and* the top
  similarity > 0.55 *and* the margin over runner-up > 0.04, the shell
  sets `actionType` directly from the classifier's top pick.
  Otherwise the deterministic L7 vernacular module decides — same
  behavior as before. This keeps the classifier from overruling
  obvious cases incorrectly.
- **Receipt evidence**: orchestrations now carry
  `metadata.onDeviceClassification` with `topAction`, `topSimilarity`,
  `scores[]`, `modelId`, `runtime`. The flow card surfaces this as
  an extra `L8 on-device SLM · service_booking 91%` row above the
  L7/L6/L4 plan.
- **Model-pack persistence**: on successful warm-up the shell POSTs to
  `/api/on-device/model-packs` so the existing Codex-built runtime
  metadata in the store reflects that a real local model is installed.
  This makes the §7e adaptive-router plan accurate going forward.
- **Diagnostics panel**: row 2a.7 is now dynamic — `placeholder`
  before warm-up, `partial` during load, **`real`** once cached. The
  detail line updates to name the loaded model.

## Consequences

- The §1 / §7a / §7e "AI on the phone" promise is now demonstrable
  with one visible click + a 120 MB download + a real similarity score
  printed in the flow card. *"This is the on-device multilingual
  MiniLM, no cloud, classifying your Hindi voice intent into a
  Bharat OS action template"* — a real moment.
- The §17 footprint accounting holds: 120 MB Tier 3, opt-in, cached
  after first load. The base shell stays ~7 MB.
- The Tier 4 1.5–4 GB generative SLM (Sarvam-1 q4, Gemma 2 q4 etc.)
  is still the larger sovereignty upgrade and remains a future
  increment. This ADR gives the foundation runtime path (transformers.
  js + browser cache + WASM/WebGPU detection) that the bigger model
  will reuse.
- transformers.js is loaded from a CDN. The service worker passes
  cross-origin requests through (added in 2a.8), so the model bytes
  don't compete with the same-origin app-shell cache. For a fully
  offline / curated build, the model and library bytes would be
  vendored into `public/shell/vendor/` — a future hardening note.
- No node-side tests are added. transformers.js requires WebGPU /
  WASM browser APIs not present in Node's test runner. The integration
  surface is verified manually in the demo: warm-up button → progress
  bar → ready → orchestration flow shows the SLM row. The
  `ondevice-slm.mjs` module is intentionally a thin layer over
  `pipeline('feature-extraction', …)` so there is little custom logic
  to unit-test.
- Failure modes are safe: CDN unreachable, browser cache full, WASM
  not available — each fails the warm-up with a visible error and
  the shell falls back to deterministic L7 with no behavioral change.

## Future hardening

- Vendor transformers.js and the model bytes into `public/shell/vendor/`
  so the demo doesn't need internet for the first load.
- Add WebGPU feature detection + preference (currently WASM by default
  through transformers.js auto-selection).
- Add a "generate response" path using a Tier 4 generative model
  (Sarvam-1 q4 / Gemma 2 q4) under an explicit opt-in flag.
- Persist per-locale + per-user embeddings so the classifier learns
  the user's phrasing over time — federated-learning-friendly
  (§7f Phase 3 commitment).
- Treat the embedding as the L8 intent representation and pass a small
  vector summary into the orchestrator so downstream tools can do
  semantic matching (e.g., "is this booking like the previous one?").
