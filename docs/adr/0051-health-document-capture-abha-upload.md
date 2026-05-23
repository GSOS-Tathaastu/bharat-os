# ADR 0051: Health Document Capture to Mocked ABHA Structured Upload

## Status

Accepted

## Context

Phase 2a queue item #2 in `BHARAT_OS.md` is document capture -> OCR -> ABHA
structured upload. The production target is camera capture plus Indic OCR
(Tesseract.js / IndicOCR / Bhashini-class extraction) feeding an ABHA write
flow. The repository cannot treat raw images or full OCR text casually because
§15 binds Bharat OS to pointer-not-payload semantics.

## Decision

Add a Phase 2a.2 health-document capture contract:

- `src/phase1/health-document.mjs` creates `health-document-capture`
  artifacts from camera/file metadata plus OCR text.
- The capture stores image MIME, byte length, optional SHA-256, and structured
  observations. It does **not** store the raw image or full OCR text.
- Deterministic extraction currently recognizes common prescription/lab-report
  signals: condition hints, medicines, HbA1c, blood glucose, blood pressure,
  and follow-up date.
- `bos:skill:abha-document-upload` binds the existing `abha` tool to the new
  `health_document_upload` action with `health.record.write` consent.
- `POST /api/health-documents` runs the L6 skill preflight, L4 consent/policy,
  mocked ABHA upload, tool-execution receipt, and health-document persistence.
- `/shell/` now includes a compact health-document capture card: mobile camera
  file input, OCR text fallback, and upload result rendering.

## Consequences

- The PWA can now demonstrate a captured prescription/lab report becoming a
  structured ABHA upload receipt without storing raw image payloads.
- This closes the backend and PWA contract for Phase 2a #2, but the OCR engine
  is still a deterministic text-normalization scaffold. Real image-to-text
  extraction via Tesseract.js / IndicOCR remains the next hardening step.
- Upload is consent-gated by `health.record.write`; demo seed consent now
  includes that scope for the Lakshmi health persona.
