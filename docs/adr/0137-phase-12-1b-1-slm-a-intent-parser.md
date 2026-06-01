# ADR 0137 — Phase 12.1b.1: SLM-A vernacular intent parser

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.1a (ADRs 0135 + 0136) closed the marketplace loop —
citizens can browse, lock escrow, and book providers end-to-end.
The next sequencing block per ROADMAP is **Phase 12.1b — the
AI-orchestration layer**, scoped as ~3 wks of work split into four
sub-phases (SLM-A through SLM-D).

Phase 12.1b.1 ships the first sub-phase: **on-device SLM intent
parsing**. Today the citizen types or speaks an intent; the server
runs deterministic vernacular regex (`src/phase1/vernacular.mjs`,
5 languages + en-IN). The substrate works but is brittle on
code-mixed text and ignores any on-device SLM the citizen has
installed via Phase 9.0c. Phase 12.1b.1 pre-parses the intent on
the citizen's device (using wllama from Phase 9.0c), submits the
parsed annotation alongside the raw text, and records an
agreement-verdict ledger event for audit — without ever
overriding the server-side deterministic parse.

## Decision

### 1. Annotation pass-through (NEVER override)

The §15 binding is non-negotiable: **the user controls their
intent interpretation**. The SLM annotation is a confidence
signal recorded for transparency + audit, not a routing signal.
The server's deterministic vernacular substrate remains the
source of truth for actionType, consent scoping, and skill
preflight.

### 2. Backend surface

`src/phase0/intent-annotation.mjs` (NEW) — pure validator +
comparer + ledger event builder:

```js
normaliseIntentAnnotation(raw) =>
  { protocolVersion, actionType, confidence (0..1),
    detectedLanguage, entities[<=16], rationale<=280,
    modelPackId, generatedAt }

compareIntentAnnotation(annotation, serverActionType) =>
  'agreed' | 'disagreed' | 'fe_only' | 'server_only' | 'absent'

buildIntentAnnotationLedgerEvent({...}) =>
  {type: 'intent.slm_<verdict>', orchestrationId,
   serverActionType, annotation: {actionType, confidence,
   detectedLanguage, modelPackId, entityCount}, verdict, at}
```

The annotation envelope is bounded at the boundary so a
misbehaving FE cannot pollute the ledger:
- max 16 entities
- 280-char rationale (CRLF/BOM stripped)
- confidence clipped to [0,1]
- actionType non-empty string (canonical comparison happens via
  the verdict, not at validation)

`src/phase1/orchestrator.mjs` echoes `intent.intentAnnotation`
onto `intent.slmAnnotation` on the orchestration record verbatim.
The server's `actionRequest.actionType` is computed by
`inferActionTypeFromNormalized` and **NEVER** consults the
annotation — tested via a deliberate disagreement fixture.

`src/phase0/api.mjs` POST /api/orchestrations accepts the
annotation under either `body.intentAnnotation` or
`body.metadata.intentAnnotation` (backward-compat with the
metadata envelope pattern), validates + clips via
`normaliseIntentAnnotation`, returns 400 `invalid_intent_annotation`
on malformed input, and emits the verdict ledger event after
`saveOrchestration`.

### 3. Frontend surface

`frontend/src/lib/intent-parser.ts` (NEW) — pure prompt builder
+ completion parser:

- `INTENT_ACTION_TYPES` — 8 canonical types matching the
  orchestrator taxonomy (vitest contract pins this).
- `buildIntentParsePrompt(intentText)` — clips raw text, embeds
  the action gloss + structured-output instruction
  (ACTION/LANGUAGE/CONFIDENCE/RATIONALE).
- `parseIntentCompletion(completion)` — regex-extracts the four
  fields. Returns `null` when no canonical action type can be
  extracted (so the chip hides and the server-side parse stands
  alone). Clamps confidence, tolerates dashes/case, rejects
  markdown-wrapped values.
- `actionTypeFriendlyLabel(actionType)` — non-technical chip text.

`frontend/src/lib/use-slm-intent-parser.ts` (NEW) hook:

- Lazy: wllama + GGUF bytes only loaded on the first `parse()`
  call. Citizens with no SLM installed pay zero bytes for the
  runtime and never see the chip.
- Status state machine: `unavailable` → `ready` → `loading
  (progress)` → `parsing` → `ready` (or `error`).
- Reuses Phase 9.0c `loadSlmRuntime` + `readSlmBlob` from OPFS.
- Cleans up runtime on unmount.

`frontend/src/routes/CitizenHome.tsx` integration:

- Chip row hidden when no SLM installed. Visible-with-hint when
  text < 3 chars; visible-with-button when text ≥ 3 chars.
- "Check my understanding" button (non-technical copy per
  adversarial MF-4) triggers `slmParser.parse(text)`.
- Soft Badge: "We understood: <Friendly> · <lang> · confidence
  <pct>%" with tooltip explaining the citizen still decides.
- `handleSend` includes the annotation **only when** (a) parsed
  intent is present, (b) the textarea hasn't been edited since
  parse (tracked via a `parsedFromText` snapshot ref), and
  (c) voice interim is empty.
- Textarea `onChange` invalidates `parsedIntent` immediately on
  edit so a stale annotation cannot land.

### 4. Languages + supply

Phase 12.1b.1 ships with the same 5 languages + en-IN as the
deterministic substrate (Hindi, Marathi, Bhojpuri, Tamil, Bengali,
English). Adding the remaining 17+ official + regional languages
requires SLM model-pack additions tuned for those tokens, which
needs separate evaluation. Deferred to Phase 12.1b.2 alongside
the SLM-B offline-first decisioning piece.

### 5. Bindings (§15)

- The annotation is a confidence signal, **NEVER an override**
  — enforced at the orchestrator layer (deterministic actionType
  wins) and tested.
- Prompt + completion stay on-device. Only the structured
  annotation envelope crosses the boundary, and only when the
  citizen taps Send.
- Annotation cannot carry raw audio / video / arbitrary blobs —
  validator enforces a tight schema with field caps.
- Verdict ledger event payload contains only `{verdict,
  orchestrationId, serverActionType, annotation:
  {actionType, confidence, detectedLanguage, modelPackId,
  entityCount}}` — no raw intent text, no entity values.
- Binding-grep test on `intent-annotation.mjs` forbids
  `override` / `routeTo` / `force*` field names.

## Process

1. **Understanding workflow** — 4 parallel Explore agents mapped
   the vernacular substrate, wllama runtime, orchestrator intent
   flow, and locked bindings.
2. **Implementation** — substrate → orchestrator → API → tests →
   FE lib → hook → CitizenHome integration.
3. **Adversarial review workflow** — 3 lenses (privacy / safety
   / UX) + triage. Privacy verdict: `ship_clean`. Safety: 1
   should-fix (reentrant parse de-dup + post-unmount setState).
   UX: 4 must-fix. All applied before commit.

## Adversarial fixes applied

Must-fix (4):
- **STALE-ANNOTATION-VOICE-INTERIM** (`handleSend` gate didn't
  account for voice interim or whitespace edits). Fixed via
  `parsedFromText` snapshot + interim-pending guard.
- **PARSE-BUTTON-HIDDEN-ON-ERROR** (error UX was terminal).
  Added a Retry button + clearer copy.
- **CHIP-CLEARS-SILENTLY-ON-SEND** (chip vanished between
  repeat sends, forcing a re-parse). Fixed: keep the chip
  when text unchanged; clear immediately on `onChange` edit.
- **BUTTON-LABEL-JARGON** ("Parse with my SLM" was jargon for
  vernacular citizens). Replaced with "Check my understanding"
  + "Understanding on-device…" + "Loading on-device model".

Should-fix (2 + 3 test cases):
- **POST-UNMOUNT-SETSTATE** — `mountedRef` + `safeSetStatus`
  prevent React warnings when long WASM loads resolve after
  unmount.
- **REENTRANT-PARSE-GUARD** — `inflightRef` returns the same
  promise on concurrent `parse()` calls so a rapid double-tap
  doesn't race two blob reads.
- **EDGE-CASE-TESTS** — 3 new vitest cases pinning rejection
  of backtick / markdown-bold / unknown action values.

Should-fix deferred (with rationale):
- **MIN-LENGTH-HINT** — applied (added "Type a bit more so I
  can understand it for you." under 3 chars).
- **CONFIDENCE-LABEL** — applied (qualifier added).

Deferred to Phase 12.1b.2+:
- Disagreement re-prompt UI (belongs with SLM-D negotiation).
- Streaming token display (current is wait-for-completion).
- Cold-start P50/P90 telemetry (no measurement basis yet).
- Vernacular layout responsive (no vernacular labels in scope).

## Files

NEW (BE):
- `src/phase0/intent-annotation.mjs`
- `tests/node/intent-annotation.test.mjs` (18 cases)

EXTENDED (BE):
- `src/phase1/orchestrator.mjs` — echoes `intent.slmAnnotation`.
- `src/phase0/api.mjs` — validates annotation, emits verdict
  ledger event.

NEW (FE):
- `frontend/src/lib/intent-parser.ts`
- `frontend/src/lib/use-slm-intent-parser.ts`
- `frontend/src/lib/intent-parser.test.ts` (15 vitest cases)

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `SendIntentInput` carries optional
  annotation.
- `frontend/src/routes/CitizenHome.tsx` — chip row + handleSend
  annotation gate + edit-invalidate.

## Consequences

- **Marketplace + AI-orchestration loop starts closing.** Citizens
  with an installed SLM see their device's interpretation of
  what they typed before sending, building trust in on-device AI.
  Citizens without an SLM see no change (chip hidden), keeping
  the demo path unbroken.
- **Audit-rich agreement signal** lands on the ledger. An
  operator can replay `intent.slm_agreed` / `intent.slm_disagreed`
  / `intent.slm_fe_only` / `intent.slm_server_only` events to
  measure how often the on-device SLM tracks the deterministic
  substrate — useful for tuning future SLM-A model packs.
- **Common-features extraction** holds: `intent-annotation.mjs`
  is a phase0 substrate (any future module can compose),
  `intent-parser.ts` + `use-slm-intent-parser.ts` are FE lib
  modules ready for SLM-C dynamic forms + SLM-D negotiation
  agent to compose.
- **No new npm dep.** Reuses Phase 9.0c wllama lazy chunk; main
  bundle grew +7 KB.

## What's NOT in 12.1b.1 (deferred)

- Phase 12.1b.2 — SLM-B offline-first decisioning + queued sync.
- Phase 12.1b.3 — SLM-C on-device dynamic forms (per-role
  onboarding wizard).
- Phase 12.1b.4 — SLM-D negotiation agent for marketplace.
- 17+ additional Indian languages (need separate SLM model packs
  trained on those tokens).
- Disagreement re-prompt UI ("the SLM and the substrate
  disagree — which did you mean?").
- Streaming token display (current is wait-for-completion).
- Cold-start latency telemetry + per-pack tuning.
- Federated round fine-tuning of the intent parser specifically.

## Test results

- Node tests: **993/993 green** (+18 new intent-annotation tests).
- Vitest: **81/81 green** (+15 new intent-parser contract tests
  including 3 adversarial edge-case rejections).
- tsc: clean.
- Build: main 557 → 565 KB / 159 KB gzipped (+8 KB for the
  intent parser + hook + CitizenHome integration). wllama lazy
  chunk unchanged.
