# ADR 0056: On-Device SLM Runtime Scaffold

## Status

Accepted

## Context

Phase 2a queue item #7 is an on-device small language model via WebGPU plus
`transformers.js` or `llama.cpp.wasm`. The production model pack is large
(roughly 1-2 GB) and cannot be bundled casually, but Bharat OS needs a runtime
contract that lets the PWA prefer local inference when a model is installed and
fall back to deterministic rules when it is not.

## Decision

Add a Phase 2a.7 on-device model scaffold:

- `src/phase1/on-device-model.mjs` defines supported local SLM tasks,
  model-pack metadata, and runtime planning.
- `BosStore` persists `on-device-model-packs/` and
  `on_device_model_pack.saved` ledger events.
- The API exposes `GET /api/on-device/runtime`,
  `GET /api/on-device/model-packs`, and `POST /api/on-device/model-packs`.
- `/shell/` loads an intent-planning runtime plan and carries a small
  `metadata.onDeviceRuntime` summary with orchestration requests.

Model packs store metadata only: model ID, family, runtime, byte count, optional
hash, capabilities, locale coverage, source, and install time. Model weights are
not persisted in receipts.

## Consequences

- The PWA now has a testable local-LLM slot without shipping a large model.
- The current L7/L8 path remains deterministic until an actual WebGPU/WASM
  decoder and model pack are installed.
- Remaining hardening: model download/side-load UX, cache quota handling,
  WebGPU feature detection, inference worker isolation, prompt contract,
  latency/memory benchmarks, and graceful thermal/battery fallback.
