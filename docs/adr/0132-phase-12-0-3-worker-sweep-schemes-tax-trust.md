# ADR 0132 — Phase 12.0.3: worker sweep — e-Shram + schemes + tax + collective memberships + mint attestation

Status: Accepted (2026-06-01).
Phase: 12.0.3 (substrate integration sweep, worker side).
Depends on: Phase 6.3 e-Shram + scheme entitlements substrate,
Phase 1.x tax-summary, Phase 6.2 collective membership substrate,
Phase 1.27 trust-attestation orchestrator template.

## Context

Second of four substrate-integration sub-phases (12.0.2 →
12.0.5) per the founder directive to "integrate all the
substrates in the best places, showcase as complete product"
before tackling domain modules.

Phase 12.0.2 closed the citizen side (daily brief + memory
records). This sub-phase closes the worker side: government
benefits, tax summary, collective memberships, and the ability
to mint a Trust Passport attestation.

The substrates have all been BE-complete for several phases;
this sub-phase wires them into the existing `/worker/earn` and
`/worker/trust` surfaces without growing the bottom-nav past 5
tabs.

## Decision

Pure FE; zero BE changes. Five integrations across two surfaces.

### Surface placements

| Substrate | Surface | Component |
|---|---|---|
| e-Shram registration | `/worker/earn` (above Cash out) | Inline section in unified Schemes card |
| Scheme entitlements | `/worker/earn` (above Cash out) | Inline list in unified Schemes card |
| Tax summary | `/worker/earn` (after Schemes) | Standalone `Tax view (FY YYYY-YY)` card |
| Collective memberships | `/worker/trust` | New list card |
| Trust attestation mint | `/worker/trust` | Action button + sheet |

Five-tab bottom-nav unchanged. Each card auto-suppresses when
the underlying data is empty (e.g. no e-Shram registration → no
Schemes card at all) so a brand-new worker sees the same clean
Earn surface as before.

### Hooks added in `frontend/src/lib/hooks.ts`

- `useEshramRegistrations(memberId)` — `GET
  /api/identities/:memberId/eshram-registrations`. Filters
  client-side to `status === 'active'`, sorted newest first.
- `useSchemeEntitlements(memberId)` — `GET
  /api/identities/:memberId/scheme-entitlements`. Same filter.
- `useTaxSummary(identityId, financialYear)` — `GET
  /api/identities/:id/tax/summary?financialYear=YYYY-YY`. The
  default `financialYear` (`currentFY()` helper) is computed
  from today; April-pivot per Indian FY.
- `useCollectiveMemberships(memberId)` — `GET
  /api/identities/:memberId/collective-memberships?status=active`.
- `useMintTrustAttestation()` — `POST /api/orchestrations`
  with `actionType: 'trust_attestation'`, `actorId`,
  `intentText: reason`, `execute: true`. Substrate Phase 1.27
  handles the rest (signs the envelope on the citizen's identity,
  persists to `/api/attestations`, makes it readable via
  `/verify/`).

### UI

**`<WorkerEarn>`** gains two new cards between the existing
"Earned this month" card and the "Cash out to UPI" card:

1. **Schemes card** (trust-toned) — only renders when at least
   one e-Shram registration or scheme entitlement exists.
   Surfaces:
   - First (most recent) active e-Shram registration with masked
     UAN, occupation category (spaces, not underscores), state,
     registration date, expiry date.
   - All active scheme entitlements with scheme name, code,
     issuer name, eligibility note, cycle window, monthly
     benefit amount + frequency.
   - "Who issues these?" Evidence block: Bharat OS doesn't
     decide eligibility; issuers (e-Shram registry, cooperative
     societies, sangha collectives, state welfare boards) sign
     each entitlement with their own key. Revocations cascade in
     the audit ledger.

2. **Tax summary card** (governance-toned) — only renders when
   `taxSummary.grossIncomePaise > 0`. Surfaces:
   - 3-column grid: gross income · new regime estimated tax ·
     old regime estimated tax.
   - "Cheapest option for you" highlight box with the
     recommendation label + amount.
   - "Important disclaimer" Evidence block — the substrate's
     full disclaimer ("Bharat OS does NOT file tax returns on
     your behalf. CONSULT A CHARTERED ACCOUNTANT BEFORE FILING.")
     surfaces verbatim. We do not soften the §15-honest legal
     stance.

**`<WorkerTrust>`** gains two new cards between the Trust
Passport card and the MFI consent card:

1. **Mint attestation card** with action button → opens a sheet:
   - Free-form "What is this for?" field (min 4 chars).
   - Trust-tinted info box: "The substrate exposes only what you
     have already disclosed elsewhere — verified phone, income
     band, mesh standing, active consent count. Raw numbers and
     identity IDs never leave your profile."
   - On mint success: shows attestation ID (stripped of `bos:
     attestation:` prefix), verifier flow instructions, link to
     `/verify/`.

2. **Collective memberships card** (trust-toned) — only renders
   when memberships exist. List of active memberships with
   collective name, member role, region, joined date, expiry.
   Evidence block names cooperative society / sangha /
   blessed-collective issuance.

## §15 bindings

- **Issuer-signed by design.** None of these surfaces lets a
  worker self-attest e-Shram, scheme eligibility, or collective
  membership. The substrate refuses; the FE never tries.
- **Mint attestation discloses bands, not raw values.** The
  `trust_attestation` orchestrator template already enforces
  this server-side; the FE copy ("verified phone, income band,
  mesh standing, active consent count") tells the worker what
  the verifier will actually see.
- **Tax disclaimer surfaces verbatim.** The substrate writes a
  long honest disclaimer; the Evidence block renders it without
  edit. Bharat OS does not file taxes; that's the citizen +
  their CA.
- **Auto-suppression preserves the empty state.** A worker with
  no government benefits doesn't see an empty "Government
  schemes" card with placeholder text — the card simply isn't
  rendered. Same for tax (no earnings = no card) and collective
  memberships (no memberships = no card).
- **Trust Passport attestation envelope.** The mint flow runs
  through the orchestrator's existing `trust_attestation`
  template which already signs + persists via Phase 1.27 — the
  FE just surfaces the action.

## Tests

No new tests this sub-phase. The underlying substrates are
battle-tested in:
- `tests/node/eshram-registration.test.mjs`
- `tests/node/tax-summary.test.mjs`
- `tests/node/collective-membership.test.mjs`
- `tests/node/orchestrator.test.mjs` (covers `trust_attestation`
  action type)

FE components are pure surface code over typed hooks;
component-level snapshot tests deferred to polish if needed.

Full Node suite: **890/890** (unchanged). FE Vitest: **45/45**
(unchanged). Bundle: main 411 → **421 KB / 125 KB gzipped**
(+10 KB for 5 hooks + 4 new card surfaces + mint sheet). wllama
lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.50s.

End-to-end verified via curl on the running server — all four
endpoints (eshram-registrations, scheme-entitlements,
collective-memberships, tax/summary) return the expected
structured response for a real identity. Empty-data graceful
suppression confirmed.

## Consequences

- Worker `/app/` is now an actual worker home. Earn tab shows
  government benefits + tax view above the cash-out flow; Trust
  tab lets the worker mint Trust Passport attestations and shows
  collective memberships.
- 5-tab bottom-nav preserved by stacking the new content into
  the existing Earn + Trust surfaces. The Schemes section is
  the natural placement (workers think about benefits in the
  same headspace as earnings); the mint attestation belongs on
  Trust.
- Citizen + worker `/app/` together now surface ~80% of the
  Phase 1.x substrates. Remaining: push notifications, device
  pairing, vault transfer, WebAuthn, DPDP grievance, flag
  reports, voice intent (12.0.4), sponsor admin (12.0.5).
- Pattern reuse for 12.0.4 cross-cutting: the auto-suppression
  pattern + Evidence-block §15 framing generalises to every
  remaining substrate.
- Seed-demo extension is a natural polish step: minting an
  e-Shram registration + a PM-KISAN scheme entitlement + a
  cooperative collective membership for one worker persona
  would make the new cards visible during the live demo. Today
  workers will see them once an issuer mints something.

## What's NOT in this sub-phase

- **Skill traces timeline.** The substrate is wired (`/api/skill-
  preflights/:id/trace`) but a meaningful timeline view needs
  filtering + pagination + per-step expansion UI. Not a quick
  win; deferring to a polish phase or 12.0.4.
- **Per-scheme application flow.** The substrate currently
  surfaces entitlements (read-only); applying to a scheme is a
  separate flow not yet built. v1 ships read-only.
- **Tax filing.** Bharat OS does not file taxes. The disclaimer
  is loud about this. Future polish could integrate with an
  authorised intermediary (ClearTax, TaxBuddy, etc.) but only
  through a separate consent grant.
- **Multi-collective deep dive.** The card shows the list;
  tapping doesn't open a per-collective detail view (member
  roster, revocation history, etc.). Polish.
- **Mint attestation scope picker.** The substrate supports
  selective disclosure (per-scope opt-in); v1 mint sheet uses
  the default scope set. A scope picker is polish.
- **Tax history (prior years).** v1 shows the current FY only.
  A year picker is polish.
- **Seed-demo extension** to populate eshram/schemes/collectives
  for a demo persona. Done in a follow-up commit if needed.
- **i18n** — English copy only.

ADR 0132.
