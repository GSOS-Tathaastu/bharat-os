// Phase 9.1 — Sponsor-bearer-token request gate.
//
// Distinct from Phase 5.7 admin-auth: admins ONBOARD sponsors and
// top up their escrow; sponsors ACT on their own resource (create
// rounds, fetch audit exports) using their per-sponsor token. The
// two surfaces don't overlap — a compromised admin token can lift
// a SIM-swap cooldown but cannot spend a sponsor's escrow; a
// compromised sponsor token can drain that sponsor's escrow but
// not touch other sponsors.

import { logger } from './logger.mjs';
import { verifyBearerToken, SponsorAuthError } from '../phase1/sponsor.mjs';

// Resolves the sponsor for the path's :sponsorId AND verifies the
// presented bearer token against the stored hash. Returns the
// sponsor object on success, throws SponsorAuthError otherwise.
//
// `store` is the SqliteStore / BosStore instance; reads via
// `store.readSponsor(sponsorId)`.
export async function requireSponsorAuth(request, { store, sponsorId, requestId } = {}) {
  if (!sponsorId) {
    throw new SponsorAuthError({
      status: 400,
      code: 'missing_sponsor_id',
      message: 'sponsor id is required in the URL.'
    });
  }
  const sponsor = await store.readSponsor(sponsorId).catch(() => null);
  if (!sponsor) {
    throw new SponsorAuthError({
      status: 404,
      code: 'unknown_sponsor',
      message: 'sponsor not found.'
    });
  }
  if (sponsor.status !== 'active') {
    throw new SponsorAuthError({
      status: 403,
      code: 'sponsor_inactive',
      message: `sponsor status is ${sponsor.status}; cannot act.`
    });
  }
  const headerValue = request.headers?.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(headerValue);
  if (!match) {
    logger.warn('sponsor_auth_missing_bearer', { requestId, sponsorId });
    throw new SponsorAuthError({
      status: 401,
      code: 'missing_authorization',
      message: 'sponsor endpoints require Authorization: Bearer <token>.'
    });
  }
  const presented = match[1].trim();
  if (!verifyBearerToken(presented, sponsor.bearerTokenHash)) {
    logger.warn('sponsor_auth_token_mismatch', { requestId, sponsorId });
    throw new SponsorAuthError({
      status: 401,
      code: 'invalid_token',
      message: 'sponsor token does not match.'
    });
  }
  return sponsor;
}

// Convenience: returns sponsor on success, returns null after
// sending a JSON error response on failure.
export async function checkSponsorAuth(request, response, { store, sponsorId, requestId } = {}) {
  try {
    return await requireSponsorAuth(request, { store, sponsorId, requestId });
  } catch (error) {
    if (error instanceof SponsorAuthError) {
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
      return null;
    }
    throw error;
  }
}

export { SponsorAuthError };
