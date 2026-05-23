# ADR 0043: Multilingual L8 Vernacular Module

## Status

Accepted

## Context

ADR 0023 introduced deterministic Hindi / Hinglish intent normalization inside
`src/phase1/orchestrator.mjs` so the first vernacular regulated-flow path
worked without an LLM. The canonical product reference (BHARAT_OS.md §1, §7a)
commits Bharat OS to vernacular UX in 22 Indian languages, voice-first, with
romanized and native-script input as equal first-class signals. The single-
language Hindi normalizer was therefore a placeholder for a much larger seam.

`BHARAT_OS.md` §17 (added in this iteration) records L8 as the single biggest
delta between the product promise and the current code, and identifies the
vernacular module as the location where future Bhashini / IndicWhisper /
IndicTrans2 / IndicTTS integrations will land.

## Decision

Extract L8 vernacular handling out of the orchestrator into a dedicated module
at `src/phase1/vernacular.mjs`, owning:

- a `VERNACULAR_LANGUAGES` registry with script tests and disambiguating
  markers for Hindi (`hi`), Marathi (`mr`), Bhojpuri (`bho`), Tamil (`ta`),
  and Bengali (`bn`);
- a `VERNACULAR_INTENT_ALIASES` table that binds every canonical orchestration
  template to per-language patterns in both native script and romanized form;
- a `VERNACULAR_RESPONSES` table of short status phrases (`planned`, `blocked`,
  `completed`) for every canonical action type, in every supported language
  plus an English fallback;
- `normalizeIntent`, `inferActionTypeFromNormalized`, and `listSupportedLanguages`
  as the public API;
- `localizeResponse(actionType, status, locale)` which returns a localized
  status phrase with a graceful fallback chain (native locale → romanized
  variant → English).

When multiple languages match the same intent (common inside the Devanagari
family), matched aliases are re-ranked by a language-marker score so a Bhojpuri
sentence with `हमरा` / `चाहीं` does not get flagged as Hindi just because
Hindi is registered first.

The orchestrator now imports from `vernacular.mjs`, surfaces
`detectedLanguageId` on the normalized intent and action-request metadata, and
attaches the localized phrase as `localizedResponse` on the orchestration
receipt. The integrity verifier's canonical orchestration payload includes
`localizedResponse`, so the audit hash continues to cover the full receipt.

## Consequences

- L8 has a dedicated home — the next integrations (real Bhashini ASR / TTS /
  translation, generative UI renderer, additional languages) land here without
  touching the orchestrator.
- Vernacular coverage is now five languages (script + romanized) across all
  five canonical orchestration templates, plus localized response phrases.
- Existing `VERNACULAR_INTENT_ALIASES` / `normalizeIntent` import sites
  continue to work via re-exports from `orchestrator.mjs`.
- The audit hash on every orchestration now covers `localizedResponse`,
  preserving the §15 evidence-integrity guarantee.
- Vernacular support is still rule-based and deterministic — it is not a
  language model, and it does not handle Bhashini-mediated voice yet. Those
  remain the next L8 increments.
