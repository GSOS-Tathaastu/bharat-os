# ADR 0006: Phase 1 Starts With Policy And Consent

## Status

Accepted

## Context

The Bharat OS document defines the differentiating decision layer as L7 plus L4:
intent orchestration must reason over consent and policy before tools execute.
Jumping straight to tool calls or agent UX would bypass the legal/safety layer.

## Decision

Implement Phase 1.0 as a dry-run policy and consent engine:

- default policy registry;
- consent artifacts;
- decision evaluation receipts;
- API and CLI access;
- operator-console visibility.

## Consequences

Bharat OS can now answer whether an action should proceed before it executes.
This creates the contract future IndiaStack tool adapters and the vernacular
shell must respect.

