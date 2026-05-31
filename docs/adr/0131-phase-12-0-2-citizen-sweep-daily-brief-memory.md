# ADR 0131 — Phase 12.0.2: citizen sweep — daily brief + personal memory records

Status: Accepted (2026-06-01).
Phase: 12.0.2 (substrate integration sweep, citizen side).
Depends on: Phase 1.6 memory records substrate, Phase 9C/Phase 2a.19
daily-brief substrate (`src/phase1/daily-brief.mjs`),
Phase 11.8 consent grant flow.

## Context

After Phase 12.0.1 shipped sign-up + sign-in, the founder asked
"are there any other substrates we have not integrated into
Bharat OS yet?" — i.e. what else is BE-complete but invisible
on `/app/`. The audit surfaced ~15 substrates with no `/app/`
surface (some had `/shell/` UIs, some were pure BE).

The founder's response: integrate all of them, in the best
places, treating it as a complete-product showcase. Acknowledged
that domain modules (cab booking, doctor booking, etc.) are
separate multi-week BE arcs after Phase 12.1a marketplace
substrate.

Plan: a sweep of 4 sub-phases (12.0.2 → 12.0.5) wiring the
existing substrates into `/app/` properly before tackling
domain modules. This ADR is the first sweep — citizen side.

## Decision

Pure FE; zero BE changes. Both surfaces use existing endpoints.

### 1. Daily brief on `/app/citizen/home`

The orchestrator's `daily_brief` action type is fully wired:
when `POST /api/orchestrations` carries `{actionType:
'daily_brief', actorId}`, the server calls
`gatherDailyBriefSignals` and threads the structured signals
into `actionRequest.metadata.signals`. The composed brief text
requires a `memory.read + consent.record` consent; the signals
come back regardless.

`useDailyBrief(identityId)` (`frontend/src/lib/hooks.ts`) fires
`POST /api/orchestrations` with `daily_brief`, returns the full
orchestration including `metadata.signals`. Refresh every 5
minutes, `staleTime: 60s`.

`<DailyBriefCard>` (`frontend/src/components/DailyBriefCard.tsx`)
renders at the top of `/app/citizen/home` (above the intent
textarea). Surfaces:
- Time-of-day greeting + first name (good morning / afternoon /
  evening / night).
- Composed brief text when `status === 'completed'` (in
  `localizedResponse.text`); otherwise "Here is your day so far."
- Grid of structured signals:
  - **Earned in the last 24h** (mesh paise + event count)
  - **Expiring soon** (top 3 consents with expiresAt in the next
    7 days)
  - **Recent on this profile** (top 4 orchestrations with
    relative time)
  - **Open §9A flag reports** mentioning the user (error tone)
- "Unlock the personalised summary" prompt when the brief is
  blocked on consent. Tap → opens the existing
  `<ConsentGrantSheet>` via a new `handleGrantBriefConsent`
  helper on `CitizenIntent`.
- Footer: "Composed on-device · 24h window · §15 pointer-not-
  payload" badge.

If signals are empty AND no consent needed, the card suppresses
itself — a brand-new user doesn't see a blank state.

**Consent-grant flow integration.** When the daily brief is
blocked, tapping "Review + grant" sets the brief's orchestration
as `lastOutcome` and opens `<ConsentGrantSheet>`. The existing
`handleGrant` is extended to:
- After grant succeeds, invalidate the `['daily-brief',
  identityId]` query so the brief refetches with the new consent.
- Distinguish intent re-send (when `intent.intentText` is
  non-empty) from pure consent grant (daily-brief case): in the
  latter we clear `lastOutcome` and show a "Consent granted.
  Your brief is composing." toast.

### 2. Personal memory records on `/app/citizen/notes`

New tab on the citizen bottom-nav between Home and Trust. The
substrate (`src/phase1/memory.mjs`) has been complete since
Phase 1.6:
- `GET /api/memory-records?ownerId=…` returns
  `memorySummary[]` (label + sensitivity + tags + createdAt;
  no plaintext).
- `POST /api/memory-records` accepts
  `{identityId, text, label?, sensitivity?, tags?, contentType?,
  scopes?, source?}` and saves an encrypted bundle + summary.
- `POST /api/memory-records/:id/read` accepts
  `{identityId, granteeId?, piiHandling?}` and runs
  `readMemoryRecordWithConsent`. Returns `{ok, approved,
  decision, memory, plaintext}` — `plaintext` only when the
  consent gate approves.

Three new hooks:
- `useMemoryRecords(identityId)` — list, sorted newest first.
- `useCreateMemoryRecord()` — encrypts + saves, invalidates the
  list query.
- `useReadMemoryRecord()` — consent-gated read.

`<CitizenNotes>` (`frontend/src/routes/CitizenNotes.tsx`):
- List view with per-note button. Each row shows label (or
  "(untitled note)"), plaintextBytes + saved date, tag chips,
  sensitivity badge (`personal` / `sensitive` / `public` with
  tone-coded badges).
- Empty state explains §15 honesty: encryption with vault key,
  metadata-only on list, consent-gated reads, every read in the
  audit ledger.
- **Create sheet** with label + text textarea + sensitivity
  toggle (personal default). "Save note" → encrypts + persists.
- **Read sheet** opens when a note tile is tapped. Calls
  `useReadMemoryRecord` immediately. Surfaces:
  - Loading state while decrypting + checking consent.
  - Plaintext in a trust-toned card when approved.
  - Warning card "Could not read this note. Check Trust →
    Permissions" when consent denied (the consent UI is the
    Trust tab from Phase 11.8).

### 3. Citizen tabs reorganised

The citizen bottom-nav goes from 4 → 5 tabs:

| Tab | Path | Source |
|---|---|---|
| Home | `/citizen/home` | Phase 11.3 + 11.7 + 11.8 + 12.0.2 |
| **Notes** (new) | `/citizen/notes` | Phase 12.0.2 |
| Trust | `/citizen/trust` | Phase 11.8 |
| Labs | `/labs` | Phase 9.0c/d |
| Settings | `/settings` | Phase 11.6 |

Five tabs is the same density as the worker bottom-nav
(Phase 10.2), already proven on mobile.

## §15 bindings

- **Daily brief composed on-device.** The substrate explicitly
  says "All composition happens on the server-as-stand-in-for-
  device (Phase 2a) or in-device (Phase 2b). The signals never
  leave the user's profile boundary." Card footer surfaces this
  with the "§15 pointer-not-payload" badge.
- **Brief signals are metadata, not payload.** Numbers render as
  paise (banded), dates as short day labels, no raw transaction
  strings.
- **Notes encrypted at rest.** Plaintext is encrypted with the
  vault key on the server (Phase 0). List query returns
  `memorySummary` only.
- **Reads are consent-gated.** Even the owner reading their own
  note goes through `readMemoryRecordWithConsent` which runs
  the standard scope + lifecycle policy. Every read writes a
  decision to the ledger.
- **Sensitivity surfaced honestly.** The citizen picks per-note
  sensitivity; sensitive notes require a stricter consent
  purpose to read (substrate already enforces this).

## Tests

No new tests this sub-phase. The underlying substrates are
already battle-tested:
- `tests/node/memory.test.mjs` covers memory-record creation,
  encryption, consent-gated reads.
- `tests/node/daily-brief.test.mjs` covers signal gathering +
  brief composition.

Full Node suite: **890/890** (unchanged from 12.0.1). FE Vitest:
**45/45** (unchanged). The FE components are pure surface code
over typed hooks; component-level snapshot tests deferred to
polish if needed.

Bundle: main 399 → **411 KB / 123 KB gzipped** (+12 KB for
`DailyBriefCard` + `CitizenNotes` route + 4 new hooks + types).
wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.45s.

End-to-end verified on running server:
- `POST /api/identities` → new identity
- `POST /api/memory-records` → encrypted note saved
- `GET /api/memory-records?ownerId=…` → metadata-only list
- `POST /api/orchestrations {actionType: daily_brief}` →
  structured signals + (consent permitting) composed text

## Consequences

- Citizen home is now an actual home screen. Investors opening
  `/app/citizen/home` see a personalised brief at the top
  (greeting, mesh earnings, expiring consents, recent activity)
  before any intent is typed. Reads as "AI works for me from
  the moment I open the app."
- Citizens have personal storage. Notes tab gives them a place
  to save anything (doctor numbers, addresses, ideas) with
  honest §15 framing (encryption, consent-gated reads, ledger).
- Trust tab + Notes tab + consent flow together complete the
  "your data is yours" story end-to-end on `/app/`.
- Pattern reuse for sub-phase 12.0.3 (worker sweep): the
  metadata-on-list + consent-gated-read pattern in `<CitizenNotes>`
  generalises to health-documents, e-Shram records, and other
  sensitive resources.
- Five-tab bottom-nav on citizen now matches worker. Future
  tabs (Health from 12.0.3, Sponsor admin from 12.0.5) may
  need a "More" overflow if we go past five.

## What's NOT in this sub-phase

- **Health documents (ABHA)** — high-value but ABHA sandbox
  paperwork is non-trivial. Deferring to Phase 12.0.3 or
  later.
- **Voice intent input** — substrate exists but proper
  vernacular intent → action mapping is Phase 12.1b SLM-A.
- **Push notifications opt-in on `/app/`** — substrate exists;
  service-worker registration is heavier infrastructure work,
  deferring to Phase 12.0.4 cross-cutting sweep.
- **Trust attestation mint** — citizens minting selective-
  disclosure attestations about themselves. UX has real
  complexity (pick recipient + pick claims to disclose);
  Phase 12.0.3 worker sweep where mint UX is more natural.
- **Flag reports** — §9A citizen reports of bad actors;
  Phase 12.0.4 cross-cutting.
- **Tag chips on note creation** — the substrate stores
  tags but the create sheet doesn't capture them. Polish.
- **Note edit/delete** — read-only after create. Polish.
- **i18n** — English copy only. Phase 12.1b SLM-A vernacular
  layer.

ADR 0131.
