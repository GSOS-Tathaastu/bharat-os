import { useState } from 'react';
import { Action, Badge, Card, Field } from '@/components/ui';
import { useGeolocationCapture, PROVIDER_CONSENT_COPY } from '@/lib/geolocation';
import { round4 } from '@/lib/geo';
import { LocationConsentSheet } from './LocationConsentSheet';
import { CityPickerSheet } from './CityPickerSheet';
import type { ServiceArea } from '@/lib/hooks';

// Phase 12.1a.1 — Provider-side ServiceAreaPicker.
//
// Captures the four fields the substrate validates: center
// (4dp ~11 m), radiusMeters (500..50000), summary (≤120 chars),
// source ('geolocation' | 'manual' | 'city-default'). Used in
// ProviderOnboarding; reusable in Phase 12.2 per-role wizards.
//
// Includes a plain-language safety warning: "Pick a landmark, NOT
// your home address" — a UX guard the design-judge panel flagged
// because solo women household-help workers have a sharper threat
// model than a citizen searcher.

interface ServiceAreaPickerProps {
  value: ServiceArea | null;
  onChange: (next: ServiceArea | null) => void;
}

const MIN_RADIUS_M = 500;
const MAX_RADIUS_M = 50000;
const DEFAULT_RADIUS_M = 5000;

export function ServiceAreaPicker({ value, onChange }: ServiceAreaPickerProps) {
  const [consentOpen, setConsentOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  // Provider-side capture wants ~11 m precision since they're
  // publishing themselves.
  const geo = useGeolocationCapture({ precision: 'fine' });

  // If geo.status flips to captured, push it into value.
  if (
    geo.status.kind === 'captured' &&
    (!value ||
      value.kind !== 'point-radius' ||
      value.center?.lat !== geo.status.result.lat ||
      value.center?.lng !== geo.status.result.lng ||
      value.source !== 'geolocation')
  ) {
    onChange({
      kind: 'point-radius',
      center: { lat: geo.status.result.lat, lng: geo.status.result.lng },
      radiusMeters: value?.kind === 'point-radius' ? value.radiusMeters : DEFAULT_RADIUS_M,
      summary: value?.kind === 'point-radius' ? value.summary ?? null : null,
      source: 'geolocation',
      capturedAt: geo.status.result.capturedAt
    });
  }

  const current = value?.kind === 'point-radius' ? value : null;
  const radius = current?.radiusMeters ?? DEFAULT_RADIUS_M;

  function updatePointRadius(patch: Partial<Extract<ServiceArea, { kind: 'point-radius' }>>) {
    if (!current) return;
    onChange({ ...current, ...patch });
  }

  return (
    <Card title="Where can citizens find you?">
      <div className="space-y-3">
        {/* UX-2 (adversarial review) — legacy-summary migration warning
            renders at the TOP so providers returning to an old draft
            see immediately that action is required, before they touch
            the form. Without geo, they cannot appear in nearby search. */}
        {value && value.kind === 'legacy-summary' && (
          <Card tone="warning">
            <p className="text-body">
              <span className="font-semibold">Your saved area is from before the map upgrade:</span>{' '}
              &ldquo;{value.summary}&rdquo;. Set a pinned location below — without
              it, your profile will not appear in nearby searches.
            </p>
          </Card>
        )}

        <p className="text-body text-text-muted">
          Pick a landmark near where you usually work — like a station,
          market, or main road. <span className="font-semibold">Not your home address.</span>{' '}
          Citizens browsing nearby will see a rough area (about 1 km
          accurate), never your exact pin.
        </p>

        <div className="flex flex-wrap gap-2">
          <Action variant="ghost" onClick={() => setConsentOpen(true)}>
            Use my current location
          </Action>
          <Action variant="ghost" onClick={() => setCityOpen(true)}>
            Pick a city
          </Action>
        </div>

        {geo.status.kind === 'denied' && (
          <Card tone="warning">
            <p className="text-body">{geo.status.reason}</p>
          </Card>
        )}
        {geo.status.kind === 'unavailable' && (
          <Card tone="warning">
            <p className="text-body">{geo.status.reason}</p>
          </Card>
        )}

        {current && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="trust">
                Pin: {current.center.lat.toFixed(4)}, {current.center.lng.toFixed(4)}
              </Badge>
              <Badge variant="neutral">
                Source: {current.source === 'geolocation' ? 'Live location' :
                  current.source === 'city-default' ? 'City centroid' : 'Manual'}
              </Badge>
            </div>
            <Field
              label={`Service radius (${Math.round(radius / 1000)} km)`}
              type="range"
              min={MIN_RADIUS_M}
              max={MAX_RADIUS_M}
              step={500}
              value={radius}
              onChange={(e) => updatePointRadius({ radiusMeters: Math.trunc(Number(e.target.value)) })}
              helper={`Citizens within ${Math.round(radius / 1000)} km will see you in their list.`}
            />
            <Field
              label="Area label (optional)"
              value={current.summary ?? ''}
              onChange={(e) => updatePointRadius({ summary: e.target.value.slice(0, 120) })}
              placeholder="Eg: Near Shivajinagar bus stand"
              helper="Shown next to your pin. Max 120 characters."
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-caption text-text-muted underline"
            >
              Clear pin
            </button>
          </>
        )}

      </div>

      <LocationConsentSheet
        open={consentOpen}
        copy={PROVIDER_CONSENT_COPY}
        onUseLocation={() => {
          setConsentOpen(false);
          geo.capture();
        }}
        onPickCity={() => {
          setConsentOpen(false);
          setCityOpen(true);
        }}
        onClose={() => setConsentOpen(false)}
      />

      <CityPickerSheet
        open={cityOpen}
        onClose={() => setCityOpen(false)}
        onPickCity={(city) => {
          setCityOpen(false);
          onChange({
            kind: 'point-radius',
            center: { lat: round4(city.lat)!, lng: round4(city.lng)! },
            radiusMeters: city.defaultRadiusMeters,
            summary: city.label,
            source: 'city-default',
            capturedAt: new Date().toISOString()
          });
        }}
      />
    </Card>
  );
}
