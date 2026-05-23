# ADR 0009: Make Consent And Receipts Tamper Evident Before Real Integrations

## Status

Accepted

## Context

Phase 1 policy decisions, mocked tool runs, and intent orchestrations now produce
persisted audit artifacts. Before Bharat OS connects to real regulated systems,
those artifacts need a stable integrity contract so later integrations cannot
silently mutate consent, decisions, or execution receipts.

## Decision

Add Phase 1.3 signed consent and receipt integrity primitives. Consent artifacts
can be signed by an identity key over their canonical payload. Consent,
decision, tool-execution, and orchestration artifacts can be verified by
recomputing their canonical ID and audit hash.

Expose this through the CLI, API, tests, and operator console dashboard.

## Consequences

The system now has an auditable receipt shape before production IndiaStack
adapters, LLM routing, or consumer UI flows are added. Future real integrations
must preserve these artifact contracts and add stronger trust anchors rather
than bypassing the local integrity layer.
