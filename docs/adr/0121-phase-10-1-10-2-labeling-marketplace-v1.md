# ADR 0121: Phase 10.1 + 10.2 — Labeling Marketplace v1 (BE substrate + Worker /app/labels/ surface)

## Status

**Accepted — shipped 2026-05-31.** First slice of the Phase 10
labeling marketplace (ADR 0110 Proposed). 10.0 (sponsor schema)
was already done implicitly via Phase 9.1's sponsor module. This
ADR covers 10.1 (BE substrate + draft/upload/launch/discover/submit
lifecycle + sponsor escrow integration) and 10.2 (worker
`/app/labels/` tab with preference-pair task UI). 10.3 (other task
kinds), 10.4 (QC pipeline), 10.5 (signed export), 10.6 (SLM pre-
labeling hint) ship in follow-ups.

## Context

ADR 0110 sketched the labeling marketplace as Bharat OS's strongest
non-investor revenue lever: Indic-language RLHF labels are a real
priced market (Scale AI valuation ~$13.8B; Surge / Labelbox / Toloka
/ iMerit each >$100M ARR). Sponsors (LLM trainers + Indic
foundation-model startups) pay per accepted label. Bharat OS wins
on Indic coverage, DPDP-compliant provenance, and the UPI rail
(no FX cost, T+1 vs Scale's 30-60 day).

Phase 9.1 shipped the sponsor model + escrow + bearer-token auth.
**Phase 10.1 reuses those directly** — a labeling job is another
sponsor-funded resource on the sponsor's lane, just like a
sponsored federated round. The sponsor module + auth middleware +
`publicSponsorDirectory` need zero changes here.

## Decision

### Module (`src/phase1/labeling-job.mjs`)

Pure validation + helpers. Exports:

- `LABELING_TASK_KINDS` — 5 v1 kinds: `preference_pair`,
  `classification`, `span_annotation`, `transcription`,
  `safety_label`
- `LABELING_MODALITIES` — `text` / `voice` / `image`
- `LABELING_JOB_STATUSES` — 6-state lifecycle:
  `draft → funded → active → paused → complete | cancelled`
- `createLabelingJob(input)` — validates a draft job (status:
  draft; escrow not yet locked)
- `createLabelingJobItem({jobId, taskKind, body, goldenAnswer?})`
  — uploaded corpus item; `goldenAnswer` reserved for Phase 10.4
  QC, kept opaque otherwise
- `createLabelingSubmission({jobId, itemId, workerId, taskKind, labelValue})`
  — worker submission; v1 defaults to `status: 'accepted'`
- `workerCanClaim(job, item, prevSubmissions)` — eligibility check
  used by both FE (pre-flight) and BE (enforcement)
- `totalLaunchCostPaise(job)` — `itemCount × (perLabelPaise + bharatOsFeePaise)`

Job record shape:

```js
{
  jobId: 'bos:labeling-job:<32-hex>',
  protocolVersion: 'bos.phase10.labeling-job.v0',
  objectType: 'labeling-job',
  sponsorId, taskKind, language, modality,
  perLabelPaise, bharatOsFeePaise, itemCount,
  ipTerms: 'non_exclusive' | 'exclusive' | 'cc_by_4_0',
  consentPurposeCode, description,
  status, createdAt, deadlineAt,
  launchedAt: null | iso,
  completedAt: null | iso,
  cancelledAt: null | iso,
  submissionsAccepted: 0,
  submissionsRejected: 0,
  escrowLockedPaise: 0,
  escrowDebitedPaise: 0,
  itemsUploaded: 0
}
```

Validation guards:
- `itemCount` ≤ 1,000,000 (sanity bound)
- `perLabelPaise` must be positive integer
- Language is required (free-form 16-char tag)
- `consentPurposeCode` required and trimmed to 120 chars
- `taskKind` and `modality` must be in their enum

### Storage

Three new tables / directories on both backends:

- `labeling_jobs` (`job_id PK`, `sponsor_id` indexed) — emits
  `labeling_job.saved` ledger events
- `labeling_job_items` (`item_id PK`, `job_id` indexed)
- `labeling_submissions` (`submission_id PK`, `job_id`, `worker_id`,
  `item_id` indexed) — emits `labeling_submission.accepted` /
  `.rejected` ledger events

**DPDP §12(3) cascade**: `labeling_submissions` go through the
existing eraseUserData sweep (file-store + sqlite-store), filtered
by `worker_id`. Jobs and items are sponsor-owned and stay — they
do not reference the worker except via submission rows.

### `'labeling'` workload type on mesh-contribution

`MESH_WORKLOAD_TYPES` extended to include `labeling` (alongside
the Phase 9.0d `federated_round`). `computePayoutPaise` for
`labeling` reads explicit `payoutPaise` (set by the job).
`createMeshContributionEvent` now accepts optional `jobId` +
`itemId` fields, populated only for `workloadType: 'labeling'`.
`bytes` is null for labeling events (it's a per-label workload, not
a byte-measured one).

### API routes

**Sponsor-bearer-gated** (admin + sponsor auth as Phase 9.1):

- `POST /api/sponsors/:id/labeling-jobs` — create draft
- `GET /api/sponsors/:id/labeling-jobs` — list own
- `POST /api/sponsors/:id/labeling-jobs/:jobId/items` — upload
  corpus; body `{items: [{body, goldenAnswer?}, ...]}`. Refuses
  if `job.status !== 'draft'` (409 `job_not_draft`) or
  `itemsUploaded + len > itemCount` (400 `exceeds_item_count`).
- `POST /api/sponsors/:id/labeling-jobs/:jobId/launch` — flip
  draft → active. Refuses if `job.status !== 'draft'` (409),
  `itemsUploaded < itemCount` (400 `items_incomplete`), or
  escrow under-funded (402 `insufficient_escrow` with
  `requiredPaise` + `availablePaise` for client UX). On success
  locks escrow + emits `sponsor_escrow.locked` ledger event.

**Public** (worker discovery, no auth):

- `GET /api/labeling-jobs?language=hi&taskKind=preference_pair`
  — active jobs filtered by query params; **strips sensitive
  sponsor-only fields** before responding (no escrow numbers in
  the worker surface; sponsor name resolved via the public
  directory endpoint from Phase 9.1).

**Worker-anchored** (no auth — workerId in query / body; future
polish wires session auth):

- `GET /api/labeling-jobs/:jobId/next-item?workerId=…` — dispatch
  the next eligible item; **strips goldenAnswer** before returning
  (server keeps it for the QC pipeline)
- `POST /api/labeling-jobs/:jobId/submissions` — `{itemId, workerId,
  labelValue}`. Server enforces `workerCanClaim`, refuses with 409
  `cannot_claim` on duplicate. On accept:
  - Creates labeling-submission row (status: accepted in v1)
  - Bumps `job.submissionsAccepted` + `job.escrowDebitedPaise`
  - Marks item `consumed: true`
  - Debits sponsor escrow via `debitLockedEscrow` (same posture as
    Phase 9.0d federated round: failure logs warning + continues
    so worker payout never held hostage to sponsor accounting)
  - Records `mesh-contribution-event` with `workloadType: 'labeling'`,
    `payoutPaise: job.perLabelPaise`, `jobId`, `itemId`
  - Returns the submission + the mesh event

### `/app/labels/` worker surface (Phase 10.2)

**New tab on the Worker bottom nav** (5 tabs now: Earn / **Labels** /
Trust / Labs / Settings). Bottom-nav on mobile handles 5 tabs cleanly
via the existing responsive `<Tabs>` component.

`frontend/src/routes/Labels.tsx`:

- **Job list view** (default): hero header + per-job `<LabelingJobCard>`
  showing description / task-kind / language badges, **"Sponsored
  by X" governance badge** (resolved via `useSponsorDirectory`),
  remaining-items count, per-label `<Money>`, [Start labeling]
  action (disabled when remainingItems ≤ 0)
- **Session view** (activated by [Start labeling]): top status row
  with [✕ Close], two-stat header (Submitted count + Earned-this-
  session via `<Money>`), task-specific renderer
- **`<PreferencePairTask>`** — only task kind shipped in v1:
  - Prompt card (if `body.prompt` present)
  - Two big A/B buttons stacked on mobile, side-by-side on desktop
  - Hover/focus tinted trust-green
  - [Skip this item] ghost action
- Other task kinds render an honest "not supported in /app/ v1"
  card directing users to /shell/ or Phase 10.3

**New hooks** in `lib/hooks.ts`:
- `useLabelingJobs(language?)` — public listing
- `useLabelingNextItem(jobId, workerId)` — dispatch hook
  (`staleTime: 0` because next-item changes constantly)
- `useSubmitLabel()` — mutation; on success invalidates
  `labeling-next-item`, `labeling-jobs`, `mesh-balance`, and
  `mesh-summary` for the worker so Earn tab updates next nav

### App.tsx + routes change

```diff
+ <Route path="/labels" element={<ProtectedSurface><LabelsPage /></ProtectedSurface>} />
```

Worker tab bar gains a Labels entry between Earn and Trust:
`['Earn', 'Labels', 'Trust', 'Labs', 'Settings']`. Citizen tabs
unchanged (citizens don't label).

### seed-demo.mjs extension

- Adds 5 Hindi-language preference-pair items to a brand-new
  labeling job under the existing Pragati Microfinance sponsor
- Job description: *"Pick the more helpful loan-application
  explanation (Hindi)."*
- Items mix English + Devanagari to demonstrate realistic Indic
  RLHF content
- Job is launched on seed (status: active) with escrow locked
  (5 × ₹4 = ₹20)
- /app/labels/ shows the job on fresh seed

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Per-job consent grants required | `consentPurposeCode` is mandatory + free-form; FE surfaces it implicitly through the job description. Future polish wires explicit Phase 1.27 remediation-grant flow |
| Sponsor never sees raw identity | `next-item` and `submissions` endpoints accept `workerId` but never expose it to sponsor surfaces; sponsor export bundle (Phase 10.5) will use rotating `identityHash` like the Phase 9.1 federated-round export |
| Worker can withdraw mid-job | Worker simply stops submitting; in-flight item dispatch returns null when the worker has no eligible items left. Future Phase 10.4 polish adds explicit revoke that flips already-submitted labels to `consent_status: revoked_after_submission` |
| Labels never used to identify worker | Submission row carries `workerId` for the mesh-event credit; the public worker surface never returns other workers' submission rows |
| Worker can claim only once per item | `workerCanClaim` enforces it client-side and server-side. 409 `cannot_claim` on retry |
| Audit ledger anchors every label | `labeling_submission.accepted` / `.rejected` + `sponsor_escrow.debited` / `mesh_contribution_event.saved` cover the full money trail |
| Sponsor cannot mass-target workers | Job feed surfaces to all eligible workers; sponsor cannot pin specific identities. Caps social-engineering / coercion vectors |
| Worker payouts not held hostage | Escrow debit failure logs a warning + continues; worker mesh credit lands regardless |
| Golden answers stripped | `next-item` removes `goldenAnswer` before responding so workers can't game the QC |
| Sponsor-side fields stripped on public surface | `/api/labeling-jobs` strips `escrowLockedPaise` / `escrowDebitedPaise` / `consentPurposeCode` from the worker view |
| Items uploaded only in draft | Status enforcement (409 `job_not_draft`) — sponsor can't sneak items into an active job mid-run |
| DPDP §12(3) cascade total | Both backends sweep `labeling_submissions` by `worker_id`. Jobs and items are sponsor-owned and stay |

## Tests

- **BE**: `tests/node/labeling-job.test.mjs` — **17 new tests**:
  - Module constants (2)
  - `createLabelingJob` happy + reject unsupported taskKind +
    reject non-positive payout (3)
  - `totalLaunchCostPaise` arithmetic (1)
  - `createLabelingJobItem` requires body (1)
  - `createLabelingSubmission` rejected requires reason (1)
  - `workerCanClaim` three cases (3)
  - SqliteStore + BosStore round-trips (2)
  - DPDP §12(3) cascade on submission rows (1)
  - HTTP end-to-end lifecycle (3): full draft→items→launch→
    discover→next-item→submit; launch refuses when items
    incomplete; worker cannot resubmit for the same item
- **Mesh-contribution test patch**: `MESH_WORKLOAD_TYPES` set
  expectation updated to include `labeling`
- **Full Node suite**: **838/838** (was 821; +17 labeling, +0 net
  from the mesh patch)
- **FE Vitest**: 16/16 unchanged
- **Bundle**: main 352 KB / **109 KB gzipped** (+2 KB vs 9.1
  for the Labels route, hooks, and preference-pair task UI).
  wllama lazy chunk unchanged at 292 KB / 126 KB gzipped.
- **Build**: 1.38s

## Consequences

- **Sponsor-paying-worker loop closes for labeling.** Sponsor
  funds escrow → drafts a job → uploads corpus → launches
  (escrow locks for `itemCount × perLabel`) → workers
  discover → submit labels → server accepts + debits escrow +
  credits worker mesh + records ledger events. The full Bharat
  OS rail (UPI cash-out via Phase 8.3) drains the worker's mesh
  balance to their UPI ID.
- **First user-visible non-investor revenue moment.** Workers
  can earn paise per label TODAY. The Phi-3-mini SLM round (9.0d)
  also earns paise but workers need the SLM installed; labeling
  has near-zero install friction.
- **Pattern proven for other sponsor-funded resources.** Whatever
  Phase 12+ brings (e.g., curation tasks, dataset annotation,
  RLHF preference collection at scale), the sponsor-escrow-job
  shape is now the template.
- **`/app/labels/` is the second user-facing earning surface.**
  Earn tab + Labels tab both flow into the same mesh ledger;
  workers can mix inference, federated rounds, and labeling
  payouts in one cash-out.
- **5 tabs on the worker bottom-nav.** Acceptable on mobile;
  many apps do this. If it becomes crowded, a future ship can
  collapse Labs into Settings as "Advanced" or group as "More."

## What's NOT in this sub-phase

- **Other task kinds** — only `preference_pair` shipped in v1
  FE. `classification` (span + multi-choice category),
  `span_annotation` (tap-to-highlight text or audio waveform),
  `transcription` (voice + Indic ASR pre-fill), `safety_label`
  all ship in Phase 10.3
- **QC pipeline** — Phase 10.4. v1 server accepts every
  submission. Golden-set, inter-annotator α, sponsor-sample
  reject queue all queued for that ship
- **Signed JSONL export bundle for sponsor** — Phase 10.5.
  Reuses the Phase 9.1 federated-round export pattern (rotating
  identity hash; gradient-hash only). Sponsor compliance can use
  the in-memory NDJSON of accepted submissions today via the
  existing ledger queries, but no signed bundle yet
- **SLM pre-labeling hint** — Phase 10.6. Depends on Phase 9.0c
  runtime + a task-kind-specific prompt template
- **Refund on round close / cancel** — `refundLockedEscrow`
  helper exists from Phase 9.1; needs a `POST
  /api/sponsors/:id/labeling-jobs/:jobId/cancel` route that
  refunds the unused lock. Tracked as 10.1.1 polish
- **Per-pack chat-template-aware preference pairs** — sponsors
  could declare a template per item; today the FE renders the
  raw `body.prompt / a / b` strings
- **Worker eligibility filters** — v1 surfaces all active jobs
  to all workers (modulo language query). Phase 10.4 adds
  worker-score gating (agreement-score ≥ 0.9 unlocks premium
  jobs)
- **Sponsor analytics** — "your last job had 67% accept rate" /
  per-job dashboards are post-MVP

## Future polish

- **Phase 10.3 task kinds**: classification (with `categoryList`
  on job), span_annotation (with `textBody` and selection
  recording), transcription (with audio clip URL + ASR pre-fill),
  safety_label (multi-checkbox)
- **Phase 10.4 QC pipeline**: golden-set rate config per job
  (default 1-in-20), inter-annotator α threshold for accept,
  sponsor-sample queue with reject API
- **Phase 10.5 signed export**: NDJSON identical to federated-
  round export shape; per-(jobId, workerId) identity-hash
  rotation
- **Phase 10.6 SLM pre-label hint**: button on the task UI that
  loads the worker's installed Phi-3-mini → suggests a label →
  worker accepts/edits → submits. Cuts time-per-label ~3×
- **Phase 1.27 consent-grant flow** explicitly on Start labeling
- **Per-worker agreement score** surfaced on Profile tab
- **Sponsor self-serve portal** with job dashboards + per-task
  acceptance distribution
- **Saved drafts** — worker can pause mid-session and resume
- **Voice / OCR labeling tasks** wired to the Phase 2a.5/2a.8
  substrate
