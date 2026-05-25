# ADR 0103: Phase 7.2 — §9A Worker-Notification VAPID Delivery

## Status

**Accepted — shipped.** Closes ADR 0053's `vapidIntegrated: false`
gap. Phase 2a.4 (Aug 2025) scaffolded the §9A worker-notification
envelope but stopped at local service-worker notifications because
real Web Push didn't exist. Phase 7.0 (ADR 0101) built the Web Push
implementation; Phase 7.1 (ADR 0102) extracted the reusable
`sendPushToIdentity` helper. Phase 7.2 wires them together.

## Context

ADR 0053 ended with:

> Real Web Push sending still needs VAPID key management, encrypted
> endpoint storage or a send-only queue, delivery retries,
> unsubscribe handling, and production push-service integration.
>
> Until VAPID delivery exists, the shell uses local service-worker
> notifications as the demo path while receipts mark
> `vapidIntegrated: false`.

All of those prerequisites now exist:

- **VAPID key management** — Phase 7.0 + `scripts/generate-vapid-keys.mjs`.
- **Endpoint storage** — Phase 7.0's `storeDeliveryKeys: true`
  opt-in on push-subscription records.
- **Delivery retries + unsubscribe** — Phase 7.1's
  `sendPushToIdentity` handles 410 Gone auto-cleanup; future
  Phase 7.3 covers adaptive retry.
- **Production push-service integration** — `sendWebPush` calls
  any RFC 8030 endpoint (FCM, Autopush, Microsoft, etc.).

Phase 7.2 is a small wire-up.

## Decision

### `POST /api/worker-notifications` now delivers real Web Push

When the API handler creates a worker-notification, it now also
calls `sendPushToIdentity` with a `worker_job_alert` payload. The
notification record's `delivery` block is updated based on the push
outcome:

- **`storeDeliveryKeys: true` subscription exists + push succeeds**
  → `delivery: { status: 'delivered_web_push', vapidIntegrated:
  true, sent: true, sentToEndpoints: N, reason: null }`. HTTP 201.
- **Push attempted but all failed (network / 5xx)** → `delivery: {
  status: 'web_push_failed', vapidIntegrated: true, sent: false,
  reason: 'N push delivery failure(s)' }`. HTTP 502.
- **Scaffold-only subscription (no delivery keys)** → falls back
  to Phase 2a.4's `queued_local_notification` state; nothing
  pushed. HTTP 201. **Backward-compatible with ADR 0053.**
- **No subscription at all** → Phase 2a.4's
  `blocked_no_subscription` state. HTTP 202.
- **VAPID unset entirely** → `sendPushToIdentity` returns
  `{ skipped: true }` silently; notification stays in the
  scaffold's `queued_local_notification` state. HTTP 201. Graceful
  degradation.

### Notification urgency maps to push urgency

`notification.content.urgency === 'high'` → push HTTP header
`Urgency: high`. Anything else → `Urgency: normal`. Lets the push
service prioritise truly time-sensitive job alerts (delivery slot
about to expire) over routine ones (new job match).

### §15 binding: notification content passes verbatim into the push body

The §9A worker-notification envelope already enforces no-PII in
the `content.title` + `content.body` per ADR 0053 (`exactLocationIncluded:
false` etc.). Phase 7.2 passes these strings verbatim into the
push payload. **Callers MUST continue to pass behavioural cues +
masked identifiers, never raw addresses / phones / Aadhaar refs.**
Same contract as Phase 7.1's recovery/cooldown/mesh/MFI alerts.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| No PII in push body | §9A enforces no-PII on `content.title` + `content.body` at the envelope layer. Phase 7.2 passes through verbatim. |
| Audit trail | `sendPushToIdentity` emits `worker_notification.pushed` (or `.failed`) ledger event per delivery attempt, with masked endpoint + payloadType. |
| Graceful degradation | VAPID unset → scaffold mode (Phase 2a.4 local-notification path); no exception, no error log. |
| Backward-compat | Scaffold-only subscriptions (no `storeDeliveryKeys`) continue to operate exactly as Phase 2a.4 specified. ADR 0053 surfaces unchanged. |
| DPDP §12(3) cascade | `worker_notifications` table is already in the cascade (Phase 2a.4). Phase 7.2 adds no new tables. |
| Per-subscription failure isolation | One failed push doesn't break the notification creation — `sendPushToIdentity` swallows errors per-subscription and aggregates. |

## Tests

`tests/node/worker-notification-push.test.mjs` — 5 tests:

1. **Real Web Push delivered** — register subscription with
   `storeDeliveryKeys: true` → POST worker-notification →
   `push.mock` hit with valid `Authorization: vapid t=...` header →
   notification record has `vapidIntegrated: true,
   status: 'delivered_web_push', sentToEndpoints: 1` →
   `worker_notification.pushed` ledger entry with masked endpoint.

2. **No subscription** — POST worker-notification with no
   registered subscription → HTTP 202 + `delivery.status:
   'blocked_no_subscription'`.

3. **Scaffold-only fallback** — register WITHOUT
   `storeDeliveryKeys` → POST worker-notification → no push.mock
   call → notification.delivery.vapidIntegrated stays false →
   Phase 2a.4 local-notification path preserved.

4. **VAPID unconfigured graceful degradation** — VAPID env vars
   unset → no push attempted → notification still created →
   `vapidIntegrated: false`.

5. **Urgency mapping** — `urgency: 'high'` in the notification
   body → `Urgency: high` HTTP header on the push request.

Full suite: **731 / 731 green** (was 726; +5 new).

## Consequences

- **§9A loop is fully operational.** A blue-collar worker who
  installs Bharat OS + grants notification permission + has a
  delivery-keyed subscription now actually receives job alerts on
  their device. The Phase 2a.4 demo state is gone.
- **Two pre-existing scaffolds unchanged.** ADR 0053's
  local-notification fallback path still works for callers who
  don't pass `storeDeliveryKeys: true`. No client-side breakage.
- **Pushes graceful degrade to scaffold mode without VAPID** —
  deployments that haven't configured VAPID continue to create
  notification records; they just stay in
  `queued_local_notification`. No 500s.
- **Audit story is consistent.** `worker_notification.pushed`
  ledger event slots into the same `*.pushed` family as
  Phase 7.0/7.1's events. Operators see the full notification
  timeline.

## Future polish

- **Locale-aware push payloads** — currently the title + body are
  passed verbatim. A Phase 7.x could translate based on the
  notification's `locale` field using Phase 4.5's i18n module.
- **Click-through deep-linking** — push payloads could include a
  `bharat-os://job/<jobReference>` deep link so tapping the
  notification opens the worker app at the job.
- **Bulk job-alert API** — for an aggregator-style caller
  notifying 100 nearby riders, a single POST with an array of
  workerIds + a shared payload would be more efficient than 100
  separate POSTs.
- **§9A delivery-receipt webhook** — when a worker taps "accept"
  or "decline" on a job, push the response back to the aggregator
  via a webhook. Closes the loop the other way.
- **Phase 7.3 retry + metrics** — adaptive retry on 429 +
  `bos_push_send_total{result}` Prometheus counter (ADR 0101's
  future-work). Phase 7.2 stops at "delivered or audit-failed";
  Phase 7.3 adds reliability + observability layers.
