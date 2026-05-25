# ADR 0085: Phase 4.6 — Deployment Scripts (Docker + CI + Runbook)

## Status

Accepted

## Context

Phase 4.5 closed the named code-side launch arc (DPDP →
hardening → SQLite → phone OTP → network resilience → i18n).
Phase 4.6 packages that into something a single founder can
actually deploy to a Hetzner / Lightsail / Fly box in under an
hour, without an SRE.

What's needed:

1. **A repeatable container image** so the deploy is the same
   thing CI tested.
2. **A reverse proxy** that does HTTPS automatically (Let's
   Encrypt), forwards X-Forwarded-For correctly, and preserves
   the Phase 4.1 security headers.
3. **A persistent volume** for the SQLite database + ledger.
4. **CI that catches broken commits** before they reach the
   registry.
5. **A runbook** so the human running the deploy knows what to
   do in what order — including the partner / regulatory steps
   that gate the code.

## Decision

### Multi-stage Dockerfile

```
builder  ──→  runs all tests; failed test fails the build
        │
        ▼
runtime  ──→  distroless Node 24, uid 65532, only app code
              + (future) node_modules. CMD launches the API
              against /data as the SQLite store. Healthcheck
              hits /readyz every 30 s.
```

The builder stage runs `node --test --test-concurrency=1`
inside the image so a broken commit can't produce a passing
image. The runtime stage is `gcr.io/distroless/nodejs24-debian12:nonroot`
— no shell, no package manager, no extra binaries that
could be used to escalate.

Production environment defaults are baked in:
```dockerfile
ENV BHARAT_OS_STORE_KIND=sqlite \
    BHARAT_OS_TRUST_PROXY=1 \
    BHARAT_OS_HSTS=1 \
    BHARAT_OS_LOG_LEVEL=info
```

### `docker-compose.yml` — Caddy + Bharat OS in one bring-up

Two services:
- **`bos-api`** — the Bharat OS API/shell container, exposes
  8787 internally, mounts `bos-data:/data` for the SQLite DB,
  reads env vars from the host's `.env`. Health-checked via
  `/readyz`.
- **`caddy`** — Caddy 2-alpine, ports 80 + 443 published,
  mounts `./Caddyfile` read-only, persists Let's Encrypt
  certs in `caddy-data` and `caddy-config` volumes. Depends
  on `bos-api` being healthy.

Three named volumes: `bos-data` (SQLite + ledger),
`caddy-data` (cert state), `caddy-config` (Caddy config
state).

### `Caddyfile` — HTTPS + header passthrough

```caddyfile
{$BHARAT_OS_DOMAIN} {
    reverse_proxy bos-api:8787 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        -Server
        X-Powered-By "Bharat OS"
    }
    log { output stdout; format json }
}
```

The API server emits the full Phase 4.1 security headers
itself (CSP, X-Frame-Options, Referrer-Policy, Permissions-
Policy). Caddy passes them through unchanged. The
`Strict-Transport-Security` header is set at the proxy AND
the app — belt-and-braces in case `BHARAT_OS_HSTS` is
misconfigured.

`X-Forwarded-For` flows correctly so the rate-limiter
(`BHARAT_OS_TRUST_PROXY=1`) sees real client IPs.

### `.env.example` — every knob, documented

Every `BHARAT_OS_*` env var introduced across Phases 4.1-4.5,
with a comment explaining what it does, when to set it, and
production vs dev guidance. Reference for the launch
operator.

### `.dockerignore` — exclude .git / .tmp / .demo-* / .env

Build context stays small (~few MB). `.env` is explicitly
excluded so secrets never end up baked into the image.

### CI — `.github/workflows/ci.yml`

Three jobs:
1. **`test`** — Node 24, runs the full suite serially, plus a
   live smoke test (boot the API against a seeded store, hit
   `/healthz`, fail if it doesn't return 200).
2. **`docker-build`** — needs test pass; builds the Dockerfile
   (verifies the multi-stage build works), doesn't push.
3. **`publish`** — needs both above; only runs on tagged
   releases (`v0.1.0` etc.); builds + pushes to
   `ghcr.io/<repo>:<tag>` + `ghcr.io/<repo>:latest`.

GHCR uses `GITHUB_TOKEN` — no separate registry credentials
to manage.

### `docs/launch-runbook.md` — end-to-end deploy procedure

Eight sections:

1. **Prerequisites** — what can NOT be solved in code (DPDP
   fiduciary registration, domain, SMS partner contract, DPO
   appointment). A table with each item + owner.
2. **Pre-launch code checklist** — every test green, seed
   runs, DPDP endpoints verified, `.env` populated, DPO contact
   updated, legal pages reviewed.
3. **Step 1: provision a host** — concrete options at price
   points (Hetzner €4/mo, Lightsail $5/mo).
4. **Step 2: pull + configure** — `cp .env.example .env`,
   edit, etc.
5. **Step 3: `docker compose up -d`** — Caddy auto-provisions
   the cert.
6. **Step 4: verify** — `/healthz`, `/readyz`, `/metrics`,
   `/api/dpdp/grievance` all curl-able with expected payloads.
7. **Steps 5-8** — optional initial seed, observability
   hookup (Loki / Cloudwatch / Prometheus / Grafana), backup
   strategy (manual cron or Litestream sidecar), CI/CD
   tagged-release flow.
8. **Day-of-launch checklist + Known limitations + Rollback**
   — final sweep + the "what's still a partner / regulatory
   gap" section for honesty.

## §15 bindings — what changed

Nothing. Deployment is infrastructure; no new code paths,
no new data flows. The Caddy proxy preserves the request-id
header, the security headers, and the rate-limiter's
X-Forwarded-For dependency.

One small note: the Dockerfile env defaults set
`BHARAT_OS_HSTS=1` + `BHARAT_OS_TRUST_PROXY=1` —
appropriate for production but would lock a dev machine into
HTTPS-only behaviour. The runbook explicitly tells the
operator to override these in dev.

## Tests

No new tests — Phase 4.6 is infrastructure config. The CI
workflow runs the existing 372/372 test suite + a live
smoke test that boots the API and hits `/healthz`.

Full suite: **372 / 372 green** (unchanged from 4.5).

## Consequences

- **Launch is now a one-command operation.** `docker compose
  up -d` on a host with DNS pointing at it brings up
  production Bharat OS in ~30 seconds.
- **CI catches broken commits.** A test failure prevents the
  Docker image from being built; a broken Dockerfile prevents
  it from being pushed. Tagged releases (`v0.x.y`) auto-
  publish to GHCR.
- **Operations work is documented.** The launch runbook
  covers everything from DNS to backup to rollback. A founder
  without an SRE can follow it end-to-end.
- **Honest about gaps.** The runbook's *Known limitations*
  section explicitly names what's not solved by Phase 4
  (single-instance only, SMS provider stub, voice/SLM CDN
  dependencies, iOS out of scope, seed-quality translations).
  Future work captured per-item.
- **372 / 372 tests**, all Phase 4 acceptance criteria met.

## Phase 4 — full arc retrospective

| Phase | Closed | Headline win |
|---|---|---|
| 4.0 | ✅ 6cda414 | DPDP data-subject rights (export, erasure, grievance) |
| 4.1 | ✅ 3a81403 | Security headers + rate-limit + structured logs + metrics + graceful shutdown |
| 4.2 | ✅ a74ddd5 | SQLite store with ACID transactions |
| 4.3 | ✅ c9e28ab | Phone OTP scaffold (recovery beyond the 12-word phrase) |
| 4.4 | ✅ 7af23dd | Network resilience + offline banner + PWA install |
| 4.5 | ✅ e990797 | i18n framework + seed translations for 7 locales |
| 4.6 | ✅ this | Dockerfile + compose + Caddy + CI + launch runbook |

Bharat OS is launch-deployable.

## What's left (post-launch arc)

These are not blockers for v1 launch — they unlock scale and
depth once Bharat OS is live and growing:

- **Real SMS provider** integration (Gupshup / Karix) — Tier
  1 partner; replaces the `notConfiguredProvider` stub.
- **Real IndiaStack adapter** wiring (UIDAI eKYC, AA, ABHA,
  DigiLocker) — each its own partner contract; replaces the
  mocked tool adapters in `src/phase1/tools.mjs`.
- **PostgreSQL adapter** — multi-instance deployments;
  same `createStore` factory.
- **Native-speaker translation review** — replaces the seed
  strings in `i18n.mjs`.
- **Litestream backup** — continuous SQLite-to-S3 replication.
- **OpenTelemetry tracing** — cross-service traces via the
  request-id we already emit.
- **Account-recovery flow** — consume an `account_recovery`-
  purpose OTP + a fresh device identity, atomically rebind
  the household identity to the new device.
- **Phase 5+** — see `BHARAT_OS.md` §17 for what comes after.
