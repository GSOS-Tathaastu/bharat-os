# ADR 0089: Phase 5.3 — SMS Fallback Chain + Per-Vendor Delivery Telemetry

## Status

Accepted

## Context

Phase 5.1 (ADR 0087) shipped real HTTP integrations for Gupshup,
MSG91, and Twilio. `BHARAT_OS_SMS_PROVIDER` selects exactly one
vendor. In production a single-vendor configuration means a 5-minute
Gupshup outage = 5-minute downtime for every OTP-dependent flow
(phone verify + Phase 5.0 account recovery + Phase 5.2 SIM-swap
defense). India SMS vendors regularly degrade for minutes-to-hours
under DLT scrubbing load or carrier-side throttling — single-vendor
launch is fragile.

Phase 5.1 also shipped the structured error contracts
(`SMS_PROVIDER_NOT_CONFIGURED` and `SMS_PROVIDER_REJECTED`) that
make a fallback chain feasible: both error codes are *recoverable
by retrying with a different vendor*. Phase 5.3 closes the
reliability gap by adding:

1. **Fallback chain provider** that walks an ordered list and
   returns the first success, falling through on the known
   recoverable error codes.
2. **Per-vendor delivery telemetry** so operators can observe
   which vendor in the chain succeeded — and tune order based on
   real-world delivery data.

These were both called out as Phase 5.1 future-work items (#2 and
#4).

## Decision

### Fallback chain provider

New factory in `src/phase0/sms-provider.mjs`:

```js
const chain = createFallbackProvider([gupshupProvider, msg91Provider, twilioProvider]);
await chain.send({ phone, body });
```

Behaviour:

- **First success wins.** The chain walks providers in order and
  returns the first `{ ok: true, ... }`.
- **Falls through on recoverable errors only.** `SMS_PROVIDER_
  NOT_CONFIGURED` and `SMS_PROVIDER_REJECTED` are recoverable —
  the next provider gets a try. *Any other error* (TypeError,
  network blowup, programmer bug) surfaces immediately so it isn't
  silently swallowed.
- **Result carries the walk.** The success response is augmented
  with `fallbackChain: [...names walked, winner]` and
  `fallbackAttempts: [{ provider, code, message }, …]` for the
  failures in front. Callers can log which vendor delivered.
- **Exhausted = aggregated error.** If every provider fails, the
  chain throws `SMS_PROVIDER_FALLBACK_EXHAUSTED` with an `attempts`
  array containing per-provider error codes + messages. The
  caller's catch handler can correlate against `/metrics` to
  decide alerting severity.

### `BHARAT_OS_SMS_FALLBACK_CHAIN` env var

When set (comma-separated provider names), `getSmsProvider()`
returns a chain instead of a single provider:

```
BHARAT_OS_SMS_FALLBACK_CHAIN=gupshup,msg91,twilio
```

- Overrides `BHARAT_OS_SMS_PROVIDER` when the explicit `name`
  argument to `getSmsProvider()` is absent.
- Unknown provider names → `Error` at lookup time (fail-fast).
- An explicit name argument always bypasses the chain (call sites
  that explicitly want one vendor still get one).

Recommended chains documented inline in `.env.example`:

- **India primary**: `gupshup,msg91` — both DLT-compliant onshore
- **India + intl backup**: `gupshup,msg91,twilio`
- **Cost-optimised**: `msg91,gupshup` (MSG91 first @ ₹0.12/SMS
  vs Gupshup @ ₹0.15/SMS)

### Per-vendor delivery telemetry

New counter in `src/phase0/metrics.mjs`:

```
bos_sms_send_total{provider, outcome}
```

Outcomes: `success` | `rejected` | `not_configured` | `error`.

Recorded by a module-internal `instrumentedProvider(provider)`
wrapper applied to every entry in the `PROVIDERS` table. Each
`send` either records a `success` outcome or maps the thrown
error's `code` to the matching outcome bucket. The fallback chain
calls the *wrapped* inner providers, so a chain walk produces one
counter increment per inner attempt — not just for the winner.

This is the operationally critical part: a chain that silently
falls through `gupshup → msg91` on every send means Gupshup is
broken and the operator needs to know. Without per-vendor
telemetry, the fallback hides the vendor outage; with it, the
counter ratios make outages obvious within minutes of scrape.

The metric joins the existing Prometheus text-exposition output
at `/metrics`. PromQL example:

```promql
# Gupshup failure rate, last 5 minutes:
rate(bos_sms_send_total{provider="gupshup",outcome="rejected"}[5m])
  / rate(bos_sms_send_total{provider="gupshup"}[5m])
```

A new module-level `smsCounterSnapshot()` returns a plain object
for testing; `resetMetrics()` now also clears the SMS counter
map.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| PII discipline | The fallback layer passes `phone` + `body` to inner providers verbatim. Neither the chain wrapper nor the telemetry recorder touches PII — outcomes are labels (`success` / `rejected` / `not_configured` / `error`) and provider names. No phone, no body, no OTP. |
| Vendor lock-in | The chain composes the same SMS-provider interface — the protocol layer above (`phone-otp.mjs`, `account-recovery.mjs`) is still completely vendor-agnostic. Adding a 4th provider is one entry in the `PROVIDERS` map. |
| Observability | `bos_sms_send_total` is aggregates per (provider, outcome) — never per user. Vendor message IDs are still logged (they're opaque tokens; ADR 0087 §15 binding). |
| Audit trail | The `account_recovery.completed` ledger event already records the masked phone + recoveryOtpId. The vendor that delivered the OTP isn't audited there because §15 says the audit trail records what the *user* did, not what the *vendor* did — vendor performance is `/metrics` material, not ledger material. |

## Tests

`tests/node/sms-fallback.test.mjs` — 16 tests:

**Fallback chain** (6 tests):
1. Rejects empty / invalid input
2. First success short-circuits with empty `fallbackAttempts`
3. Skips `not_configured` providers and uses the next
4. Skips `rejected` providers and uses the next
5. `SMS_PROVIDER_FALLBACK_EXHAUSTED` when every provider fails — carries `attempts` array + readable chain in error message
6. Re-throws *unexpected* errors (TypeError, etc.) WITHOUT continuing — silent fall-through would mask real bugs

**`getSmsProvider` integration** (4 tests):
7. `BHARAT_OS_SMS_FALLBACK_CHAIN` returns a fallback wrapper with `isFallback: true` + correct `providers[]` + readable `name`
8. Rejects unknown names in the chain (fail-fast at lookup)
9. Explicit `name` argument bypasses the chain even when env is set
10. `sendSms()` via the fallback env normalises phones correctly

**Telemetry** (6 tests):
11. `recordSmsAttempt` increments per (provider, outcome)
12. Silently drops unknown outcomes + empty provider names
13. `renderMetrics` exposes `bos_sms_send_total` samples in
    Prometheus text format
14. The log provider records `success` on each send
15. Not-configured providers record `not_configured` outcome
16. Fallback records telemetry for **every inner attempt**, not
    just the winner — the critical-path test

Full suite: **429 / 429 green** (was 413; +16 new). No SW change
(server-side only).

## Consequences

- **One vendor outage no longer blocks OTP flows.** Set
  `BHARAT_OS_SMS_FALLBACK_CHAIN=gupshup,msg91,twilio` and a
  5-minute Gupshup degradation routes through MSG91 transparently
  — the user sees a successfully delivered code, ops sees the
  Gupshup failure in `/metrics`, the protocol layer above
  doesn't know anything happened.
- **Operators can tune order from telemetry.** If MSG91 starts
  delivering 99.5% and Gupshup drops to 87%, swap
  `BHARAT_OS_SMS_FALLBACK_CHAIN=msg91,gupshup,twilio` and
  redeploy — no code change.
- **Vendor outages are observable, not invisible.** Without the
  per-attempt telemetry, the fallback would hide degraded
  vendors. With it, `bos_sms_send_total{provider, outcome}`
  surfaces every inner attempt — including the failures the
  chain swallowed.
- **Cost visibility is now meaningful.** The
  `bos_sms_send_total{provider="msg91",outcome="success"}` series
  multiplied by the published per-SMS cost gives ops a live cost
  estimate per vendor. (Cost-per-send is a Phase 5.1 future-work
  item; this is the substrate that makes it useful.)
- **Backward-compatible.** `BHARAT_OS_SMS_PROVIDER=gupshup` still
  works exactly as before. The chain is opt-in via the new env
  var.

## Future polish

- **Adaptive ordering** — when a provider's recent failure rate
  exceeds a threshold (e.g. 30% rejections in the last 1 minute),
  the chain auto-promotes the next vendor for a cooldown window.
  Today the chain order is static.
- **Per-route chain overrides** — recovery OTPs use the most
  reliable chain; bulk notifications could use the cheapest. A
  call-site override (`sendSms({ ..., chain: 'recovery' })`)
  picks from a named registry.
- **Webhook receivers for delivery receipts** (still pending from
  ADR 0087) — vendor delivery callbacks would extend
  `bos_sms_send_total` with a `delivered` outcome distinct from
  `success` (which today means "vendor accepted").
- **Cost telemetry** — emit `bos_sms_send_cost_paise_total` per
  provider so ops can run budget alerts.
- **Circuit breaker** — after N consecutive failures from a
  provider, skip it entirely for M seconds (faster than 3s of
  per-call timeout). Today every send pays the full failure
  latency on the broken vendor before trying the next.
