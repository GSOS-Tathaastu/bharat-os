import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { SkillActionLink } from './SkillActionLink';
import { ACTION_LABEL } from '@/lib/skill-agent';

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('SkillActionLink — url branch', () => {
  it('renders an external anchor with rel="noopener noreferrer" + target="_blank"', () => {
    renderWithRouter(<SkillActionLink verb="file_dispute_consumer_forum" />);
    const link = screen.getByRole('link', { name: ACTION_LABEL.file_dispute_consumer_forum });
    expect(link).toHaveAttribute('href', 'https://consumerhelpline.gov.in/');
    expect(link).toHaveAttribute('target', '_blank');
    // The two MUST be set together — without noopener the new tab
    // could navigate the parent via window.opener.
    const rel = link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('renders the edaakhil URL for all three commission filings', () => {
    for (const verb of [
      'file_complaint_district_commission',
      'file_complaint_state_commission',
      'file_complaint_national_commission'
    ] as const) {
      const { unmount } = renderWithRouter(<SkillActionLink verb={verb} />);
      const link = screen.getByRole('link', { name: ACTION_LABEL[verb] });
      expect(link).toHaveAttribute('href', 'https://edaakhil.nic.in/');
      unmount();
    }
  });
});

describe('SkillActionLink — tel branch', () => {
  it('renders tel:1915 for escalate_to_consumer_helpline', () => {
    renderWithRouter(<SkillActionLink verb="escalate_to_consumer_helpline" />);
    const link = screen.getByRole('link', { name: /Call the National Consumer Helpline/ });
    expect(link).toHaveAttribute('href', 'tel:1915');
    expect(link.textContent).toContain('tap to dial 1915');
  });

  it('renders tel:155261 for contact_pm_kisan_helpline', () => {
    renderWithRouter(<SkillActionLink verb="contact_pm_kisan_helpline" />);
    const link = screen.getByRole('link', { name: /Call the PM-KISAN helpline/ });
    expect(link).toHaveAttribute('href', 'tel:155261');
  });
});

describe('SkillActionLink — in_app branch', () => {
  it('renders a react-router Link for archive_for_records', () => {
    renderWithRouter(<SkillActionLink verb="archive_for_records" />);
    const link = screen.getByRole('link', { name: ACTION_LABEL.archive_for_records });
    // react-router Link renders as <a href="/citizen/notes"> in DOM
    expect(link).toHaveAttribute('href', '/citizen/notes');
    // In-app links MUST NOT carry target="_blank" — they stay in
    // the SPA. A future regression adding target=_blank would lose
    // citizen context (new tab loads cold).
    expect(link).not.toHaveAttribute('target');
  });

});

describe('SkillActionLink — none branch', () => {
  it('renders plain text (no link) for informational verbs', () => {
    renderWithRouter(<SkillActionLink verb="request_meter_recheck" />);
    // No link role — only the label as plain text.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(ACTION_LABEL.request_meter_recheck)).toBeInTheDocument();
  });

  it('renders plain text for send_legal_notice (no recipient template yet)', () => {
    renderWithRouter(<SkillActionLink verb="send_legal_notice" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(ACTION_LABEL.send_legal_notice)).toBeInTheDocument();
  });
});
