# ADR 0100: Phase 6.3 — State e-Shram + Welfare Scheme Entitlement Substrate

## Status

**Accepted — shipped.** Final phase of ADR 0096's growth-arc plan
("Phase 6.3 — State e-Shram integration"). With this commit, the
growth-arc shipping list (Phases 6.0a, 6.0b, 6.0c, 5.9, 6.1, 6.1b,
6.2, 6.3) is complete end-to-end.

## Context

e-Shram is the Ministry of Labour & Employment's National Database
of Unorganised Workers — ~300M registered workers as of FY 2024-25,
each holding a 12-digit UAN (Universal Account Number). The
registration links to a basket of welfare schemes: PMJJBY (life
insurance), PMSBY (accident insurance), PM-SYM (pension), PMJAY
(Ayushman Bharat health), MGNREGA, PMAY, NSAP, plus state-specific
welfare boards.

ADR 0096's Phase 6.3 plan: *"State e-Shram integration. Heavy lift
but the largest population."*

The partnership work itself is out-of-tree — a state labor
commissioner pilot or central scheme administrator partnership.
The substrate the partnership consumes IS in scope and ships here.

Two primitives, each composing with the Phase 6.2 blessed-issuers
registry:

1. **e-Shram registration** — issuer signs an envelope "this worker
   holds UAN X, occupation Y, state Z, ..."
2. **Scheme entitlement** — issuer signs an envelope "this worker is
   enrolled in scheme S as of date D, ..."

Consuming surfaces (MFI bundle, aggregator integrations) read the
blessed-issuers registry from Phase 6.2 to decide whose
attestations to honor. No partner-specific code needed.

## Decision

### `src/phase1/eshram-registration.mjs`

Pure functions for both primitives. Same shape as Phase 6.2's
`collective-membership.mjs` so consuming code patterns generalise.

**e-Shram registration** —
`createEShramRegistration({ issuer, memberId, issuerName, uan,
occupationCategory, occupationDetail?, state, district?,
educationLevel?, monthlyIncomeBracket?, ncoCode?, registeredAt?,
ttlDays?, at })`:

- UAN validated as 12-digit string; **`maskUan('123456789012')` →
  `xxxx-xxxx-9012`** (mandatory for any audit / ledger / metric
  surface).
- Occupation taxonomy: 8 broad e-Shram categories (`agriculture` /
  `construction` / `domestic` / `transport` / `manufacturing` /
  `gig_platform` / `retail` / `other`) + optional free-text
  `occupationDetail`.
- State: 2-3 letter uppercase code (e.g. `TN`, `MH`, `KA`).
- District: ≤ 80 chars.
- Education level enum: `no_formal` / `primary` / `secondary` /
  `higher_secondary` / `graduate` / `postgraduate` / `unspecified`.
- Monthly income bracket: enum (coarse — `under_10k` /
  `10k_to_25k` / `25k_to_50k` / `50k_to_1L` / `1L_to_3L` /
  `over_3L`) — **NEVER a precise amount**.
- NCO 2015 code: 2-4 digit string.
- Ed25519-signed by the issuer; deterministic
  `bos:eshram-registration:<sha256-prefix>` ID.

**Scheme entitlement** — `createSchemeEntitlement({ issuer,
memberId, issuerName, schemeCode, schemeName?, enrolledAt?,
benefitPaise?, benefitDescription?, validThrough?, ttlDays?, at })`:

- Scheme code enum: `PMJJBY` / `PMSBY` / `PM-SYM` / `PMJAY` /
  `MGNREGA` / `PMAY` / `NSAP` / `STATE_WELFARE` / `OTHER`.
- Benefit amount in INTEGER paise (no float drift).
- `validThrough` is the scheme's own end-date (separate from the
  attestation `expiresAt` — an attestation can be re-signed without
  the scheme membership lapsing).
- `verifySchemeEntitlement` returns `status: 'scheme_validity_expired'`
  separately from `'expired'` so consumers can distinguish
  "attestation needs re-signing" from "scheme membership ended."

**Verification + revocation** mirror Phase 6.2's pattern:

- `verifyEShramRegistration` / `verifySchemeEntitlement` —
  signature + freshness + revocation status. Status enum:
  `valid` / `expired` / `revoked` / `signature_invalid` /
  `unknown_issuer` / `malformed` / `scheme_validity_expired`
  (entitlement only).
- `revokeEShramRegistration` / `revokeSchemeEntitlement` — reason
  ≥ 4 chars required.

**Blessed-issuer filters** —
`filterBlessedEShramRegistrations(records, blessedRegistry, { at })`
and `filterBlessedSchemeEntitlements(records, blessedRegistry,
{ at })`. Reuse Phase 6.2's blessed-collectives registry; the
"collective" naming is retained for backward compatibility but
the registry is semantically "blessed issuers."

### SqliteStore — two new tables

- **`eshram_registrations`** indexed on `issuer_id` + `member_id` +
  `status`.
- **`scheme_entitlements`** indexed on `issuer_id` + `member_id` +
  `status` (scheme_code column for filter scans).

Both included in the DPDP §12(3) erasure cascade. Erasure clears
both member-side records AND issuer-side records.

### API endpoints (6 new)

- **`POST /api/identities/:issuerId/eshram-registrations`** —
  signs + persists. Refuses if issuer's identity has no
  privateKey on server (Phase 2a demo-mode caveat). Emits
  `eshram_registration.issued` ledger event with **MASKED UAN
  only**.
- **`GET /api/identities/:memberId/eshram-registrations`** — list
  member's registrations.
- **`POST /api/identities/:issuerId/eshram-registrations/:registrationId/revoke`**
  — non-issuer attempts return 404 (no ownership leak).
- **`POST /api/identities/:issuerId/scheme-entitlements`** —
  same shape as registration POST. Emits
  `scheme_entitlement.issued` ledger event.
- **`GET /api/identities/:memberId/scheme-entitlements`** —
  optional `?schemeCode=PMJAY` filter.
- **`POST /api/identities/:issuerId/scheme-entitlements/:entitlementId/revoke`**
  — non-issuer 404.

### MFI income-verification bundle (ADR 0097 / 0099) extension

`buildIncomeVerificationBundle` now accepts `eshramRegistrations`
+ `schemeEntitlements` inputs. Bundle's `credibility` section
gains two new fields:

```json
{
  "credibility": {
    "portableAttestationsByTier": { "0": 320, "1": 70, "2": 10 },
    "totalSignedAttestations": 400,
    "verifiedCollectiveMemberships": [ ... ],
    "verifiedEShramRegistrations": [
      {
        "registrationId": "...",
        "issuerName": "TN Labour Dept",
        "uanMasked": "xxxx-xxxx-1098",
        "occupationCategory": "domestic",
        "state": "TN",
        "district": "Chennai",
        "educationLevel": "secondary",
        "monthlyIncomeBracket": "10k_to_25k",
        "registeredAt": "2022-08-15",
        "issuedAt": "2026-05-25T...",
        "expiresAt": "2027-05-25T..."
      }
    ],
    "verifiedSchemeEntitlements": [
      {
        "entitlementId": "...",
        "issuerName": "National Health Authority",
        "schemeCode": "PMJAY",
        "schemeName": "Ayushman Bharat",
        "benefitPaise": 50000000,
        "validThrough": "2027-09-30"
      }
    ]
  }
}
```

Only entries signed by blessed issuers AND currently valid (active
+ not expired + not revoked, and for entitlements `validThrough`
not in the past) make it into the bundle.

**§15-critical**: `verifiedEShramRegistrations[i].uanMasked` is
the only UAN field. The raw 12-digit UAN is on the stored
attestation record (DPDP-exportable by the worker themselves) but
**NEVER appears in the bundle MFIs see**, **NEVER in ledger
events**, **NEVER in metric labels**. Tests assert this by
checking the full bundle JSON does not contain the raw UAN string.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| UAN masking everywhere except the stored record | `maskUan('123456789012') → 'xxxx-xxxx-9012'`. Ledger events, MFI bundle, structured logs, metric labels all use the mask. Tests assert raw UAN absence end-to-end. |
| Aadhaar NEVER stored | We don't request it; we don't accept it; it's not in the schema. e-Shram government layer holds Aadhaar — we hold the UAN they issued. |
| Income is bracketed, not precise | `monthlyIncomeBracket` enum has 6 coarse bands. The actual paise figure (Phase 6.0a earnings-log) is the precise number; this is supplementary. |
| Cross-issuer revoke 404 | Same as Phase 6.2 — non-issuer revoke attempts mirror the existing income-verification revoke pattern; no ownership leak. |
| Blessed-issuer protocol vs. trust policy separation | Anyone can sign e-Shram or scheme attestations; only blessed issuers surface in consuming flows. Rogue self-attestations are not blocked at issuance but carry no weight. |
| Audit trail | Every issuance + revocation emits a typed ledger event with masked UAN (registrations) / scheme code (entitlements) + issuer attribution. |
| DPDP erasure cascade | Both new tables in §12(3) cascade. Worker erasure removes their member-side records; issuer erasure removes both their issued records AND their blessed-registry entry. |
| MFI bundle surfaces only blessed entries | Trust-list filter happens server-side. Rogue attestations cannot bleed through. |

## Tests

`tests/node/eshram-registration.test.mjs` — 23 tests:

**UAN helpers** (2): `isValidUan` format check; `maskUan` last-4
preservation.

**`createEShramRegistration`** (2): versioned signed envelope shape
+ all field validations (UAN format, state pattern, occupation
enum, education enum, income bracket enum, NCO code format, TTL
bounds, self-issue refusal).

**`verifyEShramRegistration`** (2): tamper rejection +
expired/revoked status enum coverage.

**`createSchemeEntitlement` + `verifySchemeEntitlement`** (3):
signed envelope + verify round-trip; invalid scheme code + bad
benefit amount rejection; `scheme_validity_expired` distinct from
`expired`.

**`revokeSchemeEntitlement`** (1): reason ≥ 4 chars.

**Blessed-issuer filters** (2): blessed-and-valid only;
`validThrough` respected.

**MFI bundle integration** (2): UAN masked end-to-end (test asserts
raw UAN absent from full bundle JSON); scheme entitlement
surfaces correctly.

**SqliteStore + DPDP** (3): round-trip both tables; list filters
across issuer / member / status / schemeCode; DPDP cascade
clears member-side records.

**End-to-end live HTTP** (5): POST eshram-registrations + ledger
emission with masked UAN; unknown member 400; POST entitlement +
list + revoke round-trip; cross-issuer revoke 404; **full
end-to-end** (bless 2 issuers → labour dept issues registration
+ NHA issues PMJAY → worker issues MFI consent → MFI fetches
bundle → bundle surfaces both registration + entitlement with
masked UAN + asserts raw UAN absent).

**Constants** (1): enums frozen + complete.

Full suite: **696 / 696 green** (was 673; +23 new). No SW change
(server-side only).

## Consequences

- **State labor commissioner partnership has a code answer.** When
  a state's labour department asks "what does Bharat OS give us?",
  the answer is concrete: an endpoint your office hits to issue
  signed UAN-backed registration attestations to your e-Shram
  workers. Those attestations surface in the worker's Trust
  Passport, the MFI bundle (with masked UAN), and any consuming
  aggregator — without any per-state integration code.
- **Welfare-scheme administrators have the same answer.** NHA
  (PMJAY), EPFO, central pension scheme administrators, state
  welfare boards — all issue signed entitlement records via
  one endpoint.
- **Workers prove government registration without leaking UAN.**
  The bundle MFI sees says "verified e-Shram registration in
  Tamil Nadu, domestic worker, since 2022, UAN xxxx-xxxx-1098"
  — strong signal without exposing the 12-digit identifier. MFI
  gets enough to verify with e-Shram directly if they have an
  e-Shram API integration; doesn't need it for underwriting if
  they trust the blessed issuer.
- **The growth-arc plan in ADR 0096 is now fully shipped.** All
  five Phase 6.x ADRs (0096 + 0097 + 0098 + 0099 + 0100) are
  Accepted. The substrate any Indian growth-arc partnership
  consumes — single-player tools, portable attestations, MFI
  income verification, UPI cash-out, worker collective
  memberships, state e-Shram registrations + scheme entitlements
  — is in production.

## Future polish

- **Scheme-specific verification logic** — PMJAY enrollment status
  could be cross-checked against NHA's database when a partner
  integration lands. Today the entitlement attestation is the
  bearer; cross-checking would catch fraud at the issuer layer.
- **Per-state pilot configs** — different state labor commissioners
  may have different occupation taxonomies (e.g., Kerala's
  construction worker board uses finer categories than the e-Shram
  default). A future version could let a blessed issuer specify
  its own occupation taxonomy.
- **Aadhaar bridge (out-of-scope today)** — when AUA/KSA
  contracts land (per ADR 0096's external commitments list), the
  e-Shram UAN could be cross-checked against the Aadhaar layer
  to detect impersonation. Today we trust the issuer's
  signature.
- **Member-side opt-in confirmation** — same future-polish item
  as Phase 6.2: a future flow could require the worker to POST
  `/accept` on the registration before it surfaces in bundles.
- **Bulk-import endpoint for partners** — state labor commissioner
  with 10M workers needs to bulk-issue. Today they POST
  one-by-one. CSV ingest with batched signing closes the gap.
- **Scheme-benefit telemetry** — surface "verifiedSchemeEntitlements
  read by N MFIs in last 30 days" so scheme administrators can
  demonstrate value to participating workers.
