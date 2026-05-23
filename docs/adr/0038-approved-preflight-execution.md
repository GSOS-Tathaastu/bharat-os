# ADR 0038: Approved Preflight Execution

## Status

Accepted

## Context

Preflight retry can confirm that a previously blocked request is now approved,
but the caller still needs a canonical way to invoke the exact approved request
without reconstructing it.

## Decision

Add Phase 1.32 approved preflight execution. The API route
`POST /api/skill-preflights/:preflightId/execute`, CLI command
`skill execute-preflight --preflight-id ...`, and operator-console action execute
the tool request from an approved stored preflight.

The resulting tool execution receipt carries the source `skillPreflightId`.

## Consequences

- Approved preflights become explicit invocation handles.
- Tool execution remains separately receipted and policy-gated at execution time.
- Blocked preflights cannot be executed through this route.
