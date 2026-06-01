import { useState } from 'react';
import { Badge } from '@/components/ui';
import { useSlmFieldSuggest } from '@/lib/use-slm-field-suggest';
import type { FieldSpec } from '@/lib/dynamic-form';

// Phase 12.1b.3 — SLM Suggest chip.
//
// Rendered below text/longtext fields with a `suggest.promptHint`
// in their schema. Hidden when no SLM is installed (binding:
// honest empty state, no upsell). When the provider taps the
// chip, the wllama runtime generates a one-line suggestion and
// renders it inline with "Use this" / "Dismiss" actions. The
// provider's tap is the ONLY way the input value mutates — we
// never auto-fill.

interface SlmSuggestChipProps {
  identityId: string | null | undefined;
  field: FieldSpec;
  roleLabel: string;
  currentValue: string | null;
  onAccept: (value: string) => void;
}

export function SlmSuggestChip({ identityId, field, roleLabel, currentValue, onAccept }: SlmSuggestChipProps) {
  const { status, suggest, hasSlm } = useSlmFieldSuggest({ identityId });
  const [preview, setPreview] = useState<string | null>(null);

  if (!hasSlm) return null;
  if (!field.suggest) return null;
  if (field.kind !== 'text' && field.kind !== 'longtext') return null;

  async function handleClick() {
    setPreview(null);
    const result = await suggest({ field, roleLabel, currentValue });
    if (result?.suggestion) setPreview(result.suggestion);
  }

  const busy = status.kind === 'loading' || status.kind === 'generating';
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || status.kind === 'cooling-down'}
        className="rounded-sm border border-primary bg-primary-50 px-2 py-0.5 text-caption font-semibold text-primary transition-colors hover:bg-primary-100 disabled:opacity-50"
      >
        {status.kind === 'loading'
          ? 'Loading model…'
          : status.kind === 'generating'
            ? 'Thinking…'
            : status.kind === 'cooling-down'
              ? `Cooling down (${Math.ceil(status.retryInMs / 1000)}s)`
              : '✨ Suggest with my SLM'}
      </button>
      {status.kind === 'unavailable' && status.reason !== 'no_install' && (
        <span className="text-caption text-text-muted">
          On-device model unavailable: {status.reason}
        </span>
      )}
      {preview && (
        <Badge variant="trust">
          <button
            type="button"
            onClick={() => { onAccept(preview); setPreview(null); }}
            className="font-semibold"
          >
            Use this: &ldquo;{preview}&rdquo;
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="ml-2 underline opacity-80"
          >
            Dismiss
          </button>
        </Badge>
      )}
    </div>
  );
}
