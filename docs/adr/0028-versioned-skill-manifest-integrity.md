# ADR 0028: Version And Verify Skill Manifests

## Status

Accepted

## Context

The local skill registry now feeds API, CLI, console, and orchestration receipts.
Before third-party marketplace work, each manifest needs a stable version and a
tamper-evident hash so the same skill contract can be verified consistently.

## Decision

Add Phase 1.22 skill manifest integrity. Each L6 skill manifest now has a
`version`, `manifestHash`, and `manifestId` derived from the canonical manifest
payload.

`integrity verify --artifact skill --id SKILL_ID` and `POST /api/integrity/verify`
with `artifactType: "skill"` verify the manifest ID, manifest hash, KYC developer
posture, no-raw-PII rule, audit posture, and tool binding.

## Consequences

Skill manifests are now inspectable and tamper-evident without requiring signed
third-party packages yet. Future marketplace work can layer package signatures,
publisher roots, and revocation on top of the same manifest fields.
