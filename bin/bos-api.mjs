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
const host = options.host ?? '127.0.0.1';
const port = Number(options.port ?? 8787);
const storePath = path.resolve(options.store ?? '.bharat-os');
// Phase 4.2: --kind file | sqlite. Falls back to env var
// BHARAT_OS_STORE_KIND (default: file).
const storeKind = options.kind ?? process.env.BHARAT_OS_STORE_KIND ?? 'file';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port must be an integer from 1 to 65535.');
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

