#!/usr/bin/env node
// Phase 2a.1.8 — copy @wllama/wllama's WASM binary from node_modules
// into frontend/public/wllama/ so `vite build` bundles it into the
// deployed SPA under /app/wllama/. Removes the runtime dependency on
// cdn.jsdelivr.net for wllama's own WASM binary.
//
// Runs as a prebuild step. Idempotent: cleans the destination first.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../node_modules/@wllama/wllama/esm/wasm');
const dst = path.resolve(here, '../public/wllama');

async function main() {
  try {
    await fs.access(src);
  } catch {
    console.error(
      `[copy-wllama-wasm] source missing: ${src}. Run npm install first.`
    );
    process.exit(1);
  }
  try {
    await fs.rm(dst, { recursive: true, force: true });
  } catch {
    /* best-effort clean */
  }
  await fs.mkdir(dst, { recursive: true });

  // Copy the whole tree — currently just wllama.wasm + source-map.d.ts,
  // but future wllama versions may add multi-thread variants. Recursive
  // copy is safe here since the tree is small.
  await fs.cp(src, dst, { recursive: true });

  // Confirm the primary binary is present + report its size for the
  // build log so any regression is obvious.
  const wasmPath = path.join(dst, 'wllama.wasm');
  const stat = await fs.stat(wasmPath);
  console.log(
    `[copy-wllama-wasm] wllama.wasm copied (${(stat.size / 1_000_000).toFixed(2)} MB) → ${dst}`
  );
}

main().catch((err) => {
  console.error('[copy-wllama-wasm] FAILED:', err.message);
  process.exit(1);
});
