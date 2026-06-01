# ADR 0143 — Phase 12.2.3: Attachment CORE substrate + KYC L1 selfie/ID-proof wiring

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.2 KYC Level 1 shipped with name + last-4 IDs +
address ONLY — selfie + ID-proof photo were explicitly deferred
because the codebase had no binary blob substrate:

- Zero BLOB columns anywhere in the SQLite schema.
- No multipart parser in the HTTP layer.
- Zero `<img>` / `getUserMedia` / file-upload precedent in the
  React app.
- No content-addressing convention; no per-actor quota; no DPDP
  cascade story for blobs.

Phase 12.2.4 per-role extras (cab-driver vehicle docs, personal-
driver police verification) AND Phase 12.x dispute evidence both
need this substrate. Building it once as a CORE substrate honors
the "common features as core substrates" binding (memory:
`common-features-as-core-substrates`).

## Decision

### 1. Substrate (`src/phase1/attachment.mjs`)

Pure helpers + constants:

- **`ATTACHMENT_MIME_ALLOWLIST`** — frozen
  `['image/jpeg', 'image/png', 'image/webp', 'application/pdf']`.
  Anything else gets a 415 at the API layer.
- **`ATTACHMENT_KINDS`** — frozen enum: `kyc_l1_selfie`,
  `kyc_l1_id_proof`, `vehicle_registration`,
  `driving_licence`, `police_verification`,
  `employer_reference`, `contractor_attestation`, `misc`.
  Closes the operator-review queue's renderer surface.
- **`ATTACHMENT_MAX_BYTES_PER_BLOB = 5 MiB`**, **`ATTACHMENT_MAX_BYTES_PER_ACTOR = 50 MiB`**.
- **`deriveAttachmentId(sha256) = 'bos:att:' + sha256.slice(0,32)`** —
  content-addressed; two citizens uploading the same JPEG hash
  to the same prefix but hold separate per-identity rows.
- **`decodeAttachmentBytes(base64)`** — defensive decode +
  sha256 + size checks; throws typed `AttachmentValidationError`
  with stable codes (`bytes_required`, `bytes_empty`,
  `bytes_too_large`, `bytes_invalid`).
- **`buildAttachmentRecord({...})`** — pure constructor;
  validates MIME + kind + rootIdentityId; sets `mayContainExif`
  flag for JPEG / WebP (Phase 12.2.3 adversarial fix PII-4 —
  v1 does NOT strip EXIF, the flag warns operators).
- **`publicAttachmentMeta(record)`** — listing projection
  strips `bytes`.

### 2. Storage (both stores)

**SqliteStore** — new table:
```sql
CREATE TABLE attachments (
  sha256 TEXT NOT NULL,
  root_identity_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  bytes BLOB NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (sha256, root_identity_id)
);
CREATE INDEX idx_attachments_owner_created ON attachments(root_identity_id, created_at);
CREATE INDEX idx_attachments_kind ON attachments(kind);
```
The composite PK on `(sha256, root_identity_id)` gives per-
identity dedupe + DPDP-correct ownership. The bytes BLOB is the
first BLOB column in the entire schema; the `json` column mirrors
metadata for cheap meta-only reads (listing endpoint never
touches bytes).

**BosStore** — two-file layout per blob: `<id>.bin` (raw bytes)
+ `<id>.json` (metadata). The `.json` is what `listJson` scans;
the `.bin` is read on demand. DPDP cascade unlinks `.bin` FIRST,
only then `.json` (Phase 12.2.3 adversarial fix DPDP-2 — the
earlier ordering could leave orphaned naked `.bin` files when
the `.bin` unlink lost a race with the OS).

**CRUD quartet** on both: `saveAttachment(record, {quotaCapBytes})`,
`readAttachment(id, {rootIdentityId})`, `listAttachments({rootIdentityId, kind})`,
`sumAttachmentBytesByActor(rootIdentityId)`, `deleteAttachment(id, {rootIdentityId})`.

**DPDP cascade** wires one line in each store's `eraseUserData`:
`sweep('attachments', ['root_identity_id'])`. SqliteStore runs
this inside the same `BEGIN ... COMMIT` block as the identity
sweep — bytes + identity vanish atomically.

### 3. API endpoints

- **`POST /api/attachments`** — base64-JSON upload with an
  8 MiB body cap override (raw 5 MiB → ~6.7 MiB base64 +
  headroom). Owner-auth via `actingRootIdentityId` body or
  `X-Bharat-OS-Acting-Identity` header. Rate-limit policy
  upgraded to `expensive` (10/min) — Phase 12.2.3 adversarial
  fix A3-5; the prior `write` policy (30/min × 8 MiB = 240
  MiB/min) was a memory-allocator DoS surface.
- **`GET /api/attachments/:id`** — raw bytes. Two auth paths:
  owner via `X-Bharat-OS-Acting-Identity` header (no admin
  read event), OR operator via admin bearer (emits
  `attachment.admin_read` ledger event — Phase 12.2.3
  adversarial fix A3-2). Content-addressed cache headers:
  `private, max-age=31536000, immutable` + `ETag: "<sha256>"`.
  Erased attachment surfaces as `attachment_unavailable`
  code (Phase 12.2.3 adversarial fix DPDP-3) so the operator
  console renders "evidence withdrawn" instead of a generic
  broken link.
- **`GET /api/attachments`** — owner-only metadata listing.
- **`DELETE /api/attachments/:id`** — owner-only.

`readRequestJson` now accepts an optional `maxBytes` override
— global 1 MiB stays in place for every existing handler.

### 4. KYC L1 wiring

- `validateKycLevel1Submission` accepts optional
  `selfieAttachmentId` + `idProofAttachmentId` (regex
  `^bos:att:[0-9a-f]{32}$`).
- `submit-kyc-l1` cross-checks attachment ownership BEFORE
  accepting — a citizen cannot reference another citizen's
  selfie.
- Ledger event `provider_identity.kyc_l1_submitted` adds the
  new field names to `submittedFields` when set. Values
  remain off-ledger (the IDs themselves are content hashes,
  not PII per se).
- `selfProviderRecord` echoes the IDs through the owner-list
  endpoint (substrate handles are not last-4-grade PII; they
  let the wizard re-render the existing capture on
  resubmission).

### 5. FE — `useAttachmentUpload` + `<PhotoCapture/>`

- `frontend/src/lib/use-attachment-upload.ts` — TanStack
  mutation; client-side MIME + size pre-check; FE constants
  mirror BE allowlist + cap. `blobToBase64` via `FileReader`.
- `frontend/src/components/forms/PhotoCapture.tsx` — file-
  input primary path (proven on the shell):
  `<input type="file" accept="image/*" capture="environment|user">`.
  Preview + confirm + retake. Existing-capture mode renders
  the actual blob thumbnail (Phase 12.2.3 adversarial fix
  UX-1 — the component header promised a thumbnail but the
  initial implementation only showed a static badge).
  `URL.createObjectURL` revoked on unmount + replace + 30s
  after operator-tab navigation.
- KYC L1 wizard grew from 3 to **5 steps**: identity →
  **selfie** (`captureMode='user'`) → **idProof**
  (`captureMode='environment'`) → address → review. The
  hydration guard pre-fills existing selfie/idProof refs so
  a resubmission doesn't force a re-photograph.

### 6. Operator console

- Per-row "View selfie" / "View ID proof" buttons fetch with
  admin bearer, blob-URL the bytes, and open in a new tab
  (URL revoked after 30s).
- EXIF warning banner under the row when JPEG/WebP attachments
  are present: "⚠ Photos may carry EXIF / GPS — strip before
  forwarding."
- Graceful framing when the citizen has erased the blob
  between submission and operator review: "This attachment
  is no longer available — ask them to re-submit."

### 7. §15 bindings honored

- **No bytes on the audit ledger.** `attachment.saved` /
  `attachment.erased` / `attachment.admin_read` carry
  `{attachmentId, actorId, sha256, byteLength, mimeType,
  kind, [operatorId]}` only. Binding-grep test asserts no
  JPEG signature in event JSON.
- **PII path redaction.** `/api/attachments/:id` rewritten to
  `/api/attachments/:id` in `safePath` (covers both `:`-form
  and URL-encoded `%3A` form). Same future-proof discipline
  the PIN-code endpoint got in 12.2.2.
- **Cross-owner read isolation.** Composite PK + the WHERE
  clause guarantee read returns null for a foreign caller.
- **Operator reads audited.** Every admin GET emits
  `attachment.admin_read` so an over-broad token-holder leaves
  a trail.
- **MIME allowlist.** 4 entries; substrate rejects everything
  else with 415.
- **Quota TOCTOU closed.** SqliteStore wraps the read-sum +
  insert in `BEGIN IMMEDIATE`. BosStore best-effort (no
  transactional primitive; production posture is SQLite).
- **EXIF flagged.** `mayContainExif: true` on JPEG/WebP rows;
  operator console shows a warning banner. Stripping is
  Phase 12.x scope (requires re-encode dependency).

### 8. Tests

**Node (`tests/node/attachment.test.mjs`, 28 cases)**:
- Substrate: protocol version, frozen allowlists, kind
  validation, content-addressed ID derivation, base64
  decode happy + edge cases, record construction, public
  meta projection.
- SqliteStore: save/read/list/delete round-trip,
  cross-owner read returns null, ledger event meta-only
  (§15 binding), DPDP cascade.
- Adversarial fixes: `safePath` redacts attachment paths
  (both colon + URL-encoded forms), empty-actor list
  protection, quota TOCTOU enforcement, `attachment.admin_read`
  ledger event on admin GET, owner GET does NOT emit
  admin_read, erased blob returns `attachment_unavailable`,
  `mayContainExif` flag.
- HTTP: POST happy path + missing-identity 401 + unknown-
  identity 404 + bad-MIME 415 + bad-kind 400; GET owner
  + GET cross-owner 404 + GET operator bearer; DELETE
  owner + ledger event; listing meta-only.

**Vitest (`use-attachment-upload.test.ts`, 3 cases)** — FE
allowlist + kinds + per-blob cap mirror BE exactly.

### 9. Adversarial review (4 lenses)

- **PII**: 6 findings. 4 fixed in-phase (path redaction,
  empty-actor list, EXIF flag, ledger meta-only). 2
  accepted (operator tab history; substrate-doc note).
- **DPDP / lifecycle**: 6 findings. 3 fixed (BosStore
  cascade ordering, attachment_unavailable code, quota
  txn). 3 deferred (orphan sweep — admin tool;
  attachment-locked-on-KYC-ref — substrate-wide change;
  LIKE-prefix collision documentation).
- **Auth / DoS**: 6 findings. 3 fixed (admin_read audit,
  rate-limit upgrade, owner-DELETE confirmed gated). 2
  deferred (substrate-wide auth gap — Bharat ID Phase
  13+; admin-token HTTPS gate — production hosting).
  1 accepted (viewAttachment error UX is clear).
- **UX / parity**: 8 findings. 1 fixed (real thumbnail
  on hasExisting). 7 OK or intentional (step badge,
  back navigation, FE/BE parity, blob URL safety).

Total: 26 findings, 11 fixed in-phase, 15 deferred or
accepted with rationale.

### 10. What's NOT in 12.2.3 (deferred)

- **EXIF stripping** — requires re-encode (canvas in browser,
  `sharp` in node). v1 flags only; Phase 12.x stripper sweeps
  existing rows once the dependency is approved.
- **Orphan sweep** — citizen could upload 10 × 5 MiB unbound
  blobs, self-DoS via quota. Acceptable in MVP (self-inflicted).
  Admin cron lands in Phase 12.x or with the first operator
  surface.
- **Attachment-locked-on-KYC-ref** — citizen can DELETE a
  blob after submit-kyc-l1, leaving a dead reference. v1
  surfaces it as `attachment_unavailable` to the operator;
  refusing the DELETE or snapshotting the blob into a
  KYC-scoped immutable record is Phase 12.x.
- **Substrate-wide signed-session auth** — Phase 13+ Bharat
  ID; current auth (declared rootIdentityId + readIdentity
  existence check) is consistent with the rest of Phase 12.x.
- **HTTPS-only gate on admin token storage** — operator
  console deployment context. Tied to KYC-AUTH-3 deferral
  from Phase 12.2.2.
- **camera-stream secondary capture path** — file-input
  primary handles iOS Safari + Android directly via
  `capture=environment|user`. `getUserMedia` + canvas
  downsample lands when a desktop operator surface needs it.

## Files

NEW (BE):
- `src/phase1/attachment.mjs` (~180 lines).
- `tests/node/attachment.test.mjs` (28 cases).

NEW (FE):
- `frontend/src/lib/use-attachment-upload.ts`.
- `frontend/src/lib/use-attachment-upload.test.ts` (3 cases).
- `frontend/src/components/forms/PhotoCapture.tsx`
  (~200 lines).

EXTENDED (BE):
- `src/phase0/sqlite-store.mjs` — new attachments table +
  CRUD quartet (with `quotaCapBytes` BEGIN IMMEDIATE txn) +
  DPDP cascade line.
- `src/phase0/store.mjs` — file-store quartet (two-file
  layout) + best-effort quota + cascade ordering fix.
- `src/phase0/api.mjs` — POST/GET-list/GET-id/DELETE
  endpoints + `readRequestJson({maxBytes})` override +
  KYC L1 attachment-ref validation.
- `src/phase0/logger.mjs` — PII_PATH_TEMPLATES entry for
  `/api/attachments/:id`.
- `src/phase0/rate-limiter.mjs` — POST `/api/attachments`
  upgraded to `expensive` policy.
- `src/phase1/provider-identity.mjs` — KYC L1 attachment
  ref validation + `selfProviderRecord` projection.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `KycLevel1Submission` +
  `SubmitKycLevel1Input` carry optional attachment IDs.
- `frontend/src/routes/onboarding/KycLevel1Page.tsx` —
  3 → 5 steps + hydration of existing capture refs.

EXTENDED (operator console):
- `public/operator-console/index.html` — unchanged shape;
  `#provider-kyc-review` row layout absorbs the new buttons.
- `public/operator-console/app.js` — `viewAttachment` with
  blob-URL + 30s revoke + erased-blob framing; per-row View
  buttons; EXIF warning banner.

## Test results

- Node tests: **1103 → 1110** (+7 adversarial-fix cases).
- Vitest: **121 → 124** (+3 substrate constants).
- tsc: clean.
- Build: main bundle 612 → 618 KB / 174 → 175 KB gzipped
  (+6 KB for hook + capture + wizard steps).
