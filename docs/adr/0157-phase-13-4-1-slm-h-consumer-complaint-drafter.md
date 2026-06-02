# ADR 0157 — Phase 13.4.1: SLM-H second concrete skill (consumer complaint drafter)

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.4 (ADR 0156) landed the SLM-H substrate + first
concrete skill (electricity bill explainer). The ADR explicitly
deferred two follow-up skills:

> "13.4.1 — Consumer complaint drafter skill (consumer
>  protection act draft + ODR / consumerhelpline.gov.in route)."

This ADR ships that skill as a focused sub-phase: ONE new skill
file + ONE seed entry + ONE standalone panel + a 5-verb
extension to the shared `SKILL_ACTION_VERBS` allowlist.

## Decision

Ship Phase 13.4.1 as a thin composition over the existing 13.4
substrate. The new surface is a **standalone panel** (not
chained off a doc-summary bridge like the electricity bill
explainer) because the citizen describes their grievance in
free-form text — there is no upstream document to compose from.

### 1. Extend the SKILL_ACTION_VERBS allowlist

`frontend/src/lib/skill-agent.ts` — add 5 complaint-specific
verbs to the existing 8:

- `file_complaint_district_commission` — for relief ≤ ₹50 lakh
- `file_complaint_state_commission` — for ₹50 lakh – ₹2 crore
- `file_complaint_national_commission` — above ₹2 crore
- `escalate_to_consumer_helpline` — National Consumer Helpline
  at 1915 / consumerhelpline.gov.in
- `send_legal_notice` — formal pre-filing notice

Each new verb has a citizen-readable `ACTION_LABEL` entry
referencing the Consumer Protection Act 2019 jurisdictional
tiers verbatim. Existing electricity-bill-explainer prompt
template doesn't reference these new verbs, so its behaviour
is unchanged.

Also coerced `SKILL_ACTION_VERBS` to `Object.freeze(... as const)`
for runtime defence-in-depth (matches the
SKILL_AGENT_CATEGORIES posture from Phase 13.4).

### 2. New concrete skill

`frontend/src/lib/skills/consumer-complaint-drafter.ts` —
`SkillDefinition<ConsumerComplaintInput, ConsumerComplaintFields>`.

Input: free-form `complaintText` + optional `relatedDocTitle` /
`relatedDocTldr` for citizens who already ran a doc summary on
the related document. Output schema layered on the shared
SkillBaseFields:

- `DRAFT_SUBJECT` — formal complaint subject line (≤ 120 chars)
- `FORUM_LEVEL` — `district` | `state` | `national` (CPA 2019
  tier). Drift coerces to `district` (safest default).
- `RELIEF_KIND` — `refund` | `replacement` | `service_redo` |
  `compensation` | `apology` | `mixed`. Drift coerces to
  `mixed`.
- `ESTIMATED_PROCESSING_DAYS` — clamped to [30, 720] (90 days
  is the CPA 2019 target for non-evidentiary district matters;
  realistic upper bound is ~2 years).
- `KEY_FACTS` — 1-5 facts the citizen's complaint must
  include. Deduped at parser layer; capped at 5.

### 3. Seed entry

`src/phase1/skill-agent-seed.mjs` — second seed entry. Category
`consumer_complaint_drafter` (already in the BE allowlist from
Phase 13.4); supportedDocKinds `['generic']` because the skill
accepts free-form input, not a parsed doc. License
apache-2.0; maxInputChars 6000; maxOutputChars 1600.

### 4. Standalone surface

`frontend/src/components/ConsumerComplaintPanel.tsx` — mounted
on /labs below the SkillAgentPanel, keyed on
`complaint-<identityId>` for identity-flip remount. Honest
empty state on no SLM. Citizen-typed textarea (2400-char cap
with overcap warning). `Draft my complaint` button is gated on
`complaintText.trim().length >= 40` with an inline hint;
synchronous `runningRef` guard for same-tick double-clicks (same
pattern as Phase 13.4 SF-4). Renders RISK + FORUM_LEVEL +
RELIEF + CONFIDENCE badges + DRAFT_SUBJECT chip + KEY_FACTS
list + estimated-processing-days line + 1-5 action steps drawn
from `ACTION_LABEL`.

### 5. Adversarial review applied in-phase

Inline 3-lens pass (privacy / UX / edge-cases). Verdict:
**ship_with_one_fix**.

**MF-1 — `.filter(Boolean)` collapsed intentional blank-line
spacers.** The initial prompt builder used
`[...].filter(Boolean).join('\n')` to optionally drop the
related-doc-context block. This also silently dropped the
intentional blank-line spacers between the profile fragment
and the role line, and between the complaint body and `YOUR
ANSWER:`. The byte-equal test passed (both calls produced the
same flattened output), but the prompt structure was degraded
in a way the SLM would interpret as a different prompt shape.
Fix: build the prompt by pushing into a single array with
explicit conditional sections; no filter. Regression test pins
both spacers via `.toContain('Prefer simple English.\n\nYou
are an on-device')` and `.toMatch(/COMPLAINT
DESCRIPTION:[\s\S]+?\n\nYOUR ANSWER:/)`.

No SHOULD_FIX in this pass — the substrate from 13.4 carried
the heavy posture (rate limit, runningRef, honest hide, strict
allowlist coercion). 13.4.1 just composes it.

## Why the seed entry is a registry row even though the skill is FE-only

Same answer as the Phase 13.4 ADR (0156): the BE registry row
carries POINTERS only (category / docKinds / requiredCapabilities
/ license / caps) — the actual prompt body ships in the FE
bundle. The row exists so the catalog endpoint can advertise
"this skill is available" cross-device, and so an operator
can revoke a bad-prompt skill at runtime via the admin endpoint
without an FE rebuild.

## Consequences

- The SLM-H arc now has 2 of 3 anticipated skills (electricity
  bill explainer + consumer complaint drafter). 13.4.2
  (PM-KISAN status checker) is the next sub-phase.
- The shared `SKILL_ACTION_VERBS` allowlist grew from 8 to 13.
  Future skills that emit verbs not in this list will be
  coerced to safe defaults at the parser layer; adding a new
  verb is a cross-cutting change that must extend both
  `SKILL_ACTION_VERBS` AND `ACTION_LABEL` together. The vitest
  pin (`every action verb has a citizen-readable label`)
  catches drift.
- The ConsumerComplaintPanel demonstrates the
  free-form-input pattern for skills that don't need an
  upstream doc summary. Future skills like the PM-KISAN status
  checker (which needs the citizen's Aadhaar-linked beneficiary
  number) will follow the same shape.

## Tests

- `frontend/src/lib/skills/consumer-complaint-drafter.test.ts`
  — 24 cases. SkillDefinition shape, byte-stable prompt, MF-1
  spacer regression, profile-fragment injection above the role
  line, related-doc-context embed + omit, parser happy path
  + drift coercion (FORUM_LEVEL / RELIEF_KIND) + clamp /
  floor / dedupe / 5-cap on processing-days + key-facts +
  null on missing DRAFT_SUBJECT or no KEY_FACT.
- `tests/node/skill-agent.test.mjs` — 27 cases (was 26 in
  Phase 13.4; +1 for the 2-seed coverage assertion + extended
  HTTP integration test that checks both categories
  consumer_complaint_drafter + utility_bill_explainer land in
  the catalog).
- Full sweep at commit time: 442 vitest + Node sweep clean
  + tsc clean.

## Follow-ups (deferred)

- **13.4.2** — PM-KISAN status checker skill (CPC beneficiary
  lookup + installment status).
- **13.4.3** — Wire action verbs to real next-step launchers
  (consumerhelpline.gov.in URL for the helpline verb;
  e-Daakhil portal for district commission filing; mailto:
  template for legal notice).
- Cross-check `forumLevel` against any relief amount mentioned
  in the complaint text (a ₹500 dispute should never route to
  national).
