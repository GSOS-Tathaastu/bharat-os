# ADR 0094: Phase 5.8 — SMS Bulkhead (Per-Provider Concurrency Cap) + In-Flight Gauge

## Status

Accepted

## Context

Phase 5.4 (ADR 0090) shipped per-call timeouts (`fetchWithTimeout`,
default 3000ms) and circuit breakers (5 consecutive failures → 30s
cooldown). The two layers compose: a broken vendor times out fast,
the breaker opens after threshold, fallback chain skips the dead
vendor instantly.

But ADR 0090 left one explicit gap in its future-work list:

> **Bulkhead per provider** — limit in-flight concurrent calls
> per provider so one slow vendor can't exhaust the event loop.
> Today there's no concurrency cap.

A vendor that's slow but not yet timing out — e.g. a 2.5s response
floor that hasn't tripped the 3s `fetchWithTimeout` — can
accumulate dozens of in-flight fetches under load. Each one holds
a socket + a slice of Node heap. Under a recovery-OTP storm
during a launch event, this fills the event loop before any of the
existing protections kick in.

Phase 5.8 ships the bulkhead.

## Decision

### `createBulkheadProvider(provider, { maxConcurrent })`

New factory in `src/phase0/sms-provider.mjs`. Per-provider counter
(no queue — see below). Behaviour:

- At `< maxConcurrent` in-flight: pass-through. Increment counter,
  call inner provider, decrement on settle.
- At `>= maxConcurrent` in-flight: throw immediately with
  `SMS_PROVIDER_BULKHEAD_FULL`. The error includes
  `{ provider, inflight, maxConcurrent }` for ops correlation.
- Counter is decremented in a `finally` block so a rejection from
  the inner provider releases the slot. No leaks.

Default `maxConcurrent = 10`. Tunable via
`BHARAT_OS_SMS_BULKHEAD_MAX` env var. Defaults chosen for typical
India-SMS APIs (vendor docs rate-limit at 200-1000 req/s; 10
concurrent never approaches that ceiling, but does cap exposure
to a hung vendor).

**Why no queue.** Queueing waiting calls adds latency for the
caller (waits while a slot frees up) AND defeats the point of the
fallback chain (a queued call doesn't get routed to a different
vendor). Fast-fail with a recoverable code lets the fallback
chain route around the busy provider — that's the right semantics
for SMS where "deliver via any vendor" is the goal, not "deliver
via THIS vendor specifically."

### Wrapper composition order

The internal `wrappedProvider` now stacks four layers per provider:

```
bulkhead → circuit breaker → telemetry → vendor
```

This order matters:

- **Bulkhead outermost.** Slow-vendor calls that the timeout
  hasn't yet aborted don't count against the breaker's failure
  threshold from inside a busy bulkhead. Fast-fail at the
  bulkhead → fallback chain → next vendor; the slow vendor's
  circuit opens via existing timeouts on the actual in-flight
  calls.
- **Circuit breaker next.** A KNOWN-bad vendor still skips
  network entirely. Bulkhead would let calls through if there's
  capacity — but the breaker short-circuits first.
- **Telemetry next.** Records every attempt that survives the
  two guard layers. Skipped-by-bulkhead and skipped-by-circuit
  don't pollute `bos_sms_send_total` — they show up in the
  dedicated state gauges (`bos_sms_circuit_state`,
  `bos_sms_inflight`).
- **Vendor innermost.** Actual fetch / send.

### Fallback chain treats `BULKHEAD_FULL` as recoverable

The chain's recoverable-error set now includes
`SMS_PROVIDER_BULKHEAD_FULL` alongside `SMS_PROVIDER_NOT_CONFIGURED`,
`SMS_PROVIDER_REJECTED`, and `SMS_PROVIDER_CIRCUIT_OPEN`. When a
provider's bulkhead is full, the chain falls through to the next
provider transparently — same UX as a vendor outage.

### `bos_sms_inflight{provider}` Prometheus gauge

New gauge in `/metrics`:

```
# HELP bos_sms_inflight SMS sends currently in flight per provider.
# TYPE bos_sms_inflight gauge
bos_sms_inflight{provider="gupshup"} 7
bos_sms_inflight{provider="msg91"}   0
bos_sms_inflight{provider="twilio"}  0
```

Updated on every bulkhead enter / exit. Alert rule:

```promql
# A vendor's bulkhead has been full for 30+ seconds — almost
# certainly hung, since 30s > the 3s fetchWithTimeout. The
# circuit breaker should be opening; if it isn't, something is
# wrong (telemetry not firing, breaker mis-threshold, etc).
bos_sms_inflight{provider="gupshup"} >= 10 for 30s
```

Three SMS observability gauges now combine for full vendor-health
visibility: `bos_sms_send_total{outcome}` (rates),
`bos_sms_circuit_state{provider}` (breaker state),
`bos_sms_inflight{provider}` (saturation).

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| PII discipline | The bulkhead never touches `phone` or `body` — it operates on a counter + the provider's `send` reference. `BULKHEAD_FULL` error messages contain only `provider`, `inflight`, `maxConcurrent`. No PII. |
| No accidental queueing of user data | Choosing fast-fail over queue means we never buffer a pending OTP send. There's no in-memory ring of "pending phones" that a crash could expose. |
| Vendor lock-in | Bulkhead applies the same SMS-provider interface — no call site outside this module knows about it. |
| Observability is aggregates, never per-user | `bos_sms_inflight{provider}` is a per-vendor counter. No identity refs anywhere. |

## Tests

`tests/node/sms-bulkhead.test.mjs` — 7 tests:

**Capacity** (3 tests):
1. Rejects calls beyond `maxConcurrent` with
   `SMS_PROVIDER_BULKHEAD_FULL` carrying `inflight` + `maxConcurrent`
2. Releases a slot when a send completes successfully
3. Releases a slot when a send rejects (error path doesn't leak
   slots)

**In-flight gauge** (2 tests):
4. `bos_sms_inflight` tracks active calls per provider; visible
   in `renderMetrics` output
5. Gauges are isolated per provider (alpha's count doesn't affect
   beta's)

**Fallback chain integration** (2 tests):
6. Chain treats `BULKHEAD_FULL` as recoverable and falls through
7. Chain reports `SMS_PROVIDER_FALLBACK_EXHAUSTED` when every
   provider's bulkhead is full — verifies the
   chain-error-aggregation path

All tests use a `controllableProvider` that hangs on a manually-
resolved deferred — drives concurrency state without real sleeps.

Full suite: **491 / 491 green** (was 484; +7 new). No SW change
(server-side only).

## Consequences

- **Slow-but-not-timed-out vendors can no longer eat the event
  loop.** Once 10 calls are in flight on Gupshup, the 11th
  fast-fails to MSG91 immediately. The hung 10 still pay the
  3s timeout, but they don't block new traffic from finding a
  healthy vendor.
- **Three-axis vendor health visibility.** Operators reading
  `/metrics` now see: rate (`bos_sms_send_total`), state
  (`bos_sms_circuit_state`), and saturation
  (`bos_sms_inflight`). A vendor in trouble shows up on at
  least one of these before user-facing impact.
- **Composes cleanly with everything else.** The full vendor
  call path is now:
  `bulkhead → breaker → telemetry → timeout-wrapped fetch`. Each
  layer has one job. The fallback chain treats every recoverable
  error code identically.
- **Bounded memory under storms.** Worst case 10 sockets per
  vendor × 4 vendors = 40 sockets per process. A million-OTP
  storm doesn't blow up Node.
- **Backward-compatible.** Existing single-provider
  (`BHARAT_OS_SMS_PROVIDER=log`) and fallback-chain
  (`BHARAT_OS_SMS_FALLBACK_CHAIN=gupshup,msg91,twilio`) configs
  work unchanged. The bulkhead is transparent unless you hit
  capacity.

## Future polish

- **Adaptive concurrency** — start at `maxConcurrent / 2` and
  increase based on observed latency (TCP-style additive
  increase / multiplicative decrease). Today the cap is static.
- **Bulkhead admin override** — `POST /api/admin/sms/bulkhead/
  resize` to bump a vendor's cap at runtime without a redeploy.
  Phase 5.7 admin-auth gives the substrate.
- **Per-route concurrency budgets** — recovery OTPs get
  prioritised over bulk notifications when bulkheads start
  filling. Today recovery + bulk share the same slots.
- **Bulkhead saturation histogram** — `bos_sms_inflight_seconds`
  to track how long calls wait near capacity. Useful for tuning
  `maxConcurrent`.
- **Cooperative back-pressure** — when bulkhead utilisation > 80%
  for 60s, signal the load-balancer / API gateway to shed
  inbound traffic. Today there's no upstream signal.
