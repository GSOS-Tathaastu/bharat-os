// Phase 13.4 — SLM-H on-device skill-agent registry.
//
// A "skill agent" is a tightly-scoped on-device task agent that
// composes existing SLM substrates (intent parser, doc summariser,
// PII redactor, personalization) plus a skill-specific prompt
// template + structured-output parser to give an Indian citizen
// concrete, actionable guidance for a specific paperwork-class
// task (electricity bill / consumer complaint / PM-KISAN scheme).
//
// This module is the *registry* — admin-curated metadata. The
// actual prompt template + parser live on the FE under
// `frontend/src/lib/skills/<skillId>.ts`; the registry just
// describes which skill IDs the catalog knows about, which SLM
// capabilities each one needs, which docKinds it consumes, and
// which model packs it is compatible with.
//
// Mirrors the Phase 9.0a SLM model-pack registry shape:
//   - protocol version pinned (vitest + Node test pin both)
//   - strict allowlist on every enum field
//   - status: 'registered' | 'revoked' (soft-delete)
//   - admin-only mutation; public read at /api/skill-agents
//
// §15 bindings:
//   - On-device only. The skill registry carries POINTER metadata
//     (skillId / promptTemplateRef / capabilities) — never a
//     bundled prompt body. The actual prompt template ships with
//     the FE code so the citizen's browser is the only place that
//     ever materialises the full prompt.
//   - Strict allowlist > denylist. PERMITTED_SKILL_AGENT_KEYS
//     mirrors the Phase 13.2 piiRedaction and Phase 13.0.2
//     doc-summary-envelope posture.
//   - No PII to ledger. `skill_agent.registered` / `revoked`
//     events carry skillId / version / operator only.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { SLM_CAPABILITIES, SLM_LICENSES } from './slm-model-pack.mjs';

export const SKILL_AGENT_PROTOCOL_VERSION = 'bos.phase13.skill-agent.v1';

// Allowlist of skill-agent task categories. Kept tight on purpose:
// every entry maps to a real Indian-citizen paperwork task with a
// shipped concrete skill module on the FE. Future skills add
// entries here AND a sibling skill file under
// frontend/src/lib/skills/.
export const SKILL_AGENT_CATEGORIES = Object.freeze([
  'utility_bill_explainer',
  'consumer_complaint_drafter',
  'government_scheme_status'
]);

// Allowlist of docKinds a skill agent may consume as input. Mirrors
// the FE DocKind union in frontend/src/lib/doc-summariser.ts;
// vitest/Node convergence tests assert set-equality.
export const SKILL_AGENT_SUPPORTED_DOC_KINDS = Object.freeze([
  'electricity_bill',
  'form_16',
  'tncs',
  'insurance',
  'lender_doc',
  'generic'
]);

// Per Phase 13.0.2 SF-2 posture — single source of truth for the
// JSON-grep defence-in-depth substrings. Both the BE validator
// rejection probe AND the ledger-event grep test import this and
// assert no forbidden substring appears in the serialised
// registry record or its derived events.
export const SKILL_AGENT_FORBIDDEN_REGISTRY_SUBSTRINGS = Object.freeze([
  'promptBody',
  'promptText',
  'systemPrompt',
  'instruction',
  'fullPrompt',
  'rawCompletion',
  'sampleOutput',
  'pii',
  'aadhaar',
  'pan',
  'mobile',
  'plaintext',
  'unmasked'
]);

// Strict allowlist on the top-level registry record. Any extra
// key — even a benign-looking one like `description` — hard
// rejects the registration so a future admin endpoint extension
// has to land an explicit allowlist bump alongside its consumer.
export const PERMITTED_SKILL_AGENT_KEYS = Object.freeze([
  'skillId',
  'category',
  'displayName',
  'shortDescription',
  'supportedDocKinds',
  'requiredCapabilities',
  'compatibleModelPackFamilies',
  'license',
  'maxInputChars',
  'maxOutputChars',
  'protocolVersion',
  'status',
  'registeredBy',
  'registeredAt',
  'revokedBy',
  'revokedAt',
  'revokeReason'
]);

const MAX_DISPLAY_NAME = 120;
const MAX_SHORT_DESCRIPTION = 240;
const MAX_INPUT_CHARS_CAP = 12000;
const MAX_OUTPUT_CHARS_CAP = 4000;
const MIN_INPUT_CHARS = 64;
const MIN_OUTPUT_CHARS = 64;

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) {
    throw new Error(`${label} exceeds ${max} characters.`);
  }
  return trimmed;
}

function assertIntInRange(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be an integer in [${min}, ${max}].`);
  }
  return n;
}

function assertStringArray(value, label, allowlist, { min = 1, max = 16 } = {}) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (value.length < min || value.length > max) {
    throw new Error(`${label} must have between ${min} and ${max} entries.`);
  }
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new Error(`${label} entries must be strings.`);
    }
    if (allowlist && !allowlist.includes(entry)) {
      throw new Error(`${label} entry "${entry}" is not in the allowlist.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${label} contains duplicate entry "${entry}".`);
    }
    seen.add(entry);
  }
  return [...value].sort();
}

function assertFamilyArray(value, label) {
  // Free-form but bounded — model-pack `family` is admin-curated
  // and not an enum at SLM layer (`phi-3-mini`, `gemma-2b-it`,
  // `qwen2-1_5b`, etc.). Cap each entry to 64 chars; cap the array
  // to 8 entries. Setting [] means "compatible with any pack".
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (value.length > 8) {
    throw new Error(`${label} must have at most 8 entries.`);
  }
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`${label} entries must be non-empty strings.`);
    }
    if (entry.length > 64) {
      throw new Error(`${label} entry exceeds 64 characters.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${label} contains duplicate entry "${entry}".`);
    }
    seen.add(entry);
  }
  return [...value].sort();
}

function skillAgentIdFrom(payload) {
  // Stable, content-addressed: the same {category, displayName,
  // supportedDocKinds, requiredCapabilities, license} always yields
  // the same skillId. Re-registering an identical seed is a no-op.
  return `bos:skill-agent:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Validate + normalise an admin-supplied skill-agent registration.
 * Returns the validated registry record ready for persistence;
 * throws on malformed input so callers (admin endpoint + boot
 * seeder) surface 400 / fail-loudly.
 *
 * Strict allowlist on top-level keys mirrors the Phase 13.0.2
 * doc-summary-envelope posture (ADR 0155) and the Phase 13.2
 * piiRedaction posture (ADR 0152).
 */
export function buildSkillAgent(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('skill-agent input must be an object.');
  }
  // Strict allowlist — reject any key not in the permitted set so
  // a typo like `descritpion` doesn't quietly drop on the floor
  // and a future leak vector (e.g. `promptBody`) can't sneak in
  // without an explicit allowlist bump here.
  for (const key of Object.keys(input)) {
    if (!PERMITTED_SKILL_AGENT_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted skill-agent field; registry envelope is pointer-only (prompt body lives on the FE).`
      );
    }
  }
  if (!SKILL_AGENT_CATEGORIES.includes(input.category)) {
    throw new Error(
      `category must be one of: ${SKILL_AGENT_CATEGORIES.join(', ')}.`
    );
  }
  const displayName = assertNonEmptyString(input.displayName, 'displayName', MAX_DISPLAY_NAME);
  const shortDescription = assertNonEmptyString(
    input.shortDescription,
    'shortDescription',
    MAX_SHORT_DESCRIPTION
  );
  const supportedDocKinds = assertStringArray(
    input.supportedDocKinds,
    'supportedDocKinds',
    SKILL_AGENT_SUPPORTED_DOC_KINDS,
    { min: 1, max: SKILL_AGENT_SUPPORTED_DOC_KINDS.length }
  );
  const requiredCapabilities = assertStringArray(
    input.requiredCapabilities,
    'requiredCapabilities',
    SLM_CAPABILITIES,
    { min: 1, max: SLM_CAPABILITIES.length }
  );
  const compatibleModelPackFamilies = assertFamilyArray(
    input.compatibleModelPackFamilies ?? [],
    'compatibleModelPackFamilies'
  );
  if (!SLM_LICENSES.includes(input.license)) {
    throw new Error(`license must be one of: ${SLM_LICENSES.join(', ')}.`);
  }
  const maxInputChars = assertIntInRange(
    input.maxInputChars,
    'maxInputChars',
    MIN_INPUT_CHARS,
    MAX_INPUT_CHARS_CAP
  );
  const maxOutputChars = assertIntInRange(
    input.maxOutputChars,
    'maxOutputChars',
    MIN_OUTPUT_CHARS,
    MAX_OUTPUT_CHARS_CAP
  );
  const registeredBy = assertNonEmptyString(input.registeredBy, 'registeredBy', 120);
  // Content-addressed skillId is the canonical pointer; if the
  // caller passes one, assert it matches the derived hash so
  // typos / spoofed IDs fail loud.
  const derivedId = skillAgentIdFrom({
    category: input.category,
    displayName,
    supportedDocKinds,
    requiredCapabilities,
    license: input.license
  });
  if (input.skillId != null && input.skillId !== derivedId) {
    throw new Error('skillId does not match content-derived hash.');
  }
  return {
    skillId: derivedId,
    category: input.category,
    displayName,
    shortDescription,
    supportedDocKinds,
    requiredCapabilities,
    compatibleModelPackFamilies,
    license: input.license,
    maxInputChars,
    maxOutputChars,
    protocolVersion: SKILL_AGENT_PROTOCOL_VERSION,
    status: 'registered',
    registeredBy,
    registeredAt: nowIso(),
    revokedBy: null,
    revokedAt: null,
    revokeReason: null
  };
}

/**
 * Soft-delete a registered skill agent. The record stays on disk
 * with status='revoked' so audit history is preserved (citizens
 * who previously saw "skill installed" can still see "skill
 * revoked since YYYY-MM-DD").
 */
export function revokeSkillAgent(existing, { revokedBy, reason }) {
  if (existing == null || existing.status === 'revoked') {
    throw new Error('skill agent is not in a registered state.');
  }
  const operator = assertNonEmptyString(revokedBy, 'revokedBy', 120);
  const revokeReason = reason == null ? null : assertNonEmptyString(reason, 'reason', 240);
  return {
    ...existing,
    status: 'revoked',
    revokedBy: operator,
    revokedAt: nowIso(),
    revokeReason
  };
}

/**
 * Filter helper for the public catalog endpoint — returns only
 * skills whose `compatibleModelPackFamilies` includes the given
 * installed-pack family (empty array on the skill = compatible
 * with any pack). Used by the FE to scope "skills you can run"
 * to the pack the citizen actually installed.
 */
export function filterSkillAgentsByPackFamily(skills, installedFamilies) {
  if (!Array.isArray(installedFamilies) || installedFamilies.length === 0) return skills;
  const installed = new Set(installedFamilies);
  return skills.filter((skill) => {
    if (!Array.isArray(skill.compatibleModelPackFamilies) || skill.compatibleModelPackFamilies.length === 0) {
      return true;
    }
    return skill.compatibleModelPackFamilies.some((fam) => installed.has(fam));
  });
}
