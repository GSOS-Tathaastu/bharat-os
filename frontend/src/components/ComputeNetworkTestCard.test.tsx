// Phase 13.7.2 — render smoke + sha256Pointer helper tests.

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ComputeNetworkTestCard } from './ComputeNetworkTestCard';
import { sha256Pointer } from '@/lib/compute-serving-capacity';

function renderCard(identityId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ComputeNetworkTestCard identityId={identityId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ComputeNetworkTestCard render', () => {
  it('returns null when no identityId', () => {
    const { container } = renderCard(null);
    expect(container.firstChild).toBeNull();
  });

  it('renders the card title for a logged-in identity', () => {
    renderCard('bos:person:test');
    expect(
      screen.getByRole('heading', { name: /Compute network/i })
    ).toBeInTheDocument();
  });
});

describe('sha256Pointer helper', () => {
  it('produces a sha256:<hex64> formatted pointer', async () => {
    const out = await sha256Pointer('demo prompt');
    expect(out).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', async () => {
    const a = await sha256Pointer('hello');
    const b = await sha256Pointer('hello');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256Pointer('hello');
    const b = await sha256Pointer('world');
    expect(a).not.toBe(b);
  });

  it('matches the canonical sha256 for "hello" — RFC 6234 test vector', async () => {
    const out = await sha256Pointer('hello');
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(out).toBe('sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
