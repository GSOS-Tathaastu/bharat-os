# ADR 0005: UI 0 Is An Operator Console

## Status

Accepted

## Context

Bharat OS will eventually need a vernacular consumer shell, but the current build
phase is still proving the lower OS-service layers: identity, encrypted storage,
mesh placement, control-plane state, and demand simulation.

## Decision

Build the first UI as an operator console served by the local Phase 0 API. The
console visualizes bootstrap reports, node eligibility, rejection reasons,
storage utilization, and recent node rows. It can also trigger a bootstrap
simulation through the API.

## Consequences

The project now has a visible surface without pretending the consumer OS shell is
done. UI work stays tied to real protocol state and avoids direct access to the
local store files.
