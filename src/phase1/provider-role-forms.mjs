// Phase 12.1b.3 — Per-role provider light forms.
//
// Light = no docs, no OCR, no KYC. Just the small structured
// extras that help a citizen find the right provider beyond
// {name, rate, area}. Each schema lives next to provider-identity
// per the founder common-features-as-core-substrates binding —
// these are Phase 1.x concerns, not phase-0 primitives.
//
// Scope: WAVE-1 only. Wave-2 (kirana, skilled-trades) goes into a
// "comingSoonPhase: 12.3" slot in the EARN_ROLES catalog and gets
// schemas when their onboarding routes light up. validateRoleAnswers
// returns ok:{} for unregistered roles by passthrough so the
// substrate is forward-compatible without shipping dead schemas.

import {
  validateAnswers,
  buildRoleAnswersEnvelope,
  DYNAMIC_FORM_PROTOCOL_VERSION
} from '../phase0/dynamic-form.mjs';

export const PROVIDER_ROLE_FORMS_PROTOCOL_VERSION = 'bos.phase12.provider-role-forms.v0';

const LANGUAGE_OPTIONS = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'bn', label: 'Bengali' },
  { value: 'bho', label: 'Bhojpuri' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'pa', label: 'Punjabi' }
];

// ---- cab-driver ----------------------------------------------------
const CAB_DRIVER_FORM = {
  roleKind: 'cab-driver',
  fields: [
    {
      id: 'vehicleType',
      kind: 'select',
      label: 'Vehicle type',
      helper: 'What you drive day-to-day.',
      required: true,
      options: [
        { value: 'auto-rickshaw', label: 'Auto rickshaw' },
        { value: 'taxi-sedan', label: 'Sedan taxi' },
        { value: 'taxi-hatchback', label: 'Hatchback taxi' },
        { value: 'taxi-suv', label: 'SUV taxi' },
        { value: 'bike-taxi', label: 'Bike taxi' }
      ],
      validators: ['one-of']
    },
    {
      id: 'seats',
      kind: 'integer',
      label: 'Passenger seats',
      helper: 'Excluding the driver.',
      required: true,
      min: 1,
      max: 8,
      validators: ['int-range']
    },
    {
      id: 'plateRegion',
      kind: 'text',
      label: 'Plate region (2 letters)',
      helper: 'e.g. MH for Maharashtra, KA for Karnataka. Citizens see this on bookings.',
      required: true,
      maxLen: 2,
      validators: ['max-length', 'plate-region'],
      suggest: {
        promptHint:
          'Two-letter Indian state code stamped on the provider\'s vehicle registration plate. Reply with the two-letter code only.'
      }
    },
    {
      id: 'acAvailable',
      kind: 'boolean',
      label: 'AC available',
      helper: 'Citizens often filter by this on hot afternoons.'
    },
    {
      id: 'languages',
      kind: 'multiselect',
      label: 'Languages you can converse in',
      helper: 'Citizens see this so they pick a driver who speaks their language.',
      required: true,
      max: 5,
      options: LANGUAGE_OPTIONS,
      validators: ['one-of']
    }
  ]
};

// ---- personal-driver ----------------------------------------------
const PERSONAL_DRIVER_FORM = {
  roleKind: 'personal-driver',
  fields: [
    {
      id: 'transmission',
      kind: 'select',
      label: 'Transmission you can drive',
      required: true,
      options: [
        { value: 'manual', label: 'Manual only' },
        { value: 'automatic', label: 'Automatic only' },
        { value: 'both', label: 'Manual + Automatic' }
      ],
      validators: ['one-of']
    },
    {
      id: 'yearsExperience',
      kind: 'integer',
      label: 'Years of driving experience',
      required: true,
      min: 0,
      max: 60,
      validators: ['int-range']
    },
    {
      id: 'languages',
      kind: 'multiselect',
      label: 'Languages you can converse in',
      required: true,
      max: 5,
      options: LANGUAGE_OPTIONS,
      validators: ['one-of']
    }
  ]
};

// ---- household-help ----------------------------------------------
const HOUSEHOLD_HELP_FORM = {
  roleKind: 'household-help',
  fields: [
    {
      id: 'canCook',
      kind: 'boolean',
      label: 'I can cook',
      helper: 'Citizens hire cooks separately; this lets them pick a combined helper.',
      required: false
    },
    {
      id: 'canCookNonVeg',
      kind: 'boolean',
      label: 'I can cook non-veg',
      helper: 'Only shown to citizens who explicitly ask for non-veg cooking.',
      dependsOn: { fieldId: 'canCook', equals: true }
    },
    {
      id: 'languages',
      kind: 'multiselect',
      label: 'Languages you can converse in',
      required: true,
      max: 5,
      options: LANGUAGE_OPTIONS,
      validators: ['one-of']
    },
    {
      id: 'aboutYou',
      kind: 'longtext',
      label: 'About you (optional)',
      helper:
        'A short line citizens see on your card. Avoid sharing home address or phone — we never pass those to citizens.',
      maxLen: 240,
      validators: ['max-length'],
      suggest: {
        promptHint:
          'One short friendly line a household-help provider could put on their public Bharat OS profile. Plain text, no quotes, no emoji, no contact details. Reply with ONE line only.'
      }
    }
  ]
};

// ---- labourers ---------------------------------------------------
const LABOURERS_FORM = {
  roleKind: 'labourers',
  fields: [
    {
      id: 'tradeSpecialities',
      kind: 'multiselect',
      label: 'What you mostly do',
      helper: 'Citizens filter by this when posting work.',
      required: true,
      max: 6,
      options: [
        { value: 'construction', label: 'Construction' },
        { value: 'loading', label: 'Loading / unloading' },
        { value: 'farm', label: 'Farm work' },
        { value: 'factory', label: 'Factory work' },
        { value: 'painting', label: 'Painting' },
        { value: 'gardening', label: 'Gardening' }
      ],
      validators: ['one-of']
    },
    {
      id: 'toolsOwned',
      kind: 'multiselect',
      label: 'Tools you bring',
      helper: 'Only what you own and routinely use.',
      max: 6,
      options: [
        { value: 'shovel', label: 'Shovel' },
        { value: 'hammer', label: 'Hammer' },
        { value: 'trowel', label: 'Trowel' },
        { value: 'wheelbarrow', label: 'Wheelbarrow' },
        { value: 'ladder', label: 'Ladder' },
        { value: 'pickaxe', label: 'Pickaxe' }
      ],
      validators: ['one-of']
    },
    {
      id: 'languages',
      kind: 'multiselect',
      label: 'Languages you can converse in',
      required: true,
      max: 5,
      options: LANGUAGE_OPTIONS,
      validators: ['one-of']
    }
  ]
};

const FORMS_BY_ROLE = {
  'cab-driver': CAB_DRIVER_FORM,
  'personal-driver': PERSONAL_DRIVER_FORM,
  'household-help': HOUSEHOLD_HELP_FORM,
  labourers: LABOURERS_FORM
};

export const PROVIDER_ROLE_FORMS = FORMS_BY_ROLE;
export const PROVIDER_ROLE_FORM_VERSIONS = Object.fromEntries(
  Object.keys(FORMS_BY_ROLE).map((k) => [k, 1])
);

export function getProviderRoleForm(roleKind) {
  return FORMS_BY_ROLE[roleKind] ?? null;
}

// validateRoleAnswers — the BE re-validation entry point. Wraps
// the generic phase0 validateAnswers so the API handler can pass
// (roleKind, rawAnswers) and get back a {ok, errors, envelope}.
// Forward-compat: unregistered roleKind → ok with empty envelope.
export function validateRoleAnswers(roleKind, rawAnswers) {
  const schema = getProviderRoleForm(roleKind);
  if (!schema) {
    return { ok: true, errors: {}, envelope: null };
  }
  const result = validateAnswers(schema, rawAnswers);
  if (!result.ok) {
    return { ok: false, errors: result.errors, envelope: null };
  }
  return {
    ok: true,
    errors: {},
    envelope: buildRoleAnswersEnvelope(result.normalized, { schemaVersion: 1 })
  };
}

// Re-export the protocol versions so doc tooling + tests can pin
// the substrate without crossing into phase0 themselves.
export { DYNAMIC_FORM_PROTOCOL_VERSION };
