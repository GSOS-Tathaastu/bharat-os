# ADR 0014: Keep Console Memory Reveal Behind The Policy Gate

## Status

Accepted

## Context

Phase 1.7 made memory records discoverable through metadata search and
provenance. The operator console can now find records, but operators also need a
way to test whether a record can be read under current consent.

A direct local decrypt button would break the L4/L5 boundary. It would make the
console a privileged plaintext surface instead of another client of the OS
service layer.

## Decision

Add a Phase 1.8 console read action that calls
`POST /api/memory-records/:recordId/read`. The action does not pass through
local files or bundles. It displays the decision receipt and only includes
plaintext when the policy engine approves the `memory_read` request with active
consent covering the record scopes.

## Consequences

The console can support end-to-end memory inspection without gaining special
access. Blocked reads become auditable decision receipts, and approved reads use
the same path the CLI and API tests already exercise.
