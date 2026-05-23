# ADR 0040: Skill Trace Evidence Hash

## Status

Accepted

## Context

Phase 1.33 introduced skill invocation traces as derived read models. The trace
linked the right receipts, but clients needed a compact evidence fingerprint and
explicit privacy posture to treat the trace as reviewable evidence.

## Decision

Add Phase 1.34 evidence hashes and privacy flags to skill invocation traces.
The trace `evidenceHash` is computed from linked preflight summaries, execution
summaries, consent IDs, decision IDs, and ledger evidence. The trace also states
that it is metadata-and-receipts-only and excludes raw PII, memory plaintext, and
private keys.

## Consequences

- Operators can compare traces by evidence hash.
- Trace generation remains a derived read model and does not create a new
  mutable artifact.
- Runtime fields such as `generatedAt` are not part of the evidence hash.
