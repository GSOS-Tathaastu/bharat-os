# ADR 0077: Phase 2a.25 — Shell UX Overhaul (Bottom-Tab Navigation + Plain-Language Copy)

## Status

Accepted

## Context

By Phase 3.2 the shell had accumulated ~10 surfaces — prompt card,
flow, result, mesh ticker, Trust Passport, federated rounds, recent
activity, pairing, profile-auth, worker alerts, health doc, flag
report, diagnostics. All on one scroll. The Phase 2a.15 polish pass
collapsed the auxiliary surfaces into a `<details>` block, but the
remaining above-the-fold cards still competed for the user's
attention.

Two specific UX problems:

1. **Visual overload.** First-screen content was prompt card + mesh
   ticker + Trust Passport + federated card + recent activity +
   more-controls + diagnostics. A user looking for *"how do I send
   an intent?"* had to parse five distractions first.
2. **Jargon-heavy copy.** User-facing copy referenced section codes
   from the canonical doc (§13B fair-use lever, §7c device pairing,
   §9A flag, §15 selective disclosure, §7f opt-in training). These
   are great for investors reading alongside `BHARAT_OS.md`; they
   are intimidating noise for actual users.

The founder feedback was direct: *"Bharat OS application is not very
intuitive or user-friendly."*

## Decision

### Bottom-tab navigation — the dominant mobile UX pattern in India

Every successful Indian super-app (Paytm, PhonePe, WhatsApp,
Swiggy, Zomato) uses a 4-5 tab bottom navigation. Adopting the
same idiom collapses the shell's surface area into four focused
contexts:

| Tab | Owns | Replaces |
|---|---|---|
| 🏠 **Home** | intent input, flow + result, recent activity | the whole single-scroll prompt → result loop |
| 💎 **Earn** | big "Earned today" hero + mesh ticker + federated rounds | the mesh card + federated card cluster |
| 🛡️ **Trust** | Trust Passport + verifier preview + sign &amp; share | the Trust Passport card with cleaner framing |
| 👤 **Profile** | identity hero + pairing + passkey + alerts + health doc + flag report + diagnostics | the "More controls" `<details>` block |

Implementation: existing sections wrapped in `.tab-panel`
containers; sections move only across tabs, no logic changes. **All
element IDs preserved**, so the existing JS for mesh / pairing /
trust / federation / etc. continues to work without modification.

### Tab-switching JS

Minimal — ~50 lines added at the bottom of `app.js`:

- `setActiveTab(name)` — toggle `.hidden` on each `.tab-panel` and
  `.active` on the matching `.bottom-nav-tab`. Scrolls to top so
  the user lands at the header.
- `setupTabs()` — wires the bottom-nav clicks, hooks the
  Profile-tab *"Switch / add profile"* link to the existing
  `profileButton`, and restores the last-used tab from localStorage
  (`bharat-os.shell.activeTab.v1`).
- `sendIntent` dispatches `bharat-os:intent-resolved` so any future
  cross-tab intent shortcut auto-returns to Home for the result.

### Profile hero — mirrors the topbar profile chip

A new `.profile-hero` block at the top of the Profile tab shows
avatar + display name + locale. Updates whenever `setActiveProfile`
runs, via the new `updateProfileHero(identity)` helper. Two ways to
see "whose Bharat OS this is" (topbar always; Profile tab when
viewing).

### Plain-language copy throughout the user-facing surfaces

| Old (jargon) | New (plain) |
|---|---|
| §13B fair-use lever | Earn while charging |
| Mesh node — §13B fair-use lever | 💎 Share compute &amp; storage |
| §7c device pairing | Move to a new phone |
| §9A flag report | Report a problem |
| Profile security | 🔑 Sign-in security |
| Worker alerts | 🔔 Job alerts |
| Trust Passport — what a verifier would see | 🛡️ Your verified profile |
| §7f opt-in training | 🧪 Help improve the AI |
| Show me what a landlord would see | Preview what they'll see |
| Sign &amp; share | Create &amp; share |
| What's running, what's scaffold | 🔬 Behind the scenes |
| §15 binding citations | (moved into "How this works" expandables) |

The §XX codes still live in source-code comments, ADRs, and the
operator console — those are the right audiences for them. The
end-user shell now reads in everyday language.

### Progressive disclosure for the "Why?"

Each card that previously carried a `<p class="diagnostics-note">`
with section-code citations now has a `<details class="why-details">`
collapsible labelled *"How this works"*. The technical detail is
one tap away for the curious user; hidden by default for the new
user. Same pattern for:

- Result card → `<details class="result-evidence-details">` for
  orchestrationId / decisionId / auditHash
- SLM load → `<details class="slm-details">` so the 120MB-warmup
  prompt doesn't crowd the prompt card on first run

### Onboarding overlay rewritten

Four-step tour mapping cleanly to the four tabs:
1. 🏠 Home — *"tell your phone what you want"*
2. 💎 Earn — *"your phone makes money in the background"*
3. 🛡️ Trust — *"share verification without sharing data"*
4. 👤 Profile — *"your identity, your settings"*

Each step uses concrete intent examples in multiple scripts
(Devanagari, Latin Hindi, English) so the multi-language story is
visible from the first impression.

### Visual polish — minimal but deliberate

- **Earn hero card** — big ₹ today value (42px, mono, orange),
  gradient background, clear "what is this?" subline
- **Profile hero card** — large round avatar (64px), display name,
  one tap to switch
- **Bottom nav** — fixed-position, backdrop-blur, accent-coloured
  active state, safe-area-inset-bottom padding for iPhone notch
  (even though iOS is §15-out-of-scope, the inset matters for
  Android edge-to-edge displays too)
- **Tab fade-in** — 180ms `tab-fade-in` animation on tab switch
- **Shell bottom padding** — bumped to `88px + safe-area` to leave
  room for the fixed nav without obscuring the last card

## Tests

`tests/node/api.test.mjs` updated for the renamed copy strings
(*"Profile security"* → *"Sign-in security"*, *"Worker alerts"* →
*"Job alerts"*).

Full suite: **280 / 280 green** (unchanged). Live sanity check
boots a fresh seeded store, confirms:
- All four `.tab-panel` blocks render
- Bottom nav with 4 buttons present
- CSS serves with new `.tab-panel`, `.bottom-nav`, `.earn-hero`,
  `.profile-hero` rules
- JS includes `setupTabs`, `setActiveTab`, `LS_KEY_ACTIVE_TAB`

SW cache to v22.

## §15 bindings — what changed

Nothing. This is purely a copy + layout pass. Every artifact, every
signature, every consent gate is unchanged. The §15 bindings are
still enforced exactly the same; they're just no longer cited by
section code in the user-facing copy. A user who taps *"How this
works"* on the Earn card reads the same factual content (charging
+ WiFi gating, signed contribution events, fiat UPI payouts) in
plain language.

## Consequences

- **First-screen experience is one focused surface, not seven.**
  Home opens with the prompt as the dominant element; everything
  else lives in its own tab the user navigates to deliberately.
- **The §1 promise reads as user-friendly, not academic.**
  *"Tell your phone what you want · earn while charging · share
  verification without sharing data · your identity, your
  settings"* — four short verbs, no doc citations.
- **Investor demo still works at the same depth.** The "How this
  works" expandables surface the §15 / §13B / §7c / §7f framing
  on demand. An investor watching the demo can tap through to see
  the architecture; a user trying to book a cab doesn't have to.
- **Operator console untouched.** `/console/` remains the
  ops-jargon surface. The split is now clean: `/shell/` = user
  context, `/console/` = ops context. Same `/api/*` underneath.
- **280 / 280 tests green**, no API changes, SW cache to v22.

## Future polish

- **Tab badges** — show a dot on the Earn tab when a federated
  round is joinable that matches the user's profile; on Trust when
  an attestation is expiring soon.
- **Per-tab keyboard shortcuts** — `Cmd/Ctrl + 1..4` to switch
  tabs (web only; Phase 2b Android wraps as a TWA where this is
  irrelevant).
- **Pull-to-refresh** on Home (mobile) so the Recent list updates
  without tapping *Refresh*.
- **Localize the tab labels** — *"Home / Earn / Trust / Profile"*
  in the active profile's language. Templates exist for the
  greeting / suggestions; same primitive applies.
- **Per-locale onboarding text** — currently the tour is English
  even for non-English profiles. Translation pass.
- **Lazy-load tab content** — defer `loadMeshSummary` /
  `loadTrustPassport` / `loadFederatedRounds` until the user
  actually switches to those tabs, instead of firing on every
  `setActiveProfile`. Small perf win on first profile load.
