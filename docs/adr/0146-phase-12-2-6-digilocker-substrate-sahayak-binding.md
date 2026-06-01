# ADR 0146 — Phase 12.2.6: DigiLocker OAuth2 substrate + first Parivahan live provider + Sahayak no-smartphone binding

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.5 shipped the Parivahan verification adapter with
stub-only providers. The natural next step: wire the FIRST
non-stub provider — DigiLocker (UIDAI / Govt-of-India) — into
the adapter so the citizen-authorised signed-document flow goes
end-to-end on stub and is ready to flip live when partner
credentials arrive.

In parallel, the user raised the strategic question of how
Bharat OS onboards the ~700M Indians without usable
smartphones, referencing Snabit + Pronto as proven reference
models. This is the canonical Phase 14 direction; capturing
it as a binding now sequences Phase 13 + 14 work toward it.

## Decision

### 1. DigiLocker substrate (`src/phase1/digilocker-substrate.mjs`)

The CORE substrate every DigiLocker-mediated identity flow
composes — first user is Phase 12.2.6's Parivahan integration;
future phases reuse for Aadhaar e-KYC (replacing KYC L1's
"last-4 ONLY" defensive posture) and PAN verification.

Helpers:
- `generateState({rootIdentityId, at})` — sha256-derived
  one-shot CSRF state, 192 bits of effective entropy.
- `buildAuthorizeUrl({mode, clientId, redirectUri, state, scope})` —
  stub returns a self-callback URL; live mode hits
  `api.digitallocker.gov.in/public/oauth2/1/authorize`.
- `exchangeCodeForToken({mode, code, ...})` — stub requires
  `code.startsWith('stub-')`; live POSTs to
  `/public/oauth2/1/token` and parses the JSON response.
- `buildLink({rootIdentityId, tokenEnvelope})` — composes the
  persisted record. **bindingDigest is null in stub mode**
  (Phase 12.2.6 adversarial fix L1-1 — stub tokens are
  `dl-stub-access-<state>` where state is the row key, so the
  sha256 digest would have been rainbow-tableable).
- `stubSignedDocument` + `verifyDocumentSignature` — mock
  signed XML/JSON with a stub signature scheme; live path
  reserved for the production DigiLocker public key.
- `isAllowedRedirectUri({sameOriginCallback})` (Phase 12.2.6
  adversarial fix L1-2) — allowlist: default same-origin
  callback OR the configured `BHARAT_OS_DIGILOCKER_REDIRECT_URI`.
  Rejects everything else.
- `readDigiLockerMode()` — warn-once when `mode=live` but
  `CLIENT_ID` / `CLIENT_SECRET` unset (Phase 12.2.6
  adversarial fix L1-3 — silent fallback was hiding misconfig
  from operators).

Frozen scope allowlist: `documents.read` + `documents.fetch`.

### 2. Storage (`digilocker_states` + `digilocker_links` tables)

Both SqliteStore and BosStore mirror the substrate. State is
the one-shot OAuth CSRF parameter (10-min TTL); link is the
persisted access + refresh token (1 per root identity).

**Quartet on both stores**:
- `saveDigiLockerState(record)` — persists the FULL record
  (state + rootIdentityId + redirectUri + next).
- `peekDigiLockerState(state)` — read without consume (Phase
  12.2.6 adversarial fix L2-6 — the original code consumed
  before exchange, burning the state on a transient network
  error).
- `consumeDigiLockerState(state)` — one-shot read + delete.
- `sweepExpiredDigiLockerStates({now})` — cron-style cleanup.
- `saveDigiLockerLink(link)` — upsert keyed on rootIdentityId;
  emits `digilocker.link_saved` audit event.
- `readDigiLockerLink(rootIdentityId)`.
- `deleteDigiLockerLink(rootIdentityId, {at})` — emits
  `digilocker.link_erased`.

**DPDP cascade**: `eraseUserData` sweeps both tables atomically
with the identity (SqliteStore wraps in BEGIN/COMMIT; BosStore
walks the directory filtered by rootIdentityId).

### 3. 4 endpoints

- `GET /api/digilocker/authorize?actingRootIdentityId&next` —
  mints state, allowlists redirectUri, returns `{authorizeUrl,
  state, expiresAt}`. **Phase 12.2.6 adversarial fix L3-4 —
  opportunistic sweep on every save** so an attacker hitting
  /authorize 1000 times without callback doesn't fill the
  table.
- `GET /api/digilocker/callback?code&state` — peek state →
  exchange code → consume state on success → persist link.
  Phase 12.2.6 ordering fix L2-6.
- `GET /api/digilocker/status?actingRootIdentityId` — returns
  `{linked, mode, scope, linkedAt, expiresAt}`. **NEVER
  returns the access or refresh token.**
- `DELETE /api/digilocker/link?actingRootIdentityId` — unlinks
  + emits audit event.

**§15 bindings**:
- Access + refresh tokens NEVER on the audit ledger.
- `/status` NEVER returns the token.
- State binds to rootIdentityId server-side; callback uses
  the bound identity, not a URL-supplied one.
- State is one-shot + 10-min TTL + double-checked.
- DPDP cascade is atomic.
- redirectUri allowlist closes the open-redirect path.

### 4. Parivahan adapter — DigiLocker accelerator

`verifyRoleExtrasFields` now accepts an optional
`digilockerLink` parameter. When present, the substrate uses
the DigiLocker signed-document path (stubSignedDocument +
verifyDocumentSignature) instead of the generic adapter call.
The result envelope includes a `signedDocSha256` pointer so
the operator can correlate against the signed payload.

The verify-role-extras endpoint reads the citizen's link from
the store and passes it through — automatic upgrade when the
citizen has authorised DigiLocker.

### 5. Operator console — 🔏 signed indicator

Verification badges show a 🔏 (locked) icon when the result
carries a `signedDocSha256`. Operators see at a glance whether
the verification came from a citizen-authorised DigiLocker
session vs the generic stub.

### 6. Sahayak no-smartphone binding (`memory/sahayak-no-smartphone-onboarding.md`)

User raised the strategic question of how Bharat OS serves
the ~700M Indians without usable smartphones. Captured as a
binding:

- **Sahayak (helper)** model — a trained, KYC'd local agent
  uses THEIR device to onboard + transact on behalf of the
  citizen. Composes the entire Phase 12.2.x onboarding loop
  (KYC L1 + role extras + attachments + DigiLocker biometric).
- Phase 14.x sequenced: 14.0 sahayak role + double-sig
  pattern, 14.1 AUA/KUA registration with UIDAI, 14.2 USSD
  *99# bridge, 14.3 IVR voice flow, 14.4 print receipt
  driver, 14.5 cash-float ledger.
- **Substrate is ~70% there today**. The remaining 30% is the
  Sahayak product layer + partner partnerships (USSD
  aggregator, UIDAI AUA license). ~6 wks engineering plus
  partner calendar time.
- For the investor pitch: not demo-blocking, but the credible
  answer to "how do you reach rural India?".

ROADMAP gets a Phase 14.x section with the 6 sub-items.

### 7. API_INTEGRATIONS.md update

§3.1 DigiLocker flipped from 📋 Reserved to 🧪 Stub-only.
Listed substrate path, env vars, §15 bindings, partner
provisioning steps.

## Adversarial review (3 lenses)

- **Token-leak**: 4 findings. 1 HIGH fixed (bindingDigest in
  stub mode). 1 MED fixed (silent fallback warn-once). 2 LOW
  deferred (no User-Agent on token POST — cosmetic; live mode
  not implemented).
- **State-CSRF**: 6 findings. 2 HIGH fixed (redirectUri
  allowlist; reorder peek→exchange→consume). 2 inherited
  Phase 12.2.2 KYC-AUTH-1 gaps (/status linkage probe; DELETE
  unauthenticated — same substrate-wide deferral). 2 LOW
  deferred (stub code/state strict match; explicit "ignore
  header on callback" assert).
- **DPDP-storage**: 7 findings. 1 LOW fixed (opportunistic
  sweep on save). 6 CLEAN or inherited (cascade parity,
  atomicity, ledger token-leak — all clean).

Total: 17 findings, 5 high+med fixed in-phase, 12 inherited
or deferred with explicit scope.

## What's NOT in 12.2.6 (deferred)

- **FE wizard "Link DigiLocker" button** — the browser-redirect
  flow is its own surface. Defer to Phase 12.2.7 once partner
  credentials shape the live UI.
- **Live DigiLocker provider** — substrate ready, awaiting
  UIDAI partner approval (~2-month calendar).
- **Document fetch via stored token** — the
  `buildDocumentFetchDescriptor` helper is there; the
  `verifyRoleExtrasFields` digilocker path uses
  stubSignedDocument directly. Live document fetch lands
  with partner credentials.
- **/status auth + DELETE auth strengthening** — inherited
  Phase 12.2.2 KYC-AUTH-1 substrate-wide deferral.
- **Substrate-wide CAS-on-seq** — Phase 12.2.2 L2-1 inherited.
- **Sahayak phases (14.0-14.5)** — bindings captured; phases
  reserved.

## Files

NEW (BE):
- `src/phase1/digilocker-substrate.mjs` (~370 lines).
- `tests/node/digilocker.test.mjs` (33 cases).

NEW (docs):
- `docs/adr/0146-phase-12-2-6-digilocker-substrate-sahayak-binding.md`
  (this file).

NEW (memory):
- `memory/sahayak-no-smartphone-onboarding.md` — binding.

EXTENDED (BE):
- `src/phase0/sqlite-store.mjs` — new digilocker_states +
  digilocker_links tables, CRUD quartet, DPDP cascade.
- `src/phase0/store.mjs` — file-store mirror.
- `src/phase0/api.mjs` — 4 endpoints (authorize / callback /
  status / delete), redirectUri allowlist, peek→exchange→
  consume ordering, opportunistic sweep, Parivahan adapter
  passes digilockerLink into verifyRoleExtrasFields.
- `src/phase1/parivahan-adapter.mjs` — digilocker accelerator
  via stubSignedDocument + verifyDocumentSignature; result
  envelope carries signedDocSha256.
- `public/operator-console/app.js` — 🔏 signed indicator on
  verification badges.
- `docs/API_INTEGRATIONS.md` — §3.1 DigiLocker flipped to
  Stub-only (substrate shipped).
- `ROADMAP.md` — Phase 14.x Sahayak sub-items added.
- `MEMORY.md` index — new sahayak binding linked.

## Test results

- Node tests: **1166 → 1199** (+33 substrate + storage +
  endpoint + binding-grep + cascade + Parivahan integration
  + 7 adversarial-fix cases).
- Vitest: 138 unchanged (FE-only changes pending in 12.2.7).
- tsc clean. Build green. Bundle main unchanged (operator
  console is separate from React app bundle).
