// Phase 13.6.1 — OnDeviceInferenceAnimation smoke test.
//
// We don't drive the full streaming tween (timing is illustrative
// + non-deterministic across CI runners). We assert the component
// mounts, exposes an a11y label calling itself an illustration,
// and labels its source as /labs so we never claim it's a live
// model call.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnDeviceInferenceAnimation } from './OnDeviceInferenceAnimation';

describe('OnDeviceInferenceAnimation', () => {
  it('renders with an "illustration" a11y label', () => {
    render(<OnDeviceInferenceAnimation />);
    const node = screen.getByTestId('on-device-inference-animation');
    expect(node).toBeInTheDocument();
    expect(node.getAttribute('aria-label')).toMatch(/illustration/i);
  });

  it('names /labs as the source surface', () => {
    render(<OnDeviceInferenceAnimation />);
    expect(screen.getAllByText(/\/labs/).length).toBeGreaterThan(0);
  });
});
