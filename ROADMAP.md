# Bharat OS Roadmap

Last updated: **2026-05-27**

This is the forward-looking artifact. For the full ADR log, see
`docs/adr/`. For the historical closed-phase log, see
`BHARAT_OS.md` §17.

---

## ✅ Done & shipped

Major milestones from Phase 0 through Phase 9.0b — the substrate
plus the first half of the on-device-SLM arc.

### Phase 0 — Protocol foundation
- Identity records + root keys, signed protocol messages, encrypted
  chunk manifests, mesh placement simulator with KYC/WiFi/charging
  constraints, control-plane model, contribution accounting,
  deterministic 1,000-node bootstrap simulation.

### Phase 1 — Tie-off bundle (Phase 1.1 → 1.43)
- L1–L8 stack: policy/consent/decision engine, IndiaStack adapter
  mocks, intent orchestration, signed consent receipts, consent
  lifecycle, audit ledger, identity-anchored memory, Trust Passport
  v1, vernacular intent normalization (Hindi / Marathi / Bhojpuri /
  Tamil / Bengali), L6 skill registry + signed preflights, L7
  orchestration binding to L6 manifests, L8 vernacular response
  rendering, §9A worker-protection policies, §9B native marketplace,
  Net Contribution Score, signed worker-authorization receipts.

### Phase 2a — PWA shell (Phase 2a.4 → 2a.26)
- Vernacular worker shell, device-claim model, first-run wizard,
  worker-alerts scaffold, Indic voice runtime stub, Indic TTS
  runtime stub, real Tesseract.js OCR for health docs, Phase 2a.25
  UX overhaul (de-jargoned copy), Phase 2a.26 reset-device flow.

### Phase 3 — Federated learning
- Federated round substrate, on-device 216-param intent classifier
  (multinomial logistic regression), gradient composition with
  FedAvg + DP-SGD privacy budget.

### Phase 4 — DPDP rights + operations
- §12(3) right-to-erasure cascade across both backends; phone OTP
  / SMS provider with circuit-breaker; first-run onboarding;
  vernacular UI string translation.

### Phase 5 — Operations layer
- Audit ledger queryable + NDJSON export; integrity verification;
  backup snapshots + retention; Phase 5.2 SIM-swap cooldown; Phase
  5.7 admin-token-gated ops endpoints (`BHARAT_OS_ADMIN_TOKEN`);
  Phase 5.8 SMS bulkhead; Phase 5.9 QR portable attestation.

### Phase 6 — Worker monetisation substrate
- 6.0a earnings tracker API; 6.0b mesh contribution dashboard API;
  6.0c tax helper API; 6.1 MFI income-verification consent bundle;
  6.1b UPI cash-out with refund-on-failed semantics; 6.2 worker-
  collective membership + blessed-collectives registry; 6.3 e-Shram
  UAN registration + welfare scheme entitlement substrate.

### Phase 7 — Web Push end-to-end
- From-scratch VAPID (RFC 8292), Web Push (RFC 8030), payload
  encryption AES-128-GCM (RFC 8291), ES256 JOSE signing. 7.0 VAPID
  scaffold; 7.1 push for SIM-swap recovery + mesh-withdrawal
  terminal transitions; 7.2 §9A worker-notification delivery; 7.3
  retry-on-429/5xx + `bos_push_send_total{vendor, outcome}` metrics.

### Phase 8 — Shell UI arc (CLOSED)
- 8.0 earnings tracker UI; 8.1 mesh-contribution dashboard UI; 8.2
  MFI consent issuance UI; 8.3 UPI cash-out UI; 8.4 push opt-in UI
  (activates Phase 7.x delivery end-to-end). Earn tab story
  complete: real-time ticker → monthly retrospective → cash-out →
  manual log → federated rounds.

### Phase 9.0 — Tier-4 SLM (~30% done)
- **9.0a** SLM model-pack registry (admin-curated metadata + public
  read + compatibility filter + ledger evidence).
- **9.0b** Per-identity install records + DPDP §12(3) cascade +
  shell install card (stream-fetch + SHA-256 verify + OPFS persist).
  No runtime yet — opt-in flow + storage + audit is real, but the
  installed pack doesn't yet execute.

### Phase 11.7 — Citizen intent orchestration wire-up ✅ SHIPPED 2026-05-31
- **ADR 0126** — user reported "Book a cab" silence on /app/. Two
  stacked FE bugs: (1) POST shape `{intent:{...}, actionRequest:{...}}`
  vs BE flat keys; (2) no Outcome surface so even successful POSTs
  looked silent.
- `useSendIntent` POSTs flat `{intentText, actorId, locale}`;
  JSDoc names the past bug.
- `<OutcomeCard>` renders below input: action-type label + status
  badge + localised message + required consent scopes + failed
  policies + collapsible plan + audit reference.
- Don't clear textarea on submit; add [Clear outcome] action.
- Tests: FE Vitest 32 → 33 (+1 contract pin). No BE changes.
- **Bundle**: main 369 → 372 KB / 113 KB gzipped (+3 KB).
- **Next: Phase 11.8 per-scope consent grant UI** so blocked
  intents can be unblocked from /app/ without /shell/.

### Phase 10.6 — SLM pre-labeling hint ✅ SHIPPED 2026-05-31
- **ADR 0125** — workers with an installed SLM get an on-device
  pre-labeling suggestion. Pure FE; zero BE changes.
- New module `frontend/src/lib/labeling-slm-hint.ts`:
  `buildHintPrompt(taskKind, body)` + `parseHintCompletion(taskKind,
  body, completion)` for all 5 task kinds + `HINT_MAX_TOKENS = 96`
  + `HINT_TEMPERATURE = 0.3`.
- New component `frontend/src/components/labeling/SlmHintCard.tsx`:
  gated on `useInstalledSlms` (returns null when no SLM); lazy-
  loads wllama runtime on first tap; streams via `onToken`;
  parses to typed labelValue; [Use this suggestion] flows
  through existing submit pipeline.
- Wired into `Labels.tsx` above the task renderer.
- Tests: FE Vitest 16 → 32 (+16 hint tests on builders + parsers).
  No new Node tests (zero BE changes).
- **Bundle**: main 363 → 369 KB / 112 KB gzipped (+6 KB).
- **Phase 10 v1 arc CLOSED.**

### Phase 10.5 — Signed audit export ✅ SHIPPED 2026-05-31
- **ADR 0124** — tamper-evident Ed25519-signed NDJSON audit bundle
  for any labeling job. Sponsor downstream training pipeline can
  verify end-to-end with no Bharat OS-side trust.
- New module `src/phase1/labeling-export.mjs`:
  - `buildLabelingExportLines({job, submissions, signerIdentity,
    exportedAt})` filters to accepted-only and produces header +
    per-submission + trailer.
  - `identityHashFor(jobId, workerId)` returns
    `sha256(jobId::workerId)` — same rotation as Phase 10.4
    review-list endpoint.
  - `verifyLabelingExportLines(lines, signerPublicRecord)` runs
    body-hash + signature checks and signerId cross-checks.
- Audit signer is a singleton: one Ed25519 keypair lazy-bootstrapped
  on first export request (or first public-key request) and
  persisted to the store (`audit-signer.json` for BosStore;
  `audit_signer` SQLite table for SqliteStore).
- New endpoints:
  - `GET /api/audit-signer/public-key` (public) — fetch the public
    record for verification.
  - `GET /api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson`
    (sponsor-bearer) — returns the signed bundle; emits
    `labeling_export.signed` ledger event with content hash.
- FE: `useAuditSignerPublicKey()` hook + `labelingExportNdjsonUrl()`
  URL builder + Settings page transparency strip showing the audit
  signer id + Ed25519 PEM public key.
- Tests: BE 854 → 865 (+11: 7 pure builder/verifier + 4 HTTP). FE
  16/16 unchanged.
- **Bundle**: main 362 → 363 KB / 111 KB gzipped (+1 KB).

### Phase 10.4 — QC pipeline ✅ SHIPPED 2026-05-31
- **ADR 0123** — golden-set scoring on submit + worker score gate
  on next-item dispatch + sponsor sample-for-review with reject
  (mesh + escrow clawback).
- Module helpers in `src/phase1/labeling-job.mjs`:
  `computeWorkerScore`, `matchesGoldenAnswer` (5 task kinds),
  `shouldSampleForReview` (deterministic FNV-1a).
- Submit path: golden-mismatch → `rejected_golden_mismatch` (no
  mesh, no escrow); accepted may flip to `pending_sponsor_review`
  but mesh credit lands. Response carries `qcVerdict` + updated
  `workerScore`.
- Next-item: blocks workers below `qcMinWorkerScore` with honest
  disclosure (`{reason: 'below_worker_score_gate', workerScore,
  gate}`).
- New sponsor routes: list pending sample (identityHash rotated
  per (job, worker)); accept; reject with reason (claws back mesh
  via negative event + sponsor escrow refund via re-lock).
- `'labeling'` workload now accepts negative `payoutPaise` for
  clawbacks.
- New worker stats endpoint: `GET /api/identities/:id/labeling-stats`.
- FE: overall worker-score card at top of Labels page; session view
  stat row (Submitted / Accepted with running score / Earned);
  last-verdict card; score-gate card with honest numbers.
- seed-demo: classification job gains `goldenAnswer` on first item
  + QC config (10% golden / 0.7 min score / 20% review sample).
- Tests: BE 838 → 854 (+16: 11 pure helpers + 5 HTTP). FE 16/16
  unchanged.
- **Bundle**: main 359 → 362 KB / 111 KB gzipped (+1 KB).

### Phase 10.3 — Remaining task kinds ✅ SHIPPED 2026-05-31
- **ADR 0122** — 4 new task components on `/app/labels/`. Pure FE,
  zero BE changes.
- `frontend/src/components/labeling/`:
  - `<ClassificationTask>` — tappable radio cards
  - `<SpanAnnotationTask>` — word-toggle (mobile-reliable)
  - `<TranscriptionTask>` — `<audio>` + textarea with ASR pre-fill
  - `<SafetyLabelTask>` — multi-select checkboxes with explicit
    `[Mark as safe]` action
- Dispatcher refactor: `Labels.tsx` uses a module-level map; each
  task kind is a self-contained component.
- seed-demo: 4 new active jobs (one per new kind, 2 items each)
  under Pragati Microfinance with realistic Indic content. Fresh
  seed now shows **5 jobs across all 5 task kinds**.
- Bundle: main 352 → 359 KB / 110 KB gzipped (+7 KB for 4
  components). wllama lazy chunk unchanged.

### Phase 10.1 + 10.2 — Labeling marketplace v1 ✅ SHIPPED 2026-05-31
- **ADR 0121** — workers earn paise per accepted label TODAY.
- `src/phase1/labeling-job.mjs` — module: 5 task kinds, 6-state
  lifecycle, validators, `workerCanClaim` shared client + server.
- Both backends grow `labeling_jobs` + `labeling_job_items` +
  `labeling_submissions` (with worker_id index); submissions
  cascade on identity erase.
- `'labeling'` joins `MESH_WORKLOAD_TYPES`; mesh-event accepts
  `jobId` + `itemId`.
- API: sponsor-bearer-gated draft / upload-items / launch (locks
  escrow); public worker discovery + next-item + submit; sponsor
  escrow debits per accepted label; mesh event auto-recorded.
- FE: new Labels tab on Worker bottom nav (5 tabs); `LabelsPage`
  with `<LabelingJobCard>` discovery + session view +
  `<PreferencePairTask>` A/B UI (other kinds → Phase 10.3).
- seed-demo: 5 Hindi-language preference-pair items under
  Pragati Microfinance sponsor with escrow auto-locked.
- Tests: BE 821 → 838 (+17 labeling); FE 16/16 unchanged.
- **Bundle**: main 352 KB / 109 KB gzipped (+2 KB vs 9.1).

### Phase 9.1 — Sponsored federated rounds ✅ SHIPPED 2026-05-31
- **ADR 0120** opens the demand side.
- `src/phase1/sponsor.mjs` — sponsor model, bearer-token hash,
  escrow accounting helpers (deposit / lock / debit / refund /
  revoke), public-directory vs self vs admin view bisection.
- `src/phase0/sponsor-auth.mjs` — bearer-token middleware mirroring
  Phase 5.7 admin-auth pattern; two-surface bisection (admin can't
  spend escrow; sponsor can't touch non-own resources).
- Both backends grow a `sponsors` table/directory with
  `sponsor.saved` ledger event.
- Federated round schema gains `sponsorId`, `escrowLockedPaise`,
  `escrowDebitedPaise` (additive, backwards-compatible).
- API: admin onboard / deposit / revoke + public directory view +
  sponsor self / list / create-round / export.
- Sponsored round-create locks escrow up-front; sign-and-submit
  accept debits per-update; cross-sponsor reads refused; identity-
  hash rotated per (round, contributor) so sponsor can't cross-
  round correlate.
- FE: `useSponsorDirectory` hook + `<FederatedRoundRow>` shows
  "Sponsored by X · ₹Y remaining" governance-badge.
- seed-demo: Pragati Microfinance + a sponsored phi-3-mini-loan-
  screener round.
- Tests: BE 802 → 821 (+19 sponsor tests); FE 16/16 unchanged.
- **Bundle**: main 345 KB / 107 KB gzipped (+1 KB vs 9.0d).
- **First non-investor revenue line is real.**

### Phase 9.0d — Federated rounds + mesh-inference events ✅ SHIPPED 2026-05-31
- **ADR 0119** closes the Phase 9.0 arc.
- `createFederatedRound` gains `slmModelPackId` / `targetTask` /
  `loraConfig` (all optional, default null — backwards compatible).
- `SlmRuntime.computeGradients()` stub: length-32 Float32 vector,
  deterministic, DP-noised; marked `stub: true` so future code can
  branch on real-vs-synthetic.
- `/app/labs/` federated rounds card: real Open Rounds list, pack-
  install guard for SLM rounds, Join action that loads runtime →
  computes gradient → encodes + signs + submits → server creates
  matching `federated_round` mesh event with the round's payout.
- `SlmTryPrompt` now records a real `inference` mesh event per
  `runtime.generate()` and surfaces the payout inline.
- seed-demo extended with an SLM federated round targeting
  `bos:slm:phi-3-mini-4k-q4_k_m`.
- Tests: BE 800 → 802 (+3 federated round SLM target tests);
  FE 14 → 16 (+2 computeGradients tests).
- **Bundle**: main 344 KB / 107 KB gzipped (+6 KB vs 9.0c).
- **§7f federated-economy loop end-to-end real** (modulo stub
  gradient — honest documented gap).

### Phase 9.0c — SLM runtime adapter ✅ SHIPPED 2026-05-31
- **ADR 0114** locks llama.cpp-wasm via `@wllama/wllama` 3.4.1,
  lazy-loaded (dynamic import code-splits into its own chunk).
- `src/lib/slm-runtime.ts` — stable `SlmRuntime` adapter API
  (forward-compatible for v2 MLC-LLM): `loadSlmRuntime({ggufBytes,
  onProgress})`, `runtime.generate({prompt, maxTokens, onToken})`
  streaming, `runtime.unload()`.
- `src/lib/opfs.ts` — OPFS helpers: `downloadAndPersist` (streams
  fetch into OPFS while computing SHA-256 concurrently), `readSlm
  Blob`, `removeSlmBlob`.
- `<SlmTryPrompt>` component — sample chips + textarea + streaming
  output + generation latency.
- `/app/labs/` install flow upgraded: real fetch with progress,
  real SHA-256, server enforces expected==observed, OPFS persist,
  Try a prompt action on installed packs.
- 7 Vitest tests with wllama mocked (load, ArrayBuffer wrap,
  progress, streaming, onToken-false stop, unload, error swallow).
- **Bundle**: main 338 KB / 105 KB gzipped (+8 KB vs Phase 11.6);
  wllama lazy chunk 292 KB / 126 KB gzipped (paid only by users
  who generate).
- §15: bytes never on server, prompt never leaves device, honest
  mode disclosure, lazy-loading honored, integrity check before
  installed status, discard on mismatch, audit ledger covers all.
- **Backend**: zero changes — uses Phase 9.0a/9.0b endpoints
  already deployed.

### Phase 11 — FE rebuild ✅ CLOSED 2026-05-31
- **11.0** Vite + React 19 + TS + Tailwind + Zustand + TanStack
  Query + Router 7 + Vitest scaffold; 12 design-system components
  (Action/Badge/Card/Evidence/Field/Hero/Identity/Money/Sheet/Stat/
  Tabs/Toast); `/app/` SPA serve route in API.
- **11.1** Split-hero onboarding (Worker / Citizen) + persona
  picker `<Sheet>`.
- **11.2** `/app/worker/` — mesh balance + monthly summary + cash-
  out with confirm gate + history + Trust Passport view.
- **11.3** `/app/citizen/` — intent input + 5 suggestion chips +
  recent activity list.
- **11.4** `/app/verify/` — public route; MFI bundle reader with
  status badges + per-section cards + signature evidence; worker
  MFI consent issuance form + share-URL copy + per-row revoke;
  **file-store BosStore parity fix** (caught pre-existing gap).
- **11.5** `/app/labs/` — wired to real Phase 9.0a/9.0b SLM
  endpoints (catalogue + install + remove with audit-trail-real
  failure path); federated rounds + OCR + voice cards as
  placeholders pointing at /shell/.
- **11.6** `/app/settings/` — DPDP §12 download-my-data + §12(3)
  two-step type-DELETE erase flow; persona-forget action;
  developer escape hatch to /shell/.
- **Bundle**: 330 KB JS / 18 KB CSS (102/4 KB gzipped). Build: 1.42s.
- **7/7 FE tests** (Vitest). **800/800 Node tests** (was 798;
  +2 BosStore MFI parity tests).

### Test coverage
- **798/798 Node tests pass** (run in batches of 16 files to dodge
  Windows process-spawn OOM).
- **No FE tests yet** — Vitest comes with Phase 11.0 scaffold.

### ADRs published (selected — full list in `docs/adr/`)
- 0094 (Phase 5.8), 0095 (5.9), 0096 (6.0), 0097 (6.1), 0098
  (6.1b), 0099 (6.2), 0100 (6.3), 0101 (7.0), 0102 (7.1), 0103
  (7.2), 0104 (7.3), 0105 (8.0), 0106 (8.1), 0107 (Phase 9.0
  Proposed), 0108 (8.2), 0109 (8.3), 0110 (Phase 10 Proposed), 0111
  (8.4), 0112 (9.0a), 0113 (9.0b), 0115 (Phase 11 Proposed).

---

## 🟡 In progress / Next

### Direction set 2026-05-31 — citizen marketplace + earner rebrand (save-point)

User flagged post-Phase 11.7 that:

1. "Book a cab" must hit **Bharat-OS native marketplace**, NOT
   Ola/Uber. ONDC bridge stays as bootstrap density only.
   See `memory/service-booking-native-not-ola-uber.md`.
2. Onboarding hero rebrands **"Worker" → "Earn"** (Citizen
   stays or becomes "Use") with an in-flow role chooser inside
   Earn — labelers + drivers + cooks + maids + kiranas + skilled
   trades. "Business" reserved for sponsor onboarding; don't
   reuse on earner side.
   See `memory/onboarding-hero-earn-use.md`.
3. **Provider identity ≠ worker identity.** Marketplace providers
   carry a separate KYC-heavy `providerIdentity`. Same human can
   hold both under one root recovery. Mesh balance presented as
   two cards (micro-task earnings vs marketplace earnings).
   See `memory/provider-vs-worker-identity-split.md`.
4. ONDC bridge results **hidden from citizen UI v1**. Thin supply
   → "be the first to invite a driver" referral CTA, not ONDC
   fallback by default. Substrate stays intact.
   See `memory/ondc-bridge-hidden-v1.md`.

Resumed sequencing (~6-7 weeks total):

### Phase 11.8 — Per-scope consent grant UI ✅ SHIPPED 2026-05-31

- **ADR 0127** — citizen grants consent + auto-re-sends from
  /app/. Pure FE; zero BE changes. Reuses Phase 1.3 substrate.
- Three new hooks: `useConsents`, `useGrantConsent`,
  `useRevokeConsent` — all citizen-signed
  (`signWithIdentityId + signRole`) so server cannot fabricate.
- `<ConsentGrantSheet>` per-scope checkboxes + plain-language
  descriptions + TTL pills (1/7/30/90 days).
- OutcomeCard gains `onGrantConsent` callback; consent block
  surfaces [Review + grant consent] action.
- CitizenIntent auto-re-fires intent after grant — Send label
  flips to "Re-sending after consent…" during retry.
- Trust tab rewritten: active consents with per-row Revoke +
  history of revoked/expired.
- Tests: Vitest 33 → 35 (+2 contract pins on signing fields).
- **Bundle**: main 372 → 380 KB / 115 KB gzipped (+8 KB).
- E2E verified via curl: blocked → grant → planned in 3 calls.

### Phase 11.9 — Hero rebrand: Earn / Use ✅ SHIPPED 2026-05-31

- **ADR 0128** — onboarding hero rebranded; in-flow role chooser
  surfaces all seven earner motions; Phase 12.0 placeholders for
  provider roles.
- Hero copy: "I work" → "I earn"; "I live" → "I use"; CTA labels
  follow. /shell/ link removed from footer per
  /app/-grows-/shell/-retires direction.
- New `frontend/src/lib/earn-roles.ts` data catalog — single
  source of truth for earner taxonomy (live: label-data,
  federated-mesh; Phase 12.0: drive-cab, cook, kirana, home-help,
  skilled-trades). Each provider role's comingSoonNote bakes the
  §15 "no commission" line into the catalog.
- Three-step picker: split-hero → role chooser sheet (live tiles
  trust-tinted, coming-soon tiles muted with orange Phase 12
  badge) → persona picker (live only) OR coming-soon detail
  sheet (Phase 12.0 placeholder roles).
- Tests: Vitest 35 → 41 (+6 catalog invariants).
- **Bundle**: main 380 → 384 KB / 116 KB gzipped (+4 KB).
- **Next: Phase 12.x sequencing conversation** before code.

### Phase 12.x → 13.x — Locked sequencing 2026-05-31

Full conversation outputs (provider role selection, AI-powered
marketplace ambition, escrow approach, ONDC sandbox plan, SLM
USP priorities, new revenue lines) captured in
`memory/phase-12-13-sequencing-set.md` + the four new direction
memos.

#### Phase 12.1b.4 — SLM-D booking advisor ✅ SHIPPED 2026-06-01 — Phase 12.1b ARC CLOSED
- **ADR 0140** — last of four 12.1b sub-phases. All four SLM
  sub-phases (A intent / B offline / C forms / D advisor)
  shipped today.
- **Honest scope call**: true rate-negotiation breaks
  rateSnapshot immutability + escrow contract (multi-week
  effort → Phase 12.2). Shipped the smallest useful slice
  that fits one session: **FE-only provider booking advisor**.
- On a `pre_authorized` booking, provider taps "✨ Ask my SLM:
  should I accept?" → on-device wllama generates `accept |
  reject | unsure` + rationale + optional polite reject-reason
  chip the provider taps to pre-fill the existing reject
  input. The chip NEVER changes booking state.
- Pure primitives at `frontend/src/lib/booking-advisor.ts`
  (prompt builder + completion parser; protocol version
  pinned). Runtime hook reuses Phase 9.0c wllama singleton —
  model bytes load AT MOST ONCE across SLM-A intent / SLM-C
  field-suggest / SLM-D advisor.
- Tiered rate limit: 3 per booking per 60s + 12 global per
  5min. Inflight singleton.
- Surface: `frontend/src/components/booking/SlmBookingAdvisorChip.tsx`,
  hidden when no SLM installed (honest empty state, no
  upsell). Wired into `ProviderBookingDetail.tsx` above the
  Accept/Reject Card; passes onAcceptSuggestedRejectReason so
  the suggested polite reason pre-fills the existing input.
- Bindings: 1dp bubble in prompt ONLY — vitest case asserts
  no 4dp coordinate literal in the prompt; no citizen PII;
  zero new ledger events (existing booking.accepted /
  booking.rejected are the audit trail regardless of SLM
  participation); user controls inputs.
- Zero BE changes this phase — pure FE.
- Tests: **1035/1035 Node** unchanged + **115/115 vitest**
  (+10 booking-advisor contract cases — prompt embedding,
  no-4dp-coord binding, parser verdicts, confidence clamping).
- Bundle: main 592 → 599 KB / 170 KB gzipped (+7 KB for
  primitives + hook + chip). wllama lazy chunk unchanged.
- **DEFERRED**: true rate negotiation (Phase 12.2 — needs
  rateSnapshot mutability + escrow re-design), citizen-side
  advisor, multi-turn negotiation chat, voice replies,
  advisor for in_progress/dispute states, per-advisor ledger
  event (no operator surface needs it today), adversarial
  review (substrate is binding-tested + composes proven
  patterns).
- **Phase 12.1b arc CLOSED**. Sub-phases shipped today:
  - 12.1b.1 SLM-A vernacular intent parser (ADR 0137).
  - 12.1b.2 SLM-B offline-first decisioning + queued sync
    (ADR 0138).
  - 12.1b.3 SLM-C light dynamic forms (ADR 0139).
  - 12.1b.4 SLM-D booking advisor (ADR 0140).
- **Next**: Phase 12.2 wave-1 KYC wizard (Aadhaar OCR +
  DigiLocker + operator review console).

#### Phase 12.1b.3 — SLM-C light dynamic forms ✅ SHIPPED 2026-06-01
- **ADR 0139** — third of four 12.1b sub-phases.
- **Generic substrate** at `src/phase0/dynamic-form.mjs`:
  FIELD_KINDS (text/longtext/select/multiselect/boolean/integer);
  VALIDATORS registry (non-empty, max-length, int-range, one-of,
  plate-region, boolean-required-true); validateAnswers with
  dependsOn gating; 4 KB payload cap + 24-field schema cap.
  Forward-compat: empty schema validates pass-through.
- **Per-role schemas** at `src/phase1/provider-role-forms.mjs`
  for the 4 wave-1 roles. Wave-2 (kirana / skilled-trades)
  passes through with null envelope until their routes light up.
- **NEW roleAnswers field** on providerIdentity (typed
  `{schemaVersion, values}` envelope). NOT echoed by
  publicProviderRecord — citizen privacy tested via HTTP
  integration.
- **NEW provider_identity.updated ledger event** — pointer-not-
  payload (carries `updatedFields` names, not values). Judge
  panel correctly flagged this didn't exist before; now it
  does.
- **API**: POST routes validate `roleAnswerValues` via
  `validateRoleAnswers` before persistence (BE re-validation;
  FE-only validation is a smuggling vector). NEW GET
  /api/provider-role-forms (+ /:roleKind) serves the canonical
  schemas to FE consumers.
- **SLM suggest UX**: tap-to-accept ONLY (never auto-fills),
  hidden when no SLM installed, tiered rate limit (6/field/60s
  + 30 global/5min), inflight singleton. Layered on Phase 9.0c
  wllama runtime (no second model load).
- **FE substrate**: `frontend/src/lib/dynamic-form.ts` +
  `provider-role-forms.ts` hand-mirrored with vitest parity
  snapshot. `frontend/src/components/forms/{DynamicForm,
  SlmSuggestChip, index}` barrel. ProviderOnboarding gained
  "More about this role" Card with the renderer when a schema
  exists for the role.
- Process: 4-Explore-agent understanding workflow →
  3-lens × 2-judge design workflow. Both judges picked C with
  overrides:
  - Wave-1 only (no dead schemas).
  - NO ledger event for SLM accept (analogous to autocomplete).
  - NEW roleAnswers field over JSON-in-description hack.
  - BE re-validates on save.
  - ADD provider_identity.updated ledger event.
  - Renderer in `components/forms/` not `dynamic-form/`.
- Tests: **1035/1035 Node** (+27) + **105/105 vitest** (+13).
  tsc clean.
- Bundle: main 577 → 592 KB / 168 KB gzipped (+15 KB). wllama
  lazy chunk unchanged.
- **Deferred**: file uploads, KYC level elevation, Aadhaar/
  DigiLocker integration, operator review console FE, wave-2
  schemas (substrate ready), BookingComposer/ConsentSheet
  refactor onto DynamicForm, adversarial review (substrate is
  binding-grep'd + HTTP-tested + parity-guarded).
- **Next**: Phase 12.1b.4 SLM-D negotiation agent, OR Phase
  12.2 wave-1 KYC wizard.

#### Phase 12.1b.2 — SLM-B offline-first decisioning + queued sync ✅ SHIPPED 2026-06-01
- **ADR 0138** — second of four 12.1b sub-phases. Bharat OS
  now works in poor-connectivity India.
- **Ledger-backed idempotency** — no new SQL table. Three new
  event types on the existing append-only ledger:
  `<scope>.idempotency_key_minted` / `.idempotent_replay` /
  `.idempotency_key_reused_with_different_payload`. Lookup
  scans `listLedger({type, newestFirst: true, limit: 500})`;
  matches typically at index 0–1 (retries happen within
  seconds-to-minutes). Scope-generic — Phase 12.1b.3 wraps
  bookings/consents/flags by passing a different `scope` arg,
  no refactor required.
- **Replay never re-enters orchestrator.** Worker closure
  fires exactly ONCE per real mutation; decision rows + skill
  preflights + push notifications + escrow holds + annotation
  verdict events all fire once. Tested via a deliberate
  duplicate-POST fixture.
- **Per-actor scoping is structural.** `findMintedRecord`
  compares (scope, actorId, idempotencyKey) — never key alone.
  A stolen Idempotency-Key cannot cross-replay another
  citizen's intent.
- **Tamper tripwire.** Same key + different request fingerprint
  → 409 `idempotency_key_reused_with_different_payload` + a
  separate ledger event. The fingerprint check catches a
  "stolen key + different intent text" attack.
- **Key shape: 32 lowercase hex** computed FE-side as
  `sha256(actorId + ':' + intentText + ':' +
  canonicalize(intentAnnotation) + ':' + enqueueIso + ':' +
  clientNonce).slice(0,32)`. Server rejects malformed (`400
  idempotency_key_malformed`). Bare UUIDs not accepted — the
  cryptographic determinism is the §15 tamper-evidence
  property the substrate depends on.
- **Per-identity IndexedDB** —
  `bharat-os-offline-<sanitised actorId>` so two profiles on
  the same device cannot enumerate each other's queue (judge
  panel flagged as binding requirement). Raw IDB, no
  `dexie`/`idb` dep; ULID inline. Caps: 50 rows + 7-day age-
  out + 5 attempt max. Stranded-`sending`-row recovery sweep
  (>5 min) at every drain start prevents permanent hang.
- **Online detection** — `useOnlineStatus`: navigator.onLine
  seed + online/offline events + HEAD `/api/health` every
  30s **while offline** for captive-portal cases. Pure
  `resolveOnlineState` exported for vitest. No service-worker
  fetch interception — the §15 carveout that `/app/` SW
  skips `/api/*` is preserved.
- **Drainer** — `useQueueDrainer` mounted ONCE in App.tsx as
  `<GlobalQueueDrainer/>`, gated on active identity.
  Sequential FIFO. Single-flight via
  `navigator.locks.request(LOCK_NAME, {ifAvailable: true})`
  when available; module-level promise-chain fallback
  serializes React strict-mode double-mounts and older
  browsers. Row's idempotencyKey **reused across all
  attempts** — recomputing per attempt would defeat the very
  case idempotency exists for. Backoff 1s → 4s → 16s → 60s,
  max 5 attempts. Transient errors revert row to `queued`;
  hard 4xx → `failed_permanent`.
- **Smart send** — `useSmartSendIntent`: offline → enqueue +
  `{kind: 'queued', reason: 'offline'}`; online + success →
  `{kind: 'sent', orchestration}`; online + network blip →
  enqueue + `reason: 'network_error'`; queue full →
  `{kind: 'queue_full'}`; insecure-context crypto missing →
  `{kind: 'crypto_unavailable'}` (MF-1 adversarial fix).
- **Surface** — `OfflineQueuePill` above the intent textarea
  (4 states: hidden when online+empty / grey "Offline" /
  amber "Queued (N) — will send when back online" / blue
  "Sending queued (N)…" / red "N didn't go through"). New
  `/citizen/queue` route with `QueuedIntentsPanel` —
  verbatim "N queued — not yet on Bharat OS" copy (§15
  no-silent-acceptance) + per-row Retry / Discard. Global
  drainer fires "Sent N queued intents" toast on successful
  background drain (SF-3 adversarial fix).
- **Adversarial review** — Audit: **ship_clean**. Safety:
  ship_with_fixes (1 must-fix + 2 should-fix applied). UX:
  ship_with_fixes (1 should-fix applied; rest deferred to
  12.1b.3 queue-feedback batch).
- Applied:
  - MF-1: SubtleCrypto + getRandomValues guards in
    `idempotency-key.ts` + new `crypto_unavailable`
    SmartSendResult arm + honest toast in CitizenHome.
  - SF-1: stranded-`sending`-row recovery sweep (>5 min →
    `queued`) at every drain start.
  - SF-2: module-level promise chain serializes the Web Locks
    fallback path so strict-mode double-mounts don't
    interleave drains.
  - SF-3: toast copy mirrors "queued — not yet on Bharat OS"
    phrasing; global drainer dispatches background drain
    success toast.
- Tests: **1008/1008 Node** (+15 idempotency including
  fingerprint mismatch, per-actor scoping, malformed-key,
  HTTP integration, §15 binding grep) + **92/92 vitest**
  (+11 — idempotency-key 8 cases including SubtleCrypto guard
  + 3 online-status helper cases). tsc clean.
- Bundle: main 565 → 577 KB / 163 KB gzipped (+12 KB for
  idempotency-key + offline-queue + drainer + smart-send +
  online-status + 2 new components). wllama lazy chunk
  unchanged.
- **Next**: Phase 12.1b.3 — bookings/consents/flags offline
  queue + queue-feedback UX batch + 17 more Indic languages,
  OR Phase 12.1b.3 SLM-C dynamic forms.

#### Phase 12.1b.1 — SLM-A vernacular intent parser ✅ SHIPPED 2026-06-01
- **ADR 0137** — first of four 12.1b AI-orchestration
  sub-phases. Marketplace + AI loop starts closing.
- **Annotation pass-through, NEVER override**. Server-side
  deterministic vernacular substrate (`src/phase1/vernacular.mjs`)
  remains the source of truth for `actionType`, consent
  scoping, and skill preflight. The on-device SLM annotation is
  a confidence signal recorded for audit; tested via a
  deliberate disagreement fixture (annotation says
  `health_record_read`, substrate routes to `service_booking`
  — orchestrator routes to substrate's choice).
- **Verdict ledger events** —
  `intent.slm_<agreed|disagreed|fe_only|server_only|absent>`.
  Payload carries only verdict + actionType + meta (modelPackId,
  detectedLanguage, entityCount). No raw intent text.
- **NEW src/phase0/intent-annotation.mjs** — pure validator +
  comparer + ledger builder. Field caps (max 16 entities, 280-char
  rationale, confidence clipped to [0,1]) prevent ledger bloat
  from misbehaving FE. Binding-grep test forbids
  `override|routeTo|force*` fields.
- **NEW frontend/src/lib/intent-parser.ts** — pure prompt
  builder + completion parser. Reusable by future SLM-C dynamic
  forms + SLM-D negotiation agent.
- **NEW frontend/src/lib/use-slm-intent-parser.ts** — lazy
  wllama-loading hook. Citizens with no installed SLM pay zero
  bytes for the runtime + never see the chip. Mount-guarded
  setStatus + in-flight de-dup so rapid double-taps + late WASM
  resolves don't race.
- **CitizenHome chip** — "✨ Check my understanding" → soft
  Badge "We understood: <Friendly> · <lang> · confidence
  <pct>%". `handleSend` annotation gate is byte-for-byte strict:
  attached only when (a) parsed text === sent text, (b) no
  textarea edits since parse, (c) voice interim empty.
  Edit-time `onChange` invalidates the chip immediately.
- **Process**: understanding workflow (4 parallel Explore
  agents) → implementation → adversarial review workflow
  (3 lenses: privacy / safety / UX + triage). Privacy verdict:
  ship_clean. **4 must-fix + 2 should-fix applied** before
  commit:
  - MF-1 (STALE-ANNOTATION-VOICE-INTERIM): handleSend gate
    accounts for voice interim + whitespace edits.
  - MF-2 (PARSE-BUTTON-HIDDEN-ON-ERROR): error UX has a Retry
    button + clearer copy.
  - MF-3 (CHIP-CLEARS-SILENTLY-ON-SEND): chip persists on
    repeat sends, clears on edit.
  - MF-4 (BUTTON-LABEL-JARGON): "Parse with my SLM" →
    "Check my understanding". Non-technical copy for
    vernacular citizens.
  - SF-1 (POST-UNMOUNT-SETSTATE): mounted-ref + safeSetStatus.
  - SF-2 (REENTRANT-PARSE-GUARD): inflight-ref returns same
    promise on concurrent calls.
  - SF-5 (EDGE-CASE-TESTS): 3 new vitest cases rejecting
    markdown-wrapped + unknown action values.
- Tests: **993/993 Node** (+18) + **81/81 vitest** (+15).
- Bundle: main 557 → 565 KB / 159 KB gzipped (+8 KB). wllama
  lazy chunk unchanged.
- **Next**: Phase 12.1b.2 SLM-B offline-first decisioning +
  queued sync + 17 more languages.

#### Phase 12.1a.2 — Booking + escrow + provider surface ✅ SHIPPED 2026-06-01
- **ADR 0136** — second + final of two 12.1a sub-phases.
  Marketplace loop closes: citizens browse, lock escrow, see
  outcome; providers receive push, accept, complete, see payout.
- **6-state booking machine** with monotonic `seq` for CAS:
  `pre_authorized → in_progress → provider_marked_complete →
  citizen_confirmed | auto_released | disputed |
  cancelled_after_dispute | rejected_by_provider |
  cancelled_by_citizen | expired_unaccepted`. Every transition
  CAS-guarded so concurrent provider accepts race safely.
- **Rate snapshot immutable** at booking-create; provider rate
  edits do NOT propagate to existing bookings (tested).
- **Pickup point at 4dp** on the booking record (party-only),
  ledger events carry ONLY 1dp bubble. Ledger PII replay test
  asserts no 4dp coord on any `booking.*` event.
- **Lazy auto-release on read** — every list/detail endpoint
  calls `maybeAutoRelease`; 4h pre-accept expiry, 24h
  provider-marked-complete window. No node-cron. Operator
  backstop at `POST /api/admin/bookings/sweep-stale`
  (CAS-safe, idempotent).
- **Disputed = operator-only**. `POST /api/admin/bookings/:id/
  adjudicate` with admin token; outcomes
  `release_to_provider | refund_to_citizen` (split deferred to
  12.2).
- **Provider auth = root identity + providerIdentityId**. NO
  bearer in v1 (providers are citizens with phone-authed
  identity). Bearer-mint for delegation (spouse / fleet) is
  Phase 12.3.
- **Bookkeeping-v1 funding**: admin-token-gated
  `POST /api/admin/citizens/:id/escrow/deposit` stands in for
  a real UPI rail until Phase 12.2+ payment adapter.
- **CORE shared substrate extractions** per the founder
  binding:
  - `src/phase0/escrow-paise.mjs` — entity-agnostic paise
    primitives. sponsor.mjs refactored to thin wrappers;
    47 sponsor tests regression-pass.
  - `src/phase0/provider-auth.mjs` —
    `requireProviderOwnerAuth` / `requireBookingPartyAuth` /
    `requireCitizenOwnerAuth`.
  - `src/phase0/booking-push.mjs` — payload builders with
    §15 binding-grep tests on source.
  - `src/phase0/geo.mjs::bubbleAt1dp` — ledger-safe coarsening.
  - FE: `frontend/src/lib/format-paise.ts` +
    `format-distance.ts` (zero-dep Intl) +
    `provider-context-store.ts` (Zustand persist) +
    `components/booking/*` shared.
- **11 new API endpoints** (booking lifecycle, citizen escrow,
  admin adjudicate / sweep / deposit).
- **/provider/* surface** with 5-tab bottom nav (Inbox /
  Active / History / Profile / Settings); Inbox is default
  landing.
- **/citizen/services/bookings** list + detail.
  BookingComposer at `/citizen/services/book/:providerIdentityId`
  with geolocation pickup capture at 2dp 'medium' precision.
  Existing provider detail gained "Book now" PRIMARY CTA
  above the preserved "Express interest" soft-touch.
- **Push** fires on every key transition via
  centralised booking-push builders. Citizen pushes generic;
  provider's own payout push may carry ₹ amount (own earnings).
- Adversarial review identified 3 must-fix + 10 should-fix;
  applied: PRIV-1+2 (citizen GET endpoints now owner-auth-
  gated via `requireCitizenOwnerAuth`); ESCROW-CAS (added
  `seq` to citizen-escrow + `casUpdateCitizenEscrow`; booking-
  create path retries once on stale_seq, returns 409
  `escrow_concurrent_update` on second failure); UX-1 (honest
  rate-basis picker when only one rate); UX-2 (user-facing
  copy, no "admin (bookkeeping-v1)" leak); UX-4 (warmer
  ProviderInbox empty state); UX-8 (pre-accept pickup mask
  framed as citizen safety); UX-10 (ProviderHistory tone);
  TEST-AUTH (3 new tests covering the auth gates +
  ESCROW-CAS race).
- Tests: **975/975 Node** (+30 new booking tests) +
  **66/66 vitest** (+2 new format-helper contracts). tsc clean.
- Bundle: main 528 → 557 KB / 156 KB gzipped (+29 KB for
  provider surface + booking components + 6 hooks + format
  helpers). wllama lazy chunk unchanged 292 KB / 126 KB
  gzipped.
- **Next**: Phase 12.1b (SLM AI-orchestration) OR Phase 12.2
  (provider onboarding wave 1 + ratings + Trust Passport
  feedback) — TBD by founder.

#### Phase 12.1a.1 — Marketplace discovery substrate + citizen browse ✅ SHIPPED 2026-06-01
- **ADR 0135** — first of two 12.1a sub-phases (12.1a.2 booking
  + escrow + provider surface next). FE-BE parity preserved.
- Discriminated-union geo schema on providerIdentity
  `{kind: 'point-radius', center: {lat, lng}, radiusMeters,
  summary, source, capturedAt}`. Polygon rejected loudly
  (forward-compat). Legacy `{summary}` read-coerced and
  excluded from discovery.
- **Asymmetric privacy.** Centroid persisted at **4dp (~11 m)**,
  emitted publicly at **2dp (~1.1 km)** via new
  `toPublicServiceArea` helper. Closes the
  household-help-worker home-doxing risk that 4dp-everywhere
  would have created.
- State-machine guard: draft → submitted refused without
  point-radius geo. Both `transitionProviderStatus` AND
  `attestProviderKyc` (auto-submit path) enforce.
- **Geo extracted as a CORE SHARED MODULE** per the founder
  directive — not marketplace-specific:
  - `src/phase0/geo.mjs` (haversine, distanceBand,
    bubblesOverlap, round1/2/4, INDIA_BBOX).
  - `frontend/src/lib/geo.ts` mirror + `INDIA_CITIES`
    (30 centroids).
  - `frontend/src/lib/geolocation.ts` —
    `useGeolocationCapture({precision: 'coarse'|'medium'|'fine'})`.
  - `frontend/src/components/geo/{LocationConsentSheet,
    CityPickerSheet, ServiceAreaPicker}`.
  - Reused by marketplace + future Phase 12.1a.2 pickup-point
    + 12.2 provider tracking + mesh node locality + regulator
    audit bucketing.
- New API:
  - `GET /api/marketplace/providers?lat&lng&radiusMeters&role&limit`
    — public, rate-limited (existing `policyFor → 'read'`),
    defensively re-rounds query to 1dp, returns
    `distanceBand` pill (NEVER precise metres), emits
    **ANONYMOUS** `marketplace.searched` ledger event with
    only `{role, radiusMeters, providerCount, latBucket,
    lngBucket, at}` — no citizen identity even with session.
  - `POST /api/marketplace/providers/:id/express-interest`
    — citizen-existence check via `store.readIdentity`
    (PRIV-1), typed `marketplace.interest_expressed` ledger
    event so Phase 12.1a.2 has a real precedent row to
    upgrade. Note normalised (CRLF / BOM stripped, trimmed,
    empty→null per EC-2).
- Citizen surface at `/app/citizen/services/*` (three nested
  routes: index + by-role + provider detail) — NO 6th
  bottom-nav tab. CitizenHome intercepts "Book a cab" +
  "Hire household help" suggestions to deep-link directly.
- ProviderOnboarding upgraded: free-text `areaSummary` replaced
  with `<ServiceAreaPicker/>` (Use my current location 4dp /
  Pick a city / radius slider). Plain-language warning copy.
- **ONDC SUPPRESSED** by construction —
  `marketplace-discovery.mjs` never imports `tools.mjs`
  (binding test asserts via source grep). NO `commission`,
  `takeRate`, `platformFee`, `bharatOsFee` field anywhere in
  the new code path (binding test).
- Empty state when no providers nearby: "No Bharat OS providers
  near you yet. We don't fall back to other apps automatically
  — that would mean a cut. Invite someone you trust to onboard,
  or check a nearby city." Matches `ondc-bridge-hidden-v1`
  binding verbatim.
- Process: scoped by 7-Explore-agent Workflow (mapping
  providerIdentity / booking-escrow / geo / ONDC /
  citizen-surface / provider-surface / roadmap-and-ADRs);
  designed by 3-lens × 2-judge proposal Workflow; hardened by
  3-lens adversarial review Workflow (privacy / UX /
  edge-case) + triage. **2 must-fix + 7 should-fix** applied
  before commit:
  - PRIV-1: citizen-spoofing on express-interest → existence
    check added.
  - EC-2: note field CRLF + BOM → normalised before ledger.
  - EC-1: `updateProviderProfile({serviceArea: null})` on
    active/submitted → throws `service_area_required`.
  - EC-3: `rankProviders({radiusMeters: 0})` → falls back
    to `DEFAULT_QUERY_RADIUS_M`.
  - UX-1: stale "interest sent" card on sign-out → state
    reset in error branch.
  - UX-2: legacy-summary migration warning → moved to TOP
    of `ServiceAreaPicker`.
  - UX-5: provider-list error → Retry button.
  - UX-11: `KYC_TONE.none = 'warning'` → `'neutral'` (don't
    falsely alarm citizens about pre-Phase-12.2 providers).
  - UX-12: service-only providers → honest "discuss with
    provider" fallback when both rates are zero.
  - PRIV-5: location consent prompt → optional "Don't ask
    again this session" button steers to CityPicker.
- Tests: **945/945 Node** (+4 new for PRIV-1 / EC-1 / EC-2 /
  EC-3 + 1 fixture update) + **58/58 vitest**. tsc clean.
- Bundle: main 505 → 528 KB / 150 KB gzipped (+23 KB for
  browse routes + geo lib + geolocation hook + city centroids
  + hooks). wllama lazy chunk unchanged 292 KB / 126 KB gzipped.
- **Next: Phase 12.1a.2** (booking entity + parallel
  citizen-booking escrow + /app/provider/* + push
  notification, ~2 wks).

#### Phase 12.0.5 — Sponsor /app/sponsor/ admin ✅ SHIPPED 2026-06-01 — SWEEP ARC CLOSED
- **ADR 0134** — fourth and final sweep sub-phase. **All 4
  substrate-integration sub-phases (12.0.2 → 12.0.5) done.**
- 25 new files: Zustand store + bearer api wrappers + FE
  Web-Crypto export-verify port + 14 routes + 9 shared components.
- Scoped by a Workflow with 7 parallel Explore agents + a
  synthesis pass; hardened by a 2nd Workflow with 3 adversarial
  reviewers (privacy / UX / edge case) + triage; 13 must/should
  items applied before commit. Privacy: ship_clean.
- Surface covers:
  - Bearer-token paste sign-in → dashboard.
  - Labeling jobs: list + draft create + items upload + launch +
    Phase 10.4 review queue (accept/reject + clawback) + Phase
    10.5 signed audit export with FE Web-Crypto verification
    (4-bucket verdict: verified / unverified / mismatch /
    fetch_failed).
  - Federated rounds: list + create with SLM-pack picker +
    detail + unsigned NDJSON export.
  - Escrow ledger (filtered) + settings + sign-out with
    cancelQueries-before-clear.
- §15: bearer never echoed; document title scrubbed;
  identityHash rotation preserved; goldenAnswer never shown;
  cross-sponsor isolation enforced.
- Pure FE; zero BE changes.
- Tests: Node 890/890 unchanged, FE Vitest 45/45 unchanged.
- **Bundle**: main 434 → 505 KB / 144 KB gzipped (+71 KB).

#### Phase 12.0.4 — Cross-cutting sweep ✅ SHIPPED 2026-06-01
- **ADR 0133** — third of four substrate-integration sub-phases.
  Five integrations across /settings + /citizen/home.
- (1) Push notifications opt-in on /settings — VAPID + service
  worker (/app/sw.js) + honest unsupported/denied/disabled
  states.
- (2) Vault transfer download (.json) on /settings — Phase 5.0
  recovery bundle as a download.
- (3) DPDP grievance contact card on /settings — DPO name +
  email + postal + escalation URL.
- (4) Voice intent mic on /citizen/home — browser
  SpeechRecognition (en-IN; on-device).
- (5) Flag reports (§9A) — Report button on each Recent Activity
  row → category + description → POST /api/flags.
- Mostly FE; one operational BE change (VAPID env vars).
- 5 new hooks + voice-intent helper + service worker.
- Tests: Node 890/890 unchanged, FE Vitest 45/45 unchanged.
- **Bundle**: main 421 → 434 KB / 129 KB gzipped (+13 KB).

#### Phase 12.0.3 — Worker sweep ✅ SHIPPED 2026-06-01
- **ADR 0132** — second of four substrate-integration sub-phases.
  Five integrations across `/worker/earn` + `/worker/trust` (no
  new tabs).
- `/worker/earn` gains: (1) Schemes card — e-Shram registration
  + active scheme entitlements (PM-KISAN, PMSYM, etc.); (2) Tax
  view card (current FY) — gross + new/old regime + cheapest
  + substrate's full legal disclaimer.
- `/worker/trust` gains: (3) Mint Trust Passport attestation
  via the orchestrator's `trust_attestation` action type; (4)
  Collective memberships list (sangha / cooperative / blessed
  collective).
- 5 new hooks; auto-suppression so brand-new worker sees clean
  Earn surface.
- Pure FE; zero BE changes.
- Tests: Node 890/890 unchanged, FE Vitest 45/45 unchanged.
- **Bundle**: main 411 → 421 KB / 125 KB gzipped (+10 KB).

#### Phase 12.0.2 — Citizen sweep ✅ SHIPPED 2026-06-01
- **ADR 0131** — substrate-integration sweep, citizen side
  (first of four sub-phases 12.0.2 → 12.0.5).
- **Daily brief** on /app/citizen/home top — uses orchestrator
  `daily_brief` action type; renders greeting + composed text +
  structured signals (mesh 24h, expiring consents, recent
  activity, open §9A flags); consent-blocked variant routes
  through existing ConsentGrantSheet.
- **Personal memory records** as new /app/citizen/notes tab —
  create + list (metadata only) + consent-gated read; per-note
  sensitivity (personal/sensitive/public).
- Citizen bottom-nav 4 → 5 tabs (Home / Notes / Trust / Labs /
  Settings).
- 4 new hooks + 2 new components. Pure FE; zero BE changes.
- Tests: Node 890/890 unchanged, FE Vitest 45/45 unchanged.
- **Bundle**: main 399 → 411 KB / 123 KB gzipped (+12 KB).

#### Phase 12.0.1 — Real sign-up / sign-in on /app/ ✅ SHIPPED 2026-06-01
- **ADR 0130** — auth follow-up over existing Phase 4.3 phone OTP +
  Phase 5.0 account recovery substrate.
- BE: dev-only `_devOtpCode` field on `/api/phone-otp/send` +
  `/api/recovery/start` (matched-branch only) when SMS provider
  is `log`. §15 anti-enumeration sentinel branch never includes
  it (test pinned).
- FE: 4 new hooks (`useSignUpStart`, `useSignUpVerify`,
  `useSignInStart`, `useSignInVerify`) + `<AuthSheet>` two-tab
  component (sign up / sign in; phone → OTP → done flow).
- Onboarding hero footer surfaces [Create an account] · [Sign in
  with phone] CTAs alongside demo personas.
- Tests: Node 884 → 890 (+6). FE Vitest unchanged.
- **Bundle**: main 392 → 399 KB / 120 KB gzipped (+7 KB).

#### Phase 12.0 — providerIdentity substrate ✅ SHIPPED 2026-05-31
- **ADR 0129** — separate identity from workerIdentity; KYC-heavy;
  bound to a root via `rootIdentityId`; DPDP §12(3) cascade on
  both stores.
- New `src/phase1/provider-identity.mjs` pure module — role kinds,
  KYC levels, state machine, public-record stripping.
- Both stores grow `provider_identities` table/path with index by
  `root_identity_id` + DPDP cascade.
- Six HTTP endpoints (create / list / public-read / profile-edit /
  admin kyc-attest / admin transition).
- FE: 3 new hooks + `<ProviderOnboarding>` route + EARN_ROLES
  wave-1 (cab-driver / personal-driver / labourers /
  household-help) flipped from coming-soon to LIVE.
- WorkerHome rewritten with two-ledger cards (micro-task earnings
  live + marketplace earnings ₹0 pending 12.1a).
- Tests: Node 865 → 884 (+19); Vitest 41 → 45 (+4 — 2 hook
  contracts + 2 catalog invariants).
- **Bundle**: main 384 → 392 KB / 119 KB gzipped (+8 KB).
- E2E verified: create draft → public read strips sensitive
  fields → admin endpoints gate correctly.

#### Phase 12.1a — Marketplace substrate + baseline UX (split into 12.1a.1 + 12.1a.2)

##### 12.1a.1 — Discovery substrate + citizen browse ✅ SHIPPED 2026-06-01 (ADR 0135)
- [x] Real geo (provider lat/lng + service radius). Polygon
  deferred until maps lib lands; forward-compat schema.
- [x] City/area filtering via INDIA_CITIES centroids (30 cities,
  tier-1 / tier-2 default radii).
- [x] Provider profile with structured serviceArea, hourly +
  per-service rates (Phase 12.0 substrate retained).
- [x] Citizen search → ranked list within radius. Rank: KYC
  level then distance. Trust Passport feedback deferred to
  12.1a.2+ (no ratings substrate yet).
- [x] /app/citizen/services nested routes (index / by-role /
  provider detail).
- [x] ProviderOnboarding upgraded to ServiceAreaPicker.
- [x] Shared phase0/geo + FE geo + geolocation as CORE modules.
- [x] ONDC suppressed by import-graph + binding test. No
  commission fields anywhere.
- [x] Express-interest stub emits typed
  `marketplace.interest_expressed` ledger event so 12.1a.2 has
  a real precedent row.

##### 12.1a.2 — Booking + escrow + provider surface ✅ SHIPPED 2026-06-01 (ADR 0136)
- [x] Tap to book → escrow lock → push notify provider. Consent
  flow integration deferred — booking lock now stands in as
  the consent gate (immutable + auditable). Phase 11.8 grant
  flow can wrap booking-create in 12.2.
- [x] **Parallel citizen-booking module** (`src/phase1/booking.mjs`).
  State machine `pre_authorized → in_progress →
  provider_marked_complete → citizen_confirmed | auto_released |
  disputed | cancelled_after_dispute | rejected_by_provider |
  cancelled_by_citizen | expired_unaccepted`. CAS-guarded by
  `seq`. Separate `src/phase1/citizen-escrow.mjs` envelope
  (per-citizen escrow) — sibling to sponsor.mjs, both backed by
  the new `src/phase0/escrow-paise.mjs` shared primitives.
- [x] /provider/* surface — 5-tab bottom nav (Inbox / Active /
  History / Profile / Settings). Rooted on root-identity
  ownership; provider-context-store (Zustand persist) holds
  active-provider hat. NO bearer in v1.
- [x] Rate snapshot at booking-create (immutable; tested).
- [x] Dispute resolution: either party files; escrow holds;
  operator-token-gated adjudicate endpoint resolves to
  release_to_provider or refund_to_citizen.
- [x] `marketplace.interest_expressed` precedent rows remain as
  the lightweight CTA (preserved); "Book now" PRIMARY CTA is
  the new heavyweight path.
- [ ] ONDC bridge against sandbox URLs — still hidden v1; native
  marketplace remains the only flow. Deferred to a future phase
  once native supply is non-trivial.

#### Phase 12.1b — AI-orchestration layer (split into 12.1b.1 + .2 + .3 + .4)

##### 12.1b.1 — SLM-A vernacular intent ✅ SHIPPED 2026-06-01 (ADR 0137)
- [x] On-device wllama parses intent text → structured
  annotation. NEVER overrides server actionType.
- [x] Verdict ledger events for audit.
- [x] CitizenHome chip + edit-invalidate + voice-interim guard.

##### 12.1b.2 — SLM-B offline-first decisioning ✅ SHIPPED 2026-06-01 (ADR 0138)
- [x] Ledger-backed idempotency (3 event types, no new SQL).
- [x] Per-identity IndexedDB queue.
- [x] Web Locks single-flight drainer.
- [x] OfflineQueuePill + QueuedIntentsPanel.
- [ ] 17 more Indic languages → deferred to 12.1b.3 with SLM
      model-pack additions.
- [ ] **B.** Offline-first decisioning + queued sync. Cache
  consents, answer queries from local memory.
- [ ] **C.** On-device dynamic onboarding forms (SLM generates
  next field based on prior answers + reads document scans +
  autofills). Direct fit with 12.0 KYC onboarding.
- [ ] **D.** On-device negotiation agent for marketplace.
  Citizen states budget + need; agent surveys catalog,
  negotiates rates within budget, presents options.

Pattern reuse: each is `buildPrompt + parseCompletion` shape
from Phase 10.6 labeling-slm-hint.

#### Phase 12.2.1 — External-adapter substrate + OSM Nominatim ✅ SHIPPED 2026-06-01

First real external-API integration. The substrate
(`src/phase0/external-adapter.mjs::createAdapter`) is the
factory every future adapter — DigiLocker, Aadhaar e-KYC, GST,
UPI rails, NPCI — composes in ~100 lines. Owns stub-vs-live
mode dispatch, LRU cache (pointer-not-payload), token-bucket
rate limit, polite User-Agent, 6s timeout, audit-ledger
emission (meta only — NEVER the body). First concrete adapter:
`src/phase1/nominatim-geocoder.mjs` (OSM Nominatim policy:
1 req/sec hard cap, polite UA with contact URL, 1dp bubble
cache key, 24h TTL). `GET /api/geocode/reverse?lat&lng`
returns `{mode, source, place: {label, suburb, city, state,
countryCode, osmId}, latencyMs}`. FE `useReverseGeocode` hook
+ `<PickupAreaHint/>` component render "Near Shivajinagar,
Pune" above the raw lat/lng on both branches of
`ProviderBookingDetail` + `CitizenServices` booking detail.
Tests: 1035 → **1053 Node** (+18 substrate + adapter + HTTP
binding cases) + 115 → **119 vitest** (+4). tsc clean. Bundle
main unchanged at 599 KB / 170 KB gzipped. **ADR 0141**.

#### Phase 12.2.4 — Per-role heavy extras (wave-1) ✅ SHIPPED 2026-06-01

Wave-1 onboarding loop closes. All 4 roles (cab-driver /
personal-driver / labourers / household-help) get a
role-specific verification step + parallel operator
attestation. NEW src/phase1/provider-role-extras.mjs
PROVIDER_ROLE_EXTRAS (closed schemas, deep-frozen),
validateRoleExtras (schema_version_stale on drift). NEW
roleExtrasSubmission + roleExtrasAttestation fields on
providerIdentity; activation guard refuses on missing /
stale schema / stale submission timestamp. Endpoints:
POST submit-role-extras + admin attest-role-extras + GET
schemas. Ledger events pointer-not-payload. FE wizard 5
→ 6 steps; new RoleExtrasStep paints ALL errors at once;
review step echoes typed answers. PhotoCapture: PDF
magic-byte sniff. Operator console: per-kind View +
attest pair. **Adversarial review** (4 lenses) surfaced
27 findings; 11 high+med fixed in-phase. Tests: 1110 →
**1142 Node** (+32) + 124 → **138 vitest** (+14). tsc
clean. Bundle 618 → 628 KB / 175 → 177 KB gzipped
(+10 KB). **ADR 0144**.

#### Phase 12.2.5 — Parivahan verification adapter + API_INTEGRATIONS tracker ✅ SHIPPED 2026-06-01

Third concrete adapter on the Phase 12.2.1 external-adapter
substrate. Auto-verifies citizen-typed DL # + vehicle
registration # against Govt-of-India endpoints; operator
gets a one-click ✓/✗ badge instead of a manual cross-check.
Frozen provider allowlist (stub | digilocker | surepass |
karza | idfy); v1 stub-only. NEW `roleExtrasVerifications`
field on providerIdentity + POST
`/api/admin/.../verify-role-extras` endpoint. Audit event
pointer-not-payload. Operator console: Pre-verify button
+ color-coded badges + `[stub]` marker. **NEW
`docs/API_INTEGRATIONS.md`** master tracker for every
external API Bharat OS needs to go live (Parivahan,
DigiLocker, NSDL PAN, GSTN, NPCI/UPI, SMS providers,
ABDM, ONDC) with cost + provisioning steps + env-var
names. Adversarial review (3 lenses) surfaced 20
findings; 8 high+med fixed in-phase including the
selfProviderRecord leak, verifier_error sanitization,
status guard, clear-on-resubmit, audit-pollution
suppression. Tests: 1142 → **1166 Node** (+24); vitest
unchanged (138). tsc clean. **ADR 0145**.

#### Phase 12.2.6 — DigiLocker OAuth2 substrate + Parivahan integration + Sahayak binding ✅ SHIPPED 2026-06-01

First **citizen-authenticated** verification flow. NEW
`src/phase1/digilocker-substrate.mjs` (OAuth2 helpers +
signature verification + DPDP cascade). 4 endpoints
(authorize / callback / status / delete). Parivahan
adapter's `verifyRoleExtrasFields` now uses the
citizen-authorised signed-document path when the
citizen has linked DigiLocker. Operator console:
🔏 indicator. Adversarial review (3 lenses) surfaced
17 findings; 5 high+med fixed in-phase including the
rainbow-tableable bindingDigest in stub mode, the
redirectUri open-redirect, the state ordering bug, and
the silent live→stub fallback. **NEW
`memory/sahayak-no-smartphone-onboarding.md` binding** —
captures the Snabit / Pronto agent-assisted model for
serving the ~700M Indians without usable smartphones
(Phase 14.x scope). Tests: 1166 → **1199 Node** (+33);
vitest unchanged (138). tsc clean. **ADR 0146**.

#### Phase 12.2.7 — FE "Link DigiLocker" card + KYC L1 wiring ✅ SHIPPED 2026-06-01

Closes the FE-BE gap on Phase 12.2.6. NEW
`useDigilockerLink` hook (status + link + unlink). NEW
`<LinkDigilockerCard/>` rendered at top of KYC L1
identity step with honest "(demo mode)" tag in stub mode.
Stub OAuth dance runs via fetch (no popup). **§15
bindings**: actingRootIdentityId in header only (never
URL query — service worker / referer telemetry leak);
same-origin assert on authorizeUrl. Adversarial review
(2 lenses) surfaced 10 findings; 6 medium fixed in-phase:
same-origin assert, query→header migration,
window.confirm before Unlink, error branching,
double-tap gate, status-error fallback. Tests: 138 →
**140 vitest** (+2 hook smoke cases). Node 1199
unchanged (FE-only). tsc clean. Bundle 628 → 632 KB / 177
→ 179 KB gzipped (+4 KB). **ADR 0147**.

#### Phase 12.2.8 — Live DigiLocker popup flow + postMessage listener (reserved)

When partner credentials arrive: ship the popup-helper
component that opens the live authorize URL in a window,
listens for postMessage from the callback page, and
refreshes the status query. The hook already returns
authorizeUrl + state in live mode — only the popup
orchestration is missing.

#### Phase 12.2.3 — Attachment CORE substrate + KYC L1 selfie/ID-proof ✅ SHIPPED 2026-06-01

Binary blob substrate reused across KYC L1 (selfie + ID
proof), Phase 12.2.4 per-role extras (vehicle docs, police
verification), and Phase 12.x dispute evidence. NEW
`src/phase1/attachment.mjs` (mime allowlist, content-addressed
`bos:att:<32hex>` IDs, 5 MiB/blob + 50 MiB/actor caps, EXIF
flag, typed errors). NEW `attachments` table on both stores
(SqliteStore BLOB column, BosStore two-file `.bin`+`.json`).
POST/GET-list/GET-id/DELETE `/api/attachments` (content-
addressed cache headers + ETag; expensive rate-limit
policy; quota check in `BEGIN IMMEDIATE` transaction). KYC
L1 schema accepts optional `selfieAttachmentId` +
`idProofAttachmentId` (ownership-verified at submit). FE:
`useAttachmentUpload` + `<PhotoCapture/>` (file-input
primary, preview + confirm + retake, thumbnail render on
resubmit). KYC L1 wizard 3 → **5 steps**. Operator console
View buttons (admin-bearer fetch + blob URL); audit event
on every admin read. **Adversarial review** (4 lenses)
surfaced 26 findings; 11 high+med fixed in-phase. Tests:
1082 → **1110 Node** (+28) + 121 → **124 vitest** (+3). tsc
clean. Bundle 612 → 618 KB / 174 → 175 KB gzipped (+6 KB).
**ADR 0143**.

#### Phase 12.2.2 — KYC Level 1 wizard + India Post PIN-code adapter ✅ SHIPPED 2026-06-01

The common physical-service KYC slice for all four wave-1
provider roles. Citizen-driven 3-step wizard
(`/onboarding/kyc-level-1`): identity (full legal name +
Aadhaar last-4 + PAN last-4) → address (PIN code → India Post
auto-fill OR honest manual fallback in stub mode) → review.
Produces a `kycLevel1Submission` record consumed by the
operator review queue (new `#provider-kyc-review` section on
the operator console). NEW `india-post-pincode` adapter (2nd
composition of the external-adapter substrate) with **§15
binding upgrade**: sha256-digest cacheKey on audit ledger +
`/api/geocode/pincode/:pin` access-log path rewrite. NEW
`provider_identity.kyc_l1_submitted` ledger event carries
field NAMES + city/state only — never values. **Aadhaar /
PAN last-4 ONLY** — substrate + UI paste handler both
defensive. Strong owner-auth via
`requireProviderOwnerAuth`; ledger-before-save + optimistic
concurrency check (partial L2-1 fix). Owner-list endpoint
now redacts last-4 + addressLine via
`selfProviderRecord`. Operator console: admin token /
operator-id topbar (sessionStorage only); two-step confirm
on Attest / Activate echoing identity before bless.
Adversarial review (4 parallel lenses) surfaced 24 findings;
12 high+med fixed in-phase, 12 low deferred with scope
rationale. Tests: 1053 → **1082 Node** (+29) + 119 →
**121 vitest** (+2). tsc clean. Bundle 599 → 612 KB / 170 →
174 KB gzipped (+13 KB). **ADR 0142**.

#### Phase 12.2 — Provider onboarding wave 1 (~2 wks)
Four roles share a common physical-service onboarding flow
(**KYC L1 done in 12.2.2**) + role-specific extras (founder
picked "minimum onboarding load, maximum coverage"):
- [x] **Common KYC L1 substrate + wizard** — Phase 12.2.2.
- [x] **Attachment CORE substrate + KYC L1 photo capture** — Phase 12.2.3.
- [x] `cab-driver` — own commercial vehicle (taxi/auto/ride-hail).
  Extras: vehicle docs + commercial permit. **Phase 12.2.4.**
- [x] `personal-driver` — chauffeur for citizen's vehicle.
  Extras: police verification + prior employer ref. **Phase 12.2.4.**
- [x] `labourers` — construction / loading / factory / farm
  daily wage. Extras: sardar/contractor attestation. **Phase 12.2.4.**
- [x] `household-help` — maid + cook combined. Extras: police
  verification + references. **Phase 12.2.4.**

#### Phase 12.3+ — Remaining provider roles (~3 wks)
- [x] `kirana` (shop license + GST optional). **Phase 12.3.**
- [x] `skilled-trades` (ITI cert + portfolio + Trust Passport
  feedback loop). **Phase 12.3.**

#### Phase 13.x — SLM USP features (~6 wks)
- [x] **E.** On-device document summariser (electricity bill /
  Form 16 / T&Cs / insurance / lender docs). **Phase 13.0 demo
  cut shipped 2026-06-01 (ADR 0149)** — paste-text-only, 6-pill
  picker + streaming on /labs. **Phase 13.0.1 shipped 2026-06-02
  (ADR 0154)** — PDF upload + on-device text extraction via
  pdfjs-dist (founder-approved npm dep). **Phase 13.0.2 shipped
  2026-06-02 (ADR 0155)** — first BE delta in the SLM-E arc:
  Save summary to consent-gated encrypted MemoryRecord +
  `doc.summarised` pointer-not-payload ledger event with
  strict-allowlist count-only envelope. SLM-E arc complete.
- [x] **F.** On-device PII redactor on outgoing actions.
  **Phase 13.1 shipped 2026-06-01 (ADR 0151)** —
  regex-primary (11 Indian PII kinds: PAN/Aadhaar/mobile/
  GSTIN/account/DL/RC/ABHA/UPI/email/PIN) + SLM-secondary
  context augmentation. Chip on CitizenIntent + CitizenNotes;
  Apply rewrites textarea before handleSend/handleCreate
  fires. **Phase 13.2 shipped 2026-06-01 (ADR 0152)** —
  count-only `piiRedaction` sub-envelope on
  `intentAnnotation` (first BE delta in 13.x) + opt-in
  transparent Send pre-flight + strict-allowlist BE
  hardening. Deferred to 13.3: standalone piiRedaction-only
  annotation path + per-identity persisted opt-in +
  offline-queue replay redaction.
- [x] **G.** On-device personalization (preferences never leave
  device). **Phase 13.3 shipped 2026-06-02 (ADR 0153)** —
  pure-FE substrate (profile-store.ts + profile-prompt-
  fragment.ts) named generically for SLM-H composition;
  PII-impossible schema (enum × enum × bool × allowlist-
  domains); localStorage via Zustand persist; PersonalizationCard
  on /settings; profile fragment injected into SLM-A intent
  parser + SLM-E doc summariser; DPDP cascade complete.
- [x] **H.** On-device skill agents for Indian tasks
  (electricity bill / consumer complaint / PM-KISAN scheme).
  **Phase 13.4 shipped 2026-06-02 (ADR 0156)** — SLM-H substrate
  + first concrete skill (electricity bill explainer).
  **Phase 13.4.1 shipped 2026-06-02 (ADR 0157)** — second
  concrete skill (consumer complaint drafter).
  **Phase 13.4.2 shipped 2026-06-02 (ADR 0158)** — third v1
  skill (PM-KISAN status checker) completes the rollout.
  `SKILL_ACTION_VERBS` grew 8 → 13 → 18 across the sub-phases.
  All three skills compose the generic
  `SkillDefinition<TInput, TFields>` substrate; the BE
  skill-agent registry now seeds all three categories
  (utility_bill_explainer / consumer_complaint_drafter /
  government_scheme_status).
  **Phase 13.4.3 shipped 2026-06-02 (ADR 0159)** — wired
  action verbs to real launchers (URL / tel: / in_app) via a
  4-entry frozen .gov.in/.nic.in URL allowlist + module-load
  guard + shared `SkillActionLink` component used by all 3
  panels. Closes the 13.4.x sub-arc.

#### Phase 13.x — New revenue lines (~4 wks)
- [~] **Citizen data labelling + sponsor sale.** Citizens
  monetize THEIR own data (intents / conversations / document
  interactions) via signed consent + per-data-point payouts +
  revocation. Reuses Phase 9.1 sponsor + Phase 10.x labeling
  substrate + Phase 11.8 per-scope consent. See
  `memory/citizen-data-as-product-revenue.md`.
  **Phase 13.5 shipped 2026-06-02 (ADR 0160)** — citizen-side
  substrate: publish + list + pause + revoke per-data-point
  sale offers (5 DATA_POINT_KINDS × 6 SPONSOR_PURPOSES); BE
  registry with content-derived offerId + DPDP cascade; ledger
  emits citizen_data_offer.{published|paused|revoked} pointer
  events with count-only meta. **Phase 13.5.1 next** — sponsor
  browse + purchase flow (debit sponsor escrow, credit citizen
  mesh balance, emit citizen_data_offer.purchased; per-data-
  point delivery signature).

#### Phase 13.6 — Public marketing pages ✅ SHIPPED 2026-06-02 (ADR 0161)

The investor / partner-facing website at 4 public routes
alongside the existing onboarding at `/`. Story-first landing
for investors; sign-up at `/` for demo users. Every factual
claim backed by an ADR or memory binding.

- [x] `/about`, `/how-it-works`, `/for-citizens`, `/for-sponsors`
- [x] Shared `MarketingLayout` (header + nav + footer)
- [ ] /pricing once legal review per
  `memory/citizen-data-as-product-revenue.md` clears.
- [ ] /team + /contact once team is hired.
- [ ] SEO meta tags + landing video.
- [ ] **Compute network mesh workload.** Add `compute_serving`
  to `MESH_WORKLOAD_TYPES`. Worker phones serve Phi-3-mini
  inferences to OTHER citizens for fiat-credit. See
  `memory/compute-network-mesh-workload.md`.
- [ ] Storage network already substrate — no FE work for v1.

#### Phase 14+ — Bharat ID / SSO
- [ ] SLM generates and signs SSO tokens for third-party
  services without revealing the underlying identity. Bharat
  OS as the trust anchor for India's app ecosystem.

#### Phase 14.x — Sahayak (no-smartphone onboarding) ~6 wks engineering + partner calendar

Surfaces the ~700M Indians without usable smartphones
through the agent-assisted model proven by Snabit / Pronto /
PayNearby / Eko / Spice Money / Fino. A trained, KYC'd
local **Sahayak** uses THEIR device to onboard + transact on
behalf of the citizen. See
`memory/sahayak-no-smartphone-onboarding.md` for the
binding.

- [ ] **14.0** — `sahayak` provider role + double-signature
  pattern (every action signed by Sahayak's session AND
  citizen's biometric). Composes KYC L1 + role-extras +
  attachments + DigiLocker substrate — substrate ~70%
  already there.
- [ ] **14.1** — AUA/KUA registration with UIDAI for the
  biometric path (paid + 2-month approval).
- [ ] **14.2** — USSD aggregator adapter (`*99#` bridge for
  citizens with feature phones). Composes the Phase 12.2.1
  external-adapter substrate. BSNL / commercial partner.
- [ ] **14.3** — IVR voice flow engine (DTMF input mapping
  to Bharat OS actions). Reuses the SMS provider substrate
  for voice-OTP routing.
- [ ] **14.4** — Print receipt template + Bluetooth thermal
  printer driver for cash transactions at the Sahayak
  kiosk.
- [ ] **14.5** — Cash-float ledger (Sahayak's bank balance
  vs citizens' Bharat OS balances). Compatible with the
  existing bookkeeping-v1 escrow model.

**Why this matters**: a smartphone-only OS excludes the
majority of India. Snabit + Pronto + the BC (Business
Correspondent) ecosystem have proven this is the only
credible path to rural / low-income onboarding.

**For the investor pitch**: substrate is ~70% there; the
Sahayak product layer + partner partnerships are the
remaining 30%. ~6 wks engineering plus partner calendar
time.

**Total: ~22 wks of substantive work to v1 marketplace +
SLM-USP feature parity + new revenue lines + Bharat ID
substrate.** Subject to demo / investor / provider-feedback
re-prioritization.

### Phase 10 — v1 arc CLOSED 2026-05-31

**Phase 10.0–10.6 all SHIPPED.** The labeling marketplace is
end-to-end complete: sponsor onboarding + escrow + draft +
upload + launch + worker discovery + 5 task kinds + QC pipeline
+ signed audit export + on-device pre-labeling hint.

After Phase 11.8: pick from the Phase 10 polish backlog below,
or move to **Phase 12+ (Bharat ID / SSO)** from the explorations
doc.

### Phase 10 future polish (post-MVP)

- **10.4.1** Inter-annotator α (Krippendorff α across N≥2 workers
  per item; needs jobs with multiple submissions per item)
- **10.4.2** Worker appeal of golden-set fail (sponsor adjudication)
- **10.5.1** Audit signer key rotation (header.signerVersion field +
  multi-key verifier lookup)
- **10.5.2** Sponsor console one-click download UI for export
  bundle + bulk multi-job export
- **10.5.3** Premium-job UI gating (filter jobs by required score)
- **10.6.1** Per-task-kind UI annotation for SLM hint (highlight
  suggested option, pre-fill span words, pre-fill textarea) +
  mesh-inference attribution + multi-model picker
- **10.1.1** Job cancel + refund route (`refundLockedEscrow` hook)
- Per-worker time-series score trend on Labels page
- Score-driven dynamic per-label pricing (premium workers earn
  more per label)
- Anti-fraud signals (rapid-fire submissions, bot-like timing)

v1 arc complete. Polish backlog above ships as sponsor / worker
feedback prioritises. Otherwise advance to Phase 12+ (Bharat ID
/ SSO from explorations doc).

---

## 🔵 Proposed (post-FE-rebuild)

### Phase 9.0c — SLM runtime adapter (llama.cpp-wasm)
**PAUSED until `/app/` v1 ships.**
- Single runtime: llama.cpp-wasm (universal CPU, 3-10 tok/s).
- Lazy-load from CDN/mirror on first Install tap (Phase 2a.8
  Tesseract.js pattern).
- MLC-LLM (WebGPU) deferred; ONNX Runtime Web dropped.
- ADR 0114 required before code — captures the rationale + the
  first-third-party-dep + distroless-deploy trade-off.
- Ships with `/app/labs/` SLM panel per the FE+BE parity rule.
- ~2-3 wks.

### Phase 9.0d — Federated rounds + mesh-inference event integration
- Wire SLM runtime into Phase 3.x federated-round substrate.
- Phase 6.0b mesh-inference workload events finally record real
  ticks (today they're demo-seeded).
- Ships with its own `/app/labs/` updates.
- ~1 wk.

### Phase 9.1 — Sponsored federated rounds (demand-side revenue)
- Sponsor API for banks / hospitals / govt to commission privacy-
  preserving fine-tuning rounds. Workers earn per-round payouts via
  existing UPI rail.
- Depends on 9.0c + 9.0d.
- Ships with sponsor-portal FE surface.
- ~2-3 wks.

### Phase 10 — Labeling marketplace (ADR 0110)
**Strongest non-investor revenue line.** Indic-language RLHF labels
for sponsors (Scale AI / Surge AI / LLM trainers). ~70% of
substrate already exists (consent + ledger + UPI cash-out + Trust
Passport).

- [ ] **10.0** — Sponsor onboarding + escrow ledger table. ~1 wk.
- [ ] **10.1** — Job spec API + corpus upload + launch transition.
  ~1 wk.
- [ ] **10.2** — Worker discovery + new shell **🏷 Label** tab
  (`/app/labels/`). ~1.5 wks.
- [ ] **10.3** — Per-task-kind UIs (preference pair / classification
  / span / transcription). ~2 wks.
- [ ] **10.4** — QC pipeline (golden-set + inter-annotator α +
  sponsor sample). ~2 wks.
- [ ] **10.5** — Signed JSONL export bundle for sponsor audit. ~1 wk.
- [ ] **10.6** — SLM pre-labeling hint (depends on Phase 9.0c).
  ~1 wk.

Total: ~9-10 wks. Sub-phases 10.0–10.2 launchable independently of
Phase 9.0c.

---

## 🟣 Future / V2 polish

Deferred from current ADRs — picked up after the v1 demo loop
closes (Phase 11 → 9.0c → 10.x).

### Bharat OS as identity layer (Phase 12 — Bharat ID)
*Currently in `docs/explorations/sso-bharat-id.md` — not yet an ADR.*
- Tier 1 — DigiLocker / IndiaStack consent broker (already largely
  built via §9C vignettes; brand as "Sign in with Aadhaar via
  Bharat OS")
- Tier 2 — Verifiable Credentials (W3C VC / DID) — the substantive
  answer; relying party gets a signed selective-disclosure proof,
  Bharat OS sees nothing about the login event
- Tier 3 — OIDC compatibility shim — runs as local service on the
  phone (Phase 2b dependency), not a central tracking IdP
- Open: brand name (Bharat ID / Sign in with Bharat OS / भारत पहचान),
  revenue model (per-verified-login B2B fee), Aadhaar-ref attestation
  at v1 (yes/no)

### Phase 11 v2 polish (deferred from v1)
- **i18n + vernacular** — Hindi / Marathi / Tamil / Bengali UI
  strings (after copy stabilises)
- **PWA + service worker + offline mode** — installable, works on
  patchy 4G (deferred from v1 because v1 needs to avoid the SW
  cache nightmare we hit during the 2026-05-27 demo cold-open)
- **Voice input via IndicWhisper** — moved from `/shell/` to
  `/app/citizen/` properly
- **Animations + motion design** — Framer Motion for transitions
- **Accessibility audit** — axe-core CI step
- **Performance budget** — Lighthouse CI with hard ceilings on
  bundle size + TTI
- **Persona-specific themes** — Worker surface warmer tint, citizen
  cooler

### Phase 9.0c future polish
- Pack signing (in addition to SHA-256 integrity)
- Pack versioning + delta-updates (LoRA adapter ship instead of
  full re-download)
- Multi-model coexistence (Phi-3 + code-specialised together)
- NPU acceleration in Phase 2b AOSP shell

### Phase 9.0b future polish
- Background download resume (Range header retry against orphaned
  OPFS file)
- Per-pack signature verification
- Storage usage panel showing free/used OPFS per identity
- Auto-remove revoked packs with worker confirmation
- Per-device install ledger view

### Phase 8.x future polish
- Partial UPI withdrawals (today bundles all unsettled events)
- QR code for UPI ID input
- Saved UPI IDs (opt-in only)
- Real-time push to status updates (no manual refresh)
- Per-day / per-week balance sparkline
- Per-category push opt-in (cash-out alerts vs job alerts vs
  recovery alerts as separate toggles)
- Subscription health surface (worker sees delivery success rate)

### Phase 7.x future polish
- Per-worker delivery telemetry dashboard
- Adaptive retry caps per vendor

### Phase 10 future polish
- Cross-lingual alignment jobs (sponsor wants the same preference
  pair labeled in 5 languages)
- Marketplace pricing engine (dynamic per-label price)
- Reputation-weighted payouts
- On-device label preview before submit (Phase 9.0c hook)
- Sponsor self-service (small sponsors sign up without admin
  intervention)
- Federated-trained label models (labels collected via Bharat OS
  train an SLM offered as labels-as-a-service)

---

## ⚪ External / human-action items (not Claude Code's work)

These need the founder to drive personally. None started.

- [ ] **OEM / telco LOI** (§10, §14 P0 risk) — required for Phase
  2b distribution
- [ ] **AUA / KSA partnership** — Aadhaar authentication user agency
  registration
- [ ] **DPDP fiduciary registration** — Significant Data Fiduciary
  filing with MeitY
- [ ] **AA / ABHA empanelment** — Account Aggregator + Ayushman
  Bharat Health Account integration
- [ ] **Capital raise** — IndiaAI Mission grants, sovereign-tech VC
  (§12), seed round
- [ ] **Bharat OS domain registration** + brand decisions
- [ ] **Patent counsel engagement** — §14A defensive strategy
- [ ] **Regulatory counsel** — DPDP / RBI / MeitY items
- [ ] **Real demo SLM with pre-computed SHA-256** — Phase 9.0c
  shipped the runtime + OPFS install flow but the seeded packs
  still point at `models.bharat-os.example`. Pick a small public
  GGUF (e.g. SmolLM2-135M ≈ 90 MB from HuggingFace), pre-compute
  its SHA-256, register a pack via the admin endpoint. Once done,
  the full "install → SHA verify → try a prompt" loop demos
  end-to-end.
- [ ] **VAPID key generation + ops storage** — Phase 7.0 is wired
  but production VAPID keys haven't been generated for any
  operator. Without these, push delivery falls back to local-only.

---

## 📦 Distribution arc (§13 — unchanged direction)

App first, OS later. Confirmed direction set 2026-05-23.

- **Phase 2a** (PWA shell) — current — ~85% of the product is
  PWA-buildable today
- **Phase 2b** (AOSP shell on OEM partner) — post-funding — wins
  the remaining ~15% (persistent mesh daemon, launcher replacement,
  system-wide intent capture, TEE attestation, syscall-level L4
  enforcement)
- **Phase 2c** (full multi-OEM ROM) — long-term

---

## 🧭 Sequencing summary (immediate)

```
NOW       Phase 11.0  — Vite scaffold + design tokens + components (~3d)
↓
WEEK 1-2  Phase 11.1-11.3 — Onboarding + Worker + Citizen surfaces
↓
WEEK 3    Phase 11.4-11.6 — Verifier + Labs + polish
                            **/app/ v1 SHIPS → investor demo ready**
↓
WEEK 4-6  Phase 9.0c — llama.cpp-wasm runtime (+ /app/labs/ wire)
↓
WEEK 7    Phase 9.0d — Federated round + mesh-inference event wire
↓
WEEK 8+   Phase 10.0-10.5 — Labeling marketplace
          (parallel: Phase 9.1 sponsored federated rounds)
```

## 🔒 Binding rules (operate by these)

1. **FE + BE parity** (`memory/fe-be-parity-rule.md`) — every phase
   from Phase 11+ ships both layers together.
2. **Doc-update rule** (`memory/bharat-os-doc-update-rule.md`) —
   every code commit updates BHARAT_OS.md §17 + README + new ADR
   in the same commit.
3. **No npm dep without asking** (Phase 11 ADR 0115) — the FE
   dependency surface is bounded to the locked stack list.
4. **Backend zero-npm-dep posture preserved** — `bin/bos-api.mjs`
   and `src/` stay Node-stdlib-only.

---

## 📍 Related docs

- `BHARAT_OS.md` — canonical product reference + §17 closed-phase log
- `docs/adr/` — full ADR log (115+ entries)
- `docs/explorations/` — pre-ADR design explorations
- `memory/` (Claude Code auto-memory) — session-persistent constraints
  + state snapshots
