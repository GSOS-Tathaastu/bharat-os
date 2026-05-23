# ADR 0030: Persisted Skill Preflight Receipts

## Status

Accepted

## Context

Phase 1.23 added skill invocation preflight for manifest integrity, consent,
scope, and policy checks. That was enough to block unsafe invocation, but the
preflight result itself was transient unless the caller captured the response.

## Decision

Add Phase 1.24 persisted `skill-preflight` receipts. Each preflight now has a
canonical `preflightId`, audit hash, embedded policy decision ID, and
append-only `skill_preflight.saved` ledger event.

The API and CLI save both the preflight receipt and its decision receipt. The
integrity verifier supports `skill-preflight` alongside decision, tool
execution, and orchestration receipts.

## Consequences

- Operators can inspect preflight history before tool execution.
- The dashboard can show preflight counts and latest receipt integrity.
- Skill preflight still does not execute tools or reserve capacity.
- Future marketplace work can attach developer signatures and remote trust roots
  to the same receipt envelope.
