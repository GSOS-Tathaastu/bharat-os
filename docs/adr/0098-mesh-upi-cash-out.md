# ADR 0098: Phase 6.1b — UPI Cash-Out for Mesh Earnings (Worker-Signed Withdrawal + Ops State Machine)

## Status

**Accepted — shipped.** Second half of the Phase 6.1 plan in ADR 0096
("MFI partnerships + UPI cash-out"). MFI integration substrate
shipped as Phase 6.1 (ADR 0097); this completes Phase 6.1.

## Context

Phase 3.x ships mesh-contribution events with `payoutPaise` per
event (₹2-15/night for an idle phone plugged in). Phase 6.0b
promoted the dashboard so workers see a per-day timeline. But
the earnings never actually leave the system — there's no path
from "accumulated ₹847 of mesh-contribution payout" to "₹847 in
the worker's UPI account."

The substrate the partner ecosystem expects:

1. The worker **explicitly authorises** the cash-out — no
   silent payouts, no balance drains. Cryptographic
   non-repudiation.
2. **Idempotent settlement** — each mesh-contribution event is
   bundled into at most one accepted withdrawal. If the payout
   fails, the events return to the pool. No double-claim, no
   stranded balance.
3. A **clean state machine** between Bharat OS and the payout
   partner so ops can mark transitions as the external transfer
   completes — without the partner needing to write to our DB.
4. Full **audit trail** for every state transition with operator
   attribution.

We don't (yet) integrate a specific payout partner (Razorpay X,
Cashfree, etc.). What we ship is the SUBSTRATE any partner can
consume.

## Decision

### `src/phase1/mesh-withdrawal.mjs` — pure functions

- **`isValidUpiId(value)`** — `<local>@<bank>` pattern; length
  5-80; rejects spaces, multiple `@`, oversize.
- **`maskUpiId(upiId)`** — `rajesh@hdfcbank` → `r***h@hdfcbank`.
  Mandatory for any audit / ledger / observability sink. Raw UPI
  ID NEVER appears outside the stored withdrawal record + the
  outbound payout API call.
- **`computeAvailableBalance(meshEvents, withdrawals, { operatorId })`**
  — sums `payoutPaise` of events that are NOT already bundled
  into a non-failed withdrawal (`pending` / `provider_accepted`
  / `paid`). Failed withdrawals' events return to the pool
  automatically. Returns
  `{ availablePaise, availableRupees, unsettledEventCount, unsettledEventIds }`.
- **`createWithdrawalRequest({ identity, meshEvents, priorWithdrawals, upiId, at })`**
  — bundles **all** unsettled events into a single withdrawal
  for the worker's full available balance. **Partial
  withdrawals are intentionally out of scope for v1** (future
  polish — see below). Validates ₹10 floor and ₹10L ceiling.
  Ed25519-signs with the worker's key. Deterministic
  `bos:mesh-withdrawal:<sha256-prefix>` request ID.
- **`verifyWithdrawalRequest(request, workerPublicRecord)`** —
  signature round-trip for payout-partner verification.
  Critically: strips mutable state fields (`status`,
  `acceptedAt`, etc.) before verification so transitions
  AFTER signing don't invalidate the signature.

### State machine — 4 statuses, valid transitions only

```
                   ┌────────────────┐
                   │    pending     │  ← worker submitted
                   └───┬────────┬───┘
                       │        │
                       ▼        ▼
        ┌───────────────────┐  ┌────────┐
        │ provider_accepted │  │ failed │  (terminal)
        └────────┬──────────┘  └────────┘
                 │
                 ▼
        ┌───────────────────┐
        │       paid        │  (terminal)
        └───────────────────┘
```

Plus a fast path `pending → paid` for synchronous partners that
confirm in one call.

- **`markWithdrawalAccepted(request, { providerReference, at })`**
  — `pending → provider_accepted`. Requires a partner reference
  string (e.g. Razorpay payout ID) for audit correlation.
- **`markWithdrawalPaid(request, { providerReference?, at })`**
  — `provider_accepted → paid` OR fast-path `pending → paid`.
- **`markWithdrawalFailed(request, { reason, at })`** — to
  `failed` from any non-terminal status. Reason ≥ 4 chars.
- All transitions throw `invalid transition` for invalid moves
  (e.g. `paid → failed` or `failed → paid`).

Failed withdrawals' events automatically return to the
unsettled pool — `computeAvailableBalance` only locks events
into `pending` / `provider_accepted` / `paid` withdrawals.

### SqliteStore — new `mesh_withdrawals` table

Indexed on `worker_id` + `status`. CRUD methods:
`saveMeshWithdrawal`, `readMeshWithdrawal`,
`listMeshWithdrawals({ workerId, status })`. Included in the
DPDP §12(3) erasure cascade.

### API endpoints

**Worker side:**

- **`GET /api/identities/:id/mesh/balance`** — returns the
  available balance (₹10 minimum surfaces in
  `minWithdrawalPaise`).
- **`POST /api/identities/:id/mesh/withdrawals`** — body
  `{ upiId }`. Returns the signed withdrawal envelope. On error,
  structured codes:
  - `invalid_upi_id` (malformed UPI)
  - `insufficient_balance` (< ₹10 unsettled)
  - `amount_exceeds_ceiling` (> ₹10L — sanity check)
  - `invalid_withdrawal_request` (fall-through)
- **`GET /api/identities/:id/mesh/withdrawals`** — list history.

**Ops side (Phase 5.7 admin-auth gated):**

- **`POST /api/admin/mesh/withdrawals/:requestId/accepted`** —
  body `{ providerReference }`. Marks `provider_accepted`.
- **`POST /api/admin/mesh/withdrawals/:requestId/paid`** —
  body `{ providerReference? }`. Marks `paid`.
- **`POST /api/admin/mesh/withdrawals/:requestId/failed`** —
  body `{ reason }` (≥ 4 chars). Marks `failed`; events return
  to pool automatically.

Each transition emits a typed ledger event (`mesh_withdrawal.requested`
/ `mesh_withdrawal.provider_accepted` / `mesh_withdrawal.paid` /
`mesh_withdrawal.failed`) with the operator + masked UPI ID.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Worker explicitly authorises payout | Withdrawal request is Ed25519-signed by the worker — no silent payouts; partner can verify the signature. |
| UPI ID masked everywhere except the stored record | `maskUpiId` → `r***h@hdfcbank`. Ledger events, structured logs, and metric labels all use the mask. Raw UPI lives ONLY in the withdrawal record (needed for the actual payout API call). |
| Idempotent settlement | Each mesh-contribution event is bundled into at most one non-failed withdrawal; the events ARE the unit of double-claim prevention. |
| Failed payouts are refundable | Failed withdrawals' events automatically return to `computeAvailableBalance`'s pool. The legitimate worker is never permanently shortchanged by a partner-side failure. |
| Audit trail | Every state transition is in the typed ledger with operator attribution. Ops fraud investigators can reconstruct a complete payout history. |
| DPDP erasure cascade | `mesh_withdrawals` is in the cascade. Erasing a user removes their entire payout history. Prior payouts the partner made are out of scope (Bharat OS isn't custodial). |
| Cross-user isolation | The list endpoint scopes to `workerId`; admin endpoints use Phase 5.7 admin-auth + log operator attribution. |

## Tests

`tests/node/mesh-withdrawal.test.mjs` — 27 tests:

**UPI ID helpers** (3): valid formats, malformed rejection,
masking output.

**Balance computation** (3): unsettled sum, exclusion of bundled
events, refund-on-failed.

**`createWithdrawalRequest` + `verifyWithdrawalRequest`** (4):
signed envelope shape, insufficient-balance refusal, invalid UPI
refusal, tampered-amount rejection.

**State transitions** (4): pending→accepted with provider ref;
invalid-status rejection; paid from pending OR accepted;
failed requires reason ≥ 4 chars + cannot transition from
terminal.

**Constants** (1): `WITHDRAWAL_STATUSES` enum frozen, 4-state
machine documented.

**SqliteStore + DPDP** (2): round-trip + erasure cascade.

**End-to-end live HTTP** (9): balance fetch, request creation +
ledger, insufficient-balance 400, invalid UPI 400, admin paid
transition + audit, admin failed returns events to pool,
admin no-token 503, admin unknown-transition 400, history list.
Plus a final `MESH_WITHDRAWAL_LIMITS` constants test.

Full suite: **647 / 647 green** (was 620; +27 new). No SW change
(server-side only).

## Consequences

- **Mesh earnings now have an exit door.** A worker who has
  accumulated ₹847 in mesh-contribution payouts can hand a UPI
  ID, get a signed withdrawal request, and (once a payout partner
  is contracted) actually receive the rupees.
- **Payout-partner integration is one operator endpoint.** No
  SDK; no DB write access for the partner. Ops just curls the
  admin endpoint as the partner reports back. Compatible with
  Razorpay X, Cashfree Payouts, Decentro, etc.
- **Failed payouts don't strand balance.** The events
  automatically return to the unsettled pool — no manual
  reconciliation needed.
- **Backward-compatible.** No existing route changed. Phase 6.0b
  mesh dashboard still works; Phase 6.1 MFI bundle still works.

## Future polish

- **Partial withdrawals** — today the worker withdraws their
  FULL available balance. Letting them pick an amount (worker
  asks for ₹500; server settles the FIFO prefix that sums to
  ≥ ₹500) is the obvious extension.
- **Webhook ingestion** — instead of ops curling the admin
  endpoints by hand, a partner-specific webhook receiver could
  transition state based on signed callbacks from Razorpay /
  Cashfree.
- **Provider-side signature on `provider_accepted`** — partner
  signs the acceptance message; Bharat OS verifies before
  recording. Makes the partner cryptographically committed to
  honoring the payout.
- **Per-vendor cost telemetry** — extend the SMS-style
  Phase 5.3 telemetry to payout providers (vendor fee per
  withdrawal, success rate, latency).
- **Daily / monthly limits** — a worker shouldn't be able to
  drain a sudden anomalous balance; rate-limit withdrawals to
  N per day per worker.
- **Bharat OS Payouts wallet** — instead of UPI cash-out, accumulate
  in a wallet the worker can spend on partner services. Avoids
  per-payout partner fees + creates a network-effect surface.
