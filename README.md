# Bharat OS

Phase-by-phase implementation of the Bharat OS canonical product reference.

The current codebase starts with **Phase 0: protocol + identity + mesh**, matching
`BHARAT_OS.md`. The baseline executable spec is dependency-free PowerShell, and
the Phase 0.1 CLI/persistence layer runs on the local portable Node.js runtime in
`.tools/`.

## Phase 0 MVP

Implemented pieces:

- identity records with local root keys;
- signed protocol messages;
- encrypted chunk manifests using pointer-not-payload semantics;
- a small control-plane model for node registration and manifest publishing;
- a mesh placement simulator that enforces KYC, WiFi, charging, battery, and
  storage constraints;
- contribution accounting for the future fair-use model.
- deterministic bootstrap simulation for the first 1,000-node demand test.
- Phase 1 policy/consent/decision dry-runs.
- Phase 1.1 mocked IndiaStack tool adapters behind the policy gate.
- Phase 1.2 intent orchestration from user intent to policy-gated tool plan.
- Phase 1.3 signed consent artifacts and tamper-evident receipt verification.
- Phase 1.4 consent lifecycle controls for active, revoked, and expired grants.
- Phase 1.5 queryable audit ledger for consent, policy, tool, and mesh events.
- Phase 1.6 identity-anchored encrypted memory records with consent-gated reads.
- Phase 1.7 metadata-only memory search and provenance lookup.
- Phase 1.8 operator-console memory reveal through the consent gate.
- Phase 1.9 operator-console memory-read consent grants.
- Phase 1.10 operator-console consent timeline and row-level revocation.
- Phase 1.11 operator-console public identity profile view and actor selection.
- Phase 1.12 local identity creation through API and operator console.
- Phase 1.13 row-level consent receipt verification in the operator console.
- Phase 1.14 audit ledger filtering by event type and limit in the console.
- Phase 1.15 audit ledger NDJSON export from API and operator console.
- Phase 1.16 Trust Passport v1 read model from public identity, consent,
  memory-metadata, integrity, and ledger evidence.
- Phase 1.17 deterministic Hindi/Hinglish intent normalization for the first
  vernacular regulated-flow path.
- Phase 1.18 signed Trust Passport snapshots as portable evidence artifacts.
- Phase 1.19 L6 skill registry for policy-gated tool manifests and sandbox
  posture.
- Phase 1.20 L7 orchestration now selects L6 skill manifests before invoking
  policy-gated tools.
- Phase 1.21 CLI access for local L6 skill manifest list/read workflows.
- Phase 1.22 versioned, hash-verified L6 skill manifests with API/CLI integrity
  checks.
- Phase 1.23 skill invocation preflight for integrity, consent, scope, and policy
  checks before execution.
- Phase 1.24 persisted skill preflight receipts with audit hashes, ledger events,
  API/CLI lookup, and integrity verification.
- Phase 1.25 orchestration now runs the selected L6 skill through preflight
  before any L3 tool execution.
- Phase 1.26 direct API/CLI tool execution is also bound to L6 skill preflight
  receipts and carries preflight IDs into tool receipts.
- Phase 1.27 blocked skill preflights now include consent and policy
  remediation templates for UI-driven recovery.
- Phase 1.28 stored preflight remediation can create explicit signed consent
  grants through API/CLI.
- Phase 1.29 operator console can grant the latest blocked preflight consent
  remediation through the same API boundary.
- Phase 1.30 remediation consent grants return lifecycle and integrity evidence
  immediately after creation.
- Phase 1.31 stored blocked preflights can be retried after remediation grants,
  producing a new persisted preflight receipt from the original request.
- Phase 1.32 approved preflight receipts can be executed directly through
  API/CLI/console while preserving the `skillPreflightId` evidence chain.
- Phase 1.33 skill invocation trace view links preflights, remediation consent,
  retries, tool executions, decisions, and ledger evidence.
- Phase 1.34 skill invocation traces now include stable evidence hashes and
  metadata-only privacy posture.
- Phase 1.35 Trust Passport v1 now includes skill preflight and execution
  evidence counts without exposing raw payloads.
- Phase 1.36 approved-preflight execution responses include tool-execution
  integrity verification.
- Phase 1.37 dedicated L8 vernacular module covering Hindi, Marathi, Bhojpuri,
  Tamil, and Bengali (script + romanized) across every canonical action type,
  with localized response phrases attached to orchestration receipts.
- Phase 1.38 §9A worker-protection policies: no-advance-fee (generalized),
  escrow required, minimum-wage-floor, age verification, kiosk-mediation
  worker-authorization, and fiat-only settlement — enforced in the L4 engine,
  surfaced via skill-preflight remediation hints, idempotent across passes.
- Phase 1.39 §9B native service marketplace: Bharat OS-owned L6
  `bharat_marketplace` tool + skill as the substrate for cab / hotel / ticket
  / food / grocery / professional-services booking. ONDC is a Phase A
  outbound bridge only (`ondc_beckn` L3 tool, `bos:skill:ondc-bridge`).
  Voice intents like *"mujhe ek cab book karo"* route to the native
  marketplace across Hindi, Marathi, Bhojpuri, Tamil, and Bengali, with
  localized response strings.
- Phase 1.40 Net Contribution Score surfaced via `store.computeContribution`,
  `GET /api/identities/:id/contribution`, `bos contribution show`, and a
  `mesh` block on the Trust Passport (covered by the audit hash and
  signed snapshots). The §13B fair-use lever is now readable end-to-end.
- Phase 1.41 §9A worker authorization receipts as a signed first-class
  artifact (`src/phase1/worker-authorization.mjs`). L4 mediation policy
  now verifies signature + workerId + expiry, not just ID presence.
  `publicRecords` threaded through `evaluateDecision`,
  `evaluateSkillPreflight`, `executeToolAction`, `orchestrateIntent`,
  and the API + CLI surfaces.
- Phase 1.42 Phase 1 tie-off bundle: (a) operator console adds an NCS
  column on Trust Passports + a §9B Service Marketplace panel + a §9A
  Worker Authorizations panel with verify buttons; (b) new CLI commands
  `bos service book`, `bos vernacular normalize`, `bos vernacular
  languages`, `bos worker-auth create/list/verify`,
  `bos device recovery-phrase / verify-phrase / pair`; (c) PWA conversion
  of the operator console with manifest, service worker, and offline app
  shell (Phase 2a §13 distribution path); (d) device-pairing scaffold
  (`src/phase1/device-pairing.mjs`) with deterministic recovery phrase
  and pairing payload for §7c phone migration.
- Phase 1.43 user-facing vernacular shell at `/shell/` (`public/shell/`):
  voice-first or text intent entry, persona-aware greetings, per-action result
  cards, localized response rendering, recent activity, and a demo-safe device
  claim model that treats persona switching as device re-initialization.
  `/` now redirects to `/shell/`; `/console/` remains the operator surface.
- Phase 2a.1 UPI deep-link for service bookings: `bharat_marketplace` and
  `ondc_beckn` receipts now carry a `payment` artifact with a `upi://pay?...`
  URI, and `/shell/` renders `Pay with UPI` on booking result cards. This is a
  PWA handoff only; PSP callback and settlement reconciliation remain future
  work.
- Phase 2a.2 health document capture to mocked ABHA structured upload:
  `health-document.mjs`, `bos:skill:abha-document-upload`,
  `POST /api/health-documents`, and a `/shell/` capture card. Raw image and
  full OCR text are not persisted; real Tesseract.js / IndicOCR image-to-text
  remains the next hardening step.
- Phase 2a.3 per-profile passkey binding scaffold: WebAuthn
  register/verify challenges, profile credential persistence, ledger events,
  `/api/profile-auth/*` routes, and `/shell/` passkey controls. Full FIDO2
  attestation/assertion verification remains a hardening step.
- Phase 2a.4 worker notification scaffold: push-subscription metadata,
  worker-notification receipts, `/api/push/subscriptions`,
  `/api/worker-notifications`, and `/shell/` Worker alerts controls backed by
  service-worker local notifications. Real VAPID Web Push sending remains a
  hardening step.
- Phase 2a.5 Indic voice runtime scaffold: ASR model-pack metadata,
  `/api/voice/runtime`, `/api/voice/model-packs`, and `/shell/` runtime
  planning that prefers installed Indic Whisper WASM packs before falling back
  to Web Speech or text input. Real WASM decoder/model integration remains a
  hardening step.
- Phase 2a.6 Indic TTS runtime scaffold: TTS model-pack metadata,
  `/api/tts/runtime`, `/api/tts/model-packs`, and `/shell/` Listen controls for
  localized responses via browser speech synthesis until IndicTTS-WASM is wired.
- Phase 2a.8 real Tesseract.js OCR for health-document capture + investor-demo
  diagnostics panel + §17 footprint accounting (Tier 1 ~50 KB shell, Tier 2
  ~7 MB lazy OCR, Tier 3 ~30 MB opt-in voice, Tier 4 1.5-4 GB opt-in SLM).
## 📍 Where to look next

- **`ROADMAP.md`** — what's done, what's next, what's deferred (canonical forward-looking view)
- **`BHARAT_OS.md`** §17 — full closed-phase log
- **`docs/adr/`** — design decisions per phase

---

## 💼 2026-05-31 — Phase 11.9 shipped: hero rebrand Earn / Use + role chooser

The Phase 11 "I work" / "I live" hero was too narrow for the
actual product motion. Phase 11.9 rebrands to **"I earn" / "I
use"** and adds an in-flow role chooser inside Earn — surfacing
all seven earner motions including Phase 12.0 provider
placeholders (Drive, Cook, Kirana, Home help, Skilled trades)
alongside the live Label data + Train AI on-device flows.

- **ADR 0128** — pure FE; zero BE changes.
- `frontend/src/lib/earn-roles.ts` data catalog is the canonical
  earner taxonomy. Each provider role's `comingSoonNote` bakes
  the §15 "no commission" promise into the catalog.
- Coming-soon tiles render with an orange "Phase 12" badge +
  an honest detail sheet explaining what Phase 12.0 onboarding
  will look like for that role.
- /shell/ link removed from the hero footer per the
  /app/-grows-/shell/-retires direction.
- Tests: FE Vitest 35 → 41 (+6 catalog invariants).
- Bundle: main 384 KB / 116 KB gzipped (+4 KB vs 11.8).

**Next: Phase 12.x sequencing conversation** before code.

---

## ✅ 2026-05-31 — Phase 11.8 shipped: per-scope consent grant + auto-re-send on /app/

The Phase 11.7 Outcome card surfaced blocked verdicts; Phase 11.8
lets the citizen actually grant the required consent from /app/
itself, then auto-re-sends the original intent so "Book a cab"
flows **blocked → grant → planned** in one user action — no
bouncing to /shell/.

- **ADR 0127** — pure FE; zero BE changes; reuses Phase 1.3
  consent substrate.
- Three new hooks (`useConsents`, `useGrantConsent`,
  `useRevokeConsent`) — all citizen-signed so server cannot
  fabricate consent.
- New `<ConsentGrantSheet>`: per-scope checkboxes + plain-
  language descriptions + 1/7/30/90 day TTL pills.
- Trust tab rewritten as a real surface — active consents with
  per-row Revoke + revoked/expired history.
- Tests: FE Vitest 33 → 35 (+2 contract pins on signing fields).
- Bundle: main 380 KB / 115 KB gzipped (+8 KB vs 11.7).
- E2E verified: curl confirms blocked → grant → planned in 3
  calls with "Looking for the best provider for you." outcome.

**Next: Phase 11.9** — hero rebrand to Earn/Use + in-flow role
chooser (label / drive / cook / kirana / maid / skilled).

---

## 🪪 2026-05-31 — Phase 11.7 shipped: citizen intent flow wired end-to-end on /app/

User reported "Book a cab" on /app/citizen/home silently doing
nothing. Two stacked FE bugs: (1) the POST shape sent
`{intent:{intentText}, actionRequest:{actorId}}` but the BE
orchestrator reads flat keys → every intent fell back to
`mesh_storage` and the recent-activity filter never matched;
(2) no Outcome card so successful blocked verdicts looked silent.

- **ADR 0126** — pure FE fix; zero BE changes.
- `useSendIntent` POSTs the flat shape; JSDoc names the past
  bug so it can't regress.
- New `<OutcomeCard>` surfaces action-type label + status badge
  + localised message + required consent scopes + failed policies
  + collapsible plan + audit reference.
- Tests: FE Vitest 32 → 33 (+1 contract pin).
- Bundle: main 372 KB / 113 KB gzipped (+3 KB vs 10.6).
- **Next: Phase 11.8** per-scope consent grant UI so citizens
  can unblock intents from /app/ without bouncing to /shell/.

---

## 🧠 2026-05-31 — Phase 10.6 shipped: on-device SLM pre-labeling hint — Phase 10 v1 arc CLOSED

Phase 10.6 wires the Phase 9.0c llama.cpp-wasm runtime into the
labeling tasks. Workers with an installed SLM see a "Suggest a
label" card above every task; tapping it lazy-loads the model,
runs a task-kind-specific prompt, parses the completion back to
a typed labelValue, and offers [Use this suggestion] which flows
through the existing submit pipeline. Pure FE — zero BE changes.

- **ADR 0125** — `frontend/src/lib/labeling-slm-hint.ts` (pure
  module: 5 prompt templates + 5 parsers) +
  `frontend/src/components/labeling/SlmHintCard.tsx` (gated on
  installed SLM; clean degradation when not).
- Prompt + completion never leave the device. The worker always
  sees the suggestion before submitting.
- Tests: FE Vitest 16 → 32 (+16 hint tests). No new Node tests.
- Bundle: main 369 KB / 112 KB gzipped (+6 KB vs 10.5). wllama
  lazy chunk unchanged.

**Phase 10 v1 arc CLOSED.** Polish backlog (10.4.1 / 10.5.1 /
10.5.2 / 10.5.3 / 10.6.1 / 10.1.1) ships as feedback
prioritises. Otherwise advance to Phase 12+ (Bharat ID / SSO).

---

## 🔏 2026-05-31 — Phase 10.5 shipped: signed audit export for labeling jobs

Phase 10.5 closes the sponsor audit story for the labeling
marketplace: a tamper-evident, Ed25519-signed NDJSON bundle that
any verifier (sponsor, citizen, regulator) can re-hash and re-
verify against a public-key endpoint, with the original content
hash anchored in the server ledger.

- **ADR 0124** — `src/phase1/labeling-export.mjs` (header + per-
  submission + trailer with content SHA-256 + signature) +
  singleton audit signer (lazy-bootstrapped, persisted in both
  stores) + two new endpoints + `labeling_export.signed` ledger
  event.
- `GET /api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson`
  (sponsor-bearer) — returns the signed bundle. Workers' raw
  identity NEVER appears in the body; `identityHash =
  sha256(jobId::workerId)` rotates per (job, worker) so sponsors
  cannot cross-job correlate.
- `GET /api/audit-signer/public-key` (public) — fetch the Ed25519
  public record to verify any bundle.
- FE Settings page gains a transparency strip showing the audit
  signer id + creation date + collapsible Ed25519 PEM public key.
- Tests: **865/865 Node** (+11 export tests: 7 pure
  builder/verifier + 4 HTTP). FE 16/16 unchanged.
- Bundle: main 363 KB / 111 KB gzipped (+1 KB vs 10.4).

**Phase 10 progress: ~88%.** Remaining: 10.6 SLM pre-labeling
hint (~1 wk). See `ROADMAP.md`.

---

## 🎯 2026-05-31 — Phase 10.4 shipped: labeling marketplace converges on quality

Phase 10.4 wires ADR 0110's QC plan: **golden-set scoring on
submit** + **worker score gate on next-item dispatch** + **sponsor
sample-for-review** with reject (mesh + escrow clawback). Random-
spam workers drop their score and get gated; sponsors can reject
sampled submissions with a reason; clawbacks emit negative mesh
events for honest ledger accounting.

- **ADR 0123** — three QC layers + three module helpers + worker
  stats endpoint + FE worker-score card + last-verdict surface.
- `'labeling'` workload now accepts negative `payoutPaise` so
  clawbacks reduce the worker's mesh balance honestly (Uber driver
  chargeback semantics).
- seed-demo: classification job's first item is a golden item
  (`goldenAnswer: {value: 'business_loan'}`); job's QC config is
  10% golden / 0.7 min score / 20% review sample.
- Tests: **854/854 Node** (+16 QC tests: 11 pure helpers + 5
  end-to-end HTTP). FE 16/16 unchanged.
- Bundle: main 362 KB / 111 KB gzipped (+1 KB vs 10.3).

**Phase 10 progress: ~75%.** Remaining: 10.5 signed export
(~1 wk), 10.6 SLM pre-labeling hint (~1 wk). See `ROADMAP.md`.

---

## 🏷 2026-05-31 — Phase 10.3 shipped: all 5 task kinds on /app/labels/

Phase 10.2 shipped only preference_pair; Phase 10.3 wires in the
four remaining: **classification** (radio cards), **span_annotation**
(word-toggle), **transcription** (audio + textarea), **safety_label**
(multi-select with explicit "Mark as safe"). Pure FE — zero BE
changes because items + submissions are stored opaquely.

- **ADR 0122** — 4 new components + dispatcher refactor + seed-
  demo extension.
- `frontend/src/components/labeling/` — five self-contained task
  components plugged into a module-level `TASK_RENDERERS` map.
- seed-demo now creates **5 active jobs** on fresh seed (one per
  task kind, realistic Indic content).
- Bundle: main 359 KB / 110 KB gzipped (+7 KB vs 10.2). wllama
  lazy chunk unchanged.

**Phase 10 progress: ~50%.** Remaining: 10.4 QC, 10.5 signed
export, 10.6 SLM pre-labeling hint. See `ROADMAP.md`.

---

## 🏷 2026-05-31 — Phase 10.1 + 10.2 shipped: labeling marketplace v1

Workers can earn paise per accepted label TODAY on `/app/labels/`.
Sponsors create draft jobs → upload corpus → launch (escrow locks
for `itemCount × perLabel`) → workers discover jobs filtered by
language → tap a preference-pair → submit → server accepts +
debits sponsor escrow + credits worker mesh + records ledger
events. Full Bharat OS rail (UPI cash-out via Phase 8.3) drains
the worker's mesh balance.

- **ADR 0121** — module + lifecycle + escrow integration + worker
  surface.
- **Labels** is now a tab on the Worker bottom nav (5 tabs:
  Earn / Labels / Trust / Labs / Settings).
- v1 ships **preference_pair** task UI; other task kinds (Phase
  10.3) show an honest "not supported in /app/ v1" card.
- seed-demo: 5 Hindi-language preference-pair items under the
  existing Pragati Microfinance sponsor — runnable on fresh seed.
- Tests: **838/838 Node** (+17 labeling); 16/16 Vitest.
- Bundle: main 352 KB / 109 KB gzipped (+2 KB vs 9.1).

**Next**: Phase 10.3 (remaining task kinds) → 10.4 (QC) → 10.5
(signed export) → 10.6 (SLM pre-labeling hint). See `ROADMAP.md`.

---

## 💰 2026-05-31 — Phase 9.1 shipped: first non-investor revenue line

Sponsors (banks, hospitals, govt, LLM trainers) can now pay Bharat
OS to run privacy-preserving federated training rounds on Indian
workers' devices. Admin onboards a sponsor (one-time bearer token);
sponsor tops up escrow; sponsor creates rounds with escrow locked
up-front; per-accepted-update the sponsor's escrow debits and the
worker's mesh ledger credits atomically; sponsor downloads a
signed-JSONL audit bundle for compliance — gradient hashes only,
identity hashes rotated per round so they can't cross-correlate.

- **ADR 0120** wires sponsor module + bearer-token auth + escrow
  lifecycle + audit export.
- Sponsor / admin / public-directory views are bisected — sponsor
  can't touch other sponsors, admin can't drain sponsor escrow.
- seed-demo adds "Pragati Microfinance" + a sponsored
  phi-3-mini-loan-screener round so `/app/labs/` shows the
  "Sponsored by X · ₹Y remaining" governance-badge on fresh seed.
- Tests: **821/821 Node** (+19 sponsor tests); **16/16 Vitest**.
- Bundle: main 345 KB / 107 KB gzipped (+1 KB vs 9.0d).

**Next**: Phase 10 labeling marketplace — the sponsor + escrow
pattern from 9.1 reuses directly. See `ROADMAP.md`.

---

## 🔄 2026-05-31 — Phase 9.0d shipped: §7f federated-economy loop is real end-to-end

Phase 9.0 arc CLOSED. Worker can: install an SLM → run real
inference (paid in paise per call, real mesh-ledger ticks) → join
a federated round fine-tuning that SLM (paid per accepted update)
→ cash out via Phase 8.3 UPI flow. All on `/app/labs/`.

- **ADR 0119** wires `createFederatedRound` with SLM target fields
  (`slmModelPackId`, `targetTask`, `loraConfig`), extends the
  runtime adapter with `computeGradients()` (honest stub — real
  LoRA needs a training-capable runtime; documented future polish).
- Federated rounds card surfaces open rounds, pack-install guard,
  Join action that loads runtime → gradient → submit.
- `SlmTryPrompt` now records a real `inference` mesh event per
  generate; payout shows inline "+₹X.YZ earned".
- seed-demo extended with an SLM round on Phi-3-mini.
- Tests: 802/802 Node + 16/16 Vitest.
- Bundle: main 344 KB / 107 KB gzipped (+6 KB vs 9.0c).

**Next**: Phase 9.1 (sponsored federated rounds — demand-side
revenue with escrow + sponsor audit bundle) per `ROADMAP.md`.

---

## 🧠 2026-05-31 — Phase 9.0c shipped: on-device SLM inference is real

`/app/labs/` now runs real llama.cpp-wasm inference on installed
GGUF packs. Tap **Install** → stream-download with progress + real
SHA-256 verify + OPFS persist. On match: tap **Try a prompt** →
WASM runtime lazy-loads from CDN → tokens stream into the UI. The
prompt never leaves the device.

- **ADR 0114** locks the runtime choice (llama.cpp-wasm via
  `@wllama/wllama` 3.4.1, lazy-loaded via dynamic import).
- Main bundle stays **105 KB gzipped** — wllama lives in its own
  126 KB-gzipped lazy chunk, paid only by users who generate.
- **14/14 Vitest** (+7 for the adapter), **800/800 Node** (backend
  untouched — adapter rides Phase 9.0a/9.0b endpoints).
- Backend zero-npm-dep posture preserved. Frontend dep surface
  now: 258 npm packages.

**External item**: pick a small real GGUF (e.g. SmolLM2-135M ≈ 90 MB
from HuggingFace), pre-compute SHA-256, register via admin endpoint
— then the install→verify→generate loop demos end-to-end against a
real model. See `ROADMAP.md` external items.

**Next**: Phase 9.0d (federated rounds + mesh-inference events
real-tick recording) per the FE+BE parity rule.

---

## 🎉 2026-05-31 — Phase 11 arc CLOSED (`/app/` v1 shipped end-to-end)

All Phase 11 sub-phases shipped — investor demo path is real.

```bash
# One-time
cd frontend && npm install

# Build the FE
npm run build

# Run the API (serves /shell/, /app/, /console/, /verify/, /api/*)
cd .. && node bin/bos-api.mjs --port 8787 --store .bharat-os-demo
```

Then open:
- **`/app/`** — new SPA, split-hero Worker / Citizen onboarding
- **`/app/worker/`** — mesh earn + cash-out + MFI consent + Trust
- **`/app/citizen/`** — intent input + recent activity
- **`/app/verify/?consent=…`** — verifier reads signed MFI bundle
- **`/app/labs/`** — SLM install (wired to Phase 9.0a/9.0b) +
  federated rounds + OCR placeholders
- **`/app/settings/`** — DPDP §12 download + erase
- **`/shell/`** — developer surface, untouched

**Tests**: 800 Node + 7 Vitest. **Bundle**: 330 KB JS / 18 KB CSS
(102 / 4 KB gzipped).

**Next**: Phase 9.0c (llama.cpp-wasm runtime) — see `ROADMAP.md`.

---

- Phase 9.0b **Per-identity SLM install records + DPDP cascade +
  shell install card; install pipeline end-to-end demoable; still
  no runtime (9.0c)** — Phase 9.0a shipped the registry but the
  server couldn't record per-worker installs, the shell had no UI
  to install, and DPDP §12(3) had no cascade story. 9.0b closes
  all three. New `src/phase1/installed-slm.mjs` (pure validation,
  no I/O): `createInstalledSlmRecord` with two terminal statuses
  (`installed` / `failed`); defends **expected vs observed hash
  invariant** server-side. **Pointer-not-payload**: bytes live in
  browser OPFS; server holds metadata only. Storage: both backends
  grow `installed_slms` (sqlite has `identity_id` index for fast
  per-identity GET); `installed_slm.recorded` / `.failed` / `.
  removed` ledger events. **DPDP §12(3) cascade total** —
  SqliteStore `eraseUserData` + BosStore `eraseUserData` both sweep
  `installed_slms` by identityId; on-device OPFS blob wiped by
  Phase 4.0 identity-erase + Phase 9.0b uninstall flow proactively.
  New endpoints `GET /api/identities/:id/installed-slms` (decorated
  with registry metadata so shell doesn't need a second round-
  trip), `POST` (binds `expectedHash` to registry's `sourceHash`;
  404 `unknown_pack` / 409 `pack_revoked` for status=installed /
  400 `invalid_install_record`), `DELETE` (identity-scoped; 404 on
  cross-identity; emits `installed_slm.removed`). Shell card
  `#slmInstallSection` on Profile tab between Phase 8.4 push opt-in
  and health-doc: header "🧠 Install a Bharat OS language model"
  + status chip; device profile block (`navigator.deviceMemory` +
  `navigator.storage.estimate()` + runtime probes for
  `llama_cpp_wasm` / `mlc_llm_webgpu` / `onnx_runtime_web`);
  installed list with status badge + bytes + remove button;
  catalogue filtered via `?compatible=true&deviceRamMb=…&freeDisk
  Bytes=…&supportedRuntimes=…` with per-pack tile + install button;
  honest copy spelling out the Phase 9.0c runtime gap. Install
  handler: confirm gate → OPFS+SubtleCrypto probe → stream `fetch`
  → write to OPFS file handle → SHA-256 verify against pack
  `sourceHash` (mismatch → discard blob + status: failed) → POST
  → re-render. Remove handler: confirm → OPFS removeEntry (best-
  effort across paired devices) → DELETE → re-render. SW cache v34
  → v35. §15: bytes never on server; two-layer integrity (shell
  verifies + server defends); revoked packs refused for new
  installs; cross-identity access impossible; one-tap-plus-confirm
  opt-out; audit trail covers register/install/uninstall; operator
  can audit per-worker install state without seeing bytes. **21
  new tests; full suite 798/798** (was 777; batches of 16). Live
  smoke verified end-to-end with Phi-3-mini registry pack + matched-
  hash POST + mismatched-hash 400 + DELETE. ADR 0113. **Install
  pipeline end-to-end demoable**: worker opens Profile → device
  profile → catalogue → tap Install → confirm → progress → SHA
  verify → installed row. Until 9.0c lands the model can't *run*
  but the opt-in flow + DPDP story is real. **OPFS dependency
  introduced** (Chrome/Edge/FF 111+/Safari 17+); older browsers get
  honest "Browser lacks OPFS support" error. **No third-party
  runtime dependency yet** — shell uses only browser-native
  `fetch` + `crypto.subtle` + `navigator.storage`; zero-dep posture
  preserved. **Phase 9.0 progress ~30%**: 9.0a + 9.0b are storage +
  UI scaffolding; 9.0c runtime adapter decided 2026-05-25 — ship
  **llama.cpp-wasm only** for v1 (universal CPU compat; 3-10 tok/s
  accepted; single third-party dep), **lazy-loaded on first Install
  tap** (Phase 2a.8 Tesseract.js pattern; `/shell/` cache unchanged
  for users who never install an SLM). MLC-LLM (WebGPU) deferred
  as future polish; ONNX Runtime Web dropped. ADR 0114 required
  for the choice + distroless-deploy trade-off before any code.
  ~2-3 wks. 9.0d federated-round + mesh-inference integration ~1
  wk.
- Phase 9.0a **Tier-4 SLM model-pack registry — admin-curated
  metadata, public read, compatibility filter; no runtime yet**
  — First sub-phase of the Phase 9.0 arc (ADR 0107 Proposed).
  Ships the registry CRUD + public read API + compat filter
  before the gnarly runtime work so the rest of 9.0 has a stable
  API to build against and the investor demo can show a curated
  SLM catalogue today. New `src/phase1/slm-model-pack.mjs`
  (pure validation, no I/O): `createSlmModelPack` validates +
  normalises pack metadata (Phi-3-mini / Gemma-2B / Llama-3.2
  family etc.); `filterCompatibleSlmModelPacks` excludes revoked
  + RAM-over + disk-under-1.2x-headroom + unsupported-runtime
  packs; `revokeSlmModelPack` soft-deletes (flips status,
  preserves audit trail) + idempotent. Enums exported:
  `SLM_RUNTIMES` (`llama_cpp_wasm`, `mlc_llm_webgpu`,
  `onnx_runtime_web`, `native_aosp`), `SLM_QUANTIZATIONS`
  (`q4_k_m`, `q5_k_m`, `q8_0`, `fp16`, `int4`, `int8`),
  `SLM_LICENSES`, `SLM_CAPABILITIES`. Pack record carries
  `parameterCount` / `quantization` / `diskBytes` (≤ 8 GB Tier-4
  envelope) / `ramRequiredMb` (≤ 16 GB safety cap) / `runtime` /
  `sourceUrl` (HTTPS-only, http: rejected) / `sourceHash`
  (mandatory `sha256:<64-hex>` for Phase 9.0b integrity verify)
  / `license` / `capabilities` / `contextWindow`. Both backends
  grow `slm_model_packs` storage; `slm_model_pack.registered` /
  `slm_model_pack.revoked` ledger events on every CRUD. New
  endpoints: public `GET /api/slm-model-packs` (with
  `?activeOnly=true` / `?compatible=true&deviceRamMb=…&freeDisk
  Bytes=…&supportedRuntimes=csv` filters; response carries
  `totalRegistered`/`totalActive` + the four enum constants so
  shell doesn't need a separate capabilities endpoint); `GET
  /api/slm-model-packs/:id`; admin `POST /api/admin/slm-model-
  packs` (Phase 5.7 bearer; 201 / 400 / 409 duplicate / 503
  admin_disabled); `DELETE /api/admin/slm-model-packs/:id` (200
  / 404). §15: no anonymous packs (admin curation + signed
  ledger); integrity-checked downloads forward (sourceHash
  mandatory); HTTPS-only; soft-delete; Tier-4 envelope cap;
  revoked excluded from compat list; admin write audited end-to-
  end. **No third-party runtime dependency yet** —
  llama.cpp-wasm / MLC-LLM NOT introduced; zero-npm-dep posture
  preserved through 9.0a; the hard call comes in 9.0c. **30 new
  tests; full suite 777/777** (was 747; batches of 16 to dodge
  Windows process-spawn OOM). ADR 0112. **Phase 9.0 arc has
  started**: 9.0b shell download flow + per-identity
  `installed_on_device_slms` table with DPDP cascade (~1-2 wks);
  9.0c runtime adapter (~3-4 wks, gnarly third-party-dep ADR);
  9.0d federated-round + mesh-inference integration (~1 wk).
- Phase 8.4 **shell UI for push subscription opt-in — Phase 7.x
  ships ENABLED; Phase 8 shell arc closes** — Phase 7.0–7.3
  shipped end-to-end VAPID Web Push (JWT signing + AES-128-GCM
  payload encryption + retry/telemetry) but the shell still spoke
  to push the Phase 2a.4 way: `pushManager.getSubscription()`
  read-only, POST without `storeDeliveryKeys: true`, so the server
  stored a `local_notification` placeholder it couldn't push to.
  Phase 8.4 closes the loop. Upgraded `#workerAlertSection` on
  Profile tab (renamed "Job alerts" → "🔔 Bharat OS notifications"
  since it now covers recovery + cash-out + worker-job pushes);
  three-item opt-in list naming each push category mapped to its
  phase (🔑 Recovery / 💰 Cash-out / 🛠 Jobs); post-subscribe
  mode chip showing real mode honestly (green "Real Web Push
  (VAPID)" or amber "Local notifications only"); "Turn off
  notifications" link button gated by `window.confirm`; "How push
  works" collapsible explaining RFC 8291 encryption + delete-on-
  opt-out. Rewrote `enableWorkerAlerts()` in `app.js`: fetches
  VAPID public key via `/api/push-public-key` (returns 503
  `push_disabled` when unset — fallback stays open); clears stale
  subscription before `pushManager.subscribe()` so VAPID-key
  rotation doesn't silently leave operator unable to send;
  `urlBase64ToUint8Array()` helper; honest fallback on subscribe
  failure (private-mode Safari, browser unsupported). New
  `disableWorkerAlerts()`: browser `unsubscribe()` first, then
  server DELETE (order prevents race between server-side delete
  and operator's next push). New `DELETE
  /api/push/subscriptions/:subscriptionId` route reusing existing
  `store.deletePushSubscription` (Phase 7.0 added it for 410-Gone
  auto-cleanup); emits `push_subscription.deleted` ledger event
  bracketing the `push_subscription.saved` from POST; file-store
  `store.mjs` got the same method for backend parity. New CSS
  (`.push-opt-in-list`, `.push-opt-in-mode-real` green, `.push-
  opt-in-mode-local` amber, `.push-opt-in-disable`, `.push-opt-in-
  details`). SW cache v33 → v34. §15: real-push requires explicit
  worker tap; `storeDeliveryKeys: true` only when subscribe
  succeeded; one-tap-plus-confirm disable; idempotent server
  DELETE (200 first, 404 retry); operator-without-VAPID can't
  accidentally store delivery keys; honest mode disclosure
  (never lies "Enabled" in local-only case); audit trail covers
  both create AND delete. `api.test.mjs` updated for renamed card
  copy. Live smoke: `/api/push-public-key` returns 503; shell HTML
  contains new copy; POST creates `local_notification`
  subscription; DELETE returns `{ok:true,deleted:true}` first /
  HTTP 404 retry. **747/747 Node tests still pass** (in batches of
  15 to dodge Windows OOM in parallel `--test`). ADR 0111.
  **Phase 7.x is now actually delivering**: SIM-swap recovery
  push → cash-out paid push → worker job push all fire for any
  worker who tapped Enable, on any operator with VAPID configured.
  **Phase 8 shell arc is done** — 8.0 earnings → 8.1 mesh
  dashboard → 8.2 MFI consent → 8.3 cash-out → 8.4 notifications.
- Phase 8.3 **shell UI for UPI mesh cash-out** — Phase 6.1b shipped
  the mesh-withdrawal endpoints (`GET /mesh/balance`, `POST
  /mesh/withdrawals`, `GET /mesh/withdrawals`) but had no
  worker-facing UI. Phase 8.3 ships the cash-out card on the Earn
  tab between the Phase 8.1 mesh dashboard and the Phase 8.0 manual
  earnings log. New `#meshWithdrawalSection` with: blue-gradient
  balance block (36px tabular-numeric `₹X,XXX.XX` for
  `availablePaise` + unsettled-event count + min-withdrawal
  threshold when applicable); UPI ID input (`autocomplete="off"`
  per §15 — don't autofill, don't prompt save) + [Request
  withdrawal] button + [Refresh balance] link; history list with
  amount, status badge (pending amber / provider_accepted blue /
  paid green / failed red), request date, masked UPI, provider
  reference if available, failure reason if failed; "How cash-out
  works" collapsible explaining the state machine + refund-on-
  failed property. New `setupMeshWithdrawal()` in `app.js` (~150
  lines, follows Phase 8.0/8.1/8.2 pattern; balance auto-refresh on
  tab visit + after every successful request; disabled-state logic
  based on available vs minimum; `window.confirm` gate matching
  Phase 8.2 revoke + Phase 2a.26 reset patterns; UPI cleared on
  success; `toLocaleString('en-IN')` Indian-numbering;
  `escapeHtml()` on provider-controlled fields). New CSS for blue
  gradient panel + tabular-numeric value + 2-col list grid + 4
  status-coloured badge variants. SW cache v32→v33. §15: UPI never
  on ledger / metrics (server enforces); `autocomplete="off"`;
  form clears on success eliminating set-and-forget; explicit
  confirm gate; refund-on-failed communicated honestly; HTML
  escaping. No automated browser tests (same pattern as 8.0/8.1/
  8.2). Live smoke verified: 15 seeded inference events at 1M
  tokens (1600 paise each = ₹120 total) → `/mesh/balance` returns
  `availablePaise: 12000` → POST withdrawal returns `status:
  'pending', amountPaise: 12000, upiIdMasked: 'r***h@hdfcbank'`.
  747/747 Node tests still pass. ADR 0109. **Earn tab story is
  now complete for the mesh-contribution flow.** Real-time ticker
  → monthly retrospective → cash-out to UPI → status visible in
  history. An investor demo can show the full earn-and-spend loop
  without leaving the tab.
- Phase 8.2 **shell UI for MFI income-verification consent issuance**
  — Phase 6.1 shipped the MFI consent endpoints but had no
  worker-facing UI. Phase 8.2 ships the card on the Trust tab (same
  "share data with verifiers" family as the Trust Passport). New
  `#mfiConsentSection` with form (lender name / purpose / FY /
  validity / max-reads), [Issue consent] button → POST creates
  signed envelope, orange post-issuance block shows the
  `mfiFetchUrl` share URL + [Copy] button using
  `navigator.clipboard.writeText`. List below shows each issued
  consent with a status badge (active green / revoked red /
  expired grey / exhausted amber — derived client-side from the
  consent's mutable fields, mirroring Phase 6.1's
  `verifyIncomeVerificationConsent` enum). Per-row [Revoke]
  button on active consents only, gated by window.confirm +
  prompt(reason). FY dropdown populates dynamically from current
  date with offsets covering current + 2 prior FYs; defaults to
  just-ended FY since that's what an MFI assesses for annual
  income. New `setupMfiConsent()` in app.js (~170 lines, follows
  Phase 8.0/8.1 pattern). New CSS for issued-block + share-URL
  monospace input + per-row status badges. SW cache v31→v32. §15:
  worker controls consent (no auto-issuance); status badge is
  client-side advisory (server still enforces on read); HTML
  escaping; share URL is worker's responsibility (bearer-token
  per Phase 6.1). No automated browser tests (same pattern as
  Phase 8.0/8.1). Live smoke verified end-to-end: POST returns
  201 + mfiFetchUrl, GET lists the new consent. 747/747 Node
  tests still pass. ADR 0108. **MFI flow now demoable
  end-to-end**: worker logs earnings → Trust tab → issues
  consent → copies share URL → MFI fetches signed bundle. Trust
  tab now hosts two complementary flows.
- Phase 8.1 **shell UI for the mesh-contribution dashboard —
  monthly retrospective surface** — Phase 6.0b shipped the
  `aggregateMeshByMonth` + `/mesh/summary?month=` substrate but had
  no worker-facing UI. Phase 8.1 ships the monthly retrospective
  card. New `#meshDashboardSection` on the Earn tab between the
  real-time mesh ticker and the Phase 8.0 manual earnings log.
  Card has: month picker (defaults to current, no future months) +
  Refresh button; headline block with large `₹X,XXX.XX` total in
  accent green + "N working days · M events" meta line; per-workload
  breakdown (only nonzero categories — 🧠 Inference, 💾 Storage
  serve, 🗄️ Storage store, 🧪 Federated rounds); daily timeline
  as a mini bar chart (date / scaled bar / rupees right-aligned).
  New `setupMeshDashboard()` in `app.js` (~120 lines, follows the
  Phase 8.0 pattern; `state.deviceOwnerId` scoping; Indian-numbering
  output via `toLocaleString('en-IN')`; HTML-escapes workload
  labels as defence-in-depth). New CSS for the headline gradient
  + breakdown rows + 3-column timeline grid with inline-styled bar
  widths. SW cache v30→v31. §15: identity-scoped; aggregates only
  (no raw events in UI); HTML escaping; no new PII surface. No
  automated browser tests (same pattern as Phase 8.0). Live smoke
  confirmed with 5 seeded inference events → API returns 8000
  paise + 5 daily timeline rows. 747/747 Node tests still pass.
  ADR 0106. **Earn tab now flows: real-time ticker → monthly
  retrospective → manual log → federated rounds. The
  compounding-earnings narrative the substrate was always
  designed to surface is now visible to investors.**
- Phase 8.0 **shell UI for the earnings tracker — first user-visible
  surface of the Phase 5.9+ growth arc** — Phases 5.9 through 7.3
  shipped ~10 API substrates but ZERO worker-facing shell UI. An
  investor demo opening `localhost:8787/shell/` saw nothing
  user-visible from those phases. Phase 8.0 opens the Phase 8 arc
  by picking the foundational UI piece — the earnings tracker. New
  `#earningsLogSection` card on the Earn tab with five form fields
  (category select / amount in ₹ / hours optional / date / note)
  and two action buttons (Save → POST /api/identities/:id/earnings,
  Monthly summary → GET .../earnings/summary). Below: list of 30
  most-recent entries with per-entry delete buttons + summary
  block rendering Phase 6.0a's `monthlyStatement` output. New
  `setupEarningsLog()` in `app.js` (~110 lines, pure DOM + fetch,
  no new library; follows existing setup-function pattern; uses
  `state.deviceOwnerId` to scope every call; HTML-escapes notes
  for XSS prevention). New CSS rules in `styles.css` for the form
  + list + summary; mobile-first stacking at <380px. SW cache v29
  → v30. §15: data is user-typed not scraped (card copy says so
  explicitly); identity-scoped via localStorage; integer paise on
  submit; HTML escaping; no new PII surfaces. **No automated
  browser tests** — codebase has no existing browser-test
  infrastructure (per Phases 2a.25/2a.26/4.4/4.5 pattern). Live
  smoke confirmed: shell loads with new card; styles.css contains
  new rules; all 747 Node tests still pass. ADR 0105. **A worker
  opening `/shell/` can now actually log earnings — investor demo
  path is real**: install → identity wizard → Earn tab → log
  delivery → see it appear → monthly summary. Sets the UI pattern
  for subsequent Phase 8.x cards (mesh dashboard, MFI consent,
  UPI cash-out, push opt-in).
- Phase 7.3 **Web Push adaptive retry + per-vendor telemetry —
  closes Phase 7's observability+reliability story** — Phases
  7.0/7.1/7.2 shipped real Web Push delivery + reusable helper +
  §9A wiring. ADR 0101 future-work flagged two missing layers:
  adaptive retry on transient errors + per-vendor health
  telemetry mirroring SMS's Phase 5.3 observability. Phase 7.3
  ships both as additive layers (all 35 prior Phase 7 tests still
  pass). **Per-vendor telemetry**: new metric `bos_push_send_total
  {vendor, outcome}` (mirrors `bos_sms_send_total`); `pushVendor`
  helper maps endpoint host to vendor family (`fcm` / `autopush`
  / `wns` / `mock` / `other`); 6-value outcome enum (`success`,
  `gone`, `rate_limited`, `rejected`, `network_error`,
  `retried_success`). **Adaptive single-retry** in `sendWebPush`:
  honors `Retry-After` per RFC 7231 (delta-seconds OR HTTP-date)
  with 60s cap to prevent rogue-header denial-of-service; fixed
  1s baseline for 5xx + network errors; **maximum 2 attempts per
  invocation** (recursive call passes `retry: false`); test seam
  via injectable `sleep`. New `parseRetryAfterMs` helper handles
  all edge cases (delta-seconds, HTTP-date, missing, past-date,
  rogue >60s). `retry: false` opt-out for single-attempt callers.
  §15: no PII in metric labels (vendor + outcome are bounded
  enums; endpoint URL never appears); retry re-runs same
  E2E-encrypted POST; `retried_success` separate from `success`
  so ops can distinguish flapping from nominal. 747/747 tests
  (+16 new — including the **persistent-429 test** that proves
  retry hard-caps at 2 attempts AND the **retry-with-injected-
  sleep test** that proves Retry-After is honored). ADR 0104.
  **Three-axis Web Push observability now matches the SMS
  stack**: delivery (Phase 7.0), per-event audit ledger (Phase
  7.1), per-vendor success-rate counter (Phase 7.3). FCM
  429-bursts heal automatically.
- Phase 7.2 **§9A worker-notification VAPID delivery — closes ADR
  0053's `vapidIntegrated: false` gap** — Phase 2a.4 (August 2025)
  scaffolded the §9A worker-notification envelope but stopped at
  local service-worker notifications because real Web Push didn't
  exist. All four prerequisites (VAPID, endpoint storage, retries
  + unsubscribe, production integration) now exist via Phase 7.0/7.1.
  Phase 7.2 wires them. `POST /api/worker-notifications` handler
  now calls `sendPushToIdentity` with a `worker_job_alert` payload;
  the notification record's `delivery` block flips based on
  outcome through five state branches: delivered_web_push (HTTP
  201), web_push_failed (HTTP 502 — partial failure), scaffold-
  only fallback (Phase 2a.4 backward-compat path, no push),
  blocked_no_subscription (HTTP 202), VAPID-unset graceful
  degradation. Notification urgency maps to push HTTP `Urgency`
  header (`high` for time-sensitive job alerts vs `normal` for
  routine matches). §15: notification content's no-PII contract
  from ADR 0053 (`exactLocationIncluded: false` etc.) extends
  into the push body verbatim. 731/731 tests (+5 new — including
  the **end-to-end §9A push delivery test** that proves the
  scaffold's `vapidIntegrated: false` flips to `true` after real
  delivery, PLUS the scaffold-only-fallback test proving ADR
  0053 backward compat, PLUS the VAPID-unset graceful-degradation
  test, PLUS the urgency-passthrough test). ADR 0103. **§9A loop
  is fully operational — workers actually get job alerts now,
  not demos.**
- Phase 7.1 **push alerts for audit-significant events — three new
  wire-points + reusable `sendPushToIdentity` helper** — Phase 7.0
  shipped the SIM-swap detection push as ~60 lines of inline
  boilerplate; adding a new push event meant copying it. Phase 7.1
  extracts the pattern + wires three new high-signal moments.
  New `sendPushToIdentity(store, identityId, payload, opts)` in
  `src/phase0/web-push.mjs`: encapsulates VAPID config check →
  subscription load → per-subscription `sendWebPush` → typed
  ledger event → 410-Gone auto-unsubscribe → error swallowed
  per-subscription. Returns `{ skipped, sent, failed, unsubscribed,
  attempted }`. **Safe-default**: VAPID unset → silent skip (no
  exception, no error log); caller's primary action never breaks.
  **Audit-by-default**: every attempt emits a `<ledgerType>` or
  `<ledgerType>.failed` ledger event with masked endpoint +
  pushStatus + payloadType. **Phase 7.0 recovery push refactored**
  to use the helper — ~60 lines → 5 lines; all 22 Phase 7.0 tests
  still pass. **Three new push wire-points**: (1) `cooldown_override
  .applied` → push "Your cooldown was lifted by Bharat OS support
  — was this you?" (catches corrupt-admin-token scenarios on top
  of the original recovery push); (2) `mesh_withdrawal.paid` →
  push "₹500.00 sent to your UPI r***h@hdfcbank, Reference:
  razorpay-12345"; mesh_withdrawal.failed → high-urgency push
  with refund notice; (3) `income_verification_bundle.read` → push
  "Bajaj Finserv just read your income summary" (catches stolen
  consentId bearers in near-real-time). §15: push body NEVER
  contains PII (only masked identifiers + behavioural cues);
  full audit trail; graceful degradation when VAPID unset. 726/726
  tests (+8 new — including the graceful-degradation test that
  proves the full MFI-fetch flow works with ZERO pushes when
  VAPID unset). ADR 0102. **Three-layer SIM-swap detection
  compounds**: (1) Phase 5.2 cooldown, (2) Phase 7.0 recovery
  push, (3) Phase 7.1 cooldown-override push. Adding a new
  push event is now a 5-line patch.
- Phase 7.0 **Web Push (VAPID) notifications — SIM-swap defense loop
  fully closed** — Phase 5.2 gated destructive actions for 24h after
  recovery, but the legitimate user only knew their account was
  recovered when they next logged in. Phase 7.0 ships the push-side
  detection signal. New `src/phase0/web-push.mjs` implements RFC 8030
  + 8291 + 8292 **from scratch** on Node 20+'s built-in `crypto` —
  **zero new npm dependencies** (consistent since Phase 5.1). VAPID
  JWT (ES256, JWK-format keypair → Node `createPrivateKey({ format:
  'jwk' })`, raw r||s 64-byte JOSE signature via `derToJose`). Payload
  encryption: AES-128-GCM keys via HKDF-SHA-256 over ECDH-P256 shared
  secret + 16-byte auth; RFC 8188 `aes128gcm` content-encoding. HTTP
  send with `vapid t=<jwt>, k=<pubkey>` auth header. `maskEndpoint`
  (`fcm.../xxxx23`) mandatory for audit/ledger/metric. Phase 2a.4
  scaffold extended with `storeDeliveryKeys: true` opt-in (defaults
  to no-store for backward compat). New `deletePushSubscription`
  store method for 410-Gone auto-cleanup. New `GET /api/push-public-
  key` endpoint (503 push_disabled when VAPID unset). `/api/push/
  subscriptions` POST extended. **Wired into `/api/recovery/verify`
  success path**: reads paired-device subscriptions, sends high-
  urgency `account_recovery_alert` push to each, emits
  `recovery_alert.pushed` ledger event with masked endpoint;
  best-effort (failures don't block recovery). New
  `scripts/generate-vapid-keys.mjs` prints ready-to-paste .env
  snippet. New env vars: `BHARAT_OS_VAPID_PUBLIC_KEY` +
  `_PRIVATE_KEY` + `_SUBJECT`. §15: subscription endpoints
  device-identifying PII (opt-in storage + masked everywhere except
  stored record + outbound fetch); payload E2E-encrypted (push
  service can't read); VAPID claims have no user data; alert
  payload no PII; 410 Gone auto-unsubscribes; DPDP cascade. 718/718
  tests (+22 new — including the **full E2E recovery push** that
  proves the wire-level flow end-to-end). ADR 0101. **SIM-swap
  attacker who recovers gets ZERO destructive actions (Phase 5.2
  cooldown) AND the legitimate user knows within seconds (Phase
  7.0 push). Web Push in ~600 lines of code, zero deps.**
- Phase 6.3 **state e-Shram + welfare-scheme entitlement substrate
  — ADR 0096 growth-arc plan now fully shipped** — e-Shram (Ministry
  of Labour & Employment) has registered ~300M unorganised workers,
  each holding a 12-digit UAN linked to welfare schemes (PMJJBY,
  PMSBY, PM-SYM, PMJAY, MGNREGA, PMAY, NSAP). The partnership is
  out-of-tree; the substrate ships here. New
  `src/phase1/eshram-registration.mjs`: `createEShramRegistration`
  (Ed25519-signed; 12-digit UAN validated; **`maskUan` →
  `xxxx-xxxx-1098` mandatory for any audit/ledger/metric surface**;
  8 occupation categories; 6-band coarse income bracket — NEVER
  precise amounts; NCO code; state/district),
  `createSchemeEntitlement` (9 scheme codes incl. STATE_WELFARE +
  OTHER; benefit in INTEGER paise; `validThrough` separate from
  attestation `expiresAt`), `verifyEShramRegistration` /
  `verifySchemeEntitlement` (status enum: valid / expired / revoked
  / signature_invalid / unknown_issuer / malformed +
  `scheme_validity_expired` distinct), revoke functions,
  `filterBlessedEShramRegistrations` / `filterBlessedSchemeEntitlements`
  (REUSES Phase 6.2 blessed-collectives registry as the generalised
  "blessed issuers" trust list). Two new SqliteStore tables + DPDP
  cascade. **Six new API endpoints**: POST/GET issue + list + revoke
  for both registrations and entitlements. **MFI bundle (Phase
  6.1/6.2) extended** with `credibility.verifiedEShramRegistrations`
  (uanMasked ONLY) + `verifiedSchemeEntitlements`. §15: UAN masked
  everywhere except the stored record; **Aadhaar NEVER stored** —
  not requested, not accepted, not in schema; income bracketed not
  precise; cross-issuer revoke 404; **tests assert raw UAN is
  ABSENT from full bundle JSON**. 696/696 tests (+23 new — including
  the **full end-to-end test**: bless 2 issuers → labour dept issues
  registration → NHA issues PMJAY → worker issues MFI consent → MFI
  fetches bundle → both surface with masked UAN + raw-UAN-absent
  assertion). ADR 0100. **The ADR 0096 growth-arc plan is now fully
  shipped end-to-end** — Phases 6.0a + 6.0b + 6.0c + 5.9 + 6.1 +
  6.1b + 6.2 + 6.3 all complete. The substrate any growth-arc
  partnership consumes (single-player tools through state-government
  integration) is in production; partnership work itself is
  out-of-tree, but every potential partner has one curl that
  integrates them.
- Phase 6.2 **worker-collective membership substrate — SEWA / IFAT
  partnership conversation has a code answer** — ADR 0096's Phase
  6.2 plan was worker-collective distribution. The partnership is
  out-of-tree but the substrate ships here. New
  `src/phase1/collective-membership.mjs` with three primitives,
  cleanly separated: `createMembershipAttestation` (Ed25519-signed
  by the collective; 7 enumerated member roles; region capped at
  ~1km city/district precision matching Phase 5.9 GPS;
  default 365-day TTL; refuses self-membership),
  `verifyMembershipAttestation` (status enum: `valid` / `expired` /
  `revoked` / `signature_invalid` / `unknown_collective` /
  `malformed`), `revokeMembershipAttestation` (collective burns a
  membership — worker left the union; reason ≥ 4 chars).
  **Blessed-collectives registry** completely decouples protocol
  (anyone can sign) from trust policy (only blessed ones surface in
  consuming flows). `createBlessedCollectiveRecord` admin-issued;
  `filterBlessedMemberships` returns the active-AND-blessed
  subset. Two new SqliteStore tables + DPDP §12(3) cascade. **Six
  new API endpoints**: POST issue membership (emits typed ledger
  event), POST revoke (non-issuer → 404 no-ownership-leak), GET
  list, GET blessed-collectives (public trust list), POST admin
  bless (Phase 5.7 admin-auth gated; verifies collective identity
  exists), DELETE admin unbless. **MFI bundle (Phase 6.1) extended**
  with `credibility.verifiedCollectiveMemberships` — only memberships
  from blessed collectives that are currently valid; the trust-list
  filter happens server-side so rogue attestations cannot bleed
  through. §15: collective signs but data lives on member's record
  (DPDP-exportable + deletable); region capped at neighbourhood;
  cross-issuer revoke 404; full audit trail. 673/673 tests (+26
  new — including the **full end-to-end** test: bless SEWA →
  SEWA issues membership → worker issues MFI consent → MFI fetches
  bundle → bundle surfaces verified membership). ADR 0099. **When
  SEWA / IFAT / NDLF asks "what does Bharat OS give us?", the
  answer is concrete: an endpoint your office hits to issue
  verifiable credentials; those credentials surface in the worker's
  Trust Passport + the MFI bundle + any consuming aggregator —
  without per-partner integration code.**
- Phase 6.1b **UPI cash-out for mesh earnings — workers can finally
  turn accumulated mesh paise into real rupees** — Phase 6.0b
  promoted the mesh dashboard but earnings never left the system.
  Phase 6.1b ships the substrate any UPI payout partner (Razorpay X
  / Cashfree Payouts / Decentro) consumes without per-partner
  integration code. New `src/phase1/mesh-withdrawal.mjs`:
  `isValidUpiId` + `maskUpiId` (raw UPI NEVER outside the stored
  record + outbound payout call), `computeAvailableBalance` (sums
  payout of events NOT bundled into a non-failed withdrawal —
  **failed withdrawals' events automatically return to the pool**
  so partner-side failures don't strand balance),
  `createWithdrawalRequest` (Ed25519-signed envelope bundling
  ALL unsettled events; ₹10 floor / ₹10L ceiling; deterministic ID),
  `verifyWithdrawalRequest` (strips mutable state fields before
  verification so post-signing transitions don't invalidate).
  **Four-status state machine** — `pending` → `provider_accepted` →
  `paid` (or → `failed`), with a fast-path `pending → paid` for
  synchronous partners. `markWithdrawalAccepted/Paid/Failed` enforce
  valid-transitions-only. New SqliteStore `mesh_withdrawals` table
  + DPDP cascade. **Seven new API endpoints**: worker side
  (`GET /mesh/balance`, `POST /mesh/withdrawals` with structured
  error codes, `GET /mesh/withdrawals`); admin side (Phase 5.7
  admin-auth gated; `POST /admin/mesh/withdrawals/:id/accepted` +
  `/paid` + `/failed`). Each transition emits typed ledger event
  with operator attribution + masked UPI ID. §15: worker signs every
  withdrawal (no silent payouts); UPI masked everywhere except the
  stored record; idempotent settlement via event-locking; failed
  payouts refundable automatically; DPDP cascade extends. 647/647
  tests (+27 new — including the **full pending → paid round-trip**
  with operator audit + the **failed → events-return-to-pool**
  proof). ADR 0098. **Phase 6.1 fully shipped — MFI consumption
  (6.1) + UPI cash-out (6.1b) both complete. The payout-partner
  integration is one operator curl, not an SDK.**
- Phase 6.1 **MFI-consumable income-verification bundle + worker-issued
  consent — the first hard-rupee external incentive** — ADR 0096's
  Phase 6.1 plan paired MFI partnerships with UPI cash-out. The MFI
  piece ships first. Workers who have logged earnings (6.0a) +
  mesh contributions (6.0b) + portable attestations (5.9) can now
  authorize a named MFI to read a signed income summary — the
  substrate any lender can consume for KYC-supplementary income
  proof without Bharat OS having to integrate per-partner first.
  New `src/phase1/income-verification.mjs`:
  `createIncomeVerificationConsent` (Ed25519-signed; default 30-day
  TTL, single-use; rejects oversized mfiName since silent
  truncation could mislead the worker),
  `verifyIncomeVerificationConsent` (status enum: `valid` / `expired`
  / `revoked` / `exhausted` / `signature_invalid` /
  `unknown_worker`), `buildIncomeVerificationBundle` (filters to
  worker + FY window April-March; aggregates totals + per-category
  + working days + mesh payout + per-tier attestation counts; signs
  with worker's key), `verifyIncomeVerificationBundle` (signature
  round-trip for MFI-side validators), `revokeIncomeVerificationConsent`,
  `recordConsentRead`. **Mandatory disclaimer on every bundle**:
  "earnings TYPED BY THE WORKER (not scraped); portable attestations
  at three quality tiers; Bharat OS does NOT verify identity
  (Aadhaar does that) and does NOT guarantee performance." New
  SqliteStore `income_verification_consents` table + DPDP cascade.
  Four new API endpoints: POST `/consents` (worker issues),
  GET `/consents` (worker lists), POST `/consents/:id/revoke`
  (worker burns; **non-issuer attempts return 404 not 403** so
  cross-user probing can't reveal whether a consentId exists),
  GET `/api/income-verification/:consentId` (MFI fetch — verifies
  consent, builds FRESH bundle on every fetch (never cached),
  increments read count, returns 410 Gone on
  expired/revoked/exhausted). §15: worker controls MFI access via
  signed consent; MFI cannot silently poll (single-use bearer);
  bundle is aggregates not raw entries; full audit trail in typed
  ledger with `mfiName` so ops can detect anomalous reads. 620/620
  tests (+25 new). ADR 0097. **A worker with 6 months of earnings
  + 200 signed attestations can now hand a single consentId to an
  MFI; that MFI fetches a verifiable signed income summary, reads
  it once, decides on a loan — all without Bharat OS doing a
  per-partner integration.**
- Phase 5.9 **portable work-history attestation via worker-initiated
  QR handshake — the two-sided network turns on** — Phase 6.0 gave
  workers single-player reasons to install Bharat OS; Phase 5.9
  layers the two-sided attestation flow on top. New
  `src/phase1/portable-attestation.mjs`: `createPortableAttestationToken`
  (deterministic token ID, 1h TTL, GPS truncated to ~1.1km
  precision), three signing tiers — `signTier0` (anonymous tap, IP
  hashed never stored raw), `signTier1` (OTP-confirmed via Phase
  4.3, phone hashed never stored raw), `signTier2` + `verifyTier2`
  (customer signs canonical payload locally with their Ed25519
  private key — server only verifies). **All tiers refuse double-
  signing (409) and expired tokens (410). Self-signing refused.**
  `aggregateAttestationsForWorker` returns tier breakdown +
  fraud signals (repeatedPhoneShare, repeatedIpShare,
  tier0DominanceShare). **ADDITIVE-ONLY** — no negative attestation
  path; absence of signatures is not a negative signal (avoids
  entrenching class bias). New SqliteStore `portable_attestations`
  table with DPDP cascade integration. **Seven new API endpoints**:
  `POST /api/portable-attestation/init` (worker generates token +
  QR), `POST sign-tier0` (anonymous tap), `POST sign-tier1/send` +
  `verify` (OTP flow), `GET sign-tier2/payload` + `POST sign-tier2`
  (customer signs locally, server verifies),
  `GET /api/identities/:id/portable-attestation/summary` (what
  consuming aggregators read). **Static signing page** at
  `/sign/<tokenId>` (`public/signs/`) — no Bharat OS install
  required for the customer; deep-links into the app for Tier 2.
  Cross-user isolation: alice asking for bob's summary sees zero
  events. §15: customer phone never on worker's record (hashed),
  customer private key never on the server (Tier 2 client-side
  signing), additive-only constraint hard-coded, mandatory
  disclaimer in init response surfaces "we do NOT verify identity
  or guarantee performance." 595/595 tests (+31 new — including
  full Tier-2 round-trip via real Ed25519 signing). ADR 0095
  Accepted. **The two-sided attestation network is live; a rider
  switching from Swiggy to Zomato now walks in with verifiable
  history instead of starting at zero.**
- Phase 6.0c **year-end tax helper — Indian income-tax math + 44AD
  presumptive + GST threshold flag — completes ADR 0096** —
  Phase 6.0c ships the third and final single-player worker tool,
  closing out ADR 0096. New `src/phase1/tax-summary.mjs` ships
  **FY 2025-26 / AY 2026-27** rate tables: `computeTaxNewRegime`
  (default since FY 2023-24; slabs ₹0-3L 0% / 3-7L 5% /
  7-10L 10% / 10-12L 15% / 12-15L 20% / >15L 30%; ₹75K std
  deduction; 87A rebate up to ₹25K wipes tax for taxable ≤ ₹7L —
  the rebate cliff is pinned in tests; 4% cess),
  `computeTaxOldRegime` (opt-in for comparison),
  `computePresumptive44AD` (Section 44AD — **6% profit when ≥95%
  digital receipts**, 8% otherwise; turnover ceiling raised to ₹3
  crore in FY 2025-26 for digital businesses — the right framing
  for delivery riders / drivers / service trades),
  `computePresumptive44ADA` (specified-profession 50%),
  `gstThresholdCheck` (services ₹20 lakh / goods ₹40 lakh),
  `taxSummary` (end-to-end: filters earnings to FY window
  April-March; computes new + old + 44AD comparison; surfaces
  cheapest-option recommendation; ALWAYS includes a mandatory
  `disclaimer` field). New endpoint
  `GET /api/identities/:id/tax/summary?financialYear=YYYY-YY`.
  §15: tax math is LOCAL (could run in browser too); PAN is NEVER
  stored; we NEVER auto-file; every output urges "CONSULT A
  CHARTERED ACCOUNTANT BEFORE FILING." 564/564 tests (+26 new
  including canonical slab-walk-through verifications + the
  ₹7L 87A rebate cliff at gross ₹7,75,001 + 44AD presumptive
  ceiling boundaries + 6 live HTTP integration tests). **ADR 0096
  is now fully Accepted — all three single-player worker tools
  (earnings + mesh dashboard + tax helper) shipped across Phases
  6.0a / 6.0b / 6.0c.** ADR 0096. **A gig worker can install
  Bharat OS, log earnings throughout the year, and at FY-end see
  exactly which regime/option is cheapest — all without external
  integration, no PAN stored, no auto-filing.**
- Phase 6.0b **mesh-contribution dashboard — promotes existing Phase
  3.x substrate to a first-class earn surface** — Phase 3.x ships
  `createMeshContributionEvent` and the all-time
  `meshContributionSummary`, but to see "what did I earn each day
  this month?" required a full event scan in the shell. Phase 6.0b
  adds the time-windowed aggregation. Extends
  `src/phase1/mesh-contribution.mjs` with `aggregateMeshByMonth`
  (filters by operator + month; returns totalPaise + per-workload
  breakdown + ascending daily timeline + first/last event
  timestamps; tolerates malformed events) and `meshMonthlyStatement`
  (human-readable text mirroring the 6.0a earnings-tracker
  statement shape). New endpoint
  `GET /api/identities/:id/mesh/summary?month=YYYY-MM`. Cross-user
  isolation: Bob asking for Alice's summary sees zero events, not
  404 (consistent with the existing privacy pattern that
  per-user data simply doesn't surface for the wrong user). §15:
  identity-scoped; paise integers; no PII in the response. 538/538
  tests (+16 new — 10 module unit + 6 end-to-end live HTTP).
  ADR 0096 status: 2/3 tools shipped (earnings + mesh dashboard
  done; tax helper pending). **A worker can now see month-by-month
  mesh earnings broken down by day — no aggregator integration
  needed.**
- Phase 6.0a **cross-platform earnings tracker — single-player wedge
  that unblocks the two-sided cold start** — Phase 6.0 (ADR 0096)
  ships the growth-arc opener: three single-player tools that give
  workers a reason to install Bharat OS BEFORE the two-sided
  attestation network (Phase 5.9) exists. Phase 6.0a ships Tool 1.
  New `src/phase1/earnings-log.mjs` pure-function module:
  `createEarningsEntry` with strict validation (ISO dates not in the
  future, 5-category enum `delivery/ride/service/cash/other`,
  **amounts in INTEGER paise** not float rupees to avoid currency
  rounding bugs, per-day ₹1 crore sanity ceiling),
  `aggregateByMonth` (sum + per-category + effective hourly rate),
  `monthlyStatement` (human-readable text for landlord / MFI /
  accountant). New SqliteStore `earnings_log` table indexed on
  `identity_id` + `date` + `category`. Four API endpoints: POST/GET/
  GET-summary/DELETE under `/api/identities/:id/earnings`. DPDP
  end-to-end: export + erasure cascade automatically include
  earnings; cross-user delete returns 404 to avoid leaking entry
  existence. §15: data is user-typed not scraped (sidesteps every
  aggregator TOS); coarse 5-category enum prevents per-platform
  fingerprinting; identity-scoped. 522/522 tests (+31 new — 12
  module unit + 3 store + 2 DPDP integration + 7 live HTTP + 7
  misc). Also hardened `SqliteStore.verifyIntegrity` to spray
  corruption across page headers (single-region corruption stopped
  detecting after the schema grew) and catch PRAGMA-throw cases.
  ADR 0096 status: Partially Implemented. **A gig worker can now log
  daily earnings across Swiggy / Zomato / Rapido / cash gigs and
  get a monthly statement they can show a landlord — no customer
  participation needed. The two-sided cold start is unblocked.**
- Phase 5.8 **SMS bulkhead (per-provider concurrency cap) +
  in-flight gauge — closes Phase 5.4 future-work** — Phase 5.4
  shipped timeouts + circuit breakers but a slow-but-not-yet-timing-
  out vendor (2.5s response floor under the 3s timeout) could
  accumulate dozens of concurrent in-flight fetches under a storm,
  exhausting the event loop. Phase 5.8 caps it. New
  `createBulkheadProvider(provider, { maxConcurrent })` factory —
  per-provider counter, no queue (queueing adds latency AND defeats
  the fallback chain's "any vendor" goal). At capacity, throws
  `SMS_PROVIDER_BULKHEAD_FULL` so the chain falls through. Default
  10 concurrent via `BHARAT_OS_SMS_BULKHEAD_MAX`. Wrapper stack now
  `bulkhead → breaker → telemetry → vendor` (bulkhead outermost so
  busy-vendor calls don't pollute the breaker's failure threshold).
  Fallback chain treats `BULKHEAD_FULL` as recoverable alongside
  NOT_CONFIGURED / REJECTED / CIRCUIT_OPEN. New Prometheus gauge
  `bos_sms_inflight{provider}` — alert rule
  `bos_sms_inflight{provider="..."} >= max for 30s` catches hung
  vendors. Three-axis SMS observability: rate
  (`bos_sms_send_total`), state (`bos_sms_circuit_state`),
  saturation (`bos_sms_inflight`). §15 — bulkhead never touches
  phone/body; fast-fail-over-queue means no in-memory ring of
  pending OTPs. Worst-case memory: 40 sockets per process under
  storms. 491/491 tests (+7 new — using a `controllableProvider`
  that hangs on a manually-resolved deferred to drive concurrency
  without sleeps). ADR 0094. **Bounded memory under OTP storms;
  three-axis vendor health visibility.**
- Phase 5.7 **ops admin endpoints — circuit reset, cooldown override,
  manual snapshot** — Phases 5.2/5.4/5.5 shipped helpers
  (`clearRecoveryCooldown`, `resetCircuit`, `store.snapshotTo`) but
  never wired them to HTTP. Operationally awful for incident
  response — SREs had to ssh in to run one-off scripts. Phase 5.7
  ships thin HTTP wrappers + a shared auth gate. New
  `src/phase0/admin-auth.mjs` — `BHARAT_OS_ADMIN_TOKEN` shared-secret
  bearer auth with constant-time comparison, 16-char minimum,
  safe-default 503 when unset (no accidental exposure). Optional
  `X-Bharat-Os-Operator` header for audit attribution. Three
  endpoints: `POST /api/admin/sms/circuit/reset` (body `{ provider? }`;
  emits `sms.circuit.reset`), `POST /api/admin/identities/:id/recovery-
  cooldown/clear` (body `{ reason }` 8-char min — friction-by-design
  so the operator articulates the override; emits
  `cooldown_override.applied` with reason + priorCooldownUntil),
  `POST /api/admin/backup/snapshot` (runs the same
  snapshotTo → verifyIntegrity → applyRetention pipeline as the
  cron CLI; emits `backup.snapshot.created`). All three under the
  `write` rate-limit policy. §15 audit binding — every admin action
  is in the typed ledger so token compromise is detectable
  post-hoc. 484/484 tests (+17 new — including 6 end-to-end live
  HTTP tests that boot `createPhase0ApiServer` on a random port and
  curl real fetch calls; first API-server boot tests in the
  codebase). ADR 0093. **SIM-swap incident response is now a
  1-minute curl-from-jumphost flow; vendor outage recovery is one
  POST; planned-migration snapshots are operator-initiated.**
- Phase 5.6 **snapshot integrity verification + restore CLI +
  backup-age Prometheus gauge — closes Phase 5.5's future-work** —
  Phase 5.5 shipped snapshots but left three gaps. (1) Without
  integrity verification a corrupt write produces a corrupt snapshot
  that silently destroys recovery. (2) Without a restore CLI,
  operators do raw `cp` and skip steps. (3) Without a `/metrics`
  age gauge, Grafana-only deployments can't alert on backup
  freshness. Phase 5.6 ships all three. New `store.verifyIntegrity
  (targetPath?)` on both backends (SqliteStore uses
  `PRAGMA integrity_check`; BosStore checks dir + identities/
  subdir). `scripts/snapshot-store.mjs` runs integrity check inline
  AFTER snapshotTo — on failure removes the bad snapshot, skips
  retention (preserves prior good snapshots), exits 1 so cron trips.
  New `scripts/restore-store.mjs` — symmetric inverse: validates →
  sidelines live db to `bos.db.pre-restore-<ts>` → copies snapshot
  → re-verifies integrity. Sideline preserved for rollback. Three
  new Prometheus gauges in `/metrics`:
  `bos_backup_latest_timestamp_seconds` (unix epoch),
  `bos_backup_latest_age_seconds` (NaN when no snapshot — Grafana
  "no data" idiom), `bos_backup_latest_bytes`. Refresh on every
  scrape so Prometheus-only deployments work without
  `/api/admin/backup-status` traffic. Alert rule:
  `bos_backup_latest_age_seconds > 90000`. §15 binding extension —
  integrity check never reads row content; pre-restore sideline IS
  user data and operators must treat it under DPDP §12(3) retention.
  Zero new runtime deps. 467/467 tests (+11 new — including
  middle-of-file byte-corruption detection that proves
  `PRAGMA integrity_check` actually catches a damaged snapshot).
  Live restore CLI smoke confirmed end-to-end. ADR 0092. **Silent
  backup corruption is no longer possible; restore is scripted with
  rollback; Grafana sees backup freshness from one endpoint.**
- Phase 5.5 **online backup snapshots + Litestream sidecar — durability
  for launch** — Phase 4.6's launch runbook flagged backup as future
  polish; without it a single disk failure on the launch host was
  total data loss. Phase 5.5 ships `store.snapshotTo(targetPath)` on
  both backends — SqliteStore uses `VACUUM INTO 'path'` (consistent
  online snapshot, single file, no WAL companion); BosStore uses
  `fs.cp recursive`. New `scripts/snapshot-store.mjs` CLI:
  backend-agnostic, timestamped path under `<root>/backups/`,
  retention (default 7), exit-code-driven for cron healthchecks.
  New `src/phase0/backup.mjs` ships `snapshotPath` (Windows-safe
  timestamps), `listSnapshots` (newest-first), `applyRetention`.
  New endpoint `GET /api/admin/backup-status` returns snapshot
  count + latest `ageSeconds` for ops dashboards (Grafana alert on
  `ageSeconds > 90000` = no snapshot in >25h). `docker-compose.yml`
  gains a commented-out Litestream sidecar for opt-in continuous WAL
  replication to S3-compatible storage (Backblaze B2, Wasabi, AWS S3,
  Cloudflare R2). `.env.example` documents both local-cron + sidecar
  configs. §15 binding extension — snapshots ARE user data, operators
  must treat backup destinations under DPDP residency rules; the ADR
  calls this out explicitly. Zero new runtime deps. 456/456 tests
  (+15 new — including snapshot → re-open → round-trip identity
  verification that proves restore actually works). Live CLI smoke
  confirmed (376KB snapshot in 6ms). ADR 0091. **One disk failure
  is no longer a single point of total data loss; the production
  deploy has a working DR story.**
- Phase 5.4 **SMS per-call timeout + circuit breaker — fast-fail when
  a vendor breaks** — Phase 5.3's fallback chain still PROBED every
  broken vendor in turn, so a 30-second Gupshup hang meant 30+s OTPs
  even with MSG91 healthy behind it. Phase 5.4 ships per-call
  `fetchWithTimeout` (AbortController-based; 3s default via
  `BHARAT_OS_SMS_TIMEOUT_MS`) mapping timeout → `SMS_PROVIDER_REJECTED`,
  PLUS a per-provider circuit breaker. After N consecutive REJECTED
  failures (default 5; `BHARAT_OS_SMS_CIRCUIT_THRESHOLD`) the circuit
  opens — subsequent calls short-circuit immediately with
  `SMS_PROVIDER_CIRCUIT_OPEN`, no network round-trip — so the fallback
  chain skips to the next provider in microseconds. After `openMs`
  (default 30s; `BHARAT_OS_SMS_CIRCUIT_OPEN_MS`) the breaker half-opens
  and allows one probe through; success closes, failure re-opens.
  `NOT_CONFIGURED` does NOT count toward threshold so Karix stubs
  don't pollute the dashboard. New Prometheus gauge
  `bos_sms_circuit_state{provider}` in `/metrics` (0=closed,
  1=half-open, 2=open) — alert on `>= 2 for 1m`. `resetCircuit(name?)`
  ops helper exported for future SRE tooling. `.env.example`
  documents all three tunables. §15 preserved — timeout wrapper
  passes phone+body through unchanged; breaker records only provider
  name + numeric state. 441/441 tests (+12 new). ADR 0090. **One
  vendor's failure latency stops mattering after threshold — broken
  Gupshup = microsecond fallback, not 30s waits per OTP.**
- Phase 5.3 **SMS vendor fallback chain + per-vendor delivery
  telemetry** — Phase 5.1 shipped three real SMS HTTP integrations
  but only one ran at a time. A 5-minute Gupshup outage was a
  5-minute OTP-flow outage. Phase 5.3 ships `createFallbackProvider`
  which walks an ordered provider list, returns the first success,
  and falls through only on the recoverable error codes
  `SMS_PROVIDER_NOT_CONFIGURED` and `SMS_PROVIDER_REJECTED` (any
  other error surfaces immediately so real bugs aren't masked).
  Success response carries `fallbackChain` + `fallbackAttempts` so
  callers can log the walk; exhaustion throws
  `SMS_PROVIDER_FALLBACK_EXHAUSTED` with per-provider attempt
  details. New env var `BHARAT_OS_SMS_FALLBACK_CHAIN` (comma-
  separated, e.g. `gupshup,msg91,twilio`) opts in. New Prometheus
  counter `bos_sms_send_total{provider, outcome}` in `/metrics`
  records EVERY inner attempt (not just the winner) — a chain
  silently falling through `gupshup → msg91` is now visible to
  ops, not hidden. PromQL example:
  `rate(bos_sms_send_total{provider="gupshup",outcome="rejected"}[5m])`.
  `.env.example` documents three recommended production chains
  (India primary, India + intl backup, cost-optimised). §15
  preserved — fallback layer never touches PII; telemetry labels
  are provider name + outcome enum only. 429/429 tests (+16 new).
  ADR 0089. **One vendor outage no longer blocks OTP flows;
  operators tune chain order from real-world delivery data in
  `/metrics`.**
- Phase 5.2 **SIM-swap defense — per-phone rate-limit + post-recovery
  cooldown** — Phase 5.0 audited recovery for detection; Phase 5.2
  adds prevention. New rate-limiter policy `recovery_per_phone`
  (3/hour per normalised phone, independent of client IP) — composes
  with the existing per-IP `expensive` gate so an attacker rotating
  IPs still tops out per phone target. Phone-bucket consume runs
  **before** the identity lookup so 429 vs 200 doesn't reveal
  registration status (preserves the §15 anti-enumeration guarantee
  from ADR 0086). New `src/phase1/recovery-cooldown.mjs` pure-function
  module: `applyRecoveryCooldown` stamps a 24h
  `recoveryCooldown = { protocolVersion, reason, activatedAt, until,
  ttlMs }` block on the identity; `assertNoCooldown` throws
  `RECOVERY_COOLDOWN_ACTIVE` with scope + countdown. `/api/recovery/
  verify` now applies the cooldown on success, persists the cooled
  identity, builds the bundle from it (so the new device's UI gets
  the banner hook), and writes `cooldownUntil` into the
  `account_recovery.completed` ledger event. `/api/recovery/start`
  routes matched-but-cooling-down identities to the **same no-match
  sentinel** so a SIM-swap attacker can't probe to confirm a prior
  recovery succeeded. `DELETE /api/identities/:id` returns **HTTP 423
  Locked** during cooldown with `recovery_cooldown_active` + `until`
  — a SIM-swap attacker who recovered the account cannot also
  immediately destroy it. Read paths, intent flows, and mesh/
  federated participation remain open during cooldown — only
  destructive actions wait. 413/413 tests (+14 new). ADR 0088. **The
  Phase 5.0 detection-only posture is now detection + prevention —
  irreversibility is gated for the 24h window ops needs to react.**
- Phase 5.1 **real SMS provider HTTP integrations — Gupshup / MSG91 /
  Twilio go live** — Phase 4.3 shipped the SMS provider abstraction
  with stubs that threw "configure env vars first." Phase 5.1 ships
  the actual HTTP calls. `src/phase0/sms-provider.mjs` now implements:
  **Gupshup** (`media.smsgupshup.com/GatewayAPI/rest`, GET with creds
  in query string, parses both `success | <id>` text and JSON formats,
  DLT-template + principal-entity slots), **MSG91** (POST to
  `/api/v5/send` or `/api/v5/flow` when `FLOW_ID` set, `authkey` header
  auth, auto-extracts 6-digit OTP for flow-API template variable),
  **Twilio** (Basic auth + form body, detects Messaging Service SIDs
  starting `MG` vs plain `+1…` numbers). Karix remains a stub pending
  partner contract. Structured error contracts across all three:
  `SMS_PROVIDER_NOT_CONFIGURED` (with `missing` env-var list) and
  `SMS_PROVIDER_REJECTED` (with `providerResponse` + Twilio
  `providerStatusCode`) — ops alerting can split on the codes without
  parsing message text. Per-vendor phone formatting (Gupshup/MSG91
  strip `+`; Twilio keeps E.164). `.env.example` updated with per-
  vendor sign-up URLs + DLT-compliance notes. 399/399 tests (+14 new
  using `global.fetch` mocking + `withEnv` env-var stubbing). No SW
  change. ADR 0087. **Launch deploy is now provider-config, not
  code-change — one env-var swap when the SMS contract arrives.**
- Phase 5.0 **account recovery via phone OTP — post-launch arc starts** —
  Phase 4.3 attached phones to identities; Phase 5.0 closes the loop.
  Without it a user who lost their 12-word phrase was locked out forever.
  New `src/phase1/account-recovery.mjs`: `findIdentityByPhone`,
  `startAccountRecovery`, `verifyAccountRecovery`, `buildRecoveryBundle`.
  Two API endpoints: `POST /api/recovery/start` (rate-limited
  `expensive`, returns no-match sentinel with identical shape on missing
  phone — §15 protection against enumeration), `POST /api/recovery/verify`
  (emits `account_recovery.completed` ledger event with masked phone for
  SIM-swap detection). Welcome-screen UI gains *"🔁 I lost my recovery
  phrase"* dashed-border link → recovery wizard step → restored. 385/385
  tests (+13 new). SW cache to v29. ADR 0086. **Lost-phrase deadlock
  solved — ~90 second recovery.**
- Phase 4.6 **deployment scripts — Docker + Caddy + CI + runbook
  (launch arc complete)** — multi-stage Dockerfile (builder runs the
  full test suite; runtime is `gcr.io/distroless/nodejs24-debian12:
  nonroot`, no shell, uid 65532; production env defaults baked in;
  `/readyz` healthcheck every 30 s). `docker-compose.yml` orchestrates
  `bos-api` + Caddy 2-alpine reverse proxy with auto-Let's-Encrypt +
  3 named volumes. `Caddyfile` forwards X-Forwarded-For, passes through
  Phase 4.1 security headers, adds belt-and-braces HSTS at the proxy.
  `.env.example` documents every BHARAT_OS_* env var. `.dockerignore`
  keeps `.git`/`.tmp`/`.env` out of the image. `.github/workflows/ci.yml`:
  `test` job (full 372-test suite + live `/healthz` smoke), `docker-build`
  (verifies Dockerfile), `publish` (tagged releases auto-push to GHCR).
  `docs/launch-runbook.md` — 8-section end-to-end deploy procedure
  (partner/regulatory prereqs, code checklist, host options, compose
  bring-up, verification, observability hookup, backup strategy,
  day-of-launch checklist, known limitations, rollback). 372/372 tests
  unchanged. ADR 0085. **Phase 4 launch arc complete — Bharat OS
  deployable in one command.**
- Phase 4.5 **i18n framework — localized UI shell** — `public/shell/i18n.mjs`
  ships seven supported locales (en-IN, hi-IN, hi-Latn-IN, mr-IN, bho-IN,
  ta-IN, bn-IN). Public surface: `t(key, { fallback })`, `setLocale` /
  `onLocaleChange` (localStorage-persisted), `applyI18n(root)` sweeps
  the DOM for `data-i18n="key"` attributes, `getLocaleCoverage(locale)`
  for honest %-translated reporting. Seed translations cover welcome
  wizard + bottom nav + DPDP card + phone OTP card + offline banner +
  error toasts. Coverage: en-IN 100% (reference); hi-IN ~95%;
  hi-Latn-IN ~75%; mr-IN / ta-IN / bn-IN ~50%; bho-IN ~40% — remaining
  strings fall through to English as a known §17 honesty gap (native-
  speaker review required for production). `setActiveProfile` calls
  `applyI18nForLocale(profileLocale(identity))` so switching to a Tamil
  profile repaints the UI to Tamil. 372/372 tests (+12 new). SW cache
  to v28. ADR 0084.
- Phase 4.4 **network resilience + offline mode + PWA install** — new
  `public/shell/network.mjs` with `fetchWithRetry` (exponential
  backoff 200/600/1800ms; retries 5xx + 429 + 408 + network errors;
  never retries 4xx validation errors), `onNetworkStatusChange`
  (wraps `navigator.onLine`), `categoriseError` (6 discriminated
  categories: offline / auth / rate_limited / validation /
  server_error / network_error — each with recommended action).
  Sticky red **offline banner** at top of viewport when network
  drops (auto-hides on reconnect; mesh ticker auto-stops while
  offline). **PWA install card** on Profile captured from
  `beforeinstallprompt` — one tap to pin Bharat OS to home screen;
  dismiss flag persisted; `appinstalled` event hides card
  permanently. `showToast` upgraded: `(msg, { tone, retry })`
  — when `retry` is a function, toast becomes interactive with a
  Retry button. 360/360 tests (+13 new). SW cache to v27. ADR 0083.
- Phase 4.3 **phone OTP authentication scaffold — recovery path beyond
  the 12-word phrase** — population-scale users will lose their phrase;
  phone OTP is the fallback. New `src/phase0/sms-provider.mjs` (`log`
  default for dev with masked-phone structured logging + plaintext OTP
  on stdout via `BHARAT_OS_LOG_OTP_BODIES=1`; stubs for gupshup / msg91
  / karix / twilio ready to swap when partner contract lands) +
  `src/phase1/phone-otp.mjs` (cryptographically random 6-digit code,
  salted SHA-256 hash for storage, `crypto.timingSafeEqual` verify;
  5-min TTL, 5-attempt cap; purposes `phone_verify` /
  `account_recovery` / `sensitive_action`). Plaintext code never
  persisted — only the salted hash. New `phone_otps` storage in both
  backends; included in SqliteStore atomic erasure cascade. Two API
  routes: `POST /api/phone-otp/send` (`expensive` rate-limit policy)
  + `POST /api/phone-otp/verify` (on success, attaches `phone_verified`
  to identity attestations with masked form only). Shell adds
  *"📱 Phone (recovery)"* card on Profile with `autocomplete=
  "one-time-code"` for iOS/Android auto-fill. 347/347 tests (+14 new).
  SW cache to v26. ADR 0082.
- Phase 4.2 **SQLite store backend — ACID transactions for launch scale** —
  new `src/phase0/sqlite-store.mjs` is a drop-in replacement for the
  file-based `BosStore` with identical method signatures (existing tests
  work unchanged against either backend). 20 tables — one per record
  type — with indexed columns + JSON blob. Built-in `node:sqlite` (Node
  24+, no native compilation, no new deps). WAL mode for concurrent
  reads. **`eraseUserData` cascade now runs inside `BEGIN ... COMMIT`** —
  DPDP §12(3) right-to-erasure is genuinely atomic (crash-safe instead
  of leaving half-deleted state). New `createStore({ rootPath, kind })`
  factory + `BHARAT_OS_STORE_KIND=file|sqlite` env var + `--kind` CLI
  flag. New `scripts/migrate-store.mjs` (idempotent file → SQLite
  migration; replays ledger chronologically). Live-verified end-to-end
  against the demo seed: 70 records + 73 ledger events migrated; API
  boots on SQLite; all read endpoints return migrated data; SQLite file
  38% smaller on disk than file store. 333/333 tests (+11 new). ADR 0081.
  Backward-compatible — file store remains the default; SQLite is
  opt-in.
- Phase 4.1 **production hardening — security headers, rate limiting,
  structured logging, metrics, graceful shutdown** — four new artifacts
  under `src/phase0/`: `security-headers.mjs` (strict CSP — no
  `'unsafe-inline'`/`'unsafe-eval'` in script-src; CDN allowlist
  esm.sh + cdn.jsdelivr.net only; X-Frame-Options DENY, COOP
  same-origin, Permissions-Policy locking camera/mic to self + denying
  geo/payment/usb/interest-cohort), `rate-limiter.mjs` (in-memory
  token-bucket with 4 policy classes; per-key isolation; honours
  X-Forwarded-For only when `BHARAT_OS_TRUST_PROXY=1`),
  `logger.mjs` (JSON to stdout/stderr per level with **silent PII-key
  scrubbing at any depth** — displayName / phoneNumber / intentText /
  recoveryPhrase / privateKeyPem / vaultKeyBase64 / gradientBytesBase64;
  crypto.randomUUID request IDs), `metrics.mjs` (Prometheus text format
  at `/metrics`; **metricPath normalises identityIds → `:id` so no
  per-user dimension exists**). Middleware preamble wires all four into
  every request. New `/healthz` + `/readyz` + `/metrics` endpoints.
  Server hardening: 30s headersTimeout, 60s requestTimeout, 1MiB body
  cap. `installGracefulShutdown` drains in-flight on SIGTERM with
  10s force timeout. Inline `<script>` tags de-inlined for strict CSP.
  Env vars: `BHARAT_OS_HSTS`, `BHARAT_OS_TRUST_PROXY`,
  `BHARAT_OS_CORS_ORIGINS`, `BHARAT_OS_LOG_LEVEL`. 322/322 tests
  (+33 new). SW cache to v25. ADR 0080.
- Phase 4.0 **DPDP data-subject rights — launch readiness arc starts** —
  pivot from investor-demo-ready to launch-ready. New
  `src/phase1/dpdp-rights.mjs` artifact: `collectUserData` (18-section
  export, excludes private key + vault key per §15), `erasureManifest`
  (pure deletion plan), `redactLedgerEntry` (preserves chain integrity).
  New `BosStore.eraseUserData` cascades through 16 per-user record types
  + rewrites `ledger.jsonl` atomically with identity refs redacted. Four
  new API routes:
    GET    /api/identities/:id/export           (Content-Disposition: attachment)
    GET    /api/identities/:id/erasure-preview
    DELETE /api/identities/:id?confirm=YES_DELETE  (refuses without flag)
    GET    /api/dpdp/grievance                  (DPO contact + 30-day SLA)
  Two static legal pages: `/legal/privacy.html` (10-section DPDP §11
  notice, fetches live DPO contact from API) + `/legal/terms.html`
  (11-section ToS). Shell adds *"Your data rights"* card on Profile tab
  with Download / Delete (two-step: preview + type DELETE) / Contact DPO.
  First-run wizard footer carries the legal-acceptance notice. 289/289
  tests (+9 new). SW cache to v24. Bharat OS is now DPDP-compliant at
  the protocol layer. ADR 0079.
- Phase 2a.26 **first-run wizard — sign-up / migrate / demo** — Bharat OS
  has a front door. Three paths from a full-screen welcome sheet that
  fires when `deviceOwnerId` is absent: ✨ *Set up new identity*
  (language → display name → `POST /api/identities` + fetch deterministic
  12-word recovery phrase → Trust-Wallet/MetaMask-style numbered grid
  with mandatory "I've written these down" ack, or an *I'll save it later*
  escape hatch that sets a persistent warning banner on Home), 📲 *Move
  from another phone* (routes to §7c WebRTC pairing — QR scan or 6-digit
  code + phrase), 🎬 *Try a demo persona* (clearly labelled, reuses
  `reinitializeDeviceAs`). `loadIdentities` no longer auto-binds — the
  wizard owns first-run. New Reset device button on Profile (clears
  localStorage with honest copy explaining the identity stays on the
  server). Backup warning banner re-opens the phrase grid via re-fetch.
  280/280 tests unchanged. SW cache to v23. ADR 0078.
- Phase 2a.25 **shell UX overhaul — bottom-tab navigation + plain-language
  copy** — restructures `/shell/` from a single-scroll 10-card stack into
  4 focused tabs: 🏠 Home (intent + result + recent), 💎 Earn (₹ hero +
  mesh + federated), 🛡️ Trust (verified profile + sign & share), 👤
  Profile (identity + pairing + passkey + alerts + health doc + flag +
  diagnostics). All element IDs preserved — existing JS unchanged; ~50
  lines added for tab switching + last-used tab persisted to localStorage.
  Every user-facing §XX citation removed from copy ("§13B fair-use lever"
  → "Earn while charging", "§9A flag" → "Report a problem",
  "Profile security" → "Sign-in security", etc.). §XX framing moved into
  collapsible "How this works" details so investors still get the
  technical view one tap away. New `.earn-hero` (42px mono ₹) and
  `.profile-hero` (64px avatar) primary surfaces. Fixed-position
  bottom-nav with backdrop-blur. Onboarding overlay rewritten as a
  4-step tab tour. Operator console untouched — split is now clean:
  `/shell/` user context, `/console/` ops context. 280/280 tests
  unchanged. SW cache to v22. ADR 0077.
- Phase 3.2 **FedAvg + privacy-budget accountant — Phase 3 complete** —
  Two pieces close out the §7f substrate arc. New
  `src/phase1/privacy-budget.mjs` (computeBudgetUsage /
  projectBudget / assertWithinBudget) with `DEFAULT_FEDERATED_BUDGET`
  = ε 8 over 30 days. Federated rounds gain `aggregationMode:
  'hash_combiner' | 'fedavg'` (default backward-compatible) +
  `contributorBudget` override. New
  `BYTES_DONATION_CONSENT_PURPOSE = 'federated_bytes_donation'` —
  `fedavg` rounds require it AND the actual `gradientBytesBase64`.
  `aggregateRoundFedAvg` decodes base64 → element-wise mean →
  re-encode (real averaged gradient, not just sorted hashes;
  `aggregatedModelHash` becomes SHA-256 of the bytes). New
  `GET /api/federated/budget/:id` endpoint; shell shows running ε
  spend and per-round mode badge (FedAvg orange, hash-only green);
  join flow dispatches consent purpose + bytes inclusion by mode.
  Canonical signed payload excludes bytes (signature over hash
  transitively covers them). 280/280 tests (+19 new: 9 budget +
  10 fedavg). SW cache to v21. ADR 0076.
- Phase 2a.24 **seed-demo refresh for post-2a.18 surfaces** —
  `scripts/seed-demo.mjs` had drifted: mesh contributions, attestations,
  and federated rounds all opened empty on first run. Extended with
  two signed attestations (Sita → Kothrud Landlord, Lakshmi → Apollo
  Clinic — both flow through the real `signTrustAttestation` path),
  eight backdated mesh contribution events covering all four workload
  classes, and one active §7f federated round (`intent-classifier-head-v1`)
  with Priya pre-donating a signed gradient update at ε=0.3 (matching
  `federated_round` mesh event mints her ₹2 payout). All artifacts go
  through their real signing paths — no shortcut data. First 60 seconds
  of the demo now opens populated; `/verify/?attestationId=…` works
  on first run. 261/261 tests unchanged. ADR 0075.
- Phase 3.1 **real on-device training for §7f rounds** — replaces the
  Phase 3.0 placeholder gradient hash with actual pure-JS multinomial
  logistic regression training. New `src/phase1/local-training.mjs`
  (browser + node-testable): 36-feature × 6-class classifier head,
  `extractFeatures` / `trainOneEpoch` / `addDifferentialPrivacyNoise`
  (Gaussian mechanism, σ = 1/ε) / `hashGradient`. Shell
  `joinFederatedRound` reads the user's orchestration history for
  labeled samples (falls back to a 6-sample warm-up corpus), runs the
  math locally, submits the SHA-256 of the noisy gradient. Module
  aliased at `/shell/local-training.mjs` so browser + tests share one
  canonical copy. §15 preserved — raw text never leaves the device.
  261/261 tests (+12 new). SW cache to v20. ADR 0074.
- Phase 2a.23 **operator console catch-up** — `/console/` had drifted
  behind the shell across Phase 2a.18 / 3.0 / 2a.22. Two new panels
  added between Trust and Flags: *"§7f Federated Rounds — Phase 3.0"*
  (status pills, contributor counts, ε spent/cap, *Aggregate* action)
  and *"§13A #7 Trust Attestations — Phase 2a.22"* (claim-body-free
  index with *Verify* and *Open* actions — the Open link opens the
  exact same `/verify/?attestationId=…` URL a third-party verifier
  would use). New `status-pill` CSS primitive. Sidebar nav extended.
  249/249 tests unchanged. Console SW to v3. ADR 0073.
- Phase 2a.22 **§13A #7 verifier round-trip** — closes the
  Trust-as-a-service loop end-to-end. New artifact
  `src/phase1/trust-attestation.mjs` with `signTrustAttestation` +
  `verifyTrustAttestation` (Ed25519). Orchestration API auto-signs
  trust attestations with the subject identity and persists to a new
  `attestations/` store. Three routes: `GET /api/attestations`,
  `GET /api/attestations/:id`,
  `GET|POST /api/attestations/:id/verify` (discriminated result:
  valid / expired / signature_invalid / unknown_subject / malformed).
  Shell adds *"Sign & share"* to the Trust Passport card — mints,
  signs, renders verify URL + QR. New `/verify/?attestationId=...`
  page reads the attestation, calls verify, renders one of five
  badge states with the disclosed claims (bands & booleans only).
  §15 selective-disclosure preserved end-to-end. 249/249 tests (+8
  new, including full orchestration → sign → verify e2e). SW cache
  to v19. ADR 0072.
- Phase 3.0 **§7f federated learning round substrate** — first Phase 3
  commitment kicks off. `src/phase1/federated-round.mjs` ships the
  round lifecycle (created → accepting_updates → completed/expired),
  Ed25519-signed gradient updates (hash-only — no gradient vectors on
  the control plane), donation-purpose consent enforcement (workflow
  consents rejected), DP epsilon cap per round with running
  `epsilonSpent` totals, and deterministic aggregation. New
  `federated_round` mesh workload class so participation earns fiat
  UPI credits via the existing §13B ticker. Four routes
  (`/api/federated/rounds*`) plus a demo-mode `/sign-and-submit`
  shortcut. Shell card *"🧪 Federated rounds — §7f opt-in training"*
  shows active rounds with payout, ε cap, contributor count, and a
  one-tap join. §15 bindings preserved end-to-end. 241/241 tests
  (+11 new). SW cache to v18. ADR 0071.
- Phase 2a.21 **QR-code pairing** — collapses the §7c receiver flow
  from *"type 6-digit code + read 12 words aloud + type 12 words"*
  into one scan. Initiator renders a QR (`{ v: 'bos.qr.v1', code, phrase }`)
  next to the code + phrase display via lazy-loaded `qrcode` lib
  from esm.sh. Receiver gets three claim paths in priority order:
  📷 Scan QR (native `BarcodeDetector` + rear-camera `getUserMedia`),
  📋 Paste QR text, and the existing typed-code path with the
  manual-phrase prompt. `claimPairingFromCode({ prefilledPhrase })`
  skips the prompt on QR-supplied phrases and falls back on
  rejection. Backward-compatible. 230/230 tests. SW cache to v17.
  ADR 0070.
- Phase 2a.20 **Trust Passport shell card** — `/shell/` gains a
  *"🛡️ Trust Passport — what a verifier would see"* card with four
  tiles (attestations, active consents, NCS class, §9A flags) above
  the fold, plus a *"Show me what a landlord would see"* preview
  rendering the band-or-boolean selective-disclosure envelope inline
  before any attestation is minted. `createTrustPassport` artifact
  gains a `flagReports` block so the §9A safeguard escalation
  (ADR 0058) is finally user-visible in the passport itself.
  230/230 tests (+2 new). SW cache to v16. ADR 0069.
- Phase 2a.19 **daily brief on-device composer** — `src/phase1/daily-brief.mjs`
  gathers structured signals (recent orchestrations / mesh contribution
  events / expiring consents / open §9A flags) horizon-bounded, and a
  locale-aware template renderer (en-IN / hi-IN / hi-Latn-IN / mr-IN /
  bho-IN / ta-IN / bn-IN) emits vernacular brief text. The orchestration
  API auto-threads signals into `metadata.signals` for `daily_brief`
  requests; the tool adapter embeds the rendered brief on the receipt
  with `renderer: 'template_v0'` and an explicit `rendererNote` that
  names the Tier 4 SLM swap. Shell renders the brief body in a
  `<pre class="daily-brief-body">` block. 228/228 tests (+8 new).
  SW cache to v15. ADR 0068.
- Phase 2a.18 **§9C vignette coverage: trust attestation + daily brief**
  — two new action types close the §9C user-facing gap from 16/18 to
  18/18. `trust_passport_attestation` (§9C #15, §13A #7
  Trust-as-a-service) mints a signed, time-bound envelope with
  band-or-boolean selective disclosure (`shareDays ∈ [1, 90]`,
  `rawPiiReturned: false`, verifier pays). `daily_brief_compose` (§9C
  #16b) is on-device only (`runtime: 'on_device_only'`,
  `networkLegs: 0`, `horizonHours ∈ [1, 168]`), citizen-facing with no
  revenue line. Vernacular aliases for both across en-IN / hi-IN /
  hi-Latn-IN / mr-IN / bho-IN / ta-IN / bn-IN; localized response
  strings for planned / blocked / completed per locale. Shell renders
  the attestation claims list and the brief envelope with §7e on-device
  framing. 220/220 tests (+10 new). SW cache to v14. ADR 0067.
- Phase 2a.17 **§7c encrypted vault transfer** — the §7c WebRTC
  handshake now carries a two-part bundle: `publicIdentity` (as before)
  + `encryptedVault` (AES-GCM-256 under PBKDF2-HMAC-SHA-256(phrase, 200k
  iters, 16-byte random salt)). New `src/phase1/vault-transfer.mjs`
  canonical artifact, aliased at `/shell/vault-transfer.mjs` so the
  browser imports the same file the tests cover. The initiator shows
  the 6-digit code **and** the 12-word recovery phrase; the receiver
  prompts for the phrase (three attempts) and decrypts locally. The
  recovery phrase never crosses the wire. New endpoints:
  `GET /api/identities/:id/recovery-phrase`,
  `GET /api/identities/:id/vault-snapshot` (with an explicit demo-only
  warning — production keeps `privateKeyPem` in the device hardware
  keystore in Phase 2b). 210/210 tests (+9 new). SW cache to v13.
  ADR 0066.
- Phase 2a.16 **demo readiness pass** — suggestion chips expanded to six
  per locale (loan / cab / health record / hotel / scheme / train) and
  every chip verified end-to-end to classify to a real action type; the
  Hinglish loan regex hardened so *"karza"* / *"karzaa"* / *"karja"* /
  *"business"* / *"nbfc"* route to `regulated_onboarding` instead of
  silently falling to `mesh_storage`, with कारोबारी / कारोबार / व्यवसाय
  added on the Devanagari side; a first-run onboarding overlay (3 steps:
  intent → mesh ticker → more controls + diagnostics) shown once per
  browser with a *Replay tour* link in More controls. SW cache bumped to
  v12. ADR 0065.
- Phase 2a.15 **shell polish pass** — `/shell/` reordered so the intent
  loop + the live §13B mesh ticker sit above the fold; the auxiliary
  cards (pairing, passkey, alerts, health document, §9A flag report)
  collapsed into a single "More controls" `<details>` block with a meta
  line listing what's one click away. No behavioural change; HTML + CSS
  only. Service worker cache bumped to v11. ADR 0064.
- Phase 2a.14 **WebRTC device pairing handshake** — §7c portability made
  demoable. New `src/phase1/pairing-session.mjs` artifact (signed session
  with 6-digit claim code, lifecycle pending → claimed → completed /
  expired) + `/api/pairing/sessions*` routes as a signaling-only relay
  (the server never sees the identity bundle). `public/shell/pairing.mjs`
  runs a real `RTCPeerConnection` + `RTCDataChannel` handshake between two
  browser tabs / two phones over WebRTC with Google's public STUN. The
  shell pairing card initiates on the old device + claims on the new;
  identity bundles transfer browser-to-browser. ADR 0063.
- Phase 2a.13 **L2 mesh contribution loop** — signed contribution events
  (`src/phase1/mesh-contribution.mjs`) for inference / storage_serve /
  storage_store with per-event operator payout from §13B rates. New
  `/api/mesh/contributions*` routes and store persistence + ledger.
  `store.computeContribution` now folds events into NCS dynamically.
  `/shell/` gains a **Mesh node** card with a live earnings ticker (8s
  foreground ticks) and a best-effort Periodic Background Sync
  registration for hidden-tab continuation. The §13B "your phone earns
  ₹ overnight" story is now visible in real time. ADR 0062.
- Phase 2a.12 **real on-device SLM** via transformers.js +
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (~120 MB, Tier 3). User-
  triggered warm-up button in `/shell/` with a visible download progress
  bar; cached in browser IndexedDB after first load. Cosine-similarity
  intent classification across the six canonical action templates surfaces
  in the flow card as an extra `L8 on-device SLM · service_booking 91%`
  row; high-confidence + sufficient-margin picks override the
  deterministic L7 actionType. Diagnostics row 2a.7 flips from
  placeholder → real once the model is cached. ADR 0061.
- Phase 2a.11 operator-console **§9A flag review panel** — new section
  in `/console/` listing flag reports from the shell with status filter,
  per-row Resolve / Dismiss buttons that prompt for reason + reviewer ID,
  and a panel sort that surfaces open high-severity flags first. Closes
  the §9A loop end-to-end: citizen files in shell → operator reviews in
  console → resolution recomputes the L4 auto-block. ADR 0060.
- Phase 2a.10 third §9B booking mode — **app handoff** to the user's
  already-installed Uber / Ola / Rapido / Namma Yatri / MakeMyTrip / OYO /
  Booking / IRCTC / Swiggy / Zomato / BigBasket / Blinkit / Urban Company.
  Service-booking receipts now carry an `appHandoffs[]` list (deep-link URI
  + web fallback per app) alongside the native booking + payment URI.
  Bharat OS does not transact when the user picks a handoff — the user pays
  in their own app. Shell renders the handoff row below the native action;
  `metadata.preferredApps` filters the list to user preference. ADR 0059.
- Phase 2a.9 §9A safeguard escalation — signed flag reports
  (`src/phase1/flag-report.mjs`), `policy.report.flag_review_threshold` that
  auto-blocks subjects with 3+ open high-severity flags, store persistence
  + ledger, `/api/flags*` + `bos flag create|list|summary|resolve` + a
  "Report a problem" card in `/shell/`. Closes Phase 2a queue item #13.
- Phase 2a.7 on-device SLM runtime scaffold: local model-pack metadata,
  `/api/on-device/runtime`, `/api/on-device/model-packs`, and shell
  orchestration metadata that records whether a WebGPU/WASM local model is ready
  before falling back to deterministic rules.

## Quickstart

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

## Run the user-facing demo (Phase 2a.7)

```bash
# 1. Seed a demo store with §9C vignettes (Sita / Ravi / Lakshmi / Aarav /
#    Suresh / Priya / Rajesh / Anjali — consents, nodes, memory, orchestrations,
#    worker authorization, bootstrap report).
node scripts/seed-demo.mjs

# 2. Start the API on the demo store. Binds to LAN so you can side-load
#    to your phone over WiFi.
node bin/bos-api.mjs --store .demo-bharat-os --host 0.0.0.0 --port 8787

# 3. Open:
#    http://127.0.0.1:8787/         user-facing shell (auto-redirects to /shell/)
#    http://<laptop-LAN-IP>:8787/   side-load to your phone on the same WiFi
#    http://127.0.0.1:8787/console/ operator console (admin / observability)
#
# 4. Install as PWA: Chrome > "Add to Home screen" on either surface.
```

Run the bootstrap simulator (legacy PowerShell entry):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 simulate bootstrap --nodes 1000 --objects 100 --report-out .tmp/bootstrap.md --store .bharat-os
```

The test runner imports `src/BharatOS.Phase0/BharatOS.Phase0.psm1`, runs the
PowerShell behavioral tests, then runs the Node.js tests in `tests/node/`.

## Repository Layout

```text
BHARAT_OS.md                         Canonical product and architecture reference (§17 = live status)
src/BharatOS.Phase0/                 Phase 0 PowerShell module (original executable spec)
src/phase0/                          Phase 0.1 Node core, store, simulator, HTTP API
src/phase1/                          Phase 1 modules:
                                       policy.mjs, orchestrator.mjs, tools.mjs, skills.mjs,
                                       vernacular.mjs, memory.mjs, integrity.mjs,
                                       trust-passport.mjs, worker-authorization.mjs,
                                       device-pairing.mjs, skill-trace.mjs,
                                       health-document.mjs, profile-auth.mjs,
                                       worker-notification.mjs, voice-runtime.mjs,
                                       on-device-model.mjs
bin/bos.mjs                          Comprehensive CLI (~30 commands; `node bin/bos.mjs help`)
bin/bos-api.mjs                      Local HTTP API server entry
public/shell/                        UI 2 — user-facing vernacular shell (Phase 2a.7, PWA)
public/operator-console/             UI 0 — operator observability console (PWA)
scripts/seed-demo.mjs                Seed a demo store with §9C vignettes
scripts/test.ps1, bos.ps1, api.ps1   PowerShell wrappers (use portable Node in `.tools/`)
tests/node/                          20 test files, 162 tests
docs/phase0/                         Phase 0 implementation notes
docs/phase1/                         Phase 1 implementation notes
docs/adr/                            Architecture decision records (56 ADRs)
docs/ui/                             UI roadmap
```

## For contributors (Codex, future Claude, human)

Read `BHARAT_OS.md` §0, §6, §15, §17 first. §17 is the live status board with
the prioritized Phase 2a queue. Pick a feature, file an ADR in `docs/adr/`,
keep tests green (`node --test tests/node/*.test.mjs`), update §17 inline as
items close. Do not create a parallel status file (§16 binding).
