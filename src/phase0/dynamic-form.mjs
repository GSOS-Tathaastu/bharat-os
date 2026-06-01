// Phase 12.1b.3 — Dynamic-form generic substrate.
//
// What this module is. Pure validators + normalisers over a
// JSON-friendly form schema. The schema shape is shared by
// ProviderOnboarding today, and (per the founder common-features-
// as-core-substrates binding) is reusable by future booking
// forms, consent dialogs, and any other surface that needs
// structured user input.
//
// What this module is NOT. A renderer (that's FE-only). A
// per-domain schema map (provider-role-forms.mjs holds those).
// An async validator runtime (sync only in v1 to keep the BE
// re-validation path simple).
//
// §15 bindings:
//
//   • User controls their inputs. The validator is for SHAPE and
//     RANGE, not for content judgement. We never reject because
//     "the SLM thinks the answer is wrong" — the SLM only ever
//     SUGGESTS via the FE chip, never validates.
//
//   • BE re-validates on save. The same `validateAnswers` runs on
//     POST/PATCH so a misbehaving FE cannot smuggle answers past
//     the schema.
//
//   • Pointer-not-payload. Validation errors return canonical
//     error CODES, not free-text messages assembled from user
//     input — so audit logs of validation failures never echo
//     citizen content.
//
//   • Forward-compat by passthrough. `validateAnswers` against an
//     EMPTY field list returns `{ok: true, normalized: {}}` so a
//     role with no registered schema (wave-2 yet to ship) just
//     produces empty answers; no surface-area "half-state."

export const DYNAMIC_FORM_PROTOCOL_VERSION = 'bos.phase0.dynamic-form.v0';

// Field kinds — the discriminated union. Adding a kind requires
// (a) a renderer in frontend/src/components/forms/DynamicForm.tsx,
// (b) a normaliser branch below, and (c) a parity test update.
export const FIELD_KINDS = [
  'text',
  'longtext',
  'select',
  'multiselect',
  'boolean',
  'integer'
];

const TEXT_MAX_LEN_DEFAULT = 80;
const LONGTEXT_MAX_LEN_DEFAULT = 240;
const MULTISELECT_MAX_DEFAULT = 16;
const SCHEMA_MAX_FIELDS = 24;
const ROLE_ANSWERS_MAX_BYTES = 4096;

// Validator registry — sync pure functions returning a canonical
// error CODE string (never a free-text message). FE consumers
// translate codes to human-readable error labels per locale.
export const VALIDATORS = {
  'non-empty': (value, _ctx) => {
    if (value == null) return 'required';
    if (typeof value === 'string' && value.trim() === '') return 'required';
    if (Array.isArray(value) && value.length === 0) return 'required';
    return null;
  },
  'max-length': (value, ctx) => {
    if (value == null) return null;
    const limit = ctx?.field?.maxLen ?? (ctx?.field?.kind === 'longtext' ? LONGTEXT_MAX_LEN_DEFAULT : TEXT_MAX_LEN_DEFAULT);
    if (typeof value === 'string' && value.length > limit) return 'too_long';
    return null;
  },
  'int-range': (value, ctx) => {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value) return 'not_integer';
    const min = ctx?.field?.min;
    const max = ctx?.field?.max;
    if (typeof min === 'number' && value < min) return 'below_min';
    if (typeof max === 'number' && value > max) return 'above_max';
    return null;
  },
  'one-of': (value, ctx) => {
    if (value == null) return null;
    const options = ctx?.field?.options ?? [];
    const allowed = new Set(options.map((o) => o.value));
    if (Array.isArray(value)) {
      for (const v of value) {
        if (!allowed.has(v)) return 'not_in_options';
      }
      return null;
    }
    if (!allowed.has(value)) return 'not_in_options';
    return null;
  },
  'plate-region': (value, _ctx) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return 'not_text';
    if (!/^[A-Z]{2}$/.test(value)) return 'not_plate_region';
    return null;
  },
  'boolean-required-true': (value, _ctx) => {
    if (value !== true) return 'must_be_true';
    return null;
  }
};

// Normalise raw input by field kind. Trims text, dedupes multi-
// select, truncates the multiselect cap, and coerces integers.
// Returns a cleaned value of the expected type or null when the
// shape is unrecoverable (caller treats null as missing).
export function normaliseFieldValue(field, raw) {
  if (raw === undefined || raw === null) return null;
  switch (field.kind) {
    case 'text': {
      if (typeof raw !== 'string') return null;
      const trimmed = raw.replace(/\r\n/g, '\n').trim();
      const limit = field.maxLen ?? TEXT_MAX_LEN_DEFAULT;
      return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
    }
    case 'longtext': {
      if (typeof raw !== 'string') return null;
      const trimmed = raw.replace(/\r\n/g, '\n').trim();
      const limit = field.maxLen ?? LONGTEXT_MAX_LEN_DEFAULT;
      return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
    }
    case 'select': {
      return typeof raw === 'string' ? raw : null;
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) return null;
      const max = field.max ?? MULTISELECT_MAX_DEFAULT;
      const seen = new Set();
      const out = [];
      for (const v of raw) {
        if (typeof v !== 'string') continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= max) break;
      }
      return out;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return null;
    }
    case 'integer': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.trunc(n);
    }
    default:
      return null;
  }
}

// Validate a `{field, value}` map against a schema. Returns
// `{ok, errors, normalized}` where errors is a per-field code
// dictionary (never free-text) and normalized is the cleaned
// answer set ready to persist.
//
// dependsOn semantics: a field with `dependsOn: { fieldId, equals }`
// is OPTIONAL when the controlling field's normalised value is
// NOT equal to the gate. When it IS equal, the field's regular
// validators run as usual.
export function validateAnswers(schema, rawAnswers) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (fields.length === 0) return { ok: true, errors: {}, normalized: {} };
  if (fields.length > SCHEMA_MAX_FIELDS) {
    return { ok: false, errors: { __schema: 'too_many_fields' }, normalized: {} };
  }
  const normalized = {};
  const errors = {};
  // First pass — normalise every field so dependsOn can read the
  // normalised value of its controlling field.
  for (const field of fields) {
    if (!field?.id || !FIELD_KINDS.includes(field.kind)) {
      errors[field?.id ?? '__unknown'] = 'invalid_field';
      continue;
    }
    const raw = rawAnswers ? rawAnswers[field.id] : undefined;
    normalized[field.id] = normaliseFieldValue(field, raw);
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, normalized: {} };
  }
  // Second pass — run validators with dependsOn gating.
  for (const field of fields) {
    const value = normalized[field.id];
    const gated = field.dependsOn
      ? normalized[field.dependsOn.fieldId] === field.dependsOn.equals
      : true;
    const isRequired = Boolean(field.required) && gated;
    if (isRequired) {
      const requiredCheck = VALIDATORS['non-empty'](value, { field });
      if (requiredCheck) {
        errors[field.id] = requiredCheck;
        continue;
      }
    } else if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      // Optional + empty → skip remaining validators.
      continue;
    }
    if (!gated) {
      // dependsOn-not-satisfied → field MUST be empty.
      if (value != null && !(Array.isArray(value) && value.length === 0) && value !== '' && value !== false) {
        errors[field.id] = 'gated_off_must_be_empty';
      }
      continue;
    }
    const list = Array.isArray(field.validators) ? field.validators : [];
    for (const name of list) {
      const fn = VALIDATORS[name];
      if (typeof fn !== 'function') continue;
      const code = fn(value, { field });
      if (code) {
        errors[field.id] = code;
        break;
      }
    }
  }
  // Strip null values from the normalised payload so the persisted
  // record only carries answered keys.
  const stripped = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v === '') continue;
    stripped[k] = v;
  }
  // Cap the serialised payload size so a misbehaving FE cannot
  // pollute persistence with a 1 MB blob.
  const serialised = JSON.stringify(stripped);
  if (serialised.length > ROLE_ANSWERS_MAX_BYTES) {
    return { ok: false, errors: { __schema: 'too_large' }, normalized: {} };
  }
  return { ok: Object.keys(errors).length === 0, errors, normalized: stripped };
}

// Convenience: returns just the normalised answer set, or throws
// `DynamicFormValidationError` when the schema/values fail. Used
// by API handlers that prefer try/catch flow over result objects.
export function normaliseAnswers(schema, rawAnswers) {
  const result = validateAnswers(schema, rawAnswers);
  if (!result.ok) {
    const err = new Error('invalid_role_answers');
    err.code = 'invalid_role_answers';
    err.errors = result.errors;
    throw err;
  }
  return result.normalized;
}

// Build the canonical persisted shape for an answer set. Honest
// about the schema version so a future schema bump can read v1
// records.
export function buildRoleAnswersEnvelope(values, { schemaVersion = 1 } = {}) {
  return {
    schemaVersion,
    values: values && typeof values === 'object' ? values : {}
  };
}
