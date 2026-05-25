# ADR 0106: Phase 8.1 — Shell UI for the Mesh-Contribution Dashboard

## Status

**Accepted — shipped.** Second UI commit in the Phase 8 arc. Wires
Phase 6.0b's `GET /api/identities/:id/mesh/summary?month=YYYY-MM`
endpoint into a worker-facing card on the Earn tab.

## Context

Phase 6.0b shipped `aggregateMeshByMonth` + the
`/mesh/summary?month=` endpoint that returns:

```json
{
  "summary": {
    "month": "2026-05",
    "totalPaise": 1050,
    "totalRupees": 10.50,
    "eventCount": 35,
    "byWorkload": { "inference": 800, "storage_serve": 0, "storage_store": 0, "federated_round": 250 },
    "dailyTimeline": [{ "date": "2026-05-01", "paise": 200, "eventCount": 5 }, ...],
    "firstEventAt": "...", "lastEventAt": "..."
  }
}
```

But until now, the only worker-facing surface for mesh earnings
was the real-time ticker on the existing `#meshNodeSection` card —
"Earned today" + a few per-tick events. The monthly retrospective
(how much across the whole month, broken down by workload type
+ day) had no UI.

Phase 8.1 ships the card. Sits between the real-time mesh node
section and the Phase 8.0 earnings tracker on the Earn tab, so
the layout reads:

```
[ "Earned today" hero — real-time aggregate ]
[ 💎 Share compute & storage — real-time per-tick ticker ]
[ 📊 Your mesh earnings this month — Phase 8.1, monthly retrospective ]
[ 📒 Log your earnings — Phase 8.0, manual cross-platform entries ]
[ 🧪 Help improve the AI — federated rounds ]
```

## Decision

### `#meshDashboardSection` card on the Earn tab

Inserted in `public/shell/index.html` between `#meshNodeSection`
(real-time ticker) and `#earningsLogSection` (Phase 8.0). Card
layout:

- **Header**: "📊 Your mesh earnings this month" + status caption
  showing the current month label.
- **Controls row**: month picker (`<input type="month">` defaulting
  to current month, `max` set to current month — no future months)
  + Refresh button.
- **Headline block**: large total `₹X,XXX.XX` in the
  Bharat-OS-accent green + secondary line "N working days · M events"
  (or "No events yet" when empty).
- **Per-workload breakdown**: collapsed to only the categories
  with nonzero payouts — `🧠 Inference`, `💾 Storage serve`,
  `🗄️ Storage store`, `🧪 Federated rounds`. Each row shows the
  emoji-labelled type + the rupee amount.
- **Daily timeline**: mini bar-chart with one row per day. Each
  row has the date (MM-DD), a horizontal bar scaled to the
  month's max, and the rupee amount right-aligned.
- **"What is mesh contribution?"** details collapsible explaining
  the Phase 3.x substrate + payout model.

### `setupMeshDashboard()` in `app.js`

~120 lines. Follows the same pattern as Phase 8.0's
`setupEarningsLog`:

- Pure DOM + fetch, no new library.
- `state.deviceOwnerId` scopes every call.
- Re-renders on month change OR Refresh button click.
- Calls `refresh()` once at startup so the card is populated when
  the worker switches to the Earn tab.
- HTML-escapes everything user-controlled (workload labels are
  module-level constants but escaping is applied as a defence
  against future schema additions).
- `formatRupees(paise)` uses `toLocaleString('en-IN', ...)` — Indian
  numbering (`₹50,000.00`, `₹1,00,000.00` for lakh).

### CSS rules

New rules in `public/shell/styles.css`:

- `.mesh-dashboard-headline` — green gradient panel for the total.
- `.mesh-dashboard-total` — 32px, tabular-numeric, accent colour.
- `.mesh-dashboard-breakdown-row` — flat grid layout per workload.
- `.mesh-dashboard-timeline-row` — three-column grid (date, bar,
  amount); the bar is a `min-width: 2px` div with `width: <pct>%`
  inline-styled per row so it scales to the month's max.

### Service worker cache → v31

Forces refresh of `index.html` + `app.js` + `styles.css`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Identity-scoped | Every `/api/identities/:id/mesh/summary` call uses `state.deviceOwnerId` from localStorage. Cross-user inspection is impossible from the UI. |
| Aggregates only — no per-event detail in the UI | Bar chart shows per-day totals + counts; never the underlying per-tick events. Worker can still drill into raw events via the existing API if they want, but the card surfaces aggregates. |
| HTML escaping on workload labels | `escapeHtml` applied even though the labels are server-defined constants — defence-in-depth against schema additions. |
| No new PII surface | The summary already contains only aggregates (totalPaise, dailyTimeline, workload counts). The UI just renders what the API gave it. |

## Tests

**No automated browser tests added** — same pattern as Phase 8.0.

Live smoke verification:

- `GET /shell/index.html` 200; contains `meshDashboardSection`,
  `meshDashboardMonth`.
- Seeded 5 inference events (1M tokens each = ₹16 = 1600 paise
  each) and confirmed `/mesh/summary?month=2026-05` returns
  `totalPaise: 8000` + 5 daily timeline rows. The UI would
  display "₹80.00" + 5 daily bars.
- All 747 Node tests still pass.

## Consequences

- **The Earn tab now shows a monthly retrospective.** A worker
  who's been earning mesh contributions for 3 months can scroll
  through months via the picker, see per-day variance, and
  understand which workloads (inference vs. storage vs.
  federated) are paying out.
- **Investor demo gets a visible "compounding earnings"
  narrative.** The earlier "Earned today" hero is real-time but
  small; "Your mesh earnings this month" with a daily bar chart
  is the visual that makes the substrate's payout story tangible.
- **Pattern reuse: `setupMeshDashboard` mirrors
  `setupEarningsLog`.** Subsequent Phase 8.x cards (MFI consent,
  UPI cash-out, push opt-in) will follow the same shape: fetch
  identity-scoped, render via DOM, refresh on user interaction.
- **Backward-compatible.** No existing card changed. The new card
  just renders between two existing ones.

## Future polish

- **Year-to-date selector** — alongside the month picker, a
  "Last 12 months" view that sums across months. Useful for the
  Phase 6.0c tax helper context.
- **Per-day drill-down** — tapping a daily-timeline row could
  open a list of the underlying events from that day.
- **Sparkline** — a tiny sparkline next to the headline total
  showing the last 30 days at a glance.
- **Phase 8.2 — MFI consent issuance UI** — next Phase 8 step.
  Card on the Trust tab that lets the worker generate an
  `income_verification_consent` for a named MFI.
- **i18n** — workload labels (`🧠 Inference`, etc.) and the card
  copy are English-only. Phase 4.5's `applyI18n` substrate exists;
  data-i18n attributes would localise them.
- **Caching** — currently every Refresh round-trips to the
  server. A 60s client-side cache would feel snappier.
