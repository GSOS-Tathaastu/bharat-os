import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publicIdentity } from '../../src/phase0/core.mjs';
import {
  canonicalWorkerAuthorizationPayload,
  createWorkerAuthorization,
  signWorkerAuthorization,
  verifyWorkerAuthorization
} from '../../src/phase1/worker-authorization.mjs';

const LABOR_SCOPES = ['labor.match', 'worker.notify', 'upi.escrow'];

function makeAuth(worker, overrides = {}) {
  return createWorkerAuthorization({
    workerId: worker.id,
    operatorId: 'bos:operator:csc-001',
    jobReference: 'bos:job:demo-brick-kiln',
    scopes: LABOR_SCOPES,
    purpose: 'Worker authorizes operator-assisted job acceptance',
    ...overrides
  });
}

test('createWorkerAuthorization yields a canonical, unsigned receipt', () => {
  const worker = createIdentity({ displayName: 'Worker A' });
  const auth = makeAuth(worker);

  assert.equal(auth.objectType, 'worker-authorization');
  assert.match(auth.authorizationId, /^bos:worker-auth:/);
  assert.equal(auth.status, 'unsigned');
  assert.deepEqual(auth.signatures, []);
  assert.deepEqual(auth.scopes, [...LABOR_SCOPES].sort());
  assert.ok(auth.expiresAt > auth.issuedAt);
});

test('createWorkerAuthorization rejects missing required fields', () => {
  assert.throws(() => createWorkerAuthorization({ operatorId: 'x', jobReference: 'y', scopes: ['z'], purpose: 'p' }), /workerId/);
  assert.throws(() => createWorkerAuthorization({ workerId: 'x', jobReference: 'y', scopes: ['z'], purpose: 'p' }), /operatorId/);
  assert.throws(() => createWorkerAuthorization({ workerId: 'x', operatorId: 'y', scopes: ['z'], purpose: 'p' }), /jobReference/);
  assert.throws(() => createWorkerAuthorization({ workerId: 'x', operatorId: 'y', jobReference: 'z', scopes: ['s'] }), /purpose/);
  assert.throws(() => createWorkerAuthorization({ workerId: 'x', operatorId: 'y', jobReference: 'z', purpose: 'p' }), /scope/);
});

test('signWorkerAuthorization refuses any signer that is not the worker', () => {
  const worker = createIdentity({ displayName: 'Worker B' });
  const operator = createIdentity({ displayName: 'Sneaky operator' });
  const auth = makeAuth(worker);
  assert.throws(() => signWorkerAuthorization(auth, operator), /signed by the worker identity/);
});

test('signed worker authorization verifies cleanly with the worker public record', () => {
  const worker = createIdentity({ displayName: 'Worker C' });
  const signed = signWorkerAuthorization(makeAuth(worker), worker);
  const result = verifyWorkerAuthorization(signed, publicIdentity(worker));
  assert.equal(result.valid, true);
  assert.equal(result.idValid, true);
  assert.equal(result.signatureValid, true);
  assert.deepEqual(result.reasons, []);
});

test('verification fails when the worker signature is missing', () => {
  const worker = createIdentity({ displayName: 'Worker D' });
  const auth = makeAuth(worker); // unsigned
  const result = verifyWorkerAuthorization(auth, publicIdentity(worker));
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('worker signature missing'));
});

test('verification fails when the public record does not match the workerId', () => {
  const worker = createIdentity({ displayName: 'Worker E' });
  const someoneElse = createIdentity({ displayName: 'Different person' });
  const signed = signWorkerAuthorization(makeAuth(worker), worker);
  const result = verifyWorkerAuthorization(signed, publicIdentity(someoneElse));
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((r) => r.includes('worker public record')));
});

test('tampering with the payload after signing breaks verification', () => {
  const worker = createIdentity({ displayName: 'Worker F' });
  const signed = signWorkerAuthorization(makeAuth(worker), worker);
  const tampered = { ...signed, jobReference: 'bos:job:malicious-replacement' };
  const result = verifyWorkerAuthorization(tampered, publicIdentity(worker));
  assert.equal(result.valid, false);
  // ID mismatch is detected because canonical payload now hashes differently
  assert.equal(result.idValid, false);
});

test('expired worker authorization fails verification', () => {
  const worker = createIdentity({ displayName: 'Worker G' });
  const expired = makeAuth(worker, {
    issuedAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-01-02T00:00:00.000Z'
  });
  const signed = signWorkerAuthorization(expired, worker);
  const result = verifyWorkerAuthorization(signed, publicIdentity(worker), {
    at: '2026-05-23T00:00:00.000Z'
  });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('worker authorization expired'));
});

test('canonicalWorkerAuthorizationPayload is stable and excludes signatures', () => {
  const worker = createIdentity({ displayName: 'Worker H' });
  const auth = makeAuth(worker);
  const payload = canonicalWorkerAuthorizationPayload(auth);
  assert.equal(payload.workerId, worker.id);
  assert.equal(payload.operatorId, 'bos:operator:csc-001');
  assert.equal(payload.signatures, undefined);
  assert.equal(payload.status, undefined);
});
