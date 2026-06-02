// Phase 2a.0 — InstallPwaBanner render tests.
//
// We don't drive the full beforeinstallprompt flow here (covered
// by usePwaInstall.test.ts). We assert:
//   - Already-installed → no banner.
//   - Fresh dismissal (localStorage) → no banner.
//   - iOS Safari UA → renders the iOS instructions branch.
//   - Chromium UA pre-install → renders the unsupported / waiting
//     branch (no banner since no event fired yet).

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstallPwaBanner } from './InstallPwaBanner';

const originalUserAgent = Object.getOwnPropertyDescriptor(
  window.navigator,
  'userAgent'
);
const originalStandalone = (
  Object.getOwnPropertyDescriptor(window.navigator, 'standalone') as
    | PropertyDescriptor
    | undefined
)?.value;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    get: () => ua
  });
}

function setNavigatorStandalone(value: boolean | undefined) {
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value,
    writable: true
  });
}

describe('InstallPwaBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    setNavigatorStandalone(undefined);
  });

  afterEach(() => {
    if (originalUserAgent) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgent);
    }
    setNavigatorStandalone(originalStandalone);
  });

  it('renders nothing when navigator.standalone is true (iOS installed)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    setNavigatorStandalone(true);
    const { container } = render(<InstallPwaBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders iOS instructions on iPhone Safari', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    render(<InstallPwaBanner />);
    expect(screen.getByTestId('install-pwa-banner')).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it('does not render on unsupported desktop browsers', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
    );
    const { container } = render(<InstallPwaBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('honors a fresh localStorage dismissal', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    localStorage.setItem('bos:pwa-install-banner-dismissed-at', String(Date.now()));
    const { container } = render(<InstallPwaBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('re-shows after the 7-day dismissal cooldown expires', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'bos:pwa-install-banner-dismissed-at',
      String(eightDaysAgo)
    );
    render(<InstallPwaBanner />);
    expect(screen.getByTestId('install-pwa-banner')).toBeInTheDocument();
  });

  it('Not now button persists dismissal + hides the banner', async () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    const { container } = render(<InstallPwaBanner />);
    const btn = screen.getByRole('button', { name: /Dismiss install banner/i });
    await act(async () => {
      btn.click();
    });
    expect(container.innerHTML).toBe('');
    expect(localStorage.getItem('bos:pwa-install-banner-dismissed-at')).not.toBeNull();
  });
});
