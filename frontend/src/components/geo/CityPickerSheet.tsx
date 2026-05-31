import { useMemo, useState } from 'react';
import { Action, Badge, Field, Sheet } from '@/components/ui';
import { INDIA_CITIES, type CityCentroid } from '@/lib/geo';

// Phase 12.1a.1 — Shared city picker.
//
// Fallback for users who decline geolocation or whose browser
// doesn't expose it. Returns a CityCentroid the caller can use as
// the search origin (with the city's default radius). Tier-1
// cities (8–10 km defaults) sort above tier-2 (5 km defaults).
// Free-text filter narrows the list. Renders cities, not raw
// lat/lng — the user never sees coords.

interface CityPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPickCity: (city: CityCentroid) => void;
}

export function CityPickerSheet({ open, onClose, onPickCity }: CityPickerSheetProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return INDIA_CITIES;
    return INDIA_CITIES.filter(
      (c) => c.label.toLowerCase().includes(needle) || c.state.toLowerCase().includes(needle)
    );
  }, [query]);

  return (
    <Sheet open={open} onClose={onClose} title="Pick a city">
      <div className="space-y-3">
        <Field
          label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City or state name"
        />
        {filtered.length === 0 ? (
          <p className="text-body text-text-muted">
            No matching city. Try the state name.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => onPickCity(city)}
                  className="flex w-full items-center justify-between gap-2 py-3 text-left hover:bg-surface-muted"
                >
                  <div>
                    <p className="text-body font-semibold text-text">{city.label}</p>
                    <p className="text-caption text-text-muted">{city.state}</p>
                  </div>
                  <Badge variant="trust">
                    {city.tier === 1 ? 'Tier 1' : 'Tier 2'} ·{' '}
                    {Math.round(city.defaultRadiusMeters / 1000)} km radius
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Action variant="ghost" onClick={onClose}>
          Cancel
        </Action>
      </div>
    </Sheet>
  );
}
