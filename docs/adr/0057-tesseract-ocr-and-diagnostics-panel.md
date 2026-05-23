# ADR 0057: Real Tesseract.js OCR + Investor-Demo Diagnostics Panel

## Status

Accepted

## Context

Phase 2a.2 (ADR 0051) wired the health-document capture contract — image
hashing, deterministic field extraction, mocked ABHA upload, and a `/shell/`
capture card. The OCR engine itself was a deterministic text-normalization
scaffold: the user had to manually paste OCR text from another tool. §17
flagged this as the remaining hardening step.

Separately, the audit of Codex's Phase 2a.1 → 2a.7 work surfaced an honesty
gap for investor demos: 2a.1, 2a.3 (client), 2a.4 (local notifications), 2a.6
are real browser-native; 2a.2 was partial; 2a.5 and 2a.7 are placeholders.
The README phase log and the §17 status board both said "✅ scaffold done"
which was technically accurate but read like every item was finished. An
investor inspecting the running PWA could not tell which buttons actually
called a real API and which performed metadata bookkeeping.

## Decision

Phase 2a.8 closes both gaps:

### Real Tesseract.js OCR for health document capture

- `public/shell/app.js` lazy-loads Tesseract.js from a CDN
  (`https://esm.sh/tesseract.js@5`) the first time the user picks a health
  document image, with English / Hindi / Tamil language data (~7 MB total).
- The OCR text auto-fills the textarea unless the user already typed
  something. Confidence and character count appear in the file-meta line.
- If the CDN is unreachable or the recognizer fails, the textarea remains
  the manual fallback path — the upload flow does not break.
- The service worker explicitly skips cross-origin requests (esm.sh) from
  its cache logic so opaque CORS responses do not corrupt the same-origin
  app-shell cache. Bumped to `bharat-os-shell-v5`.

### Diagnostics panel — "What's running, what's scaffold"

- New collapsible section at the bottom of `/shell/` that lists each
  Phase 2a.x feature with one of four tags: `real`, `real (client)`,
  `partial`, or `placeholder`, plus a one-line honest detail.
- Includes the §17 footprint-tier note (Tier 1 ~50 KB, Tier 2 ~7 MB
  lazy, Tier 3 ~30 MB opt-in, Tier 4 1.5–4 GB explicit opt-in) so the
  "is this too heavy on mobile" question can be answered inline during a
  demo.
- Maps directly to the §17 status board so the shell and the doc agree.

### §17 status board refresh

- Phase 2a queue item #2 moved from "scaffold done" to **"real"**.
- New "Footprint accounting" subsection in §17 with the four-tier table
  and the explicit framing that Bharat OS is the lightest way a phone
  gets this functionality, not the heaviest.

## Consequences

- The health-document path now demonstrates real on-device OCR end-to-end:
  snap a photo of a prescription → text extracted by Tesseract.js → fields
  parsed → ABHA upload (still mocked at the L3 partner boundary).
- Investors can inspect a single visible panel in the shell and read off
  which Phase 2a items are real today, which are partial, and which are
  honest placeholders.
- The footprint story is documented in §17 with concrete numbers and a
  side-by-side comparison to typical Android apps. The "is this too
  heavy" concern has a one-paragraph answer.
- Tesseract.js is loaded from a public CDN. For a fully offline demo or
  production build, the engine + language data should be bundled in
  `public/shell/vendor/` instead — a future hardening step.
- Non-English prescription extraction is still pattern-based and assumes
  Latin-script medical terms (HbA1c, Tab Metformin). Native-script
  prescriptions (Hindi / Tamil OCR text) will OCR cleanly but the
  field-extraction step won't pull structured medications. A
  language-specific extraction pass is the next iteration on this seam.
