// Phase 4.1 — security headers contract.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  buildSecurityHeaders
} from '../../src/phase0/security-headers.mjs';

test('buildContentSecurityPolicy emits a strict default-src and locks frame-ancestors', () => {
  const csp = buildContentSecurityPolicy();
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
});

test('buildContentSecurityPolicy includes the two CDNs the shell legitimately uses', () => {
  const csp = buildContentSecurityPolicy();
  assert.match(csp, /https:\/\/esm\.sh/);
  assert.match(csp, /https:\/\/cdn\.jsdelivr\.net/);
});

test('buildContentSecurityPolicy does NOT allow unsafe-inline scripts', () => {
  const csp = buildContentSecurityPolicy();
  // 'unsafe-inline' may still appear inside style-src-attr (we allow
  // it there to support inline style="…" without a separate
  // de-inlining pass), but it must NOT be in script-src.
  const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
  assert.ok(scriptSrcMatch);
  assert.equal(
    scriptSrcMatch[1].includes("'unsafe-inline'"),
    false,
    'script-src must not allow unsafe-inline'
  );
  assert.equal(
    scriptSrcMatch[1].includes("'unsafe-eval'"),
    false,
    'script-src must not allow unsafe-eval'
  );
});

test('buildSecurityHeaders provides defence-in-depth fallbacks', () => {
  const headers = buildSecurityHeaders();
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['permissions-policy'], /geolocation=\(\)/);
  assert.match(headers['permissions-policy'], /interest-cohort=\(\)/);
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
});

test('HSTS is OFF by default, ON when enabled', () => {
  const off = buildSecurityHeaders({ enableHsts: false });
  assert.equal(off['strict-transport-security'], undefined);
  const on = buildSecurityHeaders({ enableHsts: true });
  assert.match(on['strict-transport-security'], /max-age=\d+/);
  assert.match(on['strict-transport-security'], /includeSubDomains/);
  assert.match(on['strict-transport-security'], /preload/);
});

test('applySecurityHeaders sets headers on a response stand-in', () => {
  const stand = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
  applySecurityHeaders(stand);
  assert.ok(stand.headers['content-security-policy']);
  assert.equal(stand.headers['x-frame-options'], 'DENY');
  assert.equal(stand.headers['x-content-type-options'], 'nosniff');
});

test('CSP extras let routes opt into additional origins', () => {
  const csp = buildContentSecurityPolicy({
    extraScriptSrc: ['https://example.cdn'],
    extraConnectSrc: ['https://api.example.com']
  });
  assert.match(csp, /script-src[^;]+https:\/\/example\.cdn/);
  assert.match(csp, /connect-src[^;]+https:\/\/api\.example\.com/);
});
