# ADR 0002: Use a Local Portable Node.js Toolchain

## Status

Accepted

## Context

The workspace initially had Windows PowerShell only. There was no Node.js,
Python, Go, Rust, Java, or .NET SDK on PATH. Phase 0 could start as a PowerShell
executable spec, but the project needs a better runtime for CLI tooling,
persistent stores, service prototypes, and future control-plane work.

## Decision

Install Node.js v24.16.0 as a portable local toolchain under `.tools/` and keep
it out of Git. The download is verified against the official Node.js SHA256 file.

Use Node built-ins first. Avoid third-party packages until they remove real
complexity.

## Consequences

The repo can now run a real CLI and Node test suite without requiring a global
system install. Future contributors can either use the local wrapper scripts or
install Node.js globally.

