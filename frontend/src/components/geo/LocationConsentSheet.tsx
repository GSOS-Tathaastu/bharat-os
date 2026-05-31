import { Action, Card, Sheet } from '@/components/ui';

// Phase 12.1a.1 — One-shot location consent Sheet.
//
// Renders BEFORE we call navigator.geolocation.getCurrentPosition,
// in verbatim language explaining what we'll do with the value
// (round to ~11 km, never store, never share with providers).
// Reusable: pass `copy` to use the same Sheet for citizen browse
// (LOCATION_CONSENT_COPY) and provider self-publish
// (PROVIDER_CONSENT_COPY).

export interface LocationConsentCopy {
  title: string;
  body: string;
  useButton: string;
  cityButton: string;
  cancelButton: string;
}

interface LocationConsentSheetProps {
  open: boolean;
  onUseLocation: () => void;
  onPickCity: () => void;
  onClose: () => void;
  copy: LocationConsentCopy;
  showCityFallback?: boolean;
  // PRIV-5 (adversarial review) — optional "don't ask again this
  // session" affordance. When provided, renders alongside cancel.
  onDontAskAgain?: () => void;
  dontAskAgainLabel?: string;
}

export function LocationConsentSheet({
  open,
  onUseLocation,
  onPickCity,
  onClose,
  copy,
  showCityFallback = true,
  onDontAskAgain,
  dontAskAgainLabel = "Don't ask again"
}: LocationConsentSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <div className="space-y-3">
        <Card tone="trust">
          <p className="text-body">{copy.body}</p>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Action onClick={onUseLocation}>{copy.useButton}</Action>
          {showCityFallback && (
            <Action variant="ghost" onClick={onPickCity}>
              {copy.cityButton}
            </Action>
          )}
          {onDontAskAgain && (
            <Action variant="ghost" onClick={onDontAskAgain}>
              {dontAskAgainLabel}
            </Action>
          )}
          <Action variant="ghost" onClick={onClose}>
            {copy.cancelButton}
          </Action>
        </div>
      </div>
    </Sheet>
  );
}
