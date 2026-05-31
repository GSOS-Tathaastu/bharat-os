# ADR 0126 — Phase 11.7: citizen intent orchestration wire-up

Status: Accepted (2026-05-31).
Phase: 11.7 (Phase 11 /app/ surfaces follow-up; user-reported demo
silence).
Depends on: ADR 0116 (Phase 11.0-11.3 /app/ scaffold), ADR 0066
(orchestrator BE substrate).

## Context

The user tried the demo flow on `/app/citizen/home`, typed "Book a
cab", tapped Send — and nothing happened. The textarea cleared, a
success toast flashed, but the Recent activity card stayed empty
and no Outcome was rendered.

Two stacked bugs caused the silence:

1. **FE/BE payload shape mismatch.** `useSendIntent` sent
   `{intent:{intentText,locale}, actionRequest:{actorId}}`. The BE
   orchestrator (`src/phase1/orchestrator.mjs`'s
   `buildActionRequest`) reads `intentText`, `actorId`, `locale`
   as flat keys on the body. With the nested shape:
   - `intent.intentText` was `undefined` → the language normaliser
     received an empty string → `inferActionTypeFromNormalized`
     fell back to `mesh_storage` (the default for un-matched
     intents) → "Book a cab" was orchestrated as storage.
   - `actionRequest.actorId` was `undefined` → the orchestration's
     own `actionRequest.actorId` was undefined → the recent-
     activity filter `o.actionRequest?.actorId === identityId`
     never matched → the list stayed empty.

2. **No outcome surface.** Even with the shape fixed, the citizen
   has no way to see what Bharat OS did with their intent. The
   orchestration response carries `status`, `localizedResponse.text`,
   `consentRequirement.scopes`, `failedPolicies`, and a `plan` —
   none of which surfaced in the UI. Blocked intents (the common
   case for regulated actions before any consent has been granted)
   were indistinguishable from no-ops.

## Decision

Pure FE fix. Zero BE changes — the orchestrator already returns
everything the surface needs.

1. **`useSendIntent` POSTs the flat shape** `{intentText, actorId,
   locale}`. The hook now returns the typed `SendIntentResponse`
   (`{ok, orchestration}`) so the caller can use the orchestration
   to render an outcome. JSDoc on the hook names the past bug so
   future eyes don't reintroduce the nested shape.

2. **Orchestration types extended.** `Orchestration` interface
   gains `status` (`'planned' | 'completed' | 'blocked'`),
   `failedPolicies: string[]`, `consentRequirement` (subjectId +
   granteeId + scopes + required), and a typed `localizedResponse`
   matching the BE shape (`{text, locale, fallbackUsed}`).
   `OrchestrationPlanStep` interface added so plan rendering is
   typed.

3. **`<OutcomeCard>` component** rendered below the input card
   after a successful POST. Surfaces:
   - **Action-type label** (e.g. "Service booking (Bharat OS
     marketplace)") via a `ACTION_TYPE_LABEL` map.
   - **Status badge** (trust / pending / warning) for completed /
     planned / blocked.
   - **Localised message** — the BE's `localizedResponse.text`
     (e.g. "Booking blocked — consent required.") rendered prose.
   - **Consent requirement** — when blocked with a consent gate,
     lists the required scopes in a warning-tinted sub-card with
     copy "Granting consent is a signed, revocable artifact.
     Per-scope consent UI ships in Phase 11.8."
   - **Failed policies** — the policy IDs that gated execution
     (e.g. `policy.consent.required_for_regulated_action`).
   - **Plan** in a collapsible `<details>` with layer + step +
     status per row.
   - **Audit reference** — the orchestrationId without the
     `bos:orchestration:` prefix so a citizen can quote it back.

4. **Don't clear the textarea on submit.** The earlier behaviour
   cleared text on success so the user couldn't see what they had
   just sent. Keep it; add a [Clear outcome] ghost action next to
   Send when an outcome is live.

5. **Recent activity filter** unchanged — once the actorId lands
   on the orchestration via the shape fix, it naturally matches
   and the list populates.

## §15 bindings the design enforces

- **Honest about blocked.** When the orchestrator gates an action
  on consent, the citizen sees exactly which scopes are needed.
  No silent failure, no "please try again later."
- **Plan is visible.** Citizens can expand the plan to see every
  layer the request flows through (L8 intent_received → L7
  intent_normalized → L6 skill_selected → ...). Nothing hidden.
- **Audit reference exposed.** The orchestrationId is shown so
  citizens can match it against `/api/ledger` entries later.
- **No tracking ID leakage to third parties.** The card lives on
  the citizen's own device; the orchestrationId is the same one
  the audit ledger already records.

## Tests

1 new Vitest case in
[frontend/src/lib/use-send-intent.test.ts](../../frontend/src/lib/use-send-intent.test.ts)
pins the POST contract: the request body MUST carry `intentText`,
`actorId`, `locale` as flat keys, and MUST NOT reintroduce the
nested `intent` / `actionRequest` wrappers.

FE Vitest total: 32 → 33 (+1). No new Node tests (zero BE changes).
Spot-check on `orchestrator.test.mjs` + `api.test.mjs` shows 26/26
still passing.

Bundle: main 369 → 372 KB / 113 KB gzipped (+3 KB for the Outcome
card + extended Orchestration types). wllama lazy chunk unchanged
292 KB / 126 KB gzipped. Build 1.54s.

## Consequences

- The headline demo flow ("type intent → see what Bharat OS does")
  is now wired end-to-end on `/app/`. "Book a cab" surfaces a
  warning-toned card with the action label, the localised
  blocked message, the required consent scopes, the failing
  policy, and the audit reference. No more silent submits.
- The "/app/ grows, /shell/ retires" direction moves one step
  forward: the citizen orchestration flow no longer needs the
  /shell/ debug path to see what's happening.
- Phase 11.8 has an obvious shape now: per-scope consent grant
  UI launched from the Outcome card's consent block. Once that
  ships, "Book a cab" can flow blocked → grant consent → re-send
  → planned → completed end-to-end in /app/.
- The FE/BE shape contract is now pinned by a test. The earlier
  nested shape can't sneak back in via a refactor.

## What's NOT in this sub-phase

- Per-scope consent grant UI (Phase 11.8). The Outcome card
  surfaces the requirement but does not let the citizen grant
  the consent yet.
- Re-send on successful consent grant. Phase 11.8 will wire
  "grant consent → auto-re-send intent" so blocked → completed
  happens in a single flow.
- Voice intent input. The textarea accepts text only. /app/v2
  polish.
- Action-specific outcome UI (e.g. for `daily_brief`, render the
  composed brief; for `service_booking`, render the ranked
  marketplace results). v1 outcome card is template-generic.
- Multi-language outcome — `localizedResponse.text` already
  respects locale but the action-type labels + scope strings are
  English-only. i18n is Phase 12+ polish.

ADR 0126.
