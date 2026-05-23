# ADR 0044: §9A Worker-Protection Policies in the L4 Engine

## Status

Accepted

## Context

BHARAT_OS.md §9A describes the labor-matching flow as one of the most important
flows for Bharat OS because it reaches a population that ordinary gig apps
cannot serve. The same section enumerates concrete protections the
architecture must enforce — advance-fee block, wage escrow, minimum-wage-floor
checks, age and consent verification, and the kiosk/assisted-channel rule that
a CSC operator can help but cannot *act as* the worker.

§17 (current implementation status) flagged the labor flow as "shallow":
the `labor_match_post` template wired the UPI escrow mock but the §9A
protections were absent from the L4 policy engine. The single existing rule
(`policy.worker.no_advance_fee`) only checked `money.workerPays` and only for
`labor_match_post` — it did not generalize, did not require escrow, did not
floor wages, did not verify age, and did not enforce mediation rules.

## Decision

Add five worker-protection rules to the L4 policy engine and generalize the
existing advance-fee rule. The full §9A worker-protection set in
`DEFAULT_POLICIES`:

- `policy.worker.no_advance_fee` — generalized; applies to any action with
  `money.workerPays === true`, not only labor flows. §15 binding.
- `policy.worker.escrow_required` — labor flows must either carry
  `money.escrow === true` or route through the `upi_escrow` tool.
- `policy.worker.minimum_wage_floor` — labor flows must declare
  `labor.wageFloorPerDay`; the implied per-worker-per-day wage
  (`money.amount / (labor.days * labor.headcount)`) must meet the floor.
- `policy.worker.age_verification` — labor flows require
  `identity.ageAttested === true` and `identity.ageMinimum ≥ labor.legalMinAge`
  (default 18). Missing attestation blocks by default — this is the §9A
  child-labour safeguard.
- `policy.mediation.requires_worker_authorization` — when
  `mediation.kioskOperatorId` is present, the request must also include
  `mediation.workerAuthorizationId`. The operator cannot stand in for the
  worker.
- `policy.money.fiat_settlement_only` — any monetary action must settle in a
  currency on the fiat allow-list (today: INR). Tokens and crypto are out.
  §15 binding.

The resolved action request now carries a `labor` block (`days`, `headcount`,
`wageFloorPerDay`, `legalMinAge`), an `identity.ageAttested` / `ageMinimum`
pair, a `mediation` block, and a `money.escrow` flag. `resolveActionRequest`
is idempotent — explicit null handling prevents a second pass from silently
flipping `null` to `0` and rewriting the decision hash.

The L6 skill preflight now propagates `labor` and `mediation` into the
underlying decision evaluation, and remediation responses for each new policy
include a concrete `hint` field telling callers exactly how to unblock.

The `labor_match_post` orchestration template seeds sensible defaults
(`money.escrow=true`, `labor.wageFloorPerDay=400`, `labor.legalMinAge=18`) but
deliberately leaves `identity.ageAttested=false`. Callers must explicitly
attest age — this is what makes the safeguard effective rather than ceremonial.

## Consequences

- §9A protections are now enforced by L4, not by convention. Any tool
  execution or orchestration that fails one of these rules is blocked and
  audit-logged before the L3 tool runs.
- The default orchestration of a labor intent without explicit age
  attestation blocks — verified by a test (`worker-protection.test.mjs`).
  This is a behavior change for any caller that previously assumed labor
  flows ran without supplying age data.
- `resolveActionRequest` is now hot-path idempotent. Decision hashes across
  preflight and execution remain stable.
- Worker authorization receipts (`mediation.workerAuthorizationId`) are
  currently opaque IDs validated by presence only. A follow-on ADR will make
  them a signed first-class artifact type (the second open §9A item flagged
  in §17).
- Per-profile auth on shared devices, the device-less assisted/kiosk channel,
  and one-tap reporting (§9A design problem A and the safeguard escalation
  path) remain out of scope for this ADR and are tracked in §17.
- Adds five entries to the policy registry: total ten policies. The operator
  console policy panel and the skill remediation surface pick these up
  automatically through the existing `listPolicies()` and `remediationFor()`
  paths.
