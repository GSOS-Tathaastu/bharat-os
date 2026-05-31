# ADR 0123: Phase 10.4 — Labeling QC Pipeline (Golden Set + Worker Score Gate + Sponsor Sample-Review + Clawback)

## Status

**Accepted — shipped 2026-05-31.** Wires the three QC layers ADR
0110 sketched for the labeling marketplace. v1 covers (1) golden-
set scoring on submit, (2) worker score gate on next-item
dispatch, (3) sponsor sample-for-review pool with reject (with
mesh + escrow clawback) and accept (no-op). Inter-annotator α
(layer 4 in the original sketch) defers to Phase 10.4.1 polish —
α requires N≥2 workers per item, which is only meaningful at
scale not on the v1 demo seed.

## Context

Phase 10.1/10.2 shipped the lifecycle but **accepted every
submission**. That meant:

- Workers could spam random answers and still earn paise
- Sponsors had no way to dispute a bad label
- No mechanism for the marketplace to converge on quality

ADR 0110's QC plan had three layers:

1. **Golden-set** — every Nth item is a known-answer item; worker
   wrong-counted; suspended if 3-of-last-10 wrong
2. **Inter-annotator agreement** — Krippendorff α across N workers
   per item; below threshold → sponsor adjudication queue
3. **Sponsor review** — random sample (default 5%) routed to
   sponsor reviewers; reject → mesh clawback

This sub-phase implements (1) and (3) with explicit FE
disclosure of verdicts. (2) defers.

## Decision

### Submission statuses

`LABELING_SUBMISSION_STATUSES` extended:

```js
[
  'accepted',              // existing
  'rejected',              // existing (manual reject path)
  'rejected_golden_mismatch',   // NEW — server-imposed at submit
  'pending_sponsor_review',     // NEW — sampled at submit
  'rejected_sponsor_review'     // NEW — sponsor rejected from sample
]
```

`ACCEPTED_SUBMISSION_STATUSES` (a Set) + `QC_REJECTED_STATUSES`
(a Set) exported as helpers — callers `has()` them to bucket
submissions for score computation + reporting.

### Job QC config (additive, all default 0 → off)

`createLabelingJob` accepts three new optional fields:

| Field | Meaning |
|---|---|
| `qcGoldenItemRateBps` | Basis-points share of items the sponsor declares as golden. 1000 = 10%. Sponsor still uploads the actual golden answers per item — this number is currently a descriptor (used by ADR text + future analytics); enforcement is per-item via `goldenAnswer` presence. |
| `qcMinWorkerScore` | Threshold in [0, 1] — workers below this on this job can't claim items |
| `qcSponsorReviewRateBps` | Basis-points share of accepted submissions to route to sponsor for review. 500 = 5%. |

All three are locked at create time — sponsor can't change them
mid-job without revoke + re-create. Same posture as 9.1 escrow lock.

### Module helpers

Three pure helpers in `src/phase1/labeling-job.mjs`:

- `computeWorkerScore(submissions)` → number in [0, 1].
  Numerator: accepted. Denominator: accepted + QC-rejected
  (`rejected_golden_mismatch` + `rejected_sponsor_review`).
  Pending sponsor review NOT counted (not yet adjudicated). Fresh
  workers (0 adjudicated subs) get **score 1** — benefit of the
  doubt; the gate is for repeat offenders.
- `matchesGoldenAnswer(taskKind, labelValue, goldenAnswer)` →
  `true` / `false` / `null`. Returns null when golden is absent
  or comparison is undefined for this task kind. Comparisons:
  - `preference_pair`: equal `choice`
  - `classification`: equal `value`
  - `span_annotation`: equal `wordIndices` array (order-independent)
  - `transcription`: case-insensitive trimmed `transcript` equality
  - `safety_label`: set-equal `values`
- `shouldSampleForReview(submissionId, rateBps)` → boolean.
  Deterministic FNV-1a hash of submissionId modulo 10_000 < rateBps.
  Same submission always gets the same verdict — re-runs don't
  randomly flip decisions.

### Submit path — QC applied

`POST /api/labeling-jobs/:jobId/submissions`:

1. Read job + item + prev worker submissions.
2. Worker-can-claim check (unchanged from 10.1).
3. **Golden-set check**: `matchesGoldenAnswer(taskKind, labelValue,
   item.goldenAnswer)`. If `false` → status:
   `'rejected_golden_mismatch'`, rejectionReason:
   `'golden_set_mismatch'`. **No mesh credit, no escrow debit.**
4. Otherwise → status: `'accepted'`. Then `shouldSampleForReview`
   may flip to `'pending_sponsor_review'`. Either way the **mesh
   credit lands** (we don't punish good workers for being sampled).
   Sponsor can flip pending → rejected later via the reject route.
5. Item marked consumed in all paths.
6. Response carries `qcVerdict` (`'accepted' |
   'sampled_for_sponsor_review' | 'golden_set_mismatch'`) + the
   worker's updated `workerScore` so the FE renders honest
   feedback.

### Next-item dispatch — score gate

`GET /api/labeling-jobs/:jobId/next-item?workerId=…`:

If `job.qcMinWorkerScore > 0`, compute the worker's score on this
job's prev submissions. If below the gate, return:

```json
{
  "item": null,
  "reason": "below_worker_score_gate",
  "workerScore": 0.6,
  "gate": 0.9
}
```

FE renders this as a warning-toned card explaining "your score
on this job is below the sponsor's minimum" with honest numbers.

### Sponsor review endpoints (bearer-gated)

**List pending sample**:

```
GET /api/sponsors/:id/labeling-jobs/:jobId/submissions?status=pending_sponsor_review
```

Returns `{submissions: [{submissionId, itemId, taskKind, labelValue,
status, submittedAt, identityHash}]}`. **identityHash =
sha256(jobId::workerId)** — same rotating-per-job posture as the
Phase 9.1 federated-round export. Sponsor cannot cross-job
correlate.

**Reject** (claws back):

```
POST /api/sponsors/:id/labeling-jobs/:jobId/submissions/:subId/reject
Body: {reason: string >= 4 chars}
```

- Refuses (409 `not_pending_review`) if submission isn't in
  pending state — sponsor can't reject already-final submissions
- Refuses (400 `reason_required`) if reason is missing/short
- Flips submission to `rejected_sponsor_review` with the reason
- **Negative mesh-contribution event** for the worker with
  `payoutPaise: -job.perLabelPaise` and the labeling job +
  item refs
- **Sponsor escrow refunded** via `lockEscrow` (NOT `refundLockedEscrow`
  — the escrow was already DEBITED on submit; we're moving the
  paise back to the locked bucket where the next labeling
  submission can debit it again)
- Decrement `submissionsAccepted` + increment `submissionsRejected`
  + decrement `escrowDebitedPaise` on the job
- Emits `sponsor_escrow.refunded` ledger event
- Returns `{submission, clawedBackPaise}`

**Accept** (clears pending):

```
POST /api/sponsors/:id/labeling-jobs/:jobId/submissions/:subId/accept
```

Flips pending → accepted. No mesh / escrow changes (already
happened on submit).

### Mesh-contribution module — allow negative for labeling

`computePayoutPaise` for workload `labeling` now returns
`Math.round(Number(payoutPaise ?? 0))` instead of clamping at 0.
This lets clawback events flow through with negative payoutPaise.
Mesh-balance computation in `mesh-withdrawal.mjs` already does
`availablePaise += e.payoutPaise ?? 0` so negatives reduce balance
naturally.

**Honest disclosure**: if a worker's UPI-cashed-out earnings get
clawed back later, the balance goes negative momentarily — Bharat
OS doesn't pull money back from UPI; it claws it back from future
earnings. Same semantics as Uber driver chargebacks.

### Worker-facing stats endpoint

```
GET /api/identities/:id/labeling-stats
```

Returns:

```js
{
  identityId,
  overall: { submissionCount, score },
  perJob: [{ jobId, submissionCount, acceptedCount, pendingReviewCount, rejectedCount, score }]
}
```

Computes scores on-the-fly from `labeling_submissions`. No new
table needed. Fast: the existing `worker_id` index plus per-job
filtering.

### FE updates

`Labels.tsx`:

- **Overall worker-score card** at the top of the Labels page (shown
  only when worker has at least 1 submission): big "Your score:
  92%", tone-coded (trust ≥ 0.9, default ≥ 0.7, warning otherwise),
  badge "premium / good / needs review". Copy: *"≥ 90 % unlocks
  premium jobs (Phase 10.5 polish — coming)."*
- **Session view stat row** grows from 2 → 3 stats: Submitted /
  Accepted (with running score) / Earned.
- **Last verdict card** appears below the stats showing the
  sponsor's just-resolved decision: trust-tone "Accepted — paid
  to your mesh balance", warning-tone "Paid — sponsor may review
  this one", default-tone "Golden-set mismatch. No payout. Score
  may have dropped".
- **Score-gate card**: when `next-item` returns
  `reason: 'below_worker_score_gate'`, render a warning card with
  the honest numbers (worker score + gate threshold) + a `Back to
  jobs` action. Reads as adversarially-honest disclosure, not
  punishment.

`hooks.ts`:

- `SubmitLabelResponse` interface extended with `workerScore` +
  `qcVerdict`
- `useLabelingStats(identityId)` hook for the overall score card
- `NextItemResponse` interface with optional `workerScore` + `gate`

### seed-demo extension

The classification job's first item gains a `goldenAnswer:
{value: 'business_loan'}`. The classification job's QC config is
set to: `qcGoldenItemRateBps: 1000` (10% golden, descriptive),
`qcMinWorkerScore: 0.7`, `qcSponsorReviewRateBps: 2000` (20% review
sample — generous so demo hits sponsor-review path frequently).

`launchSeedJob` helper now passes `goldenAnswer` from each item's
declaration and forwards the three QC config fields to
`createLabelingJob`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Sponsor can't see raw worker identity in review queue | identityHash = sha256(jobId::workerId); rotates per-(job, worker) |
| Worker payouts honestly disclosed | qcVerdict returned on every submit + Labels page shows running score |
| Golden mismatch is no-payout, not negative-payout | Server emits no mesh event for `rejected_golden_mismatch` |
| Sponsor reject requires a reason | 400 `reason_required` (>= 4 chars) |
| Sponsor can't reject already-final submissions | 409 `not_pending_review` |
| Worker can't game the system | `goldenAnswer` stripped from next-item response — worker doesn't know which items are golden |
| Score gate is honest disclosure | Reason returned with workerScore + gate so FE shows real numbers |
| Clawback is auditable | `sponsor_escrow.refunded` + negative `mesh-contribution-event` ledger anchor it |
| Sponsor sample is deterministic | FNV-1a hash of submissionId → idempotent rerun verdict |
| Pending review still pays the worker | Sponsor can claw back, but the default posture is to trust the worker (cash-out works on pending balance) |
| Cross-job correlation prevented | identityHash rotation as above + per-item `goldenAnswer` never leaves the server |

## Tests

- **BE**: `tests/node/labeling-qc.test.mjs` — **16 new tests**:
  - 11 pure-helper tests: `computeWorkerScore` (2),
    `matchesGoldenAnswer` (5 task kinds), `shouldSampleForReview`
    (3 — determinism, rate spread, rate 0)
  - 5 HTTP tests: golden-set mismatch → rejected + no mesh, score-
    gate blocks dispatch, sponsor reject claws back mesh + escrow,
    sponsor accept clears pending without changes, stats endpoint
    returns overall + per-job
- **Full Node suite**: **854/854** (was 838; +16)
- **FE Vitest**: 16/16 unchanged
- **Bundle**: main 359 → **362 KB / 111 KB gzipped** (+1 KB
  gzipped for the stats hook + worker-score card + verdict
  surfacing). wllama lazy chunk unchanged at 292 KB / 126 KB
  gzipped. Build 1.48s.
- **seed-demo runs clean** with QC config on the classification
  job.

## Consequences

- **Labeling marketplace converges on quality.** Workers who
  submit random labels drop their score on a job and get gated
  from new items. Workers who do well accumulate a score >0.9 and
  in Phase 10.5 polish unlock premium jobs.
- **Sponsors get a reject lever without crushing workers.** The
  default posture is trust — workers get paid on submit. Sponsor
  has to actively reject a sampled submission AND give a reason.
  Default rates (5% review) mean most workers never hit the
  review pool.
- **Clawback is honest.** When a sponsor rejects, the worker's
  mesh ledger gets a negative event. Balance reflects reality.
  Honest disclosure beats hiding the chargeback.
- **Pattern reused for Phase 10.5 signed export** — the
  identityHash rotation already lives in the review-list endpoint;
  the signed-export route just needs to wrap it with sign + ndjson.
- **Phase 10 progress jumps from ~57% → ~75%.** Remaining: 10.5
  (signed export, ~1 wk) + 10.6 (SLM pre-labeling hint, ~1 wk) +
  10.4.1 polish (inter-annotator α, refund route, premium-job
  gating UI).

## What's NOT in this sub-phase

- **Inter-annotator α** (Krippendorff's α across multiple workers
  on the same item) — needs jobs configured for N≥2 submissions
  per item, which the seed-demo doesn't exercise at scale. Phase
  10.4.1 polish.
- **Premium-job gating in the UI** — the overall-score card hints
  at it but jobs aren't yet filterable by required score.
  Phase 10.5 polish.
- **Worker appeal of golden-set fail** — a wrong golden answer
  (sponsor error, ambiguous case) currently has no appeal path.
  Phase 10.4.1 polish or post-MVP.
- **Per-job worker suspension** beyond gating — sponsor can't
  blacklist a specific identityHash; once the gate is breached the
  worker has to improve their overall score elsewhere to climb
  back. Adequate for v1.
- **Refund route for job cancel** — `refundLockedEscrow` helper
  still pending (Phase 10.1.1 polish).
- **Worker-side "your last 7 days" trends** — single overall score
  + per-job breakdown only. Time-series view is post-MVP.

## Future polish

- Inter-annotator α (10.4.1)
- Premium-job filter in `<LabelingJobCard>` (10.5)
- Worker appeal flow with sponsor escalation (10.4.1 or post-MVP)
- Per-job worker suspension list (sponsor blacklists identityHash)
- Time-series score trend on the Labels page (Phase 8.x sparkline
  pattern)
- Job cancel + refund route (10.1.1)
- Score-driven dynamic per-label pricing (premium workers earn
  more)
- Anti-fraud signals: detect rapid-fire submissions or bot-like
  timing
