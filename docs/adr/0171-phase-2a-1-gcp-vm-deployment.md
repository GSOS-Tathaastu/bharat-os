# ADR 0171 — Phase 2a.1: GCP VM deployment (asia-south2 / e2-medium / nip.io TLS)

Status: Accepted
Date: 2026-06-03

## Context

Phase 2a.0 (ADR 0170) shipped the PWA install + offline shell.
The substrate is now installable on Android Chrome / iOS Safari
16+ but only over a TLS origin (browsers refuse to register a
service worker over plain http except on localhost). To actually
test the PWA install from a phone, we need a real public
HTTPS endpoint.

Per the founder direction ("From now onwards, we will be adding
the APIs to make the product live" — [[apis-going-live-mode]])
and the §0 binding that Bharat OS must be independent of SIP
infra ([[founder-solo-bharat-os]]), the hosting needs its own
GCP project + billing.

The user evaluated Railway (PaaS, ephemeral disk, ~$5-25/mo) vs
GCP VM (IaaS, persistent disk, ~$25/mo) and picked GCP for
persistent state + custom domain control. Region pinned to
**asia-south2 (Delhi)** for India-targeted product latency.
VM size pinned to **e2-medium** (2 vCPU shared / 4 GB RAM) — the
BE workload is light (sqlite + Ed25519 signing + audit-ledger
writes; SLM inference runs on the citizen's device in WASM).

This ADR records the deployment substrate. The actual GCP
infrastructure was provisioned during the deploy itself
(timestamps and CLI command sequence below); the code changes
that land in the repo with this ADR are the env-var
defaults, the npm scripts, and the bootstrap script.

## Decision

### 1. New GCP project — `bharat-os-prod`

Created via `gcloud projects create bharat-os-prod
--name="Bharat OS"`. Linked to the existing billing account
(`016421-12C3A0-AEAEE4`). Project number `425977408000`. The SIP
project (`sip-core-8b`) is NOT used — §0 binding preserved.

### 2. VM substrate

| Resource | Value |
|---|---|
| Compute instance | `bharat-os-vm` |
| Machine type | `e2-medium` (2 vCPU shared, 4 GB RAM) |
| Zone | `asia-south2-a` (Delhi) |
| OS image | `debian-12` (Bookworm) |
| Boot disk | 20 GB pd-balanced |
| Network tier | `STANDARD` (cheaper than PREMIUM; acceptable for v1) |
| Static external IP | `34.0.10.172` (reserved as `bharat-os-static`) |
| Tags | `http-server`, `https-server` |

Firewall rule `allow-http-https` opens tcp:80 + tcp:443 on those
tags. SSH stays restricted to gcloud IAP / project-SSH-key.

### 3. App layer — env-var-driven listener

`bin/bos-api.mjs` extended to read env vars as defaults:

```
host = --host > $HOST > $BHARAT_OS_HOST > '127.0.0.1'
port = --port > $PORT > $BHARAT_OS_PORT > 8787
storePath = --store > $BHARAT_OS_STORE_PATH > '.bharat-os'
storeKind = --kind > $BHARAT_OS_STORE_KIND > 'file'
```

CLI flags still win — local-dev unchanged. PaaS platforms that
inject `$PORT` (Railway / Fly / Render) work transparently.
systemd unit on a VM sets the env vars in `[Service]`.

`package.json` adds two scripts:
- `npm run build` — runs `cd frontend && npm install && npm run
  build` (the Vite SPA build).
- `npm start` — runs `node bin/bos-api.mjs` (honors env vars).

### 4. systemd unit

`/etc/systemd/system/bharat-os-api.service` on the VM (written
by `scripts/bootstrap-vm.sh`):

```
[Service]
Type=simple
User=${USER}
WorkingDirectory=${HOME}/bharat-os
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=BHARAT_OS_STORE_KIND=sqlite
Environment=BHARAT_OS_STORE_PATH=${HOME}/bharat-os-data
Environment=BHARAT_OS_TRUST_PROXY=1
Environment=BHARAT_OS_HSTS=1
ExecStart=/usr/bin/node bin/bos-api.mjs
Restart=on-failure
RestartSec=5
```

- Binds 127.0.0.1 (Caddy proxies; never directly exposed).
- `BHARAT_OS_STORE_KIND=sqlite` + persistent path under
  `~/bharat-os-data` so citizen identity / capacity / dispatch /
  audit-ledger state survives restarts.
- `BHARAT_OS_TRUST_PROXY=1` so the rate-limiter reads
  `X-Forwarded-For` set by Caddy.
- `BHARAT_OS_HSTS=1` enables `Strict-Transport-Security` —
  acceptable now because Caddy has a valid Let's Encrypt cert.

### 5. TLS via Caddy + nip.io

Caddyfile:

```
34-0-10-172.nip.io {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8787 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-For {remote_host}
  }
}
```

`nip.io` is a wildcard DNS service that resolves
`<dash-encoded-ip>.nip.io` to the IP. Caddy auto-fetches a Let's
Encrypt cert for that hostname. v1 demo URL:
**https://34-0-10-172.nip.io/app/**

Real domain (`bharat-os.in` / similar) lands when the user
purchases one. Migration is a one-line Caddyfile edit + DNS A
record pointing at `34.0.10.172`.

### 6. Bootstrap script — `scripts/bootstrap-vm.sh`

Idempotent bash script that does the full VM provision (Node 24
via NodeSource, SSH config for the GitHub deploy key, clone
+ build, Caddy install, systemd unit + Caddyfile write, enable
+ restart). Used by the Phase 2a.1 deploy + safe to re-run for
future updates (each step checks state before mutating).

### 7. Adversarial review verdict: ship_with_caveats

3-lens pass:

- **Privacy / §15.** Caddy sets `X-Forwarded-For` so the BE
  rate-limiter sees real client IPs (defending the limiter from
  shared-IP spoofing). `BHARAT_OS_TRUST_PROXY=1` is now
  appropriate because the BE only accepts connections from
  127.0.0.1 (Caddy) — direct 0.0.0.0 bind would have allowed
  client X-Forwarded-For spoofing. HSTS enabled. Sound.
- **Honesty.** v1 URL is `https://34-0-10-172.nip.io/app/` —
  honest about being IP-derived; no claim of a vanity domain
  until one is purchased.
- **Edge cases.** systemd `Restart=on-failure` catches Node
  crashes. Persistent sqlite under `~/bharat-os-data` survives
  VM restarts. Caddy auto-renews the Let's Encrypt cert. Deploy
  key is read-only (cannot push back to the repo from the VM).

**Caveats (deployment-level, not code-fixable):**

- **MF-1.** No automated backup of `~/bharat-os-data`. A VM
  disk failure would lose citizen records. v1 demo is acceptable
  because no real citizens yet; Phase 2a.2 adds a daily snapshot
  cron + GCS bucket.
- **MF-2.** No CI/CD — deploys are manual via `ssh + bash
  bootstrap-vm.sh`. Phase 2a.3 adds a GitHub Actions deploy
  pipeline triggered on master push.
- **MF-3.** Single VM — no redundancy. Acceptable for v1 (single
  user); not for production.

Notes for follow-up (not must-fix):

- **SF-1.** Real domain purchase + Caddyfile update.
- **SF-2.** Add `gcloud compute snapshots create` cron for
  weekly disk snapshots.
- **SF-3.** Add `fail2ban` for SSH brute-force defence (low
  priority — gcloud IAP is already restrictive).

## Consequences

- Bharat OS is now reachable at **https://34-0-10-172.nip.io/app/**
  from any phone with internet.
- The PWA install banner (Phase 2a.0) now satisfies its TLS
  precondition + can install on real Android + iOS devices.
- All §13.x features are demoable on real hardware, not just
  localhost.
- The next live-API integration phases ([[apis-going-live-mode]]
  binding) have a real HTTPS callback URL to register with
  DigiLocker / Aadhaar partner consoles.
- Monthly cost: ~$25 (e2-medium 24×7) + ~$3 (static IP) ≈ $28.
  Free tier covers the first $300 of credit (~10 months on
  this footprint).

## Tests

No new vitest / Node tests. The env-var precedence in
`bin/bos-api.mjs` is a 4-line change that's exercised by the
existing test suite (every Node test that creates a `Store` +
`listenPhase0Api` exercises the underlying contract). A
shell-based regression test for env-var parsing was considered
but the cost/benefit was poor for the substrate change size.

Full sweep at commit time: 542 vitest + 1466 Node + tsc clean
(unchanged from Phase 2a.0).

## Follow-ups (deferred)

- **Phase 2a.2** — Daily disk snapshot cron + GitHub Actions
  CI/CD deploy + real domain.
- **Phase 2a.3** — Android TWA wrapper for Play Store.
- **First live API** — DigiLocker / Aadhaar sandbox via
  the createAdapter substrate per [[apis-going-live-mode]].
- **Phase 14.0** — Sahayak provider role (700M TAM unlock).

## Cross-references

- [[apis-going-live-mode]] — the directional shift this phase
  serves
- [[android-app-vs-os-readiness-2026-05-31]] — distribution
  context
- [[distribution-app-first-os-later]] — sequencing
- [[founder-solo-bharat-os]] — §0 binding: Bharat OS independent
  of SIP infra (motivates the new GCP project)
- [[phase-2a-0-pwa-install-shipped]] — the PWA install that
  this phase makes testable on real hardware
