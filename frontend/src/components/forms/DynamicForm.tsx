import { useMemo } from 'react';
import { Badge, Card, Field } from '@/components/ui';
import type { FieldSpec, FormSchema, AnswerValue, RoleAnswers } from '@/lib/dynamic-form';
import { validateAnswers } from '@/lib/dynamic-form';
import { SlmSuggestChip } from './SlmSuggestChip';

// Phase 12.1b.3 — Schema-driven form renderer.
//
// Controlled component. Takes a schema + values + onChange and
// renders the right field components. Per-field error codes
// (translated to human text by ERROR_LABEL) appear inline. The
// SLM suggest chip renders below text fields with a
// `suggest.promptHint`.

const ERROR_LABEL: Record<string, string> = {
  required: 'Required.',
  too_long: 'Too long.',
  not_integer: 'Must be a whole number.',
  below_min: 'Too low.',
  above_max: 'Too high.',
  not_in_options: 'Pick from the options below.',
  not_plate_region: 'Use a 2-letter state code, like MH or KA.',
  must_be_true: 'Please confirm.',
  not_text: 'Type a value.',
  gated_off_must_be_empty: 'Clear this — the controlling option is off.',
  invalid_field: 'This field is misconfigured.',
  too_large: 'Your answers are too long. Trim some text fields.'
};

export function translateFieldError(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_LABEL[code] ?? code;
}

interface DynamicFormProps {
  schema: FormSchema;
  values: RoleAnswers;
  onChange: (next: RoleAnswers) => void;
  identityId: string | null | undefined;
  roleLabel: string;
  errors?: Record<string, string>;
}

export function DynamicForm({ schema, values, onChange, identityId, roleLabel, errors = {} }: DynamicFormProps) {
  // Re-validate locally so the citizen sees immediate feedback;
  // the server re-validates on save.
  const localErrors = useMemo(() => {
    const result = validateAnswers(schema, values);
    return { ...result.errors, ...errors };
  }, [schema, values, errors]);

  function setField(fieldId: string, next: AnswerValue | null) {
    onChange({ ...values, [fieldId]: next ?? undefined });
  }

  function isGatedOff(field: FieldSpec): boolean {
    if (!field.dependsOn) return false;
    const controlling = values[field.dependsOn.fieldId];
    return controlling !== field.dependsOn.equals;
  }

  return (
    <div className="space-y-3">
      {schema.fields.map((field) => {
        if (isGatedOff(field)) return null;
        const error = translateFieldError(localErrors[field.id]);
        return (
          <div key={field.id}>
            {renderField(field, values[field.id] ?? null, setField, identityId, roleLabel)}
            {error && (
              <p className="mt-1 text-caption text-error" role="alert">{error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderField(
  field: FieldSpec,
  value: AnswerValue | null | undefined,
  setField: (id: string, next: AnswerValue | null) => void,
  identityId: string | null | undefined,
  roleLabel: string
) {
  switch (field.kind) {
    case 'text':
      return (
        <>
          <Field
            label={field.label}
            helper={field.helper}
            value={typeof value === 'string' ? value : ''}
            maxLength={field.maxLen}
            onChange={(e) => setField(field.id, e.target.value)}
          />
          {field.suggest && (
            <SlmSuggestChip
              identityId={identityId}
              field={field}
              roleLabel={roleLabel}
              currentValue={typeof value === 'string' ? value : null}
              onAccept={(v) => setField(field.id, v)}
            />
          )}
        </>
      );
    case 'longtext':
      return (
        <>
          <div>
            <label className="block text-caption font-semibold text-text">{field.label}</label>
            {field.helper && <p className="text-caption text-text-muted">{field.helper}</p>}
            <textarea
              value={typeof value === 'string' ? value : ''}
              maxLength={field.maxLen ?? 240}
              onChange={(e) => setField(field.id, e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-body"
              rows={3}
            />
          </div>
          {field.suggest && (
            <SlmSuggestChip
              identityId={identityId}
              field={field}
              roleLabel={roleLabel}
              currentValue={typeof value === 'string' ? value : null}
              onAccept={(v) => setField(field.id, v)}
            />
          )}
        </>
      );
    case 'select':
      return (
        <div>
          <label className="block text-caption font-semibold text-text">{field.label}</label>
          {field.helper && <p className="text-caption text-text-muted">{field.helper}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {(field.options ?? []).map((opt) => {
              const active = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setField(field.id, active ? null : opt.value)}
                  className={
                    'rounded-full border px-3 py-1 text-caption ' +
                    (active
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text hover:border-primary')
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'multiselect': {
      const current = Array.isArray(value) ? value : [];
      const cap = field.max ?? 16;
      return (
        <div>
          <label className="block text-caption font-semibold text-text">{field.label}</label>
          {field.helper && <p className="text-caption text-text-muted">{field.helper}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {(field.options ?? []).map((opt) => {
              const active = current.includes(opt.value);
              const atCap = !active && current.length >= cap;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={atCap}
                  onClick={() => {
                    const next = active ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                    setField(field.id, next);
                  }}
                  className={
                    'rounded-full border px-3 py-1 text-caption ' +
                    (active
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text hover:border-primary disabled:opacity-50')
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'boolean':
      return (
        <div className="flex items-start gap-2">
          <input
            id={`field-${field.id}`}
            type="checkbox"
            checked={value === true}
            onChange={(e) => setField(field.id, e.target.checked)}
            className="mt-1"
          />
          <label htmlFor={`field-${field.id}`} className="text-body text-text">
            {field.label}
            {field.helper && (
              <span className="block text-caption text-text-muted">{field.helper}</span>
            )}
          </label>
        </div>
      );
    case 'integer':
      return (
        <Field
          label={field.label}
          helper={field.helper}
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => {
            const s = e.target.value;
            if (s === '') { setField(field.id, null); return; }
            const n = Number(s);
            setField(field.id, Number.isFinite(n) ? Math.trunc(n) : null);
          }}
        />
      );
    default:
      return (
        <Card tone="warning">
          <p className="text-caption">Unknown field kind.</p>
        </Card>
      );
  }
}

// Re-exported so the renderer's tests can pin the visual contract.
export { Badge };
