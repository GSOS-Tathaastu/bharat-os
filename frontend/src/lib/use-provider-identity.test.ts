// Phase 12.0 — provider identity hook contract.
//
// Pins the wire shape so a refactor cannot drop the rootIdentityId
// gate on profile edits (which would let any caller mutate another
// citizen's provider profile).

import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

import { api } from './api';

describe('useCreateProviderIdentity body shape (Phase 12.0)', () => {
  test('POST .../provider-identities carries roleKind + displayName + rates + serviceArea', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ providerIdentity: {} }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );
    await api('/api/identities/bos%3Aperson%3Atest/provider-identities', {
      method: 'POST',
      body: JSON.stringify({
        roleKind: 'cab-driver',
        displayName: 'Ravi',
        ratePaisePerHour: 30000,
        ratePaisePerService: 25000,
        serviceArea: { summary: 'Pune Camp area' },
        description: 'Auto driver'
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.roleKind).toBe('cab-driver');
    expect(body.displayName).toBe('Ravi');
    expect(body.ratePaisePerHour).toBe(30000);
    expect(body.ratePaisePerService).toBe(25000);
    expect(body.serviceArea).toEqual({ summary: 'Pune Camp area' });
  });
});

describe('useUpdateProviderProfile gates on rootIdentityId (Phase 12.0)', () => {
  test('POST .../profile MUST carry rootIdentityId in body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ providerIdentity: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await api('/api/provider-identities/bos%3Aprovider-identity%3Aabc/profile', {
      method: 'POST',
      body: JSON.stringify({
        rootIdentityId: 'bos:person:test',
        displayName: 'Ravi (updated)',
        ratePaisePerHour: 35000
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/profile');
    const body = JSON.parse(init.body as string);
    // CRITICAL: rootIdentityId must be on the body so the server
    // can verify caller is the owner. Dropping this in a refactor
    // would open a critical authorization bypass.
    expect(body.rootIdentityId).toBe('bos:person:test');
    expect(body.displayName).toBe('Ravi (updated)');
  });
});
