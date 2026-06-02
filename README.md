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

## 🛒 2026-06-02 — Phase 13.5.1 shipped: Sponsor browse + purchase (closes 13.5 revenue loop end-to-end)

The 13.5 citizen data marketplace is now end-to-end. Citizens publish
offers (13.5); sponsors browse + purchase (this phase); per-purchase
atomic flow debits sponsor escrow + credits citizen mesh balance +
emits a pointer-only audit-ledger event.

3 new bearer-gated endpoints under `/api/sponsors/:id/`:
- GET `/data-offers/browse[?purpose=...]`
- POST `/data-offers/:offerId/purchase` (body: `{sponsorPurpose}`)
- GET `/data-offer-purchases`

Each purchase atomically: validates offer status/expiry/cap + purpose
in allowlist → lock-then-debit sponsor escrow → builds purchase + mesh
contribution event + bumped offer → persists in order → emits
`sponsor_escrow.debited` + `citizen_data_offer.purchased` pointer
events. Errors caught at boundary with explicit codes:
`insufficient_escrow` (with availablePaise + requiredPaise),
`purpose_not_allowlisted`, `offer_{not_active|expired|exhausted}`,
`unknown_offer`, `invalid_purpose`.

New `citizen_data_sale` workload type in MESH_WORKLOAD_TYPES (6
total). Sponsor surface gets a "Data" tab pointing at
`/sponsor/data-offers`.

Adversarial review: ship_with_known_limitations (no must-fix for v1
demo). Known limitations: race on concurrent purchases, non-atomic
persistence chain, no self-purchase guard. All caught at boundary;
production fixes deferred to 13.5.2. ADR 0162.

Tests: 500 vitest + 1334 Node + tsc clean.

## 🌐 2026-06-02 — Phase 13.6 shipped: Public marketing pages (/about, /how-it-works, /for-citizens, /for-sponsors)

The investor / partner-facing website now lives at 4 public routes
alongside the existing onboarding at `/`. Investors landing on a
Bharat OS link see the story (vision, substrate, persona pitch);
demo users continue to land at `/` for sign-up. Each marketing
page carries a "Try the demo →" CTA back to `/`.

- `/about` — vision, founder thesis, market sizing (700M + 700M),
  3 pillars (on-device / citizen-owned / economically aligned)
- `/how-it-works` — the 6 substrates (each with Shipped badge),
  5 §15 privacy invariants, 3-step distribution path (each
  marked Planned)
- `/for-citizens` — Use / Earn / Provide trio, 5 data point
  kinds, Sahayak path for the 700M without smartphones
- `/for-sponsors` — 3 sponsor surfaces (labeling marketplace
  + federated rounds + citizen data marketplace), bearer-token
  escrow + Ed25519 signed audit posture, DPDP + RBI compliance

Adversarial review caught 2 must-fix + 2 should-fix, all applied:
"no PII required" was misleading (phone is PII) → softened;
"open-source substrate" claim removed (no LICENSE file at root
yet); aria-label on nav; Planned badges on the 3 distribution
cards. Every concrete factual claim is backed by an ADR or memory
binding (table in ADR 0161).

Tests: 500 vitest + Node 1315 unchanged + tsc clean. ADR 0161.

## 💰 2026-06-02 — Phase 13.5 shipped: Citizen data offer substrate (new revenue line for citizens)

Opens the 13.x revenue-line track per the
[citizen-data-as-product-revenue binding](../.claude/projects/d--bharat-os/memory/citizen-data-as-product-revenue.md).
Citizens can now publish per-data-point sale offers: "I am willing
to sell my [intent prompts / document summaries / PII-redacted text
/ skill runs / federated contributions] for ₹X per sale, up to N
sales, for purposes [model training / safety benchmark / academic
research / …]". Sponsors purchase against these offers, paying into
the citizen's mesh balance.

This phase ships the **citizen-side substrate** (publish + list +
pause + revoke). The sponsor browse + purchase flow lands in
Phase 13.5.1.

§15 invariants in place: strict allowlist (10-entry forbidden-
substring probe) + content-derived offerId (no spam) + ms-stripped
timestamps + publisher-gated revoke + DPDP §12 cascade (offers wipe
on identity erase). Audit ledger emits POINTER + count-only meta —
NEVER the data points themselves.

Adversarial review: ship_with_no_fixes (privacy posture sound by
construction; edge cases covered at boundary). ADR 0160.

Tests: 490 vitest + 1315 Node + tsc clean. Zero new external API.

**13.x sequencing**: SLM USP arc complete (E/F/G/H). Revenue lines
arc now open with citizen data offers as the first concrete shipped
substrate. Compute network mesh workload + Bharat ID + Sahayak are
still ahead.

## 🔗 2026-06-02 — Phase 13.4.3 shipped: SLM-H action-verb launchers (close 13.4.x sub-arc)

Closes the SLM-H rollout. The 18 SKILL_ACTION_VERBS introduced across
13.4 / 13.4.1 / 13.4.2 now render as real clickable next-step links —
external URLs to 4 official Government of India portals (consumerhelpline,
e-Daakhil, pmkisan, findmycsc), tel: links to the consumer (1915) and
PM-KISAN (155261) helplines, an in-app link to /citizen/notes for
archiving, or honest informational labels when no universal endpoint
exists (state-specific Bhulekh, discom-specific meter recheck, etc.).

**§15 defence-in-depth**: the SLM can never inject a clickable URL. The
parser only accepts allowlist verbs → each verb maps to a fixed
launcher via an exhaustive Record type → a module-load guard asserts
every URL matches `ALLOWED_LAUNCHER_URL_PREFIXES` (4 frozen .gov.in /
.nic.in entries) → the renderer reads from the map, never from SLM
output. No string from the model ever reaches `<a href>`.

External links carry `target="_blank"` + `rel="noopener noreferrer"` —
the new tab cannot navigate the parent via window.opener.

Adversarial review: 1 fix. `/citizen/flags` didn't exist yet (Sahayak
surface lands in Phase 14.x), so flag_for_review re-mapped to
informational until then. ADR 0159.

Tests: 490 vitest + Node sweep clean + tsc clean.

## 🌾 2026-06-02 — Phase 13.4.2 shipped: SLM-H third skill — PM-KISAN status checker

Third and final v1 SLM-H skill. PM-KISAN (Pradhan Mantri Kisan Samman
Nidhi) disburses ₹6,000/year in three installments to small + marginal
Indian farmers; ~85% of failed payouts come down to four canonical
causes (eKYC pending / bank-Aadhaar unseeded / land record mismatch /
ineligible landholding). This skill reads the citizen's free-form
description and surfaces the most likely blocker + concrete next steps,
all on-device. v1 is informational; the pmkisan.gov.in adapter lands
in a future 13.4.x.

Shared `SKILL_ACTION_VERBS` allowlist grew from 13 to 18 with 5 new
verbs covering eKYC completion, Aadhaar-bank seeding, land record
verification, the PM-KISAN helpline (155261), and offline correction
at the nearest Common Service Center (CSC).

Adversarial review: ship_with_no_fixes (the MF-1 spacer-preservation
pattern from 13.4.1 was applied from the start; date validation
rejects bad shapes at boundary; drift coerces to safe defaults).
ADR 0158.

Tests: 467 vitest + Node sweep clean + tsc clean. Zero new external API.

**SLM USP arc + first-skill rollout is now complete** (E/F/G/H all
shipped; all three v1 skills under H landed).

## ⚖️ 2026-06-02 — Phase 13.4.1 shipped: SLM-H second skill — Consumer complaint drafter

Composes the substrate landed in Phase 13.4. Standalone panel on /labs:
the citizen types a free-form grievance description; the on-device SLM
drafts a structured complaint outline under the Consumer Protection Act
2019 — DRAFT_SUBJECT + FORUM_LEVEL (district / state / national per the
CPA 2019 jurisdictional tiers) + RELIEF_KIND + estimated processing days
+ key facts the complaint must include + 1-5 next-step actions
(file at district commission / escalate to consumerhelpline.gov.in
1915 / send legal notice / etc.).

Shared `SKILL_ACTION_VERBS` allowlist grew from 8 to 13 verbs with
matching citizen-readable labels.

Adversarial review caught and fixed 1 must-fix: the initial prompt
builder's `.filter(Boolean)` was collapsing intentional blank-line
spacers between sections. Regression pinned in vitest. ADR 0157.

Tests: 442 vitest + Node sweep clean + tsc clean. Zero new external API.

## 🛠️ 2026-06-02 — Phase 13.4 shipped: SLM-H skill-agent substrate + electricity bill explainer

Closes the SLM USP arc per the
[phase-12-13-sequencing-set memory](../.claude/projects/d--bharat-os/memory/phase-12-13-sequencing-set.md).
On-device skill agents are tightly-scoped agents that compose existing
SLM substrates (intent parser / doc summariser / PII redactor /
personalization) with a skill-specific prompt + structured-output parser
to give the citizen concrete next-step guidance.

This phase ships the substrate + the FIRST concrete skill (electricity
bill explainer). The demo composition: SLM-E parses your discom bill →
SkillAgentPanel reads the parsed summary from an in-memory bridge → runs
a second on-device pass on the same wllama runtime → renders RISK /
DEVIATION / TARIFF + EXPECTED RANGE + 2-5 typed action steps drawn from
a fixed 8-verb allowlist.

The BE registry carries pointers only (skillId / category / docKinds /
license / caps) — the prompt body itself ships in the FE bundle and
never crosses into a BE row, preserving the on-device pitch beat.

Adversarial review: 0 must-fix + 3 should-fix applied. SF-1 docKind
pill change clears the bridge. SF-3 boot seed retries on empty
catalog. SF-4 synchronous `runningRef` guard against same-tick
double-click. ADR 0156.

Future 13.4.x sub-phases add the consumer-complaint drafter,
PM-KISAN status checker, and wire the action verbs to real launchers.

Tests: 419 vitest + 1282 Node + tsc clean. Zero new external API.

## 💾 2026-06-02 — Phase 13.0.2 shipped: SLM-E document summary persistence (MemoryRecord + audit ledger)

Closes the Phase 13.0 ADR 0149 "persistence is the 13.0.x roll-up"
deferral. Citizens can now Save the on-device summary to a
consent-gated, encrypted MemoryRecord; an audit-ledger
`doc.summarised` event carries the pointer + count-only meta
(docKind / titleLength / bulletCount / confidence / riskFlag /
language / pdfFingerprint) — NEVER the title / TLDR / bullet
strings, which live encrypted in the bundle and only render under
an active memory.read consent.

First BE delta in the SLM-E arc. The new
`src/phase0/doc-summary-envelope.mjs` mirrors the Phase 13.2
piiRedaction posture: strict allowlist on top-level envelope keys +
nested pdfFingerprint keys, ms-stripped ISO-8601 timestamps,
calendar-valid `Date.parse` round-trip on `generatedAt`, single
`FORBIDDEN_LEDGER_SUBSTRINGS` source-of-truth shared between the
allowlist-rejection probe AND the JSON-grep guard.

Adversarial review caught 3 must-fix + 6 should-fix — all applied
before commit. Highlights: synchronous `savingRef` guard against
same-tick double-clicks; cleartext label is `${kind} ·
${YYYY-MM-DD}` (meta only, no parsed title in cleartext); textarea
edits clear the saved chip + warn "Edited after PDF pick — saved
as pasted text"; error-code-keyed copy map keeps raw `err.message`
in the DEV console only. ADR 0155.

Tests: vitest 388 + Node 1256 + tsc clean. Zero new external API.

## 📎 2026-06-02 — Phase 13.0.1 shipped: PDF upload + on-device text extraction (SLM-E demo cut completes)

Closes the Phase 13.0 ADR 0149 deferral. Citizens can now PICK
a PDF instead of pasting — extraction runs entirely in this
browser via the locally-bundled pdfjs worker; the PDF blob
never leaves the device. DevTools Network tab stays empty
during pick + extract + summarise.

- **ADR 0154** — NEW pure-FE shared CORE substrate at
  `frontend/src/lib/pdf-text-extract.ts`. `extractPdfText(file,
  opts?)` returns a typed envelope. Five typed error codes
  (`unsupported_mime / too_large / encrypted / corrupt /
  no_text_layer`) map to citizen-friendly copy in the panel —
  the raw pdfjs error string never reaches the DOM.
- **npm dep**: `pdfjs-dist@^6.0.227`, founder-approved. Worker
  bundled locally via Vite `?url` import (no CDN fetch).
  pdfjs's `cMapUrl / standardFontDataUrl / wasmUrl` are never
  set so BinaryDataFactory throws rather than silently
  fetching.
- **DocSummariserPanel** extended with a file input next to
  the existing textarea. Image-only / encrypted / corrupt
  PDFs surface specific citizen-facing messages instead of
  silent empty pastes.
- **Adversarial review** (3 lenses): **1 MUST_FIX + 6
  SHOULD_FIX + 17 defer**; all 7 must+should fixed in-phase.
  Verdict ship_with_fixes. **MF-1 was critical** — Rules-of-
  Hooks crash on the install-pack demo flow, fixed by moving
  the PDF state hooks above the existing conditional early
  returns. SF-1 race-safety, SF-2 per-page failure tracking
  (all-pages-fail → `corrupt`, not the misleading
  `no_text_layer`), SF-3 failed pick preserves prior summary,
  SF-4 `MAX_EXTRACT_CHARS` aligned to SLM-E
  `DOC_INPUT_CHAR_CAP`, SF-5 `truncatedReason` field +
  branched panel notice, SF-6 `pdfBusy` in disable clauses.
- **Pure FE; zero BE changes** — by design AND as the pitch
  beat. A `/api/extract-pdf/*` endpoint would falsify the
  binding. Future cross-device PDF intake (if ever needed)
  must round-trip through the existing vault-key + memory-
  records substrate.
- **API_INTEGRATIONS.md impact**: zero new external API.
  `pdfjs-dist` is a build/runtime FE dep, not an external
  service — no env var, no auth flow, no partner credentials.
- **Tests**: vitest 356 → **382** (+26 PDF cases). Node 1233
  unchanged. tsc clean.

---

## 🎛 2026-06-02 — Phase 13.3 shipped: SLM-G on-device personalization (preferences never leave the device)

Third of four SLM USP features. Citizens flip a few enum knobs
on /settings (preferred language, response tone, accessibility,
topic interests) and every on-device SLM verb picks those
preferences up on the next generation. **DevTools → Application
→ Local Storage shows the JSON; Network tab stays empty.** That
is the entire pitch beat — three on-screen proofs in 60 seconds.

- **ADR 0153** — pure-FE substrate (`profile-store.ts` +
  `profile-prompt-fragment.ts`) named generically so SLM-H +
  Phase 12.3+ marketplace personalization compose the same
  exports. Profile schema is **PII-impossible by construction**:
  `enum × enum × bool × allowlist-domains`. No free-text input
  anywhere in the UI.
- **Two demo-visible SLM integrations**: intent-parser chip
  flips language / tone on the same input after a toggle; doc-
  summariser TLDR flips language / tone on the same Form-16
  paste. Both consumer hooks subscribe ONLY to `updatedAt` as a
  tripwire and read the profile lazily via `getActiveProfile`
  inside the parse/summarise callback — MF-1 stale-closure fix.
- **Cross-citizen isolation** has two moats now: (1)
  `getActiveProfile` returns defaults when the snapshotted
  identityId mismatches the active one; (2) `ProtectedSurface`
  in App.tsx is now `key={activeId}` so every protected route
  auto-remounts on identity flip (MF-2 — symmetric to Labs).
- **DPDP cascade complete**: `clearProfile()` wired into both
  Forget-persona and `eraseIdentity` success. Identity card body
  AND Erase modal cascade list both disclose the personalization
  wipe (MF-4).
- **Adversarial review** (3 lenses): **5 MUST_FIX + 10
  SHOULD_FIX + 6 defer**; all 5 must + 6 key should fixed
  in-phase. Verdict ship_with_fixes. MF-3 drops the
  `highContrast` no-op (wire-only — never read anywhere); v1→v2
  protocol bump with strict coerce-on-rehydrate. SF-1
  network-spy test pins the §15 bytes-never-leave-device
  binding so a future phase that accidentally subscribes a
  fetch breaks the test. SF-2 migrates `use-slm-intent-parser`
  to the citizen-safe generic error message (mirrors Phase 13.0
  MF-2; widened surface now that the prompt includes a profile
  preamble).
- **Pure FE, zero BE changes** — by design AND as the pitch
  beat. A `/api/profile/*` endpoint would falsify the
  "preferences never leave device" claim. FE-BE parity binding
  honoured by explicitly answering "BE: none, by design (privacy
  invariant)" in ADR 0153.
- **API_INTEGRATIONS.md impact**: zero new external API.
- **Tests**: vitest 313 → **356** (+43); Node 1233 unchanged.
  tsc clean.

---

## 🔒 2026-06-01 — Phase 13.2 shipped: piiRedaction annotation envelope + opt-in transparent Send pre-flight

Closes the Phase 13.1 SLM-F arc with the first BE delta in the
13.x SLM USP arc. The citizen's mask act is now provable in the
audit ledger as count-only meta — never spans, never the raw
or masked text.

- **ADR 0152** — new optional `piiRedaction` sub-envelope on
  `intentAnnotation` (`src/phase0/intent-annotation.mjs`):
  `detectedCount`, `maskedCount`, `kinds[]`, `source`,
  `appliedAt`.
- **Strict allowlist at the boundary** — any key not in
  `PII_ALLOWED_KEYS` is rejected. Closes leak vectors from
  synonyms (body / value / snippet / payload / content) that
  the original Phase 13.2 denylist would have missed.
- **§15 hardenings** — `appliedAt` strictly ISO-8601 UTC with
  millisecond precision DROPPED on accept (neutralises timing
  fingerprint). `kinds[]` cap enforced post-dedup. Ledger
  event surfaces count-only meta with JSON-grep test asserting
  no forbidden key surfaces.
- **Auto-scan on Send is OPT-IN** — `piiAutoscanEnabled`
  per-session flag flips true on first chip tap or first
  Apply. First-time citizens don't get surprise modals on
  benign 6-digit / 10-digit sequences. The "Keep All → Apply
  → Send" re-open loop is closed via `acknowledgedSinceScan`.
- **buildAnnotation honest counts** — `markApplied` now takes
  `(appliedSpans, appliedResult)` so `maskedCount =
  appliedSpans.length` and `kinds[]` reflects only the
  citizen-applied set. Earlier impl lied with
  `maskedCount === detectedCount` when citizens partially
  deselected.
- **Text-drift guard** — `buildAnnotation` returns null when
  the current text is neither original nor post-mask.
  `hasPendingPii` getter replaced with method-based
  `hasPendingPiiAgainst(text)` so callers can't ignore
  staleness.
- **Phase 13.1 deferred SHOULD_FIX wins** also applied: D6
  (fixture PIN swap to demo-family), D7 (honest "patterns
  only" chip framing when no SLM), D10 (per-row mask preview
  bug), D21 (unused import), SF-9 (`MaskableSpan` structural
  interface; unsafe TS cast removed).
- **Adversarial review** (3 lenses + triage): **3 MUST_FIX +
  10 SHOULD_FIX + 5 defer**; all 3 must + 6 key should fixed
  in-phase. Verdict ship_with_fixes.
- **API_INTEGRATIONS.md impact**: ZERO new external API.
- **Tests**: Node 1230 → **1233** (+3 MF-3 cases). Vitest 309
  → **313** (+4 fixture-PIN guards). tsc clean.

---

## 🛡 2026-06-01 — Phase 13.1 shipped: SLM-F on-device PII redactor (regex-primary + SLM-secondary)

Second SLM USP feature. Citizens type intents + notes that
often carry Indian PII (PAN, Aadhaar, mobile, GSTIN,
account, DL, RC, ABHA, UPI, email, PIN). Before that text
leaves the device, the chip says **"🛡 Check for PII before
sending"** — tap, see structured detected spans, tick what
to mask, tap Apply, see the textarea rewrite itself with
PAN ending kept + first 5 letters Xed. The whole flow runs
on-device. DevTools Network panel stays empty.

- **ADR 0151** — hybrid architecture: regex-primary
  (deterministic, synchronous, always available even with
  no SLM installed — honours the Phase 9.0b lazy-load
  contract) + SLM-secondary (context augmentation via
  Phase 13.0.0a shared runtime).
- **11 PII regexes** with per-kind deterministic mask
  shapers (`ABCDE1234F` → `XXXXX1234F`, `1234 5678 9012`
  → `XXXX XXXX 9012`, `+91 9876543210` → `+91 9XXXXXXX10`).
  Account regex has 24-char context-window guard requiring
  `a/c|account|bank` preceding the digits to suppress
  order-ID false positives.
- **SLM second pass** prompts the on-device model for
  context-only spans with strict KEY:value-per-span format
  + anti-hallucination guard (drops spans where
  `text.slice(start,end) !== raw`).
- **Wired into both boundary surfaces** — chip on
  CitizenIntent (below SLM-A "Check my understanding") AND
  CitizenNotes create-sheet (above Save). Apply rewrites
  textarea BEFORE handleSend / handleCreate runs.
- **§15 Send/Save foot-gun gate** — `window.confirm` if
  citizen scanned, found PII, dismissed the sheet, and is
  about to dispatch raw PII.
- **Pre-step refactor**: extracted `slm-parse-helpers.ts`
  (clipLine, clampConfidence, djb2Hash) — doc-summariser
  re-exports the first two; ADR 0149 vitest pins green.
- **New shared component** `CooldownCountdown.tsx` —
  live-decrementing ticker reusable for SLM-D / SLM-E
  migration when those phases drop the frozen-snapshot
  cooldown labels.
- **Adversarial review** (3 lenses + triage): **6 MUST_FIX
  + 12 SHOULD_FIX + 21 defer**; all 6 must + 6 key should
  fixed in-phase. M1 mergeSpans regex-wins-on-overlap
  correctness (two-pass regex-first); M2 maskMobile
  digit-vs-char-index bug; M3 PiiReviewSheet prevResult
  re-seed (was keyset-equality); M4 nested-Sheet Escape
  bug on /notes; M5 cooldownUntil wall-clock + ticker
  component; M6 Send-side confirm gate. S1+S2+S3 regex
  coverage gaps. S8 Map cleanup. S9 runtime snapshot.
  S12 piiRedactor.reset on send success.
- **Pure FE, zero BE changes**. Mirrors Phase 10.6 + 13.0
  precedents. FE-BE parity binding answered explicitly in
  ADR 0151: transparent handleSend integration +
  `piiRedactionAnnotation` envelope + offline-queue replay
  redaction all land in Phase 13.2.
- **API_INTEGRATIONS.md impact**: zero new external API.
- **Tests**: vitest 201 → **309** (+108 SLM-F cases).
  Node 1217 unchanged. tsc clean.

---

## ⚙️ 2026-06-01 — Phase 13.0.0a shipped: shared wllama runtime singleton (prereq for SLM-F/G/H)

The Phase 13.0 adversarial review caught a latent lie — the
booking-advisor header had been claiming the runtime is
loaded at most once across all SLM consumers, but each hook
held its own `runtimeRef` and reloaded the GGUF
independently. A warm session running 4 SLM verbs loaded
~1.4 GB into WASM four times.

- **ADR 0150** — `getSharedSlmRuntime(packId, blobLoader,
  opts?)` + `releaseSharedSlmRuntime(packId?)` in
  `slm-runtime.ts`. Module-level `Promise<SlmRuntime>` cache.
  Same packId → cached promise (load once). Different packId
  → fire-and-forget unload prior + rebuild. `Error('no_blob')`
  rejection clears cache so retries work.
- **All 4 SLM hooks + SlmTryPrompt refactored** to compose
  the singleton. Each hook keeps its own mountedRef +
  inflightRef + rate-limit + status union (per-feature
  concerns) but the runtime itself is shared.
- **Unmount no longer unloads** (would pull the rug from
  concurrent consumers). Pack uninstall in Labs.tsx
  `handleRemove` calls `releaseSharedSlmRuntime(packId)`
  explicitly.
- **§15 hardening propagated**: `logger: 'silent'` now passed
  from ALL 4 hooks + SlmTryPrompt (was only doc-summariser
  in Phase 13.0). Defence-in-depth — wllama tokenisation
  errors can no longer echo prompt bytes to DevTools console
  regardless of which SLM verb fired.
- **Tests**: vitest 193 → **201** (+8 cases). Node 1217
  unchanged. tsc clean.

---

## 📄 2026-06-01 — Phase 13.0 shipped: SLM-E on-device document summariser (demo cut v1)

The first feature in the Phase 13.x SLM USP arc. **Paste an
Indian-paperwork document, tap Summarise, watch TITLE / TLDR
/ 3 bullets stream in token-by-token while a green "Stays on
this device · 0 bytes uploaded" badge holds.** DevTools
Network tab stays empty throughout. This is the cleanest
USP-in-90-seconds beat the company has shipped.

- **ADR 0149** — `src/lib/doc-summariser.ts` (pure prompt
  builder + line-regex parser), `use-slm-doc-summariser.ts`
  (first onToken streaming consumer in the repo;
  per-doc 2/60s + global 6/5min rate-limit;
  `mountedRef` + `inflightRef` + unmount-cleanup),
  `DocSummariserPanel.tsx` (6-pill picker + textarea +
  streaming `<pre>` + structured chip block).
- **6 doc kinds**: electricity bill, Form 16, T&Cs,
  insurance policy, lender contract, other. Per-kind bias
  hints inject 1-3 keywords into a single shared prompt
  template — keeps SLM-F / SLM-G / SLM-H near-free to add
  (new DocKind variant + one bias-hint entry).
- **Protocol version pinned** `bos.phase13.doc-summariser.v1`.
- **§15 bindings**: bytes-never-leave-device; `silent` logger
  passed to `loadSlmRuntime` AND `slm-runtime.ts` updated
  so the silent branch noops warn+error (otherwise a wllama
  tokenisation error could echo prompt bytes to DevTools
  console); echo guardrail coerces `DOC_KIND` to caller-
  supplied expected; allowlist on `RISK_FLAG` + `LANGUAGE`;
  6 sample fixtures use demo-persona PII (PAN ending 0000,
  consumer DEMO-, policy POL-DEMO-); vitest sanity-greps
  reject real-shaped PAN/Aadhaar in fixtures.
- **Adversarial review** (3 lenses + triage): **5 MUST_FIX +
  6 SHOULD_FIX + 12 defer**; all 11 must/should fixed
  in-phase. MF-1 `key={identity.id}` on the panel so a
  shared-device identity flip forces remount (citizen B
  never sees citizen A's pasted bytes). MF-2 generic error
  message + honest `no_blob` Card branch. MF-3 streamed
  `<pre>` kept visible after `ready` so the pitch beat
  survives the chip-render frame. MF-4 `inflightRef`
  carries `docKey` (no silent aliasing across docKinds).
  MF-5 cooling-down auto-exits via `setTimeout`.
- **Pure FE, zero BE changes**. Mirrors Phase 10.6 SLM-hint
  precedent. FE-BE parity binding answered explicitly in
  ADR 0149: persistence + `doc.summarised` ledger event
  land in Phase 13.0.2.
- **API_INTEGRATIONS.md impact**: zero new external API. The
  whole point of the USP is that the document never leaves
  the device.
- **Tests**: vitest 146 → **193** (+47 doc-summariser cases).
  Node 1217 unchanged. tsc clean.

---

## 🏪 2026-06-01 — Phase 12.3 shipped: wave-2 provider roles (kirana + skilled-trades) + GST adapter

`kirana` (shopkeeper) and `skilled-trades` (electrician /
plumber / carpenter / ITI-trained) provider roles are
LIVE in the substrate. The marketplace now covers all 6
intended wave-1 + wave-2 roles. GST is the 4th external-
adapter integration (after Nominatim, India Post, and
Parivahan) and the **first one with a real tax-authority
upstream** (GSTN via GSP partnership or commercial
wrapper).

- **ADR 0148** — `src/phase1/gst-adapter.mjs` composes
  the Phase 12.2.1 substrate. Provider allowlist `stub |
  sandbox | surepass | karza | gsp-direct`. Default mode
  stub. `cacheKey = gst:<sha256(GSTIN).slice(0,32)>` —
  raw GSTIN NEVER lands on cache key or ledger.
- **Wave-2 schemas** — kirana required shop name +
  shop-license # + shop-license attachment; optional
  GSTIN / FSSAI / years-in-business. skilled-trades
  required ITI cert # + institute + ITI cert attachment;
  optional years-experience / portfolio URL.
- **HIGH adversarial fix — GSTIN + FSSAI pattern
  enforcement.** Field specs now carry `pattern: RegExp`
  + `normalize: 'upper'`. Before this, citizens could
  type any ≤15-char rubbish into gstinNumber, the BE
  silently accepted it, the verifier no-op'd on shape,
  and the operator saw a stored garbage GSTIN with no
  verification result. Now BE rejects on shape at
  submit time; FE mirror enforces the same regex for
  immediate UX feedback.
- **HIGH adversarial fix — empty-results guard.** The
  `verify-role-extras` endpoint now returns 400
  `nothing_to_verify` instead of silently stamping a
  misleading "verified at T by operator X" with empty
  results. Triggers for skilled-trades (no automated
  verifier) and kirana-without-GSTIN.
- **HIGH adversarial fix — operator console honesty.**
  "Pre-verify" button is now gated on roles with a
  configured adapter (label tracks the adapter:
  Parivahan / GST); skilled-trades shows a "Manual
  review only" tag instead. Previously the button
  rendered unconditionally for every submitted role.
- **MED adversarial fixes** — `Promise.allSettled`
  defensive merge (so one adapter throwing doesn't
  collapse the other's good result); generalised 502
  message references both `BHARAT_OS_PARIVAHAN_MODE`
  and `BHARAT_OS_GST_MODE`; **API_INTEGRATIONS.md §3.3
  GST flipped 📋 Reserved → 🧪 Stub-only** with full
  partner-provisioning notes.
- **Tests**: Node 1199 → **1217** (+18 wave-2 + GST +
  adversarial-fix cases). Vitest 140 → **146** (+6).
  tsc clean.

---

## 🔗 2026-06-01 — Phase 12.2.7 shipped: FE "Link DigiLocker" card + KYC L1 wiring (closes FE-BE gap from 12.2.6)

The Phase 12.2.6 DigiLocker substrate now goes end-to-end —
citizen taps "Link DigiLocker" at the top of the KYC L1
wizard → stub OAuth dance completes → operator sees the
🔏 (signed) badge on the verification result.

- **ADR 0147** — `frontend/src/lib/use-digilocker-link.ts`
  exports three TanStack hooks: `useDigilockerLinkStatus`
  (query), `useLinkDigilocker` (runs authorize + callback
  in sequence in stub mode), `useUnlinkDigilocker`.
- **NEW `<LinkDigilockerCard/>`** at the top of the KYC L1
  identity step. Honest **"(demo mode — substrate ready,
  partner credentials pending)"** tag whenever
  `mode==='stub'` so investors / operators don't mistake
  stub verification for the real thing.
- **§15 bindings honored** — `actingRootIdentityId` travels
  in the `X-Bharat-OS-Acting-Identity` header ONLY (never
  in URL query strings; the shell ships a service worker
  that logs URLs, and the rootIdentityId is a stable
  per-user correlator that shouldn't sit in URL telemetry).
  TanStack response type excludes tokens. Same-origin
  assert on the BE-supplied authorizeUrl defends against a
  redirectUri allowlist regression.
- **Adversarial review** — 2 lenses (FE token-leak / UX
  honesty) surfaced 10 findings. **6 medium fixed
  in-phase**: same-origin assert, query-string → header
  migration, `window.confirm` before Unlink (matches the
  codebase's destructive-action discipline), error
  branching for clearer citizen messages, double-tap gate
  via mutation status, status-error fallback so API-down
  doesn't silently hide the card.
- **API_INTEGRATIONS.md** updated: DigiLocker §3.1 now
  documents the FE surface ships in 12.2.7.
- **Tests** — Vitest 138 → **140** (+2 hook smoke cases).
  Node 1199 unchanged (FE-only phase). tsc clean. Bundle
  628 → 632 KB / 177 → 179 KB gzipped (+4 KB).

**Next: Phase 12.2.8** — live OAuth popup flow + postMessage
listener when partner credentials arrive. OR Phase 12.3+
(wave-2 provider roles: kirana + GST verify, skilled-trades
+ ITI cert). OR Phase 14 Sahayak (rural-reach product
layer, biggest demo unlock).

---

## 🔏 2026-06-01 — Phase 12.2.6 shipped: DigiLocker OAuth2 substrate + first non-stub Parivahan provider + Sahayak no-smartphone binding

The first **citizen-authenticated** verification flow lands —
substrate for every future DigiLocker-mediated identity path
(Aadhaar e-KYC, PAN verify, RC/DL fetch). And the strategic
direction for serving the ~700M Indians without usable
smartphones is captured as a binding.

- **ADR 0146** — `src/phase1/digilocker-substrate.mjs` —
  OAuth2 helpers + state generation + signed-document
  verification. Frozen scope allowlist. Stub mode =
  deterministic flow; live mode hits
  `api.digitallocker.gov.in` when partner credentials set.
- **4 endpoints** — `/api/digilocker/authorize` (mints
  state + builds redirect), `/callback` (exchanges code +
  persists link), `/status` (link presence, NEVER returns
  the token), `DELETE /link` (unlink + audit).
- **§15 bindings** — access + refresh tokens NEVER on the
  audit ledger AND NEVER in the `/status` response. State
  binds to rootIdentityId server-side; the callback uses
  the bound identity, not the URL. DPDP cascade erases
  both `digilocker_states` and `digilocker_links` atomically
  with the identity.
- **Parivahan integration** — `verifyRoleExtrasFields` now
  accepts an optional `digilockerLink`. When present, the
  substrate uses the citizen-authorised signed-document
  path; result envelope carries a `signedDocSha256`
  pointer. Operator console shows 🔏 (locked) badge so the
  stronger trust signal is legible at a glance.
- **Adversarial review** — 17 findings across 3 lenses
  (token-leak / state-CSRF / DPDP-storage). **5 high+med
  fixed in-phase**: bindingDigest skipped in stub (was
  rainbow-tableable for `dl-stub-access-<state>` tokens);
  open-redirect via `?redirectUri=` closed via allowlist;
  state ordering reversed to peek → exchange → consume so
  a transient live-mode error no longer burns the state;
  silent live→stub fallback now warn-once at startup;
  opportunistic sweep bounds stale-state growth.
- **Sahayak no-smartphone binding** — strategic direction
  captured: Snabit / Pronto / PayNearby / Eko / Spice Money
  proved the agent-assisted model. A trained, KYC'd local
  agent uses THEIR device to onboard + transact on behalf
  of citizens with feature phones or no phones at all.
  Substrate is ~70% there today (KYC + role-extras +
  attachments + DigiLocker biometric + SMS providers);
  remaining 30% is the Sahayak product layer + partner
  partnerships (USSD aggregator, UIDAI AUA license). New
  memory binding + ROADMAP Phase 14.x sub-items.
- **API_INTEGRATIONS update** — DigiLocker §3.1 flipped
  from 📋 Reserved to 🧪 Stub-only with full env-var list +
  partner-provisioning steps.
- **Tests** — Node 1166 → **1199** (+33 substrate + storage
  + endpoint + binding-grep + cascade + Parivahan
  integration + 7 adversarial-fix cases). Vitest 138
  unchanged. tsc clean. Build green. Bundle unchanged.

**Next: Phase 13.4 SLM-H** (skill agents for Indian tasks —
electricity bill / consumer complaint / PM-KISAN scheme;
closes the 4/4 SLM USP arc) OR **Phase 13.3.x** (SLM-F
substrate cleanups: standalone piiRedaction-only annotation
path + per-identity persisted opt-in + offline-queue replay
redaction) OR **Phase 13.0.2** (PDF hardening pass — explicit
pdfjs defensive flags + `pdf.destroy()` cleanup + the 15
deferred SHOULD_FIX items) OR **Phase 14 Sahayak**. Direction
flexible.

---

## 🚗 2026-06-01 — Phase 12.2.5 shipped: Parivahan verification adapter + API_INTEGRATIONS master tracker

Third concrete adapter composing the Phase 12.2.1 external-
adapter substrate (after Nominatim + India Post PIN). Auto-
verifies the citizen's typed DL # + vehicle registration #
against the official Government of India endpoints so the
operator's manual cross-check becomes a one-click ✓/✗
badge.

- **ADR 0145** — `src/phase1/parivahan-adapter.mjs` substrate
  with frozen provider allowlist (`stub | digilocker |
  surepass | karza | idfy`). v1 ships stub only; live
  providers slot in additively (each requires its own
  partner registration). Stub returns deterministic
  "valid" with a REAL `fetchedAt` timestamp so demo
  freshness reads honestly.
- **Endpoint** — POST
  `/api/admin/provider-identities/:id/verify-role-extras`
  (admin bearer). Status guard: refuses non-draft /
  non-submitted (operator must re-bounce through draft to
  re-verify). All-error result → 502 + skips ledger event
  (was polluting the audit trail with misconfig disguised
  as verification outcomes).
- **NEW ledger event** `provider_identity.role_extras_verified`
  carries field-id + status + operatorId + role ONLY.
  Never holder names or validity dates.
- **§15 fix** — `selfProviderRecord` does NOT echo
  `roleExtrasVerifications` (would have leaked holder names
  + validity dates through the URL-trusted owner-list
  endpoint, strictly MORE sensitive than the existing
  "••••" redacted answers). Operator-authenticated paths
  still see the full record.
- **§15 fix** — `verifier_error` envelope sanitized to
  `{code: 'verifier_unavailable'}` only; was leaking
  "Parivahan provider X not yet configured. See docs/..."
  message to anyone reading the owner-list.
- **Operator console** — Pre-verify button per row +
  color-coded badges (green ✓ valid / red ✗
  verifier_error / amber ⚠ not_found) with **`[stub]`
  marker** so demo results aren't mistaken for real.
- **NEW `docs/API_INTEGRATIONS.md`** — master tracker for
  every external API Bharat OS needs to go live:
  Parivahan, DigiLocker (Aadhaar e-KYC), NSDL PAN, GSTN,
  NPCI/UPI, Razorpay IFSC, Karix/Gupshup/MSG91/Twilio
  SMS, ABDM/ABHA, ONDC. Per service: adapter path, cost,
  partner-provisioning steps, exact env-var names. Will
  be updated every phase a new external API surfaces.
- **Adversarial review** (3 lenses — PII / auth / UX) —
  20 findings; **8 high+med fixed in-phase**: PII leak via
  selfProviderRecord, verifier_error message persistence,
  status guard missing, stale verification on resubmit,
  audit-pollution on misconfig, stub freshness UX, doc
  env-var drift, badge color + stub marker.
- **Tests** — Node 1142 → **1166** (+24 substrate + endpoint
  + binding-grep + 5 adversarial-fix cases). Vitest
  unchanged (138). tsc clean. Bundle unchanged.

**Next: Phase 12.2.6** — DigiLocker partner registration +
first real live provider for the Parivahan adapter
(citizen-authenticated DL fetch). OR Phase 12.3+ wave-2
provider roles (`kirana`, `skilled-trades`). Direction
flexible.

---

## 🪪 2026-06-01 — Phase 12.2.4 shipped: per-role heavy extras (wave-1) + operator attestation flow

The wave-1 onboarding loop closes. All 4 wave-1 provider roles
(cab-driver / personal-driver / labourers / household-help)
now have a role-specific verification step in the citizen
wizard + a parallel attestation flow on the operator side.
Composes the KYC L1 + Attachment CORE substrates that landed in
Phase 12.2.2 + 12.2.3.

- **ADR 0144** — `src/phase1/provider-role-extras.mjs` exports
  `PROVIDER_ROLE_EXTRAS` (4 closed schemas: required +
  optional verification fields + required attachment kinds
  per role). Field kinds: `text`, `date`, `phone` (India
  10-digit 6-9 leading), `integer`. Schemas are **deep-frozen**
  (adversarial fix); GET endpoint returns a `structuredClone`.
- **provider-identity** gets two new optional fields:
  `roleExtrasSubmission` (citizen-driven envelope) +
  `roleExtrasAttestation` (operator-driven envelope, separate
  from KYC attestation so the audit trail records WHICH
  evidence chain — identity vs role — the operator reviewed).
- **Endpoints**: POST `/api/provider-identities/:id/submit-role-extras`
  (owner-auth, attachment ownership cross-check, ledger-
  before-save), POST `/api/admin/provider-identities/:id/attest-role-extras`
  (admin bearer), GET `/api/provider-role-extras-schemas`
  (public schema map).
- **Activation guard**: refuses wave-1 activation without
  `roleExtrasAttestation`, with `attestedSchemaVersion <
  submission.schemaVersion` (stale schema), or with
  `attestedSubmittedAt !== submission.submittedAt` (citizen
  re-submitted between operator review and attest — defense
  in depth; substrate auto-clears attestation on re-submit
  but the guard catches the out-of-band case).
- **FE wizard 5 → 6 steps** (identity → selfie → idProof →
  address → **roleExtras** → review). Wave-2 roles (kirana,
  skilled-trades) keep the 5-step flow. `useEffect` snaps
  step back into STEP_ORDER if roleKind changes mid-session.
  New `<RoleExtrasStep/>` paints ALL failing fields at once
  (no more jagged one-error-at-a-time UX).
- **PhotoCapture** gets `acceptMode='image+pdf'` for document
  scans + **magic-byte PDF sniff** (Android often returns
  `application/octet-stream`; trusting `file.type` alone
  broke the preview).
- **Operator console**: per-kind View buttons per attachment,
  "Attest role basic / verified" pair separate from KYC
  attest, two-step confirm echoes role + schemaVersion.
- **§15 bindings**: `provider_identity.role_extras_submitted` +
  `role_extras_attested` ledger events carry field NAMES +
  attachment ID handles + role + schemaVersion ONLY — never
  the verification numbers / employer names. Owner-list
  redacts values to "••••" (same posture as KYC L1
  last-4). Schema-version drift caught loudly via
  `schema_version_stale` (not silently overwritten).
- **Adversarial review** — 4-lens parallel workflow surfaced
  27 findings. 11 high+med fixed in-phase including the
  deep-freeze bypass, schema-version silent overwrite, post-
  KYC-attest lock-out, answers-swap race between review and
  attest, stale-schema activation gap, role-swap dead-end,
  PDF MIME trust, multi-error reveal, review-step value
  echo, FE/BE schema parity snapshot test.
- **Tests** — Node 1110 → **1142** (+32 substrate + endpoint
  + binding-grep + adversarial-fix cases) + vitest 124 →
  **138** (+14). tsc clean. Bundle 618 → 628 KB / 175 →
  177 KB gzipped (+10 KB).

**Next: Phase 12.2.5** — **mParivahan / Sarathi / Vahan
adapter** composes the Phase 12.2.1 external-adapter
substrate to AUTO-VERIFY the typed DL # / vehicle registration
# / commercial permit # against the official Government of
India endpoints. Stub mode returns "valid" for demo; live
mode hits `parivahan.gov.in/rcDlStatus` and related (requires
sandbox key registration). Operator's manual cross-check
becomes a pre-validated badge.

---

## 📸 2026-06-01 — Phase 12.2.3 shipped: Attachment CORE substrate + KYC L1 selfie/ID-proof photos

The binary blob substrate Phase 12.2.4 per-role extras and Phase
12.x dispute evidence will compose without modification. Built
once, shipped with KYC L1 selfie + ID-proof as the first
consumer + the operator review queue's photo-view path.

- **ADR 0143** — `src/phase1/attachment.mjs` substrate with
  MIME allowlist (jpeg/png/webp/pdf), content-addressed
  `bos:att:<32hex>` IDs (sha256-derived), 5 MiB per-blob +
  50 MiB per-actor caps, EXIF-bearing flag, typed errors.
  New `attachments` table on both stores (SqliteStore: BLOB
  column with composite PK on sha256 + root; BosStore:
  two-file `.bin` + `.json` siblings, DPDP cascade unlinks
  `.bin` FIRST to avoid orphaned naked blobs).
- **Endpoints** — POST/GET-list/GET-id/DELETE
  `/api/attachments` with owner-auth (`X-Bharat-OS-Acting-
  Identity` header) or admin-bearer paths. Content-addressed
  cache on GET (`private, max-age=31536000, immutable` +
  ETag); per-route 8 MiB body cap; `expensive` rate-limit
  policy on POST.
- **§15 bindings** — `attachment.saved` / `attachment.erased`
  / `attachment.admin_read` events carry meta only (never
  bytes). `/api/attachments/:id` rewritten in `safePath` so
  the access log never carries the sha256 prefix. Operator
  GET emits an audit event so a leaked admin token leaves a
  trail. Quota wrapped in `BEGIN IMMEDIATE` on SQLite
  (parallel uploads can't blow past the cap). EXIF flagged
  but not yet stripped — Phase 12.x scope.
- **KYC L1 wiring** — schema extended with optional
  `selfieAttachmentId` + `idProofAttachmentId`; ownership
  cross-checked at submit time (a citizen cannot reference
  another citizen's blob); KYC L1 wizard grew 3 → 5 steps
  (identity → **selfie** → **idProof** → address → review).
- **FE** — `useAttachmentUpload` TanStack mutation +
  `<PhotoCapture/>` component (file-input primary path with
  `accept="image/*" capture=environment|user`; preview +
  confirm + retake; real thumbnail render on resubmit, fixed
  during adversarial review).
- **Operator console** — per-row "View selfie" / "View ID
  proof" buttons; blob URL opens in new tab; URL revoked
  after 30s; EXIF warning banner; graceful framing when the
  citizen erased a blob between submit and review.
- **Adversarial review** — 4-lens parallel workflow surfaced
  26 findings (6 PII / 6 DPDP / 6 auth / 8 UX). 11 high+med
  fixed in-phase including PIN-style access-log redaction,
  BosStore cascade ordering bug, quota TOCTOU race, admin-
  read audit event, real-thumbnail UX-honesty fix. 15 low
  deferred or accepted with explicit scope.
- **Tests** — Node 1082 → **1110** (+28 substrate + storage
  + endpoint + binding-grep + adversarial-fix cases) +
  vitest 121 → **124** (+3 substrate constants). tsc clean.
  Bundle main 612 → 618 KB / 174 → 175 KB gzipped (+6 KB).

**Next: Phase 12.2.4** — wave-1 per-role extras compose this
substrate (cab-driver vehicle docs, personal-driver police
verification, labourers contractor attestation, household-help
references) + EXIF stripper on existing rows.

---

## 🪪 2026-06-01 — Phase 12.2.2 shipped: citizen-driven KYC L1 wizard + India Post PIN-code adapter + operator review queue

The common physical-service KYC slice for the 4 wave-1 provider
roles. Citizen runs a 3-step wizard (identity → address with PIN
auto-fill → review) to produce a `kycLevel1Submission` record
that the operator review queue consumes before elevating the
provider into the marketplace. Second composition of the external-
adapter substrate proves it generalises beyond geo.

- **ADR 0142** — `src/phase1/india-post-pincode.mjs` composes
  the substrate with postalpincode.in (5 req/sec polite cap,
  7-day TTL). cacheKey on the audit ledger is a sha256 digest
  of the PIN, **NOT** the raw PIN; `safePath` rewrites
  `/api/geocode/pincode/:pin` so the access log never carries
  the PIN either. Both surfaces hardened by the adversarial
  review.
- **KYC L1 substrate** — new `kycLevel1Submission` field
  carrying `{fullLegalName, aadhaarLast4, panLast4,
  addressPinCode, addressLine, cityFromPincode,
  stateFromPincode, submittedAt}`. **Aadhaar / PAN last-4
  only** — substrate defensively rejects a 12-digit Aadhaar /
  10-char PAN; UI paste handler keeps the TRAILING 4 (a
  critical bug the adversarial review caught — it was keeping
  the leading 4, which is wrong for both IDs). New ledger
  event `provider_identity.kyc_l1_submitted` carries field
  NAMES + city/state ONLY — never the values.
- **Strong auth** (KYC-AUTH-1 fix) —
  `POST /api/provider-identities/:id/submit-kyc-l1` uses
  `requireProviderOwnerAuth` via the `X-Bharat-OS-Acting-
  Identity` header; the older weak `body.rootIdentityId
  === existing.rootIdentityId` pattern is replaced. Plus
  ledger-before-save ordering (L2-3) + optimistic
  concurrency re-read returning 409 (partial L2-1).
- **Owner-list redaction** —
  `GET /api/identities/:rootId/provider-identities` now
  redacts `aadhaarLast4` / `panLast4` to "••••" and
  `addressLine` to "•••• (re-enter to edit)" via the new
  `selfProviderRecord` projection. Defense-in-depth until
  Bharat ID lands signed sessions in Phase 13+.
- **Operator review queue** — new `#provider-kyc-review`
  section on `public/operator-console/` with admin-token /
  operator-id topbar (sessionStorage only — never
  localStorage). Two-step confirm on Attest / Activate
  echoes the legal name + Aadhaar last-4 + PAN last-4
  BEFORE collecting notes (attest-no-confirmation-dialog
  fix).
- **UX honesty** — stub-mode is honest: PIN lookup in stub
  doesn't return a fake "Pune, Maharashtra" for every PIN;
  the wizard surfaces a manual City + State `Field` pair.
  Rejection vs pending distinguished: when
  `provider.lastTransition` reads `submitted → draft`, the
  wizard + ProviderProfile render a warning banner with the
  operator's reason quoted, not the "awaiting review" trust
  banner.
- **Adversarial review** — 4-lens parallel workflow surfaced
  24 findings (5 PII / 7 state-machine / 4 auth / 8 UX). 12
  high+med fixed in-phase; 12 low deferred with explicit
  scope rationale in the ADR.
- **Tests** — Node 1053 → **1082** (+29) + vitest 119 →
  **121** (+2). tsc clean. Bundle main 599 → 612 KB / 170 →
  174 KB gzipped (+13 KB).

**Next: Phase 12.2.3** — per-role extras (cab-driver vehicle
docs, personal-driver police verification, etc.) + the
attachment CORE substrate for selfie / ID proof photos.

---

## 🌐 2026-06-01 — Phase 12.2.1 shipped: external-adapter substrate + first real API (OSM Nominatim reverse geocode)

First real external-API integration. Lays down the substrate that
every future Bharat OS integration — DigiLocker, Aadhaar e-KYC,
GST, UPI rails, NPCI — will compose in ~100 lines.

- **ADR 0141** — `src/phase0/external-adapter.mjs` `createAdapter`
  factory owns the cross-cutting concerns once: stub-vs-live
  mode (env-configurable per adapter; defaults stub for demo
  safety), in-memory LRU cache (pointer-not-payload — caller
  hands a coarsened cacheKey), token-bucket rate limit (default
  1 req/sec), polite User-Agent + Accept injection, 6s timeout,
  audit-ledger emission (`external_adapter.call` — meta only,
  NEVER the response body).
- **First adapter** — `src/phase1/nominatim-geocoder.mjs`
  composes the substrate with OSM Nominatim's exact policy:
  1 req/sec hard cap, polite UA with contact URL, 1dp bubble
  (~11 km) as cache key (two pickups in the same bubble share
  one upstream call; the upstream URL is built from the
  rounded value, so even the wire never sees the 4dp citizen
  pickup), 24h TTL.
- **Endpoint** — `GET /api/geocode/reverse?lat&lng` returns
  `{mode, source, place: {label, suburb, city, state,
  countryCode, osmId}, latencyMs}`. Honest failure modes:
  rate-limited → 429, invalid input → 400, upstream / network
  → 502.
- **FE** — `useReverseGeocode` TanStack hook +
  `<PickupAreaHint/>` component render "Near Shivajinagar,
  Pune" above the raw lat/lng on both branches of
  `ProviderBookingDetail` (post-accept full coord + pre-accept
  masked bubble) and `CitizenServices` booking detail.
- **§15 bindings** — audit event JSON contains zero 4dp coord
  literals (vitest case); UA matches `/^BharatOS\//` and
  carries a contact in parens; stub-first default means demo
  deployments never burn an upstream call by accident.
- **Tests** — Node 1035 → **1053** (+18 external-adapter
  cases) + vitest 115 → **119** (+4). tsc clean. Bundle main
  unchanged at 599 KB / 170 KB gzipped.

**Next: Phase 12.2.2** — wave-1 KYC wizard or the next external
adapter as the user provisions sandbox keys (DigiLocker,
Aadhaar e-KYC, GST).

---

## 🤝 2026-06-01 — Phase 12.1b.4 shipped: SLM-D booking advisor — Phase 12.1b arc CLOSED

Last of four 12.1b AI-orchestration sub-phases. **All four SLM
sub-phases shipped today** (A intent / B offline / C forms / D
advisor). Honest scope: true rate-negotiation breaks
`rateSnapshot` immutability + escrow contract (multi-week effort
→ Phase 12.2). Shipped the smallest useful slice: a **FE-only
provider booking advisor**.

- **ADR 0140** — FE-only.
- On `pre_authorized`, provider taps "✨ Ask my SLM: should I
  accept?" → on-device wllama generates `accept | reject |
  unsure` + a one-line rationale + an optional polite
  reject-reason chip the provider taps to pre-fill the
  existing reject input.
- The chip NEVER changes booking state — only the existing
  Accept/Reject buttons do.
- Pure primitives at `frontend/src/lib/booking-advisor.ts`
  (prompt builder + completion parser; protocol version
  pinned).
- Runtime hook reuses the Phase 9.0c wllama singleton — model
  bytes load AT MOST ONCE across SLM-A intent / SLM-C
  field-suggest / SLM-D advisor.
- Tiered rate limit: 3 per booking per 60s + 12 global per
  5min. Inflight singleton.
- Bindings: 1dp bubble in prompt ONLY — vitest case asserts
  no 4dp coord literal; no citizen PII; zero new ledger
  events; user controls inputs.
- Tests: **1035/1035 Node** unchanged + **115/115 vitest**
  (+10 booking-advisor contracts).
- Bundle: 592 → 599 KB / 170 KB gzipped (+7 KB).

**Phase 12.1b arc CLOSED.** Sub-phases shipped today: 12.1b.1
SLM-A vernacular intent (ADR 0137), 12.1b.2 SLM-B offline-first
(ADR 0138), 12.1b.3 SLM-C light dynamic forms (ADR 0139),
12.1b.4 SLM-D booking advisor (ADR 0140).

**Next: Phase 12.2** — wave-1 KYC wizard (Aadhaar OCR +
DigiLocker + operator review console).

---

## 📝 2026-06-01 — Phase 12.1b.3 shipped: SLM-C light dynamic forms

Third of four 12.1b AI-orchestration sub-phases. Light = no docs,
no OCR, no KYC. Just the small structured extras that help a
citizen find the right provider beyond {name, rate, area}.
Provider Onboarding now renders a "More about this role" Card
with per-role light fields (vehicle type + plate region + AC for
cab-driver; can-cook + languages + about-you for household-help;
etc.) and an SLM "Suggest with my SLM" chip on freeform fields
that lets the provider tap to accept — never auto-fills.

- **ADR 0139** — BE + FE.
- Generic substrate at `src/phase0/dynamic-form.mjs`; per-role
  schemas at `src/phase1/provider-role-forms.mjs`. Reusable for
  future BookingComposer + ConsentSheet.
- New optional `roleAnswers` field on providerIdentity, NOT
  echoed by publicProviderRecord (citizen privacy tested).
- New `provider_identity.updated` ledger event carrying field
  names only (pointer-not-payload).
- SLM suggest UX: tap-to-accept only; hidden when no SLM
  installed; tiered rate limit. Layered on the existing wllama
  runtime so weights aren't loaded twice.
- Tests: **1035/1035 Node** + **105/105 vitest**.
- Bundle: 577 → 592 KB / 168 KB gzipped (+15 KB).

**Next: Phase 12.1b.4** SLM-D negotiation agent, OR Phase 12.2
wave-1 KYC wizard (Aadhaar OCR + DigiLocker + operator review).

---

## 📴 2026-06-01 — Phase 12.1b.2 shipped: SLM-B offline-first decisioning + queued sync

Second of four 12.1b AI-orchestration sub-phases. Bharat OS now
works in poor-connectivity India: a citizen who types an intent
while offline sees an honest "Saving offline — will send when
you're back online." toast; the intent persists on their phone in
a per-identity IndexedDB queue; on reconnect the drainer replays
it with a stable `Idempotency-Key`; the server returns either the
cached response (if a duplicate POST happened on the way) or a
fresh orchestration. Audit ledger remains the source of truth —
worker fires exactly ONCE per real mutation, replays append a
distinct marker event.

- **ADR 0138** — BE + FE.
- **Ledger-backed idempotency**: three new event types on the
  existing append-only ledger (no new SQL table). Scope-generic
  so 12.1b.3 wraps bookings/consents/flags with no refactor.
- **Per-actor scoping** structural: stolen `Idempotency-Key`
  cannot cross-replay another citizen's intent.
- **Tamper tripwire**: same key + different payload → 409 +
  separate ledger event.
- **Per-identity IndexedDB** (`bharat-os-offline-<actorId>`) so
  two profiles on the same device can't enumerate each other's
  queue — judge-panel-flagged §15 binding requirement.
- **Drainer**: sequential FIFO, `navigator.locks` single-flight
  with promise-chain fallback for strict-mode safety. Each
  row's idempotencyKey reused across all attempts.
- **Surface**: `OfflineQueuePill` above the intent textarea
  (4 honest states) + `/citizen/queue` route with
  `QueuedIntentsPanel` ("N queued — not yet on Bharat OS"
  verbatim copy + Retry / Discard).
- **Adversarial review**: Audit ship_clean. 1 must-fix + 2
  should-fix applied — SubtleCrypto + getRandomValues guards
  (insecure-context honest error); stranded-`sending`-row
  recovery; Web Locks fallback serialization; background drain
  success toast.
- Scope held to `POST /api/orchestrations` only. Bookings +
  consents + flags + express-interest still online-only —
  deferred to 12.1b.3 because they carry CAS/escrow/signed-
  artifact concerns of their own.
- Tests: **1008/1008 Node** + **92/92 vitest** (+11 including
  SubtleCrypto guard). tsc clean. Bundle 565 → 577 KB / 163 KB
  gzipped (+12 KB).

**Next: Phase 12.1b.3** — bookings/consents/flags offline queue +
queue-feedback UX batch + 17 more Indic languages, OR SLM-C
on-device dynamic forms.

---

## 🧠 2026-06-01 — Phase 12.1b.1 shipped: SLM-A vernacular intent parser — AI loop starts closing

First of four 12.1b AI-orchestration sub-phases. Citizens with an
installed wllama SLM (Phase 9.0c) see their device's interpretation
of what they typed before tapping Send — the annotation rides
alongside the raw text, the server records an
`intent.slm_<verdict>` ledger event for audit, but the
deterministic vernacular substrate remains the source of truth.
Citizens with no SLM installed see no change.

- **ADR 0137** — BE + FE.
- **§15 binding**: annotation is a confidence signal, NEVER an
  override. Tested with a deliberate disagreement fixture.
- **NEW src/phase0/intent-annotation.mjs** — pure validator +
  comparer + ledger builder. Field caps prevent ledger bloat.
- **NEW frontend/src/lib/intent-parser.ts** + `use-slm-intent-parser.ts`
  — pure prompt + completion parser + lazy wllama hook. Reusable
  by future SLM-C dynamic forms + SLM-D negotiation agent.
- **CitizenHome chip**: "Check my understanding" → soft Badge
  "We understood: <Friendly> · <lang> · confidence <pct>%".
  `handleSend` annotation gate is byte-for-byte strict.
- **Adversarial review** (3 lenses + triage): Privacy ship_clean.
  4 must-fix + 2 should-fix applied before commit:
  - MF-1 voice-interim + edit-clears annotation gate;
  - MF-2 error UX with Retry button;
  - MF-3 chip persists on repeat sends, clears on edit;
  - MF-4 non-technical copy ("Check my understanding" not
    "Parse with my SLM");
  - SF-1 mount-guarded setStatus;
  - SF-2 inflight-ref de-dups concurrent parses.
- Tests: **993/993 Node** + **81/81 vitest** (+15 contracts
  including 3 adversarial edge-case rejections). tsc clean.
- Bundle: 557 → 565 KB / 159 KB gzipped (+8 KB). wllama lazy
  chunk unchanged.

**Next: Phase 12.1b.2** — SLM-B offline-first decisioning +
queued sync + 17 more Indic languages.

---

## 🛒 2026-06-01 — Phase 12.1a.2 shipped: booking + escrow + provider surface — marketplace LOOP CLOSES

Second + final 12.1a sub-phase. Citizens lock escrow against a
Bharat-OS-native provider; providers receive push, accept, mark
complete; payout settles on citizen confirm OR after a 24h
auto-release. The full marketplace loop is live end-to-end.

- **ADR 0136** — both BE + FE.
- **6-state booking machine** with CAS-guarded transitions
  (monotonic `seq` per write). Concurrent provider accepts
  race safely: one wins, second gets 409 `stale_seq`. CAS
  also covers the citizen escrow envelope so two parallel
  booking-creates cannot both lock past available balance.
- **Rate snapshot frozen** at booking-create. Provider rate
  edits do NOT propagate to existing bookings (tested).
- **Asymmetric pickup privacy** preserved from 12.1a.1: 4dp
  persist on the booking record (party-only), 1dp bubble on
  the ledger. Provider sees ONLY bubble1dp before accept; full
  pickup unlocks after accept. Ledger PII replay test asserts
  no 4dp coord on any `booking.*` event.
- **Lazy auto-release on read** — every list/detail endpoint
  calls `maybeAutoRelease` before returning. 4h pre-accept
  expiry refunds idle bookings; 24h provider_marked_complete
  window auto-releases payout. No node-cron. Operator backstop
  at `POST /api/admin/bookings/sweep-stale` (CAS-safe).
- **Disputed = operator-only**. `POST /api/admin/bookings/:id/
  adjudicate` returns `release_to_provider | refund_to_citizen`.
- **Provider auth = root identity** (NO bearer in v1). Providers
  are citizens with already-phone-authed identity. Bearer-mint
  for delegation (spouse / dispatcher / fleet) is Phase 12.3.
- **Bookkeeping-v1 funding**: admin-token-gated citizen escrow
  deposit stands in for a real UPI rail until Phase 12.2+.
- **CORE shared substrates** per the founder binding:
  - `src/phase0/escrow-paise.mjs` — entity-agnostic paise
    primitives. sponsor.mjs is a thin wrapper; 47 sponsor tests
    pass as the regression gate.
  - `src/phase0/provider-auth.mjs` — `requireProviderOwnerAuth`
    + `requireBookingPartyAuth` + `requireCitizenOwnerAuth`.
  - `src/phase0/booking-push.mjs` — §15-redacted payload
    builders with binding-grep tests.
  - `src/phase0/geo.mjs::bubbleAt1dp` — ledger-safe coarsening.
  - FE: `lib/format-paise.ts` + `format-distance.ts` +
    `provider-context-store.ts` + `components/booking/*`.
- **11 new API endpoints** + **/provider/* surface** with 5-tab
  bottom nav + **/citizen/services/bookings** list + detail.
  "Book now" PRIMARY CTA added to citizen provider-detail
  alongside the preserved "Express interest" soft-touch.
- **Push** fires on every key transition. Citizen pushes generic;
  provider's own payout push may carry ₹ amount (own earnings).
- **Adversarial review** (3 lenses + triage): 3 must-fix + 10
  should-fix identified. **All 3 must-fix + 6 should-fix
  applied** before commit:
  - PRIV-1+2: citizen GETs were unauthenticated. Fixed via new
    `requireCitizenOwnerAuth` helper + acting-identity header.
  - ESCROW-CAS: race on `availableCitizenEscrow` check before
    lock. Fixed via `seq` + `casUpdateCitizenEscrow`.
  - UX-1 (rate basis when one rate), UX-2 (no impl-detail copy),
    UX-4 / UX-10 (warmer empty states), UX-8 (citizen-safety
    framing for pre-accept mask), TEST-AUTH (3 new gate tests).
- Tests: **975/975 Node** + **66/66 vitest**. tsc clean. Bundle
  528 → 557 KB / 156 KB gzipped.

**Next: Phase 12.1b** (SLM AI-orchestration) OR **Phase 12.2**
(provider onboarding wave 1 + Aadhaar e-KYC + ratings + Trust
Passport feedback loop) — TBD by founder.

---

## 🗺️ 2026-06-01 — Phase 12.1a.1 shipped: marketplace discovery substrate + citizen browse

First of two 12.1a sub-phases. Citizens can now browse Bharat-OS-
native providers on a real geo-aware nearby list; providers can
publish a structured pinned area; an "Express interest" stub
emits a typed precedent ledger row that 12.1a.2 will upgrade to a
real booking + escrow.

- **ADR 0135** — both BE + FE (FE-BE parity binding).
- **Geo extracted as a CORE SHARED MODULE** (founder directive
  2026-05-31): `src/phase0/geo.mjs` + `frontend/src/lib/geo.ts`
  + `frontend/src/lib/geolocation.ts` + `frontend/src/components/geo/*`.
  Reusable for Phase 12.1a.2 pickup-point, 12.2 provider
  tracking, mesh node locality, regulator audit bucketing —
  not just marketplace.
- **Asymmetric privacy.** Provider centroid persisted at 4dp
  (~11 m, forward-compat for future booking-pickup precision)
  but emitted to citizens at 2dp (~1.1 km) via new
  `toPublicServiceArea` helper — closes the asymmetric
  household-help-worker home-doxing risk that 4dp-everywhere
  would have created.
- **GET /api/marketplace/providers** — public, rate-limited,
  defensively re-rounds query lat/lng to 1dp, returns
  `distanceBand` pill (NEVER precise metres), emits
  **anonymous** `marketplace.searched` ledger event with NO
  citizen identity even when session present.
- **POST /api/marketplace/providers/:id/express-interest** —
  citizen-existence check via `store.readIdentity`; typed
  `marketplace.interest_expressed` ledger row carries
  `(providerIdentityId, citizenRootIdentityId, roleKind, note,
  at)` for 12.1a.2 upgrade.
- **Citizen surface** at `/app/citizen/services/*` — three
  nested routes (index + by-role + provider detail). NO 6th
  bottom-nav tab. CitizenHome intercepts "Book a cab" + "Hire
  household help" suggestions to deep-link directly.
- **ProviderOnboarding upgrade.** Free-text `areaSummary`
  replaced with `<ServiceAreaPicker/>` (Use my current location
  4dp / Pick a city / radius slider + legacy-summary migration
  banner at top).
- **ONDC suppressed** by construction —
  `marketplace-discovery.mjs` never imports `tools.mjs`
  (binding test asserts via source grep). NO commission /
  takeRate / platformFee field anywhere on this code path.
  Empty state matches `ondc-bridge-hidden-v1` binding verbatim.
- **Scoped by a Workflow** with 7 parallel Explore agents
  (providerIdentity / booking-escrow / geo / ONDC / citizen
  surface / provider surface / roadmap-ADRs) + synthesis pass.
- **Designed by a 2nd Workflow** with 3 lenses × 2 judges
  (privacy-first / supply-density / citizen-UX) →
  synthesis-with-overrides spec.
- **Hardened by a 3rd Workflow** with 3 lenses (privacy / UX /
  edge-case) + triage. **2 must-fix + 7 should-fix** applied
  before commit (PRIV-1 citizen spoofing, EC-2 CRLF/BOM, EC-1
  null-clear on active, EC-3 default-radius, UX-1 stale card,
  UX-2 legacy warning placement, UX-5 retry, UX-11 KYC tone,
  UX-12 service-only rates, PRIV-5 opt-out).
- Tests: 945/945 Node + 58/58 vitest. tsc clean.
- Bundle: main 505 → 528 KB / 150 KB gzipped (+23 KB).

**Next: Phase 12.1a.2** — booking entity + parallel
citizen-booking escrow + `/app/provider/*` surface + push
notification on incoming booking, ~2 weeks.

---

## 🏛️ 2026-06-01 — Phase 12.0.5 shipped: sponsor /app/sponsor/ admin surface — substrate-integration sweep arc CLOSED

Fourth and final sub-phase of the substrate-integration sweep
(12.0.2 citizen → 12.0.3 worker → 12.0.4 cross-cutting →
12.0.5 sponsor). Every BE-complete Phase 1-12 substrate that
any persona could plausibly use is now wired into `/app/`.

- **ADR 0134** — pure FE; zero BE changes. 25 new files.
- **Scoped by a Workflow** with 7 parallel Explore agents
  mapping every sponsor substrate; synthesis produced a
  600-line implementation spec.
- **Hardened by a 2nd Workflow** with 3 parallel adversarial
  reviewers (privacy / UX / edge case) + triage; 13
  must/should-fix items applied before commit. Privacy
  review: `ship_clean`.
- Sponsor flow end-to-end on `/app/sponsor/`:
  - **Bearer-token paste sign-in** with show/hide + clear
    error states.
  - **Dashboard**: escrow tiles + honest "jobs sampling" count
    (not a wrong estimate).
  - **Labeling jobs**: create + items upload (JSON array / JSONL
    / single object, UTF-8 BOM strip, 10 MB cap, per-line parse
    errors) + launch + **review queue** (Phase 10.4 — accept /
    reject + clawback + reason ≥ 4 chars) + **signed audit
    export** with FE Web-Crypto verification (4-bucket verdict:
    verified / unverified / mismatch / fetch_failed).
  - **Federated rounds**: list + create with SLM-pack picker +
    detail + unsigned NDJSON export.
  - **Escrow ledger** filtered to this sponsor's events.
  - **Settings**: profile + audit-signer pubkey transparency +
    sign-out with `cancelQueries`-before-`clear` so in-flight
    mutations can't pollute the next sponsor's cache.
- §15: bearer never echoed to DOM; document title scrubbed
  (no displayName); identityHash rotation preserved;
  `goldenAnswer` never shown to sponsor; cross-sponsor isolation
  enforced.
- Bundle: main 505 KB / 144 KB gzipped (+71 KB vs 12.0.4).

**Next: Phase 12.1a** — marketplace substrate (real geo + new
parallel citizen-booking escrow + ONDC sandbox bridge,
~2 weeks). First phase outside the sweep arc.

---

## 🔔 2026-06-01 — Phase 12.0.4 shipped: cross-cutting sweep — push + vault transfer + DPDP grievance + voice + flag reports

Third of four substrate-integration sub-phases. Five wires
across `/settings` + `/citizen/home`. Mostly FE; one
operational BE change (VAPID env vars for real Web Push).

- **ADR 0133** — Settings on `/app/` becomes a real control
  panel; citizen home gains mic + flag-this-activity.
- **Push notifications opt-in** on Settings (real VAPID +
  service worker + honest unsupported/denied/disabled states).
- **Vault transfer** — download account bundle (.json) for
  device migration / backup.
- **DPDP §12(4) grievance** — DPO contact card from the
  substrate.
- **Voice intent** — mic button on the citizen home intent
  textarea (browser SpeechRecognition; en-IN; on-device per §15).
- **Flag reports (§9A)** — Report button on each Recent
  Activity row → category + description → operator review.
- 5 new hooks + voice helper + `frontend/public/sw.js`.
- Bundle: main 434 KB / 129 KB gzipped (+13 KB vs 12.0.3).

**Next: Phase 12.0.5** — sponsor `/app/sponsor/` admin surface
(labeling marketplace + escrow + signed export download
graduates from `/shell/`).

---

## 🏛 2026-06-01 — Phase 12.0.3 shipped: worker home wires in government benefits + tax view + Trust Passport attestation mint

Second of four substrate-integration sub-phases. Five wires
across `/worker/earn` + `/worker/trust` without growing the
bottom-nav past 5 tabs.

- **ADR 0132** — pure FE; zero BE changes.
- `/worker/earn` gains:
  - **Schemes card** — e-Shram registration status + active
    scheme entitlements (PM-KISAN, PMSYM, etc.) with masked
    UAN + scheme code/name/cycle/benefit.
  - **Tax view (FY YYYY-YY)** — gross income + new regime tax
    + old regime tax + "cheapest option for you" highlight +
    the substrate's full legal disclaimer rendered verbatim.
- `/worker/trust` gains:
  - **Mint Trust Passport attestation** — citizen mints a
    signed envelope a landlord / employer / lender can read
    via `/verify/` without seeing raw values.
  - **Collective memberships** — sangha / cooperative /
    blessed-collective attestations issued by the collective.
- 5 new hooks; auto-suppression keeps the new-user view clean.
- Bundle: main 421 KB / 125 KB gzipped (+10 KB vs 12.0.2).

**Next: Phase 12.0.4** — cross-cutting (push notifications +
device pairing + vault transfer + WebAuthn + DPDP grievance +
flag reports + voice intent).

---

## 📋 2026-06-01 — Phase 12.0.2 shipped: citizen home becomes a real home — daily brief + personal notes

First of four substrate-integration sub-phases (12.0.2 → 12.0.5)
addressing the founder's directive to integrate every BE-complete
substrate into `/app/` for a complete-product showcase before
tackling Phase 12.1a marketplace.

- **ADR 0131** — pure FE; zero BE changes.
- **Daily brief** at the top of `/app/citizen/home` — uses the
  orchestrator's `daily_brief` action type. Personalised
  greeting + composed brief text + structured signals
  (24h mesh earnings, expiring consents, recent activity,
  open §9A flags). Composed-on-device per §15.
- **Personal memory records** as new `/app/citizen/notes` tab —
  encrypted with the citizen's vault key on the server;
  metadata-only on list; consent-gated reads.
- Citizen bottom-nav goes 4 → 5 tabs.
- 4 new hooks + 2 new components.
- Bundle: main 411 KB / 123 KB gzipped (+12 KB vs 12.0.1).

**Next: Phase 12.0.3** — worker sweep (e-Shram + scheme
entitlements + tax summary + skill traces + trust attestation
mint).

---

## 🔑 2026-06-01 — Phase 12.0.1 shipped: real sign-up + sign-in on /app/

Even for the demo, /app/ needed a real account flow alongside
the seeded-persona picker. Phase 12.0.1 wires it in using the
existing Phase 4.3 phone OTP + Phase 5.0 account recovery
substrate.

- **ADR 0130** — four new hooks + `<AuthSheet>` two-tab
  component. Onboarding hero gains [Create an account] +
  [Sign in with phone] CTAs.
- BE adds a dev-only `_devOtpCode` field on
  `/api/phone-otp/send` + matched branch of
  `/api/recovery/start` so the investor demo doesn't need
  anyone to read the server console. **§15 anti-enumeration
  sentinel branch on recovery/start never includes it** —
  test pinned.
- Production SMS providers (Gupshup / Twilio / MSG91) never
  see the field.
- Tests: Node 884 → 890 (+6). FE Vitest unchanged.
- Bundle: main 399 KB / 120 KB gzipped (+7 KB vs 12.0).

**Next: Phase 12.1a** — marketplace substrate + real geo +
citizen-booking escrow + ONDC sandbox.

---

## 🪪 2026-05-31 — Phase 12.0 shipped: providerIdentity substrate — wave-1 provider tiles go LIVE

Phase 11.9 surfaced the provider tiles as "Coming Phase 12.0"
placeholders; Phase 12.0 ships the substrate that flips four of
them to live: **cab driver, personal driver, daily-wage labour,
household help**. Each can now create a draft profile on /app/.
Per-role wizard (Aadhaar e-KYC + SLM dynamic form) is Phase 12.2;
Phase 12.0 lays the foundation.

- **ADR 0129** — separate `providerIdentity` from `workerIdentity`
  (different KYC weight, different liability shape); bound to a
  root identity; DPDP §12(3) cascade on both stores.
- New `src/phase1/provider-identity.mjs` pure module — role
  kinds, KYC levels, state machine, public-record stripping.
- Six HTTP endpoints (create / list / public-read / profile-edit
  / admin kyc-attest / admin transition).
- FE: `<ProviderOnboarding>` route + three hooks. WorkerHome
  rewritten with two-ledger cards (micro-task live, marketplace
  pending 12.1a).
- **No commission, ever** — substrate has NO field for a platform
  commission rate, copy in onboarding makes the §15 promise loud.
- Tests: Node 865 → 884 (+19). FE Vitest 41 → 45 (+4).
- Bundle: main 392 KB / 119 KB gzipped (+8 KB vs 11.9).

**Next: Phase 12.1a** — marketplace substrate + real geo +
parallel citizen-booking escrow + ONDC sandbox bridge.

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
