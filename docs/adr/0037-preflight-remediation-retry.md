# ADR 0037: Preflight Remediation Retry

## Status

Accepted

## Context

After a missing-consent remediation grant is created and verified, clients still
need to confirm that the original blocked skill invocation is now allowed. Doing
that manually risks reconstructing the request incorrectly.

## Decision

Add Phase 1.31 preflight retry. The API route
`POST /api/skill-preflights/:preflightId/retry` and CLI command
`skill retry-preflight --preflight-id ...` load the stored preflight request,
re-evaluate it against the current consent set, and persist a new preflight
receipt.

The retried request includes `retryOfPreflightId` metadata pointing to the
blocked source preflight.

## Consequences

- Remediation can be verified without manually rebuilding request fields.
- Retry produces a new audit receipt instead of mutating the original blocked
  preflight.
- Retry remains a preflight-only action and does not execute tools.
