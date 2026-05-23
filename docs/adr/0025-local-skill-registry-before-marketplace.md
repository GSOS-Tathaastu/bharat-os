# ADR 0025: Add A Local Skill Registry Before Marketplace Runtime

## Status

Accepted

## Context

Bharat OS replaces apps with skills, but a real third-party marketplace needs
developer onboarding, signing, sandboxing, review, distribution, and revocation.
The current Phase 1 stack only has mocked core tool adapters.

The next useful primitive is a manifest contract that describes how a skill maps
to a policy-gated tool and what data it may expose.

## Decision

Add Phase 1.19 as a local L6 skill registry. `GET /api/skills` and
`GET /api/skills/:skillId` expose static manifests for the core mocked skills.
Each manifest includes developer KYC posture, required scopes, tool binding,
sandbox posture, audit requirement, and a no-raw-PII permission profile.

The operator console adds a Skill Registry table so the tool layer can be
reviewed as skills rather than loose adapters.

## Consequences

This creates the contract shape for a future marketplace without pretending the
marketplace exists yet. Third-party install, remote signing, runtime sandboxing,
and skill revocation remain future work.
