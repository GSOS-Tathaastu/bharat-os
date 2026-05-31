import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Money } from './Money';

describe('Money', () => {
  it('formats paise as Indian-numbering rupees', () => {
    const { container } = render(<Money paise={12_000} />);
    // 12000 paise = Rs 120; en-IN currency format
    expect(container.textContent).toMatch(/₹120/);
  });

  it('uses Indian grouping for large numbers (₹1,00,000)', () => {
    const { container } = render(<Money paise={10_000_000} />);
    // 10,000,000 paise = Rs 1,00,000
    expect(container.textContent).toMatch(/1,00,000/);
  });

  it('shows a + prefix when showSign is true and positive', () => {
    const { container } = render(<Money paise={50_000} showSign />);
    expect(container.textContent).toMatch(/^\+/);
  });
});
