# ADR 0163 — Phase 13.5.2: Signed citizen-data-offer audit-export bundle

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.5 / 13.5.1 (ADRs 0160 / 0162) shipped the citizen
publication + sponsor purchase loop end-to-end. The Phase 13.5.1
ADR explicitly deferred:

> "Phase 13.5.2 — signed audit-export NDJSON bundle for sponsors
>  + per-data-point delivery signature."

This ADR ships the **audit-export bundle**. The per-data-point
delivery signature (citizen-signed delivery payload binding the
sponsor-paid purchase to the actual bytes flow) is intentionally
deferred to a future sub-phase — that flow needs a data-delivery
substrate that doesn't yet exist.

What the audit-export bundle gives the sponsor: a tamper-evident,
Ed25519-signed NDJSON of every purchase they've made, with
identity-rotated per-(sponsor, citizen) hashes so cross-sponsor
correlation is prevented. The sponsor can independently verify the
signature against the Bharat OS audit signer's published public key
at `/api/audit-signer/public-key`, exactly like the Phase 10.5
labeling-export pattern.

## Decision

Ship Phase 13.5.2 as a thin sub-phase composing the Phase 10.5
labeling-export pattern (ADR 0124):

### 1. BE — signed NDJSON builder + verifier

`src/phase1/citizen-data-offer-export.mjs` mirrors the structure
of `src/phase1/labeling-export.mjs`:
- Protocol pinned: `bos.phase13.citizen-data-offer-export.v0`
- `identityHashFor(sponsorId, publisherId)` rotates per (sponsor,
  publisher) — same citizen on a different sponsor's export
  hashes to a different value.
- `buildCitizenDataOfferExportLines({sponsorId, purchases,
  signerIdentity, exportedAt})` produces:
  - **Header**: `{type: 'header', protocolVersion, sponsorId,
    purchaseCount, exportedAt, signerId}`
  - One **purchase** line per purchase:
    `{type: 'purchase', purchaseId, offerId, sponsorId,
    dataPointKind, sponsorPurpose, pricePerSalePaise,
    purchasedAt, identityHash}`
  - **Trailer**: `{type: 'trailer', contentSha256, signature:
    {algorithm, signerId, signatureBase64}}`
  - Sorted by `purchasedAt` ASC, then by `purchaseId` ASC (stable
    bundle for same inputs).
- `bundleNdjson(lines)` flattens to NDJSON with the mandatory
  trailing newline.
- `verifyCitizenDataOfferExportLines(lines, signerPublicRecord)`
  re-implements the verification logic (counts purchases rather
  than submissions) — same crypto + same structural checks.

### 2. BE — denormalised dataPointKind on the purchase record

`PERMITTED_PURCHASE_KEYS` extended with `dataPointKind`.
`buildCitizenDataOfferPurchase` now accepts `dataPointKind` from
the caller. The API handler reads `offer.dataPointKind` and passes
it onto the new purchase record so the audit-export bundle stays
self-contained even after a citizen revokes their offer + the DPDP
§12 cascade wipes the offer record. Without this denormalization
the sponsor's archived export would carry rows referencing an
unknown `dataPointKind` after a citizen erases.

### 3. BE — new endpoint

`GET /api/sponsors/:sponsorId/data-offer-purchases/export.ndjson`
— sponsor-bearer gated. Loads / lazy-creates the audit signer
identity, lists the sponsor's purchases, builds the bundle, emits
a `citizen_data_offer_export.signed` ledger event with the
content SHA-256 + purchase count, returns the NDJSON as
`application/x-ndjson; charset=utf-8`.

### 4. FE — verifier + hook + download button

`frontend/src/lib/sponsor-export-verify.ts` adds
`verifyCitizenDataOfferExportLinesAsync` — thin wrapper over the
labeling-export verifier with a `purchaseCount` rename in the
verdict shape (the underlying trailer crypto is identical).

`frontend/src/lib/hooks.ts` adds `useSponsorDataOfferExport` —
fetches the NDJSON, fetches the audit signer public key, runs
the async crypto verifier, returns `{lines, contentSha256,
verdict, verifyFetchFailed, signerPublicRecord, blob, filename}`.

`frontend/src/routes/sponsor/SponsorDataOffers.tsx` gets an
`ExportButton` rendered next to "Recent purchases" (only when
there's history to export). On click: downloads the NDJSON,
verifies the signature, displays an honest verdict line below the
button:

- `✓ Signature verified · N purchases` (trust color)
- `Signature verification failed: <reason>` (error color)
- `Couldn't fetch audit signer public key — bundle downloaded
  unverified` (warning color)

### 5. Adversarial review verdict: ship_with_no_fixes

3-lens pass (privacy / accuracy / edge-cases). No fixes needed:

- **Privacy** — bundle uses rotated identityHash; raw publisherId
  never appears in the bundle (test pins this with the strong
  guarantee that sha256 hex output can't contain non-hex chars
  like 'i', 't', 'z', 'n' in 'citizen-a'). Bearer-gated.
  Ledger emits only pointer + count meta.
- **Accuracy** — Bundle stability tested (same inputs → same
  lines regardless of array order). Empty bundle still produces
  valid header + trailer. Signature mismatch + content tampering
  detected. Bearer 401/403 surfaces correctly. Signer fetch
  failure handled separately from verification failure.
- **Edge cases** — All caught by structure: too-few-lines,
  missing trailer, malformed trailer, content hash mismatch,
  header/trailer signer mismatch, signature invalid.

### 6. Why per-data-point delivery signature is deferred

The audit-export bundle proves "this sponsor paid for these N
data points from these (rotated-identified) citizens on these
dates for these purposes." That is a complete provenance trail
for the **financial + consent** record.

What it does NOT cover: the actual data point bytes. Those flow
through a separate channel (citizen-controlled, off-server) and
need a citizen-signed delivery payload that ties the bytes to
the at-sale-time signature. Building that flow requires a data-
delivery substrate that doesn't yet exist — it's a separate
deferral. The audit bundle is useful WITHOUT the delivery flow
for accounting / dispute resolution / DPDP compliance proofs.

## Consequences

- The 13.5 revenue loop now has a tamper-evident audit trail
  the sponsor can independently verify against the Bharat OS
  audit signer's published Ed25519 public key. Same trust
  guarantees as the Phase 10.5 labeling-export bundle.
- The sponsor surface (`/sponsor/data-offers`) now matches the
  job + round surfaces — every value-bearing sponsor action has
  a downloadable, verifiable provenance bundle.
- `MESH_WORKLOAD_TYPES` and the DPDP cascade are unchanged
  (this phase doesn't add per-identity state).
- The audit-export bundle is self-contained: after a DPDP cascade
  wipes a citizen's offer, the sponsor's previously-downloaded
  bundle still proves what was paid for + when, with
  dataPointKind preserved via the new denormalization.

## Tests

- `tests/node/citizen-data-offer-export.test.mjs` — 13 cases.
  Protocol version pin; identityHash rotation (different per
  sponsor; same per repeat); happy path bundle shape (header +
  N + trailer); order-independent stable bundle; bundle NDJSON
  with trailing newline; verifier happy path; content tampering
  detected (via header `purchaseCount` mutation, sort-order
  independent); signer mismatch detected; too-few-lines reject;
  HTTP integration (signed bundle + ledger event); bearer
  required; empty bundle still well-formed; §15 — raw
  publisherId NOT in bundle, only rotated hash.
- Existing `tests/node/citizen-data-offer-purchase.test.mjs`
  updated for the new `dataPointKind` field in
  `PERMITTED_PURCHASE_KEYS` (still 19 cases, all green).
- Full sweep: 500 vitest + 1347 Node + tsc clean (+13 from this
  phase's new test file).

## Follow-ups (deferred)

- **Per-data-point delivery signature** + actual byte flow
  (separate substrate; needs a data-delivery channel decision
  — sponsor-citizen direct, or a future Bharat OS courier).
- Pagination on the export endpoint if a sponsor accumulates
  enough purchases to make a single NDJSON unwieldy. Not a
  v1 concern.
- Production fixes for the Phase 13.5.1 known limitations
  (race on concurrent purchases, non-atomic persistence chain,
  no self-purchase guard) — unchanged by this phase.
- Legal review per [[citizen-data-as-product-revenue]] before
  mainnet pricing.
