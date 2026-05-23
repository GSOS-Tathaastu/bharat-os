# ADR 0065: Phase 2a.16 Demo Readiness Pass

## Status

Accepted

## Context

After 2a.15's polish pass the shell *layout* was investor-friendly,
but the *first 30 seconds* of the demo were still rough:

1. The suggestion chips offered only three short prompts per locale
   ("Book a cab", "Show me my health record", "I want a scheme") —
   honest but unconvincing. An investor would not see the range of
   §9C use cases unless they typed something themselves.
2. There was no onboarding. A first-time visitor saw a textarea and
   was expected to know what to do with it. The structure of the
   demo (intent → mesh ticker → more controls) had to be discovered
   by scrolling.
3. A Hinglish loan request — *"Mujhe ₹50,000 ka chhota karza
   chahiye"* — silently mis-classified as `mesh_storage` because the
   Hindi-Latin regex matched only `karz`, not `karza`/`karzaa`/
   `karja`. The user would never see this; the L7 flow just routed
   to the wrong template.

This pass closes those three gaps before any §7c vault encryption
work (2a.17), because demo readiness is what the investor sees first.

## Decision

### Richer suggestion chips

Each locale now offers six chips that exercise four distinct action
types: `regulated_onboarding` (loan), `service_booking` (cab,
hotel, train), `health_record_read` (HbA1c / health record), and
`scheme_delivery` (government scheme).

- **hi-IN**: small business loan, cab office → home, HbA1c record,
  hotel in Munnar, government scheme, train Bangalore → Hyderabad.
- **hi-Latn-IN**: same six in Roman-script Hindi.
- **mr-IN**: loan, cab, health record, hotel in Goa, scheme,
  Pune → Mumbai train.
- **ta-IN**: loan, cab, sugar-record, Ooty hotel, scheme,
  Bangalore → Chennai train.
- **bn-IN**: loan, cab, health record, Darjeeling hotel, scheme,
  Kolkata → Delhi train.
- **bho-IN**: loan, cab, health record, hotel, scheme, Patna → Delhi
  train.
- **en-IN**: ₹50K loan, cab office → home, health record, Munnar
  hotel, scheme, Bangalore → Hyderabad train.

Every chip verified end-to-end with `inferActionTypeFromNormalized`
to confirm correct routing before shipping.

### Hindi-Latin loan-intent regex hardened

`vernacular.mjs` regulated-onboarding alias broadened:

```js
/\b(bank|khata|khaata|loan|karz|karza|karzaa|karja|karjaa|kyc|business|nbfc)\b/i
```

Devanagari side also extended: `कारोबारी | कारोबार | व्यवसाय`
(business). 24 vernacular / orchestrator tests still pass; full
suite 201 / 201 green.

### First-run onboarding overlay

`#onboardingSheet` is a 3-step coach-mark shown once per browser
(localStorage key `bharat-os.shell.onboardingSeen.v1`). The steps:

1. **Speak or type any intent** — names the six languages and gives
   three example intents.
2. **Watch the §13B mesh ticker** — names the §7b binding (charging
   + WiFi gating) and explains demo mode bypasses it.
3. **More controls** — names the five collapsed surfaces and the
   diagnostics panel as the §17 honesty board.

Dismissed with *Got it* or *Skip*. A *Replay onboarding tour*
link added to the More controls section re-opens it on demand.

### Service worker

`CACHE_NAME` bumped `v11 → v12` for the new HTML, JS, and CSS.

## Consequences

- The first 30 seconds of an investor demo now narrate themselves.
  The overlay names the three things to try; the chips give six
  realistic prompts in the user's language; the §13B story is
  pointed at explicitly.
- No silent mis-classification on the most-likely investor prompt
  ("loan"). The patterns now cover the variants a real Hinglish
  user would write.
- The §17 honesty principle is preserved: the overlay tells
  investors where to find the diagnostics panel, not buried at the
  bottom of an unguided scroll.
- 201 / 201 tests green; SW cache to v12.

## Future polish

- Localize the onboarding sheet body itself (currently English-only
  even when the active profile is Tamil / Bengali / Bhojpuri).
- A *Try this* button on each suggestion chip that not only fills
  the textarea but auto-submits and scrolls to the result — turns
  the demo into a one-tap walkthrough.
- Highlight the §17 diagnostics row that matches the most recent
  action ("you just exercised L4 + §9B native marketplace") so the
  honesty board doubles as a live trace.
