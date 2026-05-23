# ADR 0052: Per-Profile Passkey Binding Scaffold

## Status

Accepted

## Context

Phase 2a queue item #3 in `BHARAT_OS.md` is WebAuthn per-profile biometric
binding for the shared-phone problem. Bharat OS needs a way to bind a profile
to the person at the device without turning the device profile into the
identity itself and without storing biometric material.

## Decision

Add a Phase 2a.3 passkey scaffold:

- `src/phase1/profile-auth.mjs` creates WebAuthn register/verify challenges,
  recomputes challenge evidence, creates profile credential records, and
  verifies assertion metadata.
- `BosStore` persists `profile-credential` artifacts and appends
  `profile_credential.saved` ledger events.
- The API exposes `POST /api/profile-auth/challenges`,
  `GET /api/profile-auth/credentials`, `POST /api/profile-auth/credentials`,
  and `POST /api/profile-auth/assertions`.
- `/shell/` adds a profile-security card that calls
  `navigator.credentials.create()` / `navigator.credentials.get()` when the
  browser supports WebAuthn in a secure context.
- The stored credential record keeps credential ID metadata, transport hints,
  challenge linkage, and hash evidence. It does not store biometric data,
  private keys, attestation payloads, or authenticator response bodies.

## Consequences

- The PWA can now demonstrate per-profile passkey binding on localhost/HTTPS
  browsers while keeping Bharat OS' "identity is the person, not the device"
  model intact.
- This is not a production FIDO2 verifier yet. Attestation validation,
  authenticator-data signature verification, challenge persistence/replay
  protection, and recovery policy remain Phase 2a hardening work.
- The scaffold is deterministic and testable in Node, while the actual browser
  ceremony runs only where WebAuthn is available.
