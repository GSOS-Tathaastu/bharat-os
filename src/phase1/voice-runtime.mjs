import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const VOICE_RUNTIME_PROTOCOL_VERSION = 'bos.phase2a.voice-runtime.v0';

export const INDIC_ASR_LOCALES = {
  'hi-IN': { language: 'Hindi', modelFamily: 'indic-whisper-wasm' },
  'mr-IN': { language: 'Marathi', modelFamily: 'indic-whisper-wasm' },
  'bho-IN': { language: 'Bhojpuri', modelFamily: 'indic-whisper-wasm' },
  'ta-IN': { language: 'Tamil', modelFamily: 'indic-whisper-wasm' },
  'bn-IN': { language: 'Bengali', modelFamily: 'indic-whisper-wasm' },
  'en-IN': { language: 'Indian English', modelFamily: 'whisper-wasm' }
};

export const INDIC_TTS_LOCALES = {
  'hi-IN': { language: 'Hindi', modelFamily: 'indic-tts-wasm' },
  'mr-IN': { language: 'Marathi', modelFamily: 'indic-tts-wasm' },
  'bho-IN': { language: 'Bhojpuri', modelFamily: 'indic-tts-wasm' },
  'ta-IN': { language: 'Tamil', modelFamily: 'indic-tts-wasm' },
  'bn-IN': { language: 'Bengali', modelFamily: 'indic-tts-wasm' },
  'en-IN': { language: 'Indian English', modelFamily: 'browser-speech-synthesis' }
};

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLocale(locale) {
  const requested = locale || 'en-IN';
  if (INDIC_ASR_LOCALES[requested]) return requested;
  const language = requested.split('-')[0];
  return Object.keys(INDIC_ASR_LOCALES).find((candidate) => candidate.split('-')[0] === language) ?? 'en-IN';
}

export function createVoiceModelPack({
  locale,
  modelId,
  engine = 'indic-whisper-wasm',
  bytes,
  sha256,
  source = 'local-cache',
  installedAt = nowIso()
}) {
  const normalizedLocale = normalizeLocale(locale);
  if (!modelId) throw new Error('modelId is required.');
  const core = {
    protocolVersion: VOICE_RUNTIME_PROTOCOL_VERSION,
    objectType: 'voice-model-pack',
    locale: normalizedLocale,
    language: INDIC_ASR_LOCALES[normalizedLocale].language,
    modelId,
    engine,
    bytes: Number(bytes ?? 0),
    sha256: sha256 ?? null,
    source,
    modelBytesStored: false,
    installedAt
  };

  return {
    voiceModelPackId: idFrom('bos:voice-model-pack', core),
    ...core
  };
}

export function createVoiceRuntimePlan({
  locale = 'en-IN',
  modelPacks = [],
  webSpeechAvailable = false,
  secureContext = true,
  preferOffline = true
} = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const matchingPack = modelPacks.find(
    (pack) => pack.locale === normalizedLocale && pack.engine.includes('whisper')
  );
  const canUseOffline = preferOffline && Boolean(matchingPack);
  const canUseWebSpeech = Boolean(webSpeechAvailable && secureContext);
  const runtime = canUseOffline ? 'indic_whisper_wasm' : canUseWebSpeech ? 'web_speech_api' : 'text_only';
  const core = {
    protocolVersion: VOICE_RUNTIME_PROTOCOL_VERSION,
    objectType: 'voice-runtime-plan',
    locale: normalizedLocale,
    language: INDIC_ASR_LOCALES[normalizedLocale].language,
    runtime,
    offlineReady: canUseOffline,
    networkRequired: runtime === 'web_speech_api',
    secureContextRequired: runtime !== 'text_only',
    selectedModelPackId: matchingPack?.voiceModelPackId ?? null,
    fallbackReason: canUseOffline
      ? null
      : canUseWebSpeech
        ? 'offline Indic ASR model pack unavailable'
        : 'no local ASR runtime available',
    modelBytesStoredInReceipt: false
  };

  return {
    voiceRuntimePlanId: idFrom('bos:voice-runtime-plan', core),
    ...core
  };
}

export function createTtsModelPack({
  locale,
  modelId,
  engine = 'indic-tts-wasm',
  bytes,
  sha256,
  source = 'local-cache',
  installedAt = nowIso()
}) {
  const normalizedLocale = normalizeLocale(locale);
  if (!modelId) throw new Error('modelId is required.');
  const core = {
    protocolVersion: VOICE_RUNTIME_PROTOCOL_VERSION,
    objectType: 'tts-model-pack',
    locale: normalizedLocale,
    language: INDIC_TTS_LOCALES[normalizedLocale].language,
    modelId,
    engine,
    bytes: Number(bytes ?? 0),
    sha256: sha256 ?? null,
    source,
    modelBytesStored: false,
    installedAt
  };

  return {
    ttsModelPackId: idFrom('bos:tts-model-pack', core),
    ...core
  };
}

export function createTtsRuntimePlan({
  locale = 'en-IN',
  modelPacks = [],
  speechSynthesisAvailable = false,
  preferOffline = true
} = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const matchingPack = modelPacks.find(
    (pack) => pack.locale === normalizedLocale && pack.engine.includes('tts')
  );
  const canUseOffline = preferOffline && Boolean(matchingPack);
  const canUseBrowserSpeech = Boolean(speechSynthesisAvailable);
  const runtime = canUseOffline ? 'indic_tts_wasm' : canUseBrowserSpeech ? 'browser_speech_synthesis' : 'silent';
  const core = {
    protocolVersion: VOICE_RUNTIME_PROTOCOL_VERSION,
    objectType: 'tts-runtime-plan',
    locale: normalizedLocale,
    language: INDIC_TTS_LOCALES[normalizedLocale].language,
    runtime,
    offlineReady: canUseOffline,
    networkRequired: false,
    selectedModelPackId: matchingPack?.ttsModelPackId ?? null,
    fallbackReason: canUseOffline
      ? null
      : canUseBrowserSpeech
        ? 'offline Indic TTS model pack unavailable'
        : 'no local TTS runtime available',
    modelBytesStoredInReceipt: false
  };

  return {
    ttsRuntimePlanId: idFrom('bos:tts-runtime-plan', core),
    ...core
  };
}
