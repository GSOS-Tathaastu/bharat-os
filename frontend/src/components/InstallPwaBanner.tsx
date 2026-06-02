// Phase 2a.0 — InstallPwaBanner.
//
// A small, dismissible banner that appears when the page can offer
// the user an "Install Bharat OS" experience. Three branches:
//
//   • Chromium (Android Chrome / Edge / Samsung) with a fired
//     beforeinstallprompt → renders an "Install Bharat OS" button
//     that fires the native install prompt.
//   • iOS Safari → renders iOS-specific instructions ("Tap Share
//     → Add to Home Screen"). iOS doesn't surface a programmatic
//     install API.
//   • Anywhere already-installed (display-mode: standalone) →
//     the banner stays hidden.
//
// Dismissal persists in localStorage so the citizen isn't nagged
// every page load. They can re-enable from /app/settings if we
// add a "reset install prompt" affordance later (deferred).

import { useEffect, useState } from 'react';
import { usePwaInstall } from '@/lib/use-pwa-install';

const DISMISS_KEY = 'bos:pwa-install-banner-dismissed-at';
const DISMISS_COOLDOWN_DAYS = 7;

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isDismissedFresh(): boolean {
  const at = readDismissedAt();
  if (at === null) return false;
  const ageMs = Date.now() - at;
  return ageMs < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

function persistDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage might be disabled — banner re-shows next page load.
  }
}

export function InstallPwaBanner() {
  const { canPrompt, isInstalled, platform, prompt } = usePwaInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedFresh());

  // Recompute dismissal on mount in case localStorage state changed
  // in another tab.
  useEffect(() => {
    setDismissed(isDismissedFresh());
  }, []);

  if (isInstalled) return null;
  if (dismissed) return null;

  const isChromiumPromptReady = platform === 'chromium' && canPrompt;
  const isIos = platform === 'ios-safari';

  // For "unsupported" desktop browsers (Firefox desktop, Safari
  // desktop) we don't render — the value of a banner is low and
  // the noise cost is high.
  if (!isChromiumPromptReady && !isIos) return null;

  function handleDismiss() {
    persistDismissal();
    setDismissed(true);
  }

  async function handleInstall() {
    await prompt();
    // Whatever the outcome, persist dismissal so we don't re-show
    // for the cooldown window. A successful install will set
    // isInstalled → returns null branch above anyway.
    persistDismissal();
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="Install Bharat OS"
      data-testid="install-pwa-banner"
      className="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-xl rounded-md border border-primary bg-white p-3 shadow-md sm:bottom-4 sm:left-4 sm:right-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-body font-semibold text-text">
            Install Bharat OS on this device
          </p>
          {isChromiumPromptReady && (
            <p className="mt-1 text-caption text-text-muted">
              Adds a launcher icon, opens like a native app, works offline
              for on-device features.
            </p>
          )}
          {isIos && (
            <p className="mt-1 text-caption text-text-muted">
              On iPhone: tap{' '}
              <span aria-hidden="true">⎋</span>{' '}
              <strong>Share</strong> in Safari, then <strong>Add to Home
              Screen</strong>. Opens like a native app, works offline for
              on-device features.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
          className="rounded-sm border border-border bg-surface px-2 py-1 text-caption text-text-muted hover:text-text"
        >
          Not now
        </button>
      </div>
      {isChromiumPromptReady && (
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 w-full rounded-sm bg-primary px-4 py-2 text-white font-semibold hover:bg-primary-700"
        >
          Install Bharat OS
        </button>
      )}
    </div>
  );
}
