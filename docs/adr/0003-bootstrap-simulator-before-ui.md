# ADR 0003: Build The Bootstrap Simulator Before The UI

## Status

Accepted

## Context

`BHARAT_OS.md` names demand bootstrap as a P0 risk. A UI is necessary later, but
the first UI should visualize real protocol behavior rather than inventing a
separate product surface.

## Decision

Build a deterministic Phase 0 bootstrap simulator first. It creates node fleets,
stores simulated demand objects, commits chunk placements, and emits a report
with success rate, eligible nodes, utilization, rejection reasons, and net
contribution score.

The UI starts later as an operator console over this data.

## Consequences

The project now has evidence-producing mechanics before a visual interface. The
future UI has concrete data to render: nodes, manifests, commitments, report
history, rejection reasons, and utilization.
