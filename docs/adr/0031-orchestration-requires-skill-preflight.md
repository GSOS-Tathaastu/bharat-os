# ADR 0031: Orchestration Requires Skill Preflight

## Status

Accepted

## Context

The orchestrator already selected L6 skill manifests and could execute mocked L3
tools after policy approval. Phase 1.24 made standalone skill preflight durable,
but orchestration still needed to enforce that same L6 gate before execution.

## Decision

Add Phase 1.25 orchestration preflight gating. Every orchestration now evaluates
the selected skill through `evaluateSkillPreflight`, records
`skillPreflightId`, and only invokes the L3 tool when the preflight approves.

The API and CLI persist the orchestration's skill preflight receipt before
saving the orchestration receipt. Blocked preflights keep orchestration status at
`blocked` and do not create tool execution receipts.

## Consequences

- L7 orchestration, L6 skills, L4 policy, and L3 tools now share one invocation
  gate.
- Operators can trace an orchestration from intent to skill preflight to
  decision and tool receipt.
- The current preflight still uses local static skills and mocked tools; remote
  marketplace trust roots remain future work.
