# ADR 0172 — Phase 2a.1.1: Real domain (bharat-os.com canonical, www + nip.io redirect)

Status: Accepted
Date: 2026-06-03

## Context

Phase 2a.1 (ADR 0171) shipped the VM substrate with the URL
`https://34-0-10-172.nip.io/app/`. That URL was honest about
being IP-derived but is ugly for marketing + investor-facing
links. The founder owns `bharat-os.com` (registered at
Hostinger; previously parked on Hostinger CDN at `2.57.91.91`).

This phase points the apex + www to the GCP VM and makes
`https://bharat-os.com/app/` the canonical URL. The nip.io URL
stays valid as a 301 redirect so prior links don't break.

## Decision

### 1. DNS — Hostinger A records → 34.0.10.172

Founder updated the Hostinger DNS Zone Editor for `bharat-os.com`:
- A record `@` (apex) → `34.0.10.172` (was `2.57.91.91`).
- A/CNAME record `www` → resolves to apex via CNAME chain.

Propagation verified via Google DNS (8.8.8.8) + Cloudflare
DNS (1.1.1.1) — both return `34.0.10.172` for apex + alias for
`www`.

### 2. Caddy — three vhost blocks

`/etc/caddy/Caddyfile` on the VM now contains:

```
bharat-os.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8787 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-For {remote_host}
  }
}

www.bharat-os.com {
  redir https://bharat-os.com{uri} permanent
}

34-0-10-172.nip.io {
  redir https://bharat-os.com{uri} permanent
}
```

Caddy auto-fetches Let's Encrypt certs for all three hostnames
on first request. Validation passed (`caddy validate --config
/etc/caddy/Caddyfile` → `Valid configuration`).

### 3. Why apex (not www) as canonical

- Shorter for marketing copy.
- The PWA manifest `start_url: /app/` is path-only, so the apex
  vs www choice is invisible at the manifest level.
- Common modern pattern (vercel.com, anthropic.com, github.io all
  serve apex).
- 301 from www to apex is browser-cached, so the cost is one-time
  per visitor.

### 4. `scripts/bootstrap-vm.sh` updated

The bootstrap script's Caddyfile heredoc now emits the three-vhost
config with `BHARAT_OS_APEX_DOMAIN` defaulting to `bharat-os.com`.
Future re-runs reproduce the current state; future deploys to a
different domain override the env var.

### 5. Smoke test results

| URL | Result |
|---|---|
| `https://bharat-os.com/healthz` | 200, valid TLS |
| `https://bharat-os.com/app/` | 200, valid TLS, 2.9 KB |
| `https://www.bharat-os.com/app/` | 301 → apex |
| `https://34-0-10-172.nip.io/app/` | 301 → apex |

### 6. Adversarial review verdict: ship_with_no_must_fix

- **Honesty.** URL is now what it claims — bharat-os.com is owned
  by the founder; no risk of brand confusion.
- **Privacy / §15.** Unchanged from 2a.1 — BE binds 127.0.0.1;
  Caddy proxies; HSTS on. Three valid certs widen the attack
  surface marginally but Caddy auto-renews and uses ACME-DNS
  fallback.
- **Edge cases.** www redirect preserves URI path + query
  (`{uri}`). Old nip.io links 301 cleanly. PWA manifest unchanged
  (path-only start_url).

SF notes for follow-up:
- **SF-1.** Add HSTS preload list submission once domain is stable
  for a month.
- **SF-2.** Add `bharat-os.com` to the manifest `related_applications`
  field when the Android TWA wrapper ships (Phase 2a.3).
- **SF-3.** Consider Cloudflare in front for DDoS + caching once
  there's real traffic.

## Consequences

- **Canonical URL: `https://bharat-os.com/app/`** for marketing,
  investor pitch, app stores.
- Prior shipped link (`34-0-10-172.nip.io`) keeps working via
  301.
- No code changes needed in the FE — paths are relative.
- The `scripts/bootstrap-vm.sh` re-run reproduces the current
  Caddyfile, so a future VM rebuild lands with the same domain
  config.

## Tests

No new vitest / Node tests. The change is config-only (Caddyfile
on the VM + the bootstrap script).

Full sweep unchanged: 542 vitest + 1466 Node + tsc clean. ADR 0172.

## Follow-ups (deferred)

- **Phase 2a.2** — Daily disk snapshot cron + GitHub Actions
  CI/CD pipeline.
- **Phase 2a.3** — Android TWA wrapper for Play Store.
- **First live API** — DigiLocker / Aadhaar sandbox via
  createAdapter (per [[apis-going-live-mode]]).

## Cross-references

- [[phase-2a-1-gcp-vm-deployment-shipped]] — the VM substrate
  this phase polishes
- [[phase-2a-0-pwa-install-shipped]] — the PWA whose URL is now
  canonical
- [[apis-going-live-mode]] — the directional shift this phase
  serves
