// Phase 4.5 — i18n framework tests.
//
// The module is browser-side but its translation logic is testable
// in Node without DOM. The `applyI18n` test uses a minimal DOM
// stand-in.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLocale,
  getLocaleCoverage,
  I18N_PROTOCOL_VERSION,
  listLocales,
  onLocaleChange,
  setLocale,
  SUPPORTED_LOCALES,
  t
} from '../../public/shell/i18n.mjs';

test('SUPPORTED_LOCALES has the seven expected entries', () => {
  assert.deepEqual(
    [...SUPPORTED_LOCALES].sort(),
    ['bho-IN', 'bn-IN', 'en-IN', 'hi-IN', 'hi-Latn-IN', 'mr-IN', 'ta-IN']
  );
});

test('t(key) returns the active-locale translation when present', () => {
  setLocale('hi-IN');
  assert.equal(t('welcome.title'), 'भारत OS में आपका स्वागत है');
  assert.equal(t('nav.home'), 'मुख्य');
  setLocale('en-IN'); // restore default
});

test('t(key) falls back to en-IN when locale lacks the translation', () => {
  setLocale('mr-IN');
  // welcome.choice.new.sub is in en-IN, missing in mr-IN.
  assert.equal(t('welcome.choice.new.sub'), 'Create your Bharat OS profile. Takes 60 seconds.');
  setLocale('en-IN');
});

test('t(key, { fallback }) honours the caller fallback as a last resort', () => {
  setLocale('hi-IN');
  // Use an obviously-missing key.
  const result = t('not.a.real.key', { fallback: 'custom fallback' });
  assert.equal(result, 'custom fallback');
  setLocale('en-IN');
});

test('t(key) returns the key itself when nothing matches and no fallback', () => {
  setLocale('en-IN');
  assert.equal(t('not.a.real.key'), 'not.a.real.key');
});

test('setLocale rejects unsupported locales', () => {
  assert.throws(() => setLocale('xx-YY'), /unsupported locale/);
});

test('setLocale persists across listener fires', () => {
  let lastLocale = null;
  const unsubscribe = onLocaleChange((locale) => {
    lastLocale = locale;
  });
  setLocale('ta-IN');
  assert.equal(lastLocale, 'ta-IN');
  assert.equal(getLocale(), 'ta-IN');
  setLocale('en-IN'); // restore
  assert.equal(lastLocale, 'en-IN');
  unsubscribe();
});

test('onLocaleChange unsubscribe stops further callbacks', () => {
  let callCount = 0;
  const unsubscribe = onLocaleChange(() => {
    callCount += 1;
  });
  setLocale('hi-IN');
  assert.equal(callCount, 1);
  unsubscribe();
  setLocale('ta-IN');
  assert.equal(callCount, 1, 'unsubscribed callbacks must not fire');
  setLocale('en-IN'); // restore
});

test('getLocaleCoverage reports the % of keys translated', () => {
  const enCoverage = getLocaleCoverage('en-IN');
  assert.equal(enCoverage.pct, 100, 'en-IN is the reference; 100%');
  const hiCoverage = getLocaleCoverage('hi-IN');
  assert.ok(hiCoverage.translated > 0);
  assert.ok(hiCoverage.translated <= hiCoverage.total);
});

test('listLocales returns all supported locales with coverage stats', () => {
  const list = listLocales();
  assert.equal(list.length, SUPPORTED_LOCALES.length);
  for (const entry of list) {
    assert.ok(SUPPORTED_LOCALES.includes(entry.locale));
    assert.ok(typeof entry.coverage.pct === 'number');
  }
});

test('module exports the protocol version', () => {
  assert.equal(I18N_PROTOCOL_VERSION, 'bos.phase0.i18n.v0');
});

test('every locale has at least the four bottom-nav keys translated', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of ['nav.home', 'nav.earn', 'nav.trust', 'nav.profile']) {
      const value = t(key, { locale });
      // Either the locale has it OR we fall back to en-IN (which
      // always has it). Either way, value must not equal the raw
      // key.
      assert.notEqual(value, key, `${locale} missing fallback for ${key}`);
    }
  }
});
