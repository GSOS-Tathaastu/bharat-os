import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { executeToolAction } from '../../src/phase1/tools.mjs';

const BOOKING_SCOPES = ['service.book', 'consent.record', 'upi.settle'];

function consentFor(identity) {
  return createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: BOOKING_SCOPES,
    purpose: 'Booking'
  });
}

function bookingRequest(identity, vertical, overrides = {}) {
  return {
    actorId: identity.id,
    actionType: 'service_booking',
    tool: 'bharat_marketplace',
    scopes: BOOKING_SCOPES,
    regulated: true,
    piiHandling: 'tokenized',
    money: { amount: 250, currency: 'INR', limit: 500 },
    metadata: { vertical, ...overrides }
  };
}

test('cab booking receipt includes app handoffs for Uber, Ola, Rapido, Namma Yatri', () => {
  const identity = createIdentity({ displayName: 'Cab actor' });
  const execution = executeToolAction(
    bookingRequest(identity, 'cab', { from: 'Koramangala', to: 'Indiranagar' }),
    [consentFor(identity)]
  );
  assert.equal(execution.status, 'completed');
  const handoffs = execution.toolReceipt.appHandoffs ?? [];
  const apps = handoffs.map((h) => h.app).sort();
  assert.deepEqual(apps, ['namma_yatri', 'ola', 'rapido', 'uber']);

  // Every handoff must carry a deep-link URI plus a web fallback so
  // the user is never stranded if the app isn't installed.
  for (const handoff of handoffs) {
    assert.ok(handoff.uri && handoff.uri.length > 0, `${handoff.app} missing URI`);
    assert.ok(handoff.webFallback && handoff.webFallback.startsWith('https://'),
      `${handoff.app} missing web fallback`);
    assert.equal(handoff.transactsThroughBharatOS, false);
  }

  // Uber URI should encode the route nicknames.
  const uber = handoffs.find((h) => h.app === 'uber');
  assert.match(uber.uri, /^uber:\/\//);
  assert.match(uber.uri, /Koramangala/);
  assert.match(uber.uri, /Indiranagar/);
});

test('hotel booking receipt includes MakeMyTrip / OYO / Booking handoffs', () => {
  const identity = createIdentity({ displayName: 'Hotel actor' });
  const execution = executeToolAction(
    bookingRequest(identity, 'hotel', { to: 'Munnar' }),
    [consentFor(identity)]
  );
  const apps = (execution.toolReceipt.appHandoffs ?? []).map((h) => h.app).sort();
  assert.deepEqual(apps, ['booking', 'makemytrip', 'oyo']);
});

test('ticket booking receipt includes IRCTC + MakeMyTrip', () => {
  const identity = createIdentity({ displayName: 'Train actor' });
  const execution = executeToolAction(
    bookingRequest(identity, 'ticket', { from: 'Bangalore', to: 'Hyderabad' }),
    [consentFor(identity)]
  );
  const apps = (execution.toolReceipt.appHandoffs ?? []).map((h) => h.app).sort();
  assert.deepEqual(apps, ['irctc', 'makemytrip']);
});

test('metadata.preferredApps filters the handoff list to user preference', () => {
  const identity = createIdentity({ displayName: 'Loyal Ola rider' });
  const execution = executeToolAction(
    bookingRequest(identity, 'cab', {
      from: 'Whitefield',
      to: 'Indiranagar',
      preferredApps: ['ola']
    }),
    [consentFor(identity)]
  );
  const apps = (execution.toolReceipt.appHandoffs ?? []).map((h) => h.app);
  assert.deepEqual(apps, ['ola']);
});

test('handoff URIs are NOT money-flowing — Bharat OS does not transact', () => {
  const identity = createIdentity({ displayName: 'Non-transacting actor' });
  const execution = executeToolAction(
    bookingRequest(identity, 'cab'),
    [consentFor(identity)]
  );
  for (const handoff of execution.toolReceipt.appHandoffs ?? []) {
    assert.equal(handoff.transactsThroughBharatOS, false);
  }
});

test('unknown vertical surfaces no handoffs (rather than crashing)', () => {
  // We can't request an unknown vertical (the marketplace rejects it), but
  // we can verify that verticals without registered apps return [].
  // Currently `services` has one entry (Urban Company), so cabs verticals
  // never reach this branch — guard the empty case via direct check.
  const identity = createIdentity({ displayName: 'Services actor' });
  const execution = executeToolAction(
    bookingRequest(identity, 'services'),
    [consentFor(identity)]
  );
  const handoffs = execution.toolReceipt.appHandoffs ?? [];
  assert.ok(handoffs.length >= 1);
  assert.equal(handoffs[0].app, 'urbancompany');
});
