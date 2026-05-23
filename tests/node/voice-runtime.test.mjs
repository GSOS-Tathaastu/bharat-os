import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  createTtsModelPack,
  createTtsRuntimePlan,
  createVoiceModelPack,
  createVoiceRuntimePlan,
  INDIC_ASR_LOCALES,
  INDIC_TTS_LOCALES
} from '../../src/phase1/voice-runtime.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

test('voice runtime advertises the first Indic ASR locale set', () => {
  assert.deepEqual(new Set(Object.keys(INDIC_ASR_LOCALES)), new Set(['bn-IN', 'bho-IN', 'en-IN', 'hi-IN', 'mr-IN', 'ta-IN']));
  assert.deepEqual(new Set(Object.keys(INDIC_TTS_LOCALES)), new Set(['bn-IN', 'bho-IN', 'en-IN', 'hi-IN', 'mr-IN', 'ta-IN']));
});

test('voice model pack stores metadata without model bytes', () => {
  const pack = createVoiceModelPack({
    locale: 'hi-IN',
    modelId: 'indic-whisper-small-hi-q5',
    bytes: 128_000_000,
    sha256: 'c'.repeat(64),
    source: 'side-loaded'
  });

  assert.match(pack.voiceModelPackId, /^bos:voice-model-pack:/);
  assert.equal(pack.language, 'Hindi');
  assert.equal(pack.modelBytesStored, false);
  assert.equal(pack.sha256, 'c'.repeat(64));
  assert.equal(JSON.stringify(pack).includes('modelWeights'), false);
});

test('voice runtime prefers local Indic Whisper model pack and falls back to Web Speech', () => {
  const pack = createVoiceModelPack({ locale: 'mr-IN', modelId: 'indic-whisper-small-mr-q5' });
  const offlinePlan = createVoiceRuntimePlan({
    locale: 'mr-IN',
    modelPacks: [pack],
    webSpeechAvailable: true,
    secureContext: true
  });
  assert.equal(offlinePlan.runtime, 'indic_whisper_wasm');
  assert.equal(offlinePlan.offlineReady, true);
  assert.equal(offlinePlan.networkRequired, false);

  const fallbackPlan = createVoiceRuntimePlan({
    locale: 'ta-IN',
    modelPacks: [],
    webSpeechAvailable: true,
    secureContext: true
  });
  assert.equal(fallbackPlan.runtime, 'web_speech_api');
  assert.equal(fallbackPlan.fallbackReason, 'offline Indic ASR model pack unavailable');

  const textOnlyPlan = createVoiceRuntimePlan({
    locale: 'bn-IN',
    modelPacks: [],
    webSpeechAvailable: true,
    secureContext: false
  });
  assert.equal(textOnlyPlan.runtime, 'text_only');
});

test('store persists voice model packs and ledger evidence', async () => {
  const { store } = await freshStore('voice-runtime-store');
  const pack = createVoiceModelPack({ locale: 'bho-IN', modelId: 'indic-whisper-small-bho-q5', bytes: 99 });

  await store.saveVoiceModelPack(pack);

  assert.equal((await store.readVoiceModelPack(pack.voiceModelPackId)).locale, 'bho-IN');
  assert.equal((await store.listVoiceModelPacks()).length, 1);
  const events = await store.listLedger({ type: 'voice_model_pack.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].voiceModelPackId, pack.voiceModelPackId);
});

test('TTS model pack stores metadata without model bytes', () => {
  const pack = createTtsModelPack({
    locale: 'ta-IN',
    modelId: 'indic-tts-small-ta-q5',
    bytes: 64_000_000,
    sha256: 'e'.repeat(64)
  });

  assert.match(pack.ttsModelPackId, /^bos:tts-model-pack:/);
  assert.equal(pack.language, 'Tamil');
  assert.equal(pack.modelBytesStored, false);
  assert.equal(JSON.stringify(pack).includes('modelWeights'), false);
});

test('TTS runtime prefers local Indic TTS and falls back to browser speech synthesis', () => {
  const pack = createTtsModelPack({ locale: 'bn-IN', modelId: 'indic-tts-small-bn-q5' });
  const offlinePlan = createTtsRuntimePlan({
    locale: 'bn-IN',
    modelPacks: [pack],
    speechSynthesisAvailable: true
  });
  assert.equal(offlinePlan.runtime, 'indic_tts_wasm');
  assert.equal(offlinePlan.offlineReady, true);

  const fallbackPlan = createTtsRuntimePlan({
    locale: 'hi-IN',
    modelPacks: [],
    speechSynthesisAvailable: true
  });
  assert.equal(fallbackPlan.runtime, 'browser_speech_synthesis');
  assert.equal(fallbackPlan.fallbackReason, 'offline Indic TTS model pack unavailable');

  const silentPlan = createTtsRuntimePlan({
    locale: 'mr-IN',
    modelPacks: [],
    speechSynthesisAvailable: false
  });
  assert.equal(silentPlan.runtime, 'silent');
});

test('store persists TTS model packs and ledger evidence', async () => {
  const { store } = await freshStore('tts-runtime-store');
  const pack = createTtsModelPack({ locale: 'hi-IN', modelId: 'indic-tts-small-hi-q5', bytes: 55 });

  await store.saveTtsModelPack(pack);

  assert.equal((await store.readTtsModelPack(pack.ttsModelPackId)).locale, 'hi-IN');
  assert.equal((await store.listTtsModelPacks()).length, 1);
  const events = await store.listLedger({ type: 'tts_model_pack.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].ttsModelPackId, pack.ttsModelPackId);
});
