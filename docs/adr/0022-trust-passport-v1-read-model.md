# ADR 0022: Add Trust Passport V1 As A Derived Read Model

## Status

Accepted

## Context

The Phase 1 roadmap calls for Trust Passport v1. The store already contains the
first evidence set: public identities, attestation metadata, consent artifacts,
integrity receipts, memory metadata, and ledger events.

Creating a new mutable passport table would make trust posture another source of
truth and could drift from the underlying evidence.

## Decision

Add Trust Passport v1 as a derived API and console read model. The API exposes
`GET /api/trust-passports` and `GET /api/trust-passports/:identityId`.

Each passport is recomputed from current store evidence and contains public
identity posture, attestation types, consent lifecycle counts, consent integrity
counts, memory metadata counts, ledger event-type evidence, and an evidence hash.
It explicitly excludes private keys, vault keys, raw attestation payloads, and
memory plaintext.

## Consequences

Trust Passport v1 becomes reviewable without increasing the write surface. Future
versions can add signed snapshots or partner-grade attestations, but the first
version stays local, public-metadata-only, and evidence-derived.
