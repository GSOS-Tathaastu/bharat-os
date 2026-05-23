# ADR 0026: Orchestrator Selects Skill Manifests Before Tools

## Status

Accepted

## Context

Phase 1.19 introduced local L6 skill manifests, but L7 orchestration still
selected only raw tool IDs. That keeps the product mentally closer to adapters
than to the Bharat OS model where skills replace apps.

## Decision

Add Phase 1.20 skill selection to action requests. When the orchestrator resolves
an intent to a tool, it also resolves the local L6 skill manifest for that tool
and records `skillId`, `skillManifestId`, skill name, and data-exposure posture.

The orchestration plan now includes an L6 `skill_selected` step before policy and
tool execution.

## Consequences

Receipts now show which OS skill was selected, not only which tool adapter ran.
This gives future marketplace, review, and revocation work a stable field to
build on while still using the local static registry.
