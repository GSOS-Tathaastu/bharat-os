// Phase 9.0a — Tier-4 SLM model-pack registry.
//
// Distinct from the Phase 2a.6 `on-device-model-pack` (Tier-2: ~7 MB
// ASR/TTS/intent packs from Tesseract / Indic Whisper / IndicTTS).
// Tier-4 packs are 1.5-4 GB Small Language Models (Phi-3-mini,
// Llama-3.2, Gemma-2B etc., quantized) the user explicitly opts into
// downloading.
//
// This module is the *registry* — admin-curated metadata. The actual
// download + runtime adapter wrapping llama.cpp-wasm / MLC-LLM / ONNX
// Runtime Web is a later Phase 9.0 sub-phase. Here we only validate
// metadata + decide which packs are compatible with a given device
// profile.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const SLM_MODEL_PACK_PROTOCOL_VERSION = 'bos.phase9.slm-model-pack.v0';

export const SLM_RUNTIMES = [
  'llama_cpp_wasm',
  'mlc_llm_webgpu',
  'onnx_runtime_web',
  'native_aosp'
];

export const SLM_QUANTIZATIONS = ['q4_k_m', 'q5_k_m', 'q8_0', 'fp16', 'int4', 'int8'];

export const SLM_LICENSES = [
  'mit',
  'apache-2.0',
  'bsd-3-clause',
  'meta-llama-3',
  'gemma-terms',
  'phi-license',
  'other'
];

export const SLM_CAPABILITIES = [
  'inference',
  'lora_finetune',
  'classifier_head',
  'embedding'
];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCapabilities(input) {
  const requested = input?.length ? input : ['inference'];
  const valid = [...new Set(requested.filter((c) => SLM_CAPABILITIES.includes(c)))].sort();
  if (valid.length === 0) {
    throw new Error('at least one supported SLM capability is required.');
  }
  return valid;
}

function assertPositiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return n;
}

function assertNonEmptyString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) {
    throw new Error(`${label} exceeds ${max} characters.`);
  }
  return trimmed;
}

function assertHttpsUrl(value, label) {
  const trimmed = assertNonEmptyString(value, label, 2048);
  let url;
  try {
    url = new URL(trimmed);
  } catch (_error) {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must be served over https.`);
  }
  return url.toString();
}

function assertSha256(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(trimmed)) {
    throw new Error(`${label} must be in 'sha256:<64-hex>' form.`);
  }
  return trimmed;
}

export function createSlmModelPack({
  modelPackId,
  family,
  variant = null,
  parameterCount,
  quantization,
  diskBytes,
  ramRequiredMb,
  runtime,
  sourceUrl,
  sourceHash,
  license,
  capabilities,
  contextWindow = null,
  description = null,
  registeredAt = nowIso(),
  registeredBy = 'unattributed-operator'
}) {
  const requestedId = modelPackId != null ? assertNonEmptyString(modelPackId, 'modelPackId', 160) : null;
  const familyTrim = assertNonEmptyString(family, 'family', 80);
  const variantTrim = variant == null ? null : assertNonEmptyString(variant, 'variant', 80);
  const descTrim = description == null ? null : String(description).slice(0, 600);
  if (!SLM_RUNTIMES.includes(runtime)) {
    throw new Error(`runtime must be one of: ${SLM_RUNTIMES.join(', ')}.`);
  }
  if (!SLM_QUANTIZATIONS.includes(quantization)) {
    throw new Error(`quantization must be one of: ${SLM_QUANTIZATIONS.join(', ')}.`);
  }
  if (!SLM_LICENSES.includes(license)) {
    throw new Error(`license must be one of: ${SLM_LICENSES.join(', ')}.`);
  }
  const params = assertPositiveInteger(parameterCount, 'parameterCount');
  const disk = assertPositiveInteger(diskBytes, 'diskBytes');
  const ram = assertPositiveInteger(ramRequiredMb, 'ramRequiredMb');
  const ctx = contextWindow == null ? null : assertPositiveInteger(contextWindow, 'contextWindow');
  if (disk > 8_000_000_000) {
    throw new Error('diskBytes exceeds the 8 GB Tier-4 envelope.');
  }
  if (ram > 16_384) {
    throw new Error('ramRequiredMb exceeds 16 GB (no current phone hardware target).');
  }
  const url = assertHttpsUrl(sourceUrl, 'sourceUrl');
  const hash = assertSha256(sourceHash, 'sourceHash');
  const caps = normalizeCapabilities(capabilities);
  const operator = String(registeredBy).trim().slice(0, 80) || 'unattributed-operator';

  const core = {
    protocolVersion: SLM_MODEL_PACK_PROTOCOL_VERSION,
    objectType: 'slm-model-pack',
    tier: 4,
    family: familyTrim,
    variant: variantTrim,
    parameterCount: params,
    quantization,
    diskBytes: disk,
    ramRequiredMb: ram,
    runtime,
    sourceUrl: url,
    sourceHash: hash,
    license,
    capabilities: caps,
    contextWindow: ctx,
    description: descTrim,
    registeredAt,
    registeredBy: operator,
    status: 'registered'
  };

  return {
    modelPackId: requestedId ?? idFrom('bos:slm-model-pack', core),
    ...core
  };
}

// Phase 9.0a — compatibility filter. Given a device profile (RAM,
// free disk, runtime backends the browser supports) return only the
// packs the device can actually run. Caller (the shell) uses this to
// avoid showing the user a pack that won't install. The server-side
// `GET /api/slm-model-packs` route exposes this filter as query
// params.
export function filterCompatibleSlmModelPacks(modelPacks, deviceProfile = {}) {
  const deviceRam = Number(deviceProfile.deviceRamMb ?? 0);
  const freeDisk = Number(deviceProfile.freeDiskBytes ?? 0);
  const supportedRuntimes = new Set(
    Array.isArray(deviceProfile.supportedRuntimes) ? deviceProfile.supportedRuntimes : []
  );

  return modelPacks.filter((pack) => {
    if (pack.status === 'revoked') return false;
    if (deviceRam > 0 && pack.ramRequiredMb > deviceRam) return false;
    // 1.2x disk-headroom — a half-finished download must fit, plus
    // some scratch space for the SHA-256 verify pass.
    if (freeDisk > 0 && pack.diskBytes * 1.2 > freeDisk) return false;
    if (supportedRuntimes.size > 0 && !supportedRuntimes.has(pack.runtime)) return false;
    return true;
  });
}

// Phase 9.0a — revocation. When an admin pulls a pack from the
// registry (security advisory, license change), we don't hard-delete
// it — we flip status to `revoked` so the audit trail of "who
// installed this when" still resolves to a pack the registry has
// seen. Compatibility filter excludes revoked packs from new
// installs.
export function revokeSlmModelPack(modelPack, { revokedAt = nowIso(), revokedBy = 'unattributed-operator', reason = null } = {}) {
  if (!modelPack || modelPack.objectType !== 'slm-model-pack') {
    throw new Error('a registered slm-model-pack is required.');
  }
  if (modelPack.status === 'revoked') return modelPack;
  return {
    ...modelPack,
    status: 'revoked',
    revokedAt,
    revokedBy: String(revokedBy).trim().slice(0, 80) || 'unattributed-operator',
    revocationReason: reason == null ? null : String(reason).slice(0, 400)
  };
}
