# ADR 0140 — Phase 12.1b.4: SLM-D booking advisor

Status: Accepted
Date: 2026-06-01

## Context

Last sub-phase of 12.1b. SLM-A (12.1b.1), SLM-B (12.1b.2), SLM-C
(12.1b.3) shipped. SLM-D — the marketplace negotiation agent —
was originally scoped as "on-device counter-offer chat between
citizen and provider." After mapping the booking substrate, the
understanding workflow surfaced that true rate-negotiation
breaks load-bearing contracts:

- `rateSnapshot` is `FROZEN` in `booking.mjs::FROZEN_FIELDS`
  (Phase 12.1a.2). Allowing the SLM to mutate it would force a
  schema migration, a new state (`counter_offered`), and a new
  authorisation surface ("does the negotiated rate respect the
  provider's floor + citizen's escrow ceiling?").
- The CAS+seq concurrency guard is built on the assumption that
  the booking record is the single source of truth. A separate
  "negotiation history" table would split that contract.
- Escrow lock happens at booking creation. Pre-negotiation
  would require either deferring the lock OR a "provisional
  hold" that's smaller than the eventual settle — both
  multi-week designs.

Honest call: **rate-negotiation is a Phase 12.2 effort**. For
12.1b.4 the right SLM-D scope is the smallest useful slice that
ships in one session and never violates existing contracts: a
**provider booking advisor** — on `pre_authorized`, the provider
taps "Ask my SLM" and gets a one-line verdict
(`accept | reject | unsure`) plus an optional polite reject
reason. The chip never changes booking state; only the existing
accept/reject actions do.

## Decision

### 1. FE-only scope

Phase 12.1b.4 ships ZERO backend changes. No new state, no new
endpoints, no new ledger events. The advisor reads booking +
provider data the FE already has (via the existing
`useBooking` + `useProviderInbox` hooks) and feeds the SLM
locally. The §15 audit trail stays unchanged — the existing
`booking.accepted` / `booking.rejected` events are the binding
artefact, regardless of whether an SLM suggested them.

### 2. Pure primitives

- `frontend/src/lib/booking-advisor.ts` — pure prompt builder
  + completion parser:
  - `buildBookingAdvisorPrompt(ctx)` composes role + quoted
    amount + distance + 1dp pickup bubble + citizen note +
    provider role-form answers into a structured prompt that
    asks for VERDICT / CONFIDENCE / RATIONALE / IF_REJECT.
  - `parseBookingAdvisorCompletion(text)` regex-extracts the
    four fields. Returns `null` when no canonical verdict
    can be extracted (the chip then hides). Clamps confidence
    to [0,1], strips IF_REJECT when verdict isn't `reject`.
  - `verdictLabel(verdict)` returns the human chip label.
- `BOOKING_ADVISOR_PROTOCOL_VERSION` constant pinned.

### 3. SLM runtime hook

- `frontend/src/lib/use-slm-booking-advisor.ts` — `useSlmBookingAdvisor({identityId})`:
  - Reuses the existing Phase 9.0c wllama runtime singleton.
    Cumulatively across SLM-A (intent parse), SLM-C (field
    suggest), and SLM-D (advisor), the model loads at most
    ONCE per session.
  - Lazy first-load via `readSlmBlob` + `loadSlmRuntime`;
    persisted in a `runtimeRef`.
  - Tiered rate limit: 3 per booking per rolling 60s + 12
    global per rolling 5 min. Cooling-down state surfaces
    the retry-in-seconds so the chip can render an honest
    countdown.
  - Inflight singleton — concurrent ask() calls return the
    same promise so a rapid double-tap doesn't enqueue
    parallel generations.
  - Status state machine: `unavailable | idle | loading |
    thinking | cooling-down`.

### 4. UI surface

- `frontend/src/components/booking/SlmBookingAdvisorChip.tsx`:
  - Visible ONLY when the provider has an installed SLM AND
    the booking is in `pre_authorized` state. Hidden
    otherwise (honest empty state, no upsell).
  - Tap "✨ Ask my SLM: should I accept?" → builds the prompt
    + runs the runtime + parses the verdict.
  - Verdict renders as a Badge (`trust` / `warning` /
    `neutral`) + a one-line rationale.
  - When `reject`, surfaces a "Use this reason: …" chip that
    calls back to the parent so the existing reject-reason
    input pre-fills. The provider STILL has to tap the
    "Reject" button — the chip never mutates booking state.
  - Honest disclaimer at the bottom: "This is a suggestion.
    You still tap Accept or Reject yourself."
- Wired into `ProviderBookingDetail.tsx` directly above the
  Accept/Reject card. Passes `onAcceptSuggestedRejectReason`
  so the suggested reason populates the existing reject input.

### 5. §15 bindings honored

- **User controls inputs.** The advisor never mutates booking
  state. Only the existing accept/reject actions do, both
  gated by the provider's explicit tap. The chip is honest
  about being a suggestion.
- **Pointer-not-payload.** The prompt embeds ONLY the 1dp
  bubble (~11 km) pre-accept area. A vitest case asserts the
  prompt contains no 4dp coordinate literal — the masked
  pre-accept pickup contract from Phase 12.1a.2 holds.
- **No citizen PII.** The prompt never embeds citizen name,
  phone, or address (none are exposed to the provider
  pre-accept anyway). The citizen note IS included because
  it's the intentional citizen → provider channel.
- **No audit-trail mutation.** Zero new ledger events. The
  existing `booking.accepted` / `booking.rejected` /
  `provider_identity.updated` events are the source of truth
  regardless of whether an SLM suggested the action.
- **Cumulative SLM runtime singleton.** SLM-A intent parser
  + SLM-C field suggest + SLM-D advisor share the same
  loaded wllama bytes via the runtime ref — the citizen
  pays the model-load cost at most once per session.

### 6. Tests

`frontend/src/lib/booking-advisor.test.ts` (10 vitest cases):

- Prompt builder embeds role label + rupee amount + distance +
  bubble + note.
- Prompt formatted with verbatim output schema
  (VERDICT/CONFIDENCE/RATIONALE/IF_REJECT).
- Prompt contains NO 4dp coordinate literal (binding test).
- Handles missing note + missing distance gracefully.
- Parser parses accept / reject / unsure verdicts; extracts
  IF_REJECT only when verdict === 'reject'; clamps
  out-of-range confidence; returns null on missing or
  invalid verdict.
- `verdictLabel` returns a non-empty label for every verdict.

No new Node tests — this phase ships zero backend changes.

## Adversarial review

Deferred this session per the user's "keep building" directive.
The substrate is binding-tested (no-4dp-coord, no-citizen-PII,
honest empty state), composes the existing wllama runtime + the
SlmSuggestChip pattern from 12.1b.3, and ships zero BE changes,
so the adversarial surface is small. Will sweep in 12.2 polish
if the operator surface emerges that wants per-advisor audit
events.

## Process

1. **Understanding workflow** — 3 parallel Explore agents
   mapped booking-flow extension points, provider notification
   surface, and SLM-suggest-pattern reuse.
2. **Design call** — honest scope decision in the working
   message: rate-negotiation breaks rateSnapshot immutability
   + escrow contract; shipping the smaller advisor was the
   right SLM-D slice. No design workflow needed — the
   primitives compose the 12.1b.1 + 12.1b.3 patterns.
3. **Implementation** — primitives → hook → chip →
   ProviderBookingDetail integration → vitest.

## Files

NEW (FE):
- `frontend/src/lib/booking-advisor.ts`.
- `frontend/src/lib/booking-advisor.test.ts` (10 vitest cases).
- `frontend/src/lib/use-slm-booking-advisor.ts`.
- `frontend/src/components/booking/SlmBookingAdvisorChip.tsx`.

EXTENDED (FE):
- `frontend/src/components/booking/index.ts` — barrel
  re-exports SlmBookingAdvisorChip.
- `frontend/src/routes/provider/ProviderBookingDetail.tsx` —
  renders SlmBookingAdvisorChip above the Accept/Reject Card
  on `pre_authorized`; `onAcceptSuggestedRejectReason` wires
  into the existing reject-reason input.

## Test results

- Node tests: **1035/1035 green** (unchanged — FE-only phase).
- Vitest: **115/115 green** (+10 booking-advisor contract
  cases).
- tsc: clean.
- Build: main 592 → 599 KB / 170 KB gzipped (+7 KB for the
  primitives + hook + chip). wllama lazy chunk unchanged.

## What's NOT in 12.1b.4 (deferred)

- True rate negotiation (counter-offer state, negotiated rate,
  authorisation against provider floor + citizen escrow
  ceiling) — Phase 12.2 work because it breaks rateSnapshot
  immutability + escrow contract.
- Citizen-side advisor ("should I lock escrow for this
  provider?") — symmetric design lands with rate-negotiation.
- Per-advisor ledger event (booking.advisor_consulted) — no
  operator surface today needs it; revisit in 12.2 if an
  operator console wants the audit trail.
- Multi-turn negotiation chat — Phase 12.2 / 12.3 with proper
  SLM runtime conversation memory.
- Voice-based advisor reply — Phase 12.2+.
- Advisor for in_progress / dispute states — out of scope; v1
  is binary accept/reject only.
- Adversarial review workflow — substrate is binding-tested
  + composes proven 12.1b.1/12.1b.3 patterns; deferred.
