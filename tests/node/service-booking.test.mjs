import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  ORCHESTRATION_TEMPLATES,
  orchestrateIntent
} from '../../src/phase1/orchestrator.mjs';
import { listSkills, readSkill } from '../../src/phase1/skills.mjs';
import {
  executeToolAction,
  listTools,
  SERVICE_VERTICALS
} from '../../src/phase1/tools.mjs';
import { inferActionType, normalizeIntent } from '../../src/phase1/vernacular.mjs';

const BOOKING_SCOPES = ['service.book', 'consent.record', 'upi.settle'];

function bookingConsent(identity, purpose = 'Cab booking') {
  return createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: BOOKING_SCOPES,
    purpose
  });
}

test('§9B tool registry advertises the Bharat OS marketplace as L6 and the ONDC bridge as L3', () => {
  const tools = listTools();
  const marketplace = tools.find((tool) => tool.toolId === 'bharat_marketplace');
  const bridge = tools.find((tool) => tool.toolId === 'ondc_beckn');
  assert.ok(marketplace, 'bharat_marketplace missing from tool registry');
  assert.equal(marketplace.layer, 'L6');
  assert.ok(bridge, 'ondc_beckn missing from tool registry');
  assert.equal(bridge.layer, 'L3');
});

test('§9B skill registry exposes the native marketplace AND the ONDC bridge', () => {
  const skills = listSkills();
  const marketplaceSkill = skills.find((skill) => skill.skillId === 'bos:skill:bharat-marketplace');
  const bridgeSkill = skills.find((skill) => skill.skillId === 'bos:skill:ondc-bridge');
  assert.ok(marketplaceSkill, 'native marketplace skill missing');
  assert.equal(marketplaceSkill.toolBinding.toolId, 'bharat_marketplace');
  assert.equal(marketplaceSkill.actionType, 'service_booking');
  assert.equal(marketplaceSkill.toolBinding.toolLayer, 'L6');
  assert.ok(bridgeSkill, 'ondc bridge skill missing');
  assert.equal(bridgeSkill.toolBinding.toolId, 'ondc_beckn');
});

test('orchestration template defaults to the native Bharat OS marketplace, not ONDC', () => {
  const template = ORCHESTRATION_TEMPLATES.service_booking;
  assert.ok(template, 'service_booking template missing');
  assert.equal(template.tool, 'bharat_marketplace');
  assert.equal(template.regulated, true);
  assert.deepEqual(template.scopes, BOOKING_SCOPES);
  assert.match(template.label, /Bharat OS marketplace/);
});

test('marketplace adapter returns a normalized receipt with native provider winning by default', () => {
  const identity = createIdentity({ displayName: 'Cab actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'service_booking',
      tool: 'bharat_marketplace',
      scopes: BOOKING_SCOPES,
      regulated: true,
      piiHandling: 'tokenized',
      money: { amount: 250, currency: 'INR', limit: 500 },
      metadata: {
        vertical: 'cab',
        from: 'Koramangala',
        to: 'Indiranagar',
        etaMinutes: 8
      }
    },
    [bookingConsent(identity)]
  );

  assert.equal(execution.status, 'completed');
  assert.equal(execution.toolReceipt.toolId, 'bharat_marketplace');
  assert.equal(execution.toolReceipt.chosen.source, 'native');
  assert.equal(execution.toolReceipt.chosen.commissionPct, 0);
  assert.match(execution.toolReceipt.bookingRef, /^bos:booking:/);
  assert.deepEqual(execution.toolReceipt.sources, ['native', 'ondc-bridge']);
  assert.equal(execution.toolReceipt.bridgeAvailable, true);
});

test('marketplace can run native-only (no ONDC bridge) when caller opts out', () => {
  const identity = createIdentity({ displayName: 'Native-only actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'service_booking',
      tool: 'bharat_marketplace',
      scopes: BOOKING_SCOPES,
      regulated: true,
      piiHandling: 'tokenized',
      money: { amount: 1500, currency: 'INR', limit: 2000 },
      metadata: { vertical: 'hotel', includeOndcBridge: false }
    },
    [bookingConsent(identity, 'Hotel booking')]
  );

  assert.equal(execution.status, 'completed');
  assert.deepEqual(execution.toolReceipt.sources, ['native']);
  assert.equal(execution.toolReceipt.bridgeAvailable, false);
  assert.equal(execution.toolReceipt.bridgeReference, null);
});

test('ONDC bridge is callable directly for Phase A scenarios but is not the substrate', () => {
  const identity = createIdentity({ displayName: 'Bridge actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'service_booking',
      tool: 'ondc_beckn',
      scopes: BOOKING_SCOPES,
      regulated: true,
      piiHandling: 'tokenized',
      money: { amount: 100, currency: 'INR', limit: 200 },
      metadata: { vertical: 'cab' }
    },
    [bookingConsent(identity)]
  );
  assert.equal(execution.status, 'completed');
  assert.equal(execution.toolReceipt.toolId, 'ondc_beckn');
  assert.equal(execution.toolReceipt.source, 'ondc');
  assert.equal(execution.toolReceipt.protocol, 'beckn-2.0');
});

test('marketplace rejects unsupported verticals', () => {
  const identity = createIdentity({ displayName: 'Bad vertical actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'service_booking',
      tool: 'bharat_marketplace',
      scopes: BOOKING_SCOPES,
      regulated: true,
      piiHandling: 'tokenized',
      money: { amount: 100, currency: 'INR', limit: 100 },
      metadata: { vertical: 'rocket_launch' }
    },
    [bookingConsent(identity)]
  );
  assert.equal(execution.status, 'failed');
  assert.match(execution.error, /vertical 'rocket_launch' is not supported/);
});

test('§15 fiat-only policy generalizes to service bookings (no tokens)', () => {
  const identity = createIdentity({ displayName: 'Token actor' });
  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'service_booking',
      tool: 'bharat_marketplace',
      scopes: BOOKING_SCOPES,
      regulated: true,
      piiHandling: 'tokenized',
      money: { amount: 250, currency: 'USDT', limit: 500 },
      metadata: { vertical: 'cab' }
    },
    [bookingConsent(identity)]
  );
  assert.equal(execution.status, 'blocked');
  const fiatCheck = execution.decision.checks.find(
    (check) => check.policyId === 'policy.money.fiat_settlement_only'
  );
  assert.equal(fiatCheck.status, 'fail');
});

test('English voice intent for a cab routes to service_booking', () => {
  assert.equal(inferActionType('Book me a cab from Koramangala to Indiranagar'), 'service_booking');
  assert.equal(inferActionType('I want to book a hotel room in Mumbai'), 'service_booking');
  assert.equal(inferActionType('Book a train ticket to Delhi'), 'service_booking');
});

test('Hindi voice intent for a cab routes to service_booking', () => {
  assert.equal(inferActionType('Mujhe ek cab book karo'), 'service_booking');
  assert.equal(inferActionType('मुझे टैक्सी चाहिए'), 'service_booking');
  const normalized = normalizeIntent('Mujhe ek cab book karo');
  assert.equal(normalized.matchedAliases[0].actionType, 'service_booking');
  assert.equal(normalized.detectedLanguageId, 'hi');
});

test('Marathi, Tamil, and Bengali cab intents route to service_booking', () => {
  assert.equal(inferActionType('मला टॅक्सी हवी आहे'), 'service_booking');
  assert.equal(inferActionType('எனக்கு ஒரு டாக்ஸி வேண்டும்'), 'service_booking');
  assert.equal(inferActionType('আমার একটা ট্যাক্সি দরকার'), 'service_booking');
});

test('orchestrated voice cab booking executes through native marketplace', () => {
  const identity = createIdentity({ displayName: 'Voice booking actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Mujhe ek cab book karo Koramangala se Indiranagar',
      money: { amount: 250, currency: 'INR', limit: 500 },
      metadata: { vertical: 'cab', from: 'Koramangala', to: 'Indiranagar', etaMinutes: 9 }
    },
    [bookingConsent(identity)],
    { execute: true }
  );
  assert.equal(orchestration.approved, true);
  assert.equal(orchestration.status, 'completed');
  assert.equal(orchestration.actionRequest.actionType, 'service_booking');
  assert.equal(orchestration.actionRequest.tool, 'bharat_marketplace');
  assert.equal(orchestration.actionRequest.skillId, 'bos:skill:bharat-marketplace');
  assert.equal(orchestration.execution.toolReceipt.chosen.source, 'native');
  assert.equal(orchestration.intent.detectedLanguageId, 'hi');
  assert.ok(orchestration.localizedResponse);
  assert.match(orchestration.localizedResponse.locale, /^hi/);
});

test('orchestrated booking without consent is blocked with a remediation hint', () => {
  const identity = createIdentity({ displayName: 'No-consent booking actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'Book a hotel in Goa',
      money: { amount: 2500, currency: 'INR', limit: 5000 },
      metadata: { vertical: 'hotel' }
    },
    []
  );
  assert.equal(orchestration.approved, false);
  assert.equal(orchestration.status, 'blocked');
  assert.ok(
    orchestration.failedPolicies.includes('policy.consent.required_for_regulated_action')
  );
});

test('SERVICE_VERTICALS exposes the canonical vertical list', () => {
  assert.ok(Array.isArray(SERVICE_VERTICALS));
  for (const required of ['cab', 'hotel', 'ticket', 'food', 'grocery', 'services']) {
    assert.ok(SERVICE_VERTICALS.includes(required), `missing vertical: ${required}`);
  }
});

test('readSkill returns the native marketplace skill with L6 layer binding', () => {
  const skill = readSkill('bos:skill:bharat-marketplace');
  assert.equal(skill.actionType, 'service_booking');
  assert.equal(skill.toolBinding.toolLayer, 'L6');
  assert.equal(skill.permissions.dataExposure, 'booking_reference_only');
});
