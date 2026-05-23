# ADR 0004: Add An HTTP API Boundary Before The UI

## Status

Accepted

## Context

Bharat OS needs a UI later, but the UI should sit on top of the same OS-service
contracts that the CLI and simulator use. Reading store files directly from a UI
would couple visual code to persistence details and risks exposing private key or
payload data.

## Decision

Add a dependency-free Node HTTP API for Phase 0.3. It exposes health, identities,
nodes, manifests, simulation reports, control-plane snapshots, and a bootstrap
simulation endpoint.

## Consequences

The future operator console can be built against stable HTTP routes. The API is
local/developer-grade for now; authentication, authorization, and production
hardening are deferred until the service boundary has settled.
