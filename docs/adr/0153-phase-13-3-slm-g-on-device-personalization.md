# ADR 0153 — Phase 13.3 SLM-G: On-device personalization profile

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.0 SLM-E (doc summariser, ADR 0149) and Phase 13.1 SLM-F
(PII redactor, ADR 0151) shipped the first two of four SLM USP
features. The roadmap commits a third: *"On-device personalization
(preferences never leave device)"*.

Citizens should be able to flip a few enum knobs — preferred
language, response tone, accessibility, topic interests — and have
every on-device SLM verb pick those preferences up on the next
generation, with zero server round-trip. The investor-pitch beat
is three-on-screen-in-60-seconds: tap a toggle, type the same
input, see a visibly different chip; DevTools Application →
Local Storage shows the JSON; DevTools Network tab stays empty
throughout.

## Decision (Demo-impact lens + grafted ideas)

Ship Phase 13.3 SLM-G as a pure-FE substrate (`profile-store.ts` +
`profile-prompt-fragment.ts`) with generic naming so SLM-H +
future Phase 12.3+ marketplace personalization compose the same
exports verbatim, plus live profile-fragment injection into TWO
existing SLM prompt builders (intent-parser + doc-summariser).
Profile schema is `enum × enum × bool × allowlist-domains` —
PII-impossible by construction. Storage is `localStorage` via
Zustand persist. Zero BE delta.

### 1. `frontend/src/lib/profile-store.ts`

- `PROFILE_STORE_PROTOCOL_VERSION = 'bos.phase13.profile.v2'`
  (v2 after the adversarial review dropped `highContrast` — see
  MF-3 below).
- `ProfileV1` interface: `schemaVersion` + `identityId` snapshot
  + `preferredLanguage` (8 BCP-47 allowlist) + `responseTone`
  (3 allowlist) + `accessibility` (`largeText` + `ttsAuto` bools)
  + `domains` (8 allowlist, MAX_DOMAINS=4) + `updatedAt`.
- `useProfileStore` — Zustand+persist+`createJSONStorage(()=>localStorage)`,
  LS key `bharat-os.app.profile.v2`. Matches the canonical pattern
  in `identity-store.ts` / `provider-context-store.ts` /
  `sponsor-auth-store.ts`.
- `setPrefs(patch, identityId)` — coerces every field through an
  allowlist before write; refuses to write when `identityId` is
  null/empty/over-cap (pre-hydration guard).
- `clearProfile()` — resets to defaults. Wired into the DPDP
  cascade on `eraseIdentity` onSuccess + on "Forget persona on
  this device".
- `getActiveProfile(identityId, state?)` — cross-citizen isolation
  guard. Returns the persisted profile only when the snapshotted
  `state.identityId` matches the supplied `identityId`; on
  mismatch (or no identity supplied) returns defaults. Reading
  with no `state` argument calls `useProfileStore.getState()` so
  consumers can read fresh state without subscribing to the whole
  store (Phase 13.3 MF-1 fix).
- `migrate({version, persistedState})` — v1 → v2 strips the
  deprecated `highContrast` field AND coerces every field on
  rehydrate so a hand-edited LS payload (or an older v1 write
  with bogus values) can't reach the runtime in a malformed
  shape (Phase 13.3 SF-4 fix).

### 2. `frontend/src/lib/profile-prompt-fragment.ts`

- `PROFILE_FRAGMENT_PROTOCOL_VERSION = 'bos.phase13.profile-fragment.v1'`
- `FRAGMENT_MAX_CHARS = 400` (~10% of Phi-3-mini-4k context).
- `buildProfileFragment(profile, opts?)` — pure builder.
  - Returns `''` at defaults so existing prompts stay
    **byte-identical** for un-personalised citizens. Vitest
    regression-pins this invariant on both prompt builders.
  - Sorts emitted domains alphabetically so two equivalent
    profiles produce the same bytes regardless of citizen click
    order.
  - Word-boundary truncates at `FRAGMENT_MAX_CHARS`.
  - Defence-in-depth: runs `scanWithRegex` on the final fragment
    bytes; returns `''` if any PII span is detected (guard
    against a future schema bump that introduces free-text).

### 3. `frontend/src/components/PersonalizationCard.tsx`

Inline `<Card title="Personalization">` mounted in Settings.tsx
between the Identity and DPDP cards. Select for language, radio
for tone, two checkboxes for accessibility (largeText +
ttsAuto), chip-multiselect for domains. Honest framing in the
header copy: *"Stored only in this browser. Never sent to the
server. Cleared when you forget your persona or delete your
account."* Evidence block invites DevTools verification.

### 4. Prompt builders extended with optional `profileFragment`

`buildIntentParsePrompt(intentText, profileFragment?)` and
`buildDocSummaryPrompt(docKind, text, profileFragment?)` accept
an optional preamble. When omitted or empty, the prompt is
**byte-equal** to the pre-13.3 baseline. Vitest pins both.

### 5. Consumer hooks thread the profile through

`use-slm-intent-parser.ts` and `use-slm-doc-summariser.ts`
subscribe only to `useProfileStore((s) => s.updatedAt)` as a
"profile changed" tripwire so the parse/summarise callback
re-memoises on every toggle. The actual profile read happens
**lazily inside the callback** via `getActiveProfile(identityId)`
(which reads `useProfileStore.getState()` synchronously). This
pattern avoids stale-closure capture of the whole profile across
toggles — Phase 13.3 adversarial fix MF-1.

### 6. `frontend/src/App.tsx` ProtectedSurface keyed on `activeId`

The Phase 13.0 MF-1 `key={identity?.id}` parent-remount pattern
was previously present only on the Labs route. Phase 13.3
extends it to **every** protected route via the `ProtectedSurface`
wrapper so identity flips uniformly remount the entire app shell
— covers PersonalizationCard, all SLM hooks, queue state, etc.
(Phase 13.3 MF-2.)

### 7. Adversarial review (3 lenses + triage)

3 lenses (privacy/exfil, UX honesty, edge-case correctness)
returned **5 MUST_FIX + 10 SHOULD_FIX + 6 defer**. All 5 must +
6 key should-fix applied in-phase. Verdict ship_with_fixes.

**Must-fix applied**:

| ID | Fix |
|---|---|
| MF-1 | Both SLM hooks drop the whole-store subscription and use `getActiveProfile(identityId)` lazily. Subscribe to `updatedAt` only as a tripwire; add `identityId, profileUpdatedAt` to `useCallback` deps so each toggle re-memoises the callback. Earlier impl held a stale `profileState` closure that silently breaks the pitch beat. |
| MF-2 | `key={activeId}` on `ProtectedSurface` in `App.tsx`. Symmetric cross-identity remount across all protected routes, not just Labs. |
| MF-3 | Removed `highContrast` accessibility flag (wire-only no-op — never read by any UI theme or SLM directive). Bumped `PROFILE_STORE_PROTOCOL_VERSION` to v2; `migrate` strips the field from v1 persisted state. |
| MF-4 | DPDP copy upgrades: Identity card body now says forgetting "also clears your on-device personalization preferences"; Erase modal cascade list now includes "on-device personalization preferences". |
| MF-5 | PersonalizationCard renders an orange explanatory banner when no identity is active, telling the citizen to create / load a persona first. |

**Should-fix applied**:

| ID | Fix |
|---|---|
| SF-1 | `profile-store.test.ts` walks the full toggle matrix with `globalThis.fetch` + `navigator.sendBeacon` spied to throw — pins the §15 bytes-never-leave-device binding so a future phase that accidentally subscribes a fetch breaks the test. |
| SF-2 | `use-slm-intent-parser.ts` catch now surfaces a citizen-safe generic error ("The model couldn't finish on this device. Tap Check to retry.") instead of echoing `(err as Error).message`. Mirrors the Phase 13.0 MF-2 fix on doc-summariser; widened surface justifies the parity. |
| SF-4 | `migrate` coerces every field on rehydrate so hand-edited LS payloads with bogus shape can't reach the runtime in a malformed state. |
| SF-6 | PersonalizationCard renders a cross-identity warning banner when LS holds a different persona's profile — informs the citizen that saving will replace those preferences. |
| SF-7 | Evidence copy tightened — dropped the "never leaves the WASM runtime" phrasing (overclaims sandbox guarantees wllama doesn't provide); leads with the verifiable Network-tab claim. |
| SF-8 | Saturated-domain caption ("Limit reached. Tap a selected topic to make room.") explains the dimmed chips. |
| SF-9 | Subtitle changed from "Phase 13.3 SLM-G · on-device only" to "Tunes how on-device AI talks to you" — drops sprint metadata from a citizen-facing surface. |

**Deferred** (6 items): identityId hash in LS, cross-tab storage
sync, tightened `coerceIdentityId` charset, rename
`largeText → terseResponses`, expand language list to more
8th-schedule scripts, suppression telemetry for the
`scanWithRegex` defence. All flagged for Phase 13.3.x / 13.4 /
Phase 14 Bharat-ID.

## §15 bindings

| Binding | How honoured |
|---|---|
| Bytes never leave device | Zero `fetch` / XHR / `sendBeacon` / WebSocket in either new file; vitest SF-1 spies the full toggle matrix to enforce this. |
| PII-impossible by construction | Schema is `enum × enum × bool × allowlist-domain` — no free-text input via the UI. Defence-in-depth `scanWithRegex` at emit-time inside `buildProfileFragment` catches any future schema addition. |
| Honest empty state | `buildProfileFragment` returns `''` at defaults — existing prompts stay byte-equal for un-personalised citizens. `isDefaultProfile` true when every field is at its sentinel default. |
| Protocol version pinned | Both store and fragment export pinned `*_PROTOCOL_VERSION` constants; vitest pins both. Bumps require ADR. |
| Cross-citizen isolation | Two moats: (1) `getActiveProfile` snapshot-mismatch returns defaults; (2) `key={activeId}` on `ProtectedSurface` remounts every route on identity flip. |
| DPDP cascade | `clearProfile()` is wired into both Forget-persona AND `eraseIdentity` `onSuccess`. Vitest covers both. |
| FE-BE parity (2026-05-27) | **Deliberate exception** — Phase 13.0/13.1 said "BE delta = none, by design (velocity)". Phase 13.3 INVERTS the framing: "BE delta = none, by design (privacy invariant)". A `/api/profile/*` endpoint would FALSIFY the pitch beat. Future cross-device sync (if ever needed) MUST round-trip through the existing vault-key + memory-records substrate, NOT a plain `/api/preferences` endpoint. |
| Echo guardrail | Fragment sits in the prompt PREAMBLE only; parsers unchanged. Fragment cannot corrupt SLM completion parsing. |

## What's NOT in 13.3 (deferred)

- **Phase 13.3.x — standalone piiRedaction-only annotation path**
  (carried over from Phase 13.2; orchestrator schema +
  `pii_only` verdict).
- **Phase 13.3.x — per-identity persisted `pii_autoscan_enabled`
  flag** (carried over from Phase 13.2; currently per-session).
- **Phase 13.3.x — offline-queue replay redaction** (carried over).
- **Phase 13.4 — language list expansion** (pa-IN, kn-IN,
  ml-IN, or-IN, as-IN) when SLM model upgrades validate
  vernacular preamble reliability.
- **Phase 14 Bharat-ID — multi-persona-per-device** with
  per-identity LS suffix; identityId hashing.
- **Phase 13.3.x or 14 — cross-tab `storage` event sync** so a
  toggle in one tab refreshes another.

## External-API impact (API_INTEGRATIONS.md)

**Zero**. The whole 13.x SLM USP arc continues to add capability
without external services. No new env var, no new vendor.
Only edit: "Last updated" header bump.

## Files

NEW:
- `frontend/src/lib/profile-store.ts` (~270 lines)
- `frontend/src/lib/profile-prompt-fragment.ts` (~140 lines)
- `frontend/src/components/PersonalizationCard.tsx` (~280 lines)
- `frontend/src/lib/profile-store.test.ts` (~290 lines, 28 cases
  incl. v1-migrate + SF-1 network-spy + SF-4 coerce-on-rehydrate)
- `frontend/src/lib/profile-prompt-fragment.test.ts` (~170
  lines, 17 cases incl. MF-1 stale-closure regression)

EXTENDED:
- `frontend/src/lib/intent-parser.ts` — optional `profileFragment`
  parameter; vitest byte-equal regression pin.
- `frontend/src/lib/doc-summariser.ts` — same.
- `frontend/src/lib/use-slm-intent-parser.ts` — `updatedAt`
  tripwire subscription + lazy `getActiveProfile` read +
  identityId/profileUpdatedAt deps + citizen-safe error catch.
- `frontend/src/lib/use-slm-doc-summariser.ts` — same.
- `frontend/src/routes/Settings.tsx` — mount
  `<PersonalizationCard />` between Identity and DPDP cards; wire
  `clearProfile()` into both Forget-persona and `eraseIdentity`
  success; update Identity card body copy and Erase modal cascade
  list to disclose the personalization wipe.
- `frontend/src/App.tsx` — `key={activeId}` on `ProtectedSurface`.
- `frontend/src/lib/intent-parser.test.ts` — +2 backward-compat
  regression cases.
- `frontend/src/lib/doc-summariser.test.ts` — +2 same.
- `BHARAT_OS.md` — §17 closed-phase row; §15 bindings addition.
- `README.md` — SLM USP arc status bump.
- `ROADMAP.md` — flip SLM-G to SHIPPED.
- `docs/API_INTEGRATIONS.md` — Last-updated header bump.

## Test results

- Vitest: 313 → **356** (+43): 28 profile-store + 17 fragment-builder
  + 2 intent-parser backward-compat + 2 doc-summariser
  backward-compat (note: 47 net new vitest cases when counting
  the in-place updates).
- Node tests: **1233** unchanged (FE-only phase, BE delta = none
  by design).
- tsc clean. Build green.
