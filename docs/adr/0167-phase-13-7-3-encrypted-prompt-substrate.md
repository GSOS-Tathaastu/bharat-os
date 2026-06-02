# ADR 0167 — Phase 13.7.3: Encrypted-prompt substrate for the compute network

Status: Accepted
Date: 2026-06-03

## Context

Phase 13.7.2 (ADR 0166) closed the v1 compute network demo loop
on top of the 13.7.1 BE substrate, with the explicit known
limitation that the citizen's prompt text never flowed through
the BE — workers could only see a sha256 hash and had to serve
"manually" via honor-system entry of response text + token
count. The 13.7.2 ADR named the deferred work:

> "Phase 13.7.3 — Encryption substrate + Phase 9.0c runtime
>  serve-mode. Citizen encrypts prompt to worker's identity
>  public key; worker's WASM runtime auto-decrypts and serves;
>  signed response forces the worker to actually run the
>  inference."

This ADR ships the **encryption substrate** end-to-end across
BE + FE + crypto helpers + UI wiring. The "Phase 9.0c runtime
serve-mode" piece (automated SLM execution + response signing
without human interaction) is deferred to Phase 13.7.4 — that
needs a substantial wllama runtime extension.

What this phase delivers, demoable:
- Worker publishes a P-256 ECDH pubkey on their capacity.
- Citizen encrypts prompt to that pubkey locally (ECDH + HKDF
  + AES-256-GCM, forward-secret ephemeral keypair) and POSTs
  the ciphertext envelope.
- BE stores ciphertext + nonce + ephemeral pubkey (never the
  plaintext) tied to the dispatch with a 15-minute TTL.
- Worker fetches the envelope, decrypts client-side with the
  stored private key, and SEES the citizen's prompt text on
  their device.
- Worker manually runs the prompt on their installed SLM (the
  automated WASM serve-mode that closes this last manual step
  is what 13.7.4 will ship).

## Decision

### 1. Algorithm choice — P-256 not X25519

The cryptographic suite is **ECDH(P-256) + HKDF-SHA256 +
AES-256-GCM**. The choice over X25519 + ChaCha20-Poly1305:

- Web Crypto's `crypto.subtle` supports P-256 ECDH on every
  modern browser. X25519 support is still patchy on Safari +
  older Chrome; landing it would force a polyfill.
- P-256 + AES-GCM is the conservative NIST suite that matches
  the existing audit-signer Ed25519 posture in family but
  separate by curve (Ed25519 is sign-only).
- HKDF-SHA256 with empty salt is acceptable per RFC 5869 §3.1
  because the ephemeral pubkey provides per-dispatch
  uniqueness — the derived AES key is unique to each dispatch
  even with empty salt.

### 2. BE entity + endpoints

`src/phase1/compute-serving-encrypted-prompt.mjs` (~210 lines)
— strict-allowlist validator + ledger event builder. Protocol
pinned `bos.phase13.compute-serving-encrypted-prompt.v1`.

`PERMITTED_ENCRYPTED_PROMPT_KEYS` (11 entries) gates the
envelope. `COMPUTE_SERVING_ENCRYPTED_PROMPT_FORBIDDEN_SUBSTRINGS`
(13 entries — same posture as the dispatch entity) rejects any
key that could leak plaintext. The validator hard-rejects
non-canonical base64, oversized ciphertext (cap 8 KB), and
malformed ISO-8601 timestamps.

Content-derived `envelopeId` over `{dispatchId, requesterId,
workerId, ciphertextBase64, createdAt}` so a citizen can't
post two envelopes for the same dispatch.

15-minute TTL aligned with the dispatch's own TTL.

`src/phase1/compute-serving-capacity.mjs` extended with
optional `workerEncryptionPubKeyBase64` field (P-256 raw
uncompressed point, base64 — ~88 chars). OPTIONAL so existing
capacities published pre-13.7.3 keep working.

Two new endpoints under
`/api/compute-serving-dispatches/:dispatchId/encrypted-prompt`:
- `POST` — citizen attaches encrypted envelope. Validates
  dispatch exists + is pending + requester matches + no
  envelope already attached. Emits
  `compute_serving.encrypted_prompt_posted` ledger event
  (pointer + count meta only — never the ciphertext).
- `GET ?workerId=...` — worker fetches envelope. Validates
  dispatch + worker assignment. Returns the ciphertext + nonce
  + ephemeral pubkey for client-side decryption.

The existing `POST :id/serve` endpoint now also wipes the
envelope after successful serve (forward secrecy + reduced
surface area).

DPDP §12 cascade: envelopes wipe on identity erase by EITHER
requester OR worker side.

### 3. FE crypto helpers

`frontend/src/lib/compute-encryption.ts` (~200 lines) — pure
Web Crypto helpers:
- `generateWorkerEncryptionKeypair()` — P-256 ECDH keypair;
  pubkey as base64 raw, privkey as base64 PKCS#8.
- `encryptPromptForWorker(promptText, workerPubKeyBase64,
  additionalData?)` — citizen-side. Generates fresh ephemeral
  keypair, ECDH with worker pubkey, HKDF→AES-256, AES-GCM
  encrypt with fresh 12-byte nonce. Returns `{ciphertext,
  nonce, ephemeralPubKey}` envelope.
- `decryptPromptFromCitizen(envelope,
  workerPrivKeyPkcs8Base64, additionalData?)` — worker-side
  inverse.

Forward secrecy: ephemeral keypair is discarded after
encryption. Even if the long-lived worker private key leaks
later, past prompts remain unreadable.

### 4. FE worker keypair store

`frontend/src/lib/worker-encryption-keypair-store.ts` —
Zustand + persist (localStorage) keyed on identityId. One
keypair per persona on this device. The private key NEVER
crosses the network; the public key is published only via
the worker's own capacity envelope.

### 5. FE wiring

- `ComputeServingCapacityCard` — on capacity publish, calls
  `useWorkerKeypairStore.ensureKeypair(identityId)` to
  generate-or-reuse the keypair, then passes the pubkey on
  the create request.
- `PendingDispatchRow` — adds "Fetch & decrypt prompt"
  affordance. On click: fetches the envelope, decrypts with
  the local privkey, shows the plaintext above the existing
  serve form. Skip option preserves the manual flow for
  older capacities.
- `ComputeNetworkTestCard` — when capacity has a published
  pubkey, encrypts the prompt locally before sending. The
  dispatch creation + envelope POST happen in sequence. If
  capacity has NO pubkey (older), the dispatch still sends
  with hash-only and surfaces an honest notice.

Both cards' "How this works" copy updated to describe the new
substrate honestly.

### 6. Adversarial review verdict: ship_with_no_must_fix

Inline 3-lens pass (privacy / UX / edge-cases). Privacy
posture sound by construction:
- Plaintext prompt NEVER reaches the BE.
- Worker's private key NEVER leaves the device.
- Forward secrecy via ephemeral keypair per dispatch.
- AES-GCM auth tag detects tampering (vitest pinned).
- Strict allowlist + FORBIDDEN_SUBSTRINGS probe rejects
  plaintext-leak fields at boundary.
- Ledger event emits POINTER + count meta only — vitest
  asserts ciphertext does not appear in the JSON.
- DPDP §12 cascade by either side.
- Envelope auto-wiped after serve.

Edge cases caught at boundary with explicit error codes
(not_requester / not_assigned / envelope_already_posted /
envelope_not_found / dispatch_not_pending / dispatch_expired
/ invalid_encrypted_prompt / workerId_required).

Notes for follow-up polish (not must-fix):
- **SF-1** — HKDF salt is empty in v1. Acceptable per RFC
  5869 §3.1 because the ephemeral pubkey provides per-dispatch
  key uniqueness. A future bump could pass `dispatchId` as
  salt for defence-in-depth.
- **SF-2** — `additionalData` AAD binding to dispatchId is
  supported by the helpers but not used by the FE yet. Adding
  it would prevent replay against a different dispatch.
  Future improvement; gated by a protocol version bump.
- **SF-3** — Decrypt failures surface as generic "couldn't
  decrypt" (wrong-key vs tampered-ciphertext indistinguishable
  by AEAD design — that's actually the correct posture; the
  generic message is a UX choice, not a security one).

## Consequences

- The compute network is now **verifiable end-to-end**: the
  citizen's prompt actually reaches the worker (encrypted in
  transit, decrypted only on the worker's device), so the
  worker can no longer fabricate response hashes without
  having seen the prompt. The honor-system manual-serve from
  13.7.2 is now an honest verification path.
- Phase 13.7.4 closes the last manual step: a Phase 9.0c
  wllama runtime serve-mode extension that decrypts +
  serves + posts the response without human interaction.
  The encryption substrate this phase ships is the
  prerequisite.
- The §13.x compute network revenue line is now substrate-
  complete for v1 demo. Production fixes for the carryover
  limitations (race on concurrent serves, maxConcurrent +
  maxDailyTokens not enforced at dispatch time) land
  alongside the runtime extension in 13.7.4 or after.

## Tests

- `tests/node/compute-serving-encrypted-prompt.test.mjs` —
  20 cases. Pure validator (allowlist, content-derived
  envelopeId, FORBIDDEN_SUBSTRINGS probe, base64 + size +
  timestamp validation, ms-strip), ledger event POINTER +
  count + no-ciphertext-leak, HTTP integration (POST happy
  path + 403 non-requester + 409 duplicate + GET worker-only
  + 403 non-assigned + 404 envelope-not-found + serve-wipes-
  envelope), DPDP cascade, FE↔BE algorithm-string
  convergence.
- `frontend/src/lib/compute-encryption.test.ts` — 7 cases.
  Keypair generation (P-256 raw 65 bytes, distinct per call),
  encrypt → decrypt roundtrip happy path, forward secrecy
  (different ephemeral per call), wrong-key rejection,
  tampered-ciphertext rejection, multi-line + multi-byte
  UTF-8 roundtrip (Devanagari + Tamil + Bengali + emoji).
- `tests/node/compute-serving-capacity.test.mjs` updated for
  the new `workerEncryptionPubKeyBase64` field in
  PERMITTED_CAPACITY_KEYS.
- Full sweep at commit time: 513 vitest + 1426 Node + tsc
  clean (+20 Node from encrypted-prompt + 7 vitest from
  crypto roundtrip).

## Follow-ups (deferred to 13.7.4+)

- **13.7.4** — Phase 9.0c wllama runtime serve-mode extension.
  Worker's WASM runtime accepts a dispatched encrypted prompt,
  decrypts in isolated context, serves on the installed SLM,
  signs the response, posts back automatically. Closes the
  last human-in-the-loop step.
- Optional AAD binding to dispatchId (SF-2).
- Per-dispatch HKDF salt (SF-1).
- Production fixes for race on concurrent serves +
  maxConcurrent/maxDailyTokens enforcement (carryover from
  13.7.1).
