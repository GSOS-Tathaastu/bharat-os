# ADR 0087: Phase 5.1 — Real SMS Provider HTTP Integrations

## Status

Accepted

## Context

Phase 4.3 (ADR 0082) shipped the SMS provider abstraction with a
`log` provider for dev + stubs for `gupshup` / `msg91` / `karix`
/ `twilio` that threw "configure env vars first." Phase 5.0
(ADR 0086) used the abstraction for account recovery — but
without a real SMS path, neither phone verification nor recovery
actually reaches the user.

Phase 5.1 implements the real HTTP integrations against the
vendor APIs that don't need partner credentials to spec against
(Gupshup, MSG91, Twilio all have public API docs). Karix
remains a stub because their docs require a partner login.

When a vendor contract arrives, the launch operator sets the
matching env vars and the recovery flow starts sending real SMS
— **zero code change required**.

## Decision

### Three real providers + Karix stub

**Gupshup** — India-onshore, DLT-compliant. Sends via
`https://media.smsgupshup.com/GatewayAPI/rest` with credentials
in the query string. Required env vars:

```
BHARAT_OS_SMS_GUPSHUP_USERID
BHARAT_OS_SMS_GUPSHUP_PASSWORD
BHARAT_OS_SMS_GUPSHUP_SOURCE             ← DLT-registered sender ID
BHARAT_OS_SMS_GUPSHUP_PRINCIPAL_ENTITY_ID  (optional, DLT)
BHARAT_OS_SMS_GUPSHUP_TEMPLATE_ID         (optional, DLT template)
```

Response parsing tolerates both "success | <id>" text format
and the JSON `{ response: { status, id } }` format Gupshup
occasionally returns.

**MSG91** — cost-effective high-volume India SMS. Sends via
`https://control.msg91.com/api/v5/send` (or `/api/v5/flow` when
`BHARAT_OS_SMS_MSG91_FLOW_ID` is set for DLT templates). Auth via
`authkey` header. Required:

```
BHARAT_OS_SMS_MSG91_AUTH_KEY
BHARAT_OS_SMS_MSG91_SENDER_ID            ← 6-char DLT sender
BHARAT_OS_SMS_MSG91_FLOW_ID              (optional, DLT template)
```

When using the flow API, the provider auto-extracts the
6-digit OTP code from the body and passes it as the `OTP`
template variable (Gupshup / MSG91 templates typically reference
the OTP this way).

**Twilio** — international fallback (US / EU / SEA). Standard
Basic-auth + form-encoded body. Detects Messaging Service SIDs
(starts with `MG`) vs plain numbers. Required:

```
BHARAT_OS_SMS_TWILIO_ACCOUNT_SID
BHARAT_OS_SMS_TWILIO_AUTH_TOKEN
BHARAT_OS_SMS_TWILIO_FROM               ← +1XXX… or MGservice…
```

**Karix** — left as a stub. Their API requires partner-portal
access we don't have public docs for. Same shape as the others
when implemented.

### Structured error contracts

Every provider returns either:
- **Success:** `{ ok: true, providerMessageId, provider }`
- **Configuration failure:** `Error` with `code:
  'SMS_PROVIDER_NOT_CONFIGURED'`, `provider`, and `missing`
  (the list of required env vars)
- **Vendor rejection:** `Error` with `code:
  'SMS_PROVIDER_REJECTED'`, `provider`, `providerResponse`
  (truncated body), and (Twilio only) `providerStatusCode`

This gives the API handler enough structure to surface
actionable messages to the user and ops while never leaking
PII (no phone number, no OTP body in the error).

### Phone number formatting per vendor

- **Gupshup + MSG91**: strip leading `+`, use `91XXXXXXXXXX`.
- **Twilio**: use full E.164 `+1XXX…`.

`normalisePhone` from Phase 4.3 produces E.164; each provider
strips/keeps the `+` as the vendor needs.

### `.env.example` updated

Real provider env vars now documented inline with sign-up URLs,
DLT requirements, and the production-vs-dev guidance for
template IDs.

### No service-worker change

These are server-side changes only.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| PII discipline | The Phase 4.3 logger never sees plaintext OTP. Vendor request URLs / bodies include the phone + OTP, but they're sent over TLS to the configured vendor only — no in-transit observability surface for them. |
| Logging | The `sms.outgoing` log line emits `phoneMasked` + `bodyLength` + `provider` only. Vendor message IDs are logged (they aren't PII; they're opaque tokens). |
| Vendor lock-in | Switching providers is a one-env-var change — the protocol layer above (`phone-otp.mjs`, `account-recovery.mjs`) is provider-agnostic. |

## Tests

`tests/node/sms-providers.test.mjs` — 14 tests using
`global.fetch` mocking + env-var stubbing:

**Gupshup** (4 tests):
1. Rejects with structured error when credentials missing
2. Success path: URL contains credentials + `send_to` without `+`
3. Failure path: "error | <reason>" surfaces structured error
4. JSON response format also accepted

**MSG91** (4 tests):
5. Rejects when credentials missing
6. Success path: POST to `/api/v5/send` with `authkey` header
7. `FLOW_ID` set → uses `/api/v5/flow` + extracts OTP digits
8. Vendor rejection → structured error

**Twilio** (4 tests):
9. Rejects when credentials missing
10. Success path: Basic auth + form body + accountSid in URL
11. `FROM` starting with `MG` → uses `MessagingServiceSid`
12. Vendor rejection includes `providerStatusCode`

**Dispatch** (2 tests):
13. `sendSms()` honours `BHARAT_OS_SMS_PROVIDER` env var
14. Karix still throws SMS_PROVIDER_NOT_CONFIGURED

Full suite: **399 / 399 green** (was 385; +14 new).

## Consequences

- **Launch deploy is now provider-config, not code-change.** When
  the Gupshup/MSG91/Twilio contract arrives, set 3-5 env vars
  and the recovery flow sends real SMS. Phase 5.0 was the
  protocol; Phase 5.1 closes the wire.
- **Three vendors, one switch.** `BHARAT_OS_SMS_PROVIDER=gupshup`
  routes through Gupshup's onshore-India servers; `=msg91` uses
  MSG91's higher-volume path; `=twilio` falls back to
  international SMS. Switching is one env var.
- **DLT-compliance ready.** The Gupshup + MSG91 implementations
  accept template IDs as env vars — TRAI's DLT registry
  requires registered templates for transactional / OTP SMS in
  India, and Phase 5.1 surfaces those slots so the launch
  operator can wire them.
- **Structured errors mean clean ops alerting.** Vendor failures
  surface as `SMS_PROVIDER_REJECTED` (transient — retry); config
  failures as `SMS_PROVIDER_NOT_CONFIGURED` (operator action
  needed). Prometheus + log filters can split on these without
  parsing message text.
- **399 / 399 tests**, no SW change.

## Future polish

- **Karix integration** when a partner contract lands.
- **Vendor fallback chain** — try gupshup, fall through to msg91,
  fall through to twilio on consecutive failures. Today
  `BHARAT_OS_SMS_PROVIDER` selects exactly one.
- **DLT template registry per locale** — `BHARAT_OS_SMS_GUPSHUP_TEMPLATE_ID`
  is a single value today; production probably wants per-locale
  templates (Hindi script template + Latin script template for
  OTP delivery).
- **Per-vendor delivery telemetry** — track success rate per
  vendor in `/metrics` so ops can detect vendor-side outages
  before users notice.
- **Webhook receivers for delivery receipts** — vendors POST
  delivery-status callbacks to a configured URL. Wiring this
  lets the audit ledger record actual delivery, not just
  acceptance.
- **Cost telemetry** — log estimated cost per send for ops
  budget visibility (Gupshup ₹0.15/SMS, MSG91 ₹0.12/SMS,
  Twilio international ~₹0.50/SMS).
- **Encrypted credential vault** — env vars in plaintext are
  fine for single-tenant launch; multi-tenant production wants
  secrets via Vault / AWS Secrets Manager / GCP Secret Manager.
