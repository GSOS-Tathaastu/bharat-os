# ADR 0161 — Phase 13.6: Public marketing pages

Status: Accepted
Date: 2026-06-02

## Context

Bharat OS is an investor-pitch MVP per [[bharat-os-mvp-for-investment]].
The substrate has shipped end-to-end across SLM-E/F/G/H and the
13.5 citizen data offer revenue line, but the existing `/` route
is the citizen onboarding flow (phone OTP → identity created)
— useful for demo users, but not what an investor visiting
the site wants to see first.

The user asked for "FE pages explaining about Bharat-OS for the
website" alongside the sequential phase continuation. This is
the right deliverable for the pitch: investors who follow a link
or QR code want to land on the story, not the signup.

## Decision

Ship 4 public marketing pages alongside the existing onboarding,
NOT replacing it. Public routes (no `ProtectedSurface` wrapper):

- `/about` — what Bharat OS is, founder thesis, market sizing
- `/how-it-works` — the 6 substrates + 5 §15 privacy invariants
  + 3-step distribution path (app → AOSP → full ROM)
- `/for-citizens` — citizen persona pitch (Use / Earn / Provide
  + data revenue + Sahayak path)
- `/for-sponsors` — sponsor persona pitch (labeling marketplace
  + federated rounds + citizen data marketplace + compliance)

Shared `MarketingLayout` wraps every page with a header (logo +
4-link nav + "Try the demo" CTA → `/`), a `<main>` content area,
and a footer (per-pillar columns + compliance posture + "Try
the demo" cross-link).

### Why public + alongside, not replacing onboarding

- The existing `/` flow is functional and tested. Moving it to
  `/start` or `/signup` would break a tested code path and any
  inbound demo links.
- Investors and demo users have different intents. Investors
  want story; demo users want to sign up. Each lands where
  they want via the link they followed.
- `Try the demo →` CTAs on every marketing page point back to
  `/` so the bridge is one click.
- The marketing nav's "Try the demo" button is the only
  surface mention of the existing onboarding from the public
  pages — clear separation of concerns.

### Why 4 pages, not 1 or 7

- 1 long landing page hides the substrate from readers who only
  scan headings. Investors typically scan.
- 7+ pages (separate /pricing, /team, /contact, /press) is
  over-scoped for an MVP. /pricing and /team would carry
  forward-looking claims that need legal review per the
  [[citizen-data-as-product-revenue]] binding.
- 4 pages map to the 4 conversation modes an investor lands in:
  vision (`/about`), tech (`/how-it-works`), citizen pitch
  (`/for-citizens`), sponsor pitch (`/for-sponsors`).

### Adversarial review fixes applied in-phase

Inline 3-lens pass (privacy / accuracy / accessibility). The
pages don't access citizen data — privacy is trivially safe.
The risks are factual accuracy and accessibility:

- **MF-1 — "no PII required" was misleading.** ForCitizensPage
  claimed "Sign up takes 30 seconds (phone OTP, no PII
  required)". Phone numbers ARE PII under DPDP. Re-worded to
  "Your number is the only personal field we collect at this
  stage — everything else (name, email, KYC documents) is
  opt-in per surface and gated by signed consent."
- **MF-2 — "open-source" claim removed.** The repo doesn't
  carry a LICENSE file at root yet, so claiming the substrate
  is open-source overstated reality. Replaced with
  "Strict-allowlist boundary normalisers" in the footer
  posture column; removed "The whole thing is open-source"
  from the HowItWorksPage subtitle.
- **SF-1 — `aria-label="Marketing site navigation"`** added
  to the marketing nav for screen-reader clarity.
- **SF-2 — `<Badge variant="warning">Planned</Badge>`** added
  to the 3 Distribution cards (App PWA+TWA, AOSP shell, Full
  ROM) so investors don't read them as already-shipped. The
  6 substrate cards above carry `Shipped` badges; the
  distinction is now visually clear.

## What the pages claim (factual ground truth)

Every concrete claim is backed by a shipped artifact:

| Page claim | Backed by |
|---|---|
| Phi-3-mini / Gemma-2B / Qwen2-1.5B class SLMs via wllama | Phase 9.0c (ADR 0114) |
| ~2.3 GB on disk, ~2.8 GB RAM while running | installed-slm.test.mjs fixture |
| 11 Indian PII classes | Phase 13.1 |
| 3 SLM-H skills with allowlisted action verbs | Phase 13.4 / 13.4.1 / 13.4.2 / 13.4.3 |
| 5 data point kinds × 6 sponsor purposes | Phase 13.5 enums |
| Per-data-point sale + revocation + DPDP cascade | Phase 13.5 (ADR 0160) |
| Sponsor escrow + Ed25519 audit signer | Phase 10.5 |
| 4-link defence-in-depth chain | Phase 13.4.3 (ADR 0159) |
| BC ecosystem (Snabit, Pronto, PayNearby, Eko, Spice, Fino) | [[sahayak-no-smartphone-onboarding]] |
| Bharat OS provider marketplace (not Ola/Uber) | [[service-booking-native-not-ola-uber]] |
| Earn / Use / Provide trio | [[onboarding-hero-earn-use]] |
| App → AOSP → Full ROM distribution path | [[distribution-app-first-os-later]] |

## Consequences

- An investor or partner clicking on a Bharat OS link now lands
  on a story page, not a signup. Story-first.
- The existing onboarding flow stays intact; demo users follow
  the same path. No regressions.
- Marketing copy is now committed to the repo + tracked under
  ADR + carries adversarial-review verification. Future copy
  changes follow the same governance.
- Future sub-phases (13.6.1+) can add: a /pricing page once
  legal review per the [[citizen-data-as-product-revenue]]
  binding clears; a /team page once team is hired; a /demo
  video embedded into HowItWorks once a video is recorded.

## Tests

- `frontend/src/routes/marketing.test.tsx` — 10 cases. Render
  smoke tests: headings present, marketing nav exposes all 4
  links with correct hrefs, "Try the demo" CTAs link to `/`,
  the 6 substrate cards render on HowItWorks, the 5 §15
  privacy invariants render, the 3 modes (Use / Earn / Provide)
  + 5 data point kinds render on ForCitizens, Sahayak section
  + 700M-without-smartphones claim renders, the 3 sponsor
  surfaces (labeling / federated / citizen data marketplace)
  render on ForSponsors, DPDP + RBI/NPCI compliance posture
  surfaces on ForSponsors.
- Full sweep at commit time: 500 vitest + Node sweep clean +
  tsc clean.

## Follow-ups (deferred)

- A landing-page hero animation showing the wllama runtime
  streaming on-device (recorded GIF).
- /pricing page once legal review per
  [[citizen-data-as-product-revenue]] clears.
- /team + /contact pages once Bharat OS hires beyond the solo
  founder per [[founder-solo-bharat-os]].
- SEO meta tags (title / description / og: / twitter:) — Vite
  Helmet plugin would be the right tool but is deferred until
  hosting + analytics decisions are made.
- A LICENSE file at repo root before re-asserting "open-source".
