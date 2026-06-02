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
  }),
  // Phase 13.4.1 — second concrete skill: consumer-complaint drafter.
  // Accepts the citizen's free-form complaint description (no doc
  // input required) and emits a Consumer Protection Act 2019-shaped
  // complaint envelope (DRAFT_SUBJECT / FORUM_LEVEL / RELIEF_KIND /
  // KEY_FACTS + next-step verbs). `supportedDocKinds: ['generic']`
  // means "doesn't need a specific doc kind".
  Object.freeze({
    category: 'consumer_complaint_drafter',
    displayName: 'Consumer complaint drafter',
    shortDescription:
      'Helps you draft a Consumer Protection Act 2019 complaint from your free-text description. Routes to district / state / national commission by relief amount; surfaces key facts your complaint must include.',
    supportedDocKinds: ['generic'],
    requiredCapabilities: ['inference'],
    compatibleModelPackFamilies: [],
    license: 'apache-2.0',
    maxInputChars: 6000,
    maxOutputChars: 1600,
    registeredBy: SKILL_AGENT_SEED_REGISTERED_BY
  }),
  // Phase 13.4.2 — third concrete skill: PM-KISAN status checker.
  // Free-form description of a farmer's PM-KISAN concern → SLM
  // emits SCHEME_STATUS / LIKELY_BLOCKER (4 canonical causes:
  // eKYC pending / bank-Aadhaar unseeded / land-record mismatch
  // / ineligible landholding) / KEY_CHECKS + 1-5 typed next-step
  // actions. v1 is informational; the pmkisan.gov.in adapter
  // lands in a future 13.4.x.
  Object.freeze({
    category: 'government_scheme_status',
    displayName: 'PM-KISAN status checker',
    shortDescription:
      'Reads your description of a PM-KISAN concern (missing payment, status check, eligibility doubt) and surfaces the likely blocker among the four common causes (eKYC, bank-Aadhaar seeding, land records, eligibility) + concrete next steps.',
    supportedDocKinds: ['generic'],
    requiredCapabilities: ['inference'],
    compatibleModelPackFamilies: [],
    license: 'apache-2.0',
    maxInputChars: 4000,
    maxOutputChars: 1400,
    registeredBy: SKILL_AGENT_SEED_REGISTERED_BY
  })
]);
