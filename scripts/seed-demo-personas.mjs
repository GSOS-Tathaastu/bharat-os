#!/usr/bin/env node
// Phase 2a.1.3 — seed demo personas for the OnboardingPage.
//
// The OnboardingPage offers "pick a demo persona above to explore
// without signing up" — but a fresh deploy has zero seeded
// identities, so the user lands on "No seeded personas for this
// path." This script POSTs a small set of display-name-classified
// personas to the running API so the demo path actually works.
//
// Names are chosen to match the WORKER_HINTS regex in
// frontend/src/lib/identity-store.ts so worker-side classification
// works without inventing a new mechanism.
//
// Idempotent: skips creation if a matching displayName already
// exists. Safe to re-run after a fresh deploy.

import process from 'node:process';

const BASE_URL = process.env.BHARAT_OS_API_BASE ?? 'http://127.0.0.1:8787';

const PERSONAS = [
  // Citizens (default classification — no worker-hint keyword).
  { displayName: 'Demo Citizen Anjali' },
  { displayName: 'Demo Citizen Vivek' },
  // Workers (must match WORKER_HINTS in identity-store.ts).
  { displayName: 'Demo Driver Ravi' },          // /driver/
  { displayName: 'Demo Freelance Designer Priya' }, // /freelance/
  { displayName: 'Demo Contractor Suresh' },     // /contractor/
  { displayName: 'Demo Mesh Worker Amit' }       // /\bmesh\b/
];

async function listIdentities() {
  const res = await fetch(`${BASE_URL}/api/identities`);
  if (!res.ok) {
    throw new Error(`GET /api/identities failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.identities ?? [];
}

async function createIdentity(displayName) {
  const res = await fetch(`${BASE_URL}/api/identities`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /api/identities (${displayName}) failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.identity;
}

async function main() {
  console.log(`[seed-demo-personas] target API: ${BASE_URL}`);
  const existing = await listIdentities();
  const existingNames = new Set(existing.map((i) => i.displayName));
  console.log(`[seed-demo-personas] ${existing.length} identities already on-box`);

  let created = 0;
  let skipped = 0;
  for (const persona of PERSONAS) {
    if (existingNames.has(persona.displayName)) {
      console.log(`  · skip: ${persona.displayName} (already exists)`);
      skipped += 1;
      continue;
    }
    const identity = await createIdentity(persona.displayName);
    console.log(`  + create: ${persona.displayName} → ${identity.id}`);
    created += 1;
  }

  console.log(
    `[seed-demo-personas] done. created=${created}, skipped=${skipped}, total now=${existing.length + created}`
  );
}

main().catch((err) => {
  console.error('[seed-demo-personas] FAILED:', err.message);
  process.exit(1);
});
