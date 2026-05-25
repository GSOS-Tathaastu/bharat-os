# ADR 0101: Phase 7.0 — Web Push (VAPID) Notifications, Implemented from Scratch

## Status

**Accepted — shipped.** First phase past the ADR 0096 growth-arc.
Implements RFC 8030 (Web Push), RFC 8291 (message encryption), and
RFC 8292 (VAPID identification) on Node 20+'s built-in `crypto`.

## Context

The SIM-swap defense from Phase 5.2 (ADR 0088) gates destructive
actions for 24h after a recovery completes, but the legitimate
user only KNOWS their account was recovered when they next log in.
ADR 0088's future-polish list called out:

> **Push notification on recovery** — notify paired devices via
> push the moment `account_recovery.completed` fires.

The Phase 2a.4 worker-notification scaffold (ADR 0053) shipped the
subscription envelope but explicitly defaulted `rawEndpointStored:
false`, `rawKeysStored: false` because no real Web Push delivery
existed yet — "until VAPID delivery exists, the shell uses local
service-worker notifications as the demo path."

Phase 7.0 ships the real Web Push.

## Decision

### Implement RFC 8030 + 8291 + 8292 from scratch, no new dependencies

Consistent with the pattern since Phase 5.1 (real SMS providers)
and Phase 5.5 (SQLite backup): zero npm dependencies, only Node
20+'s built-in `crypto`. The `web-push` npm package would have
been one line, but adding it breaks the launch-image's
distroless-friendly thin-deps promise.

What it took:

1. **VAPID JWT signing (ES256)** — JOSE-format JWT signed with the
   server's P-256 private key. Header `{ alg: "ES256", typ: "JWT" }`,
   claims `{ aud, exp, sub }` per RFC 8292 §2. Signature is the
   ECDSA `r || s` raw concatenated 64-byte form, NOT DER —
   conversion from Node's DER output handled by `derToJose`.
2. **Payload encryption (RFC 8291)** — AES-128-GCM with keys
   derived via HKDF-SHA-256 from an ECDH P-256 shared secret +
   the subscription's 16-byte auth secret. RFC 8188 `aes128gcm`
   content-encoding (modern, not the legacy `aesgcm`). Single-
   record format with the sender's ephemeral public key embedded
   in the header.
3. **HTTP send** — POST to the subscription endpoint with
   `Content-Encoding: aes128gcm`, `Authorization: vapid t=<jwt>,
   k=<pubkey>`, `TTL`, `Urgency` headers.
4. **Subscription persistence opt-in** — Phase 2a.4's scaffold
   stored only hashes. Phase 7.0 adds a `storeDeliveryKeys: true`
   flag to `createPushSubscriptionRecord` that opts INTO storing
   the raw endpoint + p256dh + auth (required for actual
   delivery). Backward-compatible: the flag defaults to `false`.

### JWK key conversion (vs. hand-rolled PKCS#8)

Initial implementation tried to construct PKCS#8 DER by hand from
raw P-256 keys. Node's `createPrivateKey` rejected it with
"unsupported decoder" errors. Switched to JWK format via
`createPrivateKey({ key: jwk, format: 'jwk' })` — much simpler,
portable, and Node-native. The conversion:

```js
function p256PrivateRawToJwk(privRaw, pubRaw) {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pubRaw.slice(1, 33)),
    y: b64uEncode(pubRaw.slice(33, 65)),
    d: b64uEncode(privRaw)
  };
}
```

### New API endpoints

- **`GET /api/push-public-key`** — public; returns the VAPID
  public key + subject so the shell can construct browser Push
  API subscriptions. Returns 503 `push_disabled` when VAPID is
  unconfigured (mirrors Phase 5.7 admin-auth's safe default).
- **Existing `POST /api/push/subscriptions`** — extended to
  accept `storeDeliveryKeys: true`. Refuses with 503 if VAPID
  isn't configured (saves a useless record + a confused user).
  Response strips raw endpoint + keys (client already has them).

### Wired into `/api/recovery/verify` success path

When `account_recovery.completed` ledger event fires, the
recovery handler now:

1. Reads all push subscriptions for the recovered identity that
   have `rawEndpointStored: true`.
2. For each, calls `sendWebPush` with a high-urgency
   `account_recovery_alert` payload: *"Your Bharat OS account
   was just recovered. If this was you, no action needed.
   If it was NOT, tap to contact support — your cooldown window
   ends at YYYY-MM-DDT..."*.
3. Emits `recovery_alert.pushed` ledger event with the masked
   endpoint + push status.
4. On 410 Gone (subscription invalid), deletes the subscription
   automatically.

Best-effort: failures don't block the recovery response. The
Phase 5.2 24h cooldown is the actual defensive protection; this
push is the detection signal that compounds the defense.

### VAPID key generation script

`scripts/generate-vapid-keys.mjs` prints a ready-to-paste `.env`
snippet. Rotation cadence (per `.env.example`): quarterly +
after any suspected leak, same as `BHARAT_OS_ADMIN_TOKEN`.

### New env vars (all required for push delivery)

```
BHARAT_OS_VAPID_PUBLIC_KEY=
BHARAT_OS_VAPID_PRIVATE_KEY=
BHARAT_OS_VAPID_SUBJECT=mailto:dpo@bharat-os.in
```

Without these set, push endpoints respond 503 `push_disabled`
and the recovery flow proceeds WITHOUT alerts (cooldown still
applies — Phase 7.0 is detection-on-top, not replacement-of).

## §15 bindings (extended in this phase)

| Binding | Resolution |
|---|---|
| Subscription endpoints are device-identifying PII | The Phase 2a.4 scaffold defaulted `rawEndpointStored: false`. Phase 7.0 makes raw storage OPT-IN via `storeDeliveryKeys: true`. When opted in, the endpoint + keys persist (required for delivery) but **`maskEndpoint('https://fcm.googleapis.com/.../abc123') → 'fcm.googleapis.com/...xxxx23'`** is used everywhere except the stored record + outbound fetch. Ledger events, structured logs, and metric labels all use the mask. |
| Payload bodies are end-to-end encrypted | RFC 8291: the push service (FCM, Autopush) CAN'T read the body. Encryption key is derived per-send from ephemeral ECDH; never stored. |
| VAPID claims contain no user data | `{ aud, exp, sub }` only. `aud` is the push origin; `exp` is ≤ 24h; `sub` is the contact email per RFC 8292. NEVER an identifier of the user being pushed. |
| Recovery alert payload contains no PII | Push payload: `{ type, title, body, cooldownUntil }`. Worker's identityId, displayName, phone — none included. The MFI / partner ecosystem never sees push payloads anyway (E2E encrypted); the constraint here is about audit log + ledger contents. |
| 410 Gone auto-unsubscribes | Subscriptions that the push service reports as gone (user revoked notifications, app uninstalled, browser cleared site data) are deleted automatically. Stale-record clean-up without manual ops. |
| Push disabled when VAPID unset | Safe default — no accidental partial delivery. Same pattern as Phase 5.7 admin-auth. |
| DPDP erasure cascade | The existing `push_subscriptions` table is already in the §12(3) cascade. Erasing the worker removes their subscriptions automatically. |

## Tests

`tests/node/web-push.test.mjs` — 22 tests:

**base64url helpers** (1): round-trip + URL-safe chars.

**VAPID keypair generation** (1): P-256 keys of correct length +
public-key 0x04 prefix.

**VAPID JWT signing** (2): produces a valid 3-segment JOSE token
with ES256 claims (header alg/typ, claims aud/exp/sub, 64-byte
JOSE signature); rejects bad inputs (missing endpoint/subject,
non-mailto subject, TTL > 24h, missing keys).

**Payload encryption** (3): aes128gcm body shape (salt + rs + idlen
+ sender-pub + ciphertext + GCM tag, ≥ 103 bytes; salt is not
all-zeros; sender pub length 65); malformed input rejection;
oversized payload rejection (single-record cap).

**`maskEndpoint`** (2): host preserved + tail masked; null on
malformed input.

**`readVapidConfig`** (1): null when env vars missing; populated
when set.

**`sendWebPush` (mocked fetch)** (4): posts encrypted body with
VAPID auth header + returns ok on 201; 410 → `shouldUnsubscribe`;
non-success → `push_rejected` with truncated provider response;
missing-fields rejection.

**`createPushSubscriptionRecord` storeDeliveryKeys gating** (3):
defaults to NOT storing raw endpoint/keys (Phase 2a.4 backward
compat); with `storeDeliveryKeys: true` + complete keys persists
the raw data; refuses to store raw when keys are incomplete
(falls back to no-store mode safely).

**End-to-end API** (5): `GET /api/push-public-key` 503 when VAPID
unset; returns configured key when set; `POST /api/push/subscriptions`
with `storeDeliveryKeys: true` 503 when VAPID unset; **persists
subscription with raw endpoint+keys + response strips raw values**;
**FULL E2E recovery push test** — registers a push subscription
with delivery keys, seeds an `account_recovery`-purpose OTP,
POSTs `/api/recovery/verify`, verifies the push.mock URL was
called via the test's local fetch mock + asserts
`recovery_alert.pushed` ledger event with masked endpoint.

Full suite: **718 / 718 green** (was 696; +22 new). No SW change
(server-side only).

## Consequences

- **SIM-swap defense loop is fully closed.** The Phase 5.0
  recovery flow now: (a) cryptographically rebinds the identity
  to the new device; (b) emits a ledger event for after-the-fact
  forensics; (c) applies the Phase 5.2 24h cooldown gating
  destructive actions; (d) pushes a high-urgency alert to every
  paired device of the recovered identity. A SIM-swap attacker
  who completes recovery on a new phone gets ZERO destructive
  actions through, AND the legitimate user knows within seconds.
- **The §9A worker-notification path is now real.** Phase 2a.4's
  scaffold can now deliver to real devices when callers opt
  into `storeDeliveryKeys: true`. The future Phase 7.x can
  wire job-alert payloads through the same `sendWebPush`
  primitive.
- **Zero new runtime dependencies.** Web Push is a non-trivial
  ~600-line implementation in `src/phase0/web-push.mjs` but uses
  only Node 20+ built-ins (`crypto`, `fetch`). The distroless
  runtime image stays thin.
- **Backward-compatible.** Existing push subscriptions that were
  created without `storeDeliveryKeys` still work — they just
  don't receive Web Push delivery; they remain in the scaffold's
  `local_notification` mode. New subscriptions can opt in.
- **Safe-default for unconfigured deployments.** Without VAPID env
  vars, push endpoints 503 cleanly; the recovery flow proceeds
  without alerts (the cooldown still applies). A deploy that
  forgets to set VAPID doesn't accidentally crash, just doesn't
  send notifications.

## Future polish

- **Adaptive retry with backoff** — push services return 429 + a
  `Retry-After` header under load. Currently we report the
  failure and move on. Phase 5.4's circuit-breaker pattern could
  wrap `sendWebPush` for per-endpoint reliability tracking.
- **Per-endpoint health metric** — `bos_push_send_total{result}`
  gauge similar to `bos_sms_send_total`. Operators alert on
  rising failure rates.
- **Wire to other audit-significant events** — `cooldown_override.applied`
  (ops cleared cooldown — was this you?), `mesh_withdrawal.paid`
  (cash-out completed), `income_verification_bundle.read` (MFI
  read your record). Each of these is a high-signal moment for
  the user.
- **Encrypted-at-rest endpoints** — current trade-off stores raw
  endpoint + keys when opted-in. A future polish could encrypt
  these at rest using a server-side master key, decrypting only
  at send time. Trade-off: key management complexity.
- **Multi-recipient batching** — when a worker has 3 paired
  devices, current code sends 3 sequential pushes. A `Promise.all`
  + per-endpoint timeout would parallelise.
- **§9A worker-notification delivery wiring** — Phase 2a.4 created
  the `worker-notification` envelope but `vapidIntegrated: false`.
  A small Phase 7.1 could flip this to true + actually deliver
  job alerts via `sendWebPush`.
