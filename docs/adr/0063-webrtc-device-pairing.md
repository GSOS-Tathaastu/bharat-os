# ADR 0063: §7c WebRTC Device Pairing Handshake

## Status

Accepted

## Context

§15 binds *"identity is the person, not the device — one identity
portable across devices."* ADR 0048 added a localStorage scaffold for
§7c device pairing: deterministic recovery phrase, pairing payload
envelope, BIP-39-like phrase verification — but no actual transport.
The previous device-claim model lived entirely inside one browser's
localStorage. §17 Phase 2a queue #8 called this out as the next
hardening step.

For an investor demo, *"move my Bharat OS profile to a new phone"*
needs to be a real moment: two devices, a code, a transfer, a
confirmed claim. The Phase 2b AOSP shell will harden this further
with system-attested local transport (Wi-Fi Direct, Bluetooth LE,
NFC), but Phase 2a's job is to demonstrate the architecture is sound
on a PWA today.

## Decision

Phase 2a.14 ships the real WebRTC handshake.

### Signaling artifact — `src/phase1/pairing-session.mjs`

A pairing session is the short-lived state the *signaling* path keeps
while two devices establish a direct WebRTC data channel.

- `createPairingSession({ issuerIdentityId, issuerDisplayName,
  issuerPublicKeyFingerprint, ttlSeconds = 600 })` — generates a
  6-digit human-readable claim code + 32-byte nonce + canonical ID
  derived from the payload. Lifecycle: `pending`.
- `lookupByClaimCode(sessions, code, at?)` — finds an active session
  by its code, skipping claimed / expired entries.
- `claimPairingSession(session, { receiverFingerprint, sdpAnswer })`
  — transitions `pending → claimed`, records the receiver's
  fingerprint + the SDP answer. Refuses non-pending sessions; marks
  expired automatically if past TTL.
- `recordSdp(session, { offer, answer })` — accumulates SDP pieces
  during the handshake without overwriting nulls.
- `completePairingSession(session, { bytesTransferred })` — final
  transition once the data channel finishes. Refuses expired
  sessions.
- `expirePairingSession(session)` — idempotent past-TTL check.

12 focused tests in `tests/node/pairing-session.test.mjs` cover the
lifecycle, claim-code lookup with expired/claimed skipping, ID
determinism, SDP accumulation, store persistence + ledger evidence.

### Server as signaling-only relay

`BosStore` gains `savePairingSession` / `readPairingSession` /
`listPairingSessions` + a `pairing-sessions/` directory + a
`pairing_session.saved` ledger event on every state transition.

API routes (all signaling, no identity payload):
- `POST /api/pairing/sessions` — create
- `GET /api/pairing/sessions/:id` — poll (auto-expires past TTL)
- `GET /api/pairing/sessions/by-code/:claimCode` — receiver lookup
- `POST /api/pairing/sessions/:id/claim` — receiver claims with its
  fingerprint and SDP answer
- `POST /api/pairing/sessions/:id/sdp` — accumulate offer / answer
- `POST /api/pairing/sessions/:id/complete` — final transition

§15 binding: **the server only ever sees the SDP descriptors and the
claim code.** It does not see the identity bundle. The actual identity
transfer happens browser-to-browser over the WebRTC data channel.

### Browser-side WebRTC — `public/shell/pairing.mjs`

Two roles: `startInitiator` (old device) and `startReceiver` (new
device).

**Initiator flow:**
1. POST `/api/pairing/sessions` → receives session + 6-digit code.
2. Create `RTCPeerConnection` (Google public STUN as fallback), open a
   `RTCDataChannel('bharat-os-pairing')`.
3. Create offer, `setLocalDescription`, wait for ICE gathering
   (bounded 4s — partial SDP still works on localhost).
4. POST offer to `/api/pairing/sessions/:id/sdp`.
5. Poll every 1.5s for `status === 'claimed'` + `sdp.answer`.
6. On answer: `setRemoteDescription`, wait for data channel `open`
   event.
7. Send the identity bundle (public-identity record only — vault
   keys and memory plaintext are NOT in the bundle yet, §7c
   hardening item).
8. Wait for receiver `{ ack: 'received' }`, then POST `/complete`
   with bytesTransferred.

**Receiver flow:**
1. GET `/api/pairing/sessions/by-code/:code` to find the session.
2. Create its own peer connection; register `datachannel` handler.
3. `setRemoteDescription(offer)`, `createAnswer`,
   `setLocalDescription`, wait for ICE.
4. POST claim with fingerprint + answer.
5. Receive data channel; await the bundle; send ack.
6. Hand the bundle to the shell, which adds it as a household member
   on this device.

### Shell pairing card

`/shell/` gains a "📲 Pair another device (§7c)" card with two
halves:
- **Old device → New device**: "Start pairing" → shows the 6-digit
  code in a big monospace block, status updates as the receiver
  claims.
- **Claim on new device**: a 6-digit input + "Claim & receive"
  button.

A short doc note in the card explains the localhost demo path: open
`/shell/` in two browser tabs, start on one, paste the code into the
other.

## Consequences

- §7c is now demoable as a real moment, not just doc and
  localStorage. *"Open `/shell/` in a second tab, start pairing on
  the first, enter the code on the second"* — and a real
  `RTCPeerConnection` + `RTCDataChannel` handshake completes with the
  identity record added to the second tab's household.
- §15 binding holds: the server is a signaling relay only. SDP
  descriptors and the 6-digit claim code transit the server; the
  identity bundle does not. The audit ledger records the session
  lifecycle (saved at every transition) but no bundle bytes.
- The bundle is **public-identity-only** in this iteration. Vault
  keys + memory plaintext are NOT transferred. Production needs the
  recovery-phrase-driven decryption of the encrypted vault as a
  second leg (the recovery-phrase scaffold from ADR 0048 plugs in
  here). This is documented in the bundle's `note` field for
  transparency.
- WebRTC on plain HTTP between LAN peers is browser-permissive but
  Phase 2a's `/shell/` is HTTPS-or-localhost for the secure-context
  APIs we already use; the same constraint applies here. A real
  phone-to-phone demo wants an HTTPS tunnel (ngrok / Cloudflare
  Tunnel) for the moment.
- Tests: 12 new in `tests/node/pairing-session.test.mjs`, 201 / 201
  total green. The browser-side WebRTC code in `pairing.mjs` is
  exercised via the demo path; node-level tests aren't possible
  without a browser WebRTC implementation, and the SDP/ICE
  state-machine logic is exercised by the server artifact's
  lifecycle tests.

## Future hardening

- Encrypted vault transfer (recovery-phrase-derived AES key on the
  initiator, decrypted on receiver after the user re-enters the
  phrase). The current bundle shape leaves room for this.
- QR code generation on the initiator + camera scan on the receiver
  to replace the manual 6-digit entry on a real phone demo.
- TURN server fallback for NAT traversal when both devices are on
  different networks (today STUN is enough for same-LAN).
- Trickle ICE instead of the bounded ICE-gathering wait, which
  reduces handshake latency on poor networks.
- Phase 2b: replace WebRTC with platform-attested local transports
  (Wi-Fi Direct, Bluetooth LE, NFC) once the AOSP shell lands.
- A reciprocal "old device acknowledges and forgets" step so the
  identity moves rather than duplicates, with revocation evidence
  in the ledger.
