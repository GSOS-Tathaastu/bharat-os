# ADR 0155 — Phase 13.0.2: SLM-E document summary persistence (MemoryRecord + `doc.summarised` ledger event)

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.0 SLM-E (ADR 0149) shipped the on-device document
summariser; ADR 0149 explicitly deferred summary persistence with
this language:

> "v1 is generate-and-render. The summary lives on screen until the
>  citizen reloads the surface. Persisting to a citizen MemoryRecord
>  + emitting a `doc.summarised` ledger event is the §13.0.x roll-up
>  and lands in Phase 13.0.2."

Phase 13.0.2 closes that deferral. It is the FIRST BE delta in the
SLM-E arc (13.0 + 13.0.1 were FE-only by design). The substrate it
needs already exists:

- `createMemoryRecord(identity, plaintext, { source, … })` already
  takes a `source` envelope (per the existing memory substrate). No
  new top-level field is required; we encode doc-summary semantic
  via `source.type === 'doc_summary_v1'`.
- The Phase 13.2 piiRedaction normaliser (ADR 0152) is the canonical
  reference for the boundary-validation posture: **strict allowlist
  > denylist**, ISO-8601 ms-dropped, count-only envelope.
- The audit ledger already emits other `*.*` events through
  `appendLedgerEvent`; we add `doc.summarised` next to them.

## Decision

Ship Phase 13.0.2 as one new BE module + one FE library + a Save
affordance on the existing panel:

1. **`src/phase0/doc-summary-envelope.mjs`** — strict-allowlist
   normaliser + ledger event builder. PERMITTED_SOURCE_KEYS gate
   the top-level envelope; PERMITTED_PDF_FINGERPRINT_KEYS gate the
   nested PDF provenance object. `normaliseDocSummarySource` runs
   on every POST whose `source.type === 'doc_summary_v1'`; for any
   other source.type the request flows through the existing
   substrate unchanged (citizen notes still work).
2. **`src/phase0/api.mjs`** — when the body is a valid
   `doc_summary_v1`, persist via `createMemoryRecord` then emit a
   `doc.summarised` ledger event with `at: record.createdAt`. 400
   `invalid_doc_summary_source` on malformed envelopes — surfaces
   `err.message` from the normaliser (the messages are designed to
   be safe to echo).
3. **`frontend/src/lib/doc-summary-source.ts`** —
   `buildDocSummarySource({ parsed, modelPackId, pdf, now })` shapes
   the envelope and `renderSummaryPlaintext(parsed)` produces the
   citizen-readable encrypted body. The plaintext is a stable
   `TITLE: … / TLDR: … / BULLET_N: …` line shape so a later
   parser can round-trip it back to chips.
4. **`frontend/src/components/DocSummariserPanel.tsx`** — Save
   summary button rendered in the SummaryChipBlock area, wired to
   `useCreateMemoryRecord`. The PDF fingerprint captured at
   pick-time (`pages`, `truncatedReason`) flows onto the envelope
   if present; manual text edits invalidate it silently and surface
   a notice (see SF-4 below).

### What lands on the ledger event

```
type:           "doc.summarised"
recordId:       bos:memory:<id>           (pointer)
ownerId:        bos:person:<id>           (pointer)
docKind:        electricity_bill | …      (enum, allowlist)
modelPackId:    bos:slm-model-pack:…      (≤128 chars)
titleLength:    integer in [0, 240]       (count-only)
tldrLength:     integer in [0, 240]       (count-only)
bulletCount:    integer in [0, 16]        (count-only)
confidence:     float in [0, 1]
riskFlag:       none | attention | urgent (enum, allowlist)
language:       English | Hindi | …       (enum, allowlist)
pdfFingerprint: { pages, truncatedReason } | null
generatedAt:    ISO-8601 UTC instant      (ms stripped, MF-3)
at:             ISO-8601 UTC instant      (ms stripped, MF-1)
```

### What MUST NOT land on the ledger event

The title string, the TLDR string, the bullet strings, the source
PDF bytes, the extracted text, any raw hashes of citizen-typed
content. These all live encrypted in the MemoryRecord bundle; the
ledger event only carries the **pointer** (recordId) + the meta
envelope above. The §15 binding (pointer-not-payload, strict
allowlist > denylist) is the canonical reference.

## Adversarial review — applied fixes

The adversarial review run (3 lenses: privacy, UX, edge-cases +
triage synthesiser) produced a ship_with_fixes verdict with 3
must-fix + 6 should-fix. All applied before commit:

- **MF-1** — `buildDocSummarisedLedgerEvent` strips ms from `at`
  the same way it strips ms from `generatedAt`. The original code
  inherited `record.createdAt` from `nowIso()` at full ms
  precision; without the strip the typing-speed fingerprint
  defence from Phase 13.2 MF-3 was cosmetic. Direct regression
  test added.
- **MF-2** — `savingRef = useRef(false)` synchronous in-flight
  guard in `DocSummariserPanel.handleSaveSummary`. The button's
  `disabled` clause catches re-renders but a same-tick double
  click can still arrive twice; the ref flips before any state
  write so the second call short-circuits. Textarea onChange when
  transitioning out of `saved` also nukes `lastResult` + calls
  `reset()` so the chip block + Save button unmount (no Save
  badge over text that no longer matches the saved record).
- **MF-3** — citizen-readable cleartext label is `${kind} ·
  ${YYYY-MM-DD}` (meta only), not the parsed document title
  (titles can carry PII such as consumer numbers / counterparty
  names). The title itself lives in the encrypted body and only
  renders after a memory.read consent. Badge copy tightened from
  "readable only after consent" to "body readable from
  /citizen/notes under your active memory.read consent" so the
  user isn't misled about what's visible without consent.
- **SF-1** — the FE↔BE convergence test now reads
  `frontend/src/lib/doc-summariser.ts` at runtime and regex-extracts
  the DocKind + DocLanguage unions, asserting set-equality with the
  BE allowlists. A drift PR (e.g. FE adds `gst_invoice` without
  updating BE) trips this test loudly. Was previously a
  literal-array sanity check that drift could pass silently.
- **SF-2** — single source of truth for the JSON-grep
  defence-in-depth: `FORBIDDEN_LEDGER_SUBSTRINGS` exported from
  `src/phase0/doc-summary-envelope.mjs` and consumed by every
  envelope rejection probe AND every ledger-event grep test (pure
  builder + HTTP integration). Grown to 23 substrings including
  synonyms a future regression could slip past a narrower list
  (caption / excerpt / plain / summary / content / transcript /
  firstPageText / headline / paragraph).
- **SF-3** — `normaliseDocSummarySource` now round-trips
  `generatedAt` through `Date.parse` after the regex pass. The
  regex previously accepted structurally-valid but calendar-invalid
  instants (e.g. `2026-13-99T99:99:99Z`); a future audit replay
  could `new Date(generatedAt)` and silently get NaN.
- **SF-4** — textarea onChange now sets an explicit pdfNotice
  ("Edited after PDF pick — this summary will be saved as pasted
  text, not as the PDF you picked.") instead of silently dropping
  the prior notice. The edit changes the semantic of the upcoming
  Save and the user needs to know.
- **SF-5** — `SAVE_ERROR_COPY` map keyed on `err.code` drives the
  user-visible message. Raw `err.message` goes to `console.warn`
  in DEV only. `invalid_doc_summary_source` is the only known 400
  path; everything else falls back to a generic line.
- **SF-6** — drop docKind from the MemoryRecord `tags` array.
  docKind already lives on the doc.summarised ledger event (a
  separate consent-gated surface); duplicating it on the
  unencrypted notes row would create a second cleartext channel
  that leaks even when the citizen revokes memory.read.

## Why this isn't a §13.0.0a-style runtime refactor

This phase doesn't touch the shared wllama singleton (ADR 0150),
doesn't add a new SLM consumer, and doesn't change any existing
SLM hook. The only new external API is the existing
`POST /api/memory-records` endpoint — extended at the boundary
with a new accepted `source.type`. Zero new npm deps; zero new
external service integrations.

## Consequences

- The SLM-E arc gets its persistence loop closed: a citizen who
  taps Save now has a consent-gated, encrypted-at-rest record in
  their notes AND a pointer-not-payload audit-ledger event.
- Future SLM-F / SLM-G / SLM-H consumers that produce structured
  on-device output (PII-redacted notes, personalised briefs, doc
  classifications) can compose the same `source` pattern — pick a
  new `type`, write a strict normaliser next to this one, emit a
  pointer-not-payload event. The substrate is now precedent.
- `/citizen/notes` will surface these saves with `${kind} ·
  ${date}` labels. Reading the body requires an active
  memory.read consent — the existing path; no new surface.

## Tests

- `tests/node/doc-summary-envelope.test.mjs` — 23 cases. Pure
  module: pinned protocol version, happy round-trip, strict
  allowlist rejections (FORBIDDEN_LEDGER_SUBSTRINGS as the probe),
  type-mismatch rejection, enum-mismatch rejections, count caps,
  modelPackId length cap, pdfFingerprint optionality, MF-1 +
  SF-3 regression. HTTP integration: persist + emit happy path,
  malformed envelope returns 400 + no side effects, non-doc-summary
  source flows unchanged + emits no event.
- `frontend/src/lib/doc-summary-source.test.ts` — 6 cases.
  `buildDocSummarySource` shape + pdfFingerprint passthrough,
  §15 grep guard against parsed-string leakage,
  `renderSummaryPlaintext` line shape + byte stability.
- Full sweep at commit time: 388 vitest + 1256 Node + tsc clean.

## Follow-ups (deferred)

- Read-side surface: `/citizen/notes` already lists MemoryRecords
  but doesn't yet branch on doc_summary_v1 to render a chip
  preview after the consent unlock. Tracked separately.
- ADR 0149's "round-trip TLDR plaintext back to chips" is now
  possible because `renderSummaryPlaintext` is byte-stable. A
  future SLM-E read path can parse the encrypted body back to
  fields. Deferred — citizens see the plaintext as-is for v1.
