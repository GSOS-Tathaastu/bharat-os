# ADR 0012: Start Identity-Anchored Memory As An Encrypted Vault

## Status

Accepted

## Context

The canonical architecture defines L5 as identity-anchored memory: user-owned,
encrypted, provenance-aware, and consent-bound. The decision layer now has
identity, consent, policy, tools, orchestration, and audit receipts, but no
memory primitive for durable user context.

## Decision

Add Phase 1.6 identity memory records. A memory record stores only metadata,
provenance, scopes, and a pointer to an encrypted object manifest. Plaintext is
encrypted with the owner's vault key using the existing encrypted object layer.

Reads are policy-gated through a `memory_read` action and require active consent
covering the record scopes. Approved reads decrypt locally with the owner
identity; blocked reads return a decision receipt without plaintext.

## Consequences

Bharat OS now has the first L5 contract without exposing raw memory in metadata
or dashboard surfaces. This remains a local vault, not yet a distributed,
multi-device memory substrate.
