// Phase 13.1 — shared cooldown countdown ticker.
//
// Renders a live-decrementing "retry in Xs" caption that updates
// every 1s from the wall-clock `cooldownUntil` deadline. When the
// deadline elapses, renders nothing (the host hook flips status
// back to 'ready' independently via its own setTimeout, so the
// chip's button re-enables in parallel).
//
// Used by SLM-F PII redactor; the same shape can be lifted to
// SLM-D booking advisor + SLM-E doc summariser when those phases
// migrate from frozen-snapshot cooldown labels.

import { useEffect, useState } from 'react';

interface CooldownCountdownProps {
  /** Wall-clock deadline (ms since epoch). Cooldown ends when Date.now() >= cooldownUntil. */
  cooldownUntil: number;
  /** Optional prefix; default 'Cooling down — retry in '. */
  prefix?: string;
}

export function CooldownCountdown({
  cooldownUntil,
  prefix = 'Cooling down — retry in '
}: CooldownCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const remaining = Math.max(0, cooldownUntil - now);
  if (remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  return (
    <span className="text-caption text-orange-700">
      {prefix}
      {seconds}s.
    </span>
  );
}
