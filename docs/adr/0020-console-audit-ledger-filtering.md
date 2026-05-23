# ADR 0020: Expose Ledger Filtering In The Console

## Status

Accepted

## Context

The audit ledger now includes mesh, consent, decision, tool, orchestration,
identity, memory, and bundle events. A mixed recent-events table is no longer
enough for operator review.

The API already supports filtering by event type and limit.

## Decision

Add Phase 1.14 ledger controls to the console. Operators can enter an event type
and limit, then refresh the audit table through `GET /api/ledger`.

## Consequences

The console can inspect targeted event streams without creating another event
index. Future export/download behavior should reuse the same filtered API
contract.
