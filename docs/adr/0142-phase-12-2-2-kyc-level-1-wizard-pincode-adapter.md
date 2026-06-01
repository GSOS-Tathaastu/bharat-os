# ADR 0142 — Phase 12.2.2: KYC Level 1 citizen-driven wizard + India Post PIN-code adapter + operator review queue

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.1 landed the external-adapter substrate + the first
adapter (OSM Nominatim). Phase 12.2 wave-1 provider onboarding
needs the **common physical-service KYC flow** before each role
adds its extras. The right common slice is a citizen-driven
Level 1 record (legal name + Aadhaar last-4 + PAN last-4 +
address PIN + line) that the operator review queue consumes
before elevating the provider into the marketplace.

This phase also proves the external-adapter substrate composes a
**second time** — a non-geo adapter with a different upstream
shape — by composing it with India Post's free PIN-code lookup.

## Decision

### 1. India Post PIN-code adapter (`src/phase1/india-post-pincode.mjs`)

Second concrete adapter. Composes `createAdapter` with:

- `name: 'india-post-pincode'`.
- `userAgent: 'BharatOS/0.1 (+https://github.com/bharat-os)'`.
- `modeEnvVar: 'BHARAT_OS_PINCODE_MODE'`, default `stub`.
- `rateLimit: {ratePerSecond: 5}` (postalpincode.in has no
  formal cap but documents fair-use; we cap conservatively).
- `cache: {ttlMs: 24*60*60_000 * 7, maxEntries: 20_000}` —
  reverse-PIN is essentially immutable.
- **cacheKey = `pin:<sha256(PIN).slice(0,32)>`** — NOT the
  raw PIN. Phase 12.2.2 adversarial review found that the
  raw PIN on the `external_adapter.call` audit event could
  be join-keyed with a near-simultaneous
  `provider_identity.kyc_l1_submitted` event from the same
  citizen, recovering the residential PIN from the ledger.
  The digest preserves cache identity without putting the
  PIN on the audit trail.
- Stub mode returns a deterministic Pune fixture; live mode
  hits `https://api.postalpincode.in/pincode/<PIN>` and
  lifts `{city, district, state, countryCode, branches[]}`
  from `display_name + address`.

### 2. `GET /api/geocode/pincode/:pin` endpoint

Same `{ok, mode, source, place, latencyMs, at}` envelope as
`/reverse`. Failure: invalid PIN → 400 `pincode_invalid`,
rate-limit → 429, upstream → 502.

**Access-log redaction (§15)** — `logger.safePath` now
recognises `/api/geocode/pincode/:pin` as a PII-bearing path
and rewrites the trailing segment to `:pin` before the
structured access log emits the line. Same future-proof
pattern for any new PII-on-path route.

### 3. KYC L1 substrate (`src/phase1/provider-identity.mjs`)

- NEW `kycLevel1Submission` field on `providerIdentity`:
  `{fullLegalName, aadhaarLast4, panLast4, addressPinCode,
  addressLine, cityFromPincode, stateFromPincode, submittedAt}`
  or null. Initialised null by `createProviderIdentity`.
- NEW `validateKycLevel1Submission({...})` — pure validator
  with stable per-field error codes (`full_legal_name_required`,
  `aadhaar_last4_invalid`, `pan_last4_full_pan_rejected`, …).
  **Defensive rejection** of a full 12-digit Aadhaar OR full
  10-character PAN ahead of the last-4 check.
- NEW `submitKycLevel1(provider, fields, {at})` — pure mutator.
  Only works on `draft` status. Does NOT change `kycLevel` or
  `status` — operator review owns those transitions.
- NEW `KycLevel1ValidationError` typed error.
- NEW `selfProviderRecord(provider)` projection — the owner's
  own list view. Redacts `aadhaarLast4`/`panLast4` to "••••"
  and `addressLine` to "•••• (re-enter to edit)" so the
  owner-list endpoint (which today trusts the URL
  rootIdentityId — Bharat ID signed sessions land in Phase
  13+) cannot leak PII to an attacker who guesses the id.
- `publicProviderRecord` **does NOT** echo
  `kycLevel1Submission` — citizens browsing the marketplace
  never see this envelope.

### 4. API endpoints

- **`POST /api/provider-identities/:id/submit-kyc-l1`** —
  citizen-driven submission. Phase 12.2.2 adversarial fix
  KYC-AUTH-1 — uses `requireProviderOwnerAuth` (strong
  acting-identity gate via `X-Bharat-OS-Acting-Identity`
  header or `actingRootIdentityId` body field), NOT the
  weak `body.rootIdentityId === existing.rootIdentityId`
  pattern the older provider endpoints use.
- **Ledger event written BEFORE the record save** (L2-3 fix).
  If `appendLedger` throws, no record write happens. The
  audit trail is the source of truth.
- **Optimistic concurrency check** (partial L2-1 fix) —
  re-reads the provider immediately before save and returns
  409 `provider_concurrent_change` if `status / kycLevel /
  updatedAt` drifted (e.g. operator transitioned the
  provider to `submitted` in parallel). Full CAS-on-seq
  lands when the substrate-wide concurrency story does.
- **`GET /api/admin/provider-identities?status&roleKind&hasKycL1Submission&limit`** —
  admin-only queue endpoint. `hasKycL1Submission=true`
  filters to drafts with an actual submission (L2-4 fix).
  Returns the full record (not `publicProviderRecord`) so
  the operator sees the L1 envelope.
- **`GET /api/identities/:rootId/provider-identities`** —
  now returns through `selfProviderRecord` (OWNER-LIST fix):
  legal name / city / state / PIN visible; last-4 IDs +
  address line redacted to "••••".

### 5. `provider_identity.kyc_l1_submitted` ledger event

Payload: `{providerIdentityId, rootIdentityId, submittedFields:
[...], cityFromPincode, stateFromPincode, at}`.

§15 bindings:
- Only field NAMES on `submittedFields`. **Never** the values.
- City + state are public geo; everything else stays on the
  record, off the ledger.
- A binding-grep test asserts no `Aarav Kumar` / `4321` /
  `X9Z2` / `Modibaug` / `411005` appears in the event JSON.

### 6. FE — KYC L1 wizard

- `frontend/src/lib/use-pincode-lookup.ts` — TanStack hook
  on `/api/geocode/pincode/:pin`.
- `frontend/src/lib/hooks.ts` — `KycLevel1Submission` type +
  `useSubmitKycLevel1` mutation. Mutation sends
  `X-Bharat-OS-Acting-Identity` header.
- `frontend/src/routes/onboarding/KycLevel1Page.tsx` — 3-step
  wizard (identity → address → review). Fixes applied:
  - **Paste-last-4 fix** (PASTE-FULL-AADHAAR-SILENT-PREFIX):
    on input that exceeds 4 chars (almost certainly a paste
    of the full ID), keeps the TRAILING 4 not the leading 4,
    and surfaces an error toast "we detected a full Aadhaar
    — only the last 4 were kept."
  - **Stub-mode honest fallback** (stub-pin-pune-for-all):
    in stub mode the wizard hides the resolved badge and
    surfaces two manual City + State `Field`s so a Mumbai
    citizen entering 400069 doesn't silently get "Pune".
  - **Rejection vs pending distinction**: when
    `provider.lastTransition` reads `submitted → draft`,
    the wizard renders a warning banner "An operator sent
    this submission back for changes" with the reason
    quoted.
  - **Hydration guard** (L2-2): `useRef` "did-hydrate"
    flag prevents a TanStack refetch from overwriting the
    user's in-progress edits.
  - **Last-4 redaction-safe hydrate**: skips pre-fill of
    last-4 fields when the owner-list redacts them to "••••"
    — the citizen must re-type on edit (intentional; last-4
    shouldn't survive a session boundary).
- `frontend/src/routes/provider/ProviderProfile.tsx` —
  "Complete KYC Level 1" warning banner on draft + no L1;
  "submitted, awaiting review" trust banner on draft + L1
  with no rejection; "Edit and resubmit" warning banner on
  draft + L1 + last `submitted → draft` transition.
- `frontend/src/routes/ProviderOnboarding.tsx` — post-create
  redirect to `/onboarding/kyc-level-1?providerId&returnTo`.
- `frontend/src/App.tsx` — new `/onboarding/kyc-level-1`
  protected route.

### 7. Operator console (`public/operator-console/`)

- NEW `Admin token` + `Operator id` topbar inputs. Token kept
  in `sessionStorage` only (clears on tab close — never
  `localStorage`).
- NEW `#provider-kyc-review` section (mirrors `#flag-reports`
  pattern). Status filter, role filter, hasKycL1Submission
  filter (default ON so the queue isn't padded with empty
  drafts).
- Attest / Activate actions use a two-step confirmation
  (attest-no-confirmation-dialog fix): first a `confirm()`
  echoing the legal name + Aadhaar last-4 + PAN last-4 the
  operator is about to bless, THEN a notes prompt. A misclick
  on the wrong row no longer attests the wrong person.
- Wired into the bootstrap refresh sequence + per-filter
  change listeners.

### 8. §15 bindings honored

- **Aadhaar last-4 ONLY** — UI input mask + validator
  defensive rejection of 12-digit input + binding-grep test.
- **PAN last-4 ONLY** — same.
- **PIN code never on ledger** — adapter cacheKey is a
  sha256 digest; access-log path is rewritten to `:pin`.
- **kycLevel1Submission never on publicProviderRecord** —
  test asserts.
- **kycLevel1Submission redacted on owner-list** —
  `selfProviderRecord` projection.
- **Admin token in sessionStorage only** — operator
  console implementation choice.
- **Audit ledger event payload field-names-only + city/state
  geo** — binding-grep test rejects any PII string in event
  JSON.

### 9. Tests

**Node (`tests/node/kyc-level-1.test.mjs`, 30 cases)**:
- PIN-code adapter: protocol version, valid-PIN regex,
  stub determinism, cache key sha256 digest (§15 binding),
  cache identity-by-PIN preservation, malformed-PIN rejection,
  live URL builder + UA injection, "Error" status graceful
  handling.
- `safePath` redacts `/api/geocode/pincode/:pin`.
- `validateKycLevel1Submission`: clean record accepted, full
  Aadhaar rejected, full PAN rejected, 12 per-field error
  codes, PAN uppercase normalisation.
- `submitKycLevel1`: only works on draft, idempotent
  re-submit, refuses non-draft.
- `publicProviderRecord` does not echo `kycLevel1Submission`.
- HTTP: GET pincode happy path + 400, POST submit-kyc-l1
  happy path + ledger event + binding-grep (no PII in JSON),
  full-Aadhaar attempt forwarded as 400, full-PAN attempt
  forwarded as 400, wrong acting identity → 403, missing
  acting identity → 401, X-Bharat-OS-Acting-Identity header
  path, unknown provider → 404, status-changed-in-parallel
  → 400.
- Admin queue: 401 without bearer, 200 with bearer + full
  record echo, 400 invalid status / roleKind, `hasKycL1Submission`
  filter behavior.
- Regex sanity: AADHAAR / PAN / PINCODE constants frozen.

**Vitest (`use-pincode-lookup.test.ts`, 2 cases)**:
`isValidPincode` accepts well-formed PINs, rejects leading
zero / wrong length / non-numeric.

### 10. What's NOT in 12.2.2 (deferred to 12.2.3+)

- Photo capture (selfie + ID proof). Defer to 12.2.3 where
  it lands as a CORE attachment substrate reusable across
  dispute evidence + future health-doc flows.
- Real Aadhaar e-KYC via DigiLocker — needs UIDAI sandbox
  keys; Phase 12.2.x adapter on top of `createAdapter`.
- Real PAN verification via NSDL — same pattern, paid API
  surface.
- Full CAS-on-seq on provider identity (L2-1 full fix) —
  partial mitigation lands here; the substrate-wide
  concurrency story is its own ADR.
- `submissionHistory[]` on the record (L2-5) — not needed
  until an operator surface wants the audit timeline.
- Per-citizen rate limit on pincode endpoint (KYC-AUTH-4) —
  PIN is public info, fair-use OK for v1.
- `beforeunload` warning on wizard mid-flow (wizard-no-draft-
  warning) — UX nice-to-have, deferred.
- HTTPS-only gate on admin token storage (KYC-AUTH-3) —
  deferred until the operator console is hosted on a real
  domain (today: localhost-only dev).
- `aria-live` step announcer (step-badge-aria-missing) —
  a11y polish, deferred.
- Bharat ID signed sessions to replace the URL-trusted
  rootIdentityId on /api/identities/:rootId/provider-identities
  (OWNER-LIST root fix) — Phase 13+.

## Adversarial review

A 4-lens parallel adversarial review workflow ran after the
implementation landed:

- **Lens 1 (PII / §15)**: 5 findings. 4 fixed; 1 (low) accepted.
- **Lens 2 (state machine / concurrency)**: 7 findings. 4
  fixed (one partial, L2-1); 3 low-severity deferred.
- **Lens 3 (auth / authz)**: 4 findings. 1 fixed (KYC-AUTH-1
  is the big one); 3 deferred (KYC-AUTH-2 annotation cosmetic;
  KYC-AUTH-3 needs production hosting context; KYC-AUTH-4
  acceptable for public PIN data).
- **Lens 4 (UX honesty)**: 8 findings. 4 fixed (the highs);
  4 deferred (3 low + the FE/BE parity finding which had
  no issue).

Total: 24 findings, 12 fixed in-phase, 12 deferred with
clear context / scope rationale above.

## Process

1. **Understanding workflow** — 5 parallel Explore agents
   mapped provider-identity schema, operator review
   inventory, DynamicForm reuse decision, photo-upload
   readiness, onboarding routing.
2. **Implementation** — BE adapter + endpoints + schema +
   FE hook + wizard page + entry CTAs + operator console
   section. ~1100 lines added.
3. **Adversarial review workflow** — 4 parallel verifiers
   with distinct lenses (PII / state / auth / UX).
4. **Apply fixes** — 12 high/medium findings fixed in-phase;
   tests updated to match.
5. **Verification sweep** — Node 1077 → 1082 (+5 new
   adversarial-fix cases); Vitest 119 → 121 (+2); tsc clean;
   build green.

## Files

NEW (BE):
- `src/phase1/india-post-pincode.mjs` (~115 lines).
- `tests/node/kyc-level-1.test.mjs` (30 cases, +1 file
  vs the 76-file baseline).

NEW (FE):
- `frontend/src/lib/use-pincode-lookup.ts`.
- `frontend/src/lib/use-pincode-lookup.test.ts` (2 cases).
- `frontend/src/routes/onboarding/KycLevel1Page.tsx`
  (~330 lines).

EXTENDED (BE):
- `src/phase1/provider-identity.mjs` — `kycLevel1Submission`
  field, `validateKycLevel1Submission`, `submitKycLevel1`,
  `selfProviderRecord`, `KycLevel1ValidationError`, regex
  constants.
- `src/phase0/api.mjs` — `GET /api/geocode/pincode/:pin`,
  `POST /api/provider-identities/:id/submit-kyc-l1` (with
  strong auth + concurrency check + ledger-before-save),
  `GET /api/admin/provider-identities` admin queue, owner-
  list redaction.
- `src/phase0/logger.mjs` — `PII_PATH_TEMPLATES` table +
  `safePath` rewrites.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `KycLevel1Submission` type,
  `useSubmitKycLevel1` mutation, `lastTransition` on
  `ProviderIdentity`.
- `frontend/src/App.tsx` — `/onboarding/kyc-level-1` route.
- `frontend/src/routes/ProviderOnboarding.tsx` — post-create
  redirect.
- `frontend/src/routes/provider/ProviderProfile.tsx` — three
  draft-state banners (no-L1 / pending / rejected).

EXTENDED (operator console):
- `public/operator-console/index.html` — admin-token /
  operator-id topbar, `#provider-kyc-review` section.
- `public/operator-console/app.js` — `readAdminHeaders`,
  `loadProviderKycReview`, `renderProviderKycReview`,
  `attestProviderKyc`, `activateProvider`, wire to
  bootstrap.

## Test results

- Node tests: **1053 → 1082 green** (+29 across new file +
  adversarial-fix cases).
- Vitest: **119 → 121 green** (+2 PIN-code helper cases).
- tsc: clean.
- Build: main bundle 599 → 612 KB / 170 → 174 KB gzipped
  (+13 KB for wizard + hook + mutation + Provider profile
  banners).
