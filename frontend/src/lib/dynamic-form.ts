// Phase 12.1b.3 — Dynamic-form FE substrate (mirrors phase0/dynamic-form.mjs).
//
// Hand-mirror with a parity snapshot test
// (dynamic-form-parity.test.ts) so the BE and FE field-kind +
// validator-name sets cannot drift. Validators are pure sync
// functions returning canonical error codes — FE consumers
// translate codes to locale-appropriate strings.

export const DYNAMIC_FORM_PROTOCOL_VERSION = 'bos.phase0.dynamic-form.v0';

export const FIELD_KINDS = [
  'text',
  'longtext',
  'select',
  'multiselect',
  'boolean',
  'integer'
] as const;

export type FieldKind = typeof FIELD_KINDS[number];

export interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface FieldSuggest {
  promptHint: string;
}

export interface DependsOn {
  fieldId: string;
  equals: unknown;
}

export interface FieldSpec {
  id: string;
  kind: FieldKind;
  label: string;
  helper?: string;
  required?: boolean;
  options?: FieldOption[];
  maxLen?: number;
  min?: number;
  max?: number;
  validators?: string[];
  suggest?: FieldSuggest;
  dependsOn?: DependsOn;
}

export interface FormSchema {
  roleKind?: string;
  fields: FieldSpec[];
}

export type AnswerValue = string | string[] | boolean | number | null;

export type RoleAnswers = Record<string, AnswerValue | undefined>;

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  normalized: Record<string, AnswerValue>;
}

const TEXT_MAX_LEN_DEFAULT = 80;
const LONGTEXT_MAX_LEN_DEFAULT = 240;
const MULTISELECT_MAX_DEFAULT = 16;
const ROLE_ANSWERS_MAX_BYTES = 4096;

type ValidatorFn = (value: AnswerValue | null | undefined, ctx: { field: FieldSpec }) => string | null;

export const VALIDATORS: Record<string, ValidatorFn> = {
  'non-empty': (value) => {
    if (value == null) return 'required';
    if (typeof value === 'string' && value.trim() === '') return 'required';
    if (Array.isArray(value) && value.length === 0) return 'required';
    return null;
  },
  'max-length': (value, ctx) => {
    if (value == null) return null;
    const limit = ctx.field.maxLen ?? (ctx.field.kind === 'longtext' ? LONGTEXT_MAX_LEN_DEFAULT : TEXT_MAX_LEN_DEFAULT);
    if (typeof value === 'string' && value.length > limit) return 'too_long';
    return null;
  },
  'int-range': (value, ctx) => {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value) return 'not_integer';
    const { min, max } = ctx.field;
    if (typeof min === 'number' && value < min) return 'below_min';
    if (typeof max === 'number' && value > max) return 'above_max';
    return null;
  },
  'one-of': (value, ctx) => {
    if (value == null) return null;
    const allowed = new Set((ctx.field.options ?? []).map((o) => o.value));
    if (Array.isArray(value)) {
      for (const v of value) {
        if (!allowed.has(v as string)) return 'not_in_options';
      }
      return null;
    }
    if (typeof value === 'string' && !allowed.has(value)) return 'not_in_options';
    return null;
  },
  'plate-region': (value) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return 'not_text';
    if (!/^[A-Z]{2}$/.test(value)) return 'not_plate_region';
    return null;
  },
  'boolean-required-true': (value) => {
    if (value !== true) return 'must_be_true';
    return null;
  }
};

export function normaliseFieldValue(field: FieldSpec, raw: unknown): AnswerValue | null {
  if (raw == null) return null;
  switch (field.kind) {
    case 'text': {
      if (typeof raw !== 'string') return null;
      const t = raw.replace(/\r\n/g, '\n').trim();
      const limit = field.maxLen ?? TEXT_MAX_LEN_DEFAULT;
      return t.length > limit ? t.slice(0, limit) : t;
    }
    case 'longtext': {
      if (typeof raw !== 'string') return null;
      const t = raw.replace(/\r\n/g, '\n').trim();
      const limit = field.maxLen ?? LONGTEXT_MAX_LEN_DEFAULT;
      return t.length > limit ? t.slice(0, limit) : t;
    }
    case 'select':
      return typeof raw === 'string' ? raw : null;
    case 'multiselect': {
      if (!Array.isArray(raw)) return null;
      const max = field.max ?? MULTISELECT_MAX_DEFAULT;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const v of raw) {
        if (typeof v !== 'string' || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= max) break;
      }
      return out;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return null;
    case 'integer': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.trunc(n);
    }
    default:
      return null;
  }
}

export function validateAnswers(schema: FormSchema, rawAnswers: RoleAnswers): ValidationResult {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (fields.length === 0) return { ok: true, errors: {}, normalized: {} };
  const normalized: Record<string, AnswerValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field?.id || !(FIELD_KINDS as readonly string[]).includes(field.kind)) {
      errors[field?.id ?? '__unknown'] = 'invalid_field';
      continue;
    }
    const v = normaliseFieldValue(field, rawAnswers?.[field.id]);
    if (v != null) normalized[field.id] = v;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, normalized: {} };
  for (const field of fields) {
    const value = normalized[field.id] ?? null;
    const gated = field.dependsOn
      ? normalized[field.dependsOn.fieldId] === field.dependsOn.equals
      : true;
    const isRequired = Boolean(field.required) && gated;
    if (isRequired) {
      const code = VALIDATORS['non-empty'](value, { field });
      if (code) { errors[field.id] = code; continue; }
    } else if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    if (!gated) {
      if (value != null && !(Array.isArray(value) && value.length === 0) && value !== '' && value !== false) {
        errors[field.id] = 'gated_off_must_be_empty';
      }
      continue;
    }
    for (const name of field.validators ?? []) {
      const fn = VALIDATORS[name];
      if (!fn) continue;
      const code = fn(value, { field });
      if (code) { errors[field.id] = code; break; }
    }
  }
  const stripped: Record<string, AnswerValue> = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v === '') continue;
    stripped[k] = v;
  }
  if (JSON.stringify(stripped).length > ROLE_ANSWERS_MAX_BYTES) {
    return { ok: false, errors: { __schema: 'too_large' }, normalized: {} };
  }
  return { ok: Object.keys(errors).length === 0, errors, normalized: stripped };
}

export function buildRoleAnswersEnvelope(values: Record<string, AnswerValue>, opts: { schemaVersion?: number } = {}) {
  return {
    schemaVersion: opts.schemaVersion ?? 1,
    values: values ?? {}
  };
}
