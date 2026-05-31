import type { LabelingJobFull } from '@/lib/hooks';

interface LabelValueViewerProps {
  taskKind: LabelingJobFull['taskKind'];
  value: unknown;
}

// Phase 12.0.5 — read-only renderer for sponsor review-queue
// submissions. Each task kind has a different `labelValue` shape;
// we try to render meaningfully, fall back to JSON.

export function LabelValueViewer({ taskKind, value }: LabelValueViewerProps) {
  if (value == null || typeof value !== 'object') {
    return <pre className="font-mono text-caption">{JSON.stringify(value)}</pre>;
  }
  const obj = value as Record<string, unknown>;
  switch (taskKind) {
    case 'preference_pair':
      return (
        <p className="text-body">
          Picked: <span className="font-mono font-semibold">{String(obj.choice ?? '?')}</span>
        </p>
      );
    case 'classification':
      return (
        <p className="text-body">
          Value: <span className="font-mono font-semibold">{String(obj.value ?? '?')}</span>
        </p>
      );
    case 'span_annotation': {
      const indices = Array.isArray(obj.wordIndices) ? obj.wordIndices : [];
      return (
        <p className="text-body">
          Words selected: <span className="font-mono">[{indices.join(', ')}]</span>
          {obj.labelKind ? <> · <span className="font-mono">{String(obj.labelKind)}</span></> : null}
        </p>
      );
    }
    case 'transcription':
      return (
        <p className="text-body whitespace-pre-wrap">
          {String(obj.transcript ?? '')}
        </p>
      );
    case 'safety_label': {
      const values = Array.isArray(obj.values) ? obj.values : [];
      return (
        <p className="text-body">
          Flags:{' '}
          {values.length === 0 ? (
            <span className="font-mono text-text-muted">(none — marked safe)</span>
          ) : (
            <span className="font-mono">{values.join(', ')}</span>
          )}
        </p>
      );
    }
    default:
      return (
        <pre className="max-h-32 overflow-auto rounded-sm bg-surface-2 p-2 font-mono text-caption">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
  }
}
