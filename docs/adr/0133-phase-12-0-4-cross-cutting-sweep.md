# ADR 0133 — Phase 12.0.4: cross-cutting sweep — push + vault transfer + DPDP grievance + voice intent + flag reports

Status: Accepted (2026-06-01).
Phase: 12.0.4 (substrate integration sweep, cross-cutting).
Depends on: Phase 7.0 Web Push (VAPID + service worker), Phase 5.x
DPDP §12(4) grievance contact, Phase 9.0 flag reports (§9A),
Phase 5.0 vault snapshot.

## Context

Third of four substrate-integration sub-phases per the founder
directive 2026-06-01. Phase 12.0.2 closed citizen side (daily
brief + memory records). Phase 12.0.3 closed worker side
(schemes + tax + collective memberships + trust mint). This
sub-phase closes the cross-cutting substrates that live mostly
on `/settings` plus two surface additions on `/citizen/home`.

Five integrations:

1. **Push notifications** — real Web Push subscription with
   service worker, VAPID keys.
2. **Vault transfer** — download account bundle (`.json`) for
   device migration / backup.
3. **DPDP grievance** — DPO contact rendered from
   `/api/dpdp/grievance` for §12(4) compliance.
4. **Voice intent input** — mic button on the citizen home
   intent textarea; uses browser SpeechRecognition.
5. **Flag reports (§9A)** — Report button on each Recent
   Activity row → sheet → `POST /api/flags`.

## Decision

Mostly FE; one operational BE change (VAPID env vars). Five new
hooks + one helper module + service worker.

### Service worker

New `frontend/public/sw.js` — Vite copies it to the build
root, which the BE then serves as `/app/sw.js`. Minimal: handles
`push` and `notificationclick` events only, no caching (the
`/app/` build is immutable-hashed). Registered eagerly by the
Settings page on first mount.

### Push notifications opt-in

- `usePushPublicKey()` — `GET /api/push-public-key`. Returns
  `null` when the server returns 503 `push_disabled` (so the
  Settings card can show an honest "Push is not configured"
  state instead of throwing).
- `usePushSubscriptions(identityId)` — `GET /api/push/subscriptions?identityId=`.
- `useSubscribePush()` — `POST /api/push/subscriptions`.
  `storeDeliveryKeys: true` so the server can SEND pushes (per
  ADR 0101).
- `useUnsubscribePush()` — `DELETE /api/push/subscriptions/:id`.
- `frontend/src/lib/push.ts`:
  - `registerAppServiceWorker()` — registers `/app/sw.js`.
  - `subscribeToPush({vapidPublicKey})` — asks Notification
    permission, registers SW if needed, calls
    `pushManager.subscribe` with the VAPID key, returns
    `{endpoint, keys: {p256dh, auth}}`.
  - `unsubscribeFromPush()` — finds the registration + calls
    `subscription.unsubscribe()`.
  - `currentPushSubscription()` — checks for existing browser
    subscription (used on mount to seed the toggle state).
  - URL-safe base64 ↔ Uint8Array helpers for VAPID key
    conversion.

Settings card surfaces three states honestly:
- **Push not configured** — when the server returns 503.
- **Browser unsupported / denied** — when Notification API
  refuses.
- **Subscribed** — toggle to disable; otherwise show "Enable
  push notifications" button.

### Vault transfer

- `useVaultSnapshot()` — `GET /api/identities/:id/vault-snapshot`
  as a mutation (it has side effects: it includes the private
  key + vault key in the response, so we don't want to cache
  the response and we want to trigger it explicitly).
- Settings card: "Download bundle (.json)" button → fetches
  snapshot → wraps in a Blob → triggers a `download` link with
  filename `bharat-os-account-<slug>-<date>.json`.
- Evidence block honestly explains what's in the file (Ed25519
  keypair, vault key, attestations, memory references) and that
  it should be treated like a password-manager export.
- Phase 2b Android keystore caveat surfaced.

### DPDP grievance

- `useDpdpGrievance()` — `GET /api/dpdp/grievance`. Returns
  `{contact: {name, email, postal, grievanceEscalation,
  responseSlaDays, protocolVersion}}`.
- Settings card renders all fields. Email is a `mailto:` link;
  escalation URL is opened in a new tab.

### Voice intent input

- `frontend/src/lib/voice-intent.ts` — typed wrapper around
  `window.SpeechRecognition` / `window.webkitSpeechRecognition`.
  `VoiceIntentSession` class with `start()` / `stop()` /
  `abort()` and `onInterim` / `onFinal` / `onError` / `onEnd`
  callbacks. Default `lang: 'en-IN'`.
- `<CitizenIntent>` gains a mic button positioned at the bottom-
  right of the textarea (only when `isVoiceIntentSupported()`).
  Tap → starts a session; the textarea border turns error-red
  and the mic button pulses. Interim transcript appended to the
  textarea inline; final transcript committed to state.
- §15 honesty: speech recognition happens on the device (Chrome
  uses Apple/Google speech engines; Safari uses Apple Speech).
  Bharat OS never sees the audio. Phase 12.1b SLM-A will
  replace this with a true on-device vernacular model for 22+
  Indic languages.

### Flag reports (§9A)

- `useCreateFlagReport()` — `POST /api/flags` with
  `{reporterId, subjectId, category, description, evidenceRefs?}`.
- `<CitizenIntent>` gains a "Report" button on each Recent
  Activity row. Tap → opens sheet with:
  - Subject (orchestrationId + display label).
  - Category chips (abuse / fraud / spam / safety / other).
  - Description textarea (min 10 chars).
- On submit → "Report filed. An operator will review under §9A."

## §15 bindings

- **VAPID push is real, not simulated.** Server actually
  generates a keypair (via `scripts/generate-vapid-keys.mjs`),
  the public key is served by `/api/push-public-key`, and the
  FE subscription flow walks through `navigator.serviceWorker`
  + `pushManager.subscribe` end-to-end. Production deployments
  set the env vars; demo deployments can leave them unset and
  the Settings card surfaces an honest "not configured" state.
- **Vault snapshot is the same shape used by sign-in via
  recovery.** No new data surface; the substrate has carried
  `privateKeyPem` server-side since Phase 0 per the ADR 0066
  demo-mode caveat. Phase 2b moves signing to the device
  hardware keystore.
- **DPO contact rendered verbatim.** The BE returns the same
  `DEFAULT_DPO_CONTACT` envelope that's been there since Phase
  5.x; the FE renders fields as-is (mailto link for email,
  external link for escalation URL).
- **Voice happens on-device.** Browser SpeechRecognition uses
  the platform STT engine. Bharat OS receives only the
  recognised text, never the audio bytes. Disclosed in the
  ADR; the FE does not need to disclaim this on every voice
  use because the §15 binding holds at the substrate level.
- **Flag report carries no PII.** The reporter signs with
  their identity (server stores `reporterId`); the subject is
  an opaque `orchestrationId`. Description is free-text the
  reporter chose to write. Operators review under §9A.

## Tests

No new tests this sub-phase. The underlying substrates are
battle-tested:
- `tests/node/web-push.test.mjs` (Phase 7.0 push subscription
  + delivery)
- `tests/node/dpdp-rights.test.mjs` (Phase 5.x DPDP)
- `tests/node/flag-report.test.mjs` (Phase 9A flags)
- `tests/node/account-recovery.test.mjs` (vault snapshot via
  recovery bundle)

FE components are pure surface code over typed hooks. Full
Node suite: **890/890** (unchanged). FE Vitest: **45/45**
(unchanged). Bundle: main 421 → **434 KB / 129 KB gzipped**
(+13 KB for 5 hooks + 3 Settings cards + voice helper + flag
sheet + service worker).

End-to-end verified on the running server:
- `GET /api/push-public-key` returns the configured VAPID
  public key + subject.
- `GET /sw.js` (served as `/app/sw.js`) returns the new
  service worker file (HTTP 200).
- `GET /api/dpdp/grievance` returns the DPO contact envelope.

## Consequences

- Settings on `/app/` is now a real control panel. Citizens
  can enable push, export their account bundle, see who to
  contact for DPDP grievances, view the audit signer public
  key, download their data, and erase their account — all
  without leaving `/app/`.
- Citizen home gains the mic button and the Report-this-
  activity UX, completing the §9A reporting loop.
- The four-sub-phase sweep is nearly done: only 12.0.5
  (sponsor `/app/sponsor/`) remains before the substrate
  integration arc closes and we move on to Phase 12.1a
  marketplace substrate.
- Push subscription persistence behaviour: the same browser
  subscription survives across logins (it's tied to the
  browser + origin, not the Bharat OS identity). On identity
  switch, the new identity gets a fresh subscription record
  in the server, but the browser-side subscription is the
  same — which is fine because Bharat OS only sends to
  subscriptions tied to the active identity via the
  `worker-notifications` and `account_recovery_alert` flows.

## What's NOT in this sub-phase

- **WebAuthn / passkey sign-in.** Substrate exists (`profile-
  auth/credentials`) but a clean UX requires per-device key
  management + bound device list that's its own product
  surface. Defer to Phase 13+ Bharat ID.
- **Device pairing (WebRTC).** The `/shell/` pairing flow uses
  a multi-step SDP exchange that's heavy to port to `/app/`.
  Vault transfer + sign-in cover the cross-device migration
  story for v1.
- **Flag report list view + resolution status.** Citizens can
  file reports; they can't yet see their filed reports'
  status. Polish.
- **Voice intent vernacular support.** Browser SR uses `en-IN`
  by default; switching to Hindi / Tamil / Bengali per-user is
  Phase 12.1b SLM-A territory.
- **PWA manifest** — the SW is registered but there's no
  `manifest.webmanifest` for Add-to-Home-Screen yet. Polish.
- **i18n** — English copy only.

ADR 0133.
