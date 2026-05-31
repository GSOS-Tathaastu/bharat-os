// Phase 12.0.1 — dev-OTP reveal smoke tests.
//
// When the SMS provider is `log` (default in dev), the
// /api/phone-otp/send and /api/recovery/start responses include
// `_devOtpCode` so the demo flow doesn't need anyone to read the
// server console. When the SMS provider is anything else
// (gupshup, twilio, msg91), the field MUST NOT be present.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'auth-dev-otp-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

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

test('phone-otp/send includes _devOtpCode when SMS provider is log (default)', async () => {
  // Default = log. Clear the env var to be explicit.
  await withEnv({ BHARAT_OS_SMS_PROVIDER: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      // Create an identity first — send-OTP requires identityId.
      const createRes = await fetch(`${baseUrl}/api/identities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Sign Up Test' })
      });
      const { identity } = await createRes.json();
      const otpRes = await fetch(`${baseUrl}/api/phone-otp/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityId: identity.id,
          phone: '+919876543210',
          purpose: 'phone_verify'
        })
      });
      assert.equal(otpRes.status, 201);
      const body = await otpRes.json();
      assert.equal(typeof body._devOtpCode, 'string');
      assert.ok(/^\d{4,8}$/.test(body._devOtpCode), `expected digits, got ${body._devOtpCode}`);
    });
  });
});

test('phone-otp/send MUST NOT include _devOtpCode when SMS provider is gupshup', async () => {
  // We can't actually send via gupshup without keys, but the
  // routing happens through getSmsProvider which throws before
  // any HTTP request — so set the provider and expect the call
  // to fail with a 5xx; the §15 binding here is that even a
  // FAILED send must not leak the code. The code path is the
  // one we care about: the response branch that includes
  // _devOtpCode only runs when provider === 'log'.
  await withEnv(
    { BHARAT_OS_SMS_PROVIDER: 'gupshup' },
    async () => {
      await withApiServer(async ({ baseUrl }) => {
        const createRes = await fetch(`${baseUrl}/api/identities`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: 'Gupshup Test' })
        });
        const { identity } = await createRes.json();
        const otpRes = await fetch(`${baseUrl}/api/phone-otp/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identityId: identity.id,
            phone: '+919876543210',
            purpose: 'phone_verify'
          })
        });
        // Either it 5xx'd because gupshup keys are missing, or
        // it 201'd (unlikely in a test env). Either way the body
        // MUST NOT carry _devOtpCode.
        const body = await otpRes.json();
        assert.equal(
          '_devOtpCode' in body,
          false,
          `_devOtpCode leaked under non-log provider: ${JSON.stringify(body)}`
        );
      });
    }
  );
});

test('recovery/start includes _devOtpCode when SMS provider is log AND identity matched', async () => {
  await withEnv({ BHARAT_OS_SMS_PROVIDER: null }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      // Create identity + verify phone so recovery/start can match it.
      const createRes = await fetch(`${baseUrl}/api/identities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Sign In Test' })
      });
      const { identity } = await createRes.json();
      const sendRes = await fetch(`${baseUrl}/api/phone-otp/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityId: identity.id,
          phone: '+919876543210',
          purpose: 'phone_verify'
        })
      });
      const sendBody = await sendRes.json();
      const code = sendBody._devOtpCode;
      // Verify the OTP so the phone gets attached as a verified
      // attestation (this is what recovery/start matches against).
      await fetch(`${baseUrl}/api/phone-otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otpId: sendBody.otpId, code })
      });
      // Now sign in.
      const recRes = await fetch(`${baseUrl}/api/recovery/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+919876543210' })
      });
      assert.equal(recRes.status, 201);
      const recBody = await recRes.json();
      assert.equal(typeof recBody._devOtpCode, 'string');
      // Anti-enumeration sentinel honour-check: there's a real
      // recovery happening so we DO get an _devOtpCode (matched).
      // The unmatched case (next test) must not get one.
    });
  });
});

test('recovery/start anti-enumeration sentinel MUST NOT include _devOtpCode for unknown phone', async () => {
  await withEnv({ BHARAT_OS_SMS_PROVIDER: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/recovery/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+919999999999' })
      });
      // The sentinel returns 200 with a fake recovery id. The
      // key §15 property: it MUST NOT include _devOtpCode (which
      // would otherwise leak whether the phone matched).
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal('_devOtpCode' in body, false);
      assert.equal(body.recoveryId, 'bos:account-recovery:no-match-sentinel');
    });
  });
});

test('full sign-up flow: create identity → send OTP → verify → identity has phone_verified attestation', async () => {
  await withEnv({ BHARAT_OS_SMS_PROVIDER: null }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const createRes = await fetch(`${baseUrl}/api/identities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Full Flow Test' })
      });
      const { identity } = await createRes.json();
      const sendRes = await fetch(`${baseUrl}/api/phone-otp/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityId: identity.id,
          phone: '+919876543299',
          purpose: 'phone_verify'
        })
      });
      const { otpId, _devOtpCode } = await sendRes.json();
      const verifyRes = await fetch(`${baseUrl}/api/phone-otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otpId, code: _devOtpCode })
      });
      const verifyBody = await verifyRes.json();
      assert.equal(verifyBody.status, 'verified');

      // Verify identity now carries phone_verified attestation.
      const stored = await store.readIdentity(identity.id);
      assert.equal(stored?.attestations?.phone_verified?.status, 'verified');
    });
  });
});

test('full sign-in flow: signed-up user can recover via recovery/start + recovery/verify', async () => {
  await withEnv({ BHARAT_OS_SMS_PROVIDER: null }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      // Set up a verified-phone identity first.
      const createRes = await fetch(`${baseUrl}/api/identities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Sign In Round Trip' })
      });
      const { identity } = await createRes.json();
      const sendRes = await fetch(`${baseUrl}/api/phone-otp/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityId: identity.id,
          phone: '+919876543288',
          purpose: 'phone_verify'
        })
      });
      const { otpId: otp1, _devOtpCode: code1 } = await sendRes.json();
      await fetch(`${baseUrl}/api/phone-otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otpId: otp1, code: code1 })
      });

      // Now sign in.
      const recStart = await fetch(`${baseUrl}/api/recovery/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+919876543288' })
      });
      const { otpId: otp2, _devOtpCode: code2 } = await recStart.json();
      assert.ok(otp2);
      assert.ok(code2);

      const recVerify = await fetch(`${baseUrl}/api/recovery/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otpId: otp2, code: code2 })
      });
      assert.equal(recVerify.status, 200);
      const recBody = await recVerify.json();
      assert.equal(recBody.recoveryBundle?.identity?.id, identity.id);
    });
  });
});
