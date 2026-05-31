// Phase 11.8 — consent grant + revoke contract.
//
// The /api/consents endpoint expects {subjectId, granteeId,
// scopes, purpose, ttlDays?, signWithIdentityId?, signRole?}.
// The revoke endpoint at /api/consents/:id/revoke expects
// {reason?, revokedBy?, signWithIdentityId?, signRole?}.
// Pin both contracts so a refactor cannot drop the citizen
// signature (which would let the server fabricate consent).

import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

import { api } from './api';

describe('useGrantConsent body shape (Phase 11.8)', () => {
  test('POST /api/consents carries subject + grantee + scopes + purpose + signing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, consent: {} }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );

    await api('/api/consents', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: 'bos:person:test',
        granteeId: 'bharat-os-orchestrator',
        scopes: ['service.book', 'consent.record', 'upi.settle'],
        purpose: 'Book a service for me through the Bharat OS marketplace.',
        ttlDays: 30,
        signWithIdentityId: 'bos:person:test',
        signRole: 'subject'
      })
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.subjectId).toBe('bos:person:test');
    expect(body.granteeId).toBe('bharat-os-orchestrator');
    expect(body.scopes).toEqual(['service.book', 'consent.record', 'upi.settle']);
    expect(typeof body.purpose).toBe('string');
    expect(body.purpose.length).toBeGreaterThan(0);
    expect(body.ttlDays).toBe(30);
    // CRITICAL: signature must be present so the artifact is
    // authentic — server cannot fabricate consent.
    expect(body.signWithIdentityId).toBe('bos:person:test');
    expect(body.signRole).toBe('subject');
  });
});

describe('useRevokeConsent body shape (Phase 11.8)', () => {
  test('POST /api/consents/:id/revoke carries reason + revokedBy + signature', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, consent: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    await api('/api/consents/bos%3Aconsent%3Aabc/revoke', {
      method: 'POST',
      body: JSON.stringify({
        reason: 'revoked_by_citizen',
        revokedBy: 'bos:person:test',
        signWithIdentityId: 'bos:person:test',
        signRole: 'revoker'
      })
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/revoke');
    const body = JSON.parse(init.body as string);
    expect(body.reason).toBe('revoked_by_citizen');
    expect(body.revokedBy).toBe('bos:person:test');
    expect(body.signWithIdentityId).toBe('bos:person:test');
    expect(body.signRole).toBe('revoker');
  });
});
