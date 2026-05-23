# ADR 0058: §9A Safeguard Escalation — Signed Flag Reports + Auto-Block Threshold

## Status

Accepted

## Context

§9A enumerates the harm vectors a labor / service marketplace can amplify if
built carelessly — advance-fee scams, wage non-payment, unsafe conditions,
underage workers, no-shows, fraud, exploitation/trafficking, abuse. ADRs
0044 and 0047 closed the consent-bound enforcement side: the L4 worker-
protection policies and the signed worker-authorization receipt. What was
missing is the **escalation** path — how does a worker (or rider, or
counterparty) **report** an actor who is mistreating them, and how does
the system act on those reports without waiting for human review?

§17 listed this as Phase 2a queue item #13. The audit of Codex's Phase 2a.1
–2a.7 work also called it out: enforcement-without-reporting is half the
§9A story.

## Decision

Phase 2a.9 adds the signed flag-report primitive plus an L4 policy that
auto-blocks repeat offenders.

### Signed flag-report artifact

`src/phase1/flag-report.mjs`:

- `createFlagReport({ reporterId, subjectActorId, category, severity,
  jobReference, summary })` — produces a canonical artifact. The
  canonical ID is derived from the payload hash, so tampering with the
  summary or severity invalidates the ID.
- Categories track §9A vectors: `advance_fee`, `wage_non_payment`,
  `unsafe_conditions`, `underage_worker`, `no_show`, `fraud`,
  `exploitation`, `abuse`, `other`.
- Severities: `low | medium | high`. Only **high** counts toward the
  auto-block threshold.
- Statuses: `pending → under_review → resolved | dismissed`.
- `signFlagReport(report, signerIdentity)` refuses any signer that is
  not the reporter — preventing operator-side flag forgery in the same
  way `signWorkerAuthorization` prevents fake worker authorizations.
- `verifyFlagReport(report, publicRecord)` checks canonical ID,
  signature payload hash, and signature itself.
- `resolveFlagReport(report, { status, reason, resolvedBy })` records
  the review verdict; `flagSummaryForSubject(actorId, flags)` rolls up
  the open / high / medium / low counts for the policy.

### L4 policy: `policy.report.flag_review_threshold`

`src/phase1/policy.mjs` (export `FLAG_REVIEW_BLOCK_THRESHOLD = 3`):

- `evaluateDecision` now accepts a `flags` option alongside `consents`
  and `publicRecords`.
- If the actor in the request has **≥ 3 open high-severity flag reports
  against them**, the policy fails with explicit counts and the
  threshold value in `extra`.
- Resolved / dismissed flags no longer count, by design — the goal is
  friction-with-due-process for repeat offenders, not permanent ban
  without recourse.
- The same `flags` option propagates through `evaluateSkillPreflight`,
  `executeToolAction`, and `orchestrateIntent` — same pattern as
  `publicRecords` from ADR 0047.

### Persistence + ledger

`BosStore` gains `saveFlagReport` / `readFlagReport` / `listFlagReports`
and a `flag-reports/` directory. Every save appends a
`flag_report.saved` event to the audit ledger with reporter, subject,
category, severity, status, and job reference — so the operator console
ledger filter picks them up automatically.

### API + CLI + shell

- API: `GET/POST /api/flags`, `GET /api/flags/:id`,
  `POST /api/flags/:id/resolve`, `GET /api/flags/summary/:subjectActorId`.
  `POST /api/orchestrations` now loads `store.listFlagReports()` and
  passes them to `orchestrateIntent`.
- CLI: `bos flag create | list | summary | resolve`. The `create`
  command optionally signs with `--sign-with-identity-id`.
- Shell: a "Report a problem (§9A)" card at the bottom of `/shell/`.
  Reporter is the active profile; subject is a dropdown of other
  identities on the device (which, given §15 / §9A, means anyone the
  active user knows about). Category, severity, summary inputs. On
  submit, signs with the local profile and POSTs to `/api/flags`.
- Diagnostics panel adds row "2a.9 — One-tap reporting + flag ledger"
  marked **real** with a one-line note about the auto-block threshold.

## Consequences

- The §9A enforcement story is now end-to-end: prevention (L4 worker-
  protection policies), authorization (signed worker-auth receipts),
  and **escalation** (signed flag reports + auto-block).
- An investor demo can now answer the harder questions: *"what if a
  contractor pays workers late?"* — three high-severity flags from
  different workers and the policy auto-blocks his next labor post
  until an NGO / labour-law partner review resolves the queue.
- The reporter's signature is cryptographic, not procedural. A flag
  forged by an operator pretending to be a worker fails verification
  because the operator does not hold the worker's private key.
- The threshold is intentionally a small constant (3) for the
  prototype. Production should make this configurable per category
  (e.g., child-labour reports should auto-block on 1), per geography,
  and per the NGO / labour-law partner's review capacity.
- Still open: the operator console has no flag-review panel yet — the
  ledger event surfaces the activity but resolving a flag requires the
  CLI or a direct API call. A console panel is the natural next polish.
- Still open: there is no rate-limit on reporting itself, which could
  be abused to flag-bomb a competitor. A reporter-side reputation
  weight (lighter weight if the reporter has many dismissed reports)
  is a future hardening.
