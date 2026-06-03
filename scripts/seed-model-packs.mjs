#!/usr/bin/env node
// Phase 2a.1.4 — seed SLM model packs for the LabsPage catalog.
//
// The LabsPage installs from `GET /api/slm-model-packs` which is
// empty by default on a fresh deploy. This script POSTs two
// production-quality packs via the admin endpoint so the install
// tile renders without manual cURL.
//
// Required env vars:
//   BHARAT_OS_ADMIN_TOKEN  Phase 5.7 admin token (must match the
//                          one configured on the BE process).
// Optional:
//   BHARAT_OS_API_BASE     defaults to http://127.0.0.1:8787
//   BHARAT_OS_MODEL_HOST   defaults to https://bharat-os.com (the
//                          public origin where Caddy serves /models/)
//
// Pack metadata (sha256 + family + variant) is hard-coded for the
// two packs we ship in v1. To register a different pack, edit
// PACKS below.
//
// Idempotent: skips registration if a matching modelPackId already
// exists in the catalog.

import process from 'node:process';

const API = process.env.BHARAT_OS_API_BASE ?? 'http://127.0.0.1:8787';
const MODEL_HOST = process.env.BHARAT_OS_MODEL_HOST ?? 'https://bharat-os.com';
const TOKEN = process.env.BHARAT_OS_ADMIN_TOKEN;

if (!TOKEN) {
  console.error('[seed-model-packs] BHARAT_OS_ADMIN_TOKEN env var is required.');
  process.exit(1);
}

const PACKS = [
  {
    family: 'qwen2.5-1.5b',
    variant: 'instruct',
    parameterCount: 1_500_000_000,
    quantization: 'q4_k_m',
    // ~1.0 GB on disk after Q4_K_M quantization.
    diskBytes: 1_117_000_000,
    // 1.5B params Q4 + KV cache + WASM heap headroom ≈ 2 GB.
    ramRequiredMb: 2_048,
    runtime: 'llama_cpp_wasm',
    sourceUrl: `${MODEL_HOST}/models/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    sourceHash: 'sha256:6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    license: 'apache-2.0',
    capabilities: ['inference'],
    contextWindow: 32_768,
    description:
      'Qwen2.5 1.5B Instruct (Q4_K_M). Default Bharat OS pack — strong multilingual (Hindi/Tamil/Bengali/Marathi) and good instruct-following. Comfortable on 4 GB RAM phones.'
  },
  {
    family: 'phi-3.5-mini',
    variant: 'instruct',
    parameterCount: 3_800_000_000,
    quantization: 'q4_k_m',
    // ~2.3 GB on disk after Q4_K_M quantization.
    diskBytes: 2_393_232_544,
    // 3.8B params Q4 + KV cache + WASM heap headroom ≈ 4 GB.
    ramRequiredMb: 4_096,
    runtime: 'llama_cpp_wasm',
    sourceUrl: `${MODEL_HOST}/models/Phi-3.5-mini-instruct-Q4_K_M.gguf`,
    sourceHash: 'sha256:3f68916e850b107d8641d18bcd5548f0d66beef9e0a9077fe84ef28943eb7e88',
    license: 'mit',
    capabilities: ['inference'],
    contextWindow: 131_072,
    description:
      'Phi-3.5 Mini Instruct (Q4_K_M). Premium Bharat OS pack — stronger reasoning + 128k context. Recommended for 8 GB+ RAM phones / Snapdragon 8 Gen 2 or better.'
  }
];

async function listPacks() {
  const res = await fetch(`${API}/api/slm-model-packs`);
  if (!res.ok) {
    throw new Error(`GET /api/slm-model-packs failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // Catalog field is `modelPacks` per the registry response shape.
  return data.modelPacks ?? data.packs ?? [];
}

async function registerPack(pack) {
  const res = await fetch(`${API}/api/admin/slm-model-packs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`
    },
    body: JSON.stringify(pack)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `POST /api/admin/slm-model-packs (${pack.family}) failed: ${res.status} ${body}`
    );
  }
  return res.json();
}

function packMatch(existing, pack) {
  return (
    existing.family === pack.family &&
    existing.variant === pack.variant &&
    existing.quantization === pack.quantization &&
    existing.sourceHash === pack.sourceHash &&
    existing.status !== 'revoked'
  );
}

async function main() {
  console.log(`[seed-model-packs] target API: ${API}`);
  console.log(`[seed-model-packs] model host: ${MODEL_HOST}`);
  const existing = await listPacks();
  console.log(`[seed-model-packs] ${existing.length} pack(s) already registered`);

  let created = 0;
  let skipped = 0;
  for (const pack of PACKS) {
    const match = existing.find((p) => packMatch(p, pack));
    if (match) {
      console.log(`  · skip: ${pack.family} ${pack.variant} (already registered as ${match.modelPackId})`);
      skipped += 1;
      continue;
    }
    const res = await registerPack(pack);
    console.log(`  + register: ${pack.family} ${pack.variant} → ${res.pack?.modelPackId}`);
    created += 1;
  }

  console.log(`[seed-model-packs] done. created=${created}, skipped=${skipped}`);
}

main().catch((err) => {
  console.error('[seed-model-packs] FAILED:', err.message);
  process.exit(1);
});
