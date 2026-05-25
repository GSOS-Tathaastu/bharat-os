// Phase 4.3 — phone-OTP artifact tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPhoneOtp,
  maskPhone,
  PHONE_OTP_MAX_ATTEMPTS,
  PHONE_OTP_PROTOCOL_VERSION,
  PHONE_OTP_PURPOSES,
  verifyPhoneOtp
} from '../../src/phase1/phone-otp.mjs';
import { normalisePhone, sendSms } from '../../src/phase0/sms-provider.mjs';

test('normalisePhone accepts 10-digit Indian numbers and prepends +91', () => {
  assert.equal(normalisePhone('9876543210'), '+919876543210');
  assert.equal(normalisePhone('  9876543210 '), '+919876543210');
  assert.equal(normalisePhone('+919876543210'), '+919876543210');
  assert.equal(normalisePhone('919876543210'), '+919876543210');
});

test('normalisePhone rejects obviously invalid inputs', () => {
  assert.equal(normalisePhone(''), null);
  assert.equal(normalisePhone(null), null);
  assert.equal(normalisePhone(undefined), null);
  assert.equal(normalisePhone('not a phone'), null);
  assert.equal(normalisePhone('12345'), null);
});

test('createPhoneOtp returns a versioned OTP envelope with hash + salt + code', () => {
  const otp = createPhoneOtp({
    identityId: 'bos:person:test',
    phone: '+919876543210'
  });
  assert.equal(otp.protocolVersion, PHONE_OTP_PROTOCOL_VERSION);
  assert.equal(otp.objectType, 'phone-otp');
  assert.equal(otp.identityId, 'bos:person:test');
  assert.equal(otp.phone, '+919876543210');
  assert.ok(otp.phoneMasked.includes('****'));
  assert.equal(otp.attempts, 0);
  assert.equal(otp.maxAttempts, PHONE_OTP_MAX_ATTEMPTS);
  assert.equal(otp.status, 'sent');
  // The plaintext code is in the return value but must NOT be in
  // the serialised representation tests use to persist.
  assert.match(otp.code, /^\d{6}$/);
  // Hash + salt are present; plaintext code is recoverable only by
  // the user receiving the SMS.
  assert.ok(otp.codeHash);
  assert.ok(otp.salt);
  // Storage representation: strip plaintext.
  const persisted = { ...otp };
  delete persisted.code;
  assert.equal(persisted.code, undefined);
  assert.ok(persisted.codeHash);
});

test('createPhoneOtp generates distinct codes + salts across invocations', () => {
  const a = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  const b = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  // Even with identical (identityId, phone), the salt + thus the
  // hash should differ.
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.codeHash, b.codeHash);
  // And the otpIds should be different.
  assert.notEqual(a.otpId, b.otpId);
});

test('verifyPhoneOtp accepts the correct code', () => {
  const otp = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  const { code } = otp;
  const stored = { ...otp };
  delete stored.code;
  const result = verifyPhoneOtp(stored, code);
  assert.equal(result.status, 'verified');
  assert.equal(result.otp.status, 'verified');
  assert.ok(result.otp.verifiedAt);
});

test('verifyPhoneOtp rejects wrong codes + increments attempts', () => {
  const otp = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  const stored = { ...otp };
  delete stored.code;
  const r1 = verifyPhoneOtp(stored, '000000');
  assert.equal(r1.status, 'mismatch');
  assert.equal(r1.otp.attempts, 1);
  const r2 = verifyPhoneOtp(r1.otp, '111111');
  assert.equal(r2.status, 'mismatch');
  assert.equal(r2.otp.attempts, 2);
});

test('verifyPhoneOtp eventually rejects with too_many_attempts', () => {
  const otp = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  let current = { ...otp };
  delete current.code;
  for (let i = 0; i < PHONE_OTP_MAX_ATTEMPTS; i += 1) {
    const r = verifyPhoneOtp(current, '000000');
    current = r.otp;
  }
  assert.equal(current.status, 'too_many_attempts');
  // Even the correct code now fails — the OTP is dead.
  const tryCorrect = verifyPhoneOtp(current, otp.code);
  assert.equal(tryCorrect.status, 'too_many_attempts');
});

test('verifyPhoneOtp reports expired separately from invalid', () => {
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const otp = createPhoneOtp({
    identityId: 'i',
    phone: '+919876543210',
    ttlSeconds: -1,
    at: past
  });
  const stored = { ...otp };
  delete stored.code;
  const result = verifyPhoneOtp(stored, otp.code);
  assert.equal(result.status, 'expired');
});

test('verifyPhoneOtp reports spent for already-verified OTPs', () => {
  const otp = createPhoneOtp({ identityId: 'i', phone: '+919876543210' });
  const stored = { ...otp, status: 'verified', verifiedAt: new Date().toISOString() };
  delete stored.code;
  const result = verifyPhoneOtp(stored, otp.code);
  assert.equal(result.status, 'spent');
});

test('createPhoneOtp refuses unknown purpose', () => {
  assert.throws(
    () =>
      createPhoneOtp({
        identityId: 'i',
        phone: '+919876543210',
        purpose: 'not_a_real_purpose'
      }),
    /purpose must be one of/
  );
});

test('maskPhone hides the middle digits, leaves country code + last two visible', () => {
  // The mask is fixed-length (****) so it doesn't reveal phone-number
  // length. Country code (+91) + first digit (9) + last two (10) survive.
  assert.equal(maskPhone('+919876543210'), '+919****10');
});

test('PHONE_OTP_PURPOSES has the three known purposes', () => {
  assert.deepEqual(
    [...PHONE_OTP_PURPOSES].sort(),
    ['account_recovery', 'phone_verify', 'sensitive_action']
  );
});

test('sendSms via the log provider returns a providerMessageId', async () => {
  // Suppress the stdout side-effect during the test.
  const origOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    const result = await sendSms({
      phone: '9876543210',
      body: 'Test OTP: 123456'
    });
    assert.equal(result.ok, true);
    assert.ok(result.providerMessageId.startsWith('log-'));
  } finally {
    process.stdout.write = origOut;
  }
});

test('sendSms rejects invalid phone numbers', async () => {
  await assert.rejects(
    () => sendSms({ phone: 'not-a-phone', body: 'x' }),
    /invalid phone number/
  );
});
