# ADR 0008: Build A Rule-Based Intent Orchestrator Before LLM Routing

## Status

Accepted

## Context

Bharat OS ultimately needs an L7 orchestrator that can interpret vernacular
intent, choose tools, reason over policy and consent, and produce auditable
execution plans. A full LLM-driven orchestrator would be premature before the
contracts are clear.

## Decision

Implement Phase 1.2 as a rule-based orchestrator. It maps intent text or explicit
action type to an action request, required scopes, selected mocked tool, consent
requirement, policy decision, optional tool execution, and an orchestration
receipt.

## Consequences

The L7 contract exists before any model dependency. Future LLM routing must
produce the same action-request and orchestration receipt shape, rather than
inventing a parallel execution path.
