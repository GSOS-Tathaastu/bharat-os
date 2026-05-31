# ADR 0127 — Phase 11.8: per-scope consent grant + auto-re-send

Status: Accepted (2026-05-31).
Phase: 11.8 (citizen `/app/` consent flow; follow-up to Phase 11.7).
Depends on: Phase 1.3 consent substrate (`src/phase1/policy.mjs`
`createConsent` / `revokeConsent` / `signConsent`), ADR 0126
(Phase 11.7 Outcome card surfacing `consentRequirement`).

## Context

Phase 11.7 surfaced what the orchestrator wanted but stopped at
"per-scope consent UI ships in Phase 11.8." Citizens could see
the blocked verdict + the required scopes, but had to bounce to
`/shell/` to actually grant a consent — exactly the kind of
hand-off the `/app/-grows-/shell/-retires` direction is closing.

The BE substrate already supports everything:
- `POST /api/consents` accepts `{subjectId, granteeId, scopes,
  purpose, ttlDays, signWithIdentityId, signRole}` and returns a
  signed consent artifact.
- `POST /api/consents/:id/revoke` accepts a reason + signing
  identity and emits a signed revocation.
- `orchestrateIntent` reads `store.listConsents()` each call, so
  a newly-saved consent unblocks the next intent without any
  cache-warmup step.

Phase 11.8 wires the FE consent surface to that substrate.

## Decision

Pure FE; zero BE changes.

1. **Three hooks in `frontend/src/lib/hooks.ts`:**
   - `useConsents(identityId)` — GET `/api/consents?subjectId=…`,
     filters client-side to the subject. Returns a typed
     `ConsentArtifact[]` with the BE's `lifecycle` field
     attached.
   - `useGrantConsent()` — POST `/api/consents` with
     `signWithIdentityId: identityId, signRole: 'subject'` so the
     artifact is signed by the citizen. Server cannot fabricate
     consent on the citizen's behalf.
   - `useRevokeConsent()` — POST `/api/consents/:id/revoke` with
     `revokedBy: identityId` + same self-signing pattern. Default
     reason `revoked_by_citizen`.

2. **`<ConsentGrantSheet>` component** (new) launched from the
   OutcomeCard when an intent is blocked on a consent gate.
   Surfaces:
   - The **grantee** (e.g. `bharat-os-orchestrator`) in a
     governance-toned sub-card.
   - The **purpose** sentence (action-type-derived — e.g. "Book a
     service for me through the Bharat OS marketplace.").
   - Each **scope** with a checkbox (default ALL checked), a
     `<SCOPE_DESCRIPTIONS>` map plain-language explanation per
     known scope. Citizens can opt out per scope; UI warns
     "Bharat OS may still block this action if any required
     scope is missing."
   - **Validity duration** — 1 / 7 / 30 / 90 days as toggleable
     pills, default 30. The BE's `ttlDays` defaults to 30 already
     but we want the citizen to see and choose.
   - [Grant + retry intent] / [Cancel] actions. Button label
     adapts: "Grant + retry intent" when all checked, "Grant N
     of M" otherwise.

3. **OutcomeCard gains a `onGrantConsent` callback prop.** When
   set and the orchestration is `blocked` with a non-empty
   `consentRequirement.scopes`, the consent block surfaces a
   [Review + grant consent] action. Tap → opens the sheet.

4. **CitizenIntent owns the grant + retry orchestration.**
   - `handleGrant(scopes, ttlDays)` calls
     `grantConsent.mutateAsync(…)`, awaits the consent save, then
     re-fires `handleSend(lastOutcome.intent.intentText)` to
     re-issue the original intent.
   - During the retry the Send action label flips to
     "Re-sending after consent…" so the citizen sees what's
     happening.
   - On success the Outcome card replaces itself with the new
     orchestration (now `planned` or `completed`).

5. **Trust tab is now a real surface.** Lists active consents
   with per-row [Revoke] action. Shows purpose, grantee
   (monospace), each scope as a trust-tinted chip, expiry date,
   and a History card with revoked / expired entries (read-only).

## Why opt-in per scope

The Phase 1.3 substrate could happily auto-grant all required
scopes with one tap. We deliberately render each as a separate
checkbox because:

- §15 honesty: the citizen sees exactly what they're agreeing to,
  not a black-box "Allow" button. Granular control is the whole
  point of signed scope artifacts.
- Future-proof for partial trust: a citizen might grant
  `service.book` + `consent.record` but withhold `upi.settle`
  if they want to settle outside Bharat OS. The substrate already
  handles partial grants correctly (the orchestrator just stays
  blocked); the UI now matches.
- Lays the pattern for Phase 12.1 marketplace where a single
  booking might span 6-8 scopes across consent + payment +
  identity disclosure.

## §15 bindings

- **Citizen-signed.** Every grant carries
  `signWithIdentityId: identityId, signRole: 'subject'` so the
  artifact is authentic. A test pins this contract — if a
  refactor drops the signing fields, the test fails.
- **No silent re-grants.** Even when auto-re-sending after grant,
  we never auto-grant; the citizen must tap [Grant + retry]
  themselves.
- **Revocation is signed too.** Trust tab revoke flow carries
  `signWithIdentityId + signRole: 'revoker'` so the revocation
  evidence is non-repudiable.
- **History stays visible.** Revoked + expired consents stay in
  the Trust tab History section. Citizens can audit their own
  grant history without bouncing to `/shell/`.
- **No third-party signal.** The Outcome card and the grant
  sheet show the grantee identifier as-is; we don't dress it up
  as e.g. "Bharat OS Trusted Service" — the citizen sees the
  exact ID that will be recorded in the ledger.

## Tests

2 new Vitest cases in
[`frontend/src/lib/use-grant-consent.test.ts`](../../frontend/src/lib/use-grant-consent.test.ts):

- `useGrantConsent` POST body must carry `subjectId`, `granteeId`,
  `scopes`, `purpose`, `ttlDays`, **and** `signWithIdentityId` +
  `signRole: 'subject'`. The signing fields are the §15 critical
  contract — without them the server could fabricate consent.
- `useRevokeConsent` POST body must carry `reason`, `revokedBy`,
  `signWithIdentityId`, `signRole: 'revoker'`.

FE Vitest total: 33 → 35 (+2). No new Node tests (zero BE
changes). Bundle: main 372 → 380 KB / 115 KB gzipped (+2 KB —
hooks + sheet + Trust tab rewrite). wllama lazy chunk unchanged
292 KB / 126 KB gzipped. Build 1.51s.

End-to-end verified via curl simulating the browser flow:
"Book a cab" returned `status: blocked` → POST `/api/consents`
returned `ok: true` → re-sending the same intent returned
`status: planned` with `localizedResponse.text: "Looking for the
best provider for you."` — exactly the loop the citizen will see
in the FE.

## Consequences

- Headline citizen demo loop is now fully `/app/`-native:
  citizen types intent → sees blocked Outcome → taps grant →
  sees granted consent → sees planned re-send → audit ledger
  has the full lineage. No `/shell/` bounce.
- Trust tab is no longer placeholder copy. Citizens have a real
  permissions surface they can audit and revoke from.
- The `<ConsentGrantSheet>` + `useGrantConsent` shape is reusable
  for every future regulated action (scheme delivery, health
  record read, labor matching, trust attestation). Phase 12.1
  marketplace bookings will reuse it directly.
- Phase 11 arc-extension: the original "Phase 11 CLOSED 2026-05-31"
  framing now includes 11.7 + 11.8 + 11.9 as direction-driven
  follow-ups. We're treating the closed phase as a stable surface
  area, not a frozen one.

## What's NOT in this sub-phase

- **Per-scope revocation in the OutcomeCard.** Revoke lives in
  the Trust tab. A citizen who immediately regrets a grant from
  Home has to navigate to Trust to revoke. Acceptable for v1;
  inline-revoke is polish.
- **Bulk grant for multiple intents.** Each grant is per-intent.
  A citizen issuing five service bookings in a row will grant
  consent five times. Polishing this requires `bharat-os-
  orchestrator`-wide consent which weakens §15 granularity;
  defer to user feedback.
- **Consent template suggestions.** When a citizen has previously
  granted similar scopes, we could suggest "Same as last time".
  Polish; v1 is honest about each grant.
- **TTL beyond 90 days.** Capped at 90 in the UI; longer-lived
  consents need a separate "this is a long-lived grant" review
  step the design doesn't yet have.
- **Hindi/vernacular scope descriptions.** The
  `SCOPE_DESCRIPTIONS` map is English-only. i18n is Phase 12+
  polish.

ADR 0127.
