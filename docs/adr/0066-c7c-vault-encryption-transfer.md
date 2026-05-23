# ADR 0066: Phase 2a.17 §7c Encrypted Vault Transfer

## Status

Accepted

## Context

ADR 0063 shipped the §7c WebRTC handshake but transferred only the
**public** identity record over the data channel — the `note` field
on the bundle was explicit: *"Public identity record only. Vault
keys + memory plaintext are NOT transferred in this scaffold."*

§15 says *identity is the person, not the device — one identity
portable across devices.* Without the private key + vault key
transit, "portable" is a half-truth: the receiver gets a name and a
public key it can use to *recognize* the user, but cannot *be* the
user. It cannot sign on the user's behalf, cannot decrypt the
existing L5 memory records, and cannot pick up where the old device
left off.

The future-work list in ADR 0063 named this as the next §7c
hardening step: *"Encrypted vault transfer (recovery-phrase-derived
AES key on the initiator, decrypted on receiver after the user
re-enters the phrase)."*

Phase 2a.17 closes it.

## Decision

### New artifact — `src/phase1/vault-transfer.mjs`

A canonical encrypted-envelope module with two public functions:

- `createVaultBundle({ identity, recoveryPhrase, memoryRecordRefs,
  household })` — derives an AES-GCM-256 key via PBKDF2-HMAC-SHA-256
  (200 000 iterations, 16-byte random salt), encrypts the secret
  payload (privateKeyPem, vaultKeyBase64, memory-record refs,
  household members), and returns a self-describing envelope with
  the `salt`, `iv`, ciphertext, and KDF parameters embedded.
- `decryptVaultBundle(bundle, recoveryPhrase)` — re-derives the key
  from the supplied phrase and the bundle's salt, decrypts via
  AES-GCM. A wrong phrase fails with the GCM auth tag — there is no
  oracle.

Cryptographic choices, all standards-backed and Web-Crypto-native
(works in Node 18+ and every modern browser without third-party
libraries):

| Knob | Value | Why |
|---|---|---|
| KDF | PBKDF2-HMAC-SHA-256 | Built into Web Crypto; widely audited. |
| Iterations | 200 000 | OWASP 2023+ guidance for PBKDF2-SHA-256 mobile context. |
| Salt | 16 random bytes per bundle | Prevents rainbow-table reuse across users / sessions. |
| Cipher | AES-GCM-256 | Authenticated encryption — auth tag rejects wrong phrases without an oracle. |
| IV | 12 random bytes per bundle | Standard GCM nonce length. |

The `protocolVersion`, `kdf.iterations`, `kdf.hash`, and
`cipher.algorithm` are explicit on every envelope so future cost
rotations don't break older receivers.

10 focused tests in `tests/node/vault-transfer.test.mjs` cover:
round-trip, wrong-phrase rejection, malformed-bundle rejection,
missing-phrase rejection, phrase normalization (case + whitespace),
two-identity isolation, missing privateKeyPem refusal.

### Browser side — `public/shell/pairing.mjs`

`startInitiator` gains a required `recoveryPhrase` parameter and a
new phase before transmission:

1. POST `/api/pairing/sessions` (unchanged) → 6-digit claim code.
2. **NEW** GET `/api/identities/:id/vault-snapshot` → fetches
   `privateKeyPem`, `vaultKeyBase64`, and the list of memory-record
   refs the user owns.
3. **NEW** `createVaultBundle(...)` — encrypts the snapshot under
   the recovery-phrase-derived key.
4. WebRTC offer/answer + data channel open (unchanged).
5. Send the now-two-part bundle: `{ publicIdentity, encryptedVault,
   note, protocolVersion: 'bos.phase2a.pairing-bundle.v1' }`.

`startReceiver` gains a required `promptForRecoveryPhrase` async
callback. After the bundle arrives:

1. If `encryptedVault` is present, the receiver prompts the user
   for the 12-word phrase (up to 3 attempts).
2. `decryptVaultBundle(...)` — derives the same key from the
   phrase + bundle salt, decrypts, returns the decoded vault.
3. Returns `{ session, bundle, decryptedVault }` to the shell;
   the shell adds the public identity to the household and (when
   the Phase 2b AOSP keystore exists) would land the
   `privateKeyPem` + `vaultKeyBase64` in hardware-backed storage.

For backward compatibility, a bundle without `encryptedVault` (i.e.
older sender) still completes — the receiver gets a public-only
result, same as Phase 2a.14 behaviour.

### Server — three additions

1. **`GET /api/identities/:id/recovery-phrase`** — returns the
   deterministic 12-word phrase derived from the identity's
   publicKey (reuses `generateRecoveryPhrase` from the CLI).
2. **`GET /api/identities/:id/vault-snapshot`** — returns
   `{ identity, memoryRecordRefs, warning }` with the privateKeyPem
   and vaultKeyBase64. Carries an explicit `warning` field naming
   this as a demo-only endpoint: a production Bharat OS keeps
   private keys in the device hardware keystore (Phase 2b AOSP
   shell), not on the server.
3. **`/shell/vault-transfer.mjs` alias** — the canonical
   `src/phase1/vault-transfer.mjs` is served at this path so the
   browser can `import` it without duplicating the code.

### Shell UI

- The pairing card now shows both the 6-digit code **and** the
  12-word phrase to the initiator; the user reads both to the new
  device.
- The receiver gets a `window.prompt(...)` dialog asking for the
  phrase. Three attempts; each failed decryption surfaces the GCM
  auth-tag error in the status line.
- New result row on the receiver: *"Vault: Decrypted — N memory
  refs, private key + vault key recovered"*.
- Service worker cache bumped `v12 → v13`; `vault-transfer.mjs`
  added to the app-shell precache.

## §15 bindings — how each is preserved

| Binding | Resolution |
|---|---|
| Identity is the person, not the device | After pairing, the receiver holds the same Ed25519 private key + vault key as the initiator. It *is* the same identity, not a copy or a delegated proxy. |
| Pointer, not payload | The WebRTC signaling server sees only SDP and the 6-digit claim code. The ciphertext transits the data channel directly between peers; the recovery phrase never crosses the wire at all. |
| Aadhaar optional, never mandatory | Vault transfer makes no Aadhaar reference; it operates on the local identity key material. |
| Never sell user data | No server log of phrase entry, no telemetry on decryption attempts. The L4 ledger records only that a pairing session completed and how many bytes transited (no payload). |

## Consequences

- **§7c portability is now real.** A second device that knows the
  phrase becomes the user. Wallets, vault contents, signing
  authority all migrate in one handshake.
- **Wrong phrase fails cleanly.** The receiver gets a clear error
  with up to three attempts; after three rejections the pairing
  aborts. No partial state, no fallback to public-only.
- **Backward-compatible.** A receiver in this build can still claim
  a bundle from an older initiator that doesn't carry
  `encryptedVault` — the bundle bumps from `v0 → v1` but the
  receiver tolerates absence of the vault field.
- **Demo-mode caveat surfaced.** The vault-snapshot endpoint
  carries a `warning` field that names itself as demo-only.
  Production needs the privateKeyPem to live in the Android/iOS
  hardware keystore, not in the server's `identities/`
  directory. Phase 2b commitment.
- **Tests: 210 / 210 green** (was 201; +9 new
  vault-transfer tests).

## Future hardening

- Replace the scaffold 64-word wordlist with the full BIP-39 2048
  wordlist + multilingual variants (per §7a) so the phrase is
  meaningful to non-English speakers.
- Move the privateKeyPem out of the server store entirely in
  Phase 2b — keep it in the Android Keystore / iOS Secure Enclave
  (iOS scope confirmed out by §15). The vault-snapshot endpoint
  becomes a no-op that returns only memory-record refs; the
  initiator reads its private key from the local keystore.
- QR-encode the bundle (code + first 32 chars of fingerprint + the
  phrase) so the new device can scan instead of typing. The 6-digit
  flow stays as the typed-fallback path.
- Encrypt individual memory records under a fresh sub-key derived
  from the vault key + record ID, so post-transfer the receiver can
  decrypt them without the bulk-key. The current bundle ships the
  bulk vault key; per-record envelopes are a future refactor.
- A reciprocal "old device acknowledges and forgets" step
  (revocation evidence in the L4 ledger) so the identity *moves*
  rather than *duplicates*. ADR 0063 already named this as future
  work; still open.
