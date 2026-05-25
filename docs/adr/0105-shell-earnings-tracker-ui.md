# ADR 0105: Phase 8.0 — Shell UI for the Earnings Tracker

## Status

**Accepted — shipped.** First UI commit in the Phase 8 arc that
surfaces the Phase 6.0a-c / 5.9 / 6.1 / 6.1b / 6.2 / 6.3 / 7.x
API work to actual users in `/shell/`.

## Context

The growth-arc work from Phase 5.9 onward is **all API-only**.
Phase 6.0a (earnings tracker), 6.0b (mesh dashboard), 6.0c (tax
helper), 5.9 (portable attestations — has a customer-side
`/sign/<token>` page, but no worker-side UI), 6.1 (MFI consent
issuance), 6.1b (UPI withdrawal), 6.2 (collective membership view),
6.3 (e-Shram + scheme entitlements), 7.x (push subscription opt-in)
— none of these have a worker-facing shell card. An investor demo
opening `localhost:8787/shell/` would see ~10 phases of
substrate work but zero user-visible features for them.

Phase 8.0 picks the foundational UI piece — the earnings tracker —
because (a) it's the simplest (just a form + a list); (b) it's the
foundation everything else builds on (MFI bundle reads earnings;
tax helper reads earnings; an empty earnings record makes Phase
6.1/6.0c demo as zeros); (c) it proves the API + UI integration
pattern that subsequent UI phases (8.1 mesh dashboard, 8.2 MFI
consent, 8.3 withdrawal, etc.) will follow.

## Decision

### New card on the Earn tab — `#earningsLogSection`

Inserted in `public/shell/index.html` between the existing mesh
node card and the federated-rounds card. Five form fields + two
action buttons:

- **Category** select: delivery / ride / service / cash / other
  (matches `EARNINGS_CATEGORIES` from `src/phase1/earnings-log.mjs`).
- **Amount (₹)** number input — submitted as paise via `Math.round(rupees * 100)`.
- **Hours (optional)** number input — 0-24, 0.5 step.
- **Date** date input — defaults to today, `max` is today (no
  future dates per Phase 6.0a validation).
- **Note (optional)** text input, maxlength 200.
- **Save** button → `POST /api/identities/:id/earnings`.
- **Monthly summary** button →
  `GET /api/identities/:id/earnings/summary?month=YYYY-MM`.

Below the form:

- A list of the worker's 30 most-recent entries with per-entry
  **remove** buttons (DELETE wires to the existing endpoint).
- A summary block that renders the API's `statement` field
  (Phase 6.0a's `monthlyStatement` output) when the worker taps
  "Monthly summary."

### `setupEarningsLog()` in `app.js`

Pure DOM + fetch — no new library. Follows the existing setup-
function pattern in `app.js` (`setupDpdp`, `setupPhoneOtp`, etc.):

- Uses `state.deviceOwnerId` to scope every API call to the
  current identity.
- Refreshes the list after every Save or Delete.
- Surfaces structured errors from the API in the card's `#earningsLogStatus`
  caption (e.g. `invalid_earnings_entry` → "date cannot be in the future").
- Escapes user-controlled text (notes) before injecting into HTML.

### `public/shell/styles.css` extended

New CSS rules for `.earnings-form`, `.earnings-row`,
`.earnings-list`, `.earnings-list-entry`, `.earnings-summary`.
Mobile-first: at < 380px viewport, form rows stack vertically.

### Service worker cache bumped to v30

Forces clients to re-fetch the new HTML + CSS + JS.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| User-typed data, not scraped | Card explicitly says "Type what you earned today — Bharat OS keeps a clean monthly summary you can show a landlord or MFI. Data stays on your device." Matches the API's no-scraping contract. |
| Identity-scoped | Every fetch uses `state.deviceOwnerId` from localStorage. Cross-user access impossible from the UI. |
| Integer paise on submit | Multiplied + rounded at the client; the API rejects non-integer paise (Phase 6.0a validation). |
| HTML escaping on note rendering | `escapeHtml(text)` is applied before any string interpolation. No XSS surface from user-controlled note text. |
| No new PII surfaces | Card displays the worker's own data. Nothing leaves the device beyond what the API already accepts. |

## Tests

**No automated browser tests added.** The codebase has no existing
browser-test infrastructure (the existing 747 tests are Node-only;
shell UI surfaces are verified manually per the existing pattern
in Phases 2a.25 / 2a.26 / 4.4 / 4.5).

Live smoke verification confirmed:

- `GET /shell/index.html` returns 200; HTML contains
  `earningsLogSection`, `earningsAmount` input, `earningsCategory`
  select.
- `GET /shell/styles.css` returns 200; contains the
  `.earnings-form` rule.
- All 747 Node tests still pass (no regression from the UI
  wiring).

## Consequences

- **A worker opening `/shell/` can now actually log earnings.**
  The investor demo path is: install → set up identity (Phase
  2a.26 wizard) → switch to the Earn tab → see the earnings card
  → log a delivery → see it appear in the list. The growth-arc
  primitive becomes user-visible.
- **Sets the UI pattern** for subsequent Phase 8.x cards.
  `setupEarningsLog` is small (~110 lines) and demonstrates how
  to wire any identity-scoped API endpoint into a shell card.
- **Backward-compatible.** Existing cards (mesh node, federated
  rounds, intent prompt, etc.) untouched. The earnings card just
  shows up between them.
- **Manual smoke is the only verification** — and that's
  honestly stated. Subsequent UI phases inherit the same caveat.

## Future polish

- **Per-platform breakdown chart** — pie/bar of monthly earnings
  by category. Today it's just numbers.
- **Locale-aware currency formatting** — currently `₹500.00`;
  Indian numbering would be `₹50,000.00` for ₹50K, `₹1,00,000`
  for ₹1L. `toLocaleString('en-IN')` is one line.
- **Bulk-paste / import** — Phase 6.0 future-polish item #1
  (OCR-based earnings ingestion). Today the worker types
  one row at a time.
- **Phase 8.1 — mesh-contribution dashboard UI** — promote the
  existing API to a first-class card matching the Phase 6.0b
  spec.
- **Phase 8.2 — MFI consent issuance UI** — the Trust tab gets
  a card to issue + manage income-verification consents.
- **Phase 8.3 — UPI cash-out UI** — the Earn tab gets a
  "Withdraw" card that calls `POST /api/identities/:id/mesh/
  withdrawals`.
- **Phase 8.4 — push subscription opt-in flow** — the Profile
  tab gets a card to register the browser Push subscription
  with `storeDeliveryKeys: true` (currently the user has no
  UI for this, which means Phase 7.0/7.1/7.2/7.3 push delivery
  doesn't actually fire in a fresh deploy).
- **i18n** — earnings card copy is English-only. Phase 4.5's
  `applyI18n` substrate exists; just needs the data-i18n
  attributes + translation entries.
