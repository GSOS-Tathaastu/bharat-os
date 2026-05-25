# ADR 0111: Phase 8.4 — Shell UI for Push Subscription Opt-In (Activates Phase 7.x)

## Status

**Accepted — shipped.** Final UI commit in the Phase 8 arc. Upgrades
the Phase 2a.4 worker-alert scaffold into a real VAPID Web Push
opt-in card and adds a worker-initiated "Turn off notifications"
flow. Activates the Phase 7.0 / 7.1 / 7.2 / 7.3 push substrate
end-to-end for any operator with VAPID configured.

## Context

Phase 7.0 (ADR 0101) shipped from-scratch VAPID Web Push (RFC 8292
+ 8030 + 8291 + 8188) — JWT signing, AES-128-GCM payload
encryption, the `/api/push-public-key` endpoint, server-side
`sendWebPush`. Phase 7.1 wired pushes into SIM-swap recovery
verification and mesh-withdrawal terminal transitions. Phase 7.2
extended delivery into §9A worker-notification flows. Phase 7.3
added retry-on-429/5xx + `bos_push_send_total{vendor, outcome}`
telemetry.

But on the device side, the shell still spoke to push the same way
Phase 2a.4 (ADR 0053) wrote it: call `pushManager.getSubscription()`
(read-only — never *creates* a subscription), POST to
`/api/push/subscriptions` **without `storeDeliveryKeys: true`**, so
the server records a `local_notification` shell-only fallback. No
real Web Push ever leaves the operator's server because the
subscription record has no endpoint + keys to send to.

Phase 8.4 closes the loop:

1. Shell fetches the operator's VAPID public key.
2. If configured, shell calls `pushManager.subscribe({
   userVisibleOnly: true, applicationServerKey })` to create a
   real browser-side subscription.
3. POSTs the resulting endpoint + p256dh + auth with
   `storeDeliveryKeys: true`.
4. Operator can now actually `sendWebPush` to this worker.

And in parallel, the card grows two long-missing pieces:

- A worker-initiated **disable** flow ("Turn off notifications") —
  Phase 2a.4 had no opt-out short of clearing site data.
- An honest **mode chip** ("Real Web Push (VAPID)" vs "Local
  notifications only") so the worker sees whether the operator
  has actually wired delivery, instead of a vague "enabled"
  state that lies in the local-only case.

## Decision

### Upgraded `#workerAlertSection` card (Profile tab)

Layout:

- **Header**: "🔔 Bharat OS notifications" (renamed from "Job
  alerts" — the card now covers recovery + cash-out + worker-job
  pushes, not just jobs) + status caption (`Off` / `Local` /
  `Web Push`).
- **Intro copy**: explains the VAPID/local fallback honestly + the
  worker-initiated opt-out promise.
- **`.push-opt-in-list`**: three-item bullet list naming exactly
  what they'll be notified about, mapped to the underlying phases:
  - 🔑 Account recovery — Phase 7.0 / SIM-swap success + cooldown
    clear.
  - 💰 Mesh cash-out updates — Phase 7.1 / withdrawal terminal
    transitions.
  - 🛠 Nearby work alerts — Phase 7.2 / §9A worker-notifications.
- **`#workerAlertMode`**: post-subscribe panel showing the real
  mode (green "Real Web Push (VAPID)" with the encryption
  honest-line, or amber "Local notifications only" explaining
  the operator hasn't configured VAPID yet).
- **Actions row**: `[Enable notifications]` (turns into
  `[Re-subscribe]` once subscribed) + `[Test alert]`.
- **Disable row** (hidden until subscribed): `[Turn off
  notifications]` link button gated by `window.confirm`.
- **`.push-opt-in-details`** collapsible explaining how Web Push
  works on Bharat OS: the endpoint + two keys, server-only-can-
  send-because-VAPID, AES-128-GCM RFC 8291 payload encryption,
  delete-on-opt-out promise.

### `enableWorkerAlerts()` rewrite in `app.js`

Notable bits:

- **VAPID public-key fetch first** via `fetchVapidPublicKey()`.
  Returns `null` on 503 (`push_disabled`) without throwing —
  fallback path stays open.
- **Stale-subscription clearing** before subscribe: when the
  operator rotates VAPID keys, the existing browser subscription
  is tied to the old key. We `unsubscribe()` first, then
  `subscribe()` fresh with the new `applicationServerKey`. Stops
  silent "subscribed but operator-can't-send" drift.
- **`urlBase64ToUint8Array()`** helper for the standard VAPID
  key-encoding dance (replace `-/_` → `+/`, atob, fill
  Uint8Array).
- **Honest fallback** on `pushManager.subscribe()` failure
  (private-mode Safari rejects, server rejects key, browser
  doesn't support push): catches the error, logs a console
  warning, falls through to POST without `storeDeliveryKeys` so
  the local-only path still works. The mode chip then shows
  amber-honest "Local notifications only" instead of green.
- **`storeDeliveryKeys: true`** only when all three pieces
  (endpoint + p256dh + auth) are present from the real
  subscription. Server defends this in `createPushSubscriptionRecord`
  (`willStore = storeDeliveryKeys && hasEndpoint && hasFullKeys`)
  but the UI gates it too so the request body is honest.

### `disableWorkerAlerts()` (new)

- **Confirmation gate** matching Phase 8.2 revoke + Phase 8.3
  cash-out + Phase 2a.26 reset patterns.
- **Browser-side unsubscribe FIRST**, then server-side DELETE.
  Reversing the order would race the operator's next push attempt
  against the server-side delete; this order ensures the browser
  push service forgets us before the server forgets the endpoint.
- **Idempotent server response**: 200 on first delete, 404 on
  retry, both with `{ ok, deleted, subscriptionId }`. UI shows
  "Notifications turned off" either way (the user's intent is met).
- Mode chip + disable button + enable-button label all reset to
  the "Off" state via `updateWorkerAlertStatus()`.

### `DELETE /api/push/subscriptions/:subscriptionId` (new server route)

- Reuses the existing `store.deletePushSubscription` (was added in
  Phase 7.0 for the 410-Gone auto-cleanup path; this just gives it
  a worker-facing entrypoint).
- Emits a `push_subscription.deleted` ledger event so the audit
  trail records both the create AND the delete; matches the
  `push_subscription.saved` event emitted on POST.
- File-store `store.mjs` got the same `deletePushSubscription`
  method for backend parity (sqlite-store already had it).
- **§15**: possession of the `subscriptionId` from the worker's
  own `GET /api/push/subscriptions?identityId=…` is the
  authorization — same posture as Phase 6.1 MFI consent revoke
  (no bearer token, scope is owner-of-identity).

### CSS

New rules in `styles.css`:

- `.push-opt-in-list` — minimal-styled `<ul>` for the
  bullets-with-bold-prefix layout.
- `.push-opt-in-mode` + `.push-opt-in-mode-real` (green
  `#ecfdf5` background, `#10b981` left border) +
  `.push-opt-in-mode-local` (amber `#fff7ed` background,
  `#f59e0b` left border) — colour palette matches the
  Phase 8.2 / 8.3 status-badge family.
- `.push-opt-in-disable` — centred row for the link button.
- `.push-opt-in-details` — quieter typography for the
  "How push works" collapsible (`12px`, muted text colour).

### SW cache → v34

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Real-push requires explicit worker action | Subscribe only on `[Enable]` tap → `Notification.requestPermission` browser prompt. No silent subscribe. |
| Server can't send unless worker opted in | `storeDeliveryKeys: true` only when the worker successfully subscribed via `pushManager.subscribe`. Without it the server holds a `local_notification` placeholder it can't push to. |
| Worker-initiated disable is one tap + confirm | `[Turn off notifications]` → `window.confirm` → browser `unsubscribe()` + server DELETE in one flow. No buried setting. |
| Disable removes the endpoint from the server immediately | DELETE deletes the row + emits `push_subscription.deleted` ledger event. Server has zero ability to push to this worker after the call returns. |
| Operator-without-VAPID can't accidentally store delivery keys | `/api/push-public-key` returns 503; shell skips the real-subscribe branch; POST without `storeDeliveryKeys`; server defends with `body.storeDeliveryKeys === true && !readVapidConfig() → 503` (Phase 7.0 ADR 0101). |
| Honest mode disclosure | The post-subscribe mode chip shows green "Real Web Push (VAPID)" OR amber "Local notifications only" — never a vague "Enabled" that lies in the local-only case. |
| Push body still AES-128-GCM encrypted in transit | The "How push works" collapsible spells out RFC 8291 — the worker isn't told to trust the server blindly. |
| Audit trail covers create AND delete | `push_subscription.saved` (Phase 7.0) + `push_subscription.deleted` (Phase 8.4) ledger events bracket the subscription lifecycle. |

## Tests

`tests/node/api.test.mjs` updated: the "Job alerts" copy assertion
became "Bharat OS notifications" to match the renamed card. All
existing Phase 7.x push tests still pass (`push-alerts.test.mjs`,
`push-retry-telemetry.test.mjs`, `web-push.test.mjs`,
`worker-notification-push.test.mjs` — 51/51).

**No new automated browser tests** — same pattern as Phase
8.0/8.1/8.2/8.3 (codebase has no browser-test infrastructure).

Live smoke verification:
- `GET /api/push-public-key` returns 503 with `push_disabled` when
  VAPID isn't configured (the fallback path the UI handles).
- `GET /shell/` 200; HTML contains `Bharat OS notifications`,
  `push-opt-in-list`, `workerAlertDisableButton`, "How push works
  on Bharat OS".
- `POST /api/push/subscriptions` with `endpoint: null` creates a
  `local_notification` subscription with
  `subscriptionId: bos:push-subscription:defbf24…`.
- `DELETE /api/push/subscriptions/<id>` returns
  `{ ok: true, deleted: true, subscriptionId }` on first call.
- `DELETE` again returns HTTP 404 with `{ ok: false, deleted:
  false }` — idempotent.
- Full Node suite: **747/747 still pass** (run in batches of 15
  files to dodge Windows process-spawn OOM hitting parallel
  `--test` runners).

## Consequences

- **Phase 7.x ships ENABLED.** Until Phase 8.4, every Phase 7 wire
  was technically present but practically dark: no shell-issued
  subscription ever carried delivery keys, so `sendWebPush` had
  nothing to send to. A SIM-swap recovery succeeding wouldn't
  actually push the worker. A `paid` withdrawal wouldn't ring
  their phone. A `provider_accepted` cash-out wouldn't appear in
  the system notification tray. Phase 8.4 flips the switch.
- **End-to-end demo path for the trust + earn + alert loop.**
  Worker enables notifications → operator marks a withdrawal
  `paid` from the jumphost → worker's phone rings with the
  cash-out alert + the Phase 8.3 history list updates on next
  refresh. Investor demo can show the full closed loop.
- **Phase 8 shell arc is done.** 8.0 earnings log → 8.1 mesh
  dashboard → 8.2 MFI consent → 8.3 cash-out → 8.4 notifications.
  Every Phase 5.9–7.3 backend substrate that needed worker-facing
  UI now has it. The next ship can move to Phase 9.0 (Tier-4 SLM)
  or Phase 10.0 (labeling marketplace) without leaving behind
  "API done, UI missing" debt.
- **`push_subscription.deleted` ledger event** completes the audit
  trail. Existing Phase 7.0 ledger queries that filtered to
  `push_subscription.saved` will now naturally see the delete
  counterpart — useful for "how many active subscriptions does
  this operator hold right now" without scanning the live store.
- **Honest mode disclosure** sets the precedent for any future
  capability-vs-fallback UI (e.g., Phase 9.0 SLM "Real on-device
  AI" vs "Cloud fallback"). The pattern: the chip names the
  actual mode, the body copy says what it means for the user.

## Future polish

- **i18n** — copy is English-only. Same gap as the rest of the
  Phase 8 arc; resolves alongside Phase 1.37 vernacular
  expansion.
- **Per-category opt-in** — today's button is all-or-nothing. A
  future version could let the worker enable cash-out alerts but
  not worker-job alerts. Storage shape (`push_subscription_record`)
  would need a `categories` array; server would gate the
  `sendPushToIdentity` call site by category.
- **Subscription health surface** — Phase 7.3 records
  `bos_push_send_total{vendor, outcome}` per send. A future
  Profile-tab panel could surface the worker's own delivery
  success rate ("last 30 pushes: 28 delivered, 2 dropped by
  fcm.googleapis.com") so they can decide whether to re-subscribe.
- **Server-pushed re-subscribe** — if Phase 7.x notices repeated
  `410 Gone` from a worker's endpoint, today it auto-cleans the
  record. A future enhancement could push the **shell** itself
  (via a separate channel or on next open) to re-subscribe.
- **Per-device subscription roster** — a worker on multiple
  devices today gets multiple subscriptions; the test alert + the
  recovery alert fan out to all of them, which is correct, but
  there's no UI to see the list of "your subscribed devices."
  Could grow into a dedicated panel.
- **Background sync** — Phase 8.4 surfaces push only.
  ServiceWorker Background Sync API for queued POSTs (e.g.,
  cash-out request when offline) is a different worker-facing
  feature; out of scope here.
