# ADR 0042: Verified Preflight Execution

## Status

Accepted

## Context

Approved preflight execution creates a normal tool execution receipt linked to
the source `skillPreflightId`. Clients still needed a follow-up integrity call
to confirm the execution receipt audit hash.

## Decision

Add Phase 1.36 verified preflight execution responses. The approved-preflight
execution API and CLI command now return integrity verification for the created
tool execution receipt.

## Consequences

- Clients can show execution receipt validity immediately.
- The execution artifact remains the same tool execution receipt used elsewhere.
- Integrity verification is evidence-only and does not mutate the receipt.
