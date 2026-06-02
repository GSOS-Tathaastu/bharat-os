# ADR 0154 — Phase 13.0.1: PDF upload + on-device text extraction (SLM-E follow-up)

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.0 SLM-E (ADR 0149) shipped the on-device document
summariser as a paste-text-only surface. ADR 0149 explicitly
deferred PDF text-layer extraction to Phase 13.0.1 because it
required an npm dep (`pdfjs-dist`) and we hold the binding "no
new npm dep without asking". The founder approved the dep on
2026-06-02; this ADR ships the picker + extractor.

## Decision

Add `pdfjs-dist@^6.0.227` and ship Phase 13.0.1 as:

1. **`frontend/src/lib/pdf-text-extract.ts`** — pure-FE shared
   CORE substrate (per the `common-features-as-core-substrates`
   memory binding) so future SLM-F / SLM-H consumers (kirana
   receipt scan, scheme PDF intake, ABHA reports) compose the
   same exports.
2. **DocSummariserPanel** picker affordance — a file input next
   to the textarea that calls `extractPdfText()` and populates
   the textarea with the extracted text. Typed errors map to
   citizen-friendly messages.

### 1. `pdf-text-extract.ts`

- `PDF_EXTRACT_PROTOCOL_VERSION = 'bos.phase13.pdf-text-extract.v1'`
- Caps: `MAX_PDF_BYTES = 10 MB`, `MAX_EXTRACT_CHARS = 6000`
  (aligned to SLM-E `DOC_INPUT_CHAR_CAP` per SF-4 — see below),
  `MAX_EXTRACT_PAGES = 32`.
- `extractPdfText(file, opts?)` returns:
  - `text` — joined extracted text, capped + word-boundary truncated
  - `pageCount` — pages reported by pdfjs
  - `pagesExtracted` — pages we successfully read **at least one
    char from** (SF-2 — was previously `Math.min(pageCount,
    maxPages)`; lied when individual pages errored)
  - `charsExtracted` — raw chars before clamp
  - `truncated` + `truncatedReason: 'pages' | 'chars' | 'both' | null`
    (SF-5 — single-source reason so the panel never shows
    "Read 1 of 1 page — truncated" contradiction).
- Throws `PdfExtractError` with `code`:
  - `unsupported_mime` — non-PDF MIME
  - `too_large` — file size > MAX_PDF_BYTES
  - `encrypted` — password-protected PDF
  - `corrupt` — pdfjs open failure OR all-pages-fail (SF-2)
  - `no_text_layer` — opened cleanly, every page returned zero
    chars (likely a scanned image)
- Pure helpers exported for unit testing: `joinPageText`,
  `classifyPdfError`, `truncateExtracted`.
- Worker loaded via Vite `?url` import from the local
  `pdfjs-dist/build/pdf.worker.mjs` — no CDN fetch.
- Test-injection seam: `opts.getDocument` lets vitest avoid
  loading the real pdfjs main module (which needs `DOMMatrix`,
  unavailable in jsdom). The test file additionally
  `vi.mock`s `pdfjs-dist` and the `?url` import.

### 2. DocSummariserPanel picker

- File input `accept="application/pdf,.pdf"` next to the
  existing textarea.
- `handlePickPdf` runs `extractPdfText`, populates `docText`
  with the result, and renders a citizen-facing notice keyed
  off `truncatedReason`.
- Errors map to specific copy via `PDF_ERROR_MESSAGE` —
  citizen never sees the raw pdfjs error string.
- Picker is gated on `pdfBusy` so a rapid double-pick can't
  fire mid-extract.

### 3. `frontend/src/vite-env.d.ts`

New file. Declares the Vite-specific `?url` module shape so
TypeScript accepts the worker URL import.

### 4. Adversarial review (3 lenses + triage)

**1 MUST_FIX + 6 SHOULD_FIX + 17 defer**. All 7 applied
in-phase. Verdict ship_with_fixes.

**Must-fix applied**:

| ID | Fix |
|---|---|
| MF-1 | **Critical** — Rules-of-Hooks crash. `useRef + useState` for the PDF state were declared AFTER the existing `if (status.unavailable && reason==='no_blob') return ...` and `if (!hasSlm) return null` early returns. On the install-the-pack flow `hasSlm` flips false→true on the SAME mount, which causes React 19 to throw *"Rendered more hooks than during the previous render"*. The PDF state hooks are now declared at the top of the component, before any conditional return. |

**Should-fix applied**:

| ID | Fix |
|---|---|
| SF-1 | Race-safe concurrent picks via `pickGenRef` generation counter. Two rapid picks no longer let a slow extract overwrite a fast one. |
| SF-2 | Per-page error tracking. `pagesExtracted` now reflects only pages that contributed text. If ALL attempted pages fail, throw `corrupt` rather than the misleading `no_text_layer` (which tells the citizen "this is a scanned image" for a perfectly textual PDF). |
| SF-3 | `setLastResult(null)` and `reset()` moved INSIDE the try block. A failed pick now preserves the prior summary on screen rather than wiping it. |
| SF-4 | `MAX_EXTRACT_CHARS` lowered from 12 000 to 6 000 to match `DOC_INPUT_CHAR_CAP`. Earlier double-clamp lied to the citizen via the panel notice ("Read N pages — no truncation" while the SLM silently saw only the first 6 000 chars). |
| SF-5 | New `truncatedReason` field on the envelope + branched panel notice. A single-page char-clamp no longer says "Read 1 of 1 page — truncated"; it says "Read all 1 page — kept the first 6 000 characters to fit the on-device model." |
| SF-6 | `pdfBusy` added to Summarise / Try sample / Clear disabled clauses so the citizen can't fire a summary against pre-pick textarea content mid-extract. |

**Deferred** (17 items): explicit defensive pdfjs flags
(`isEvalSupported: false`, etc.), `pdf.destroy()` cleanup,
sourcemap policy, error-message sanitisation, accessibility
polish, confirm-before-replace-textarea, classifyPdfError dead
branch cleanup, charsExtracted surfacing, joinPageText comment,
ensureWorker singleton documentation, ExtractOptions export,
empty-MIME magic-byte sniff. All flagged for the next
hardening pass (Phase 13.0.2 or a dedicated FE build-hardening
ADR).

### 5. §15 bindings

| Binding | How honoured |
|---|---|
| Bytes never leave device | Worker URL is bundled by Vite from `pdfjs-dist/build/pdf.worker.mjs` — no CDN fetch. `cMapUrl`, `standardFontDataUrl`, `wasmUrl` are never set so pdfjs's BinaryDataFactory throws rather than fetching. PDF blob is read once via `file.arrayBuffer()`, transferred to the worker, never persisted. |
| Honest empty state | Five typed error codes; the panel renders specific copy for each (no raw pdfjs strings). Image-only / encrypted / corrupt / too-large all get accurate citizen-facing messages. |
| Protocol version pinned | `bos.phase13.pdf-text-extract.v1`. |
| Pointer-not-payload | The PDF bytes never leave the page; only the extracted text is fed to the in-browser SLM runtime. Nothing crosses the network. |
| FE-BE parity (2026-05-27) | **BE delta = none, by design.** Mirrors the Phase 13.0 / 13.1 / 13.3 precedents. PDF extraction is on-device-only; a `/api/extract-pdf/*` endpoint would falsify the §15 binding. |

## What's NOT in 13.0.1 (deferred)

- **Phase 13.0.2 or next hardening pass** — explicit defensive
  pdfjs flags (`isEvalSupported: false`, `useSystemFonts: false`,
  `disableFontFace: true`, `disableAutoFetch: true`,
  `disableStream: true`); `pdf.destroy()` cleanup in `finally`;
  static error messages on `PdfExtractError`; magic-byte sniff
  for empty-MIME files; classifyPdfError dead-branch cleanup.
- **OCR** for scanned / image-only PDFs (Tesseract.js or a
  multimodal SLM) — separate Phase 13.x sub-phase.
- **Multi-PDF batch** — pick multiple files, queue them. Future
  UX polish.
- **Confirm-before-replace** — picking a PDF after typing in the
  textarea overwrites silently. UX polish for a future pass.

## External-API impact (API_INTEGRATIONS.md)

**Zero**. The pdfjs worker is loaded from the locally-bundled
Vite asset; no CDN, no external service, no partner credentials.
The whole 13.x SLM USP arc continues to add capability without
external services. Only edit: "Last updated" header bump.

The npm dependency `pdfjs-dist@^6.0.227` is a build-time +
runtime FE dep, not an external API. No env var, no auth flow.

## Files

NEW:
- `frontend/src/lib/pdf-text-extract.ts` (~250 lines)
- `frontend/src/lib/pdf-text-extract.test.ts` (~280 lines, 26 cases)
- `frontend/src/vite-env.d.ts` (~10 lines; `?url` declaration)
- `docs/adr/0154-phase-13-0-1-pdf-upload-text-extract.md`

EXTENDED:
- `frontend/src/components/DocSummariserPanel.tsx` — PDF picker
  + 4 new state hooks (moved BEFORE early returns per MF-1) +
  `pickGenRef` (SF-1) + race-safe `handlePickPdf` (SF-1, SF-3) +
  branched `buildExtractNotice` (SF-5) + `pdfBusy` in disable
  clauses (SF-6) + "How this works" copy mentions the picker
  + image-only honest framing.
- `frontend/package.json` — `pdfjs-dist@^6.0.227`.
- `BHARAT_OS.md` — §17 close-out row.
- `README.md` — SLM USP arc status bump.
- `ROADMAP.md` — flip 13.0.1 to SHIPPED.
- `docs/API_INTEGRATIONS.md` — "Last updated" header bump.

## Test results

- Vitest: 356 → **382** (+26 PDF cases). Existing 356 cases
  unchanged.
- Node tests: **1233** unchanged (FE-only phase, BE delta = none).
- tsc clean. Build green.
