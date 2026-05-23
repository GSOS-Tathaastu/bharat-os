# ADR 0018: Create Local Identities Through The API

## Status

Accepted

## Context

The console can list and select public identities, but operators still need the
CLI to create a new local identity. That slows down consent and memory testing
inside the UI.

Identity creation is sensitive because it generates private key and vault key
material. The UI must never receive those secrets.

## Decision

Add a Phase 1.12 `POST /api/identities` route. It creates a local identity,
persists the full identity in the configured store, and returns only
`publicIdentity`.

Add a console identity creation form that calls the route, refreshes the identity
profile table, and selects the new identity as the decision actor.

## Consequences

The console can now complete the local identity bootstrap loop without exposing
private key or vault key material. Future pairing and recovery features should
extend the same secret-safe boundary.
