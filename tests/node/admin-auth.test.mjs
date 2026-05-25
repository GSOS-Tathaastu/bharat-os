// Phase 5.7 — admin auth + admin-endpoint wiring tests.

import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  AdminAuthError,
  checkAdminAuth,
  requireAdminToken
} from '../../src/phase0/admin-auth.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import {
  applyRecoveryCooldown
} from '../../src/phase1/recovery-cooldown.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'admin-auth-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function fakeRequest(headers = {}) {
  return { headers };
}

// ─── requireAdminToken ────────────────────────────────────────────────

test('requireAdminToken refuses when BHARAT_OS_ADMIN_TOKEN is unset', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, () => {
    try {
      requireAdminToken(fakeRequest({ authorization: 'Bearer anything' }));
      assert.fail('expected throw');
    } catch (error) {
      assert.ok(error instanceof AdminAuthError);
      assert.equal(error.status, 503);
      assert.equal(error.code, 'admin_disabled');
    }
  });
});

test('requireAdminToken refuses when token is too short (<16 chars)', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'short' }, () => {
    try {
      requireAdminToken(fakeRequest({ authorization: 'Bearer short' }));
      assert.fail('expected throw');
    } catch (error) {
      assert.equal(error.code, 'admin_disabled');
    }
  });
});

test('requireAdminToken refuses without Authorization header', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    try {
      requireAdminToken(fakeRequest({}));
      assert.fail('expected throw');
    } catch (error) {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'missing_authorization');
    }
  });
});

test('requireAdminToken refuses with a wrong token', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    try {
      requireAdminToken(fakeRequest({ authorization: 'Bearer ' + 'b'.repeat(32) }));
      assert.fail('expected throw');
    } catch (error) {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'invalid_token');
    }
  });
});

test('requireAdminToken returns operator label on success', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const auth = requireAdminToken(
      fakeRequest({
        authorization: 'Bearer ' + 'a'.repeat(32),
        'x-bharat-os-operator': 'sre-on-call'
      })
    );
    assert.equal(auth.operator, 'sre-on-call');
  });
});

test('requireAdminToken returns unattributed-operator when header missing', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const auth = requireAdminToken(
      fakeRequest({ authorization: 'Bearer ' + 'a'.repeat(32) })
    );
    assert.equal(auth.operator, 'unattributed-operator');
  });
});

test('requireAdminToken truncates operator label to 80 chars', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const auth = requireAdminToken(
      fakeRequest({
        authorization: 'Bearer ' + 'a'.repeat(32),
        'x-bharat-os-operator': 'x'.repeat(200)
      })
    );
    assert.equal(auth.operator.length, 80);
  });
});

test('requireAdminToken accepts case-insensitive Bearer prefix', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const auth = requireAdminToken(
      fakeRequest({ authorization: 'bearer ' + 'a'.repeat(32) })
    );
    assert.ok(auth.operator);
  });
});

// ─── checkAdminAuth (wraps with response side-effects) ────────────────

test('checkAdminAuth writes 503 and returns null when token is unset', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, () => {
    const sent = { status: null, body: null };
    const response = {
      writeHead(status) { sent.status = status; },
      end(body) { sent.body = body; }
    };
    const result = checkAdminAuth(fakeRequest({}), response);
    assert.equal(result, null);
    assert.equal(sent.status, 503);
    assert.match(sent.body, /admin_disabled/);
  });
});

test('checkAdminAuth writes 401 and returns null when token is wrong', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const sent = { status: null, body: null };
    const response = {
      writeHead(status) { sent.status = status; },
      end(body) { sent.body = body; }
    };
    const result = checkAdminAuth(
      fakeRequest({ authorization: 'Bearer wrong-token' }),
      response
    );
    assert.equal(result, null);
    assert.equal(sent.status, 401);
    assert.match(sent.body, /invalid_token/);
  });
});

test('checkAdminAuth returns auth object on success', () => {
  return withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, () => {
    const response = {
      writeHead() {},
      end() {}
    };
    const result = checkAdminAuth(
      fakeRequest({ authorization: 'Bearer ' + 'a'.repeat(32) }),
      response
    );
    assert.ok(result);
    assert.equal(result.operator, 'unattributed-operator');
  });
});

// ─── End-to-end: admin endpoints via real HTTP ────────────────────────
//
// These tests boot the real Phase 0 API server on a random port +
// make real fetch() calls. They verify the route handlers wire up
// correctly. Module-isolated tests already cover the underlying
// resetCircuit / clearRecoveryCooldown / snapshotTo behaviour.

async function withApiServer(callback) {
  const root = path.join(tmpRoot, `srv-${Date.now()}-${process.pid}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('admin endpoints respond 503 admin_disabled when token unset', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/sms/circuit/reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.error.code, 'admin_disabled');
    });
  });
});

test('admin endpoints respond 401 with wrong token', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/admin/sms/circuit/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer wrong-token-for-test'
        },
        body: '{}'
      });
      assert.equal(response.status, 401);
    });
  });
});

test('POST /api/admin/sms/circuit/reset resets and audits', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const response = await fetch(`${baseUrl}/api/admin/sms/circuit/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32),
          'x-bharat-os-operator': 'integration-test'
        },
        body: JSON.stringify({ provider: 'gupshup' })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.provider, 'gupshup');
      assert.equal(body.operator, 'integration-test');
      // Ledger event recorded.
      const ledger = await store.listLedger({ type: 'sms.circuit.reset' });
      assert.ok(ledger.length >= 1);
      assert.equal(ledger[0].operator, 'integration-test');
      assert.equal(ledger[0].provider, 'gupshup');
    });
  });
});

test('POST recovery-cooldown/clear requires reason >= 8 chars', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const identity = applyRecoveryCooldown(createIdentity({ displayName: 'Test' }));
      await store.saveIdentity(identity);
      const response = await fetch(
        `${baseUrl}/api/admin/identities/${encodeURIComponent(identity.id)}/recovery-cooldown/clear`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32)
          },
          body: JSON.stringify({ reason: 'short' })
        }
      );
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, 'reason_required');
    });
  });
});

test('POST recovery-cooldown/clear clears the cooldown and audits the override', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const identity = applyRecoveryCooldown(createIdentity({ displayName: 'Cooldown' }));
      await store.saveIdentity(identity);
      const response = await fetch(
        `${baseUrl}/api/admin/identities/${encodeURIComponent(identity.id)}/recovery-cooldown/clear`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32),
            'x-bharat-os-operator': 'sim-swap-incident-ops'
          },
          body: JSON.stringify({
            reason: 'user confirmed identity via secondary channel call'
          })
        }
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.priorCooldown.active, true);

      // Identity now has no cooldown.
      const reread = await store.readIdentity(identity.id);
      assert.equal(reread.recoveryCooldown, undefined);

      // Ledger event audited.
      const ledger = await store.listLedger({ type: 'cooldown_override.applied' });
      assert.ok(ledger.length >= 1);
      assert.equal(ledger[0].operator, 'sim-swap-incident-ops');
      assert.equal(ledger[0].identityId, identity.id);
      assert.match(ledger[0].reason, /secondary channel/);
    });
  });
});

test('POST backup/snapshot creates a snapshot and emits a ledger event', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store, root }) => {
      const response = await fetch(`${baseUrl}/api/admin/backup/snapshot`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32),
          'x-bharat-os-operator': 'pre-migration-check'
        },
        body: JSON.stringify({ keep: 3 })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.snapshot.kind, 'sqlite');
      assert.ok(body.snapshot.bytes > 0);
      assert.equal(body.integrity.ok, true);
      const ledger = await store.listLedger({ type: 'backup.snapshot.created' });
      assert.ok(ledger.length >= 1);
      assert.equal(ledger[0].operator, 'pre-migration-check');
      assert.equal(ledger[0].trigger, 'admin_endpoint');
      // Snapshot file exists on disk under <root>/backups/.
      const fsModule = await import('node:fs/promises');
      const entries = await fsModule.readdir(path.join(root, 'backups'));
      assert.ok(entries.some((e) => e.startsWith('bos-store-') && e.endsWith('.sqlite')));
    });
  });
});
