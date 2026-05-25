# ADR 0109: Phase 8.3 — Shell UI for UPI Cash-Out

## Status

**Accepted — shipped.** Fourth UI commit in the Phase 8 arc. Wires
Phase 6.1b's mesh-withdrawal endpoints into a worker-facing card on
the Earn tab.

## Context

Phase 6.1b (ADR 0098) shipped the UPI cash-out substrate:

- `GET /api/identities/:id/mesh/balance` — returns
  `{ availablePaise, unsettledEventCount, minWithdrawalPaise }`.
- `POST /api/identities/:id/mesh/withdrawals` — body `{ upiId }`;
  bundles ALL unsettled events into a signed withdrawal request.
- `GET /api/identities/:id/mesh/withdrawals` — worker's history.
- Admin endpoints (Phase 5.7-gated) for state transitions.

But no shell UI. A worker had to curl their balance + craft the
POST themselves. Phase 8.3 puts the worker-facing card on the
Earn tab between the Phase 8.1 mesh dashboard and the Phase 8.0
manual earnings log. The Earn tab now flows:

```
"Earned today" hero            ← Phase 1.x real-time
💎 Share compute & storage     ← Phase 3.x real-time ticker
📊 Mesh earnings this month    ← Phase 8.1
🏧 Cash out your mesh earnings ← Phase 8.3 (NEW)
📒 Log your earnings           ← Phase 8.0
🧪 Help improve the AI         ← Phase 3.0 federated rounds
```

## Decision

### `#meshWithdrawalSection` card on the Earn tab

Layout:

- **Header**: "🏧 Cash out your mesh earnings" + status caption.
- **Balance block** (blue gradient panel, prominent): 36px tabular-
  numeric `₹X,XXX.XX` of `availablePaise`; secondary line shows
  unsettled event count + minimum-withdrawal threshold when
  applicable.
- **Form**: UPI ID input (`inputmode="email"`, `autocomplete="off"`
  per §15 — don't autofill from browser saved passwords + don't
  prompt the browser to save the entered value) + **[Request
  withdrawal]** button + **[Refresh balance]** link.
- **History list** below with status badges (`pending` /
  `provider_accepted` / `paid` / `failed`) using the same colour
  palette pattern as Phase 8.2's MFI consent badges. Each row
  shows: amount in ₹, status badge, request date, masked UPI,
  provider reference if available, failure reason if failed.
- **"How cash-out works"** details collapsible explaining the
  state machine + the refund-on-failed property + the
  bearer-token-style audit-masking semantics.

### `setupMeshWithdrawal()` in `app.js` (~150 lines)

Follows the Phase 8.0 / 8.1 / 8.2 pattern. Notable bits:

- **Balance auto-refreshes on tab visit + after every successful
  request.** A successful POST locks the events into the new
  request, so available balance drops to zero — the UI reflects
  that immediately.
- **Disabled-state logic** on the Request button:
  - `available === 0` → disabled with "No unsettled events yet"
  - `available < minWithdrawalPaise` → disabled with the threshold
  - `available >= minWithdrawalPaise` → enabled
- **Confirmation gate** before POST: `window.confirm` with the
  honest message *"Withdraw your entire mesh-contribution balance
  to {upiId}? The events will be locked into this request until
  paid."* Matches Phase 6.1b's "all-or-nothing" v1 semantics
  (partial withdrawals are future-polish).
- **UPI ID cleared on success.** The form doesn't retain the
  masked-but-readable ID — re-entry is the privacy-correct
  default. (The user can paste it again from their UPI app; we
  don't lure the browser into auto-saving it.)
- **Indian-numbering output** via `toLocaleString('en-IN')` for
  `₹50,000.00` / `₹1,00,000.00` patterns. Same helper as Phase 8.1.
- **`escapeHtml()`** on `providerReference` + `failureReason` + the
  masked UPI before any list-row interpolation.

### CSS

New rules:

- `.mesh-withdrawal-balance` — blue gradient panel
  (`linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)`), accent
  colour `#0c4a6e` matching Bharat OS's cool palette for
  pay-out-flow UI.
- `.mesh-withdrawal-balance-value` — 36px, tabular-numeric, bold.
- `.mesh-withdrawal-list-entry` — 2-col grid (amount + status +
  meta + reference).
- `.mesh-withdrawal-status-badge` — 4 status-coloured variants:
  - `.pending` amber, `.provider_accepted` blue, `.paid` green,
    `.failed` red.

### SW cache → v33

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| UPI ID never on the ledger / metrics | The server already enforces this (Phase 6.1b's `maskUpiId`). The UI passes the raw UPI to the server's POST; the server immediately masks for any audit / log surface. The UI never shows the raw UPI back to the user in a context where it'd leak (no echo in the list rows — only masked). |
| No browser autocomplete for UPI ID | `autocomplete="off"` on the input. Browsers MAY still save, but we don't request password-style behavior; same posture as Phase 4.3's phone-OTP input. |
| Form clears on success | Worker has to re-enter UPI ID for the next withdrawal — eliminates a "set-and-forget" surface that could leak via shoulder-surfing or a forgotten device. |
| Worker explicitly confirms before POST | `window.confirm` gate matches the Phase 8.2 revoke pattern + Phase 2a.26 reset-device pattern. No accidental withdrawals. |
| Refund-on-failed is communicated honestly | The details copy spells out "if FAILED, the events return to your available balance — no money lost." Worker isn't blindsided by a partner-side failure. |
| HTML escaping on user-controlled fields | `providerReference` + `failureReason` + `upiIdMasked` are all server-controlled but escaped defensively (provider reference could theoretically contain anything the partner sends). |

## Tests

**No automated browser tests** — same pattern as Phase 8.0/8.1/8.2.

Live smoke verification:
- `GET /shell/index.html` 200; contains `meshWithdrawalSection`,
  `meshWithdrawalUpiId`.
- Seeded 15 inference events (1M tokens each = 1600 paise each =
  ₹120 total); `/mesh/balance` returns `availablePaise: 12000`;
  POST withdrawal succeeds; response carries `status: 'pending'`,
  `amountPaise: 12000`, `upiIdMasked: 'r***h@hdfcbank'`.
- All 747 Node tests still pass.

## Consequences

- **Earn tab story is now complete for the mesh-contribution
  flow.** Real-time ticker → monthly retrospective → cash-out
  to UPI → status visible in history. An investor demo can show
  the full earn-and-spend loop without leaving the tab.
- **Manual ops workflow becomes natural.** The Phase 5.7 ops
  endpoint `POST /api/admin/mesh/withdrawals/:requestId/paid` now
  has a worker-facing UI that reflects the state change. SRE
  marks `paid` from the jumphost; worker sees the green `paid`
  badge appear on their next refresh; the Phase 7.1 push fires
  in parallel (when VAPID is configured) so the worker gets a
  notification *and* the in-app status update.
- **Trust-building UX.** The refund-on-failed semantics
  (documented in the details copy) is exactly the kind of
  worker-friendly behaviour that the Phase 6.1b protocol-level
  design guaranteed. The UI surfaces it honestly.

## Future polish

- **Partial withdrawals** — Phase 6.1b future-work item #1. The
  card today bundles ALL unsettled events; a future version
  could accept an amount field.
- **QR code for UPI ID input** — most Indian UPI apps generate a
  QR you scan; supporting that flow (via the existing camera
  permission) would beat typing the UPI ID for many workers.
- **Saved UPI IDs** — opt-in only ("Save this UPI for next time?"
  with explicit checkbox). Today we clear on every success per
  the §15 default-no-save posture.
- **Real-time push to status updates** — when the Phase 7.1
  `mesh_withdrawal.pushed` event fires, the in-app UI could
  refresh the list automatically via SSE or polling. Today the
  worker has to tap Refresh.
- **i18n** — copy is English-only.
- **Per-day / per-week trend on the balance block** — a sparkline
  showing how the balance grew over the last 7 days.
