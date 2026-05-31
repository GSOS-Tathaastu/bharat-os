# ADR 0117: Phase 11.4 — `/app/verify/` MFI Bundle Reader + MFI Consent Issuance + File-Store Parity Fix

## Status

**Accepted — shipped.** Closes the MFI flow end-to-end on `/app/`:
worker issues consent → copies share URL → MFI staff pastes URL on
`/app/verify/` → bundle renders. Also fixes a pre-existing gap
where the file store backend was missing the MFI consent CRUD
methods that the sqlite-store had — surfaced during live smoke.

## Context

Phase 6.1 (ADR 0097) shipped the MFI income-verification consent
substrate. Phase 8.2 (ADR 0108) shipped the consent issuance UI
on `/shell/`. Phase 11.4 brings both into the new `/app/` surface
with the discipline + design system established in Phase 11.0-11.3.

Two distinct flows in scope:

1. **Worker side** (`/app/worker/trust`): full MFI consent issuance
   form with FY picker, validity dropdown, max-reads selector,
   share-URL copy-to-clipboard, list of issued consents with
   per-row revoke.
2. **Verifier side** (`/app/verify/`): public route (no Bharat OS
   identity required); accepts a consent ID or share URL via query
   string; renders the signed bundle with status badges + per-
   section cards + signature evidence.

## Decision

### File-store BosStore parity fix

Live smoke of the MFI flow against `.bharat-os-demo/` (file-store
backend) revealed the API was throwing
`store.saveIncomeVerificationConsent is not a function`. The
sqlite-store had the methods since Phase 6.1; the file-store
never grew them. Phase 11.4 adds them:

- `incomeVerificationConsentsPath` directory entry +
  `init()` mkdir
- `incomeVerificationConsentFile(consentId)` path helper
- `saveIncomeVerificationConsent(consent)` writes JSON
- `readIncomeVerificationConsent(consentId)` reads JSON
- `listIncomeVerificationConsents({ workerId })` with optional
  worker filter

Two new tests in `tests/node/income-verification.test.mjs` lock
the parity: `BosStore round-trips income-verification consents`
+ `BosStore.listIncomeVerificationConsents filters by worker`.
**Node suite: 798 → 800 tests** (+2).

This was a real pre-existing bug, not Phase 11 churn — the demo
store (file backend) couldn't have issued an MFI consent before
Phase 11.4, and no test covered it. Catch-up via parity is the
right fix.

### Worker MFI issuance — `/app/worker/trust`

Rewritten `WorkerTrust.tsx`:

- Trust Passport card (existing) + new "Issue MFI consent" card
  with primary action button
- Tapping opens a `<Sheet>` with the issuance form:
  - **Lender name** `<Field>` (maxLength 80)
  - **Purpose** `<Field>` (maxLength 200, helper "At least 8
    characters")
  - **Financial Year** `<select>` — current FY + prior FY computed
    via `currentFY()` helper (April-March based)
  - **Valid for** `<select>` — 7 / 30 / 60 / 90 days
  - **Max reads** `<select>` — 1 / 3 / 5 / 10 (default 1 per
    Phase 6.1's single-use bearer-token posture)
  - **Issue signed consent** primary action → `useIssueMfiConsent`
    mutation → POST `/api/identities/:id/income-verification/consents`
- On success: sheet switches to the "Consent issued" state with:
  - Warning-toned `<Card>` highlighting the share URL
  - Honest copy: *"Anyone with this URL can read your bundle N
    time(s) before it expires."*
  - Read-only monospace `<input>` showing the URL
  - **[Copy]** button using `navigator.clipboard.writeText` with
    helpful toast: *"Paste into WhatsApp / email to the lender."*
- Below the issuance card: list of all issued consents with:
  - Per-row status badge derived client-side via `classifyConsent
    Status` (`active` trust, `revoked` error, `expired` neutral,
    `exhausted` warning) — mirrors Phase 8.2's
    `verifyIncomeVerificationConsent` enum
  - Per-row **[Revoke]** ghost button on active consents only,
    gated by `window.prompt(reason)` matching Phase 2a.26 reset
    pattern

### Verifier — `/app/verify/`

`VerifyPage` rewritten as a **public route** (verifiers don't have
a Bharat OS persona; route is NOT wrapped by
`ProtectedSurface`). Renders its own minimal header with the brand
mark + "Bharat OS Verifier" wordmark.

Two states:

- **No consent ID in URL**: shows the "Open a bundle" card with a
  `<Field>` accepting either a bare consent ID or a full share URL
  (regex extraction of `?consent=…`). [Read bundle] writes the
  consent ID into the URL via `useSearchParams`.
- **Consent ID present**: fetches via `useMfiBundle` (TanStack
  Query with `staleTime: Infinity` + `retry: false` because the
  server burns one read per call; auto-refetch on focus would
  exhaust the consent on every browser tab activation).

Status display rendered from a `STATUS_VARIANT` + `STATUS_LABEL` +
`STATUS_LEAD` lookup table covering all seven enum values from
Phase 6.1's `verifyIncomeVerificationConsent`:
- `valid` → trust badge "VERIFIED ✓" / *"Signature verified
  against the worker's published public key."*
- `expired` → neutral "EXPIRED"
- `revoked` → error "REVOKED"
- `exhausted` → warning "EXHAUSTED"
- `signature_invalid` → error "SIGNATURE INVALID"
- `unknown_worker` → error "UNKNOWN WORKER"
- `malformed` → error "MALFORMED"

Valid bundles render through `<BundleView>` — five cards stacked:

1. **Worker** (trust-toned): display name + lender name + FY +
   bundle-issued timestamp
2. **Aggregated income**: two `<Stat>` (total earnings via `<Money>`
   + best month) + month-by-month list with per-month `<Money>`
3. **Verified attestations** (rendered only when non-empty): one
   row per attestation with subject + claim + issued-at
4. **Worker-collective memberships** (rendered only when non-empty):
   per-row collective name + role + verified badge
5. **Welfare attestations** (governance-toned, rendered only when
   non-empty): e-Shram registrations (UAN masked) + welfare scheme
   entitlements
6. **Disclaimer** card with the Phase 6.1 mandatory disclaimer +
   `<Evidence>` collapsible showing signature + status

### New TanStack Query hooks

`lib/hooks.ts` extensions:

- `useMfiConsents(identityId)` — `GET /api/identities/:id/income-
  verification/consents`
- `useIssueMfiConsent()` — `POST .../consents`, invalidates
  `mfi-consents` on success
- `useRevokeMfiConsent()` — `POST .../consents/:consentId/revoke`,
  invalidates on success
- `useMfiBundle(consentId)` — `GET /api/income-verification/:consentId`
  for the verifier; `enabled: Boolean(consentId)` so the hook is
  inert until the verifier loads a real ID; `retry: false`,
  `staleTime: Infinity` (server burns a read)

### Routes change

`App.tsx`: `/verify` route extracted from `ProtectedSurface`
wrapper:

```diff
- <Route path="/verify" element={<ProtectedSurface><VerifyPage /></ProtectedSurface>} />
+ <Route path="/verify" element={<VerifyPage />} />
```

`VerifyPage` renders its own outer chrome (sticky header with brand
mark) so it has visual continuity with the rest of `/app/` without
relying on persona state.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Worker owns consent issuance | Explicit Issue button + Sheet form; no auto-issuance; FY selector defaults to current FY but worker must confirm |
| Bundle is bearer-token | Honest copy on the issued-consent card spells out *"Anyone with this URL can read your bundle N times"*; worker decides the out-of-band channel |
| Pointer-not-payload | Verifier sees the bundle structure (aggregates, attestations, memberships) but never raw earnings rows or memory records. Same posture as the existing `/verify/` |
| One-time read | TanStack Query `staleTime: Infinity` + `retry: false` so the verifier UI doesn't accidentally burn reads on tab-focus events. Server still authoritative |
| Honest status disclosure | All 7 status enum values rendered with distinct badges + leads. No vague "Error" generic |
| Revocation honest | Worker can revoke active consents from the issued-consents list; consent disappears from "active" but remains in the list with revoked badge so the audit trail is visible |
| HTML escaping | React renders all bundle fields via `{value}` interpolation — no `dangerouslySetInnerHTML` anywhere |
| Verifier doesn't need a Bharat OS persona | Route is public; verifier's act of fetching is itself the verifier identity-proof (they had the bearer token) |

## Tests

- **Node**: `tests/node/income-verification.test.mjs` 25 → 27
  tests (+2 BosStore parity). Full Node suite: **798 → 800**
  (run in batches of 16 to dodge Windows process-spawn OOM).
- **Frontend**: 7/7 Vitest still passing.
- **Bundle size**: 308 → 322 KB JS (96 → 99 KB gzipped); +14 KB
  for the BundleView + MFI hooks + worker issuance form.

## Live smoke verification

After the file-store parity fix:

```
POST /api/identities/:id/income-verification/consents
  body: { mfiName: "Bajaj Finserv", purpose: "Personal loan
          application", financialYear: "2025-26",
          ttlSeconds: 2592000, maxReads: 1 }
→ 201 with { ok: true, consent: { consentId: "...", ... },
              mfiFetchUrl: "/api/income-verification/..." }

GET /api/income-verification/<consentId>
→ 200 with signed bundle (or status: 'exhausted' on second read)
```

Direct file-store smoke confirms: write → read → list-by-worker
all return the consent under the new BosStore methods.

## Consequences

- **MFI flow demoable end-to-end** on `/app/`. Worker issues
  consent → copies share URL → MFI verifier opens the URL → sees
  signed bundle with status badge + every Phase 6.1/6.2/6.3
  attestation category rendered.
- **File-store backend reaches feature parity with sqlite-store**
  for MFI consents. Demo stores (which use file backend by
  default) can now exercise the flow without the operator switching
  to sqlite.
- **Verifier surface lives at one URL across personas**: both
  `/verify/` (legacy /shell/) and `/app/verify/` exist; the
  share URL the worker copies uses `/app/verify/?consent=…` so
  new shares go through the new surface. Legacy `/verify/` still
  works for older share URLs.
- **Pattern for future public routes established**: `/app/labs/`
  stays protected (needs identity), `/app/verify/` is public. This
  bisection sets the precedent for future verifier-style surfaces
  (e.g., a future kiosk read surface for KYC).

## What's NOT in this sub-phase

- **Trust attestation read surface** — the legacy `/verify/` also
  handles trust attestations (different from MFI bundles); ports
  to `/app/verify/` in a future sub-phase if needed
- **Bundle download as JSON** — verifier can copy URL but can't
  yet save the bundle as a verifiable artifact
- **Per-bundle ledger event display** — Evidence collapsible shows
  the signature; full audit-ledger lookup is Phase 11.6 polish
- **Worker analytics on consents** — "this MFI read your bundle 3x
  before deciding" surface; future polish

## Future polish

- **QR code for share URL** — most MFI staff would scan, not paste
- **Saved verifier orgs** — MFI repeatedly fetching for same lender
  gets autocomplete in the consent form
- **Bundle JSON download for verifier** — verifier can archive the
  signed artifact for compliance
- **Trust attestation surface migration** from `/verify/` to
  `/app/verify/` with a tabbed switch between MFI bundle / trust
  attestation modes
