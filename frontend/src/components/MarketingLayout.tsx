// Phase 13.6 — MarketingLayout
//
// Shared header + footer + nav for the public marketing pages.
// Distinct from the app surface: no identity gate, no auth state.
// Investors / candidates / partners landing on /about, /how-it-works,
// /for-citizens, /for-sponsors don't need a Bharat OS persona.
//
// Marketing routes are SEO-friendly (every section uses semantic
// HTML tags, headings are level-correct, links are real <a> tags
// for in-page anchors and react-router <Link> for in-app
// navigation).

import { type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/for-citizens', label: 'For citizens' },
  { to: '/for-sponsors', label: 'For sponsors' }
];

interface MarketingLayoutProps {
  children: ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-heading font-semibold text-text">
            <span className="rounded-sm bg-primary px-2 py-0.5 text-white">Bharat</span>
            <span>OS</span>
          </Link>
          <nav
            aria-label="Marketing site navigation"
            className="flex flex-wrap items-center gap-3 text-body"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  'rounded-sm px-2 py-1 transition-colors ' +
                  (isActive
                    ? 'bg-trust-50 text-trust-700 font-semibold'
                    : 'text-text-muted hover:text-text')
                }
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to="/"
              className="rounded-sm bg-primary px-3 py-1 text-white font-semibold hover:bg-primary-700"
            >
              Try the demo
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <footer className="mt-12 border-t border-border bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-caption text-text-muted">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 font-semibold text-text">Bharat OS</p>
              <p>
                India-first AI-native OS. Citizens own and monetize their data;
                workers earn from labelling, federated training, and compute
                serving; providers serve via a native marketplace.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-text">Explore</p>
              <ul className="space-y-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="hover:text-text">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-text">Posture</p>
              <ul className="space-y-1">
                <li>On-device inference (no data leaves your device)</li>
                <li>DPDP §12 compliant by construction</li>
                <li>Pointer-not-payload audit ledger (§15)</li>
                <li>Strict-allowlist boundary normalisers</li>
                <li>
                  Open-source under{' '}
                  <a
                    href="https://www.apache.org/licenses/LICENSE-2.0"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    Apache 2.0
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-4 border-t border-border pt-3">
            Bharat OS is an India-first AI-native OS in active development.
            Current state: investor pitch MVP. Source code licensed under{' '}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Apache License 2.0
            </a>
            .{' '}
            {pathname !== '/' && (
              <Link to="/" className="text-primary hover:underline">
                Try the demo
              </Link>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
