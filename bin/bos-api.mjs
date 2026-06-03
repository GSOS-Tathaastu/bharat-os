#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { listenPhase0Api } from '../src/phase0/api.mjs';
import { createStore } from '../src/phase0/sqlite-store.mjs';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
// Phase 2a.1 — env-var defaults so a systemd unit on a VM (GCP /
// AWS / DO / Hetzner) OR a PaaS that injects $PORT (Railway /
// Fly / Render) can configure the listener without CLI flag
// plumbing. CLI flags still win when present (local-dev override).
// Precedence: --flag > $PORT/$HOST > $BHARAT_OS_PORT/$BHARAT_OS_HOST
// > built-in default (127.0.0.1:8787).
const host = options.host ?? process.env.HOST ?? process.env.BHARAT_OS_HOST ?? '127.0.0.1';
const port = Number(options.port ?? process.env.PORT ?? process.env.BHARAT_OS_PORT ?? 8787);
const storePath = path.resolve(options.store ?? process.env.BHARAT_OS_STORE_PATH ?? '.bharat-os');
// Phase 4.2: --kind file | sqlite. Falls back to env var
// BHARAT_OS_STORE_KIND (default: file).
const storeKind = options.kind ?? process.env.BHARAT_OS_STORE_KIND ?? 'file';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    'port must be an integer from 1 to 65535. Pass via --port, $PORT, or $BHARAT_OS_PORT.'
  );
}

const store = await createStore({ rootPath: storePath, kind: storeKind });
const server = await listenPhase0Api({ store, host, port });

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      service: 'bharat-os-phase0-api',
      url: `http://${host}:${port}`,
      store: storePath,
      storeKind
    },
    null,
    2
  )}\n`
);

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

