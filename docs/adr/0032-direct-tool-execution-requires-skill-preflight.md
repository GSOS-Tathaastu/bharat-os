# ADR 0032: Direct Tool Execution Requires Skill Preflight

## Status

Accepted

## Context

After Phase 1.25, orchestration could not invoke tools without an L6 skill
preflight. The direct API/CLI tool execution path still evaluated policy at L3,
but it did not leave the same skill-level preflight trail.

## Decision

Add Phase 1.26 direct tool preflight gating. API and CLI tool execution now map
the requested tool to its L6 skill, persist a `skill-preflight` receipt, and
link `skillPreflightId` into the tool execution receipt.

If preflight blocks, direct tool execution returns a blocked tool execution
receipt rather than invoking the adapter. Orchestration continues to avoid
creating a tool execution receipt when preflight blocks.

## Consequences

- API/CLI tool execution no longer bypasses L6 skill evidence.
- Tool execution receipts can be traced back to skill preflight receipts.
- The lower-level `executeToolAction` primitive remains useful for isolated unit
  tests and adapter development.
