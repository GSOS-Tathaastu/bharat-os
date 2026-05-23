# ADR 0039: Skill Invocation Trace

## Status

Accepted

## Context

The skill invocation flow now includes blocked preflights, remediation consent
grants, retries, approved preflight execution, and tool execution receipts. These
artifacts are persisted separately, which is good for append-only auditability
but harder to inspect as one chain.

## Decision

Add Phase 1.33 skill invocation traces. The API route
`GET /api/skill-preflights/:preflightId/trace`, CLI command
`skill trace --preflight-id ...`, and console action derive a read model linking:

- related preflight receipts;
- remediation consent grants;
- decision receipts;
- linked tool execution receipts;
- ledger events.

## Consequences

- Operators can inspect an invocation chain without manually joining artifacts.
- The trace is a derived read model and does not mutate stored receipts.
- The trace uses metadata and existing receipt IDs; it does not introduce a new
  authority over consent or execution.
