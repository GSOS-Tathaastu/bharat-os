# ADR 0102: Phase 7.1 — Push Alerts for Audit-Significant Events

## Status

**Accepted — shipped.** Follow-on to Phase 7.0 (ADR 0101 — Web Push
VAPID). Extracts a reusable helper from the recovery-push code and
wires three new audit-significant events to push delivery: ops
cooldown-clear, mesh-withdrawal terminal transitions (paid /
failed), and MFI income-bundle reads.

## Context

Phase 7.0 shipped the SIM-swap detection push, but the wiring was
~60 lines of boilerplate inlined into the recovery handler.
Adding a new push event meant duplicating that boilerplate:

- Read VAPID config
- Load subscriptions for the identity
- Filter to `rawEndpointStored: true`
- For each: call `sendWebPush`
- Emit `<event>.pushed` ledger event with masked endpoint
- 410 Gone auto-unsubscribe
- Catch errors so the primary action doesn't break

ADR 0101's future-polish list called out:

> **Wire to other audit-significant events** — `cooldown_override
> .applied` (ops cleared cooldown — was this you?),
> `mesh_withdrawal.paid` (cash-out completed),
> `income_verification_bundle.read` (MFI read your record). Each
> of these is a high-signal moment for the user.

Phase 7.1 ships all four (helper + three wire points).

## Decision

### `sendPushToIdentity(store, identityId, payload, opts)` helper

New export in `src/phase0/web-push.mjs`. Encapsulates the entire
Phase 7.0 push pattern in one call:

```js
await sendPushToIdentity(
  store,
  worker.id,
  {
    type: 'mesh_withdrawal_paid',
    title: '₹500 sent to your UPI',
    body: `Your payout to ${withdrawal.upiIdMasked} is complete.`
  },
  {
    urgency: 'normal',
    ledgerType: 'mesh_withdrawal.pushed',
    requestId,
    logger
  }
);
```

Returns `{ skipped, sent, failed, unsubscribed, attempted, reason? }`
so callers can log delivery stats without owning the loop.

**Safe-default behaviour:**

- VAPID unset → returns `{ skipped: true, reason: 'vapid_unconfigured' }`.
  **No exception thrown.** The caller's primary action proceeds
  normally. Push is detection, not defense.
- Store doesn't implement `listPushSubscriptions` → same skip.
- Per-subscription send failure → logged, ledger-recorded, but
  doesn't abort the loop.
- HTTP 410 Gone → subscription auto-deleted via
  `store.deletePushSubscription`.

**Audit-by-default:**

Every send attempt — successful or not — emits a typed ledger
event:

```json
{
  "type": "<ledgerType>",
  "identityId": "bos:person:...",
  "subscriptionId": "...",
  "endpointMasked": "push.example/...xxxx23",
  "pushStatus": 201,
  "payloadType": "mesh_withdrawal_paid",
  "reason": null
}
```

On failure the type becomes `<ledgerType>.failed` and `reason` is
populated.

### Recovery push refactored to use the helper

The Phase 7.0 inline implementation (~60 lines) reduces to:

```js
await sendPushToIdentity(store, identity.id, payload, {
  urgency: 'high',
  ledgerType: 'recovery_alert.pushed',
  requestId,
  logger
});
```

All Phase 7.0 tests still pass.

### Three new push wire-points

**1. `cooldown_override.applied` → `cooldown_override.pushed`**

When the Phase 5.7 admin endpoint clears a recovery cooldown
(SRE confirms identity via secondary channel), every paired device
gets a high-urgency push:

> **Your recovery cooldown was lifted by Bharat OS support**
> If you contacted support, no action needed. If not, tap to
> report this — your account may be under attack.

The compounding defense: the original recovery already pushed; if
*that* wasn't the legitimate user, they have a second alert when
the cooldown is lifted. SRE can correlate two "wasn't me" reports
to identify a compromised admin token.

**2. `mesh_withdrawal.paid` / `failed` → `mesh_withdrawal.pushed`**

When the Phase 6.1b admin endpoint marks a withdrawal terminal,
the worker gets a confirmation:

> **₹500.00 sent to your UPI**
> Your mesh-contribution payout to `r***h@hdfcbank` is complete.
> Reference: razorpay-12345.

Or on failure (high-urgency, since the worker needs to act):

> **Your mesh-contribution payout failed**
> The ₹500.00 payout to `r***h@hdfcbank` couldn't complete:
> partner reported invalid UPI. The amount has been returned to
> your available balance.

§15: UPI ID stays masked in the push body — same `r***h@hdfcbank`
pattern as the ledger event. Rupee amount is the worker's own
self-asserted figure (not PII).

**3. `income_verification_bundle.read` → `income_verification.pushed`**

When an MFI fetches the worker's income-verification bundle, the
worker gets a normal-urgency notification:

> **Bajaj Finserv just read your income summary**
> If you shared the consent link with them, no action needed.
> If you didn't, tap to revoke any remaining consents.

This catches stolen `consentId` bearer tokens in near-real-time.
The worker can revoke other outstanding consents immediately.
§15: `mfiName` is the consent's own label — the worker signed it,
so it's not new PII.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Push body never contains PII | All four payloads use behavioural cues + masked identifiers. No raw UPI ID, no raw UAN, no displayName, no phone. The operator label (for `cooldown_override`) goes to the ledger, NOT the push body. |
| Audit trail for every push | One ledger event per send attempt with masked endpoint + status + payload type + reason. Operators can reconstruct the full notification timeline. |
| Best-effort: failures never break primary actions | `sendPushToIdentity` catches all errors. The recovery / cooldown-clear / mesh-paid / MFI-read response always completes; pushes are a separate observability surface. |
| Graceful degradation when VAPID unset | Returns `{ skipped: true }` silently. No 503; no error logged. Deployments without VAPID configured operate normally, just without notifications. |
| DPDP §12(3) cascade | The existing `push_subscriptions` table is in the cascade; ledger redaction handles the new event types via the existing pattern (identityId → `<erased>`). |

## Tests

`tests/node/push-alerts.test.mjs` — 8 tests:

**`sendPushToIdentity` unit** (3):
1. Skips silently when VAPID unconfigured — no exception, no
   ledger event.
2. Rejects missing required params (identityId / payload /
   ledgerType).
3. Returns `sent: 0, attempted: 0` when identity has no
   delivery-keyed subscriptions.

**End-to-end push wires** (5):
4. **Cooldown-clear pushes** — register subscription → admin
   clears cooldown → mocked push.mock URL gets called → ledger
   has `cooldown_override.pushed` with masked endpoint.
5. **Mesh withdrawal paid pushes** — seed 15 mesh events →
   worker requests withdrawal → ops marks `paid` → push fires →
   ledger has `mesh_withdrawal.pushed` with `payloadType:
   'mesh_withdrawal_paid'`.
6. **Mesh withdrawal failed also pushes** — same setup, ops
   marks `failed` → push fires → ledger `payloadType:
   'mesh_withdrawal_failed'`.
7. **MFI bundle read pushes** — worker issues consent → MFI
   fetches bundle → push fires → ledger has
   `income_verification.pushed` with `payloadType:
   'income_verification_read'`.
8. **Graceful degradation** — VAPID unset, full MFI-fetch flow
   still works, ZERO pushes go out, ZERO `*.pushed` ledger
   events.

Plus all 22 Phase 7.0 tests still pass after the refactor.

Full suite: **726 / 726 green** (was 718; +8 new). No SW change
(server-side only).

## Consequences

- **Three-layer SIM-swap defense + detection compound:**
  1. Phase 5.2 cooldown gates destructive actions.
  2. Phase 7.0 push tells the user the recovery happened.
  3. Phase 7.1 push tells the user when ops lifts the cooldown
     (catches attacker + corrupt-admin scenarios).
- **Workers know the moment something audit-significant happens.**
  Bundle reads, payouts (success or failure), cooldown lifts —
  all surface in near-real-time without needing to open the app.
- **Adding a new push event is a 5-line patch.** The helper
  encapsulates everything; new audit events just compose with
  the existing handler.
- **Backward-compatible.** All Phase 7.0 tests pass after the
  recovery-flow refactor. Deployments without VAPID see no
  behaviour change.

## Future polish

- **Worker-side preference controls** — let the worker mute
  `income_verification_bundle.read` (they trust the MFIs they
  authorise) while keeping `cooldown_override.applied` (they
  never want to miss those). Stored on the subscription record.
- **Multi-recipient parallelism** — `sendPushToIdentity` currently
  loops sequentially. `Promise.all` + per-endpoint timeout would
  parallelise when an identity has 5+ paired devices.
- **Per-endpoint health metric** — `bos_push_send_total{result}`
  Prometheus counter (already in ADR 0101's future-work list —
  Phase 7.3 candidate).
- **§9A worker-notification VAPID delivery** — Phase 2a.4
  scaffold still has `vapidIntegrated: false` for the job-alert
  notifications. Phase 7.2 wires those.
- **Withdrawal-status push for `provider_accepted`** — currently
  only `paid` / `failed` push. The intermediate state could
  push a "we've notified your payout partner — expect funds in
  N minutes" alert.
- **Aggregated daily digest** — for users with high notification
  volume (e.g., a small employer who issues 20 consents/day),
  collapse non-urgent pushes into a once-daily summary.
