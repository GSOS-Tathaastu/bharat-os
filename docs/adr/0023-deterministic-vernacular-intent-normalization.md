# ADR 0023: Start Vernacular Intent With Deterministic Normalization

## Status

Accepted

## Context

The product roadmap requires regulated flows in Indian languages, but the current
Phase 1 stack is intentionally dependency-light and does not yet integrate
Bhashini, ASR, translation, or an LLM-driven planner.

Jumping straight to model-backed language handling would make tests brittle and
would obscure the policy and consent behavior we are trying to stabilize.

## Decision

Add Phase 1.17 Hindi/Hinglish intent normalization as a deterministic layer in
the orchestrator. It recognizes first-flow aliases for scheme delivery, regulated
bank onboarding, health records, labor matching, and mesh storage.

The orchestration receipt now carries locale evidence: requested locale, detected
locale, normalized text, matched aliases, and a deterministic confidence value.

## Consequences

Bharat OS can exercise the first vernacular regulated-flow path without adding a
model dependency. This is a bridge, not the final L8 language stack; future work
can replace or augment the alias layer with Bhashini/AI4Bharat components while
preserving the receipt fields.
