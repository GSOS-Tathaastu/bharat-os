# ADR 0152 — Phase 13.2: piiRedaction annotation envelope + opt-in transparent Send pre-flight

Status: Accepted
Date: 2026-06-01

## Context

Phase 13.1 SLM-F (ADR 0151) shipped the on-device PII redactor chip
on CitizenIntent + CitizenNotes. The Phase 13.1 deferred list flagged
three Phase 13.2 follow-ups:

1. **Transparent handleSend integration** — citizen shouldn't have
   to tap the chip first; an automatic pre-flight catches the
   forgotten case.
2. **`piiRedactionAnnotation` envelope** — first BE delta in the
   13.x SLM USP arc. Pointer-not-payload count meta on the audit
   ledger so the citizen's mask act is provable without ever
   surfacing the spans / raw / masked text.
3. **Offline-queue replay redaction** — explicitly deferred to a
   later sub-phase (multi-stage; needs queue schema bump).

ADR 0151 also listed 21 deferred SHOULD_FIX items. Phase 13.2 picks
off four of the highest-value ones: D7 (honest "no SLM" chip
framing), D10 (per-row mask preview bug), D6 (fixture PIN swap), D21
(unused Field import).

## Decision

### 1. BE substrate — `src/phase0/intent-annotation.mjs`

New optional `piiRedaction` sub-envelope on `intentAnnotation`:

```ts
{
  detectedCount: number,  // 0..64
  maskedCount: number,    // 0..detectedCount
  kinds: PiiKind[],       // allowlist, sorted, deduped
  source: 'regex' | 'regex+slm',
  appliedAt: ISO-8601 UTC instant at second precision (or null)
}
```

**§15 bindings**:

- **Strict allowlist** on keys: `detectedCount | maskedCount |
  kinds | source | appliedAt`. ANY other key throws. This replaces
  the original Phase 13.2 denylist after the adversarial review
  flagged it as leak-prone (synonyms like `body | value | snippet
  | payload | content` would have slipped through).
- **PII_KIND_ALLOWLIST** matches the FE `pii-detectors.ts::PII_KINDS`
  exactly (11 kinds).
- **No raw values, no spans, no offsets, no original/masked text**
  — those keys are rejected at the boundary.
- **`appliedAt` strictly ISO-8601 UTC**. Earlier 40-char wildcard
  was a covert side-channel + timing fingerprint. Millisecond
  precision is dropped on accept (`2026-06-01T12:34:56.789Z` →
  `2026-06-01T12:34:56Z`) so the timestamp can't leak a citizen's
  typing speed.
- **Post-dedup kinds cap** invariant (SF-10) — pre-loop length
  check was bypassable via duplicates.

Ledger event `intent.slm_<verdict>` now surfaces a `piiRedaction`
meta sub-block with counts + kinds + source ONLY. JSON-grep
test asserts no forbidden key surfaces in the serialized event.

### 2. FE hook — `frontend/src/lib/use-slm-pii-redactor.ts`

- **`buildAnnotation(currentText)`** returns the count-only
  envelope or null. Reads from refs captured AT APPLY TIME:
  - `appliedSpansRef` — citizen's actual mask selection
  - `appliedResultRef` — the result snapshot at Apply
  - `appliedAtRef` — wall-clock stamp at Apply
- **`markApplied(appliedSpans, appliedResult)`** — new signature
  takes the selected span set so `buildAnnotation` can report
  `maskedCount = appliedSpans.length` (not the detected
  superset) and `kinds[]` reflects only the citizen-applied set.
  Fixes the MF-1 §15 audit-honesty violation.
- **`markAcknowledged()`** — new method called when the citizen
  closes the sheet WITHOUT applying. Separate from `applied`
  because acknowledgement is enough to break the "Keep All →
  Apply → Send" re-open loop without claiming the citizen masked
  anything.
- **`hasPendingPiiAgainst(currentText)`** — new method-style
  replacement for the leaky `hasPendingPii` getter. Returns true
  ONLY when the supplied text matches the scanned text (text drift
  → false). Callers that don't pass `currentText` get nothing —
  forcing explicit staleness checks at every call site.
- **scan() seed write** — Phase 13.2 seeds `lastResult`
  synchronously so the PiiReviewSheet renders immediately on
  auto-scan-on-Send. Only resets the `applied/acknowledged`
  flags when the scanned text DIFFERS from the prior one
  (same-text re-tap preserves citizen state).
- **Drift guard** in `buildAnnotation` — if `currentText` is
  neither the original scannedText nor the post-mask text,
  return null. Stale Apply can't leak an envelope describing
  the old scan against newly-edited text.

### 3. FE CitizenIntent — `frontend/src/routes/CitizenHome.tsx`

- **`piiAutoscanEnabled`** opt-in flag (per-session in-memory;
  defaults false). Flips true on first chip tap OR first Apply.
  Persistence to BosStore is a Phase 13.3 follow-up.
- **handleSend** now branches:
  - `hasPendingPiiAgainst(intentText)` → open sheet, no POST.
  - Opt-in + not-already-acknowledged + regex pre-flight finds
    spans → kick off async scan + open sheet, no POST.
  - Otherwise POST with the optional `piiRedaction` sub-envelope
    attached to the existing `intentAnnotation` (when an SLM-A
    parse also happened).
- **`handlePiiApply`** receives both `maskedText` and
  `appliedSpans` from the sheet.
- **`handlePiiSheetClose`** flips `acknowledgedSinceScan` to true.
- Standalone-piiRedaction-only annotation (citizen didn't parse
  intent with SLM-A) deferred to Phase 13.3. v1 only attaches
  when SLM-A parse is also present — keeps the orchestrator
  schema unchanged and avoids noisy `disagreed` verdicts.

### 4. FE CitizenNotes — `frontend/src/routes/CitizenNotes.tsx`

Same opt-in + acknowledged flow. The PiiReviewSheet receives
`title="Check for PII before saving"` (SF-3 — Notes saves
locally, doesn't send).

### 5. Phase 13.1 deferred SHOULD_FIX wins applied

| ID | Fix |
|---|---|
| D6 | Sample fixture PIN codes swapped to the demo-family `199999 / 299999 / 399999` (was real Indian postal codes `411014 / 560001 / 110001`). Vitest sanity-grep enforces the family. |
| D7 | Chip framing now reads "Check for PII (patterns only)" when no SLM is installed — honest about the regex-only floor instead of implying SLM-backed depth. |
| D10 | `PiiReviewSheet` per-row mask preview calls `PII_KIND_MASK[span.kind](span.raw)` directly. The earlier `applyMask(span.raw, [{...span}])` failed the `text.slice(start,end) === raw` invariant because span.start/end were full-text offsets, not slice-into-raw. The per-row preview silently rendered raw values as "masked". |
| D21 | Unused `Field` import removed from CitizenHome.tsx. |

### 6. Adversarial review (3 lenses + triage)

3 lenses (privacy/exfil, UX honesty, edge cases) returned
**3 must-fix + 10 should-fix + 5 defer**. All 3 must + 6 key
should-fix applied in-phase. Verdict: ship_with_fixes.

**Must-fix applied**:

| ID | Fix |
|---|---|
| MF-1 | `buildAnnotation` now reports `maskedCount = appliedSpans.length` and `kinds = sortedUnique(appliedSpans.map(s => s.kind))` — honest about citizen's actual selection rather than lying with `maskedCount === detectedCount` when the citizen partially deselected. |
| MF-2 | Auto-scan-on-Send is OPT-IN. `piiAutoscanEnabled` flag flips true only after citizen interacts with the redactor explicitly. Prevents unsolicited PII modal on benign 6-digit / 10-digit sequences ("order #834567", "pay 100000"). Also closes the "Keep All → Apply → Send" re-open loop via `acknowledgedSinceScan`. |
| MF-3 | BE substrate flipped from `PII_FORBIDDEN_KEYS` denylist to strict `PII_ALLOWED_KEYS` allowlist. `appliedAt` now strictly ISO-8601 UTC; ms precision dropped. `kinds` cap enforced post-dedup. |

**Should-fix applied**:

| ID | Fix |
|---|---|
| SF-3 | `PiiReviewSheet` has a `title` prop; CitizenNotes passes "before saving". |
| SF-4 | `buildAnnotation` text-drift guard — returns null when `currentText` is neither original nor post-mask. |
| SF-6 | `hasPendingPii` getter replaced with `hasPendingPiiAgainst(text)` method so callers can't ignore text drift. |
| SF-9 | `applyMask` now accepts a structural `MaskableSpan` interface; the unsafe `as Array<...>` cast in PiiReviewSheet + the hook is gone. |
| SF-10 | (Bundled with MF-3) — kinds cap post-dedup. |

**Deferred** (5 items): FE-asserted appliedAt removal (substrate
migration, Phase 13.3), standalone piiRedaction-only annotation
path (needs orchestrator schema bump — Phase 13.3 alongside
SLM-G), dev-build mask drop counter, deep-freeze
PII_KIND_ALLOWLIST array, soft-source default trimming. All
flagged for Phase 13.3+.

### 7. §15 bindings

| Binding | How honoured |
|---|---|
| Pointer-not-payload on ledger | Strict allowlist on the envelope; ledger event meta carries counts/kinds/source only. JSON-grep test asserts no forbidden key surfaces. |
| No PII to ledger | maskedCount is honest about citizen choice; kinds[] reflects only the masked subset. |
| Honest empty state | Auto-scan opt-in prevents surprise modals; chip framing differentiates regex-only vs SLM-augmented. |
| No covert channels | `appliedAt` ms-precision dropped; strict ISO-8601 format. 40-char wildcard removed. |
| Defence-in-depth | Strict allowlist > denylist. Post-dedup invariant cap on `kinds`. |
| Echo guardrail | `buildAnnotation` text-drift guard returns null on edited-after-Apply. |
| `hasPendingPiiAgainst` method | Forces every caller to declare WHICH text they're asking about. |

## What's NOT in 13.2 (deferred)

- **Phase 13.3 — standalone piiRedaction-only annotation path**.
  Today the envelope rides as a sub-field of the SLM-A annotation;
  citizens who tap PII chip but not SLM-A chip have their
  piiRedaction silently dropped. Real fix needs orchestrator schema
  + a new `pii_only` verdict + new `intent.pii_redaction_only`
  ledger event type. Lands with SLM-G.
- **Phase 13.3 — FE-asserted appliedAt removal**. Eliminates both
  covert-channel + timing-fingerprint concerns at the source. MF-3's
  ISO-8601 + second-precision clamp covers the immediate risk; full
  removal is a clean-up phase.
- **Phase 13.x — offline-queue replay redaction**. Multi-stage;
  needs queue schema bump + per-item re-scan or pre-enqueue
  rewrite.
- **Phase 13.3 — per-identity persisted `pii_autoscan_enabled`
  flag**. Today the opt-in is per-session in-memory. Persistence to
  BosStore is a small follow-up that keeps the opt-in across page
  reloads.

## External-API impact (API_INTEGRATIONS.md)

**Zero**. SLM-F substrate continues to be pure on-device.
The piiRedaction sub-envelope rides through the existing
`/api/orchestrations` POST as part of `intentAnnotation`; no new
endpoint, no new external service. Only edit: "Last updated"
header bump.

## Files

EXTENDED:
- `src/phase0/intent-annotation.mjs` — `piiRedaction` envelope
  with strict allowlist + ISO-8601 + ms-clamp + post-dedup cap.
- `frontend/src/lib/use-slm-pii-redactor.ts` —
  `buildAnnotation`/`markApplied` new signature + refs +
  `markAcknowledged` + `hasPendingPiiAgainst` method + drift
  guard.
- `frontend/src/lib/pii-detectors.ts` — exported
  `MaskableSpan` interface; `applyMask` widened.
- `frontend/src/components/PiiReviewSheet.tsx` — `title` prop;
  `onApply(maskedText, appliedSpans)` new signature; structural
  cast cleanup; per-row mask preview fix (D10).
- `frontend/src/routes/CitizenHome.tsx` — opt-in flag; new
  handlers; auto-scan gate; `handlePiiSheetClose` ack.
- `frontend/src/routes/CitizenNotes.tsx` — same; passes
  `title="Check for PII before saving"`.
- `frontend/src/lib/pii-redactor.ts` — fixture PIN swap
  (D6: 411014/560001/110001 → 199999/299999/399999).
- `tests/node/intent-annotation.test.mjs` — +3 MF-3 cases
  (strict allowlist + ISO-8601 + ms drop + SF-10).
- `frontend/src/lib/pii-redactor.test.ts` — +4 fixture-PIN guards.
- `docs/adr/0152-phase-13-2-pii-redaction-annotation-envelope-and-transparent-preflight.md`.

## Test results

- Vitest: 309 → **313** (+4 fixture-PIN guards).
- Node tests: 1217 → **1233** (+13 piiRedaction envelope +
  +3 MF-3 cases).
- tsc clean. Build green.
