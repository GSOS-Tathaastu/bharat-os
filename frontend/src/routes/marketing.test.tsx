// Phase 13.6 — Marketing pages render smoke tests.
//
// Each page renders inside MemoryRouter. We assert key headings +
// shared nav are present + cross-links resolve to the right paths.

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';
import { HowItWorksPage } from './HowItWorksPage';
import { ForCitizensPage } from './ForCitizensPage';
import { ForSponsorsPage } from './ForSponsorsPage';

function renderWithRouter(node: React.ReactNode, initialEntry = '/about') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
}

describe('AboutPage', () => {
  it('renders the headline', () => {
    renderWithRouter(<AboutPage />, '/about');
    expect(
      screen.getByRole('heading', { level: 1, name: /India's first AI-native OS where YOU own your data/i })
    ).toBeInTheDocument();
  });

  it('exposes the marketing nav with all 4 links', () => {
    renderWithRouter(<AboutPage />, '/about');
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/how-it-works'
    );
    expect(within(nav).getByRole('link', { name: 'For citizens' })).toHaveAttribute(
      'href',
      '/for-citizens'
    );
    expect(within(nav).getByRole('link', { name: 'For sponsors' })).toHaveAttribute(
      'href',
      '/for-sponsors'
    );
  });

  it('renders a "Try the demo" CTA pointing at root', () => {
    renderWithRouter(<AboutPage />, '/about');
    const ctas = screen.getAllByRole('link', { name: /Try the demo/i });
    // There may be one in the nav and one in the body.
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/');
    }
  });
});

describe('HowItWorksPage', () => {
  it('renders the six-substrate section', () => {
    renderWithRouter(<HowItWorksPage />, '/how-it-works');
    expect(
      screen.getByRole('heading', { level: 1, name: /On-device by default/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/The six substrates/i)).toBeInTheDocument();
    // Spot-check the SLM-H, citizen-data, sponsor-marketplace substrate cards
    // via getAllByText since some labels appear in multiple places (e.g.
    // "Citizen data marketplace" appears in the §17 card title AND in the
    // ForSponsorsPage cross-link text).
    expect(screen.getAllByText(/Skill agents for Indian paperwork tasks/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Citizen data marketplace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Worker marketplace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Provider marketplace/i).length).toBeGreaterThan(0);
  });

  it('renders the 5 §15 privacy invariants', () => {
    renderWithRouter(<HowItWorksPage />, '/how-it-works');
    expect(screen.getAllByText(/Pointer-not-payload audit ledger/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Strict allowlist/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DPDP §12 cascade/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Signed-consent for every cross-boundary read/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Allowlisted external launchers/i).length).toBeGreaterThan(0);
  });
});

describe('ForCitizensPage', () => {
  it('renders the three modes (Use / Earn / Provide)', () => {
    renderWithRouter(<ForCitizensPage />, '/for-citizens');
    expect(screen.getByRole('heading', { level: 1, name: /You own your data/i })).toBeInTheDocument();
    // The three mode cards.
    expect(screen.getAllByText(/Use/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Earn/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Provide/i).length).toBeGreaterThan(0);
  });

  it('lists all 5 data point kinds', () => {
    renderWithRouter(<ForCitizensPage />, '/for-citizens');
    expect(screen.getAllByText(/Intent prompts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Document summaries/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PII-redacted text/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Skill-agent runs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Federated learning contributions/i).length).toBeGreaterThan(0);
  });

  it('mentions Sahayak for the no-smartphone path', () => {
    renderWithRouter(<ForCitizensPage />, '/for-citizens');
    // "Sahayak" appears multiple times — card title + body copy.
    expect(screen.getAllByText(/Sahayak/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/700 million Indians don't have a usable smartphone/i)).toBeInTheDocument();
  });
});

describe('ForSponsorsPage', () => {
  it('renders the three sponsor surfaces (labeling / federated / citizen data)', () => {
    renderWithRouter(<ForSponsorsPage />, '/for-sponsors');
    expect(
      screen.getByRole('heading', { level: 1, name: /Train and evaluate models on real Indian data/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Labeling marketplace/i)).toBeInTheDocument();
    expect(screen.getByText(/Federated learning rounds/i)).toBeInTheDocument();
    expect(screen.getByText(/Citizen data marketplace/i)).toBeInTheDocument();
  });

  it('mentions DPDP + RBI compliance posture', () => {
    renderWithRouter(<ForSponsorsPage />, '/for-sponsors');
    expect(screen.getByText(/DPDP Act 2023/i)).toBeInTheDocument();
    expect(screen.getByText(/RBI \/ NPCI/i)).toBeInTheDocument();
  });
});
