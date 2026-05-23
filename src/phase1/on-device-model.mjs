import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const ON_DEVICE_MODEL_PROTOCOL_VERSION = 'bos.phase2a.on-device-model.v0';

export const ON_DEVICE_TASKS = ['intent_planning', 'field_extraction', 'summarization'];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCapabilities(capabilities) {
  const requested = capabilities?.length ? capabilities : ['intent_planning'];
  return [...new Set(requested.filter((capability) => ON_DEVICE_TASKS.includes(capability)))].sort();
}

export function createOnDeviceModelPack({
  modelId,
  family = 'gemma-2b-it-q4',
  runtime = 'webgpu_transformersjs',
  bytes,
  sha256,
  capabilities,
  localeCoverage = ['en-IN'],
  source = 'local-cache',
  installedAt = nowIso()
}) {
  if (!modelId) throw new Error('modelId is required.');
  const normalizedCapabilities = normalizeCapabilities(capabilities);
  if (normalizedCapabilities.length === 0) throw new Error('at least one supported capability is required.');
  const core = {
    protocolVersion: ON_DEVICE_MODEL_PROTOCOL_VERSION,
    objectType: 'on-device-model-pack',
    modelId,
    family,
    runtime,
    bytes: Number(bytes ?? 0),
    sha256: sha256 ?? null,
    capabilities: normalizedCapabilities,
    localeCoverage: [...new Set(localeCoverage.map(String))].sort(),
    source,
    modelBytesStored: false,
    installedAt
  };

  return {
    onDeviceModelPackId: idFrom('bos:on-device-model-pack', core),
    ...core
  };
}

export function createOnDeviceRuntimePlan({
  task = 'intent_planning',
  modelPacks = [],
  webGpuAvailable = false,
  wasmAvailable = true,
  maxDownloadBytes = 1_500_000_000
} = {}) {
  if (!ON_DEVICE_TASKS.includes(task)) throw new Error('unsupported on-device task.');
  const compatible = modelPacks.filter((pack) => pack.capabilities?.includes(task));
  const selected =
    compatible.find((pack) => pack.runtime === 'webgpu_transformersjs' && webGpuAvailable) ??
    compatible.find((pack) => pack.runtime === 'wasm_llamacpp' && wasmAvailable) ??
    null;
  const runtime = selected
    ? selected.runtime
    : webGpuAvailable || wasmAvailable
      ? 'deterministic_rules_with_model_slot'
      : 'deterministic_rules_only';
  const core = {
    protocolVersion: ON_DEVICE_MODEL_PROTOCOL_VERSION,
    objectType: 'on-device-runtime-plan',
    task,
    runtime,
    localModelReady: Boolean(selected),
    selectedModelPackId: selected?.onDeviceModelPackId ?? null,
    modelBytesStoredInReceipt: false,
    maxDownloadBytes,
    fallbackReason: selected ? null : 'no compatible local SLM model pack installed'
  };

  return {
    onDeviceRuntimePlanId: idFrom('bos:on-device-runtime-plan', core),
    ...core
  };
}
