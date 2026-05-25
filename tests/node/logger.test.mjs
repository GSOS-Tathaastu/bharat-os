// Phase 4.1 — structured JSON logger PII-scrub contract.
//
// The logger writes to process.stdout / process.stderr; tests
// monkey-patch the write methods to capture lines.

import assert from 'node:assert/strict';
import test from 'node:test';
import { generateRequestId, logger, safePath } from '../../src/phase0/logger.mjs';

function captureWrites() {
  const captured = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...rest) => {
    captured.push({ stream: 'stdout', line: String(chunk).trim() });
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    captured.push({ stream: 'stderr', line: String(chunk).trim() });
    return true;
  };
  return {
    captured,
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    }
  };
}

test('logger emits JSON-formatted lines with timestamp + level + message', () => {
  const cap = captureWrites();
  try {
    logger.info('test_event', { extra: 'value' });
  } finally {
    cap.restore();
  }
  assert.equal(cap.captured.length, 1);
  const parsed = JSON.parse(cap.captured[0].line);
  assert.equal(parsed.level, 'INFO');
  assert.equal(parsed.message, 'test_event');
  assert.equal(parsed.extra, 'value');
  assert.ok(parsed.timestamp);
});

test('ERROR and WARN write to stderr, INFO/ACCESS/DEBUG to stdout', () => {
  const cap = captureWrites();
  try {
    logger.error('boom', {});
    logger.warn('careful', {});
    logger.info('alive', {});
    logger.access('http', {});
  } finally {
    cap.restore();
  }
  assert.equal(cap.captured[0].stream, 'stderr');
  assert.equal(cap.captured[1].stream, 'stderr');
  assert.equal(cap.captured[2].stream, 'stdout');
  assert.equal(cap.captured[3].stream, 'stdout');
});

test('logger SCRUBS PII fields silently', () => {
  const cap = captureWrites();
  try {
    logger.info('orchestration_failed', {
      identityId: 'bos:person:abc',
      displayName: 'Priya R',
      phoneNumber: '+919999999999',
      intentText: 'मेरा HbA1c दिखाओ',
      recoveryPhrase: 'apple beach cloud dance eagle flame glass honey india jewel knife lemon',
      privateKeyPem: '-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----',
      status: 500,
      otherSafeField: 'value'
    });
  } finally {
    cap.restore();
  }
  const parsed = JSON.parse(cap.captured[0].line);
  // identityId is allowed (it's an opaque ID).
  assert.equal(parsed.identityId, 'bos:person:abc');
  // status / safe fields are preserved.
  assert.equal(parsed.status, 500);
  assert.equal(parsed.otherSafeField, 'value');
  // PII-forbidden keys are scrubbed.
  assert.equal(parsed.displayName, '<scrubbed>');
  assert.equal(parsed.phoneNumber, '<scrubbed>');
  assert.equal(parsed.intentText, '<scrubbed>');
  assert.equal(parsed.recoveryPhrase, '<scrubbed>');
  assert.equal(parsed.privateKeyPem, '<scrubbed>');
});

test('logger SCRUBS PII in nested objects', () => {
  const cap = captureWrites();
  try {
    logger.error('flow_blocked', {
      flow: {
        request: {
          identityId: 'bos:person:abc',
          intentText: 'should be scrubbed',
          metadata: {
            phoneNumber: '+91',
            ok: true
          }
        }
      }
    });
  } finally {
    cap.restore();
  }
  const parsed = JSON.parse(cap.captured[0].line);
  assert.equal(parsed.flow.request.identityId, 'bos:person:abc');
  assert.equal(parsed.flow.request.intentText, '<scrubbed>');
  assert.equal(parsed.flow.request.metadata.phoneNumber, '<scrubbed>');
  assert.equal(parsed.flow.request.metadata.ok, true);
});

test('generateRequestId returns a unique-per-call non-empty string', () => {
  const a = generateRequestId();
  const b = generateRequestId();
  assert.ok(typeof a === 'string' && a.length > 0);
  assert.notEqual(a, b);
});

test('safePath strips query strings + non-ASCII characters', () => {
  assert.equal(safePath('/api/orchestrations?actorId=bob'), '/api/orchestrations');
  // 'मेरा' is 4 Devanagari codepoints → 4 '?' characters
  assert.equal(safePath('/shell/मेरा'), '/shell/????');
  assert.equal(safePath(''), '');
});
