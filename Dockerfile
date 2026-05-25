# Bharat OS — production Dockerfile (Phase 4.6).
#
# Multi-stage build:
#   1. `builder` runs the test suite so a broken commit never
#      builds a production image.
#   2. `runtime` is a minimal Node distroless image with only the
#      app code + node_modules (currently empty — Bharat OS has
#      zero npm runtime dependencies). Runs as non-root uid 1000.
#
# Node 24+ is required (uses node:sqlite, stable in v24).

# ─── Stage 1: builder (runs tests) ─────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json ./
# We're zero-dependency in production, but if package.json ever
# grows real deps, `npm ci` here installs them deterministically.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; fi

COPY . .

# Run the full test suite. A failed test fails the build.
# --test-concurrency=1 because Windows-style spawn-EAGAIN flakes
# can still surface under Linux on small CI machines.
RUN node --test --test-concurrency=1 tests/node/*.test.mjs

# ─── Stage 2: runtime (distroless, non-root) ───────────────────────────────
FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app

# Copy app from builder. Note distroless has no shell, so all
# Dockerfile-level commands must be `node`-based (or built into
# the base image).
COPY --from=builder --chown=nonroot:nonroot /app /app

# Distroless runs as uid 65532 (nonroot) by default. The store
# directory must be writable; in docker-compose it's a mounted
# volume that the host sets to be writable by uid 65532.
USER nonroot

EXPOSE 8787

# Production defaults — override via env / docker-compose:
#   BHARAT_OS_STORE_KIND=sqlite    — use the SQLite backend
#   BHARAT_OS_TRUST_PROXY=1        — behind a reverse proxy
#   BHARAT_OS_HSTS=1               — emit HSTS header
#   BHARAT_OS_LOG_LEVEL=info       — log verbosity
#   BHARAT_OS_SMS_PROVIDER=log     — SMS provider (gupshup/msg91 in prod)
ENV BHARAT_OS_STORE_KIND=sqlite \
    BHARAT_OS_TRUST_PROXY=1 \
    BHARAT_OS_HSTS=1 \
    BHARAT_OS_LOG_LEVEL=info

# Bind to all interfaces inside the container; the reverse proxy
# in front handles ingress.
CMD ["bin/bos-api.mjs", "--host", "0.0.0.0", "--port", "8787", "--store", "/data", "--kind", "sqlite"]

# Healthcheck via /readyz — checks the store is reachable.
# Distroless doesn't have curl, so we invoke node directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/readyz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
