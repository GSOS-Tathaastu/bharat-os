# ADR 0158 — Phase 13.4.2: SLM-H third concrete skill (PM-KISAN status checker)

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.4 (ADR 0156) substrate + Phase 13.4.1 (ADR 0157)
consumer-complaint-drafter landed the first two of three
anticipated v1 SLM-H skills. This ADR ships the third and
final v1 skill: **PM-KISAN status checker**. It is the first
SLM-H skill in the `government_scheme_status` category, and
the first that has external-API potential (a future
pmkisan.gov.in beneficiary-status adapter), but ships v1 as a
**purely informational** skill — no adapter, no fetch.

## Decision

Ship Phase 13.4.2 as a thin sub-phase using the same pattern
as 13.4.1: 1 new skill file + 1 seed entry + 1 standalone
panel + a 5-verb extension to the shared `SKILL_ACTION_VERBS`
allowlist.

### 1. Extend the SKILL_ACTION_VERBS allowlist

`frontend/src/lib/skill-agent.ts` — add 5 PM-KISAN-specific
verbs to the existing 13:

- `complete_pm_kisan_ekyc` — Aadhaar OTP at pmkisan.gov.in or
  biometric at CSC
- `check_aadhaar_bank_seeding` — visit bank or use mAadhaar /
  NPCI mapper
- `verify_land_records` — Bhulekh / state portal match check
- `contact_pm_kisan_helpline` — 155261 or 011-24300606
- `visit_csc_for_correction` — offline correction at the
  nearest Common Service Center

Allowlist grew 13 → 18. Each new verb has a citizen-readable
`ACTION_LABEL` referencing the canonical resolution path.

### 2. New concrete skill

`frontend/src/lib/skills/pm-kisan-status-checker.ts` —
`SkillDefinition<PmKisanInput, PmKisanFields>`.

Input: free-form `concernText` + a required `currentDateIso`
(YYYY-MM-DD; tests pass a fixed date for byte-stability,
panel passes today's). Output schema layered on the shared
SkillBaseFields:

- `SCHEME_STATUS` — `likely_active` | `likely_inactive` |
  `eligibility_uncertain` | `unknown`. Drift coerces to
  `unknown`.
- `LIKELY_BLOCKER` — one of `ekyc_pending` |
  `bank_aadhaar_unseeded` | `land_record_mismatch` |
  `ineligible_landholding` | `none` | `unknown`. The four
  canonical reasons a PM-KISAN payment fails to land, hard-
  coded into the prompt.
- `NEXT_INSTALLMENT_WINDOW` — free-form description (≤ 120
  chars), seeded by the prompt with the three PM-KISAN
  installment windows (Apr-Jul, Aug-Nov, Dec-Mar) so the SLM
  can reason about which window comes next given the
  citizen-supplied date.
- `KEY_CHECKS` — 1-5 things the citizen should verify.
  Deduped + capped at parser.

Date validation in `buildPrompt`: regex + `Date.parse`
round-trip rejects calendar-invalid instants (e.g.
`2026-13-99`). The validation throw is contained inside the
hook's try/catch so the citizen sees the generic
"model couldn't finish" copy rather than a leaked error.

### 3. Seed entry

`src/phase1/skill-agent-seed.mjs` — third seed entry.
Category `government_scheme_status` (already in the BE
allowlist from Phase 13.4); supportedDocKinds `['generic']`;
maxInputChars 4000; maxOutputChars 1400.

### 4. Standalone surface

`frontend/src/components/PmKisanStatusPanel.tsx` — mounted
on /labs below ConsumerComplaintPanel, keyed on
`pmkisan-<identityId>`. Same shape as ConsumerComplaintPanel
(no bridge dependency, free-form input, synchronous
`runningRef` guard, honest empty state, MIN_GATE_CHARS = 30
with inline hint, MAX_CONCERN_CHARS = 2400 with overcap
warning).

Renders RISK + SCHEME_STATUS + LIKELY_BLOCKER + CONFIDENCE
badges + headline + assessment + NEXT_INSTALLMENT_WINDOW
line + KEY_CHECKS list + 1-5 action steps drawn from
`ACTION_LABEL`.

### 5. Adversarial review verdict: ship_with_no_fixes

Inline 3-lens pass (privacy / UX / edge-cases). No fixes
needed:

- The 13.4.1 MF-1 pattern (no `.filter(Boolean)` collapsing
  intentional spacers) was applied from the start. Regression
  pinned in vitest.
- Date validation rejects non-ISO + calendar-invalid shapes
  at the boundary so the SLM never sees malformed timestamps.
- All drift coerces to safe defaults at the parser layer.
- No ledger event in this phase — output is on-device chip
  rendering, so the SF-2-style PII-grep guard from ADR 0155
  is not load-bearing here.
- Forum-routing concerns from 13.4.1 don't apply (no
  jurisdictional tiers in this skill); the LIKELY_BLOCKER
  enum is the analogous "which of the canonical N causes"
  pattern but with safer defaults.

## Why v1 is informational and not adapter-backed

The pmkisan.gov.in beneficiary-status lookup is a candidate
external API (per the [[external-adapter-substrate]] memory).
Two reasons it doesn't ship in this sub-phase:

1. The official API path is unclear — pmkisan.gov.in offers a
   public web check, not a documented JSON API. A v1 adapter
   would likely scrape the public page (fragile + ethically
   ambiguous without permission). A proper integration needs
   a partner or a public-sector data-share agreement.
2. The skill substrate from 13.4 was designed for the
   informational case first. Wiring a real adapter would add a
   `fetchBeneficiaryStatus` step BEFORE the SLM prompt;
   that's the right shape for 13.4.x but a different phase.

The pitch beat for v1: "the SLM walks you through which of
the four common things to fix, no app download, no helpline
queue, fully offline".

## Consequences

- All three v1 SLM-H skills are now shipped: electricity bill
  explainer (Phase 13.4), consumer complaint drafter (Phase
  13.4.1), PM-KISAN status checker (Phase 13.4.2). SLM USP
  arc + first-skill rollout is complete.
- The shared `SKILL_ACTION_VERBS` allowlist grew from 13 to
  18. The pattern of "extend verbs + ACTION_LABEL together"
  is now well-established; future skills follow.
- The `government_scheme_status` category is now populated.
  Future scheme-status skills (Ayushman Bharat / PMSBY /
  PMJDY / NREGA wage status) are thin sub-phases on top of
  this substrate.

## Tests

- `frontend/src/lib/skills/pm-kisan-status-checker.test.ts`
  — 24 cases. SkillDefinition shape, byte-stable prompt with
  fixed date, profile-fragment injection, MF-1 spacer
  regression, three-installment-window pin, four-blocker
  pin, action-verb pin, date validation (non-ISO rejected,
  calendar-invalid rejected), parser happy path + drift
  coercion (SCHEME_STATUS / LIKELY_BLOCKER) + key-check
  dedup + 5-cap + clip to 120 chars on NEXT_INSTALLMENT_WINDOW
  + null on missing NEXT_INSTALLMENT_WINDOW or no KEY_CHECK.
- `tests/node/skill-agent.test.mjs` — 27 cases (unchanged
  test count from 13.4.1; the seed-list-coverage assertion
  and the HTTP catalog assertion both updated to expect the
  third seed).
- Full sweep at commit time: 467 vitest + Node sweep clean
  + tsc clean.

## Follow-ups (deferred)

- **13.4.3** — Wire action verbs to real next-step launchers
  (consumerhelpline.gov.in URL, e-Daakhil portal, mailto:
  template, pmkisan.gov.in eKYC deep link, tel: 155261).
- **Future SLM-H sub-phase** — pmkisan.gov.in beneficiary-
  status adapter (composes `createAdapter` from Phase
  12.2.1; depends on partner / data-share decision).
- **Future SLM-H sub-phase** — Ayushman Bharat / PMSBY /
  PMJDY / NREGA wage-status skills under the same
  `government_scheme_status` category.
