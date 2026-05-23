# ADR 0029: Preflight Skill Invocations Before Execution

## Status

Accepted

## Context

The L6 registry now has versioned, hash-verified manifests, and L7 orchestration
records the selected skill. Operators and developers need a way to check whether
a skill invocation would pass integrity, consent, scope, and policy checks before
executing a tool.

## Decision

Add Phase 1.23 skill preflight. The evaluator verifies the skill manifest, builds
the policy action request from the skill's tool binding and required scopes, and
runs the existing policy engine against current consent artifacts.

Expose it through:

- `POST /api/skills/:skillId/preflight`
- `skill preflight --id SKILL_ID --actor-id ID`
- a Preflight action in the operator console skill table.

## Consequences

Skill execution gets a dry-run boundary before side effects. Preflight does not
execute tools, reserve capacity, or write tool execution receipts; it only returns
the integrity result and decision receipt.
