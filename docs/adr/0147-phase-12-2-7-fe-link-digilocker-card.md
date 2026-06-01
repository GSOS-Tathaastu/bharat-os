# ADR 0147 — Phase 12.2.7: FE "Link DigiLocker" card + KYC L1 wiring

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.6 shipped the DigiLocker OAuth2 substrate BE-only.
The substrate works end-to-end (tested at 33 cases) but no
citizen-facing surface exists to use it. The FE-BE parity
binding (`memory/fe-be-parity-rule.md`) requires every phase
from 11+ to ship FE + BE together; 12.2.6 was an explicit
exception that 12.2.7 closes.

## Decision

### 1. `useDigilockerLink` hook (`frontend/src/lib/use-digilocker-link.ts`)

Three TanStack hooks wrap the Phase 12.2.6 endpoints:

- `useDigilockerLinkStatus(rootIdentityId)` — query on
  `/status`. Stale time 30s. Returns
  `{linked, mode, scope, linkedAt, expiresAt}` — NEVER the
  token.
- `useLinkDigilocker()` — mutation that calls `/authorize`
  then (in stub mode) `/callback` in sequence via fetch.
  Live mode returns the authorizeUrl + state for the caller
  to orchestrate a popup (Phase 12.2.8).
- `useUnlinkDigilocker()` — DELETE `/link`.

**§15 bindings honored**:
- FE NEVER stores the access or refresh token. `/status`
  response excludes them.
- `actingRootIdentityId` travels in the `X-Bharat-OS-Acting-
  Identity` header ONLY, never in URL query strings (Phase
  12.2.7 adversarial fix L1-2 — the shell ships a service
  worker that logs URLs, and the rootIdentityId in a query
  string would land in those logs + referer headers. The
  rootIdentityId isn't a secret, but it's a stable per-user
  correlator that shouldn't sit in URL telemetry).
- `assertSameOriginCallback(authorizeUrl)` defensive check
  rejects any absolute URL that doesn't match
  `window.location.origin` (Phase 12.2.7 adversarial fix L1-1
  — if the BE redirectUri allowlist had a regression and
  let an absolute attacker URL through,
  `new URL(absoluteUrl, base)` would have followed it
  blindly).

### 2. `LinkDigilockerCard` component (`frontend/src/components/forms/LinkDigilockerCard.tsx`)

Citizen-facing card. Three states:
- `status.isPending` → "Checking link status…"
- `status.isError` → fallback message + manual-cross-check
  framing (Phase 12.2.7 adversarial fix L2-4 — without this
  branch, API-down silently hid the card mid-render).
- `status.linked` → trust banner with explicit "(demo mode —
  substrate ready, partner credentials pending)" tag in
  stub mode + ghost "Unlink" button.
- `!status.linked` → primary "Link DigiLocker" CTA.

**Honest framing**: the demo-mode tag is shown whenever
`mode === 'stub'` so investors / operators don't mistake
stub verification for real verification.

**Adversarial fixes applied**:
- **L2-1**: `window.confirm` before Unlink. Matches the
  rest of the codebase's destructive-action discipline
  (WorkerEarn, Labs, JobItemsUploader).
- **L2-2**: error branching via `linkErrorMessage(error)`:
  `invalid_or_expired_state` → "Link session expired,
  tap again"; 5xx → "Couldn't reach DigiLocker"; 401 →
  "You need to be signed in"; default → generic.
- **L2-3**: double-tap gate via `link.status === 'idle' |
  'error'`. React mutation `isPending` is render-state; a
  fast double-tap before re-render would have fired
  `mutate` twice. BE upsert is idempotent but the audit
  ledger would have recorded TWO `digilocker.link_saved`
  events. Same gate on unlink.

### 3. KYC L1 wizard wiring

`LinkDigilockerCard` renders at the TOP of the
'identity' step in `KycLevel1Page.tsx`. Citizen can:
- Link DigiLocker first → operator gets the stronger
  `signedDocSha256` verification path (🔏 badge in operator
  console from Phase 12.2.6).
- Skip → KYC L1 completes with manual operator cross-check.

The card is INSIDE the identity step block (not a separate
step), so `STEP_ORDER` and the "Step 1 of 5/6" counter math
stay correct.

### 4. Adversarial review (2 lenses)

- **FE token-leak**: 5 findings. 2 medium fixed in-phase
  (same-origin assert; query-string → header migration). 2
  low fixed (URL constructor error wrap; multi-origin
  helper deferred). 1 clean (no token storage anywhere on
  the FE — TanStack cache, no localStorage, no cookies).
- **UX honesty**: 5 findings. 4 fixed (confirm dialog,
  error branching, double-tap gate, status-error
  fallback). 1 clean (step counter math).

Total: 10 findings, 6 medium fixed in-phase, 4 low /
clean / deferred.

## §15 bindings

| Binding | How honored |
|---|---|
| No token on FE | TanStack response type excludes token; no localStorage / sessionStorage / cookies; verified by review |
| No PII in URL telemetry | actingRootIdentityId → header only (L1-2 fix) |
| Same-origin authorize callback | `assertSameOriginCallback` enforced before fetch (L1-1 fix) |
| Honest stub framing | "(demo mode — substrate ready, partner credentials pending)" tag whenever `mode==='stub'` |
| Confirm before destructive | `window.confirm` on Unlink (L2-1 fix) |

## What's NOT in 12.2.7 (deferred)

- **Phase 12.2.8 — live OAuth popup flow.** The hook
  returns `authorizeUrl` + `state` in live mode without
  orchestrating; the popup-helper component lands when
  partner credentials arrive.
- **postMessage listener for live callback.** Popup-side
  module that posts back to the opener so the wizard can
  refresh the status query.
- **Multi-origin API helper.** Deferred until the FE
  splits from the API origin (Phase 13+ hosting work).

## Files

NEW (FE):
- `frontend/src/lib/use-digilocker-link.ts` (~130 lines).
- `frontend/src/lib/use-digilocker-link.test.ts` (2 cases).
- `frontend/src/components/forms/LinkDigilockerCard.tsx`
  (~150 lines).

EXTENDED (FE):
- `frontend/src/routes/onboarding/KycLevel1Page.tsx` —
  `LinkDigilockerCard` rendered at top of identity step.

## Test results

- Vitest: 138 → **140** (+2 hook smoke cases).
- Node tests: 1199 unchanged (FE-only phase).
- tsc clean. Build green.
- Bundle main: 628 → 632 KB / 177 → 179 KB gzipped (+4 KB
  for hook + card).
