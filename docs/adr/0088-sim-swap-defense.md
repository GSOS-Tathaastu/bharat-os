# ADR 0088: Phase 5.2 — SIM-Swap Defense (Per-Phone Rate-Limit + Post-Recovery Cooldown)

## Status

Accepted

## Context

Phase 5.0 (ADR 0086) shipped account recovery via phone OTP. The
`account_recovery.completed` ledger event provides *after-the-fact*
SIM-swap detection — ops can correlate a wave of recoveries against
a single phone range — but that's detection, not prevention. Once
a SIM-swap attacker completes the recovery flow and holds the
identity bundle, an irreversible action (sending money, granting a
trust attestation, deleting the identity) closes the window faster
than ops can intervene.

Two known gaps were called out as future work in ADR 0086:

- **#1** — "Cooldown after recovery: gate sensitive actions for
  24h to absorb a SIM-swap attack window."
- **#4** — "Recovery-attempt rate-limit per phone: the current
  `expensive` rate-limit policy is per-IP; a SIM-swap attacker
  rotating IPs could still hit the endpoint."

Phase 5.2 ships both as a single defense package. They compose:
the per-phone limit slows a SIM-swap probe, the cooldown absorbs
any that get through.

## Decision

### Per-phone rate-limit on `/api/recovery/start`

New policy in `src/phase0/rate-limiter.mjs`:

```js
recovery_per_phone: { capacity: 3, refillPerSecond: 3 / 3600, burst: 3 }
```

3 sends per hour per **normalised phone**, independent of client
IP. The `/api/recovery/start` handler calls `limiter.consume` twice:

1. The existing per-IP `expensive` consume (handled in the
   middleware preamble) gates abusive IPs.
2. After parsing `body.phone` and normalising it, a second
   `limiter.consume('phone:<normalised>', 'recovery_per_phone')`
   gates abusive phone targets.

The phone-bucket consume is applied **before the identity lookup**.
This is critical: registered and unregistered phones get an
identical 429 vs 200 distribution. If we only limited registered
phones, the 429 response would reveal that the phone is a Bharat
OS account — the §15 anti-enumeration guarantee that Phase 5.0
went out of its way to preserve via the no-match sentinel.

A SIM-swap attacker rotating IPs can still hit the endpoint, but
each target phone tops out at 3 sends/hour. After that they get
429s for ~20 minutes per recovery attempt — long enough for the
real user to notice "I'm getting OTPs I didn't request" and act.

### Post-recovery cooldown

New artifact `src/phase1/recovery-cooldown.mjs`. Pure functions —
no store coupling:

- **`applyRecoveryCooldown(identity, { at, ttlMs, reason })`** —
  returns a new identity carrying:

  ```js
  identity.recoveryCooldown = {
    protocolVersion: 'bos.phase1.recovery-cooldown.v0',
    reason: 'account_recovery',
    activatedAt: '<ISO>',
    until: '<ISO + 24h>',
    ttlMs: 86_400_000
  }
  ```

- **`cooldownState(identity, { at })`** — returns
  `{ active, until, secondsRemaining, reason }`.

- **`assertNoCooldown(identity, { at, scope })`** — throws an
  `Error` with `code: 'RECOVERY_COOLDOWN_ACTIVE'`, `scope`,
  `until`, `secondsRemaining`, `reason` when the cooldown is
  active.

- **`clearRecoveryCooldown(identity)`** — drops the cooldown
  block. Reserved for ops tooling that needs to override after
  out-of-band identity confirmation.

- **`COOLDOWN_SCOPES`** — informational enum used by callers to
  classify the gated action (`identity_deletion`,
  `recovery_restart`, `trust_attestation_grant`,
  `sensitive_action`).

### `/api/recovery/verify` applies the cooldown

After verifying the OTP and reading the identity, the handler now
calls `applyRecoveryCooldown(identity, { reason: 'account_recovery' })`,
persists the cooled identity, then builds the bundle from the
*cooled* identity. The bundle carried over the wire to the new
device includes the cooldown block — the shell UI can render a
banner ("Account recovered ✓ — sensitive actions paused for
23h 45m").

The `account_recovery.completed` ledger event now also carries
`cooldownUntil` for after-the-fact correlation.

### `/api/recovery/start` masks the cooldown behind the sentinel

When the matched identity is already cooling down, the handler
routes to the same **no-match sentinel** response that an
unregistered phone gets. A SIM-swap attacker who already completed
one recovery cannot use a second probe to confirm the prior one
succeeded — the sentinel preserves the anti-enumeration guarantee
*also* against post-recovery state.

### `DELETE /api/identities/:id` refuses while cooling down

The DPDP §12(3) right-to-erasure handler now calls
`assertNoCooldown(identity, { scope: 'identity_deletion' })`. On
`RECOVERY_COOLDOWN_ACTIVE`, the response is **HTTP 423 Locked**
with a `recovery_cooldown_active` error code, `until`, and
`secondsRemaining`. Other erasure paths (the `/erasure-preview`
GET) remain open — the user can still see what *would* be deleted
during cooldown; only the irreversible commit is blocked.

The legitimate user who genuinely wants to delete the account
after a recovery just waits 24 hours. The SIM-swap attacker
gets locked out long enough for ops to react.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Anti-enumeration on `/api/recovery/start` | Per-phone rate-limit applied **before** identity lookup, identically to registered and unregistered phones — 429 vs 200 doesn't reveal account status. Cooldown state behind the same no-match sentinel — even a successful prior recovery can't be probed. |
| Cooldown is account-state, not PII | The `recoveryCooldown` block carries no user data — just a protocol-versioned timestamp + reason. Safe to surface on the public identity record (verifiers can read it; paired devices can render the banner). |
| Recovery is still 90 seconds for the legitimate user | The cooldown gates **destructive actions only**. Read paths, intent flows, mesh/federated participation all remain open during cooldown. The legitimate user is back in immediately. |
| Audit trail extension | The `account_recovery.completed` ledger event grows a `cooldownUntil` field. Ops dashboards can correlate "recovery completed" + "destructive action attempted within 24h" as a SIM-swap signature. |

## Tests

`tests/node/recovery-cooldown.test.mjs` — 14 tests:

**Cooldown module** (10 tests):
1. `applyRecoveryCooldown` stamps a 24h `until` + protocol version
2. Rejects bad inputs (null identity, zero/negative ttlMs)
3. Honours custom reason + ttlMs
4. `cooldownState` returns inactive for fresh identities
5. Reports active during window + inactive after window expires
6. Tolerates corrupt `until` field (returns inactive)
7. `assertNoCooldown` passes on fresh identity
8. Throws `RECOVERY_COOLDOWN_ACTIVE` with scope + `until` + `secondsRemaining`
9. Passes after window expires
10. `clearRecoveryCooldown` drops the block + preserves other fields

**Rate-limiter policy** (4 tests):
11. `DEFAULT_RATE_POLICIES.recovery_per_phone` exposes capacity 3 + 3-per-hour refill
12. Bucket blocks the 4th send within the same hour with realistic `retryAfter`
13. Bucket lets a 4th send through after 25-minute refill
14. Buckets are isolated per phone key (alice's exhaustion doesn't affect bob)

Full suite: **413 / 413 green** (was 399; +14 new).

## Consequences

- **A SIM-swap attacker can no longer immediately destroy the
  account.** The 24h cooldown closes the irreversibility window.
  The legitimate user (or an ops alert correlating
  `account_recovery.completed` + push to paired devices) has time
  to override via the trusted-device path (a Phase 5.3 commitment).
- **Phone-probe enumeration is now rate-limited end-to-end.** Per-
  IP `expensive` + per-phone `recovery_per_phone` compose: even an
  attacker rotating IPs across cloud providers can only hit each
  phone 3 times an hour. Combined with the no-match sentinel,
  there's no exploitable signal across either dimension.
- **The legitimate recovery flow is unchanged.** The cooldown
  affects only destructive endpoints (today: identity deletion;
  Phase 5.3 extends to trust-attestation grants + high-value
  payment flows). A user recovering from a lost phrase reads
  their data, sends low-value intents, and pairs new devices
  immediately — only the irreversible "I want to delete my
  account" path waits 24 hours.
- **The cooldown surface is composable.** Any future endpoint
  that wants the gate just calls
  `assertNoCooldown(identity, { scope })` — the catch handler is
  one shape (`RECOVERY_COOLDOWN_ACTIVE` → 423 Locked + `until`).

## Future polish

- **Trusted-device override** (Phase 5.3 candidate) — let the user
  nominate one of their other paired devices (from §7c) as an
  authorisation source. A signed override from that device can
  clear the cooldown immediately, restoring the user's ability to
  delete the account.
- **Push notification on recovery** — notify paired devices via
  push the moment `account_recovery.completed` fires. The
  legitimate user sees "your account was recovered on a new
  device" within seconds, not after the 24h window expires.
- **Multi-factor recovery** — gate the `account_recovery.completed`
  event itself behind both phone OTP *and* email OTP (when email
  is added). This is a higher bar than the cooldown can offer.
- **Per-tier cooldown** — high-value accounts (verified merchants,
  treasury identities) carry a longer cooldown (48-72h); micro-
  accounts could shorten to 4h to reduce friction.
- **Cooldown override audit trail** — when `clearRecoveryCooldown`
  is exposed to ops, every override should emit a
  `cooldown_override` ledger event with the operator's signed
  authorisation. Currently the function exists but no endpoint
  calls it.
