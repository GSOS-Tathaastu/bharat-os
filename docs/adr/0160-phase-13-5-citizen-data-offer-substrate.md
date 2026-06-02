# ADR 0160 — Phase 13.5: Citizen data offer substrate (BE + citizen-side FE)

Status: Accepted
Date: 2026-06-02

## Context

The 13.4.x SLM-H sub-arc just closed (ADRs 0156-0159). The next
ROADMAP item under Phase 13.x is the **new revenue line** per the
[[citizen-data-as-product-revenue]] binding (2026-05-31):

> "In addition to the existing labeling marketplace (workers
>  label sponsors' data), Bharat OS also lets citizens sell
>  their own data to sponsors as training material — with full
>  consent, per-data-point payouts, and revocation."

This phase ships the **citizen-side substrate**: the citizen
publishes a per-data-point sale offer with their chosen price,
sales cap, sponsor purpose allowlist, and expiry. The sponsor
browse + purchase flow (debit sponsor escrow, credit citizen
mesh balance, audit-export the at-sale-time signature) lands in
Phase 13.5.1.

## Decision

Ship Phase 13.5 as a BE substrate + a citizen-side FE panel.
Mirrors the Phase 10.x labeling-job pattern but inverted: the
citizen IS the data producer + offeror, and the sponsor IS the
buyer.

### 1. BE entity validator

`src/phase1/citizen-data-offer.mjs` (~310 lines) — strict-
allowlist validator. Protocol pinned at
`CITIZEN_DATA_OFFER_PROTOCOL_VERSION = 'bos.phase13.citizen-data-offer.v1'`.

Enums (all `Object.freeze`d):
- `DATA_POINT_KINDS` — 5 kinds mapping to existing
  data-producing surfaces: `intent_text` (Phase 11/12.1b),
  `doc_summary` (Phase 13.0), `pii_redaction` (Phase 13.1),
  `skill_run` (Phase 13.4.x), `mesh_contribution` (Phase 3.x).
- `SPONSOR_PURPOSES` — 6 purposes: `model_training`,
  `model_evaluation`, `safety_benchmark`, `product_research`,
  `academic_research`, `gov_audit`.
- `CITIZEN_DATA_OFFER_STATUSES` — `active` | `paused` |
  `revoked` | `exhausted`.

Caps:
- `pricePerSalePaise` ∈ [100 (₹1), 10_000_000 (₹100,000)]
- `maxSales` ∈ [1, 1000]
- `sponsorPurposeAllowlist.length` ∈ [1, 6]
- TTL (`expiresAt - publishedAt`) ∈ [24 hours, 365 days]

Strict-allowlist posture mirrors ADR 0155 / 0156 / 0157 / 0158.
`PERMITTED_CITIZEN_DATA_OFFER_KEYS` (14 entries) + the
`CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS` probe (10 entries:
`dataPoint`, `content`, `intentText`, `docSummary`,
`piiRedaction`, `plaintext`, `rawBody`, `snippet`, `preview`,
`unmasked`) catch any leak attempt at boundary.

Content-derived `offerId` via sha256 over
`{publisherId, dataPointKind, sponsorPurposeAllowlist,
pricePerSalePaise, maxSales, publishedAt}`. Re-publishing an
identical envelope produces the same offerId → BE returns 409
`duplicate_offer`. Citizens cannot spam the registry with
no-op duplicates.

`revokeCitizenDataOffer` requires the revoker match the
publisher (defence-in-depth — the API handler also gates this).
`pauseCitizenDataOffer` is `active` → `paused` only (no other
transitions). Both functions are pure.

`buildCitizenDataOfferLedgerEvent` emits POINTER + count-only
meta (offerId / publisherId / dataPointKind / pricePerSalePaise
/ maxSales / salesCount / purposeCount / at). Never the data
points. `at` is ms-stripped per the Phase 13.0.2 MF-1 pattern
so the typing-speed fingerprint defence holds.

### 2. Store wiring + DPDP cascade

`src/phase0/store.mjs` + `src/phase0/sqlite-store.mjs` add
`saveCitizenDataOffer` / `readCitizenDataOffer` /
`listCitizenDataOffers({publisherId?})`. Both backends emit the
appropriate `citizen_data_offer.{published|paused|revoked}`
ledger event on save based on the offer's status.

**DPDP §12(3) cascade**: offers wipe on identity erase. Both
store backends extend `eraseUserData` /
`deleteIdentityCascade` to sweep `citizen_data_offers` by
`publisherId`. The §15 invariant per the binding: outstanding
offers from a since-erased citizen become unhonourable; future
sponsor purchases (when 13.5.1 lands) reject if the publisher
is gone.

### 3. API endpoints

`src/phase0/api.mjs` adds 4 endpoints under
`/api/identities/:id/data-offers`:

- `GET` — list publisher's offers + supported enums (so the FE
  can render the form without a second round-trip).
- `POST` — publish a new offer; 400 `invalid_citizen_data_offer`
  on validator throw; 409 `duplicate_offer` on identical
  re-publish.
- `DELETE /:offerId` — revoke (citizen-only; publisher gate).
  Body: `{reason?: string}`.
- `POST /:offerId/pause` — pause an active offer.

Sponsor browse + purchase endpoints are explicitly deferred to
13.5.1.

### 4. FE substrate + panel

`frontend/src/lib/citizen-data-offer.ts` — mirrors the BE
enums + adds citizen-facing labels (`DATA_POINT_KIND_LABEL` +
`DATA_POINT_KIND_DESCRIPTION` + `SPONSOR_PURPOSE_LABEL`) +
`formatRupees` + `defaultExpiresAt`. Convergence tests in the
Node test file read this file at runtime and regex-extract the
enums to assert set-equality with the BE allowlists.

`frontend/src/lib/hooks.ts` extended with 4 TanStack Query
hooks: `useCitizenDataOffers`, `useCreateCitizenDataOffer`,
`useRevokeCitizenDataOffer`, `usePauseCitizenDataOffer`.

`frontend/src/components/CitizenDataOffersPanel.tsx` — citizen-
facing panel. Honest empty state when no offers; pill picker
for `DataPointKind`; number inputs for price + maxSales;
multi-select chips for sponsor purposes; inline error
surface on 409 / 400. Renders existing offers sorted by
publishedAt DESC with status / kind / price / sales-count /
expiry-date chips + Pause / Revoke actions on active offers.

Mounted on `/labs` keyed on `data-offers-<identityId>` for the
identity-flip remount protection.

### 5. Adversarial review verdict: ship_with_no_fixes

Inline 3-lens pass (privacy / UX / edge-cases). Privacy posture
is sound by construction: strict allowlist + FORBIDDEN_SUBSTRINGS
probe + count-only ledger + publisher-gated revoke + DPDP
cascade. UX is honest (revoked offers stay listed for audit
history; explicit "v1 ships publish + manage; sponsor purchase
in 13.5.1" framing in the panel's "How this works" details).

Edge cases:
- Calendar-invalid `publishedAt` / `expiresAt` rejected at
  boundary (Date.parse round-trip).
- ms stripped from both timestamps + the ledger `at` field.
- expiresAt before publishedAt: caught by the < MIN_OFFER_TTL_MS
  branch (negative duration < positive threshold).
- Cross-citizen revoke attempt: rejected by both the validator
  (`only the publisher can revoke`) and the API handler
  (`existing.publisherId !== identityId`).
- Same-second double-publish: content-derived offerId means the
  second POST returns 409.

## Why this is BE + FE and not pure-FE

Unlike Phase 13.3 (personalization, pure-FE) where a BE
endpoint would have falsified the "preferences never leave
device" pitch, the citizen-data-offer substrate INTENTIONALLY
publishes to the BE — that's the entire point. The citizen is
opening up specific data point KINDS to sponsor purchase; the
BE acts as the registry sponsors browse. The §15 invariant is
still preserved: only POINTER + count-only meta crosses to the
BE. The actual data points themselves stay on-device until the
sponsor purchases AND the citizen's at-sale-time signature
authorises the per-data-point delivery (Phase 13.5.1 flow).

## Consequences

- The 13.x revenue-line track is now open. The citizen-data
  pattern is the substrate for future "citizen monetizes X"
  flows (compute serving, attention, anonymized telemetry).
- The audit-ledger gains `citizen_data_offer.{published|paused|
  revoked}` event types — POINTER + count-only per §15.
- The DPDP cascade now covers a new per-identity table; identity
  erase remains atomic (Phase 4.0 invariant preserved).
- 13.5.1 follow-up wires:
  - sponsor browse endpoint (`GET /api/sponsors/:id/data-offers/
    browse`)
  - sponsor purchase endpoint (`POST /api/sponsors/:id/
    data-offers/:offerId/purchase`) — debits sponsor escrow,
    credits citizen mesh balance, emits
    `citizen_data_offer.purchased` event
  - per-data-point delivery flow (citizen-signed payload binding
    the at-sale-time signature to the data point bytes)

## Tests

- `tests/node/citizen-data-offer.test.mjs` — 31 cases. Pure
  validator (allowlist, content-derived offerId, status
  transitions, ms-strip), HTTP integration (publish + duplicate
  + malformed + list + revoke + pause + 404 + cross-publisher),
  DPDP cascade, FE↔BE convergence (regex-extract DATA_POINT_KINDS
  + SPONSOR_PURPOSES from the FE source).
- Full sweep at commit time: 490 vitest + Node sweep clean + tsc
  clean. Node ledger event types added: 3.

## Follow-ups (deferred to 13.5.1+)

- **13.5.1** — sponsor browse + purchase flow + mesh balance
  credit + per-data-point delivery signature.
- **13.5.2** — signed audit-export bundle for sponsors (mirrors
  Phase 10.5 labeling-export pattern; lets sponsors prove
  provenance of purchased data points).
- Per-citizen revocation cascade: when a citizen revokes an
  offer AFTER sponsor purchases have happened, the sponsor's
  audit bundle carries the at-sale-time signature but the
  citizen's local "is this still legally sellable" cache flips
  off. Lands as a state transition in 13.5.1.
- Legal review per the binding: citizens-selling-their-data is
  novel terrain for DPDP + RBI; needs counsel before mainnet
  pricing. v1 prices are demo values.
