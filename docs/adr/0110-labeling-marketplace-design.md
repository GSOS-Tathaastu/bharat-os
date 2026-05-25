# ADR 0110: Phase 10 — Labeling Marketplace (Sponsor-paid, Worker-executed, DPDP-Audited Indic-language Data Labels)

## Status

**Proposed.** Design captured for review; implementation not yet
greenlit. Distinct from the Phase 8.x shell-UI arc and the Phase
9.0 SLM runtime (ADR 0107). The strongest near-term monetisation
lever surfaced in the 2026-05-25 strategy thread — leverages
already-shipped substrate (DPDP consent, signed ledger, UPI cash-
out, vernacular voice/OCR, mesh attestation) and slots Bharat OS
into a real priced market (Scale AI / Surge AI / Labelbox /
Toloka — ~$15B+ TAM, ~₹400–800/hr English RLHF, 2–3× for Indic).

## Context

The federated-rounds substrate (Phase 3.x / 7f) produces *gradient
updates* on labels the user already has — it does not produce
*new labels for sponsors to buy*. The §13A trust-attestation flow
(Phase 1.41 worker-authorization receipts) does produce signed
truth-claims, but is scoped to worker→worker authorization, not
general-purpose data labels.

For a sponsor (LLM trainer / dataset broker / vertical AI co.) to
pay Bharat OS for labels, we need four things:

1. **A way for sponsors to describe a labeling job** — spec, golden
   set, per-label price, IP terms, deadline.
2. **A way for workers to discover and execute labeling tasks** —
   vernacular UI, voice-first input, on-device pre-labeling via the
   installed SLM (Phase 9.0), audit trail.
3. **A QC pipeline** — golden-set agreement, inter-annotator κ,
   sponsor review, dispute resolution.
4. **A payout + sponsor-audit substrate** — escrow at sponsor side,
   per-label paise on worker side, DPDP-compliant provenance bundle
   for the sponsor to satisfy their own compliance.

Bharat OS has ~70% of #4 already (Phase 6.1b UPI cash-out + Phase
1.5 audit ledger + Phase 1.18 signed Trust Passport snapshots) and
~50% of #2 (Phase 2a.5/2a.6 voice runtime, Phase 2a.8 OCR, Phase
9.0 SLM when shipped). Phase 10 builds #1 and #3 from scratch and
wires them into existing surfaces.

## Strategic positioning (vs Scale / Surge / Labelbox)

| Lever | Scale / Surge | Bharat OS Phase 10 |
|---|---|---|
| Indic-language coverage | English-first; Indic supply is thin and expensive | Native — Bhojpuri / Marathi / Tamil / Bengali workers already on the platform |
| Auditability | Per-Kenyan-contractor-scandal recurring; sponsor accepts opaque |  Signed ledger + Trust Passport bundle per label; DPDP-compliant out-of-the-box |
| Worker payout | Bank transfer in USD; 30–60 day delay; FX cost | UPI in INR; T+1; existing mesh-withdrawal rail |
| Input modality | Keyboard-text-on-browser only | Voice-first via Phase 2a.5; OCR via Phase 2a.8; SLM-assisted pre-label via Phase 9.0 |
| Consent posture | Click-through TOS | DPDP §6 explicit purpose-binding per task; worker can revoke |
| Provenance | "Trust us" | Signed receipt per label citing identity, task, golden-set agreement, timestamp |

## Decision

### Four components

**1. Sponsor API + admin onboarding.**

```
POST   /api/sponsors                       # admin-gated (§5.7)
POST   /api/sponsors/:id/labeling-jobs     # sponsor-auth bearer
GET    /api/sponsors/:id/labeling-jobs/:jobId
POST   /api/sponsors/:id/labeling-jobs/:jobId/items   # upload corpus
POST   /api/sponsors/:id/labeling-jobs/:jobId/launch  # escrow funded → live
GET    /api/sponsors/:id/labeling-jobs/:jobId/exports # signed result bundle
```

Job spec shape:

```js
{
  jobId: 'lj_2026_05_25_phi3_indic_rlhf',
  sponsorId: 'spn_anthropic',
  taskKind: 'preference_pair' | 'classification' | 'span_annotation' |
            'instruction_following' | 'safety_label' | 'transcription',
  language: 'bn' | 'mr' | 'bho' | 'ta' | 'hi' | 'en',
  modality: 'text' | 'voice' | 'image',
  perLabelPaise: 4000,           // ₹40 per label to the worker
  bharatOsFeePaise: 1000,        // ₹10 platform fee (escrow source)
  goldenSet: [ /* spec'd answer keys for QC */ ],
  itemCount: 10_000,
  deadline: '2026-06-25T23:59:59Z',
  ipTerms: 'exclusive' | 'non_exclusive' | 'cc_by_4_0',
  consentPurposeCode: 'bos:consent:purpose:labeling.preference_pair'
}
```

**2. Worker labeling surface (`src/phase1/labeling-tasks.mjs` + shell tab).**

New `#labelingTaskSection` card under a new top-level tab — **🏷️ Label**
— between the existing **🤖 Talk** and **💼 Earn** tabs. Card shows:

- **Task feed**: discovered jobs filtered by worker's languages
  (from Phase 1.37 vernacular profile), device capabilities, and
  current §6 consent grants.
- **Per-task headline** ("Phi-3 Indic RLHF preference pair · Bengali
  · ₹40 each · 10 minutes per item · sponsor: Anthropic").
- **One-tap consent gate** — Phase 1.27 remediation pattern, signed
  consent grant binds the worker to this job's `consentPurposeCode`.
- **Task UI** — modality-specific:
  - `preference_pair`: two SLM-generated responses, worker picks
    better + voice-rationale (optional).
  - `classification`: span + multi-choice category dropdown.
  - `span_annotation`: tap-to-highlight on text or audio waveform.
  - `transcription`: voice clip + Indic ASR pre-fill (Phase 2a.5) +
    edit-to-correct.
- **SLM pre-labeling (Phase 9.0 dependency)**: when the installed
  SLM can produce a candidate label, show it as a suggestion the
  worker accepts/edits. Cuts time-per-label ~3×; sponsor still
  pays full rate because the human signed the verdict.
- **Submit** → signed `labeling_receipt` row + per-label paise into
  the worker's `mesh_events` ledger (reusing Phase 6.0a / 6.1b).

**3. QC pipeline (`src/phase1/labeling-qc.mjs`).**

Three layers:

| Layer | Mechanism | Trigger | Action on fail |
|---|---|---|---|
| **Golden-set** | Every Nth item (configurable per job, default 1-in-20) is from `goldenSet` with known answer | Worker submits | If 3-of-last-10 wrong, suspend worker from job + flag for re-training |
| **Inter-annotator agreement** | Each item labeled by ≥2 workers (job-config); Krippendorff's α computed | After Mth label per item | If α < threshold, route to sponsor adjudication queue |
| **Sponsor review** | Sample (job-config, default 5%) routed to sponsor's reviewers via export API | Async | Sponsor can reject — worker payout clawed back from escrow; ledger event records the dispute |

Workers see their `agreement_score` on the Profile tab (Phase 8.x
pattern). Above 0.9 unlocks premium jobs; below 0.7 hides
sensitive jobs. Honest UI — no hidden scoring.

**4. Sponsor export + DPDP-compliant audit bundle.**

```
GET /api/sponsors/:id/labeling-jobs/:jobId/exports?format=signed_jsonl
```

Returns a signed JSONL bundle with one record per accepted label:

```js
{
  labelId: 'lbl_…',
  itemId: 'itm_…',
  labelValue: { /* sponsor-spec format */ },
  workerEvidence: {
    identityHash: 'sha256:…',       // not the raw identityId
    consentReceiptHash: 'sha256:…', // points to §1.3 receipt
    agreementScore: 0.94,
    timestampUtc: '…',
    languageProfile: ['bn', 'hi']
  },
  qcEvidence: {
    goldenSetAgreement: 0.97,
    interAnnotatorAlpha: 0.88,
    sponsorReviewStatus: 'accepted' | 'sampled_pending' | 'not_sampled'
  },
  ledgerEventHash: 'sha256:…'       // audit ledger anchor
}
```

The bundle is signed by Bharat OS's release key — sponsor verifies
once, then can prove provenance to their own auditors / regulators
without re-asking Bharat OS.

### Storage

New SqliteStore tables:

- `sponsors` — registered sponsor orgs (admin-onboarded), bearer
  token hash, escrow account ref.
- `labeling_jobs` — job specs + state (`draft` / `funded` /
  `active` / `paused` / `complete` / `cancelled`).
- `labeling_job_items` — uploaded corpus items, pointer-not-payload
  (item content stored in a sponsor-side bucket OR encrypted with
  Bharat OS holding pointer, per job's data-residency choice).
- `labeling_submissions` — one row per worker submission, links
  itemId × identityId × labelValue × qc results.
- `labeling_golden_set` — per-job golden items + correct answers,
  served interleaved.
- `sponsor_payouts` — escrow drawdowns to Bharat OS treasury (the
  fee) and to workers (per-label) — replicates Phase 6.1b
  mesh-withdrawal state machine but sponsor-funded.

All cascade-deleted per §12(3) when the identity is erased — the
worker's submissions become "labeled by anonymous Bharat OS
worker [identityHash]" in the sponsor's already-exported bundle;
new exports omit the row.

### Wire-up to existing systems

- **Phase 1.5 audit ledger** — every job lifecycle event + every
  label submission emits a signed ledger event.
- **Phase 1.27 consent remediation** — opt-in to a job uses the
  same remediation-grant flow we already use for skill
  preflights. No new consent-UI pattern.
- **Phase 6.1b mesh-withdrawal** — labeling payouts flow into the
  same `mesh_events` ledger as inference/storage/serve. The Phase
  8.3 cash-out UI already drains them to UPI.
- **Phase 2a.5/2a.6 voice runtime** — transcription and voice-
  rationale tasks reuse the installed Indic ASR / TTS packs.
- **Phase 9.0 SLM** — pre-labeling suggestions come from the
  installed SLM. **Phase 10 is technically launchable without
  Phase 9.0** (worker just labels from scratch), but per-label
  throughput is ~3× lower without it. Recommend sequencing
  Phase 10.0–10.2 in parallel with Phase 9.0, then Phase 10.3
  (SLM pre-label hint) after 9.0 lands.
- **Phase 1.18 Trust Passport** — sponsor-verified labels feed
  into the worker's Trust Passport `labeling` block: cumulative
  `acceptedLabelCount`, `meanAgreementScore`, `languagesScored`.
  This is the same surface MFIs read for income verification —
  labeling becomes a verifiable income line.

### Sub-phase breakdown

| Sub-phase | Scope | Estimated effort |
|---|---|---|
| **10.0** | Sponsor model + admin onboarding + escrow ledger table | ~1 week |
| **10.1** | Job spec API + corpus upload + launch transition | ~1 week |
| **10.2** | Worker discovery API + shell **🏷️ Label** tab + consent gate | ~1.5 weeks |
| **10.3** | Per-task-kind UIs (preference pair → classification → span → transcription) | ~2 weeks |
| **10.4** | QC pipeline (golden-set + inter-annotator α + sponsor sample) | ~2 weeks |
| **10.5** | Signed export bundle + sponsor consumption tooling | ~1 week |
| **10.6** | SLM pre-labeling hint (depends on Phase 9.0) | ~1 week |

Total: ~9-10 weeks. Comparable to Phase 9.0 in size.

## §15 bindings (forward — to be preserved when implemented)

| Binding | Resolution |
|---|---|
| Worker consent per job | Phase 1.27 remediation flow — explicit signed grant binding the worker's identity to the job's `consentPurposeCode`. No "agreed to TOS once, label forever." |
| Sponsor never sees raw identity | Exports carry `identityHash` only. To complain about a specific worker's labels the sponsor passes the hash back through Bharat OS, who can apply the dispute internally. |
| Worker can withdraw mid-job | Revoking the consent grant withdraws the worker from new items in the job. Already-submitted labels stay in the export (the worker was paid for them) but bear a `consent_status: revoked_after_submission` marker. |
| Labels never used to identify the worker | Sponsor-side correlation across jobs is mitigated by rotating `identityHash` per `(identityId, jobId)` — Phase 1.16 memory-id derivation pattern. |
| Golden-set answers themselves are PII-free | Sponsor warrants in job-spec that the corpus + golden answers contain no PII — Bharat OS does not validate corpus content. Sponsor liability if violated. |
| Audit ledger anchors every label | One `bos:labeling.submitted` event per submission with hashes of (item, label, consent receipt). Ledger is queryable per identity for the worker's own review. |
| Sponsor cannot mass-target workers | Job feed surfaces jobs to all eligible workers; sponsor cannot pin "I want labels from these specific identities." Caps social-engineering / coercion vectors. |
| Payout failure refunds the events | Phase 6.1b refund-on-failed semantics extend to labeling — if a worker's labels are rejected by sponsor sample, the events return to the worker's available balance and the sponsor's escrow is debited; honest, not extractive. |

## Tests (when implemented)

- **Sponsor admin onboarding** — bearer-token rotation, scope
  enforcement, ledger event coverage.
- **Job lifecycle** — `draft → funded → active → complete` state
  machine, including illegal transitions.
- **Worker eligibility** — filter by language, consent, agreement
  score; honest UI showing why a job was filtered out.
- **Per-task-kind submission** — one canonical test per task kind
  with a known-good label + a known-bad label (rejected by golden
  set).
- **QC pipeline** — golden-set 3-of-10-fail suspension; α threshold
  routing to sponsor; sponsor reject → payout clawback.
- **Export bundle** — signed JSONL verifies against release key;
  identity hash rotation across jobs.
- **DPDP §12(3) cascade** — identity erase removes
  `labeling_submissions` rows; existing exported bundle is
  unaffected (sponsor already received it); new exports omit.
- **Integration with Phase 6.1b** — labeling payouts appear in
  `/mesh/balance`; cash-out drains them.
- **Integration with Phase 1.18** — Trust Passport `labeling`
  block reflects accepted-label count + mean agreement score.

Estimated test surface: ~60 new tests. Estimated test count
after Phase 10: 810-830.

## Consequences

- **First-class monetisation pitch.** "Indic-language RLHF labels
  with DPDP-compliant provenance, paid in UPI" — a real product
  for a priced market that Anthropic / OpenAI / Meta / Bharat-foundation-
  model startups all want and currently get poorly.
- **Workers earn faster than via mesh-contribution.** A ₹40-per-
  label preference pair at 6/min = ₹240/hour gross. Beats the
  ₹0.16/M-token inference rate as a near-term worker hook.
- **Sponsor-funded escrow validates the §13B fair-use lever.** For
  the first time, money flows IN to Bharat OS from a third party
  (not just OUT to workers). The platform fee (`bharatOsFeePaise`)
  becomes the first non-investor revenue line.
- **Phase 9.0 SLM gets a clear ROI story.** SLM pre-labeling
  triples worker throughput → sponsor pays more → workers buy
  larger SLM packs → flywheel.
- **Operational complexity step-up.** Sponsor onboarding, escrow,
  IP terms, dispute resolution — these are legal/ops surfaces
  Bharat OS hasn't dealt with before. Should not be greenlit
  without a basic legal-ops capability (Master Services
  Agreement template, escrow bank partner, dispute SLA).

## Sequencing

Phase 10 sub-phases interleave naturally with the rest of the
roadmap:

1. **Finish Phase 8 shell arc first** (8.4 push opt-in next). Earn
   tab and Trust tab must be demoable end-to-end before adding a
   third revenue surface.
2. **Phase 9.0 SLM runtime** — start in parallel with Phase 10.0.
3. **Phase 10.0–10.2** can ship without Phase 9.0 (workers label
   from scratch; lower throughput but launchable).
4. **Phase 10.3 SLM pre-label hint** ships after both Phase 9.0
   and Phase 10.2.
5. **Phase 10.4–10.5 QC + export** harden before any commercial
   pilot.

## Future polish (after MVP)

- **Cross-lingual alignment jobs** — sponsor wants the same
  preference pair labeled in 5 languages by 5 different workers,
  composed into a single multilingual training row. Higher unit
  price; uses Phase 1.37 vernacular profile to fan out.
- **Marketplace pricing engine** — dynamic per-label price based
  on supply (active workers in language × agreement score) and
  demand (job deadline + sponsor priority).
- **Reputation-weighted payouts** — workers above 0.95 agreement
  get a premium; below 0.7 get a calibration penalty.
- **On-device label preview before submit** — Phase 9.0 SLM
  inspects the worker's proposed label and warns "this looks
  inconsistent with item context" before the worker submits.
- **Sponsor self-service** — eventually let small sponsors sign
  up via portal instead of admin-only onboarding.
- **Federated-trained label models** — every accepted label is a
  training row; over time, Bharat OS can offer "labels-as-a-
  service via an SLM fine-tuned on your prior jobs."
