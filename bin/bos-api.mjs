#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { listenPhase0Api } from '../src/phase0/api.mjs';
import { BosStore } from '../src/phase0/store.mjs';

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

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port must be an integer from 1 to 65535.');
}

const store = new BosStore(storePath);
const server = await listenPhase0Api({ store, host, port });

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      service: 'bharat-os-phase0-api',
      url: `http://${host}:${port}`,
      store: storePath
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

