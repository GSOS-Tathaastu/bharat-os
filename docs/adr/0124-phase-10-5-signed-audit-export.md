# ADR 0124 — Phase 10.5: signed labeling-job audit export bundle

Status: Accepted (2026-05-31).
Phase: 10.5 (labeling marketplace v1, audit surface).
Depends on: ADR 0110 (labeling marketplace), ADR 0121 (Phase 10.1+10.2
labeling v1), ADR 0123 (Phase 10.4 QC pipeline), ADR 0120 (Phase 9.1
sponsored federated rounds — pattern reuse).

## Context

Phase 10.1 → 10.4 shipped the labeling marketplace lifecycle (sponsor
+ escrow + items + submissions + QC). Sponsors can already pull the
sponsor-review list (Phase 10.4) over a per-(job, worker) rotated
identityHash. But there is no single signed bundle a sponsor can pull
once a job completes and hand to their downstream training pipeline
for tamper-evident audit. Without it, a sponsor's lawyer has to take
the platform's word that the labels they paid for are the labels
they received. That is a non-starter for the kind of enterprises
(banks, telcos, govt research labs) the marketplace is supposed to
serve.

The federated-round side already has a similar export (Phase 9.1
`GET /api/sponsors/:id/federated-rounds/:roundId/export`). Phase 10.5
extends the same idea to labeling jobs, but adds the missing piece
the federated-round export skipped: a server-anchored Ed25519
signature so the bundle is provably the one Bharat OS emitted.

## Decision

Ship a signed NDJSON export bundle endpoint for completed (and
in-progress) labeling jobs. Specifically:

1. **`GET /api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson`**
   — sponsor-bearer gated. Returns NDJSON with three line types:
   `header`, `submission` (one per accepted-equivalent submission),
   `trailer`. The trailer carries the SHA-256 of the preceding body
   lines + an Ed25519 signature over that hash from a single
   server-side audit signer. Same identityHash rotation as Phase 10.4
   review-list endpoint — `sha256(jobId::workerId)` — so a sponsor
   cannot cross-job correlate workers.

2. **`GET /api/audit-signer/public-key`** — public. Returns the audit
   signer's public record (`{id, publicKeyPem, createdAt}`). Anyone
   verifying a bundle (sponsor, citizen, regulator) fetches this and
   runs `verifyLabelingExportLines(lines, signerPublicRecord)`.

3. **Audit signer is a singleton.** One Ed25519 keypair is
   lazy-bootstrapped on first export (or first public-key request)
   and persisted to the store (`audit-signer.json` for the file store,
   `audit_signer` SQLite table with `singleton = 'audit-signer'` for
   SQLite). Same key signs every bundle for the life of the
   deployment. Rotation is a Phase 10.5.1 follow-up — would require
   versioning the trailer + republishing every old bundle's verifier.

4. **Pure module** at [src/phase1/labeling-export.mjs](../../src/phase1/labeling-export.mjs)
   with two exports: `buildLabelingExportLines({job, submissions,
   signerIdentity, exportedAt})` (returns line array) and
   `verifyLabelingExportLines(lines, signerPublicRecord)` (returns
   `{ok, reason?, contentSha256?, submissionCount?}`). Same code
   runs on the server (sign) and on the verifier (verify) — no
   forking.

5. **Ledger event** `labeling_export.signed` emitted on each
   successful export with `{jobId, sponsorId, signerId, contentSha256,
   submissionCount, exportedAt, protocolVersion}`. A sponsor cannot
   later swap a tampered bundle for the original — the ledger
   anchors the original hash.

6. **§15 bindings preserved.**
   - Pointer-not-payload: per-submission line carries only
     `submissionId`, `itemId`, `labelValue`, `submittedAt`,
     `identityHash`, `payoutPaise`. No worker identity, phone,
     device, or attestation.
   - Cross-job correlation prevented: `identityHash =
     sha256(jobId::workerId)`. Same worker hashes differently across
     different jobs.
   - Tamper-evident: SHA-256 over the body + Ed25519 signature in
     the trailer. Mutating any line breaks `verifyLabelingExportLines`.
   - Server-anchored: ledger event records the same content hash;
     a sponsor cannot present a "later corrected" bundle.
   - Worker filter respects QC: only `accepted` submissions appear.
     `pending_sponsor_review`, `rejected_golden_mismatch`, and
     `rejected_sponsor_review` are excluded — the bundle represents
     what was paid for, not what was submitted.

## Bundle layout

```
{"type":"header","protocolVersion":"bos.phase10.labeling-export.v0",
 "jobId":"...","sponsorId":"...","taskKind":"classification",
 "language":"hi","modality":"text","perLabelPaise":500,
 "ipTerms":"non_exclusive","consentPurposeCode":"...",
 "submissionCount":N,"exportedAt":"2026-05-31T...","signerId":"bos:person:..."}
{"type":"submission","submissionId":"...","jobId":"...","sponsorId":"...",
 "itemId":"...","taskKind":"classification","labelValue":{...},
 "status":"accepted","submittedAt":"...","identityHash":"sha256:...",
 "payoutPaise":500}
...
{"type":"trailer","contentSha256":"...","signature":{"algorithm":"Ed25519",
 "signerId":"bos:person:...","signatureBase64":"..."}}
```

`contentSha256` is computed over the UTF-8 bytes of
`header_line + '\n' + sub1_line + '\n' + ... + subN_line + '\n'` —
everything before the trailer + a trailing newline (NDJSON
convention). The trailer line itself is NOT included in the hash.

## Verification

```js
import { verifyLabelingExportLines } from 'bharat-os/labeling-export';
const lines = ndjsonText.trimEnd().split('\n');
const signerPublic = await (await fetch('/api/audit-signer/public-key')).json();
const verdict = verifyLabelingExportLines(lines, signerPublic);
// verdict.ok === true if untampered + signer matches.
```

Verification fails if any of: trailer missing, body hash mismatch,
signature invalid, header.signerId doesn't match the verifier's
public-key id.

## Why this shape

- **Single keypair vs per-job keypair.** Per-job keypair would
  prevent rotation invalidating old bundles, but multiplies the
  number of public keys a sponsor's auditor must trust. Single
  keypair + ledger anchoring covers the same threat model with one
  trust anchor. Rotation is a follow-up.
- **NDJSON vs JSON.** NDJSON streams; a 10M-submission bundle stays
  manageable for both sides. Also matches Phase 9.1 federated export.
- **Trailer signature vs detached signature header.** Trailer keeps
  the bundle self-contained — a sponsor can store one file and
  re-verify it years later without remembering which detached
  signature was paired with which body. Cost: the verifier has to
  read to the end before deciding. Acceptable; bundles are usually
  KB-MB scale, not GB.
- **Filter to accepted on the server.** A sponsor isn't entitled to
  see rejected golden-set submissions or pending-review labels —
  those are either no-payout (golden_mismatch) or not yet adjudicated
  (pending). Filtering on the server enforces that the bundle's
  total payout matches the job's `escrowDebitedPaise`.

## Pattern reuse

- Same `identityHash = sha256(jobId::workerId)` scheme as Phase 10.4
  review-list endpoint and Phase 9.1 federated-round export.
- Same lazy-bootstrap + singleton pattern as the Phase 6 store
  paths.
- Same `appendLedger(...)` ledger anchor as Phase 9.1 sponsor escrow
  events.
- Same `createIdentity()` / `signText()` / `verifySignature()` core
  primitives used by every other signed artifact in the codebase.

## What's NOT in this sub-phase

- **Key rotation.** Single signer for the life of the deployment.
  Phase 10.5.1 polish — would need a `signerId` lookup mechanism
  and a versioned `header.signerVersion` field.
- **Sponsor UI for download.** Sponsors today fetch via curl /
  their own tooling with their bearer token. A sponsor console
  surface for one-click download is Phase 10.5.1.
- **Worker-side audit bundle.** Workers can download their own
  data via `/api/identities/:id/data` (Phase 6.x). A worker-facing
  signed-receipt bundle for the labels they submitted is a Phase
  10.6+ follow-up if real workers ever ask for it.
- **Bulk multi-job export.** Per-job for now. Bulk is a Phase
  10.5.2 polish.
- **Encrypted bundle.** Bundle content is plaintext NDJSON +
  signature. Sponsors who want encryption-at-rest TLS-tunnel the
  download and re-encrypt at their end. Phase 10.5+ polish if
  enterprise pushback.

## Consequences

- Sponsor audit story is closed for the v1 labeling marketplace.
  An auditor can fetch the bundle + public key + ledger event and
  verify end-to-end with no Bharat OS-side trust.
- Phase 10 progress: ~75% → ~88%. Only Phase 10.6 (SLM pre-labeling
  hint) remains before the v1 marketplace is shippable.
- Phase 11 (FE) gains a small transparency strip on Settings
  showing the audit signer public key — sponsors aren't the only
  audience; citizen workers should also be able to see the key that
  signs receipts of their work.
- Negative space: rotating the audit signer is now a coordinated
  multi-party operation. Polish or accept-and-document for v1.

## Tests

11 tests in [tests/node/labeling-export.test.mjs](../../tests/node/labeling-export.test.mjs):

- 7 pure builder/verifier: identityHash rotation, header+subs+trailer
  shape, accepted-only filter, tamper detection (content hash mismatch),
  wrong-signer rejection, NDJSON shape.
- 4 HTTP: lazy-bootstrap of audit signer (and stability across
  calls), bearer gating, signed roundtrip + ledger event, 404 on
  unknown job.

Full Node suite 854 → 865 (+11). FE Vitest 16/16 unchanged. Bundle
main 362 → 363 KB / 111 KB gzipped (+1 KB for the audit-signer
hook + Settings transparency card).
