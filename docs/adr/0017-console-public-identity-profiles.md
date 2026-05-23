# ADR 0017: Show Public Identity Profiles In The Console

## Status

Accepted

## Context

Consent, memory, tool, and decision flows all depend on a local Bharat OS
identity. The console had an actor input, but no first-class way to inspect which
public identities exist or intentionally select one for dry-runs.

The console must not become a private-key inspection surface.

## Decision

Add a Phase 1.11 identity profile section backed by `GET /api/identities`. It
renders public records only: display name, identity ID, public key, attestations,
and creation time. A row-level `Use` action copies the selected identity ID into
the decision actor input.

Private keys and vault keys remain unavailable through the API and UI.

## Consequences

Operator workflows now have a visible identity anchor without weakening the
vault boundary. Future identity pairing, recovery, and attestation screens can
extend this public profile surface.
