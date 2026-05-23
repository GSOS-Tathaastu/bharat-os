# ADR 0055: Indic TTS Runtime Scaffold

## Status

Accepted

## Context

Phase 2a queue item #6 is real Indic text-to-speech via IndicTTS-WASM or a
Bhashini-class SDK. The user-facing shell already returns localized responses,
but speaking those responses should not depend forever on ad hoc browser
behavior. As with ASR, the production engine requires model/runtime assets that
are too large to bake into the repository casually.

## Decision

Extend the Phase 2a voice runtime contract for TTS:

- `src/phase1/voice-runtime.mjs` now defines TTS locale support, TTS model-pack
  metadata, and TTS runtime planning.
- `BosStore` persists `tts-model-packs/` and `tts_model_pack.saved` ledger
  events.
- The API exposes `GET /api/tts/runtime`, `GET /api/tts/model-packs`, and
  `POST /api/tts/model-packs`.
- `/shell/` loads a TTS runtime plan for the active locale and renders a
  `Listen` control beside localized orchestration responses.
- Until an IndicTTS WASM decoder is wired, the shell uses browser
  `speechSynthesis` as the demo playback path.

TTS model packs store metadata only: locale, model ID, engine, byte count,
optional hash, source, and install time. Model bytes are not persisted in
receipts.

## Consequences

- Bharat OS can now speak localized result text through the browser path and has
  a clear API contract for replacing that with IndicTTS-WASM.
- Remaining hardening: decoder/model delivery, Bhashini SDK evaluation,
  voice selection per language, streaming playback, cache eviction, and latency
  tests on target Android phones.
