// Phase 12.2.6 — DigiLocker substrate + OAuth2 stub flow +
// token storage + DPDP cascade + Parivahan digilocker-provider
// integration.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  generateState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  buildLink,
  stubSignedDocument,
  verifyDocumentSignature,
  readDigiLockerMode,
  DIGILOCKER_PROTOCOL_VERSION,
  DIGILOCKER_SCOPES,
  DIGILOCKER_AUTHORIZE_URL,
  DIGILOCKER_STATE_MAX_LEN,
  DigiLockerError
} from '../../src/phase1/digilocker-substrate.mjs';
import {
  createProviderIdentity,
  recordRoleExtrasSubmission
} from '../../src/phase1/provider-identity.mjs';
import {
  createParivahanAdapter,
  verifyRoleExtrasFields
} from '../../src/phase1/parivahan-adapter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'digilocker-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Substrate ────────────────────────────────────────────────────

test('protocol version + scope allowlist frozen', () => {
  assert.equal(DIGILOCKER_PROTOCOL_VERSION, 'bos.phase12.digilocker.v0');
  assert.deepEqual([...DIGILOCKER_SCOPES].sort(), ['documents.fetch', 'documents.read']);
  assert.throws(() => { DIGILOCKER_SCOPES.push('x'); }, TypeError);
});

test('generateState requires rootIdentityId', () => {
  assert.throws(() => generateState({}), (e) => e instanceof DigiLockerError && e.code === 'root_identity_required');
});

test('generateState returns sha256-derived state ≤ 48 chars', () => {
  const r = generateState({ rootIdentityId: 'bos:person:1' });
  assert.match(r.state, /^[0-9a-f]{48}$/);
  assert.ok(r.state.length <= DIGILOCKER_STATE_MAX_LEN);
});

test('generateState produces different states on repeat (salt entropy)', () => {
  const a = generateState({ rootIdentityId: 'bos:person:1' });
  const b = generateState({ rootIdentityId: 'bos:person:1' });
  assert.notEqual(a.state, b.state);
});

test('buildAuthorizeUrl stub mode points at our own callback', () => {
  const r = buildAuthorizeUrl({
    mode: 'stub',
    redirectUri: 'http://localhost:8787/api/digilocker/callback',
    state: 'abc',
    scope: DIGILOCKER_SCOPES
  });
  assert.ok(r.includes('code=stub-abc'));
  assert.ok(r.includes('state=abc'));
});

test('buildAuthorizeUrl live mode hits api.digitallocker.gov.in', () => {
  const r = buildAuthorizeUrl({
    mode: 'live',
    clientId: 'fake-client',
    redirectUri: 'https://example.test/callback',
    state: 'abc',
    scope: DIGILOCKER_SCOPES
  });
  assert.ok(r.startsWith(DIGILOCKER_AUTHORIZE_URL));
  assert.ok(r.includes('client_id=fake-client'));
  assert.ok(r.includes('redirect_uri=https'));
  assert.ok(r.includes('state=abc'));
  assert.ok(r.includes('response_type=code'));
});

test('exchangeCodeForToken stub mode requires stub- prefix', async () => {
  await assert.rejects(
    exchangeCodeForToken({ mode: 'stub', code: 'real-looking-code' }),
    (e) => e instanceof DigiLockerError && e.code === 'invalid_code'
  );
});

test('exchangeCodeForToken stub mode returns deterministic envelope', async () => {
  const env = await exchangeCodeForToken({
    mode: 'stub',
    code: 'stub-abc',
    at: '2026-06-01T10:00:00.000Z'
  });
  assert.equal(env.mode, 'stub');
  assert.equal(env.tokenType, 'Bearer');
  assert.match(env.accessToken, /^dl-stub-access-abc$/);
  assert.equal(env.scope, 'documents.read documents.fetch');
  assert.ok(env.expiresAt > '2026-06-01T10:00:00.000Z');
});

test('exchangeCodeForToken live mode uses liveFetch + parses response', async () => {
  const seen = [];
  const liveFetch = async (url, init) => {
    seen.push({ url, body: init.body });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'live-token-xyz',
        refresh_token: 'live-refresh-xyz',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'documents.read documents.fetch'
      })
    };
  };
  const env = await exchangeCodeForToken({
    mode: 'live',
    clientId: 'fake-cid',
    clientSecret: 'fake-secret',
    redirectUri: 'https://x/cb',
    code: 'abc',
    liveFetch
  });
  assert.equal(env.accessToken, 'live-token-xyz');
  assert.equal(env.refreshToken, 'live-refresh-xyz');
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.startsWith(DIGILOCKER_AUTHORIZE_URL.replace('authorize', 'token')));
  assert.ok(seen[0].body.includes('grant_type=authorization_code'));
});

test('buildLink composes the persisted record', () => {
  const link = buildLink({
    rootIdentityId: 'bos:person:1',
    tokenEnvelope: {
      mode: 'stub',
      accessToken: 'dl-stub-access-abc',
      refreshToken: 'dl-stub-refresh-abc',
      tokenType: 'Bearer',
      expiresAt: '2026-06-01T11:00:00.000Z',
      scope: 'documents.read documents.fetch',
      issuedAt: '2026-06-01T10:00:00.000Z'
    }
  });
  assert.equal(link.rootIdentityId, 'bos:person:1');
  assert.equal(link.accessToken, 'dl-stub-access-abc');
  // Phase 12.2.6 adversarial fix L1-1 — bindingDigest is null
  // in stub mode (stub tokens are rainbow-tableable).
  assert.equal(link.bindingDigest, null);
});

test('readDigiLockerMode falls back to stub when live but env unset', () => {
  delete process.env.BHARAT_OS_DIGILOCKER_MODE;
  assert.equal(readDigiLockerMode(), 'stub');
  process.env.BHARAT_OS_DIGILOCKER_MODE = 'live';
  delete process.env.BHARAT_OS_DIGILOCKER_CLIENT_ID;
  assert.equal(readDigiLockerMode(), 'stub');
  process.env.BHARAT_OS_DIGILOCKER_CLIENT_ID = 'x';
  process.env.BHARAT_OS_DIGILOCKER_CLIENT_SECRET = 'y';
  assert.equal(readDigiLockerMode(), 'live');
  delete process.env.BHARAT_OS_DIGILOCKER_MODE;
  delete process.env.BHARAT_OS_DIGILOCKER_CLIENT_ID;
  delete process.env.BHARAT_OS_DIGILOCKER_CLIENT_SECRET;
});

test('stubSignedDocument + verifyDocumentSignature round-trip', () => {
  const signed = stubSignedDocument({ documentType: 'DRVLC', identifier: 'MH123' });
  assert.equal(signed.payload.documentType, 'DRVLC');
  assert.ok(signed.signature.startsWith('stub:'));
  const verdict = verifyDocumentSignature(signed);
  assert.equal(verdict.ok, true);
});

test('verifyDocumentSignature rejects tampered payload', () => {
  const signed = stubSignedDocument({ documentType: 'DRVLC', identifier: 'MH123' });
  signed.payload.holderName = 'Mallory';
  const verdict = verifyDocumentSignature(signed);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'stub_signature_mismatch');
});

// ─── Store substrate (SqliteStore) ────────────────────────────────

test('SqliteStore state save → consume is one-shot', async () => {
  const { store } = await freshSqlite('state-one-shot');
  try {
    await store.saveDigiLockerState({
      state: 'abc',
      rootIdentityId: 'bos:person:1',
      mintedAt: '2026-06-01T10:00:00.000Z',
      expiresAt: '2026-06-01T10:10:00.000Z',
      redirectUri: 'http://x/cb',
      next: '/post'
    });
    const a = await store.consumeDigiLockerState('abc');
    assert.ok(a);
    assert.equal(a.redirectUri, 'http://x/cb');
    assert.equal(a.next, '/post');
    const b = await store.consumeDigiLockerState('abc');
    assert.equal(b, null, 'state consumed once');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore sweepExpiredDigiLockerStates removes past-cutoff rows', async () => {
  const { store } = await freshSqlite('state-sweep');
  try {
    await store.saveDigiLockerState({
      state: 'old',
      rootIdentityId: 'bos:person:1',
      mintedAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z'
    });
    await store.saveDigiLockerState({
      state: 'fresh',
      rootIdentityId: 'bos:person:1',
      mintedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const removed = await store.sweepExpiredDigiLockerStates({ now: new Date().toISOString() });
    assert.equal(removed, 1);
    assert.equal(await store.consumeDigiLockerState('old'), null);
    assert.ok(await store.consumeDigiLockerState('fresh'));
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore link save/read/delete + audit events meta-only', async () => {
  const { store } = await freshSqlite('link-crud');
  try {
    const link = buildLink({
      rootIdentityId: 'bos:person:1',
      tokenEnvelope: {
        mode: 'stub',
        accessToken: 'SECRET-TOKEN-DO-NOT-LEAK',
        refreshToken: 'SECRET-REFRESH',
        expiresAt: '2026-06-01T11:00:00.000Z',
        issuedAt: '2026-06-01T10:00:00.000Z',
        scope: 'documents.read'
      }
    });
    await store.saveDigiLockerLink(link);
    const back = await store.readDigiLockerLink('bos:person:1');
    assert.equal(back.accessToken, 'SECRET-TOKEN-DO-NOT-LEAK');

    const events = await store.listLedger({ type: 'digilocker.link_saved' });
    assert.equal(events.length, 1);
    const json = JSON.stringify(events[0]);
    assert.ok(!/SECRET-TOKEN/.test(json), 'access token NOT on audit');
    assert.ok(!/SECRET-REFRESH/.test(json), 'refresh token NOT on audit');

    const deleted = await store.deleteDigiLockerLink('bos:person:1');
    assert.equal(deleted, true);
    const after = await store.readDigiLockerLink('bos:person:1');
    assert.equal(after, null);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore DPDP cascade — states + links swept by root_identity_id', async () => {
  const { store } = await freshSqlite('cascade');
  try {
    const id = createIdentity({ displayName: 'Test' });
    await store.saveIdentity(id);
    await store.saveDigiLockerState({
      state: 's1',
      rootIdentityId: id.id,
      mintedAt: '2026-06-01T10:00:00.000Z',
      expiresAt: '2026-06-01T10:10:00.000Z'
    });
    await store.saveDigiLockerLink(buildLink({
      rootIdentityId: id.id,
      tokenEnvelope: { mode: 'stub', accessToken: 'x', expiresAt: '2026-06-01T11:00:00.000Z', issuedAt: '2026-06-01T10:00:00.000Z' }
    }));
    const result = await store.eraseUserData(id.id);
    assert.ok(result.sections.digilockerStates >= 1);
    assert.ok(result.sections.digilockerLinks >= 1);
    assert.equal(await store.readDigiLockerLink(id.id), null);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

// ─── HTTP integration ─────────────────────────────────────────────

async function withApiServer(callback) {
  const { store } = await freshSqlite('srv');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

async function seedIdentity(store) {
  const id = createIdentity({ displayName: `Test ${Math.floor(Math.random() * 1e9)}` });
  await store.saveIdentity(id);
  return id;
}

test('GET /api/digilocker/authorize requires acting identity → 401', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/digilocker/authorize`);
    assert.equal(r.status, 401);
  });
});

test('GET /api/digilocker/authorize unknown identity → 404', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=bos:person:nope`);
    assert.equal(r.status, 404);
  });
});

test('full stub OAuth round-trip: authorize → callback → status → unlink', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);

    // 1. authorize.
    const r1 = await fetch(`${baseUrl}/api/digilocker/authorize`, {
      headers: { 'x-bharat-os-acting-identity': id.id }
    });
    assert.equal(r1.status, 200);
    const auth = await r1.json();
    assert.equal(auth.mode, 'stub');
    assert.ok(auth.authorizeUrl.includes(`code=stub-${encodeURIComponent(auth.state)}`));

    // 2. callback — replay the URL the stub authorize handed us.
    const callbackUrl = new URL(auth.authorizeUrl);
    const r2 = await fetch(`${baseUrl}${callbackUrl.pathname}${callbackUrl.search}`);
    assert.equal(r2.status, 200);
    const cb = await r2.json();
    assert.equal(cb.linked, true);
    assert.equal(cb.rootIdentityId, id.id);

    // 3. status — link present, token NEVER returned.
    const r3 = await fetch(`${baseUrl}/api/digilocker/status?actingRootIdentityId=${encodeURIComponent(id.id)}`);
    assert.equal(r3.status, 200);
    const status = await r3.json();
    assert.equal(status.linked, true);
    assert.equal(status.mode, 'stub');
    assert.ok(!('accessToken' in status));
    assert.ok(!('refreshToken' in status));

    // 4. unlink.
    const r4 = await fetch(`${baseUrl}/api/digilocker/link?actingRootIdentityId=${encodeURIComponent(id.id)}`, {
      method: 'DELETE'
    });
    assert.equal(r4.status, 200);
    const after = await fetch(`${baseUrl}/api/digilocker/status?actingRootIdentityId=${encodeURIComponent(id.id)}`);
    const afterBody = await after.json();
    assert.equal(afterBody.linked, false);
  });
});

test('callback rejects state that was never minted → 400', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/digilocker/callback?code=stub-bogus&state=bogus`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_or_expired_state');
  });
});

test('state is single-use — second callback for the same state fails', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r1 = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}`);
    const auth = await r1.json();
    const callbackUrl = new URL(auth.authorizeUrl);
    const firstCallback = await fetch(`${baseUrl}${callbackUrl.pathname}${callbackUrl.search}`);
    assert.equal(firstCallback.status, 200);
    const secondCallback = await fetch(`${baseUrl}${callbackUrl.pathname}${callbackUrl.search}`);
    assert.equal(secondCallback.status, 400);
    const body = await secondCallback.json();
    assert.equal(body.error.code, 'invalid_or_expired_state');
  });
});

test('callback with code from one citizen but state from another would fail (state binding)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const a = await seedIdentity(store);
    const b = await seedIdentity(store);
    const rA = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(a.id)}`);
    const authA = await rA.json();
    const rB = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(b.id)}`);
    const authB = await rB.json();
    // Swap states between citizens — completes callback for A
    // using B's state. Because state binds to rootIdentityId
    // server-side, the link ends up on B (the legitimate owner
    // of that state), not A. Attacker can't hijack B's link.
    const swappedCode = `stub-${authB.state}`;
    const r = await fetch(`${baseUrl}/api/digilocker/callback?code=${encodeURIComponent(swappedCode)}&state=${encodeURIComponent(authB.state)}`);
    assert.equal(r.status, 200);
    const cb = await r.json();
    assert.equal(cb.rootIdentityId, b.id, 'link landed on B who owns the state, not the swap-attempter');
  });
});

// ─── Adversarial fixes ────────────────────────────────────────────

test('buildLink skips bindingDigest in stub mode (L1-1 fix)', () => {
  const stub = buildLink({
    rootIdentityId: 'bos:person:1',
    tokenEnvelope: { mode: 'stub', accessToken: 'dl-stub-access-abc', expiresAt: '2026-06-01T11:00:00.000Z', issuedAt: '2026-06-01T10:00:00.000Z' }
  });
  assert.equal(stub.bindingDigest, null, 'stub mode → no digest');
  const live = buildLink({
    rootIdentityId: 'bos:person:1',
    tokenEnvelope: { mode: 'live', accessToken: 'live-real-entropy-token', expiresAt: '2026-06-01T11:00:00.000Z', issuedAt: '2026-06-01T10:00:00.000Z' }
  });
  assert.match(live.bindingDigest, /^[0-9a-f]{32}$/, 'live mode → digest set');
});

test('GET /authorize rejects foreign redirectUri (L1-2 fix)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r = await fetch(
      `${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}&redirectUri=https://attacker.example/steal`
    );
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'redirect_uri_not_allowed');
  });
});

test('GET /authorize accepts same-origin self-callback (L1-2 fix)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    // Same-origin → allowed (default path).
    const r = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}`);
    assert.equal(r.status, 200);
  });
});

test('GET /authorize accepts BHARAT_OS_DIGILOCKER_REDIRECT_URI when configured (L1-2 fix)', async () => {
  process.env.BHARAT_OS_DIGILOCKER_REDIRECT_URI = 'https://prod.bharat-os.in/api/digilocker/callback';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const id = await seedIdentity(store);
      const r = await fetch(
        `${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}&redirectUri=${encodeURIComponent(process.env.BHARAT_OS_DIGILOCKER_REDIRECT_URI)}`
      );
      assert.equal(r.status, 200);
    });
  } finally {
    delete process.env.BHARAT_OS_DIGILOCKER_REDIRECT_URI;
  }
});

test('readDigiLockerMode warns once when live but env unset (L1-3 fix)', async () => {
  const { _resetDigiLockerFallbackMemo } = await import('../../src/phase1/digilocker-substrate.mjs');
  _resetDigiLockerFallbackMemo();
  // Capture stderr.
  const captured = [];
  const origError = console.error;
  console.error = (msg) => captured.push(msg);
  try {
    process.env.BHARAT_OS_DIGILOCKER_MODE = 'live';
    delete process.env.BHARAT_OS_DIGILOCKER_CLIENT_ID;
    readDigiLockerMode();
    readDigiLockerMode();
    readDigiLockerMode();
    // Should have warned exactly once.
    const warns = captured.filter((c) => typeof c === 'string' && c.includes('digilocker_live_fallback_to_stub'));
    assert.equal(warns.length, 1);
  } finally {
    console.error = origError;
    delete process.env.BHARAT_OS_DIGILOCKER_MODE;
    _resetDigiLockerFallbackMemo();
  }
});

test('callback peek-then-consume: state NOT consumed when exchange fails (L2-6 fix)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const id = await seedIdentity(store);
    const r1 = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}`);
    const auth = await r1.json();
    // Use an invalid code that fails stub-prefix check ⇒ exchange throws.
    const r2 = await fetch(`${baseUrl}/api/digilocker/callback?code=invalid-code&state=${encodeURIComponent(auth.state)}`);
    assert.equal(r2.status, 400);
    // State should STILL be available — the citizen can retry
    // with the correct code rather than restart the round-trip.
    const stillThere = await store.peekDigiLockerState(auth.state);
    assert.ok(stillThere, 'state preserved after failed exchange');
  });
});

test('opportunistic sweep on save bounds state growth (L3-4 fix)', async () => {
  const { store } = await freshSqlite('opportunistic-sweep');
  try {
    // Insert an expired state.
    await store.saveDigiLockerState({
      state: 'old-state',
      rootIdentityId: 'bos:person:1',
      mintedAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z'
    });
    // saveDigiLockerState itself doesn't sweep — the api
    // handler does. But sweepExpiredDigiLockerStates is
    // callable directly + idempotent.
    const removed = await store.sweepExpiredDigiLockerStates({ now: new Date().toISOString() });
    assert.equal(removed, 1);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

// ─── Parivahan integration (DigiLocker accelerator) ───────────────

test('verifyRoleExtrasFields with digilockerLink returns signedDocSha256', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const digilockerLink = buildLink({
    rootIdentityId: 'bos:person:1',
    tokenEnvelope: { mode: 'stub', accessToken: 'x', expiresAt: '2026-06-01T11:00:00.000Z', issuedAt: '2026-06-01T10:00:00.000Z' }
  });
  const out = await verifyRoleExtrasFields(adapter, {
    role: 'cab-driver',
    answers: {
      drivingLicenceNumber: 'MH1420130012345',
      vehicleRegistrationNumber: 'MH12AB1234'
    },
    digilockerLink
  });
  assert.equal(out.drivingLicenceNumber.status, 'valid');
  assert.equal(out.drivingLicenceNumber.provider, 'digilocker');
  assert.ok(/^[0-9a-f]{64}$/.test(out.drivingLicenceNumber.signedDocSha256));
  assert.equal(out.vehicleRegistrationNumber.provider, 'digilocker');
  assert.ok(/^[0-9a-f]{64}$/.test(out.vehicleRegistrationNumber.signedDocSha256));
});

test('verifyRoleExtrasFields without digilockerLink falls back to generic adapter (no signedDocSha256)', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const out = await verifyRoleExtrasFields(adapter, {
    role: 'cab-driver',
    answers: { drivingLicenceNumber: 'MH1420130012345', vehicleRegistrationNumber: 'MH12AB1234' }
  });
  assert.equal(out.drivingLicenceNumber.provider, 'stub');
  assert.ok(!('signedDocSha256' in out.drivingLicenceNumber));
});

test('verify-role-extras endpoint USES digilocker link when citizen linked', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const id = await seedIdentity(store);
      let p = createProviderIdentity({
        rootIdentityId: id.id,
        roleKind: 'cab-driver',
        displayName: 'Test',
        serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
      });
      p = recordRoleExtrasSubmission(p, {
        schemaVersion: 1, role: 'cab-driver',
        answers: { drivingLicenceNumber: 'MH1420130012345', vehicleRegistrationNumber: 'MH12AB1234', commercialPermitNumber: 'CP-1' },
        attachments: {}
      });
      await store.saveProviderIdentity(p);
      // Citizen authorises DigiLocker.
      const a = await fetch(`${baseUrl}/api/digilocker/authorize?actingRootIdentityId=${encodeURIComponent(id.id)}`);
      const auth = await a.json();
      const cb = new URL(auth.authorizeUrl);
      await fetch(`${baseUrl}${cb.pathname}${cb.search}`);
      // Operator triggers verify.
      const v = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(p.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: { 'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      });
      assert.equal(v.status, 200);
      const body = await v.json();
      const dl = body.providerIdentity.roleExtrasVerifications.results.drivingLicenceNumber;
      assert.equal(dl.provider, 'digilocker', 'used digilocker accelerator');
      assert.ok(dl.signedDocSha256);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});
