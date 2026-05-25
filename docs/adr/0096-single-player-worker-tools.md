# ADR 0096: Phase 6.0 — Single-Player Worker Tools (Earnings Tracker, Mesh Dashboard, Tax Helper)

## Status

**Partially implemented.**

- ✅ **Tool 1 (earnings tracker)** — shipped. `src/phase1/earnings-log.mjs`,
  SqliteStore `earnings_log` table, four API endpoints (`POST` /
  `GET` / `GET /summary` / `DELETE`), DPDP export + erasure cascade
  integration. 31 tests. The single-player wedge that gets workers
  on the platform with zero network participation is now real.
- 🟡 **Tool 2 (mesh-contribution dashboard)** — pending. Substrate
  shipped in Phase 3.x; this is UX promotion to a first-class card.
- 🟡 **Tool 3 (year-end tax helper)** — pending. ITR-3 / ITR-4
  summary, section 44ADA presumptive-tax logic, local-compute.

Recommended sequencing: ship Phase 6.0 in three commits (one per
tool), then layer Phase 5.9 (ADR 0095, QR signing flow) on top.
The two-sided attestation flow only works when both worker and
customer are on the platform for independent reasons. Tool 1 alone
gives workers a Notion-equivalent reason to install BEFORE the
network exists.

## Context

Phase 5.9 (ADR 0095) ships the portable attestation primitive. But
the chicken-and-egg problem is unresolved at the strategic level:
**workers won't install Bharat OS to capture attestations from
customers who don't yet exist; customers won't install Bharat OS
to sign attestations for workers who don't yet exist.** Classic
two-sided cold start.

The pattern that works for similar cold starts (Instagram, LinkedIn,
Notion, etc.) is to **deliver real single-player value first** —
something a solo user gets from the product even with zero network
participation — and let network effects emerge from a base of
users who already have a reason to be present.

For gig / service workers in India, three single-player problems
are immediately tangible AND not currently well-served:

1. **Income tracking across platforms.** A delivery rider on
   Swiggy + Zomato + Rapido + the occasional cash gig has no
   consolidated view of monthly income. They cobble together
   screenshots when they need to show a landlord, an MFI, or
   themselves for budgeting.
2. **Mesh-contribution earnings already shipped (Phase 3.x)** but
   has no dedicated UX surface for the worker who plugs their
   phone in overnight. Currently buried inside the Earn tab.
3. **Year-end tax filing.** Most gig workers don't file because
   tracking income across N platforms is hopeless. TDS withheld
   by platforms goes unclaimed.

Phase 6.0 ships these three as a coherent worker-onboarding wedge.
The Trust Passport accumulates as a happy byproduct of
self-logging; the attestation primitive (Phase 5.9) gets a user
base to layer on top of.

## Decision

### Tool 1 — Cross-platform earnings tracker

Worker manually logs income per platform per day. UI is a single
"Add today's earnings" card on the Earn tab:

```
What did you earn today?

  🍔 Swiggy / Zomato / Dunzo:  ₹ [____]
  🚗 Uber / Ola / Rapido:       ₹ [____]
  🔧 Urban Company / direct:    ₹ [____]
  💵 Cash / other:              ₹ [____]

  Hours worked today: [__] hours

  [Save]
```

Bharat OS computes:
- Monthly statement (PDF/HTML, shareable as a single URL)
- Effective ₹/hour
- Per-platform contribution share over time
- Comparison to median for the worker's category + city (privacy-
  preserving: shows percentile, not raw values)

The earnings data NEVER leaves the device's primary store. The
Phase 4.2 SQLite database holds it; the Phase 4.0 DPDP export
includes it; the Phase 5.0 recovery flow restores it.

**§15: data is user-supplied, not scraped.** No aggregator-account
linking, no OAuth into Swiggy, no screen-scraping of platform
apps. The worker types numbers. This sidesteps every Terms-of-
Service and aggregator-hostility concern.

### Tool 2 — Mesh-contribution dashboard

Phase 3.x already pays workers ₹2-15/night in compute contribution
while their phone is charging. Today this is surfaced as a number
in the Earn tab. Phase 6.0 promotes it to a first-class card:

```
💎 Mesh earnings
   ₹847 this month
   ────────────────
   Today:   ₹12   (8h plugged in)
   Yesterday: ₹14
   ...
   Cash out via UPI: [Coming soon]
```

The "Cash out via UPI" link is a placeholder — UPI integration is
not in this phase. For now, the earnings accumulate in the worker's
account ledger; cash-out happens when the partner integration
lands (Phase 6.1 candidate).

**Concrete recruitment hook:** "Charge your phone, earn ₹50-300
per month, no extra effort." Pure rupee-in-pocket, no reputation
story needed.

### Tool 3 — Year-end tax helper

For workers whose Bharat OS earnings log shows > ₹2.5L for the
financial year, surface a tax-filing helper:

```
🧾 Year-end tax summary  (FY 2026-27)

Total earnings logged:    ₹3,42,500
  via Swiggy/Zomato:      ₹2,18,000  (TDS deducted: ₹4,360)
  via Uber/Ola:           ₹86,000    (TDS deducted: ₹1,720)
  via direct/cash:        ₹38,500

Estimated tax payable:    ₹14,250
Estimated refund (TDS):   ₹6,080
                          ─────────
Net tax:                  ₹8,170

[Download ITR-3 ready summary]  [Find a CA in your area]
```

The ITR-3 helper is local-compute only. We compute the suggested
ITR fields from the logged earnings + standard deductions +
section 44ADA presumptive-tax option if applicable. **We never
auto-file.** The worker takes the PDF to their CA, or files
themselves via the income-tax portal.

**§15: tax data stays local.** The compute happens client-side
on the device. The Bharat OS server never sees the worker's PAN,
their TDS reconciliation, or their full income — only what the
worker explicitly chooses to include in a Trust Passport export.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| User-supplied data only | Earnings come from the worker typing them, not from scraping aggregator apps. Sidesteps TOS issues + data-sovereignty concerns. |
| Income data stays on-device | All three tools persist to the local SQLite store. Server-side compute is opt-in via the Trust Passport export, not automatic. |
| Tax helper is local-compute, never auto-files | The ITR-ready PDF is generated client-side. Bharat OS does not transmit tax data to any third party — no auto-filing, no integrated CA service, no upsells. The worker remains the actor. |
| PAN never on the server | If the worker enters their PAN to format the ITR summary, it stays in IndexedDB / the local SQLite store. The export path masks the middle digits the way `phoneMasked` works. |
| Mesh earnings cashout is opt-in | When UPI cash-out lands (Phase 6.1), it's a user-initiated POST that explicitly authorises the transfer. No default sweep. |

## Implementation outline

When greenlit:

- **`src/phase1/earnings-log.mjs`** — new module: per-day earnings
  records, monthly aggregation, percentile-based peer-comparison
  (privacy-preserving via the existing Phase 3.x differential-
  privacy substrate).
- **`src/phase1/tax-summary.mjs`** — pure functions computing
  Indian-tax-year aggregation, section 44ADA eligibility, TDS
  reconciliation, ITR-3 / ITR-4 hint generation. Heavy reliance
  on test fixtures — tax math has to be right.
- **`src/phase0/sqlite-store.mjs`** — new tables: `earnings_log`,
  `tax_summaries`. Both indexed by `identityId` and included in
  the DPDP §12(3) erasure cascade.
- **`public/shell/`** — three new cards on the Earn tab. Worker
  flow only; not surfaced on other tabs.
- **`public/shell/i18n.mjs`** — translated copy for the 7
  supported locales. Tax terminology in regional languages
  matters — needs native-speaker review.
- **No new API endpoints exposed to consumers.** Everything is
  identity-scoped and gated by the existing identity-ownership
  check.

Estimated test surface: ~30 new tests. SW cache bump for the new
shell cards.

## Sequencing recommendation

| Phase | Months | What | Adoption target |
|---|---|---|---|
| **6.0** | 0-3 | Single-player tools (this ADR) | 10-50K workers; zero network needed |
| **5.9** | 4-6 | QR signing flow (ADR 0095) | First attestations layer on the existing user base |
| **6.1** | 7-9 | MFI partnerships + UPI cash-out for mesh earnings | First hard-rupee external incentive |
| **6.2** | 10-12 | Worker collective distribution (SEWA, IFAT) | Bulk onboarding |
| **6.3** | year 2 | State e-Shram integration | Population scale |

Phase 6.0 is the entry point for the growth arc. Without it, the
QR signing flow is launching to an empty room.

## Consequences

- **Workers have a reason to install Bharat OS even before any
  network exists.** The earnings tracker is genuinely useful as a
  Notion-equivalent. Mesh earnings are a hard cash incentive
  (small but pure rupee). Tax-helper helps recover withheld TDS.
- **The Trust Passport accumulates as a byproduct.** Every logged
  day of earnings is a self-signed claim that the worker did the
  work. When Phase 5.9 ships, customer signatures layer on top of
  an existing record, not a blank one.
- **Aggregator hostility risk drops to ~zero.** No scraping, no
  account linking, no integration. Bharat OS is just a personal
  income journal as far as Zomato is concerned.
- **DPDP compliance compounds.** The earnings + tax data is more
  sensitive than the existing memory records. Phase 4.0's
  export-and-erasure cascade automatically extends to the new
  tables; no new compliance work.
- **First product surface where i18n quality matters financially.**
  Tax terminology in Hindi/Tamil/Bengali has to be native-speaker
  accurate. Existing Phase 4.5 i18n coverage gaps surface here.

## Future polish (after MVP)

- **OCR-based earnings ingestion** — let the worker take a photo
  of their Swiggy weekly-summary screen; OCR extracts the number.
  Phase 2a.8 Tesseract integration is the substrate. Avoids the
  typing friction without crossing into TOS-violating scraping.
- **Auto-categorisation** — when the user types "₹460 from
  Zomato", suggest the day's working hours from the Phase 3.x
  mesh-contribution timestamps (phone unplugged = working).
- **Per-city / per-category benchmarks** — using the differential-
  privacy substrate, surface "median Mumbai delivery rider earns
  ₹X/hour" without leaking individual data.
- **Loan-eligibility preview** — based on logged income +
  consistency, surface "you would likely qualify for a ₹X
  personal loan at Y% via Bajaj Finserv." The MFI partnership
  (Phase 6.1) is the substrate that makes this real.
- **GST registration helper** — for workers above the GST
  threshold, surface the registration flow. Most don't realise
  they need to register; even fewer know how.
