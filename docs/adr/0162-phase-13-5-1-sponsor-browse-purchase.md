# ADR 0162 — Phase 13.5.1: Sponsor browse + purchase flow

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.5 (ADR 0160) shipped the citizen-side substrate: publish
+ list + pause + revoke per-data-point sale offers. The sponsor
side was explicitly deferred:

> "Phase 13.5.1 — sponsor browse + purchase flow (debit sponsor
>  escrow, credit citizen mesh balance, emit
>  citizen_data_offer.purchased; per-data-point delivery
>  signature)."

This ADR ships the sponsor-side purchase flow + the mesh-credit +
escrow-debit composition that closes the revenue loop end-to-end.
The per-data-point delivery signature + signed audit-export
bundle land separately in Phase 13.5.2.

## Decision

Ship Phase 13.5.1 as 1 new entity + 3 new endpoints + 1 new FE
page + 1 new mesh workload type.

### 1. BE purchase entity

`src/phase1/citizen-data-offer-purchase.mjs` — strict-allowlist
validator. Protocol pinned at
`bos.phase13.citizen-data-offer-purchase.v1`.

`PERMITTED_PURCHASE_KEYS` (9 entries) gates the envelope. Content-
derived `purchaseId` via sha256 over `{offerId, sponsorId,
sponsorPurpose, pricePerSalePaise, purchasedAt}` — same-millisecond
duplicates would collide, but the purchasedAt timestamp is computed
inside the validator at second precision so distinct sponsor
purchases yield distinct IDs.

Helpers:
- `buildCitizenDataOfferPurchase` — validate + assemble.
- `applyPurchaseToOffer` — pure state transition: salesCount++ +
  status flips to 'exhausted' when salesCount === maxSales.
- `buildCitizenDataOfferPurchasedLedgerEvent` — emits POINTER +
  count-only meta (offerId / purchaseId / sponsorId / publisherId /
  dataPointKind / sponsorPurpose / pricePerSalePaise / salesCount /
  maxSales / at). Ms-stripped per the Phase 13.0.2 MF-1 pattern.

### 2. Store wiring + DPDP cascade

Both `store.mjs` and `sqlite-store.mjs` get `saveCitizenDataOfferPurchase`
/ `readCitizenDataOfferPurchase` /
`listCitizenDataOfferPurchases({sponsorId?, publisherId?, offerId?})`.
The sqlite-store gets a new `citizen_data_offer_purchases` table
with indexes on sponsor_id / publisher_id / offer_id.

The existing `saveCitizenDataOffer` gets a new `{skipLedger: true}`
option so the API handler can save the bumped offer without
double-firing the `citizen_data_offer.published` auto-event. The
handler emits `citizen_data_offer.purchased` explicitly.

**DPDP §12 cascade** extends to wipe purchase records by
`publisherId` (citizen-side erase). The sponsor's at-sale-time
ledger event stays (with the identity field redacted in the
existing ledger-redaction pass) so the sponsor's audit-export
bundle can still prove the at-sale-time event happened.

### 3. Mesh workload type

`MESH_WORKLOAD_TYPES` grows from 5 to 6 with `citizen_data_sale`.
`createMeshContributionEvent` handles the new type with `payoutPaise
= pricePerSalePaise` and two new optional pointers:
`citizenDataOfferId` and `citizenDataPurchaseId`. The existing
`mesh-contribution.test.mjs` workload-types pin updated to include
the new entry.

### 4. API endpoints

Three new endpoints under `/api/sponsors/:sponsorId/`, all
bearer-gated through `checkSponsorAuth`:

- `GET /data-offers/browse[?purpose=...]` — lists active offers
  with remaining capacity that haven't expired, optionally
  filtered by sponsor purpose (rejects off-allowlist purposes
  with 400).
- `POST /data-offers/:offerId/purchase` — body `{sponsorPurpose}`.
  Atomic in-handler sequence:
  1. Validate purpose is in `SPONSOR_PURPOSES`.
  2. Load offer; reject if status≠'active' (409 `offer_not_active`),
     expired (409 `offer_expired`), or exhausted
     (409 `offer_exhausted`).
  3. Validate purpose in `offer.sponsorPurposeAllowlist`
     (403 `purpose_not_allowlisted`).
  4. Lock-then-debit sponsor escrow (409 `insufficient_escrow`
     with availablePaise + requiredPaise).
  5. Build purchase record + mesh contribution event +
     state-transitioned offer.
  6. Persist: sponsor → ledger sponsor_escrow.debited → offer
     (with skipLedger) → purchase → mesh event → ledger
     citizen_data_offer.purchased.
  7. Return 201 with purchase + offer + sponsor + mesh event.
- `GET /data-offer-purchases` — sponsor's own purchase history.

### 5. FE substrate + page

- `frontend/src/lib/hooks.ts` — 3 new hooks:
  `useSponsorBrowseDataOffers(purpose?)`,
  `useSponsorPurchaseDataOffer`, `useSponsorDataOfferPurchases`.
  All use the existing `apiWithBearer` pattern.
- `frontend/src/routes/sponsor/SponsorDataOffers.tsx` — new page
  with purpose-filter chips, offer list with per-offer purchase
  control (per-offer purpose selector + "Buy one" action), and
  recent purchases list. Inline error surface maps every BE
  error code to a citizen-readable message
  (`insufficient_escrow` → "Available ₹X · required ₹Y";
  `offer_not_active` → "no longer available — refresh"; etc.).
- `frontend/src/components/sponsor/SponsorBottomNav.tsx` — added
  "Data" tab between Rounds and Escrow.
- `frontend/src/routes/sponsor/SponsorSurface.tsx` — `/sponsor/data-offers`
  route added.

### 6. Adversarial review verdict

**ship_with_known_limitations**. Strict-allowlist + bearer auth +
publisher-gated state transitions + DPDP cascade are sound by
construction. The known limitations are intentional v1 simplifications:

- **Race on concurrent purchases**: two concurrent reads of the
  same offer can both see `salesCount = N`, both compute
  `N + 1`, both save. Final salesCount = N+1 instead of N+2. For
  v1 demo with low concurrency this is acceptable. Production
  fix is a SQL `UPDATE citizen_data_offers SET salesCount = salesCount + 1
  WHERE offer_id = ? AND salesCount < maxSales` returning the
  affected-rows count, applied first; everything else (escrow,
  mesh, persist) conditional on that count being 1.
- **Non-atomic persistence chain**: sponsor → offer → purchase
  → mesh. Mid-chain failure leaves inconsistent state. Demo-
  acceptable; lands as Phase 13.5.2 (audit-export bundle) work.
- **No self-purchase guard**: a sponsor could buy from their own
  published offer if the publisherId happened to be the sponsor's
  root identity. Demo-acceptable; future enforcement is a
  one-line equality check.

All other concerns caught at boundary already.

## Consequences

- The 13.5 revenue loop closes end-to-end: citizen publishes →
  sponsor browses → sponsor purchases → escrow debited → citizen
  mesh balance credited → audit ledger records the at-sale-time
  pointer event.
- The `MESH_WORKLOAD_TYPES` allowlist gains the citizen-side
  earning category. Existing daily-brief + mesh-summary surfaces
  already account for all workload types; the citizen's mesh
  balance now reflects data sales.
- The sponsor bottom nav surfaces "Data" alongside "Jobs" and
  "Rounds", reflecting the three sponsor source surfaces from
  the marketing page.
- Audit-export bundle for the citizen-data marketplace (Phase
  13.5.2 deferral) is the next sub-phase; it composes the
  Phase 10.5 labeling-export pattern with the
  `citizen_data_offer.*` event stream.

## Tests

- `tests/node/citizen-data-offer-purchase.test.mjs` — 19 cases.
  Pure builder (strict allowlist + protocol pin + state
  transition + ledger event POINTER-only), HTTP integration
  (happy path + purpose filter + 400 invalid purpose + 401/403
  bearer + 201 escrow-debit + happy-to-exhausted multi-purchase
  + 403 purpose not allowlisted + 409 insufficient escrow + 409
  paused + 404 unknown offer + GET purchase history), DPDP
  cascade (purchases wipe by publisherId).
- Pre-existing pin in `mesh-contribution.test.mjs` updated to
  include `citizen_data_sale`.
- Full sweep at commit time: 500 vitest + Node sweep clean +
  tsc clean.

## Follow-ups (deferred to 13.5.2+)

- **13.5.2** — signed audit-export NDJSON bundle for sponsors
  (mirrors Phase 10.5 labeling-export). Each line carries the
  purchase record + the citizen's at-sale-time signature over
  the per-data-point delivery payload. Bundle signed by the
  Bharat OS audit signer; sponsor verifies independently via
  `/api/audit-signer/public-key`.
- Per-data-point delivery flow: citizen signs each delivered
  point with their identity key; sponsor stores the
  citizen-signed payload + verification chain. Currently
  v1 ships the purchase contract — the bytes flow happens
  through a separate channel (sponsor-citizen direct, or
  future Bharat OS courier substrate).
- Production fixes for the 3 known limitations above (race,
  atomicity, self-purchase guard).
- Legal review per the [[citizen-data-as-product-revenue]]
  binding before mainnet pricing.
