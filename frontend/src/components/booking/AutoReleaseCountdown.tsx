import { useEffect, useState } from 'react';

// Phase 12.1a.2 — Visual countdown for the 24h auto-release
// window. Pure client clock; the server is the source of truth.
// Rendered inside provider_marked_complete BookingCard so the
// citizen sees "Auto-releases in 6h 12m if you don't confirm or
// dispute."

const WINDOW_MS = 24 * 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'auto-released soon';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function AutoReleaseCountdown({ providerCompletedAt }: { providerCompletedAt: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!providerCompletedAt) return null;
  const startedMs = Date.parse(providerCompletedAt);
  if (!Number.isFinite(startedMs)) return null;
  const remaining = WINDOW_MS - (now - startedMs);
  return (
    <p className="text-caption text-text-muted">
      Auto-releases in {formatRemaining(remaining)} if you don&rsquo;t confirm or dispute.
    </p>
  );
}
