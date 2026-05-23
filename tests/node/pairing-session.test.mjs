import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  claimPairingSession,
  completePairingSession,
  createPairingSession,
  expirePairingSession,
  lookupByClaimCode,
  recordSdp,
  PAIRING_SESSION_STATUSES
} from '../../src/phase1/pairing-session.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

function makeSession(overrides = {}) {
  return createPairingSession({
    issuerIdentityId: 'bos:person:test',
    issuerDisplayName: 'Test owner',
    issuerPublicKeyFingerprint: 'a'.repeat(24),
    ...overrides
  });
}

test('PAIRING_SESSION_STATUSES enumerates the lifecycle', () => {
  assert.deepEqual(
    PAIRING_SESSION_STATUSES.sort(),
    ['claimed', 'completed', 'expired', 'pending'].sort()
  );
});

test('createPairingSession requires issuer identity + fingerprint', () => {
  assert.throws(() => createPairingSession({}), /issuerIdentityId/);
  assert.throws(
    () => createPairingSession({ issuerIdentityId: 'a' }),
    /issuerPublicKeyFingerprint/
  );
});

test('createPairingSession yields a 6-digit claim code + deterministic ID', () => {
  const session = makeSession();
  assert.equal(session.status, 'pending');
  assert.match(session.claimCode, /^\d{6}$/);
  assert.match(session.sessionId, /^bos:pairing-session:/);
  assert.ok(session.expiresAt > session.issuedAt);
  assert.equal(session.sdp.offer, null);
  assert.equal(session.sdp.answer, null);
});

test('lookupByClaimCode finds pending sessions and skips expired / non-matching', () => {
  const live = makeSession();
  const claimedAlready = { ...makeSession(), status: 'claimed' };
  const expiredOne = makeSession({ ttlSeconds: -1 });

  const sessions = [live, claimedAlready, expiredOne];
  const found = lookupByClaimCode(sessions, live.claimCode);
  assert.equal(found?.sessionId, live.sessionId);

  assert.equal(lookupByClaimCode(sessions, claimedAlready.claimCode), null);
  assert.equal(lookupByClaimCode(sessions, expiredOne.claimCode), null);
  assert.equal(lookupByClaimCode(sessions, '000000'), null);
});

test('claimPairingSession transitions pending → claimed with receiver fingerprint', () => {
  const session = makeSession();
  const claimed = claimPairingSession(session, {
    receiverFingerprint: 'b'.repeat(24),
    sdpAnswer: { type: 'answer', sdp: 'v=0\n...' }
  });
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.receiverFingerprint, 'b'.repeat(24));
  assert.deepEqual(claimed.sdp.answer, { type: 'answer', sdp: 'v=0\n...' });
  assert.ok(claimed.claimedAt);
});

test('claimPairingSession refuses non-pending sessions', () => {
  const claimed = claimPairingSession(makeSession(), {
    receiverFingerprint: 'x'.repeat(24)
  });
  assert.throws(
    () => claimPairingSession(claimed, { receiverFingerprint: 'y'.repeat(24) }),
    /Cannot claim a claimed session/
  );
});

test('claimPairingSession marks expired if past TTL', () => {
  const expired = makeSession({ ttlSeconds: -1 });
  const result = claimPairingSession(expired, { receiverFingerprint: 'z'.repeat(24) });
  assert.equal(result.status, 'expired');
});

test('recordSdp accumulates offer/answer pieces without overwriting nulls', () => {
  const session = makeSession();
  const withOffer = recordSdp(session, { offer: { type: 'offer', sdp: 'v=0\nofferA' } });
  assert.equal(withOffer.sdp.offer.sdp, 'v=0\nofferA');
  assert.equal(withOffer.sdp.answer, null);

  const withBoth = recordSdp(withOffer, { answer: { type: 'answer', sdp: 'v=0\nanswerA' } });
  assert.equal(withBoth.sdp.offer.sdp, 'v=0\nofferA');
  assert.equal(withBoth.sdp.answer.sdp, 'v=0\nanswerA');
});

test('completePairingSession records bytes transferred and timestamp', () => {
  const session = makeSession();
  const completed = completePairingSession(session, { bytesTransferred: 4096 });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completion.bytesTransferred, 4096);
  assert.ok(completed.completion.completedAt);
});

test('completePairingSession refuses expired sessions', () => {
  const expired = expirePairingSession(makeSession({ ttlSeconds: -1 }));
  assert.equal(expired.status, 'expired');
  assert.throws(
    () => completePairingSession(expired),
    /Cannot complete an expired session/
  );
});

test('expirePairingSession is a no-op when not yet expired', () => {
  const session = makeSession();
  const same = expirePairingSession(session);
  assert.equal(same.status, 'pending');
  assert.equal(same.sessionId, session.sessionId);
});

test('store persists pairing sessions and ledger evidence', async () => {
  const { store } = await freshStore('pairing-session-store');
  const identity = createIdentity({ displayName: 'Pairing actor' });
  await store.saveIdentity(identity);

  const session = createPairingSession({
    issuerIdentityId: identity.id,
    issuerDisplayName: identity.displayName,
    issuerPublicKeyFingerprint: 'a'.repeat(24)
  });
  await store.savePairingSession(session);

  assert.equal((await store.readPairingSession(session.sessionId)).sessionId, session.sessionId);
  assert.equal((await store.listPairingSessions()).length, 1);
  const ledger = await store.listLedger({ type: 'pairing_session.saved' });
  assert.equal(ledger.length, 1);
});
