# ADR 0104: Phase 7.3 — Web Push Adaptive Retry + Per-Vendor Telemetry

## Status

**Accepted — shipped.** Final phase from ADR 0101's future-work
list. Adds the reliability + observability story Web Push was
missing.

## Context

Phase 7.0 shipped real Web Push delivery. Phase 7.1/7.2 wired it
into five audit-significant events. But two reliability + ops
concerns remained from ADR 0101's closing notes:

> **Adaptive retry with backoff** — push services return 429 +
> a `Retry-After` header under load. Currently we report the
> failure and move on.
>
> **Per-endpoint health metric** — `bos_push_send_total{result}`
> gauge similar to `bos_sms_send_total`. Operators alert on
> rising failure rates.

Phase 7.3 ships both.

## Decision

### Per-vendor telemetry — `bos_push_send_total{vendor, outcome}`

Mirrors `bos_sms_send_total{provider, outcome}` from Phase 5.3.
Recorded by `sendWebPush` on every send attempt.

**Vendor extraction.** New `pushVendor(endpoint)` helper maps
endpoint host → vendor family:

| Host pattern | Vendor |
|---|---|
| `*.googleapis.com` | `fcm` |
| `*.mozilla.com` | `autopush` |
| `*.windows.com` | `wns` |
| `*.mock` (tests) | `mock` |
| everything else | `other` |

Bharat OS doesn't route between vendors (the subscription owns
that choice — FCM for Chrome users, Autopush for Firefox, etc.).
But the per-vendor success rate is what ops needs to see.

**Outcome enum** (6 values):

| Outcome | When |
|---|---|
| `success` | HTTP 200/201 first try |
| `gone` | HTTP 404/410 (subscription invalidated) |
| `rate_limited` | HTTP 429 (first attempt; if retry succeeds, `retried_success` also fires) |
| `rejected` | 4xx (non-410) or 5xx |
| `network_error` | TCP/DNS/connection failure |
| `retried_success` | first attempt failed, retry succeeded |

PromQL example:

```promql
# FCM failure rate, last 5 minutes:
1 - rate(bos_push_send_total{vendor="fcm",outcome="success"}[5m])
  / rate(bos_push_send_total{vendor="fcm"}[5m])
```

### Adaptive retry — once, honoring Retry-After

`sendWebPush` retries **exactly once** on three failure classes:

- **HTTP 429 rate-limited** — parses `Retry-After` header (delta-
  seconds or HTTP-date per RFC 7231 §7.1.3). Capped at 60s to
  prevent a rogue header from blocking the response loop for
  hours. Falls back to a 1s baseline when the header is missing.
- **HTTP 5xx server error** — fixed 1s delay.
- **Network error** (DNS, TCP reset, fetch throw) — fixed 1s
  delay.

Returns `{ retried: true, retryAfterMs? }` on the result so
callers can log retry behavior. The retry path passes `retry:
false` to prevent cascading retries (worst case: 2 attempts per
push).

Test seam: `sendWebPush({ ..., sleep: customSleep })` lets tests
inject a no-op sleep so retry tests don't actually wait. Default
sleep is `setTimeout`.

### `parseRetryAfterMs(headerValue, { now })` helper

Exported from `web-push.mjs`. Tolerates:

- Delta-seconds integer: `"3"` → `3000` ms.
- HTTP-date: `"Wed, 01 Jan 2026 00:00:00 GMT"` → `<future - now>` ms.
- Missing / malformed: `0` ms.
- Past date: clamped to `0` ms.
- Rogue value > 60s: capped at `60000` ms.

### `retry: false` opt-out

Callers that need single-attempt semantics (e.g., the recursive
retry call inside `sendWebPush` itself; tests verifying error
paths) pass `retry: false` to disable. Default is `retry: true`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| No PII in metric labels | `vendor` + `outcome` are bounded enums. Endpoint URL never appears. |
| No PII in retry behavior | Retry just re-runs the same encrypted-payload POST. The payload stays E2E-encrypted; the push service still can't read it. |
| Single retry — no infinite loops | Hard-coded `retry: false` on the recursive call. Maximum 2 attempts per `sendWebPush` invocation. |
| Retry-After cap | 60s ceiling prevents a rogue header from blocking the request loop. |
| Recorded retry success vs first-try success | `retried_success` counter is separate from `success` — ops can tell flapping-but-recovering from healthy. |

## Tests

`tests/node/push-retry-telemetry.test.mjs` — 16 tests:

**`pushVendor`** (2): vendor mapping for each known host family
+ malformed input handling.

**`parseRetryAfterMs`** (4): delta-seconds, HTTP-date, 60s cap,
missing/malformed/past-date.

**Per-vendor telemetry recording** (3): `success` on 201,
`gone` on 410 + `shouldUnsubscribe`, `rejected` on non-retried
4xx.

**Retry on 429** (2): one retry honors Retry-After (test injects
a no-op sleep, asserts call count, verifies `retryAfterMs` +
`retried_success` counter increment); persistent 429 gives up
after one retry — exactly 2 calls.

**Retry on 5xx** (1): retry uses fixed 1s baseline (NOT the
absent Retry-After); counters track `rejected` (first) +
`success` (second) + `retried_success`.

**Retry on network error** (1): fetch throw triggers retry;
counters track `network_error` (first) + `retried_success`.

**Retry opt-out** (1): `retry: false` → 429 not retried; exactly
1 call.

**Prometheus output** (2): `bos_push_send_total{vendor, outcome}`
samples rendered correctly; HELP/TYPE lines present even with
zero samples.

Plus all 35 Phase 7.0/7.1/7.2 tests still pass — the telemetry +
retry layer is additive.

Full suite: **747 / 747 green** (was 731; +16 new).

## Consequences

- **Transient push failures heal automatically.** FCM's
  occasional 429s + Autopush's intermittent 503s no longer
  surface as user-visible failures — they retry and succeed.
- **`bos_push_send_total` gives ops the third leg of Web Push
  observability.** Phase 7.0 = delivery (binary), Phase 7.1 = per-
  event audit ledger, Phase 7.3 = per-vendor success-rate
  histogram. Three-axis health visibility identical to the SMS
  stack from Phase 5.3.
- **`retried_success` separates flapping from healthy.** A vendor
  with high `retried_success / success` ratio is degraded —
  available, but not nominal. Ops alert before user impact.
- **Bounded retry latency.** Worst-case `sendWebPush` blocks the
  caller for `60s + 30s + fetch timeout` ≈ 95s on a maximally
  hostile vendor. The `sendPushToIdentity` helper from Phase 7.1
  iterates subscriptions sequentially, so a degraded vendor on
  one subscription doesn't block others — but a worker with N
  subscriptions to degraded vendors waits N × 95s. Future polish
  (parallelism) addresses this; today's behavior is acceptable
  given push is best-effort + 5xx-degraded vendors are rare.
- **Backward-compatible.** All Phase 7.0/7.1/7.2 tests pass. The
  retry happens transparently; the result shape adds `retried`
  + `retryAfterMs` fields but doesn't remove anything.

## Future polish

- **Per-vendor circuit breaker** — `bos_push_circuit_state{vendor}`
  gauge mirroring Phase 5.4's SMS breaker. After N consecutive
  failures on a vendor, skip sends to it for M seconds.
  Diminishing returns because Bharat OS can't route between
  vendors (subscription owns the choice), but the gauge alone
  is useful telemetry.
- **In-flight gauge** — `bos_push_inflight{vendor}` mirroring
  Phase 5.8's SMS bulkhead. Catches a vendor that's holding
  connections open beyond timeout.
- **Adaptive retry budget** — exponential backoff across multiple
  retries instead of single retry. Trade-off: longer worst-case
  latency.
- **Multi-vendor parallelism** — `sendPushToIdentity` iterates
  sequentially. `Promise.all` would parallelise across a
  worker's paired devices.
- **Server-Sent Events alternative** — for users without push
  subscriptions, SSE to an open shell tab is a fallback delivery
  mechanism.
