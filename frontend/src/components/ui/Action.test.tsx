import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Action } from './Action';

describe('Action', () => {
  it('renders the label', () => {
    render(<Action>Cash out</Action>);
    expect(screen.getByRole('button', { name: 'Cash out' })).toBeInTheDocument();
  });

  it('applies the saffron primary class by default', () => {
    render(<Action>Send</Action>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary');
  });

  it('respects the trust variant', () => {
    render(<Action variant="trust">Verified</Action>);
    expect(screen.getByRole('button')).toHaveClass('bg-trust');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Action disabled>Disabled</Action>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
