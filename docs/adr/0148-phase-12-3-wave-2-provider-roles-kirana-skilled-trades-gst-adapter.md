# ADR 0148 — Phase 12.3: Wave-2 provider roles (kirana + skilled-trades) + GST adapter

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.4 shipped the wave-1 provider-role-extras
schemas (cab-driver, personal-driver, labourers, household-
help) — the identity-grade documentation layer that gates
provider activation. Phase 12.3 extends the substrate to the
two remaining wave-2 roles needed for the marketplace
breadth pitch: `kirana` (shopkeeper / general store owner)
and `skilled-trades` (electrician / plumber / carpenter /
ITI-trained).

The kirana role is the first provider type with a real
upstream verification API (GSTN — the GST tax authority).
The skilled-trades role is the first manual-only role: ITI
certificates have no government-issued public verification
API, so the substrate is honest about that — operator
manually cross-checks the typed cert number + institute
name against the uploaded cert image.

## Decision

### 1. Wave-2 schemas in `provider-role-extras.mjs`

**kirana**:
- Required: `shopName`, `shopLicenseNumber` (text, ≤32 chars)
- Required attachment: `shop_license`
- Optional: `gstinNumber` (text, pattern `GSTIN_RE`,
  normalize `upper`), `fssaiLicenseNumber` (text, pattern
  `FSSAI_RE`), `yearsInBusiness` (integer 0-99)

**skilled-trades**:
- Required: `itiCertificateNumber`, `itiInstituteName`
- Required attachment: `iti_certificate`
- Optional: `yearsExperience` (integer 0-50),
  `portfolioUrl` (text, ≤240 chars)

Both roles deep-frozen alongside wave-1 (`deepFreezeSchemas`
covers them); both gated by `ROLES_REQUIRING_EXTRAS` for
activation.

### 2. `validateFieldValue` extended with `pattern` + `normalize`

The text-kind validator now honors per-field `pattern: RegExp`
and `normalize: 'upper'`. This is the **Phase 12.3 HIGH
adversarial fix**: without it, citizens could type any
≤15-char rubbish into `gstinNumber`, the BE silently
accepted it, the verifier no-op'd on shape, and the operator
saw a stored garbage GSTIN with no verification result
attached. Now the BE rejects on shape at submit time with
`gstinNumber_pattern_invalid`. FE mirror enforces the same
patterns for immediate UX feedback.

Same rule applies to `fssaiLicenseNumber` (14 numeric digits).

### 3. GST adapter (`src/phase1/gst-adapter.mjs`)

Fourth concrete adapter composing the Phase 12.2.1
`createAdapter` substrate. Provider allowlist: `stub |
sandbox | surepass | karza | gsp-direct`. Defaults to stub.

- **`isValidGstinShape(s)`** — uppercases then regex-tests
  against `GSTIN_RE`. Case-tolerant input.
- **`verifyGstFields(adapter, {role, answers})`** — no-ops
  on non-kirana roles AND when GSTIN is absent. Returns
  `{gstinNumber: envelope}` only when there's something
  to verify.
- **cacheKey** is `gst:<sha256(normalised_GSTIN).slice(0,32)>`
  — raw GSTIN NEVER lands on the cache key or audit ledger
  (only field IDs + status). Matches Parivahan §15 posture.
- Polite User-Agent ships on every call.

### 4. `verify-role-extras` endpoint merges both adapters

The handler now runs **both** Parivahan and GST verifiers
in parallel via `Promise.allSettled` and merges the result
envelopes. The per-adapter helpers are designed to no-op
on roles they don't cover (Parivahan no-ops on kirana, GST
no-ops on cab-driver), so the merge is safe.

**Phase 12.3 adversarial fixes applied**:

- **L1 empty-results guard** — when the merged results
  object is empty (skilled-trades has no automated
  verifier; kirana without an optional GSTIN), the endpoint
  returns 400 `nothing_to_verify` instead of silently
  persisting an empty verification row stamped with
  operator + time. Previously this would have written a
  misleading "verified at T by operator X" record with
  zero verified fields and emitted a misleading ledger
  event.
- **L2 Promise.allSettled** — defensive against a future
  un-caught throw in either helper collapsing the other
  helper's good result. Helpers currently envelope-catch
  internally; this is a backstop.
- **L3 generalised 502 message** — the all-error 502 no
  longer hard-codes `BHARAT_OS_PARIVAHAN_MODE` since the
  failure could be GST. New copy: "role-extras verifier(s)
  returned no usable verification — check
  `BHARAT_OS_PARIVAHAN_MODE` / `BHARAT_OS_GST_MODE` +
  provider env vars." `failedFields` array tells the
  operator which provider to investigate.

### 5. Operator console — manual-only honesty

The "Pre-verify" button is now **gated on roles with a
configured verifier** (`cab-driver`, `personal-driver`,
`kirana`). The label tracks the underlying adapter:
"Pre-verify (Parivahan)" for the driver roles, "Pre-verify
(GST)" for kirana. For skilled-trades (no automated
verifier), the operator console now shows a "Manual review
only" tag with a tooltip explaining that the typed fields
must be cross-checked against the uploaded cert by hand.

Previously the console rendered "Pre-verify (Parivahan)"
unconditionally for every submitted role — including
skilled-trades, where clicking it would (per L1 fix) now
honestly return 400 nothing_to_verify, but the button
itself was a misleading affordance.

### 6. FE mirror updates (`role-extras-schema.ts`)

`RoleExtrasFieldSpec` interface extended with
`pattern?: RegExp` and `normalize?: 'upper'`. Kirana entry
wires both fields. The pure client-side validator
(`validateRoleExtrasClientSide`) honors them — citizens
get immediate field-level pattern errors before the
network round-trip.

Parity test (`role-extras-schema.parity.test.ts`) updated
to project `pattern.source` + `normalize` on both sides
so a drift between FE and BE patterns ships LOUD.

### 7. API_INTEGRATIONS.md §3.3 GST flipped to Stub-only

Per the `bharat-os-doc-update-rule` binding, the API
tracker §3.3 now reads **🧪 Stub-only** (was 📋 Reserved)
with the adapter path, full env var list, cacheKey
posture, and partner-provisioning notes. Summary §6 GST
estimate updated to reflect "stub-only adapter shipped".

### 8. Adversarial review (3 lenses, ~3 agents)

Three findings groups merged:

- **PII / substrate hygiene** (Lens 1): cacheKey clean,
  ledger leakage clean, deep-freeze clean. 1 real bug —
  GSTIN regex not enforced at submit time (HIGH, fixed).
- **State-machine / pipeline** (Lens 2): activation guard
  clean. 1 latent bug — Promise.all not allSettled (MED,
  fixed). 2 honesty bugs — empty-results misleading
  persist (HIGH, fixed); skilled-trades verify button
  shouldn't render (HIGH, fixed). 1 copy bug — 502
  message hard-codes Parivahan env (MED, fixed).
- **FE / docs** (Lens 3): wizard rendering clean, adapter
  composes substrate. 2 findings — GSTIN FE validation
  gap (HIGH, fixed via FE mirror), API_INTEGRATIONS §3.3
  stale (MED, fixed).

Total: 3 HIGH + 3 MED + 1 LOW. All HIGH + MED fixed
in-phase.

## §15 bindings

| Binding | How honored |
|---|---|
| No PII on ledger | verify event emits field IDs + statuses, never raw GSTIN |
| sha256 cacheKeys | `gst:<sha256(GSTIN).slice(0,32)>` |
| Stub-first default | `BHARAT_OS_GST_MODE` defaults to `stub` |
| Closed substrate | unknown answer fields rejected; both roles deep-frozen |
| Honest UX | skilled-trades labelled "Manual review only" in operator console |
| Doc rule | API_INTEGRATIONS §3.3 flipped + this ADR + README + BHARAT_OS.md §17 + ROADMAP in the same commit |

## What's NOT in 12.3 (deferred)

- **Live GSP partnership** — needs CDAC sponsorship; ~2-4
  weeks calendar time. Stub adapter covers the demo.
- **ITI verification** — there is no government public
  API for ITI certificates. May remain manual-only
  forever; possible Phase 14+ NCVT integration if
  partnership emerges.
- **GST citizen-side popup** — analogous to the Phase
  12.2.8 DigiLocker popup; lands when GST live mode does.

## Files

NEW:
- `src/phase1/gst-adapter.mjs` (~145 lines).
- `tests/node/gst-adapter.test.mjs` (16 cases).
- `docs/adr/0148-phase-12-3-wave-2-provider-roles-kirana-skilled-trades-gst-adapter.md`.

EXTENDED:
- `src/phase1/provider-role-extras.mjs` — wave-2 schemas
  + `GSTIN_RE` + `FSSAI_RE` + pattern/normalize wiring.
- `src/phase1/attachment.mjs` — 4 new ATTACHMENT_KINDS:
  `shop_license`, `gst_certificate`, `iti_certificate`,
  `trade_portfolio`.
- `src/phase0/api.mjs` — verify-role-extras merges GST +
  Parivahan; empty-results guard; allSettled; generalised
  502.
- `public/operator-console/app.js` — role-aware verify
  button + Manual-review-only tag.
- `frontend/src/lib/role-extras-schema.ts` — wave-2
  mirrors + pattern/normalize.
- `tests/node/role-extras.test.mjs` — pattern enforcement
  case.
- `tests/node/parivahan.test.mjs` — nothing_to_verify case
  for skilled-trades.
- `tests/node/provider-identity.test.mjs` — activation
  with wave-2 role-extras.
- `tests/node/marketplace-discovery.test.mjs` — seedActive
  helper extended to wave-2.
- `frontend/src/lib/role-extras-schema.test.ts` — GSTIN +
  FSSAI pattern cases.
- `frontend/src/lib/role-extras-schema.parity.test.ts` —
  projects pattern.source + normalize.
- `docs/API_INTEGRATIONS.md` — §3.3 GST flipped to
  Stub-only with full provisioning notes.

## Test results

- Node tests: 1199 → **1217** (+18 wave-2 + GST + fix
  cases). All 5 batches green.
- Vitest: 140 → **146** (+6 GSTIN/FSSAI cases + 1 parity
  schema, -1 obsolete count assertion). All 22 files
  green.
- tsc clean. Build green.
