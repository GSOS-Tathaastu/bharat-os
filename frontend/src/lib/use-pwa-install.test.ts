// Phase 2a.0 — usePwaInstall hook tests.
//
// We synthesize a beforeinstallprompt event by hand (jsdom doesn't
// fire one). The hook should:
//   - flip canPrompt to true after the event lands
//   - call .prompt() on the captured event when prompt() is fired
//   - clear canPrompt + capture isInstalled on accepted outcome
//   - detect display-mode: standalone as isInstalled at init time

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePwaInstall, type BeforeInstallPromptEvent } from './use-pwa-install';

class FakeBeforeInstallPromptEvent extends Event {
  readonly platforms = ['web'];
  promptCalls = 0;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  resolveChoice!: (outcome: 'accepted' | 'dismissed') => void;

  constructor() {
    super('beforeinstallprompt');
    this.userChoice = new Promise((resolve) => {
      this.resolveChoice = (outcome) => resolve({ outcome, platform: 'web' });
    });
  }

  async prompt() {
    this.promptCalls += 1;
  }
}

const originalUserAgent = Object.getOwnPropertyDescriptor(
  window.navigator,
  'userAgent'
);

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    get: () => ua
  });
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
  });

  afterEach(() => {
    if (originalUserAgent) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgent);
    }
  });

  it('detects chromium platform from Android Chrome UA', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.platform).toBe('chromium');
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('detects ios-safari platform from iPhone UA', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.platform).toBe('ios-safari');
  });

  it('flips canPrompt true after beforeinstallprompt fires', async () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(false);
    const event = new FakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it('prompt() fires the captured event + records accepted outcome', async () => {
    const { result } = renderHook(() => usePwaInstall());
    const event = new FakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(event);
    });

    let outcome: 'accepted' | 'dismissed' | 'unavailable' = 'unavailable';
    await act(async () => {
      event.resolveChoice('accepted');
      outcome = await result.current.prompt();
    });
    expect(outcome).toBe('accepted');
    expect(event.promptCalls).toBe(1);
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });

  it('prompt() returns "unavailable" when no event has fired', async () => {
    const { result } = renderHook(() => usePwaInstall());
    let outcome: 'accepted' | 'dismissed' | 'unavailable' = 'accepted';
    await act(async () => {
      outcome = await result.current.prompt();
    });
    expect(outcome).toBe('unavailable');
  });

  it('handles appinstalled event by setting isInstalled + clearing canPrompt', async () => {
    const { result } = renderHook(() => usePwaInstall());
    const beforeEvent = new FakeBeforeInstallPromptEvent();
    await act(async () => {
      window.dispatchEvent(beforeEvent);
    });
    expect(result.current.canPrompt).toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('returns null on dev builds without touching navigator', async () => {
    const { registerServiceWorker } = await import('./register-service-worker');
    const result = await registerServiceWorker({
      isProductionBuild: false
    });
    expect(result).toBeNull();
  });

  it('returns null when navigator lacks serviceWorker support', async () => {
    const { registerServiceWorker } = await import('./register-service-worker');
    const fakeNav = {} as unknown as Pick<Navigator, 'serviceWorker'>;
    const result = await registerServiceWorker({
      isProductionBuild: true,
      navigator: fakeNav,
      location: { protocol: 'https:', hostname: 'bharat-os.in' }
    });
    expect(result).toBeNull();
  });

  it('refuses to register over plain http (except localhost)', async () => {
    const { registerServiceWorker } = await import('./register-service-worker');
    const register = vi.fn();
    const fakeNav = {
      serviceWorker: { register, addEventListener: vi.fn() }
    } as unknown as Pick<Navigator, 'serviceWorker'>;
    await registerServiceWorker({
      isProductionBuild: true,
      navigator: fakeNav,
      location: { protocol: 'http:', hostname: 'bharat-os.in' }
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('registers on localhost over http', async () => {
    const { registerServiceWorker } = await import('./register-service-worker');
    const register = vi.fn(async () => ({
      addEventListener: vi.fn(),
      installing: null
    }));
    const fakeNav = {
      serviceWorker: { register }
    } as unknown as Pick<Navigator, 'serviceWorker'>;
    await registerServiceWorker({
      isProductionBuild: true,
      navigator: fakeNav,
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    expect(register).toHaveBeenCalledWith('/app/service-worker.js', { scope: '/app/' });
  });
});

// Make TypeScript happy about the event type used in this file even
// though we don't directly reference it (FakeBeforeInstallPromptEvent
// composes Event).
const _t: BeforeInstallPromptEvent | null = null;
void _t;
