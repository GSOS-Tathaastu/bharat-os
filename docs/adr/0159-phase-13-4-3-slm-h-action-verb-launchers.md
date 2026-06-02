# ADR 0159 — Phase 13.4.3: SLM-H action-verb launchers (close 13.4.x sub-arc)

Status: Accepted
Date: 2026-06-02

## Context

Phases 13.4 / 13.4.1 / 13.4.2 (ADRs 0156–0158) shipped the
SLM-H substrate + 3 concrete skills. Across the rollout, the
shared `SKILL_ACTION_VERBS` allowlist grew from 8 to 18.
Until this phase, those verbs rendered as plain text in each
panel — informational but not actionable. The three ADRs
each explicitly deferred:

> "13.4.3 — Wire action verbs to real next-step launchers
>  (URLs / tel: / mailto: / app deep links)."

This ADR closes that deferral. Every renderable URL is
compile-time fixed in an allowlist; the SLM cannot inject a
clickable destination.

## Decision

### 1. `ACTION_LAUNCHER` map + URL allowlist

`frontend/src/lib/skill-agent.ts` — add a strict-discriminated
`SkillActionLauncher` union and an `ACTION_LAUNCHER:
Record<SkillActionVerb, SkillActionLauncher>` map. The
`Record` type forces exhaustiveness: a future PR that adds a
new verb to `SKILL_ACTION_VERBS` must add a matching launcher
entry or fail to typecheck.

```ts
type SkillActionLauncher =
  | { kind: 'url'; href: string; verifyPrefix: string }
  | { kind: 'tel'; number: string }
  | { kind: 'in_app'; route: string }
  | { kind: 'none' };
```

`ALLOWED_LAUNCHER_URL_PREFIXES` is a frozen 4-entry list of
GoI portal prefixes (consumerhelpline.gov.in, edaakhil.nic.in,
pmkisan.gov.in, findmycsc.nic.in). A module-load guard runs
`assertLauncherIsAllowlisted` on every `url` entry — adding
a non-allowlisted URL fails import-time, not at runtime.

The `verifyPrefix` field on each `url` launcher (rather than
just checking the global allowlist) is defence-in-depth: a
future PR that points a verb at a SUB-PATH of an allowed
domain must explicitly state the prefix it's claiming, so a
typo (`https://pmkisan.gov.in.malicious.example/`) catches at
boundary instead of silently passing the substring check.

Mapping summary (18 verbs):

| Verb | Launcher |
|---|---|
| `file_dispute_consumer_forum` | `url` → consumerhelpline.gov.in |
| `request_meter_recheck` | `none` (discom-specific) |
| `switch_tariff_plan` | `none` (discom-specific) |
| `pay_via_upi` | `none` (no payee VPA) |
| `check_subsidy_eligibility` | `none` (scheme-specific) |
| `compare_with_neighbours` | `none` (no canonical surface) |
| `archive_for_records` | `in_app` → /citizen/notes |
| `flag_for_review` | `none` (Sahayak surface — Phase 14.x; SF-1) |
| `file_complaint_district_commission` | `url` → edaakhil.nic.in |
| `file_complaint_state_commission` | `url` → edaakhil.nic.in |
| `file_complaint_national_commission` | `url` → edaakhil.nic.in |
| `escalate_to_consumer_helpline` | `tel` → 1915 |
| `send_legal_notice` | `none` (recipient-specific) |
| `complete_pm_kisan_ekyc` | `url` → pmkisan.gov.in |
| `check_aadhaar_bank_seeding` | `none` (bank-specific) |
| `verify_land_records` | `none` (state-specific Bhulekh) |
| `contact_pm_kisan_helpline` | `tel` → 155261 |
| `visit_csc_for_correction` | `url` → findmycsc.nic.in |

8 of 18 verbs land on `none` because no universal endpoint
exists — the right destination depends on the citizen's
state / discom / bank. Honest informational framing is the
correct UX until per-state / per-discom adapters land in a
future sub-phase.

### 2. Shared `SkillActionLink` component

`frontend/src/components/SkillActionLink.tsx` — single
renderer used by all three SLM-H panels (SkillAgentPanel,
ConsumerComplaintPanel, PmKisanStatusPanel). Exhaustive switch
on `launcher.kind`:

- `'url'` → `<a target="_blank" rel="noopener noreferrer">`
  — security defaults for external navigation. Without
  `noopener` the new tab could navigate the parent via
  `window.opener`; without `noreferrer` the destination sees
  Bharat OS in the Referer header. Vitest pins both.
- `'tel'` → `<a href="tel:NUMBER">` with a "(tap to dial NUMBER)"
  caption so desktop users understand what tapping does.
- `'in_app'` → react-router `<Link>` (stays SPA-internal; no
  `target="_blank"` so context isn't lost in a fresh tab).
- `'none'` → plain `<span>` with the label only.

### 3. Adversarial review — applied fixes

3-lens pass (privacy / UX / edge-cases). Verdict:
**ship_with_one_fix**.

**SF-1 — `/citizen/flags` route does not exist.** The initial
draft mapped `flag_for_review` to `{kind: 'in_app', route:
'/citizen/flags'}`. The CitizenHome route table only
declares `home`, `notes`, `trust`, `queue` — no flags surface
ships until the Sahayak module (Phase 14.x). A 404 on click
would be a worse UX than the informational chip. Fixed: map
to `{kind: 'none'}` with a comment marking the Phase 14.x
follow-up. Vitest assertion list updated to include
`flag_for_review` under the informational-only set.

No additional fixes — the URL allowlist + module-load guard +
exhaustive `Record` type + render-branch test coverage cover
the surface.

## Why the strict allowlist matters

The SLM is the only piece of this system that ingests
arbitrary citizen text (the doc summary / complaint
description / PM-KISAN concern). The defence-in-depth chain
that prevents an SLM-injected URL from ever rendering as
clickable:

1. The PARSER (`parseSkillBaseFields` in skill-agent.ts) only
   accepts verbs in `SKILL_ACTION_VERBS_SET`. Drift coerces
   silently. So the parsed `actions` array can only contain
   verbs we ship.
2. The LAUNCHER MAP is keyed exhaustively on
   `SkillActionVerb`. Every verb has a fixed launcher.
3. The MODULE-LOAD GUARD asserts every `url` launcher matches
   `ALLOWED_LAUNCHER_URL_PREFIXES`. A future PR that adds a
   non-allowlisted URL fails import-time.
4. The RENDERER (`SkillActionLink`) reads from the map, not
   from any SLM output. No string from the model ever flows
   into `href`.

The result: even a maximally hallucinating SLM cannot
exfiltrate the citizen via a clickable URL.

## Consequences

- All 18 SLM-H action verbs are now end-user-actionable
  (where a universal launcher exists) or honestly
  informational (where it doesn't).
- The pattern (`SkillActionLink` + `ACTION_LAUNCHER` +
  allowlist) is reusable for future skills — adding a skill
  with new verbs requires extending `SKILL_ACTION_VERBS`,
  `ACTION_LABEL`, AND `ACTION_LAUNCHER` together (typechecker
  forces this).
- The 13.4.x sub-arc is closed. SLM-H delivers
  end-to-end: parse the citizen's input on-device → render a
  structured chip → click through to the official portal /
  helpline.

## Tests

- `frontend/src/lib/skill-action-launchers.test.ts` — 16
  cases. Launcher map completeness; kind allowlist; URL
  allowlist; verifyPrefix matches href; allowlist HTTPS-only;
  allowlist `.gov.in` / `.nic.in` domain check; per-verb
  spot checks (every commission filing → edaakhil; both
  helpline verbs → tel:; pm-kisan ekyc → pmkisan.gov.in; csc
  → findmycsc.nic.in; informational-only set includes
  `flag_for_review` per SF-1).
- `frontend/src/components/SkillActionLink.test.tsx` — 7
  cases. Render branches: external `<a>` with target=_blank +
  rel="noopener noreferrer" + correct href; tel: anchor with
  the helpline numbers verbatim; react-router `Link` for
  in_app (no target=_blank); plain text for kind='none' (no
  link role).
- Full sweep at commit time: 490 vitest + Node sweep clean +
  tsc clean.

## Follow-ups (deferred)

- Per-state Bhulekh URL switch for `verify_land_records`
  (would need a state field on the input + a small
  per-state URL map).
- UPI deep-link `pay_via_upi` once a payee VPA is captured
  upstream (likely via the upstream doc-summary or a
  citizen-set default).
- `send_legal_notice` mailto: template — needs recipient
  input from the complaint draft.
- `/citizen/flags` route + Sahayak agent flagging surface
  (Phase 14.x).
