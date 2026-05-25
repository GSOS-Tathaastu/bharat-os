# Bharat OS — Launch Runbook

End-to-end procedure for taking Bharat OS from a fresh git clone
to a public-facing production deployment. Last updated alongside
Phase 4.6 (ADR 0085).

## Prerequisites — partner / regulatory

These cannot be solved in code; complete before launch:

| Item | Owner | Status |
|---|---|---|
| **DPDP Fiduciary registration** | MeitY (Ministry of Electronics & IT) | TODO |
| **Domain registration** (e.g. `bharat-os.in`) | Founder | TODO |
| **SMS provider contract** — Gupshup / MSG91 / Karix | Vendor | TODO |
| **UPI PSP partnership** — Yes Bank / ICICI / Axis | Vendor + RBI | TODO (Tier 1 future) |
| **DigiLocker / AA / ABHA empanelment** | NeGD / Sahamati / NHA | TODO (Tier 1 future) |
| **Bharat OS legal entity** | Founder | DONE (per memory) |
| **DPO appointment** | Founder | TODO — name + email + postal address |
| **Bhashini SDK signup** (free) | Founder | TODO |
| **ONDC sandbox credentials** (free) | Founder | TODO |

## Pre-launch code checklist

- [ ] **`322/322+ tests green`** on the launch commit
  (`node --test --test-concurrency=1 tests/node/*.test.mjs`)
- [ ] **`scripts/seed-demo.mjs` runs clean** on a fresh
  `.demo-bharat-os` (sanity that all artifacts cross-reference)
- [ ] **Migration tested** from file-store → SQLite if you've
  been running on the file backend
  (`node scripts/migrate-store.mjs --source ... --target ...`)
- [ ] **DPDP endpoints sanity-checked**: `GET /api/dpdp/grievance`,
  `GET /api/identities/:id/erasure-preview`,
  `GET /api/identities/:id/export`
- [ ] **`.env`** populated from `.env.example` with production
  values; secrets NOT committed
- [ ] **DPO contact** in `src/phase1/dpdp-rights.mjs`
  `DEFAULT_DPO_CONTACT` updated with real entity details
- [ ] **Legal pages** (`public/legal/privacy.html` +
  `terms.html`) reviewed by legal counsel — *"[Operating
  entity]"* placeholders replaced

## Step 1 — Provision a host

Any Linux box with Docker + ≥1 GB RAM works. Recommended:
- **Hetzner CX22** (€4/mo, Frankfurt) for the EU-adjacent demo
- **AWS Lightsail $5/mo** (Mumbai region) for India proximity
- **GCP e2-small** (Mumbai region) for the same

DNS: point an A record for `bharat-os.in` (or your chosen
domain) at the host's public IP. Wait for DNS propagation
(typically 5-30 minutes).

## Step 2 — Pull the repo + configure

```bash
git clone https://github.com/[YOUR_ORG]/bharat-os.git
cd bharat-os
cp .env.example .env
# Edit .env: set BHARAT_OS_DOMAIN, BHARAT_OS_LETSENCRYPT_EMAIL,
# BHARAT_OS_SMS_PROVIDER (when partner contract lands),
# BHARAT_OS_CORS_ORIGINS if you have a separate admin host
nano .env
```

## Step 3 — Bring up Caddy + Bharat OS

```bash
docker compose up -d
docker compose logs -f
```

The Caddy container will auto-provision a Let's Encrypt cert on
first request (give it ~30 s on the first cold start; subsequent
boots reuse the cached cert from the `caddy-data` volume).

## Step 4 — Verify

```bash
# Health probe (from the host)
curl https://bharat-os.in/healthz
# → { "ok": true, "uptimeSeconds": ... }

# Readiness probe (checks the store is reachable)
curl https://bharat-os.in/readyz
# → { "ok": true, "checks": { "store": "ok" } }

# Metrics for Prometheus
curl https://bharat-os.in/metrics | head
# → # HELP bos_api_requests_total ...

# DPDP grievance contact
curl https://bharat-os.in/api/dpdp/grievance
# → { "contact": { "name": "Bharat OS DPO", ... } }
```

Open `https://bharat-os.in/shell/` in a browser — first-run
wizard should appear.

## Step 5 — Seed initial identities (optional)

For a closed-beta launch you might want to pre-seed test
identities. Exec into the running container:

```bash
docker compose exec bos-api node scripts/seed-demo.mjs /data
```

For an open launch, leave this OFF — every real user will go
through the first-run wizard.

## Step 6 — Hook up observability

The API emits Prometheus metrics on `/metrics` and structured
JSON logs to stdout. Hook up:

- **Logs**: `docker compose logs` → Loki, Cloudwatch, GCP
  Logging, Splunk, or any aggregator that reads stdout.
- **Metrics**: Prometheus / Grafana Agent / OpenTelemetry
  Collector. Scrape `/metrics` every 30 s; configure alert
  rules on `bos_api_requests_total{status="5xx"}` rate and
  `bos_api_request_duration_seconds` p99.
- **Uptime**: BetterStack / UptimeRobot / GCP Synthetic checks
  hitting `/healthz` every minute.

## Step 7 — Backup the database

The SQLite file lives in the `bos-data` Docker volume. Two
options:

**Manual (cron):**
```bash
# Daily at 03:00 UTC — copy bos.db to a backup volume.
0 3 * * * docker compose exec -T bos-api node -e \
  "require('fs').copyFileSync('/data/bos.db', '/data/bos.db.backup-' + new Date().toISOString().slice(0,10))"
```

**Litestream (continuous replication to S3):**
- Add a `litestream` sidecar container to `docker-compose.yml`.
- Streams the SQLite WAL to S3 / R2 / GCS in real time.
- Point-in-time recovery available with `litestream restore`.

## Step 8 — Set up CI/CD

The `.github/workflows/ci.yml` workflow runs on every push.
Tagged releases push to GitHub Container Registry. To deploy:

```bash
# Tag the launch commit
git tag v0.1.0
git push origin v0.1.0

# GitHub Actions builds + pushes to ghcr.io
# Then on the host:
docker compose pull
docker compose up -d
```

The Phase 4.1 graceful shutdown drains in-flight requests on
`SIGTERM` so a rolling restart doesn't drop user requests.

## Rollback procedure

If a deploy goes wrong:

```bash
# Pin the previous image tag in docker-compose.yml or .env
# Then:
docker compose pull
docker compose up -d
```

The SQLite store is forward-compatible across protocol-version
bumps (the protocolVersion is stamped on every record); rollback
is safe as long as the prior image is from the same major Phase
4.x.

If the store itself is corrupted, restore from the latest backup:

```bash
docker compose down
# Replace bos.db inside the volume with the backup
docker compose up -d
```

## Day-of-launch checklist

- [ ] DNS pointing at the host, propagated
- [ ] Caddy has provisioned the Let's Encrypt cert (check
  `https://bharat-os.in/` shows the lock icon)
- [ ] `/healthz` and `/readyz` both return 200
- [ ] `/metrics` is scraped by Prometheus
- [ ] Logs are flowing to the aggregator
- [ ] Backup cron is scheduled
- [ ] DPO email inbox is monitored
- [ ] DPDP request response SLA timer (30 days) understood by ops
- [ ] First-run wizard tested on at least 3 different physical
  devices (one iOS, one Android, one desktop browser)
- [ ] SMS provider configured (or `BHARAT_OS_SMS_PROVIDER=log`
  set if launching without phone OTP initially)
- [ ] Privacy Policy + Terms of Service public URLs work
- [ ] An internal team member has practised the
  *"erase my account"* flow end-to-end and confirms it works
  + the tombstone ledger event appears
- [ ] Rollback procedure tested in staging
- [ ] Launch announcement drafted

## Known limitations (as of Phase 4.6)

- **Single-instance only.** SQLite + in-memory rate-limiter are
  not multi-instance. For >1 process you need PostgreSQL +
  Redis-backed rate-limiting (Phase 4.6 future-work).
- **SMS provider is `log` until partner contract lands.**
  Phone OTP works for dev testing but real SMS isn't sent.
- **Voice / on-device SLM models** load from third-party CDNs
  (esm.sh, cdn.jsdelivr.net). Network failures degrade those
  features but don't break the core shell.
- **iOS is out of §15 scope.** The shell works in Mobile Safari
  but native iOS app is not planned.
- **Translations are seed-quality** (machine-assisted).
  Native-speaker review for production strings is captured in
  ADR 0084.

## Where to find things

| Concern | Location |
|---|---|
| Phase status + closed work | `BHARAT_OS.md` §17 |
| Architecture decisions | `docs/adr/0001…0085-*.md` |
| Run all tests | `npm test` |
| Seed a demo store | `node scripts/seed-demo.mjs <path>` |
| Migrate file→SQLite | `node scripts/migrate-store.mjs --source <s> --target <t>` |
| Boot API locally | `node bin/bos-api.mjs --store .bharat-os --kind sqlite` |
| Production build | `docker compose up -d` |
| Reverse-proxy config | `Caddyfile` |
| Env var reference | `.env.example` |
| CI/CD | `.github/workflows/ci.yml` |
