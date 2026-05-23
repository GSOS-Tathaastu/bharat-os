# ADR 0053: Worker Web Push Notification Scaffold

## Status

Accepted

## Context

Phase 2a queue item #4 in `BHARAT_OS.md` is Web Push for §9A worker
notifications. Labor matching only becomes useful if opted-in workers can get
job alerts on an installed PWA, but Bharat OS cannot persist raw Push endpoints
or keys casually because §15 keeps private data out of generic receipts.

## Decision

Add a Phase 2a.4 worker-notification scaffold:

- `src/phase1/worker-notification.mjs` creates push-subscription metadata
  records and worker-notification receipts.
- `BosStore` persists `push-subscriptions/` and `worker-notifications/`, with
  ledger events for `push_subscription.saved` and `worker_notification.queued`.
- The API exposes `GET/POST /api/push/subscriptions` and
  `GET/POST /api/worker-notifications`.
- `/shell/` adds a Worker alerts card. It requests browser notification
  permission, records current PushManager capability if present, and can trigger
  a local service-worker notification for demo.
- `public/shell/service-worker.js` handles future `push` events and
  notification clicks.

The scaffold stores endpoint hash, endpoint host, key-presence booleans, and
delivery status. It does **not** store raw Push endpoints, raw Push keys, exact
worker location, biometric material, or private identity material.

## Consequences

- Bharat OS can now show the §9A worker alert loop inside the PWA without
  adding native code or external dependencies.
- Real Web Push sending still needs VAPID key management, encrypted endpoint
  storage or a send-only queue, delivery retries, unsubscribe handling, and
  production push-service integration.
- Until VAPID delivery exists, the shell uses local service-worker
  notifications as the demo path while receipts mark `vapidIntegrated: false`.
