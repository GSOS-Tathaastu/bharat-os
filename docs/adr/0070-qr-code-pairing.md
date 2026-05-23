# ADR 0070: Phase 2a.21 — QR-Code Pairing

## Status

Accepted

## Context

ADR 0063 shipped the §7c WebRTC handshake with a 6-digit claim
code. ADR 0066 added the 12-word recovery phrase as a second
typed input on the receiver. Both are friction in the demo:

- The investor watches the user *read out twelve words* and *type
  them on a second device*. Phone-to-phone, that's 30–60 seconds
  of awkward dictation.
- A typo anywhere in the phrase fails the AES-GCM auth tag and
  forces a retry. Three attempts before the pairing aborts.

QR-code pairing collapses both into one scan. The ADR 0063 future-
work list named this explicitly: *"QR code generation on the
initiator + camera scan on the receiver to replace the manual
6-digit entry on a real phone demo."*

## Decision

### QR payload format

```json
{ "v": "bos.qr.v1", "code": "<6 digits>", "phrase": "<12 words>" }
```

JSON-stringified then encoded into the QR. ~120 chars — well
within the readability range for a phone camera at arm's length.
The `v` field is versioned so future fields don't break older
scanners; receivers reject any payload that doesn't carry
`v === 'bos.qr.v1'`.

### Initiator side — `public/shell/app.js`

When the WebRTC `session_created` event fires, render the existing
6-digit code + 12-word phrase **and** a QR encoding both via
`renderQrInto($('pairingQrDisplay'), makeQrPayload({ ... }))`.

The QR library lazy-loads from
`https://esm.sh/qrcode@1.5.3?bundle` — same CDN pattern the SLM
(`transformers.js`) and OCR (`tesseract.js`) loaders use. The
bundle is ~10 KB gzipped; first pairing has a sub-100 ms warm-up
on cold cache. The cross-origin pass-through already in the
service worker handles the fetch.

QR rendered as inline SVG with the brand background colours
(white card on the dark shell so a phone camera autofocuses
cleanly).

### Receiver side — `public/shell/app.js`

Three claim paths, in order of friction:

1. **📷 Scan QR** — uses the native `BarcodeDetector` API
   (Chromium / Edge / Safari 17+). Opens the rear camera with
   `getUserMedia({ video: { facingMode: 'environment' } })`,
   streams into a `<video>`, polls `detector.detect(video)` every
   250 ms for 30 seconds. On success: extracts claim code + phrase,
   pre-fills both, and runs the existing claim flow with
   `prefilledPhrase` so the user never sees the typed-phrase
   prompt.
2. **📋 Paste QR text** — `window.prompt`-driven fallback for
   browsers without `BarcodeDetector` (older Safari, Firefox).
   The user copies the QR payload text from a desktop QR reader
   and pastes it. Also accepts a raw 6-digit code as a degraded
   fallback (will prompt for the phrase via the existing path).
3. **6-digit typed code + manual phrase prompt** — unchanged
   from ADR 0066. Still works as the universal fallback.

### `startReceiver` flow change

`claimPairingFromCode({ prefilledPhrase })` now accepts an
optional phrase. The `promptForRecoveryPhrase` callback returns
the prefilled phrase on the first attempt and only falls back to
`window.prompt` if the prefilled phrase is rejected (i.e. the QR
was for a different session). Three-attempt rejection logic
unchanged.

### Shell HTML / CSS

- `pairingCodeDisplay` retains the existing 6-digit + phrase
  block; `pairingQrDisplay` is a new sibling that hosts the QR
  SVG on a white card.
- `pairingClaimActions` row of two link-buttons (scan + paste)
  added under the existing 6-digit input.
- `pairingScanVideo` is a hidden `<video>` element revealed only
  during an active camera scan.
- New CSS: `.pairing-qr`, `.pairing-qr svg`, `.pairing-claim-actions`,
  `.pairing-scan-video`.

Service worker bumped `v16 → v17`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Pointer, not payload | The QR carries the 6-digit code + 12-word phrase — the same data the user was reading aloud. No vault contents, no identity bytes. The WebRTC server still only sees SDP. |
| Identity is the person, not the device | The QR encodes the *recovery phrase*, which is deterministic from the identity's publicKey. Scanning the QR on a second phone is equivalent to typing the phrase — both produce the same AES key. |
| Aadhaar optional, never mandatory | QR pairing makes no Aadhaar reference. |
| Never sell user data | The QR is rendered on-device by the lazy-loaded library; no telemetry to the CDN beyond the standard library-fetch request, which carries no user identifiers. |

## Consequences

- **Demo time-to-pair drops from ~60 seconds to ~5 seconds.** The
  investor sees a QR, points the second phone, and watches the
  identity migrate.
- **Three claim paths in priority order** — scan / paste / type.
  Every browser has at least one working option, with progressive
  degradation rather than a hard refusal.
- **No new server endpoints.** The QR payload format is a thin
  encoding of the same code + phrase the server already issues
  via `/api/identities/:id/recovery-phrase` and the pairing
  session endpoint.
- **Backward-compatible.** Initiators that don't render a QR
  (older shell builds) still work via the typed-code path.
  Receivers without `BarcodeDetector` still work via paste or
  type.
- 230 / 230 tests green (no new tests — QR generation /
  detection happen in the browser; node-level tests aren't
  meaningful without a browser camera and Web APIs). SW cache to
  v17.

## Future hardening

- Replace the esm.sh-hosted `qrcode` library with a vendored
  copy in `public/shell/` once the demo footprint matters more
  than freshness. ~10 KB on the wire.
- Add a self-contained QR scanner fallback for browsers without
  `BarcodeDetector` (e.g. via `jsQR` or `qr-scanner`) so the
  paste path becomes truly last-resort.
- Generate a *one-shot* QR token (HMAC the session-id with a
  per-device key) instead of carrying the phrase verbatim, so a
  photo of the QR taken outside the pairing window is useless.
  Today the QR carries the phrase, which is sensitive — anyone
  with the photo + the 6-digit code can claim the session within
  its TTL. Phase 2b hardware-keystore enablement makes this
  cleaner.
- Embed a watermark / brand mark in the QR centre so the user
  recognises a *Bharat OS* pairing QR vs an arbitrary QR.
