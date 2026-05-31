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

### Phase 10 — v1 arc CLOSED 2026-05-31

**Phase 10.0–10.6 all SHIPPED.** The labeling marketplace is
end-to-end complete: sponsor onboarding + escrow + draft +
upload + launch + worker discovery + 5 task kinds + QC pipeline
+ signed audit export + on-device pre-labeling hint.

Next: pick from the polish backlog below, or move to **Phase 12+
(Bharat ID / SSO)** from the explorations doc.

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
