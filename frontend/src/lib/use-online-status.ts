// Phase 12.1b.2 — Online/offline detection hook.
//
// Hybrid signal: navigator.onLine + window 'online'/'offline'
// events + a HEAD /api/health probe ONLY while offline (catches
// captive portals lying that we have connectivity). No service-
// worker fetch interception — the /app/ SW carveout (no /api/*
// caching, §15 audit-ledger compliance) is preserved.

import { useEffect, useState } from 'react';

export type OnlineState = 'online' | 'offline' | 'probing';

interface UseOnlineStatusOptions {
  // Polling interval (ms) for the captive-portal probe while
  // offline. Default 30s.
  probeIntervalMs?: number;
  // Endpoint to probe. Default /api/health.
  probeEndpoint?: string;
}

export function useOnlineStatus({ probeIntervalMs = 30_000, probeEndpoint = '/api/health' }: UseOnlineStatusOptions = {}) {
  const initial = typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline';
  const [state, setState] = useState<OnlineState>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function setOnline() {
      setState('online');
    }
    function setOffline() {
      setState('offline');
    }
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  // Captive-portal probe — only runs while offline. A successful
  // probe flips state to online; failures keep it offline.
  useEffect(() => {
    if (state !== 'offline') return;
    let cancelled = false;
    async function probe() {
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 4_000);
        const r = await fetch(probeEndpoint, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
        window.clearTimeout(t);
        if (!cancelled && r.ok) setState('online');
      } catch {
        // stay offline
      }
    }
    void probe();
    const id = window.setInterval(probe, probeIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state, probeEndpoint, probeIntervalMs]);

  return { state, isOnline: state === 'online', isOffline: state === 'offline' };
}

// Pure-logic helper exported for vitest: given the navigator
// online state + the last fetch outcome, return the resolved
// state.
export function resolveOnlineState({
  navigatorOnline,
  lastFetchWasNetworkError
}: {
  navigatorOnline: boolean;
  lastFetchWasNetworkError: boolean;
}): OnlineState {
  if (!navigatorOnline) return 'offline';
  if (lastFetchWasNetworkError) return 'offline';
  return 'online';
}
