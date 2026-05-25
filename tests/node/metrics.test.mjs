// Phase 4.1 — Prometheus metrics + path-normalisation.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  metricPath,
  recordRequest,
  renderMetrics,
  resetMetrics
} from '../../src/phase0/metrics.mjs';

test('metricPath strips bos:* IDs to keep cardinality bounded', () => {
  assert.equal(
    metricPath('/api/identities/bos:person:abc1234567890def1234567890abcdef'),
    '/api/identities/:id'
  );
  assert.equal(
    metricPath('/api/federated/rounds/bos:fed-round:abc123def456'),
    '/api/federated/rounds/:id'
  );
});

test('metricPath normalises pairing 6-digit codes', () => {
  assert.equal(metricPath('/api/pairing/sessions/by-code/123456'), '/api/pairing/sessions/by-code/:id');
});

test('metricPath leaves non-ID segments intact', () => {
  assert.equal(metricPath('/api/orchestrations'), '/api/orchestrations');
  assert.equal(metricPath('/api/identities/bos:person:abc/export'), '/api/identities/:id/export');
});

test('metricPath handles SHA-256 hashes', () => {
  const longHash = 'sha256:' + 'a'.repeat(64);
  assert.equal(metricPath(`/api/federated/${longHash}`), '/api/federated/:id');
});

test('recordRequest + renderMetrics emit Prometheus format', () => {
  resetMetrics();
  recordRequest({
    method: 'GET',
    pathname: '/api/orchestrations',
    status: 200,
    durationSeconds: 0.012
  });
  recordRequest({
    method: 'GET',
    pathname: '/api/orchestrations',
    status: 200,
    durationSeconds: 0.034
  });
  recordRequest({
    method: 'POST',
    pathname: '/api/orchestrations',
    status: 201,
    durationSeconds: 0.150
  });
  const output = renderMetrics();
  assert.match(output, /# HELP bos_api_requests_total/);
  assert.match(output, /# TYPE bos_api_requests_total counter/);
  assert.match(output, /bos_api_requests_total\{method="GET",route="\/api\/orchestrations",status="200"\} 2/);
  assert.match(output, /bos_api_requests_total\{method="POST",route="\/api\/orchestrations",status="201"\} 1/);
  assert.match(output, /# HELP bos_api_request_duration_seconds/);
  assert.match(output, /bos_api_request_duration_seconds_count\{method="GET",route="\/api\/orchestrations"\} 2/);
  assert.match(output, /bos_api_process_uptime_seconds /);
});

test('renderMetrics produces no PII in route labels (normalised through metricPath)', () => {
  resetMetrics();
  // Real bos: IDs are SHA-256-derived hex; use one that matches the
  // identity-segment pattern.
  const realisticId = 'bos:person:abc1234567890def1234567890abcdef';
  recordRequest({
    method: 'GET',
    pathname: `/api/identities/${realisticId}/export`,
    status: 200,
    durationSeconds: 0.5
  });
  const output = renderMetrics();
  assert.equal(
    output.includes(realisticId),
    false,
    'individual identity IDs must not appear in metric labels'
  );
  assert.match(output, /route="\/api\/identities\/:id\/export"/);
});

test('histogram buckets are cumulative', () => {
  resetMetrics();
  // Latencies: 0.003 (in <=0.005), 0.4 (in <=0.5), 1.5 (in <=2.5)
  recordRequest({ method: 'GET', pathname: '/api/q', status: 200, durationSeconds: 0.003 });
  recordRequest({ method: 'GET', pathname: '/api/q', status: 200, durationSeconds: 0.4 });
  recordRequest({ method: 'GET', pathname: '/api/q', status: 200, durationSeconds: 1.5 });
  const output = renderMetrics();
  // le=0.005 should have 1 (only the 0.003 latency)
  assert.match(output, /bucket\{method="GET",route="\/api\/q",le="0.005"\} 1/);
  // le=0.5 should have 2 (0.003 + 0.4)
  assert.match(output, /bucket\{method="GET",route="\/api\/q",le="0.5"\} 2/);
  // le=+Inf should have 3
  assert.match(output, /bucket\{method="GET",route="\/api\/q",le="\+Inf"\} 3/);
  assert.match(output, /bos_api_request_duration_seconds_count\{method="GET",route="\/api\/q"\} 3/);
});
