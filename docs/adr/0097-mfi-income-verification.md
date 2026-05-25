# ADR 0097: Phase 6.1 — MFI-Consumable Income-Verification Bundle + Worker-Issued Consent

## Status

**Accepted — shipped.** First half of the Phase 6.1 growth-arc plan
in ADR 0096 ("MFI partnerships + UPI cash-out"). UPI cash-out is
Phase 6.1b — separate ADR + commit.

## Context

Phase 6.0 (a/b/c) gave workers single-player reasons to install
Bharat OS — they accumulate earnings, mesh contributions, and
portable attestations as a side-effect of normal use. Phase 5.9
turned on the two-sided portable-attestation network. By the time
a worker has a few months of data, they have something that looks
a lot like **alternative-data income proof** — exactly what
microfinance institutions (MFIs) need for gig-worker lending.

ADR 0096 listed MFI partnerships as Phase 6.1: *"Accept Bharat OS
as KYC supplementary → offer 1% rate discount. Suddenly there's a
hard rupee reason for workers to maintain a record."*

Two real concerns make this not-just-design:

1. **Workers won't have MFI relationships on day 1.** We can't
   ship "the Bajaj Finserv integration" until Bajaj Finserv
   signs a contract. What we CAN ship is the substrate any MFI
   could consume — a signed, structured income-verification
   envelope behind a worker-signed consent.

2. **§15 PII discipline must hold.** The bundle contains every
   piece of income data the worker has logged. We can't let an
   MFI silently poll it; we can't let the bundle leak to anyone
   who isn't authorised; we can't store the data in a way that
   makes it look like Bharat OS is the consumer when really
   Bharat OS is just the carrier.

Phase 6.1 ships the substrate.

## Decision

### Two artifacts: consent + bundle

Workers issue a **consent**: a worker-signed envelope authorising
a named MFI to read the bundle. The MFI presents the
`consentId` as a bearer token to fetch the bundle. Single-use
by default — read once, decision made, consent burns. Default
TTL 30 days; maximum 90.

The **bundle** is a worker-signed summary aggregated from
`earnings-log` (Phase 6.0a), `mesh-contribution` events (Phase
6.0b), and `portable-attestation` records (Phase 5.9). Computed
fresh on every MFI fetch — never cached — so the bundle
reflects current state, not whatever was true at consent issuance.

Both artifacts use Ed25519 signatures with the same primitive
(`signText` / `verifySignature` from `core.mjs`) that all other
Bharat OS signed records use.

### `src/phase1/income-verification.mjs`

Pure functions:

- **`createIncomeVerificationConsent({ identity, mfiName, purpose,
  financialYear, ttlSeconds?, maxReads?, at })`** — validates +
  signs. Rejects bad inputs (mfiName > 80 chars, malformed
  `financialYear` like `2025-27` with wrong end year, TTL out of
  `[60s, 90 days]`, maxReads outside `[1, 10]`). Deterministic
  `consentId` derived from canonical payload.
- **`verifyIncomeVerificationConsent(consent, workerPublicRecord,
  { at })`** — verifies signature + freshness. Returns
  `{ ok, status }` where `status` distinguishes `valid` /
  `expired` / `revoked` / `exhausted` / `signature_invalid` /
  `unknown_worker` / `malformed`, so the API handler picks the
  right HTTP status.
- **`buildIncomeVerificationBundle({ identity, consent,
  earningsEntries, meshContributionEvents, portableAttestations,
  at })`** — filters records to the worker AND the financial-year
  window (April-March); aggregates totals + per-category
  breakdown + working days + mesh payout + per-tier attestation
  counts; signs the result with the worker's key. Refuses
  cross-identity consents.
- **`verifyIncomeVerificationBundle(bundle, workerPublicRecord)`**
  — verifies signature. Used by MFI-side validators.
- **`revokeIncomeVerificationConsent(consent, { at })`** — pure,
  returns a new consent with `revokedAt` set. Caller persists.
- **`recordConsentRead(consent)`** — pure, returns a new consent
  with `readCount` incremented. Caller persists.

### `bundle.income.*` shape

```json
{
  "totalEarningsPaise": 11000000,
  "totalEarningsRupees": 110000.00,
  "byCategory": {
    "delivery": 5000000,
    "ride": 6000000,
    "service": 0,
    "cash": 0,
    "other": 0
  },
  "workingDays": 142,
  "entryCount": 142,
  "meshPayoutPaise": 1050,
  "grandTotalPaise": 11001050,
  "grandTotalRupees": 110010.50
}
```

### `bundle.credibility.*` shape

```json
{
  "portableAttestationsByTier": { "0": 320, "1": 70, "2": 10 },
  "totalSignedAttestations": 400
}
```

The MFI sees the tier breakdown and weights it as appropriate.
This is the §15-honest version of "verified income" — the bundle
states which signals are weak (Tier 0 anonymous) vs. strong
(Tier 2 Bharat-OS-signed) and lets the MFI's underwriting model
decide.

### Mandatory `disclaimer` field on every bundle

Every bundle carries:

> *"This bundle summarises the worker's self-logged Bharat OS
> earnings and customer-signed portable attestations. Earnings
> entries are TYPED BY THE WORKER (Bharat OS does not scrape
> aggregator APIs); their accuracy is the worker's assertion
> under §15 PII discipline. Portable attestations are
> customer-signed claims at three quality tiers (anonymous tap
> / OTP-confirmed / Bharat OS signed); see the
> `credibility.portableAttestationsByTier` breakdown and weight
> them as appropriate for your decision. Bharat OS does NOT
> verify identity (Aadhaar does that) and does NOT guarantee
> the underlying work performance. The lender is responsible
> for any verification beyond what is in this bundle."*

### SqliteStore extensions

New table `income_verification_consents` indexed on
`worker_id` + `expires_at`. CRUD methods:
`saveIncomeVerificationConsent`, `readIncomeVerificationConsent`,
`listIncomeVerificationConsents({ workerId })`. Included in the
DPDP §12(3) erasure cascade.

### Four new API endpoints

- **`POST /api/identities/:id/income-verification/consents`** —
  worker creates a consent. Returns the signed consent +
  `mfiFetchUrl` for the worker to share with the MFI privately.
  Emits `income_verification_consent.issued` ledger event.
- **`GET /api/identities/:id/income-verification/consents`** —
  worker lists their issued consents.
- **`POST /api/identities/:id/income-verification/consents/:consentId/revoke`**
  — worker burns a consent before expiry. Emits
  `income_verification_consent.revoked` ledger event. Returns
  404 (not 403) when called by a non-issuer so cross-user probing
  can't reveal whether a `consentId` exists.
- **`GET /api/income-verification/:consentId`** — MFI fetch. Server
  verifies the consent, builds the fresh signed bundle, increments
  `readCount`, persists. Returns 410 (Gone) when consent is
  expired / revoked / exhausted; 404 for unknown consentId or
  worker. Emits `income_verification_bundle.read` ledger event
  with the `mfiName` so ops can audit which MFI read what.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Worker controls MFI access | Consent is worker-signed; no consent → no bundle. Worker can revoke before expiry. |
| MFI can't silently poll | Single-use bearer by default (maxReads = 1). After read, consent is exhausted; second fetch returns 410. |
| Bundle is aggregates, not raw data | MFI sees totals + per-category sums + per-tier attestation counts. Not the day-by-day Swiggy/Zomato split. |
| Bundle is fresh on every read | Computed at fetch time from current store data; never cached. The signed envelope is the snapshot the MFI received. |
| Cross-user probe can't leak ownership | Non-issuer revoke attempts return 404, not 403. |
| Audit trail | Every consent issuance, revocation, and bundle read goes to the typed ledger with `mfiName`. Ops can detect "X MFI reads 50 bundles from one worker" as anomalous. |
| DPDP erasure cascade | The new table is in the §12(3) cascade. Erasing a user removes their issued consents — the MFI's prior reads are NOT retroactively withdrawn (you can't unsay something), but the consent + bundle infrastructure for that user is gone. |

## Tests

`tests/node/income-verification.test.mjs` — 25 tests:

**`createIncomeVerificationConsent`** (4 tests):
1. Returns a versioned signed envelope with deterministic consentId
2. Rejects bad inputs (missing identity, malformed financialYear,
   TTL out of range, maxReads out of range)
3. Rejects oversized mfiName (silent truncation could mislead);
   truncates long purpose (free-text description, fuzzy by nature)

**`verifyIncomeVerificationConsent`** (5 tests):
4. Succeeds on fresh consent
5. Flags expired consents
6. Flags revoked consents
7. Flags exhausted consents (readCount >= maxReads)
8. Flags wrong-worker public record
9. Flags tampered signature

**`buildIncomeVerificationBundle`** + **`verifyIncomeVerificationBundle`** (4 tests):
10. Aggregates earnings + mesh + attestations within FY window;
    out-of-FY records excluded; per-category + working days +
    tier counts all correct
11. Round-trips via worker public key
12. Rejects tampered totals (signature invalidation)
13. Refuses cross-identity consent

**SqliteStore + DPDP** (4 tests):
14. Round-trips consents
15. Filters by worker
16. `collectUserData` includes the new section
17. `eraseUserData` cascade removes consents

**End-to-end live HTTP** (8 tests):
18. POST consents creates + persists + emits ledger event
19. POST consents rejects invalid input with structured error
20. GET MFI fetch returns the signed bundle
21. GET MFI fetch burns the consent after maxReads (410 on second)
22. POST revoke burns the consent (subsequent MFI fetch 410)
23. POST revoke from non-issuer returns 404 (no ownership leak)
24. GET consents lists worker's issued consents
25. GET MFI fetch 404 for unknown consentId

Full suite: **620 / 620 green** (was 595; +25 new). No SW change
(server-side only).

## Consequences

- **Workers have a hard-rupee reason to maintain their Bharat OS
  record.** Per ADR 0096's growth-arc economics: an MFI accepting
  Bharat OS as KYC supplementary → 1% rate discount on a ₹50K
  personal loan = ₹500/year savings. That's a recurring rupee
  return on the friction of typing daily earnings.
- **MFIs onboard without code changes.** The endpoint is stable
  + signed; any MFI that wants to pilot can consume it via curl
  + an Ed25519 verification library. No SDK; no platform lock-in.
- **The §15 PII discipline holds under partner pressure.** The
  worker signs the consent; the MFI presents the consent; the
  bundle is fresh; revocation works. No path lets an MFI silently
  poll or cache.
- **The bundle's honest disclaimer is a product feature.** MFIs
  used to "verified income" from payroll systems will read
  "worker-typed" and adjust their underwriting model accordingly.
  Better than us pretending the data is verified when it's not.
- **Backward-compatible.** No existing route changed. The new
  endpoints sit on the existing rate-limit + admin-auth + audit
  infrastructure.

## Future polish

- **Per-MFI rate cards** — bundles could include a recommended
  loan amount based on the worker's grand-total income + 44AD
  presumptive at the regime they qualify for. Lets the MFI
  preview eligibility before issuing terms.
- **MFI verification registry** — today `mfiName` is free-text;
  a future version could require the MFI to be a registered
  Bharat OS identity (signed by an issuer in a known list).
  Closes the "consent issued to FAKE LENDER" attack vector.
- **Webhook-style notifications** — when an MFI reads a bundle,
  push a notification to the worker's other paired devices.
  "Bajaj Finserv just read your income summary" lets the worker
  notice anomalous reads.
- **Per-MFI tiered consent** — different MFIs may want different
  data scopes (just earnings, vs. earnings + attestations, vs.
  full bundle). The consent could carry a `scope` field that
  restricts what the bundle contains.
- **Phase 6.1b: UPI cash-out for mesh earnings** — the other
  half of ADR 0096's Phase 6.1 plan. Withdrawal-request surface,
  payout-provider integration boundary, audit ledger.
