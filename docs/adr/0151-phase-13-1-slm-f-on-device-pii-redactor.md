# ADR 0151 — Phase 13.1 SLM-F: On-device PII redactor

Status: Accepted
Date: 2026-06-01

## Context

Phase 13.0 (ADR 0149) shipped SLM-E document summariser as the
first of four SLM USP features (E document summariser / F PII
redactor / G personalization / H skill agents). Phase 13.0.0a
(ADR 0150) landed the shared wllama runtime singleton so each
new SLM consumer composes one runtime instance instead of
cloning a fifth one.

SLM-F is the second USP feature. Citizens type intents +
notes that often carry Indian PII (PAN, Aadhaar, mobile,
GSTIN, account, DL, RC, ABHA, UPI, email, PIN). Before that
text leaves the device — POSTed to `/api/orchestrations` from
CitizenIntent or encrypted-at-rest from CitizenNotes — the
citizen should get an opt-in scan + per-span keep/mask
review.

Roadmap text (ROADMAP.md verbatim): *"On-device PII redactor
on outgoing actions."*

## Decision

Architecture: **regex-primary + SLM-secondary**. Hybrid
detection. Pure FE. Zero BE changes. Integrated at the
boundary — chip on CitizenIntent + CitizenNotes, NOT a /labs
panel mirror.

### 1. Pre-step: extract `frontend/src/lib/slm-parse-helpers.ts`

The Phase 13.0 doc-summariser had `clipLine`, `clampConfidence`,
`djb2Hash` inlined. SLM-F (and future SLM-G/H) need the same
helpers. Extracted to a shared module; `doc-summariser.ts`
re-exports the first two for stable public API. The Phase 13.0
vitest pins (47 cases) stay green unchanged.

### 2. `frontend/src/lib/pii-detectors.ts` (~310 lines)

Pure, synchronous regex library. Exports:

- `PII_DETECTORS_PROTOCOL_VERSION = 'bos.phase13.pii-detectors.v1'`
- `PiiKind` union (11 kinds)
- 11 regexes: `PAN_RE`, `AADHAAR_RE`, `INDIAN_MOBILE_RE`,
  `GSTIN_RE`, `BANK_ACCOUNT_RE`, `INDIAN_DL_RE`,
  `VEHICLE_RC_RE`, `ABHA_RE`, `UPI_RE`, `EMAIL_RE`, `PIN_RE`
- `PII_KIND_LABEL` human labels + `PII_KIND_MASK` per-kind
  deterministic shapers
- `scanWithRegex(text)` — returns non-overlapping spans
  sorted by start, with `text.slice(start, end) === raw`
  invariant
- `applyMask(text, spans)` — idempotent rewrite (the mask
  character 'X' is outside every detector class)

Mask shapes (worked examples):
- pan `ABCDE1234F` → `XXXXX1234F` (preserves citizen
  recognition: "PAN ending 1234F")
- aadhaar `1234 5678 9012` → `XXXX XXXX 9012`
- mobile `9876543210` → `9XXXXXXX10`; with +91 prefix
  `+91 9876543210` → `+91 9XXXXXXX10`
- gstin `27ABCDE1234F1Z5` → `27XXXXXXXXXX1Z5`
- account `1234567890123` → `XXXXXXXXX0123`
- upi `alice@hdfcbank` → `X@hdfcbank`
- email `alice@example.com` → `aXXXX@example.com`
- pin `110001` → `11XXXX`

BANK_ACCOUNT_RE has a **24-char context-window guard**
requiring `a/c|acct|account|bank|ifsc` to precede the digits
— this is intentional defence against false positives on
order IDs / transaction refs. The chip's regex-only mode
documents the gap; SLM second pass closes it.

### 3. `frontend/src/lib/pii-redactor.ts` (~250 lines)

The SLM-side prompt builder + completion parser. The SLM is
asked to surface context-only spans the regex pass missed.

- `PII_REDACTOR_PROTOCOL_VERSION = 'bos.phase13.pii-redactor.v1'`
- `buildPiiScanPrompt(text, focusKinds?)` — strict
  KEY:value-per-span format; NONE_FOUND sentinel; 6000-char
  input cap; per-kind bias hints (PII_KIND_BIAS_HINTS).
- `parsePiiScanCompletion(completion, text)` — anti-
  hallucination guard: drops any SLM span where
  `text.slice(start, end) !== raw`; allowlist coercion on
  `PiiKind`; PII_MAX_SPANS=32 ceiling.
- `SAMPLE_FIXTURES` — 4 scrubbed fixtures
  (shopping / loan_intent / health_check / shop_kyc)
  using demo-persona PII conventions (PAN ending 0000Z,
  mobile 9000000000 family, Aadhaar 9999 9999 9999).
  vitest sanity-greps reject real-shaped PII in fixtures.

### 4. `frontend/src/lib/use-slm-pii-redactor.ts` (~340 lines)

The hook composes `getSharedSlmRuntime` (Phase 13.0.0a) +
`scanWithRegex` (synchronous regex floor) + `parsePiiScanCompletion`
(SLM augmentation) + `mergeSpans` (pure function — regex
wins on overlap).

Status union mirrors the SLM-D / SLM-E pattern:
`{ unavailable | ready | loading{progress} | scanning |
  cooling-down{retryInMs, cooldownUntil} | error }`.

- Rate limit: per-text 3/60s + global 8/5min (tighter than
  doc-summariser's 2/60s + 6/5min — PII scans are
  lighter at 128 maxTokens vs 384).
- Generation: maxTokens 128, temperature 0.15 (low-
  creativity classifier behaviour).
- Always returns a result — even when SLM unavailable or
  rate-limited, the regex floor renders.
- `markApplied()` + `hasPendingPii` — drive the M6 Send
  foot-gun gate.
- `mergeSpans` pure function exported for unit testing.

### 5. `frontend/src/components/PiiReviewSheet.tsx` (~230 lines)

Bottom sheet:
- Pre-checked regex spans + unchecked SLM spans (the
  citizen's pattern-vs-suggestion distinction is visible).
- Per-span keep/mask checkboxes.
- Mask all / Keep all.
- Preview pane (uses applyMask against current text).
- MF-3 byte-match staleness — disables Apply when text
  has drifted since the scan.
- "Stays on this device · 0 bytes uploaded" badge always
  visible.

### 6. Integration

**CitizenIntent (CitizenHome.tsx)**: chip below the
existing SLM-A chip. Tap runs `scanWithRegex` synchronously,
SLM second pass kicks off if installed. Badge shows count;
tap badge opens sheet. Apply rewrites textarea BEFORE
`handleSend` runs — orchestrator contract, idempotency
fingerprint, MF-3 byte-match guards, ledger plumbing all
unchanged.

**CitizenNotes create-sheet**: same chip pattern above the
Save button. Apply rewrites the body BEFORE
`useCreateMemoryRecord` fires.

### 7. Adversarial review (3 lenses + triage)

3 lenses (privacy/exfil, UX honesty, edge cases) returned
**6 must-fix + 12 should-fix + 21 defer**. All 6 must-fix +
6 key should-fix applied in-phase. Verdict: ship_with_fixes.

**Must-fix applied**:

| ID | Fix |
|---|---|
| M1 | `mergeSpans` now uses a regex-first two-pass — regex spans are placed first, SLM spans admitted only when they don't overlap any regex range. Earlier single-pass sort-by-start let an SLM span starting BEFORE a regex span displace it, violating the regex-wins-on-overlap contract. |
| M2 | `maskMobile` now counts DIGIT-positions, not character-positions, and keeps the prefix digits (`+91` / `0`) + first mobile digit + last 2 digits. Earlier defensive fallback mis-counted and either kept '+' as the "first digit" or over-masked the prefix. |
| M3 | `PiiReviewSheet` re-seeds selection on result identity change (prevResult comparison), not on key-set equality. The earlier short-circuit left stale per-span tick state across re-scans that returned the same span keys. |
| M4 | `PiiReviewSheet` is now rendered as a SIBLING of the create-note `Sheet` in CitizenNotes, not as nested children. Nesting caused both Sheet's Escape listeners to fire on a single press (citizen lost the typed note) and the inner unmount re-enabled body scroll while the outer was still open. |
| M5 | Cooling-down status now stamps `cooldownUntil` (wall-clock deadline). New `<CooldownCountdown cooldownUntil={...} />` component ticks every 1s. Earlier "retry in 60s" was a frozen snapshot — looked like a hung app. |
| M6 | Send foot-gun gate. The hook exposes `markApplied()` + derived `hasPendingPii`. `handleSend` in CitizenHome AND `handleCreate` in CitizenNotes check `hasPendingPii` BEFORE the network call and surface a `window.confirm` when the citizen scanned, found PII, dismissed the sheet, and is about to send/save raw PII. Confirm dialog gives the option to re-open the sheet. |

**Should-fix applied**:

| ID | Fix |
|---|---|
| S1 | AADHAAR_RE + ABHA_RE accept `[\s-]?` separators (was whitespace-only). maskAadhaar preserves both. |
| S2 | PAN_RE accepts `[\s-]?` separators. maskPan now counts alphanumeric positions to preserve internal separators (`ABCDE 1234 F` → `XXXXX 1234 F`). |
| S3 | GSTIN_RE, INDIAN_DL_RE, VEHICLE_RC_RE flipped to case-insensitive (`/gi`) so chat-pasted lowercase shapes still match. PAN was already case-insensitive. |
| S8 | `perTextTimestamps` Map now `delete`s empty entries to bound growth across long sessions. |
| S9 | `runtimeRef` snapshotted locally before each generate so an unmount mid-await can't TypeError `.generate` on a null ref. |
| S12 | `piiRedactor.reset()` fires in both sent + queued branches of `handleSend` and on `handleCreate` success — clears stale chip badges after dispatch. |

**Deferred** (21 items): bare-digit account secondary
detector, in-sheet Re-scan affordance, FE↔BE
PII_FORBIDDEN_KEYS convergence test, Sheet stack substrate
fix, typed load-vs-generate error differentiation, demo-
fixture PIN swap, honest "Regex only" chip framing, anti-
hallucination trailing-punctuation tolerance, wllama KV
cache documentation, per-row mask preview applyMask bug,
djb2 long-text key collision, DETECTOR_ORDER comment
mismatch, Aadhaar asymmetric spacing, Mask-just-patterns
shortcut pill, empty-state copy by coverage, "type more"
hint, email-vs-UPI precedence comment, DEV warn hygiene,
checkbox aria-group, word-fused indicator (`myaccount`),
unused Field import. All slated for Phase 13.2.

### 8. §15 bindings

| Binding | How honoured |
|---|---|
| Bytes never leave device | Zero fetch/XHR. Scan results live only in component state. SLM call routes through SlmRuntime.generate which is WASM-side. |
| On-device only | `getSharedSlmRuntime` + `logger: 'silent'` — wllama tokenisation errors can't echo prompt bytes. |
| Honest empty state | Regex floor renders even without SLM installed (Phase 9.0b lazy-load contract). |
| Rate limit | Per-text 3/60s + global 8/5min sliding window. |
| Protocol version pinned | `bos.phase13.pii-detectors.v1` + `bos.phase13.pii-redactor.v1`. |
| No PII to ledger | Zero ledger events emitted. The masked text rides through the existing handleSend / handleCreate path with no PII-redactor envelope (deferred to Phase 13.2). |
| No token storage | Spans + redactedText live only in component state. |
| Echo guardrail | Parser drops SLM spans where text.slice !== raw. |
| Allowlist enforcement | RISK_FLAG, LANGUAGE, PiiKind coerced. |
| Bundle code-split (ADR 0114) | Imports only `getSharedSlmRuntime` + `SlmRuntime` from `./slm-runtime`. |
| key=identity.id on Sheet | PiiReviewSheet mounted as sibling — its parent route already remounts on identity flip (Labs.tsx pattern via `key={identity?.id}`). |
| FE-BE parity (2026-05-27) | BE delta = none, by design. Mirrors Phase 10.6 SLM-hint + Phase 13.0 SLM-E precedents. |
| /app/ grows, /shell/ retires | Feature lives entirely in /app/. |

## What's NOT in 13.1 (deferred)

- **Phase 13.2 — transparent handleSend integration**: today the
  chip is an opt-in pre-flight; the redactor doesn't sit
  invisibly between text input and POST. Wiring that requires
  a `piiRedactionAnnotation` count-only envelope on
  `intent-annotation.mjs` (BE schema bump) + offline-queue
  replay redaction for queued items + the FE↔BE
  PII_FORBIDDEN_KEYS convergence ticket.
- **Phase 13.2 — bare-digit account secondary detector**:
  closes the BANK_ACCOUNT_RE indicator-word gap with a
  low-confidence tertiary detector + new "low confidence"
  span tag in the sheet.
- **Phase 13.2 — accessibility pass**: per-span checkbox 24dp
  touch targets, role='group' on the checkbox list, explicit
  "Pattern match" badge alongside the kind badge (regex
  source signal not colour-only), live ARIA announcements.
- **Phase 13.3 SLM-G**: on-device personalization.
- **Phase 13.4 SLM-H**: skill agents for Indian tasks.

## External-API impact (API_INTEGRATIONS.md)

**Zero**. SLM-F is pure on-device inference layered on the
Phase 13.0.0a shared wllama runtime. No new env var, no new
external service. The whole point of the USP is that the
text never leaves the device — touching API_INTEGRATIONS.md
for an SLM-F external dependency would contradict the
binding. Only edit: "Last updated" header bump.

## Files

NEW:
- `frontend/src/lib/slm-parse-helpers.ts` + `.test.ts` (12 cases)
- `frontend/src/lib/pii-detectors.ts` (~310 lines) + `.test.ts` (56 cases)
- `frontend/src/lib/pii-redactor.ts` (~270 lines) + `.test.ts` (31 cases)
- `frontend/src/lib/use-slm-pii-redactor.ts` (~340 lines) + `.test.ts` (9 cases)
- `frontend/src/components/PiiReviewSheet.tsx` (~230 lines)
- `frontend/src/components/CooldownCountdown.tsx` (shared
  ticker — reusable for SLM-D / SLM-E migration)
- `docs/adr/0151-phase-13-1-slm-f-on-device-pii-redactor.md`

EXTENDED:
- `frontend/src/lib/doc-summariser.ts` — re-exports clipLine
  + clampConfidence from slm-parse-helpers (ADR 0149 vitest
  pins remain green).
- `frontend/src/lib/use-slm-doc-summariser.ts` — imports
  djb2Hash from slm-parse-helpers.
- `frontend/src/routes/CitizenHome.tsx` — Check-for-PII chip
  below the SLM-A chip; M6 Send foot-gun gate in handleSend.
- `frontend/src/routes/CitizenNotes.tsx` — Check-for-PII
  chip above Save button; M6 Save foot-gun gate in
  handleCreate; PiiReviewSheet hoisted to sibling.

## Test results

- Vitest: 201 → **309** (+108 SLM-F cases including M1
  regression, M2 mobile mask shapes, S1/S2/S3 regex
  coverage, sample-fixture PII hygiene).
- Node tests: **1217** unchanged (FE-only phase).
- tsc clean. Build green.
