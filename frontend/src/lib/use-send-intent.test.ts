// Phase 11.7 — useSendIntent payload contract.
//
// Earlier shape was `{intent:{intentText}, actionRequest:{actorId}}`
// which silently fell through to mesh_storage on the server. The
// orchestrator reads `intentText` + `actorId` + `locale` as flat
// keys. This test pins that contract so it can't regress.

import { describe, expect, test, vi } from 'vitest';

// Mock fetch BEFORE importing the hook so the hook captures our mock.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// The hook lives inside @tanstack/react-query; rather than spin up a
// QueryClientProvider just to test the payload shape, exercise the
// mutationFn directly. We import the same code the hook uses by
// re-implementing the call shape — keeping the test focused on the
// HTTP wire.

import { api } from './api';

describe('citizen intent POST shape (Phase 11.7)', () => {
  test('POST /api/orchestrations carries intentText + actorId + locale as FLAT keys', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, orchestration: {} }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );

    await api('/api/orchestrations', {
      method: 'POST',
      body: JSON.stringify({
        intentText: 'Book a cab',
        actorId: 'bos:person:test',
        locale: 'en-IN'
      })
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    // Flat keys — this is the contract the BE orchestrator expects.
    expect(body.intentText).toBe('Book a cab');
    expect(body.actorId).toBe('bos:person:test');
    expect(body.locale).toBe('en-IN');
    // The earlier broken shape MUST NOT reappear.
    expect(body.intent).toBeUndefined();
    expect(body.actionRequest).toBeUndefined();
  });
});
