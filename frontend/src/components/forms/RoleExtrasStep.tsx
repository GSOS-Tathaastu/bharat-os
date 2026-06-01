// Phase 12.2.4 — Per-role extras wizard step.
//
// Composes:
//   - per-role text/date/phone/integer fields rendered via simple
//     Field inputs (the existing DynamicForm substrate is overkill
//     here — the per-role schemas are static + the field kinds
//     diverge from FIELD_KINDS).
//   - per-role required attachment slots rendered via PhotoCapture
//     with acceptMode='image+pdf' for document scans.
//
// The wizard's parent holds the FormState and passes values +
// attachmentIds in. This component is purely controlled.

import { Card, Field, Badge } from '@/components/ui';
import { PhotoCapture } from './PhotoCapture';
import {
  validateRoleExtrasClientSide,
  type RoleExtrasSchema,
  type RoleExtrasFieldSpec
} from '@/lib/role-extras-schema';
import type { AttachmentMeta } from '@/lib/use-attachment-upload';

interface Props {
  role: string;
  identityId: string;
  schema: RoleExtrasSchema;
  values: Record<string, string>;
  attachmentIds: Record<string, string>;
  onValueChange: (id: string, next: string) => void;
  onAttachmentUploaded: (kind: string, meta: AttachmentMeta) => void;
}

function inputModeFor(spec: RoleExtrasFieldSpec) {
  switch (spec.kind) {
    case 'integer':
    case 'phone':
      return 'numeric' as const;
    default:
      return undefined;
  }
}

function placeholderFor(spec: RoleExtrasFieldSpec) {
  switch (spec.kind) {
    case 'date':
      return 'YYYY-MM-DD';
    case 'phone':
      return '9876543210';
    case 'integer':
      return '0';
    default:
      return '';
  }
}

export function RoleExtrasStep({
  role,
  identityId,
  schema,
  values,
  attachmentIds,
  onValueChange,
  onAttachmentUploaded
}: Props) {
  // Phase 12.2.4 fix UX-1 — paint EVERY failing field, not just
  // the first. Citizens fixing a date no longer have to wait
  // to see the bad phone underneath.
  const check = validateRoleExtrasClientSide(schema, values);
  const errorCount = Object.keys(check.fieldErrors).length;
  const fieldError = (id: string): string | undefined => check.fieldErrors[id];

  return (
    <div className="space-y-3">
      <Card title="Role-specific verification">
        <p className="mb-2 text-body text-text-muted">
          Quick details an operator will cross-check with your
          documents below.
        </p>
        <p className="mb-3 text-caption text-text-muted">
          Role: <strong>{role}</strong>
        </p>
        {errorCount > 0 && (
          <p className="mb-3 rounded-md border border-error/30 bg-error/5 p-2 text-caption text-error">
            {errorCount === 1
              ? '1 field needs attention.'
              : `${errorCount} fields need attention.`}
          </p>
        )}

        {schema.required.map((spec) => (
          <Field
            key={spec.id}
            label={spec.label + ' *'}
            placeholder={placeholderFor(spec)}
            inputMode={inputModeFor(spec)}
            value={values[spec.id] ?? ''}
            onChange={(e) => onValueChange(spec.id, e.target.value)}
            error={fieldError(spec.id)}
            maxLength={spec.maxLen}
            containerClassName="mt-3"
          />
        ))}
        {schema.optional.length > 0 && (
          <p className="mt-4 mb-1 text-caption font-semibold text-text-muted">
            Optional (helps the operator review faster)
          </p>
        )}
        {schema.optional.map((spec) => (
          <Field
            key={spec.id}
            label={spec.label}
            placeholder={placeholderFor(spec)}
            inputMode={inputModeFor(spec)}
            value={values[spec.id] ?? ''}
            onChange={(e) => onValueChange(spec.id, e.target.value)}
            error={fieldError(spec.id)}
            maxLength={spec.maxLen}
            containerClassName="mt-3"
          />
        ))}
      </Card>

      <Card title="Required documents">
        <p className="text-body text-text-muted">
          Photo or PDF for each. Photos are flagged for EXIF; the
          operator strips before forwarding.
        </p>
        {schema.requiredAttachments.map((slot) => (
          <div key={slot.kind} className="mt-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-body font-semibold text-text">{slot.label}</span>
              {attachmentIds[slot.kind] && <Badge variant="trust">Captured</Badge>}
            </div>
            <PhotoCapture
              identityId={identityId}
              kind={slot.kind}
              acceptMode={slot.acceptMode}
              helper={slot.helper}
              existingAttachmentId={attachmentIds[slot.kind] || null}
              onUploaded={(meta) => onAttachmentUploaded(slot.kind, meta)}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}
