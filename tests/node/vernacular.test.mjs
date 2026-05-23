import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferActionType,
  inferActionTypeFromNormalized,
  listSupportedLanguages,
  localizeResponse,
  normalizeIntent,
  VERNACULAR_INTENT_ALIASES,
  VERNACULAR_LANGUAGES,
  VERNACULAR_RESPONSES
} from '../../src/phase1/vernacular.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { orchestrateIntent } from '../../src/phase1/orchestrator.mjs';

test('vernacular module exposes the supported languages', () => {
  const languages = listSupportedLanguages();
  const ids = languages.map((lang) => lang.languageId);
  for (const required of ['hi', 'mr', 'ta', 'bn', 'bho']) {
    assert.ok(ids.includes(required), `missing language: ${required}`);
  }
  assert.equal(VERNACULAR_LANGUAGES.length, ids.length);
});

test('every action × language pair has at least one alias entry', () => {
  const actionTypes = ['health_record_read', 'labor_match_post', 'scheme_delivery', 'regulated_onboarding', 'mesh_storage'];
  for (const lang of VERNACULAR_LANGUAGES) {
    for (const actionType of actionTypes) {
      const has = VERNACULAR_INTENT_ALIASES.some(
        (alias) => alias.languageId === lang.languageId && alias.actionType === actionType
      );
      assert.ok(has, `missing alias for ${lang.languageId} × ${actionType}`);
    }
  }
});

test('Marathi script and romanized intents normalize correctly', () => {
  assert.equal(inferActionType('मला आरोग्य नोंदणी हवी आहे'), 'health_record_read');
  assert.equal(inferActionType('Mala arogya record hava aahe'), 'health_record_read');

  const normalizedScript = normalizeIntent('मला आरोग्य नोंदणी हवी आहे');
  assert.equal(normalizedScript.detectedLocale, 'mr-IN');
  assert.equal(normalizedScript.detectedLanguageId, 'mr');

  const normalizedRoman = normalizeIntent('Mala arogya record hava aahe');
  assert.equal(normalizedRoman.detectedLocale, 'mr-Latn-IN');
  assert.equal(normalizedRoman.detectedLanguageId, 'mr');
});

test('Tamil intents normalize and classify across the canonical actions', () => {
  assert.equal(inferActionType('எனக்கு திட்ட தகுதி தேவை'), 'scheme_delivery');
  assert.equal(inferActionType('Enakku thittam venum'), 'scheme_delivery');
  assert.equal(inferActionType('வங்கி கணக்கு திறக்கணும்'), 'regulated_onboarding');

  const normalized = normalizeIntent('எனக்கு திட்ட தகுதி தேவை');
  assert.equal(normalized.detectedLocale, 'ta-IN');
  assert.equal(normalized.detectedLanguageId, 'ta');
  assert.equal(normalized.matchedAliases[0].languageId, 'ta');
});

test('Bengali intents normalize and classify across the canonical actions', () => {
  assert.equal(inferActionType('আমাকে স্বাস্থ্য রেকর্ড দরকার'), 'health_record_read');
  assert.equal(inferActionType('Amar bank account kholbo'), 'regulated_onboarding');
  assert.equal(inferActionType('শ্রমিক দরকার মজুরি সহ'), 'labor_match_post');

  const normalized = normalizeIntent('আমাকে স্বাস্থ্য রেকর্ড দরকার');
  assert.equal(normalized.detectedLocale, 'bn-IN');
  assert.equal(normalized.detectedLanguageId, 'bn');
});

test('Bhojpuri intents disambiguate from Hindi using language markers', () => {
  // Bhojpuri-specific lexical marker पइसा/भट्ठा/दिहाड़ी; presence of bhattha
  // should push the labor intent into bho rather than hi.
  const bhoLabor = normalizeIntent('हमरा भट्ठा खातिर मजदूर चाहीं');
  assert.equal(bhoLabor.detectedLanguageId, 'bho');
  assert.equal(bhoLabor.matchedAliases[0].actionType, 'labor_match_post');

  // Hinglish romanized labor intent — should stay Hindi.
  const hiLabor = normalizeIntent('Mujhe mazdoor chahiye');
  assert.equal(hiLabor.detectedLanguageId, 'hi');
});

test('localizeResponse returns native-script phrases for completed actions', () => {
  const tamil = localizeResponse('labor_match_post', 'completed', 'ta-IN');
  assert.ok(tamil);
  assert.equal(tamil.locale, 'ta-IN');
  assert.equal(tamil.fallbackUsed, false);
  assert.match(tamil.text, /தொழிலாளர்|காப்பகம்|உருவாக்கப்பட்டது/);

  const bengali = localizeResponse('scheme_delivery', 'planned', 'bn-IN');
  assert.equal(bengali.locale, 'bn-IN');
  assert.match(bengali.text, /প্রকল্প|যোগ্যতা/);
});

test('localizeResponse falls back gracefully on unknown locales', () => {
  const result = localizeResponse('labor_match_post', 'completed', 'kn-IN');
  assert.ok(result);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.locale, 'en-IN');
});

test('localizeResponse returns null for unknown action types', () => {
  const result = localizeResponse('not_a_real_action_type', 'planned', 'hi-IN');
  assert.equal(result, null);
});

test('every canonical response phrase set covers all canonical action types', () => {
  for (const actionType of Object.keys(VERNACULAR_RESPONSES)) {
    for (const status of ['planned', 'blocked', 'completed']) {
      assert.ok(VERNACULAR_RESPONSES[actionType][status], `missing ${actionType}.${status}`);
      assert.ok(
        VERNACULAR_RESPONSES[actionType][status]['en-IN'],
        `missing English fallback for ${actionType}.${status}`
      );
    }
  }
});

test('orchestrator carries localizedResponse for blocked Marathi intent', () => {
  const identity = createIdentity({ displayName: 'Marathi blocked actor' });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'मला बँक खाते उघडायचे आहे'
    },
    []
  );
  assert.equal(orchestration.approved, false);
  assert.equal(orchestration.status, 'blocked');
  assert.equal(orchestration.actionRequest.actionType, 'regulated_onboarding');
  assert.equal(orchestration.intent.detectedLanguageId, 'mr');
  assert.equal(orchestration.localizedResponse?.locale, 'mr-IN');
  assert.match(orchestration.localizedResponse.text, /संमती/);
});

test('orchestrator localizes a completed Tamil scheme intent', () => {
  const identity = createIdentity({ displayName: 'Tamil scheme actor' });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
    purpose: 'Tamil scheme delivery'
  });
  const orchestration = orchestrateIntent(
    {
      actorId: identity.id,
      intentText: 'எனக்கு நலத்திட்ட தகுதி தேவை',
      actionType: 'scheme_delivery'
    },
    [consent],
    { execute: true }
  );
  assert.equal(orchestration.approved, true);
  assert.equal(orchestration.status, 'completed');
  assert.equal(orchestration.intent.detectedLanguageId, 'ta');
  assert.equal(orchestration.localizedResponse.locale, 'ta-IN');
  assert.equal(orchestration.localizedResponse.fallbackUsed, false);
});

test('matchedAliases include languageId for downstream UI selection', () => {
  const normalized = normalizeIntent('Mujhe sarkari yojana ke labh chahiye');
  assert.ok(normalized.matchedAliases.length > 0);
  assert.equal(normalized.matchedAliases[0].languageId, 'hi');
});

test('inferActionTypeFromNormalized falls back to English regex when no alias hits', () => {
  const normalized = normalizeIntent('Show me my diabetes history');
  assert.equal(normalized.matchedAliases.length, 0);
  assert.equal(inferActionTypeFromNormalized(normalized), 'health_record_read');
});
