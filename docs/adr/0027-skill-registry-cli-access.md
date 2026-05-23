# ADR 0027: Expose Skill Manifests Through The CLI

## Status

Accepted

## Context

Phase 1.19 added the local L6 skill registry and Phase 1.20 linked
orchestration receipts to selected skill manifests. API and console access are
useful for operators, but developers also need a dependency-light way to inspect
the same registry from scripts.

## Decision

Add Phase 1.21 CLI commands:

- `skill list`
- `skill read --id SKILL_ID`

Both commands read the local static registry and return JSON.

## Consequences

The skill manifest contract can now be inspected from tests, scripts, API, and
console without adding marketplace infrastructure. Installation, signature
chains, and third-party skill packaging remain future work.
