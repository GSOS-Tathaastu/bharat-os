# ADR 0149 — Phase 13.0 SLM-E: On-device document summariser (demo cut v1)

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.3 closed the marketplace breadth arc (all 6 wave-1+2
provider roles live). Phase 13.x opens the SLM USP arc — the
four on-device LLM features that turn the on-device-model
substrate (Phase 9.0c wllama runtime + Phase 11.5 install
pipeline) into citizen-facing capability:

- **E.** Document summariser (this ADR).
- **F.** PII redactor on outgoing actions.
- **G.** Personalization that never leaves the device.
- **H.** Skill agents for Indian tasks.

SLM-E is the single most demoable feature in the deck. On
stage: paste an electricity bill, tap Summarise, watch
TITLE / TLDR / 3 bullets stream in token-by-token while a
green "Stays on this device · 0 bytes uploaded" badge holds.
DevTools Network tab stays empty. The document never leaves
the browser.

Roadmap text (ROADMAP.md verbatim): *"On-device document
summariser (electricity bill / Form 16 / T&Cs / insurance /
lender docs)."*

## Decision (demo cut v1)

Land Phase 13.0 SLM-E as a streaming, paste-text
DocSummariserPanel mounted into the existing /labs route,
with a 6-pill doc-kind picker (Electricity bill / Form 16 /
T&Cs / Insurance policy / Lender contract / Other document)
backed by a single DocTaskSpec-shaped prompt template and a
bias-hint map per kind, onToken streaming into the UI, a
permanent "Stays on this device" badge, two-tier rate limit,
mountedRef + inflightRef + unmount-cleanup, and a
protocol-versioned prompt/parse pair pinned by vitest.

**No persistence, no upload, no PDF.js, no OCR, no shared-
runtime singleton in v1.** Pure FE; zero BE changes.

### 1. `frontend/src/lib/doc-summariser.ts`

Pure prompt builder + completion parser + doc-kind taxonomy
+ bias-hint map + 6 sample fixtures. Exports:

- `DOC_SUMMARISER_PROTOCOL_VERSION = 'bos.phase13.doc-summariser.v1'`
- `DocKind = 'electricity_bill' | 'form_16' | 'tncs' | 'insurance' | 'lender_doc' | 'generic'`
- `DOC_KIND_LABEL`, `DOC_KIND_BIAS_HINTS`, `SAMPLE_FIXTURES`,
  `DOC_INPUT_CHAR_CAP = 6000`
- `interface DocSummaryFields { title; tldr; bullets[]; language; confidence; riskFlag; docKind }`
- `interface ParsedDocSummary { protocolVersion; fields }`
- `buildDocSummaryPrompt(docKind, text)`
- `parseDocSummaryCompletion(text, expectedDocKind)`

Per-kind bias hints inject 1-3 keywords into a single shared
prompt template — keeps SLM-F/G/H near-free to add (new
DocKind variant + one bias-hint entry + sample fixture). The
substrate seam without the full registry overhead.

### 2. `frontend/src/lib/use-slm-doc-summariser.ts`

Lazy hook. Status union mirrors the existing booking-advisor
cooling-down shape so existing chip CSS reuses:

```
| { unavailable; reason: 'no_identity' | 'no_install' | 'no_blob' }
| { ready }
| { loading; progress }
| { summarising; streamedChars }
| { cooling-down; retryInMs }
| { error; message }
```

Verb `summarise(docKind, docText)` returns
`Promise<SlmDocSummariserResult | null>`. First SLM consumer
in the repo to pass `onToken` so the panel can stream tokens
into a `partialText` state for a perceived-latency win — the
pitch beat lives in the first-token-in-2s moment.

Generation knobs: `maxTokens 384, temperature 0.25`.

Rate limit: two-tier sliding window, **tighter than booking
advisor** because summariser maxTokens 384 vs advisor's 96.
Per-docKey 2/60s + global 6/5min. docKey is
`${docKind}:${djb2Hash(text.trim().slice(0, 1000))}` — stable
across re-pastes of the same content.

### 3. `frontend/src/components/DocSummariserPanel.tsx`

Citizen-facing Card. Renders: 6-pill picker, textarea with
6000-char counter, Try sample / Clear actions, "Summarise on
my phone" CTA, permanent green "Stays on this device · 0
bytes uploaded" badge, live streamed <pre> kept visible
through ready transition (adversarial fix MF-3), SummaryChip
block with TITLE / TLDR / bullets / language / confidence /
risk-flag, raw-completion fallback when parser fails,
cooling-down banner with countdown.

Returns null (hides) when no SLM is installed (honest empty
state, no upsell — matches SLM-D booking-advisor binding).

### 4. Adversarial review (3 lenses + triage)

3 reviewers (privacy / UX honesty / edge cases) returned
**5 must-fix + 6 should-fix + 12 defer**. All 11 must/should
fixes applied before commit. Verdict: ship_with_fixes.

**Must-fix applied**:

| ID | Fix |
|---|---|
| MF-1 | Key the panel on `identity.id` in Labs.tsx so a shared-device identity flip forces full remount + unmount cleanup. Prevents citizen B from inheriting citizen A's `lastResult` / `partialText` / warm WASM runtime on the same browser. |
| MF-2 | Generic citizen-safe error message in the catch (was leaking raw `(err as Error).message` which could echo prompt bytes) + new `no_blob` branch in the panel that renders an honest "reinstall the pack" Card instead of returning null silently. |
| MF-3 | Keep streamed `<pre>` visible after `status='ready'` so the on-device pitch beat survives the chip-render transition. Prepend "Generated locally · 0 bytes uploaded" label above the <pre>. `handleSummarise` clears stale `lastResult` BEFORE awaiting so the new generation's stream is the only visible output during summarisation. |
| MF-4 | `inflightRef` now carries `{ docKey, promise }` so a second `summarise()` with a DIFFERENT (docKind, text) bucket gets refused with `null` instead of being silently aliased to the first call's result. Same bucket → still dedup'd. |
| MF-5 | `cooling-down` status auto-exits via `setTimeout(retryInMs)` so the Summarise CTA isn't permanently disabled after the rate-limit window. Timer captured in a ref, cleared on unmount + before each new `summarise()` call. |

**Should-fix applied**:

| ID | Fix |
|---|---|
| SF-1 | `disabled={isBusy}` on pill picker + Try sample + Clear — prevents incoherent UI race where reset() flips status mid-flight. |
| SF-2 | `logger: 'silent'` passed to `loadSlmRuntime`. Also updated `slm-runtime.ts` so the `silent` branch noops `warn` + `error` too (previously they forwarded to `console.warn` / `console.error`, which could echo prompt bytes on a wllama tokenisation error). |
| SF-3 | `partialText` clear-on-new-summarise was already covered by existing path; verified. MF-1's key-on-identity remount nukes residual state on identity flip. |
| SF-4 | `catch` block stamps `globalTimestamps` so a corrupt GGUF can't be retried forever without rate-limit. |
| SF-5 | `Math.min(100, ...)` on progress so wllama edge cases (loaded > total) don't surface as "Loading model… 103%". |
| SF-6 | DEV-only `console.warn` when buildDocSummaryPrompt is called with an unknown docKind (was silent degradation to 'generic'). Helps future SLM-F/G/H integrators. Prod stays silent. |

**Deferred** (12 items): cancel button for in-flight gen,
full hook test file (renderHook), Phi-3 context-window
arithmetic, pack-id change runtime invalidation,
cooling-down live countdown, ARIA arrow-key keyboard nav,
mobile 360dp polish, rawCompletion PII regex-scrub,
rate-limit singleton, hash discrimination upgrade, periodic
Map cleanup, cosmetic polish — all targeted at Phase 13.1
hardening pass.

### 5. §15 bindings

| Binding | How honoured |
|---|---|
| Bytes never leave device | Generation runs in wllama WASM via SlmRuntime; no `fetch()` of doc text; sample fixtures PII-clean (vitest grep enforces). |
| Honest empty state | Panel returns `null` when no SLM installed. No upsell, no greyed-out CTA. Mirrors SLM-D pattern. `no_blob` case shows an honest reinstall hint instead of silent hide. |
| Rate limit | Two-tier sliding window. |
| Protocol version pinned | `bos.phase13.doc-summariser.v1` stamped on every parsed envelope. Vitest pins the constant. Bump = new ADR. |
| No PII to ledger | Zero ledger events emitted in v1 (no persistence). When 13.0.2 adds MemoryRecord persistence, the event will follow the booking-advisor pointer-not-payload shape (modelPackId + summaryLength + detectedLanguage + docKind — never the doc bytes). |
| No token storage | Streamed tokens live only in component state; cleared on next summarise + on unmount; identity flip remounts (MF-1). No `localStorage` / `sessionStorage` / `IndexedDB`. |
| Echo guardrail | Parser always coerces `DOC_KIND` back to caller-supplied `expectedDocKind` so the chip never disagrees with the pill picker. |
| Allowlist enforcement | `RISK_FLAG` non-allowlist → `'none'`; `LANGUAGE` non-allowlist → `'Other'`. Defence-in-depth on the chip. |
| Bundle code-split contract (ADR 0114) | Imports only `loadSlmRuntime` + `SlmRuntime` from `./slm-runtime`. Never `'@wllama/wllama'` directly. |
| Silent logger | `loadSlmRuntime({ logger: 'silent' })` so wllama warn/error don't echo prompt bytes to DevTools console (SF-2). |
| Cross-citizen state isolation | `key={identity.id}` on the panel forces remount on identity flip (MF-1). |
| FE-BE parity (2026-05-27) | BE delta v1 = **none, by design**. Mirrors the Phase 10.6 SLM-hint zero-BE-changes precedent. The binding requires the question be answered — it is. Persistence + `doc.summarised` ledger event land in Phase 13.0.2. |
| /app/ grows, /shell/ retires | Feature lives entirely in /app/ (`frontend/src/routes` + `frontend/src/lib` + `frontend/src/components`). Zero edits to `public/shell/`. |

## What's NOT in 13.0 (deferred)

- **Phase 13.0.1**: File upload + `pdfjs-dist` text extraction
  for PDF docs + Home shortcut Card on /citizen/home. Needs
  user approval for the new npm dep.
- **Phase 13.0.2**: Persistence of parsed summary as a
  `MemoryRecord` (kind: `document_summary`) + `doc.summarised`
  pointer-not-payload ledger event + DPDP cascade. First BE
  delta this arc gets.
- **Phase 13.0.0a (1h follow-up)**: Shared wllama runtime
  singleton across all 4 SLM hooks (intent-parser, advisor,
  field-suggest, summariser). The adversarial review flagged
  that the singleton claim in the booking-advisor header is
  false today — each hook holds its own `runtimeRef` and
  reloads the GGUF bytes independently. SLM-E perpetuates this
  to keep v1 ship velocity; the substrate extraction is a
  separate ADR with cross-hook reach.
- **Phase 13.1**: Cancel button for in-flight generation,
  full hook test file (renderHook + fake timers + mocks),
  ARIA keyboard nav, mobile 360dp polish, rawCompletion
  PII scrub, live cooling-down countdown.
- **Phase 13.2+**: OCR for photographed bills (Tesseract.js
  or multimodal SLM).

## External-API impact (API_INTEGRATIONS.md)

**Zero**. SLM-E is pure on-device inference layered on the
Phase 9.0c wllama runtime + Phase 11.5 install pipeline. No
new env var, no new external service, no GSTN / DigiLocker /
UIDAI / UPI dependency. The whole point of the USP is that
the document never leaves the device — touching
`API_INTEGRATIONS.md` for an SLM-E external dependency would
contradict the binding. Only edit: bump the doc's "Last
updated" header to 2026-06-01 (Phase 13.0 shipped; zero
external-API delta).

## Files

NEW:
- `frontend/src/lib/doc-summariser.ts` (~290 lines)
- `frontend/src/lib/use-slm-doc-summariser.ts` (~260 lines)
- `frontend/src/components/DocSummariserPanel.tsx` (~225 lines)
- `frontend/src/lib/doc-summariser.test.ts` (~290 lines, 47 cases)
- `docs/adr/0149-phase-13-0-slm-e-on-device-document-summariser.md`

EXTENDED:
- `frontend/src/routes/Labs.tsx` — render
  `<DocSummariserPanel key={identity?.id ?? 'anon'} ... />`
  below the on-device language model card.
- `frontend/src/lib/slm-runtime.ts` — `'silent'` logger
  branch now noops `warn` + `error` too (SF-2 fix; impacts
  intent-parser + booking-advisor + field-suggest as well —
  all benefit from the same hardening).

## Test results

- Vitest: 146 → **193** (+47 doc-summariser cases including
  protocol-version pin, 6 per-kind bias-hint shape tests,
  parser happy paths, honest-hide bindings, 5 defence-in-
  depth coercions, 18 sample-fixture PII-hygiene cases, 2
  SF-6 console.warn cases).
- Node tests: **1217** unchanged (FE-only phase).
- tsc clean. Build green.
