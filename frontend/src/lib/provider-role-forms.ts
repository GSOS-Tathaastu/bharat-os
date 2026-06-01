// Phase 12.1b.3 — Per-role provider form schemas (FE).
//
// Hand-mirror of src/phase1/provider-role-forms.mjs guarded by a
// parity vitest. The FE can also fetch the canonical version via
// GET /api/provider-role-forms but the static copy is what the
// renderer uses synchronously so the UI doesn't flicker on first
// paint.

import type { FormSchema, FieldOption } from './dynamic-form';

const LANGUAGE_OPTIONS: FieldOption[] = [
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

const CAB_DRIVER_FORM: FormSchema = {
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
          "Two-letter Indian state code stamped on the provider's vehicle registration plate. Reply with the two-letter code only."
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

const PERSONAL_DRIVER_FORM: FormSchema = {
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

const HOUSEHOLD_HELP_FORM: FormSchema = {
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

const LABOURERS_FORM: FormSchema = {
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

export const PROVIDER_ROLE_FORMS: Record<string, FormSchema> = {
  'cab-driver': CAB_DRIVER_FORM,
  'personal-driver': PERSONAL_DRIVER_FORM,
  'household-help': HOUSEHOLD_HELP_FORM,
  labourers: LABOURERS_FORM
};

export function getProviderRoleForm(roleKind: string): FormSchema | null {
  return PROVIDER_ROLE_FORMS[roleKind] ?? null;
}
