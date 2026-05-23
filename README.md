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
