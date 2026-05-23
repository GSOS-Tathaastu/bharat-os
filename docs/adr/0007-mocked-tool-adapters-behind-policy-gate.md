# ADR 0007: Mock IndiaStack Tools Behind The Policy Gate

## Status

Accepted

## Context

Bharat OS depends on IndiaStack tool execution, but real UIDAI, DigiLocker,
Account Aggregator, ABHA, and UPI access requires partnerships and regulated
onboarding. The architecture still needs the L3 tool contract now so the
orchestrator, policy layer, and UI can be tested.

## Decision

Implement mocked L3 adapters for UIDAI offline eKYC, DigiLocker, Account
Aggregator, ABHA, UPI escrow, and mesh storage. Every tool execution first runs
through the Phase 1 policy/consent evaluator. Blocked decisions produce blocked
execution receipts and no tool receipt.

## Consequences

The system can now test end-to-end decision-to-tool flows without production
IndiaStack access. Mock receipts deliberately return references, summaries, and
attestation tokens instead of raw PII or payloads.
