# ADR 0054: Indic Voice Runtime Scaffold

## Status

Accepted

## Context

Phase 2a queue item #5 is real Indic voice via IndicWhisper-WASM, replacing the
browser Web Speech API where possible. A production implementation needs large
model packs and a WASM decoder, but the OS contract can be built first so the
PWA knows when to use offline ASR, when to fall back to Web Speech, and when to
show text-only input.

## Decision

Add a Phase 2a.5 voice-runtime scaffold:

- `src/phase1/voice-runtime.mjs` defines the first ASR locale set:
  Hindi, Marathi, Bhojpuri, Tamil, Bengali, and Indian English.
- Voice model packs are metadata artifacts only: locale, engine, model ID,
  byte count, optional SHA-256, source, and install time.
- `BosStore` persists `voice-model-packs/` and ledger events for
  `voice_model_pack.saved`.
- The API exposes `GET /api/voice/runtime`, `GET /api/voice/model-packs`, and
  `POST /api/voice/model-packs`.
- `/shell/` asks the API for a runtime plan for the active profile locale. The
  plan prefers an installed Indic Whisper WASM model pack, falls back to Web
  Speech when available in a secure context, and otherwise leaves text input as
  the safe path.

## Consequences

- Bharat OS now has a testable contract for offline Indic ASR without shipping
  a large model binary in the repository.
- The current PWA still uses Web Speech for live recognition unless a future
  WASM decoder + model pack is wired in. Model bytes are not stored in receipts.
- Remaining hardening: side-load/download flow for model packs, WASM decoder
  integration, streaming microphone frames into the decoder, model cache
  eviction, and latency tests on target Android devices.
