# ADR 0011: Expose The Append-Only Audit Ledger

## Status

Accepted

## Context

The store has been appending JSONL ledger events for identities, consents,
decisions, tools, orchestrations, reports, and mesh changes. Until now those
events were only useful to someone reading files directly.

## Decision

Add Phase 1.5 ledger reads to the store, CLI, API, and operator console. Ledger
queries are newest-first, can be limited, and can be filtered by event type.

## Consequences

The L4 consent and policy layer is now inspectable as an event stream. This is
still a local append-only file, not a replicated ledger, but the read contract
gives later distributed storage and audit export work a stable surface.
