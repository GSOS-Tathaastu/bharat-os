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
