// Phase 13.4 — built-in skill-agent seed list.
//
// At boot, `createPhase0ApiServer` calls `seedSkillAgents(store)`
// (api.mjs) which iterates this list and registers each entry
// idempotently. Re-registering an identical seed is a no-op
// because `buildSkillAgent` returns a content-derived skillId —
// the store checks the existing record first and skips when
// it matches. Re-seeding after a code change to an entry will
// produce a NEW skillId; the old entry stays on disk with
// status='registered' until an admin explicitly revokes it
// (audit-honest history).
//
// To add a skill:
//   1. Add an entry below.
//   2. Add a sibling FE skill file under
//      frontend/src/lib/skills/<skillId-or-category>.ts.
//   3. Bump the FE catalog mapping in
//      frontend/src/lib/skill-agents-catalog.ts.
//   4. New ADR + BHARAT_OS §17 entry as usual.
//
// The seed list is the canonical source of truth for "which skill
// agents ship out of the box". The admin POST endpoint exists
// for future operator overrides but is NOT required to enable
// this list.

export const SKILL_AGENT_SEED_REGISTERED_BY = 'bos:built-in-seed';

export const SKILL_AGENT_SEED_LIST = Object.freeze([
  Object.freeze({
    category: 'utility_bill_explainer',
    displayName: 'Electricity bill explainer',
    shortDescription:
      'Reads your discom bill summary and tells you whether the amount is in the expected range, plus 2-5 next-step actions in the Indian-citizen context (file dispute, request meter recheck, switch tariff plan).',
    supportedDocKinds: ['electricity_bill'],
    requiredCapabilities: ['inference'],
    // Empty = compatible with any installed pack. Tightened on a
    // future phase when the prompt is tuned for a specific family.
    compatibleModelPackFamilies: [],
    license: 'apache-2.0',
    maxInputChars: 4000,
    maxOutputChars: 1200,
    registeredBy: SKILL_AGENT_SEED_REGISTERED_BY
  })
]);
