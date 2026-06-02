// Phase 2a.0 — useBeforeInstallPrompt hook.
//
// Captures the Chromium `beforeinstallprompt` event so we can
// fire `.prompt()` from a user gesture (browser policy: only on
// engagement-triggered taps, not on page load). Also surfaces an
// "isInstalled" signal from `display-mode: standalone` so the
// install banner hides once the user has installed.
//
// iOS Safari doesn't fire beforeinstallprompt. The hook returns
// `platform: 'ios-safari'` in that case so the InstallPwaBanner
// can render iOS-specific instructions ("Tap Share → Add to
// Home Screen").

import { useCallback, useEffect, useRef, useState } from 'react';

export type PwaPlatform = 'chromium' | 'ios-safari' | 'unsupported';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaInstallState {
  /** True when an install prompt is available to fire. */
  canPrompt: boolean;
  /** True once `display-mode: standalone` matches OR user dismissed. */
  isInstalled: boolean;
  /** Detected platform shape. */
  platform: PwaPlatform;
  /** Fire the install prompt. No-op if !canPrompt. Returns user outcome. */
  prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

function detectPlatform(): PwaPlatform {
  if (typeof navigator === 'undefined') return 'unsupported';
  const ua = navigator.userAgent || '';
  // iOS Safari — iOS UA with WebKit but not Chrome/CriOS.
  const isIos = /iPhone|iPad|iPod/.test(ua) && !(/CriOS|FxiOS|EdgiOS/.test(ua));
  if (isIos) return 'ios-safari';
  // Heuristic: if BeforeInstallPrompt-supporting Chromium present.
  // We don't actually KNOW the prompt will fire until the event
  // arrives, but Android Chrome / Edge / Samsung Browser all
  // implement it.
  if (/Chrome|CriOS|EdgA?|Edg|Samsung/.test(ua)) return 'chromium';
  return 'unsupported';
}

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch {
      // matchMedia not implemented in some jsdom setups; fall through.
    }
  }
  // iOS Safari uses non-standard navigator.standalone.
  const navStandalone = (navigator as unknown as { standalone?: boolean }).standalone;
  if (typeof navStandalone === 'boolean') return navStandalone;
  return false;
}

export function usePwaInstall(): PwaInstallState {
  const [canPrompt, setCanPrompt] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    detectStandaloneMode()
  );
  const [platform] = useState<PwaPlatform>(() => detectPlatform());
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      eventRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    }
    function handleAppInstalled() {
      eventRef.current = null;
      setCanPrompt(false);
      setIsInstalled(true);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const prompt = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    const ev = eventRef.current;
    if (!ev) return 'unavailable';
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      eventRef.current = null;
      setCanPrompt(false);
      if (choice.outcome === 'accepted') setIsInstalled(true);
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  return { canPrompt, isInstalled, platform, prompt };
}
