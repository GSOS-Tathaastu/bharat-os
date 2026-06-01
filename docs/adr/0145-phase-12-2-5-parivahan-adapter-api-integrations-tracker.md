# ADR 0145 — Phase 12.2.5: Parivahan / Sarathi / Vahan verification adapter + API_INTEGRATIONS tracker

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.4 closed the wave-1 onboarding loop with citizen-
typed verification numbers (DL #, vehicle registration #, etc.)
that the operator MANUALLY cross-checks against the photo
document. User feedback during that phase: real automated
verification against the official Government of India endpoints
is the right next layer. **mParivahan / Sarathi / Vahan** are
the canonical sources.

Parallel ask: maintain a running document of every external API
Bharat OS needs to provision to go live, so the operator (and
investor) can read one page and know what's stub / what's live /
what's blocked on a partner agreement.

## Decision

### 1. Parivahan adapter (`src/phase1/parivahan-adapter.mjs`)

Third concrete adapter composed on top of the Phase 12.2.1
external-adapter substrate (after Nominatim + India Post PIN).
Two verification kinds:

- `verifyDl(dlNumber)` — driving licence lookup. Returns
  `{status, number, holderName, validUntil, provider, fetchedAt}`.
- `verifyRc(registrationNumber)` — vehicle RC lookup. Returns
  `{status, number, ownerName, vehicleClass, fitnessUntil,
  insuranceUntil, provider, fetchedAt}`.

Frozen provider allowlist: `stub | digilocker | surepass | karza
| idfy`. v1 ships **stub only**; live providers throw
`provider_not_configured` at the `build()` step until a future
commit adds the per-provider URL + parse. The substrate refuses
unknown providers at construction so an env typo fails LOUD.

**§15 bindings**:
- `cacheKey` is `parivahan:{dl|rc}:<sha256(normalized).slice(0,32)>` —
  raw DL/RC never lands on the `external_adapter.call` audit event.
- Stub returns deterministic data with a REAL `fetchedAt` timestamp
  (Phase 12.2.5 adversarial fix UX-Q5 — frozen `2026-06-01T...`
  initially, would have confused operators about freshness).
- `verifier_error` envelope persists only `{code:
  'verifier_unavailable'}` (Phase 12.2.5 adversarial fix PII-6 —
  the original implementation persisted the full error message
  "Parivahan provider 'X' not yet configured. See
  docs/API_INTEGRATIONS.md §2.1" which leaked the configured
  provider name through `selfProviderRecord` to anyone reading
  the URL-trusted owner-list).

### 2. provider-identity extension

NEW field `roleExtrasVerifications` on the record:
```
{ runByOperatorId, runAt, results: {fieldId: verificationEnvelope} } | null
```

NEW `recordRoleExtrasVerifications(provider, {results, operatorId, at})`
mutator. Refuses if there's no `roleExtrasSubmission`.

**Phase 12.2.5 adversarial fix UX-Q4** — `recordRoleExtrasSubmission`
now ALSO clears `roleExtrasVerifications: null` (Phase 12.2.4
already cleared `roleExtrasAttestation` for the same reason).
Without this, a citizen editing their DL number after a
verification run leaves OLD ✓ badges against the NEW typed
number — exactly the silent stale-attest bug Phase 12.2.4 fixed.

**Phase 12.2.5 adversarial fix PII-3** — `selfProviderRecord`
DOES NOT echo `roleExtrasVerifications`. The owner-list endpoint
trusts the URL-declared rootIdentityId (Phase 12.2.2 KYC-AUTH-1
deferral); echoing the upstream holder name + validity dates
would have leaked strictly MORE sensitive data than the redacted
"••••" answers already on the projection. Operator-authenticated
paths (admin queue) still see the full record via the
un-projected list.

### 3. API endpoint

`POST /api/admin/provider-identities/:id/verify-role-extras` —
admin bearer. Runs the Parivahan adapter for each verifiable
field on the submission (DL for cab-driver + personal-driver;
RC for cab-driver only) and persists the result. Audit event
`provider_identity.role_extras_verified` carries
`{providerIdentityId, rootIdentityId, role, verifiedFields,
statuses, operatorId}` — never holder names or validity dates.

**Phase 12.2.5 adversarial fix L2-A** — when EVERY result is
`verifier_error` (typically a configuration failure), the
endpoint surfaces 502 `verifier_unavailable` and **skips both
the persist AND the ledger event**. The original implementation
would have polluted the audit trail with misconfig events
disguised as real verification outcomes.

**Phase 12.2.5 adversarial fix L2-B** — endpoint refuses verify
on provider status outside `{draft, submitted}`. Operator
re-bouncing an active or revoked provider through draft is
required before re-verifying.

### 4. Operator console

NEW "Pre-verify (Parivahan)" button per row (enabled when
roleExtrasSubmission present). Confirm dialog explicitly names
stub mode + the two env vars so the operator knows what they're
looking at.

Verification badges with color treatment (Phase 12.2.5
adversarial fix UX-Q1+Q2):
- `valid` → green `✓ fieldId=valid`
- `verifier_error` → red `✗ fieldId=verifier_error`
- `not_found` → red `⚠ fieldId=not_found`
- Stub provider tagged inline `[stub]` so demo results aren't
  mistaken for real verifications.

### 5. `docs/API_INTEGRATIONS.md` — master tracker

NEW living document covering every external API Bharat OS
composes:

- **Geo + address**: OSM Nominatim ✅, India Post PIN ✅.
- **Identity verification (driving/vehicle)**: Parivahan
  (this phase, stub).
- **Identity verification (govt-issued IDs)**: DigiLocker
  (reserved), NSDL PAN (reserved), GSTN (reserved).
- **Payments**: NPCI/UPI rails (roadmap), Razorpay IFSC
  (reserved).
- **Messaging**: SMS providers (Gupshup / MSG91 / Twilio /
  Karix — adapter shipped, all stubs until partner credentials),
  Web Push VAPID ✅, ABDM/ABHA (reserved for React app).
- **Marketplace bridges**: ONDC (reserved hidden v1).
- **Operator + compliance**: DPDP audit signer ✅, admin token ✅.

Each entry lists: adapter path (if shipped), upstream URL,
cost, partner-provisioning steps, exact env vars to set.

**Phase 12.2.5 adversarial fix UX-Q6** — initial SMS section
had wrong env-var names (claimed `BHARAT_OS_KARIX_USERNAME` /
`BHARAT_OS_KARIX_SENDER_ID`; the actual code uses
`BHARAT_OS_SMS_KARIX_USERNAME` and there's no Karix SENDER_ID).
Doc now matches the codebase verbatim across all 4 SMS
providers + lists circuit breaker + bulkhead env vars.

## §15 bindings honored

- `provider_identity.role_extras_verified` ledger event payload
  is field-id + status + operatorId + role only. Binding-grep
  test asserts no holder name / validity / raw DL or RC.
- `external_adapter.call` audit event continues to carry meta
  only — adapter cacheKey is sha256 digest.
- `publicProviderRecord` does NOT echo `roleExtrasVerifications`.
- `selfProviderRecord` does NOT echo it either (PII-3 fix).
- `verifier_error` envelope is code-only, never the upstream
  message / provider name.
- Operator console renders status badges via `escapeHtml`;
  color treatment via CSS variables that don't carry data.

## Tests

**Node (`tests/node/parivahan.test.mjs`, 24 cases)**:
- Substrate: protocol version, frozen provider allowlist,
  DL/RC shape regexes, unknown provider construction-time
  rejection, stub determinism, sha256 cacheKey binding-grep,
  cache hit on repeat, `verifyRoleExtrasFields` covers
  cab-driver DL+RC / personal-driver DL only / no-op on
  labourers + household-help / silent skip on malformed DL.
- Adversarial fixes:
  - `selfProviderRecord` strips verifications (PII-3).
  - `recordRoleExtrasSubmission` clears verifications on
    resubmit (UX-Q4).
  - Verify endpoint refuses non-draft / non-submitted
    status (L2-B).
  - `verifier_error` envelope carries only `code`, no
    `message` / provider name (PII-6).
  - Verify endpoint returns 502 + skips ledger when all
    results are `verifier_error` (L2-A).
- HTTP: admin bearer required, happy path emits ledger event
  with binding-grep, no-submission → 400, unknown
  provider → 404.

**Vitest**: unchanged (no FE-only changes in Phase 12.2.5).

## Adversarial review (3 lenses)

Skipped the state-machine lens — Phase 12.2.5 adds one new
field (`roleExtrasVerifications`) but no new state transitions.

- **PII**: 6 findings. 2 fixed in-phase (selfProviderRecord
  leak; verifier_error message leak). 1 inherited from
  Phase 12.2.3 (cacheKey rainbow-tableable; not a regression).
  3 clean by construction.
- **Auth / DoS**: 7 findings. 2 fixed (state guard; all-error
  502). 2 inherited gaps (substrate-wide CAS upsert from
  Phase 12.2.2 L2-1; rate-limit splinter from Phase 12.2.1).
  3 clean.
- **UX / docs**: 7 findings. 4 fixed in-phase (stale
  verification on resubmit, frozen fetchedAt, doc env-var
  names, stub badge marker + color). 3 minor or deferred
  (citizen-side visibility — Q7, defer until live
  providers).

Total: 20 findings, 8 high+med fixed in-phase, 12 inherited /
clean / deferred with explicit scope.

## What's NOT in 12.2.5 (deferred)

- **Per-provider live URL + parse** (digilocker, surepass,
  karza, idfy) — v1 builds the substrate + stub; live
  providers slot in additively. Requires partner
  registration + per-provider response-shape mapping.
- **DigiLocker DL/RC fetch** — the cleanest live path,
  citizen-authenticated. Phase 12.2.6+ work; requires
  UIDAI / DigiLocker partner approval.
- **Citizen-side visibility** — the wizard doesn't yet
  render verification status to the citizen. Intentional
  for v1 (operator-side feedback loop). Defer until live
  providers so the citizen sees real holder names, not
  the stub fixture.
- **Substrate-wide CAS-on-seq** — inherited from Phase
  12.2.2 L2-1.
- **Rate-limit splinter across BE instances** — inherited
  from Phase 12.2.1.
- **DL/RC cacheKey salting** — current sha256 prefix is
  rainbow-tableable. Same posture as attachment cacheKey
  (Phase 12.2.3); not a regression. Salt when the ledger
  becomes externally readable.

## Files

NEW (BE):
- `src/phase1/parivahan-adapter.mjs` (~280 lines).
- `tests/node/parivahan.test.mjs` (24 cases).

NEW (docs):
- `docs/API_INTEGRATIONS.md` (~290 lines) — master external-API
  tracker.

EXTENDED (BE):
- `src/phase1/provider-identity.mjs` —
  `roleExtrasVerifications` field, `recordRoleExtrasVerifications`
  mutator. Clear-on-resubmit. selfProviderRecord doesn't echo.
- `src/phase0/api.mjs` — `POST verify-role-extras` endpoint with
  status guard + all-error suppression.

EXTENDED (operator console):
- `public/operator-console/app.js` — `verifyRoleExtras`
  handler; per-row Pre-verify button; color + symbol +
  stub-tag badges.

## Test results

- Node tests: **1142 → 1166** (+24 substrate + endpoint +
  binding-grep + 5 adversarial-fix cases).
- Vitest: unchanged (138/138). tsc clean. Build green.
- Bundle main: unchanged (FE-only touches landed in operator
  console which is separate from the React app bundle).
