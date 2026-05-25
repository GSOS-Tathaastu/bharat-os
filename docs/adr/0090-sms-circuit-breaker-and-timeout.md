# ADR 0090: Phase 5.4 — SMS Per-Call Timeout + Circuit Breaker

## Status

Accepted

## Context

Phase 5.3 (ADR 0089) shipped the fallback chain so a `gupshup,msg91,
twilio` configuration survives a Gupshup outage. But the chain
walks providers one-by-one: every send pays the full Gupshup
call latency BEFORE trying MSG91. If Gupshup's `fetch` hangs for
30 seconds before returning a 503, every recovery OTP takes
30+ seconds during the outage.

There are two related gaps Phase 5.3 left open (explicit future-work
items in ADR 0089):

- **Per-call timeout** — `fetch` against a vendor that drops TCP
  packets can hang for the OS-default socket timeout (often
  >60s). The fallback chain can't trigger until the timeout
  fires.
- **Circuit breaker** — even with timeouts, every send still
  PROBES the broken vendor. Once a provider is known-broken, we
  should skip it entirely for some cooldown window instead of
  paying the timeout on every single call.

Phase 5.4 ships both as a single layer on the SMS-provider stack.

## Decision

### Per-call timeout

New helper `fetchWithTimeout(url, init, { timeoutMs, provider })`
in `src/phase0/sms-provider.mjs`. Wraps `fetch` with an
`AbortController` and rejects after `timeoutMs` with a structured
error:

```js
{
  message: 'gupshup send timed out after 3000ms',
  code: 'SMS_PROVIDER_REJECTED',
  provider: 'gupshup',
  providerResponse: 'timeout:3000ms',
  cause: <AbortError>
}
```

Mapping timeout → `SMS_PROVIDER_REJECTED` means the fallback chain
treats it the same as a vendor 5xx — recoverable, try the next
provider. Non-abort network errors (TypeError, connection reset)
get the same wrapping with `providerResponse: network:<message>`.

The gupshup / msg91 / twilio provider implementations swapped their
existing `await fetch(...)` calls for `await fetchWithTimeout(...,
{ provider: '<name>' })`. No other change to their request shape.

### Circuit breaker

New factory `createCircuitBreakerProvider(provider, options)`
applied (via internal `wrappedProvider`) to every entry in the
`PROVIDERS` map. Per-provider state:

```js
{ state: 'closed' | 'half_open' | 'open', consecutiveFailures, openedAt }
```

State transitions:

| From | Trigger | To |
|---|---|---|
| closed | REJECTED, `consecutiveFailures < threshold` | closed |
| closed | REJECTED, `consecutiveFailures >= threshold` | **open** (record `openedAt`) |
| closed / open / half_open | success | **closed** (reset counter) |
| closed / half_open | NOT_CONFIGURED | unchanged (config doesn't open the circuit) |
| open | call attempted, `now - openedAt < openMs` | open (throw `SMS_PROVIDER_CIRCUIT_OPEN`) |
| open | call attempted, `now - openedAt >= openMs` | **half_open** (let one probe through) |
| half_open | success | closed |
| half_open | REJECTED | **open** (single failure re-opens) |

Defaults — chosen for typical India-SMS API latencies (responses
in <500ms; >3s ≈ outage):

- `failureThreshold` = 5 consecutive REJECTED failures
- `openMs` = 30_000 ms cooldown before half-open probe
- `timeoutMs` = 3000 ms per `fetch` call

Tunable via env:

```
BHARAT_OS_SMS_TIMEOUT_MS=3000
BHARAT_OS_SMS_CIRCUIT_THRESHOLD=5
BHARAT_OS_SMS_CIRCUIT_OPEN_MS=30000
```

### NOT_CONFIGURED is not a vendor failure

A provider missing env vars throws `SMS_PROVIDER_NOT_CONFIGURED`.
The circuit breaker explicitly does NOT count this toward the
failure threshold — config issues don't auto-heal in 30 seconds.
The fallback chain still treats NOT_CONFIGURED as recoverable
(routes to next), but the breaker for that provider stays
`closed`. This means an unconfigured Karix in a chain doesn't
cause a meaningless `bos_sms_circuit_state{provider="karix"} 2`
to page ops.

### Fallback chain integration

The chain treats `SMS_PROVIDER_CIRCUIT_OPEN` as a recoverable
error code alongside `SMS_PROVIDER_REJECTED` and
`SMS_PROVIDER_NOT_CONFIGURED`. When Gupshup's circuit opens, the
NEXT call returns immediately with `CIRCUIT_OPEN`, the chain
falls through to MSG91 without paying network latency, and ops
sees `bos_sms_circuit_state{provider="gupshup"} 2` in `/metrics`.

### `bos_sms_circuit_state` gauge

New Prometheus gauge in `src/phase0/metrics.mjs`:

```
# HELP bos_sms_circuit_state SMS provider circuit-breaker state. 0 = closed, 1 = half-open, 2 = open.
# TYPE bos_sms_circuit_state gauge
bos_sms_circuit_state{provider="gupshup"} 2
bos_sms_circuit_state{provider="msg91"} 0
bos_sms_circuit_state{provider="twilio"} 0
```

Recorded on every transition via `recordCircuitState(provider,
state)`. Alert rule: `bos_sms_circuit_state >= 2 for 1m`.

### `resetCircuit(name?)` ops helper

When a vendor confirms recovery and ops doesn't want to wait for
the breaker's natural half-open probe, `resetCircuit('gupshup')`
clears the state and re-emits the closed gauge. Called with no
arg it resets every provider. Exposed for tests + future ops
tooling; not yet wired to an admin endpoint.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| PII discipline | `fetchWithTimeout` passes through phone + body to vendor unchanged; the timeout wrapper itself never touches PII. Telemetry records `provider` + `outcome` enum + numeric circuit state — no phone, no body, no OTP. |
| No detection evasion | The breaker DOES skip calls, but ops always sees what happened: every skip-by-circuit increments nothing (no false `success`); state transitions are recorded in `bos_sms_circuit_state`. A flapping vendor is visible as `state = 2` for the open window, then `1` during probes, then `0` if it recovers. |
| Vendor lock-in | Breaker layer is module-internal and applies the same SMS-provider interface — adding a 6th vendor is still one entry in the `PROVIDERS` map. |
| Audit trail | Recovery / phone-verify ledger events are unchanged. The breaker is operational observability, not user-facing record-keeping. |

## Tests

`tests/node/sms-circuit.test.mjs` — 12 tests:

**fetchWithTimeout** (3 tests):
1. Aborts after the configured timeout, throws `SMS_PROVIDER_REJECTED` with `timeout:Xms` response and `AbortError` cause
2. Passes fast successful responses through unchanged
3. Wraps non-abort network errors as `SMS_PROVIDER_REJECTED`

**Circuit breaker** (5 tests):
4. Opens after N consecutive `REJECTED` failures; next call throws `SMS_PROVIDER_CIRCUIT_OPEN`
5. `NOT_CONFIGURED` failures do NOT open the circuit even past threshold
6. A single success resets the consecutive-failure counter mid-stream
7. Open → half-open after `openMs`; probe success closes the circuit
8. Half-open probe failure re-opens the circuit immediately

**Integration** (4 tests):
9. Fallback chain treats `CIRCUIT_OPEN` as recoverable and falls through to the next provider
10. `renderMetrics` exposes `bos_sms_circuit_state` gauges per provider
11. `resetCircuit` clears state and re-emits closed gauge; provider is callable again
12. `sendSms()` end-to-end smoke: built-in providers are wrapped correctly (Karix `NOT_CONFIGURED` doesn't open the circuit)

Full suite: **441 / 441 green** (was 429; +12 new). No SW change
(server-side only).

## Consequences

- **A broken vendor's failure latency stops mattering after the
  threshold.** Once Gupshup's circuit opens, fallback to MSG91
  takes microseconds — no 3-second `fetch` wait per send. Recovery
  OTPs go out at the speed of the SECOND vendor, not the first.
- **Outages are visible AND auto-recovering.** The half-open probe
  means a brief Gupshup blip self-heals within 30s without
  operator action. A sustained outage just stays open, with the
  gauge `bos_sms_circuit_state{provider="gupshup"} 2` paging ops.
- **Config issues stay distinct from outages.** Karix stub
  throwing `NOT_CONFIGURED` doesn't pollute the
  circuit-state dashboard — its gauge stays at 0 (closed) because
  config errors don't decay.
- **Composes cleanly with Phase 5.3.** The fallback chain treats
  circuit-open as just another recoverable error; nothing else in
  the call stack (account-recovery, phone-otp, /api/recovery/start)
  needs to know circuit breakers exist.
- **Tunable per deployment.** Three env vars cover the operational
  knobs. Defaults are sane for India-SMS; an international
  deployment with higher inherent latency can raise
  `BHARAT_OS_SMS_TIMEOUT_MS` without code change.

## Future polish

- **Bulkhead per provider** — limit in-flight concurrent calls per
  provider so one slow vendor can't exhaust the event loop. Today
  there's no concurrency cap.
- **Exponential backoff on `openMs`** — first open = 30s, second
  open within an hour = 2min, third = 8min. A vendor that keeps
  flapping gets longer cooldowns automatically.
- **Per-provider timeout overrides** — Twilio's international
  routes have higher inherent latency; allow `BHARAT_OS_SMS_TIMEOUT_
  MS_TWILIO` overrides per provider.
- **Admin endpoint for `resetCircuit`** — currently the helper is
  exported but not wired to `/api/admin/...`. A signed-ops endpoint
  would let an SRE lift the cooldown via the API instead of
  redeploying.
- **Breaker decisions in the ledger** — for high-value flows, the
  fact that a recovery OTP was sent via Twilio because Gupshup's
  breaker was open is audit-relevant. Today it's only in metrics.
