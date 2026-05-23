# ADR 0059: App Handoff as a Third §9B Mode (Respect Pre-Existing User Loyalty)

## Status

Accepted

## Context

§9B established two booking modes: the Bharat OS native L6 marketplace
(`bharat_marketplace`) and the ONDC bridge (`ondc_beckn`). The doc
explicitly rejected "wrap Uber / Ola / MakeMyTrip" because that pattern
either fights the apps' UI (AGI Inc.'s ~50-step ceiling) or pretends to
be the marketplace while routing through someone else's API.

What the doc was silent on: the user may **already have Uber, Ola,
Rapido, Namma Yatri, MakeMyTrip, OYO, IRCTC, Swiggy, Zomato,
BigBasket, or Blinkit installed**. Forcing them to abandon those apps
is disrespectful and unrealistic. The "what if I already use Uber?"
question is the most common one investors and pilot users ask.

The distinction is subtle but binding: **wrap** captures the customer
and transacts through Bharat OS while pretending to be the marketplace
— that is rejected. **Handoff** is transparent ("opening Uber for
you"), passes intent to the user's preferred app via a documented deep
link, and does NOT route money through Bharat OS — that is allowed and
should be one of the modes the service marketplace exposes.

## Decision

Phase 2a.10 adds a third mode to the L6 service marketplace receipt.

### App handoff registry in `src/phase1/tools.mjs`

`APP_HANDOFF_REGISTRY` is a per-vertical table mapping known consumer
apps to (a) a deep-link URI builder that pre-fills the route / query,
and (b) a web-fallback URL that opens the app's website if the app
isn't installed. Covered apps today:

- **cab**: Uber, Ola, Rapido, Namma Yatri
- **hotel**: MakeMyTrip, OYO, Booking.com
- **ticket**: IRCTC, MakeMyTrip
- **food**: Swiggy, Zomato
- **grocery**: BigBasket, Blinkit
- **services**: Urban Company

The list is intentionally non-exhaustive. Adding an app is one PR.

### Receipt shape

Both `bharat_marketplace` and `ondc_beckn` receipts now carry
`appHandoffs: HandoffEntry[]` where:

```
{
  app: 'uber',
  label: 'Uber',
  uri: 'uber://?action=setPickup&pickup[nickname]=...&dropoff[nickname]=...',
  webFallback: 'https://m.uber.com/looking?...',
  transactsThroughBharatOS: false
}
```

The `transactsThroughBharatOS: false` field is the binding distinction
between handoff and wrap — Bharat OS is explicit that no payment flows
through it for these entries. (The `payment.uri` UPI deep link from
ADR 0050 is a separate field for the native / ONDC booking; the two
coexist on the same receipt.)

### User preference signal

A caller can pass `metadata.preferredApps: ['ola']` to filter the
handoff list down to the user's preferred app(s). The intended seam:
the L7 orchestrator reads this from L5 memory (the user's recorded
preferences across past bookings) and threads it into the request. For
the current iteration the seam exists; persisting the learning is a
future increment.

### Shell rendering

`/shell/` now renders the native booking action *first* (substrate-
ownership stays §15-binding), then below it a row labelled *"Or open
in your app: Uber · Ola · Namma Yatri · …"* with one button per
handoff. A click handler watches `document.visibilityState`: if the
page stays visible for ~1.5 seconds after the click (= app didn't
open), it navigates to the web fallback. This is a best-effort
heuristic — there is no reliable cross-browser "did the app open" API
— but it catches the common case where the user doesn't have the app
installed.

### §9B doc update

§9B gained a new subsection *"A third mode: app handoff (the user's
already-installed app)"* with a four-row table disambiguating
wrap / handoff / native / ONDC bridge along customer-capture,
transacts-through-bharat-os, aggregator-licensing-exposure, and
pattern axes. The "Why not just wrap Uber" rejection in the same
section is left intact — handoff is a different pattern, not a
loophole.

## Consequences

- The shell now answers the *"what if I already use Uber?"* question
  respectfully: the same voice intent surfaces the 0%-commission
  native driver, the ONDC option, **and** a one-tap Uber/Ola/Namma
  Yatri handoff in a single result card.
- Bharat OS does not transact when the user picks a handoff — no
  aggregator-licensing exposure for that flow, no card / UPI capture,
  no PII collection beyond what the user types into the chosen app.
- The handoff URIs are best-effort. Exact deep-link schemes vary by
  app version, OS, and region; some apps don't publish them. The web
  fallback always works and is the safety net.
- The seam for L5-memory-driven preference learning exists
  (`metadata.preferredApps`); persisting and updating that signal as
  the user picks apps repeatedly is a future increment.
- The diagnostics panel does not need a new row — the handoff is part
  of the existing 2a.9 (now refreshed as 2a.10) marketplace mode rather
  than a separate runtime — but the §9B doc table is the canonical
  reference.

## Future hardening

- Persist `preferredApps` to L5 memory automatically when the user
  picks the same handoff three times in a row, similar to how a smart
  assistant learns *"the user always picks Ola for cabs in Bangalore."*
- Add more apps as users in pilot regions report they use them
  (Bounce, Yulu, Quick Ride, Meru, Easy Cabs, etc.).
- Surface the handoff URI scheme robustly via Android App Links /
  iOS Universal Links rather than legacy `uber://` schemes when the
  app supports them — better fallback behavior.
- Add a per-handoff *"don't show this app again"* toggle so users can
  prune the list to their actually-used apps.
