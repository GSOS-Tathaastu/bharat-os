// Phase 12.1a.2 — Provider-side request gate.
//
// Mirrors the shape of sponsor-auth.mjs but uses the ALREADY-
// authenticated rootIdentityId path (Phase 12.0.1 phone OTP)
// instead of a separate bearer-mint flow. Rationale: providers
// are citizens with phones; they should not have to manage a
// second secret. The "spouse holds the phone" delegation case is
// an honest Phase 12.3 follow-up (with proper revocable
// sub-identities), not a 12.1a.2 deliverable.
//
// Two gates:
//
//   requireProviderOwnerAuth — provider is in URL path,
//     actingRootIdentityId is in body. Asserts the provider exists,
//     is active, AND that the acting root owns it. Used for
//     provider-side reads (inbox / active / history) and writes
//     (accept / reject / mark-complete).
//
//   requireBookingPartyAuth — same but for booking-side calls.
//     Resolves the booking, asserts the acting root is either the
//     citizen who created it OR the root that owns the providerIdentity
//     on it; returns { booking, role: 'citizen' | 'provider' }.

import { logger } from './logger.mjs';

export class ProviderAuthError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'ProviderAuthError';
    this.status = status;
    this.code = code;
  }
}

function readActingRootFromRequest(request, body) {
  if (body && typeof body.actingRootIdentityId === 'string' && body.actingRootIdentityId.trim()) {
    return body.actingRootIdentityId.trim();
  }
  const header = request?.headers?.['x-bharat-os-acting-identity'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return null;
}

// Provider-owner gate. Returns the provider record on success.
export async function requireProviderOwnerAuth({
  store,
  providerIdentityId,
  request,
  body = null,
  requestId = null
} = {}) {
  if (!providerIdentityId) {
    throw new ProviderAuthError({
      status: 400,
      code: 'missing_provider_id',
      message: 'providerIdentityId is required in the URL.'
    });
  }
  const provider = await store.readProviderIdentity(providerIdentityId).catch(() => null);
  if (!provider) {
    throw new ProviderAuthError({
      status: 404,
      code: 'unknown_provider',
      message: 'provider identity not found.'
    });
  }
  const acting = readActingRootFromRequest(request, body);
  if (!acting) {
    logger.warn('provider_auth_missing_root', { requestId, providerIdentityId });
    throw new ProviderAuthError({
      status: 401,
      code: 'missing_acting_identity',
      message: 'provider endpoints require actingRootIdentityId (body) or X-Bharat-OS-Acting-Identity (header).'
    });
  }
  if (acting !== provider.rootIdentityId) {
    logger.warn('provider_auth_root_mismatch', { requestId, providerIdentityId });
    throw new ProviderAuthError({
      status: 403,
      code: 'not_provider_owner',
      message: 'acting identity does not own this provider.'
    });
  }
  if (provider.status === 'revoked') {
    throw new ProviderAuthError({
      status: 403,
      code: 'provider_revoked',
      message: 'provider has been revoked.'
    });
  }
  return provider;
}

// Booking-party gate. Returns { booking, role, provider }.
export async function requireBookingPartyAuth({
  store,
  bookingId,
  request,
  body = null,
  requestId = null
} = {}) {
  if (!bookingId) {
    throw new ProviderAuthError({
      status: 400,
      code: 'missing_booking_id',
      message: 'bookingId is required in the URL.'
    });
  }
  const booking = await store.readBooking(bookingId).catch(() => null);
  if (!booking) {
    throw new ProviderAuthError({
      status: 404,
      code: 'unknown_booking',
      message: 'booking not found.'
    });
  }
  const acting = readActingRootFromRequest(request, body);
  if (!acting) {
    logger.warn('booking_auth_missing_root', { requestId, bookingId });
    throw new ProviderAuthError({
      status: 401,
      code: 'missing_acting_identity',
      message: 'booking endpoints require actingRootIdentityId (body) or X-Bharat-OS-Acting-Identity (header).'
    });
  }
  if (acting === booking.citizenRootIdentityId) {
    return { booking, role: 'citizen', provider: null };
  }
  if (acting === booking.providerRootIdentityId) {
    const provider = await store.readProviderIdentity(booking.providerIdentityId).catch(() => null);
    return { booking, role: 'provider', provider };
  }
  logger.warn('booking_auth_not_party', { requestId, bookingId });
  throw new ProviderAuthError({
    status: 403,
    code: 'not_booking_party',
    message: 'acting identity is not a party to this booking.'
  });
}

// Phase 12.1a.2 — Citizen owner-auth gate.
//
// Mirrors requireProviderOwnerAuth for citizen-side reads (bookings,
// escrow) that previously trusted the URL identifier as if it were
// authenticated. Phase 12.1a.2 adversarial review flagged this as
// PRIV-1+2 — closing service-layer auth now rather than deferring.
//
// Same shape: actingRootIdentityId in body OR X-Bharat-OS-Acting-
// Identity header. Asserts the identity exists in the store AND
// matches the path :rootIdentityId.
export async function requireCitizenOwnerAuth({
  store,
  citizenRootIdentityId,
  request,
  body = null,
  requestId = null
} = {}) {
  if (!citizenRootIdentityId) {
    throw new ProviderAuthError({
      status: 400,
      code: 'missing_citizen_id',
      message: 'citizenRootIdentityId is required in the URL.'
    });
  }
  const acting = readActingRootFromRequest(request, body);
  if (!acting) {
    logger.warn('citizen_auth_missing_root', { requestId, citizenRootIdentityId });
    throw new ProviderAuthError({
      status: 401,
      code: 'missing_acting_identity',
      message: 'citizen endpoints require actingRootIdentityId (body) or X-Bharat-OS-Acting-Identity (header).'
    });
  }
  if (acting !== citizenRootIdentityId) {
    logger.warn('citizen_auth_root_mismatch', { requestId, citizenRootIdentityId });
    throw new ProviderAuthError({
      status: 403,
      code: 'not_citizen_owner',
      message: 'acting identity does not match the citizen on this resource.'
    });
  }
  const citizen = await store.readIdentity(citizenRootIdentityId).catch(() => null);
  if (!citizen) {
    throw new ProviderAuthError({
      status: 404,
      code: 'citizen_not_found',
      message: 'citizen identity not found.'
    });
  }
  return citizen;
}

// Convenience: sends a JSON error response on failure, returns
// truthy value on success.
export async function checkProviderOwnerAuth(request, response, opts) {
  try {
    return await requireProviderOwnerAuth({ ...opts, request });
  } catch (error) {
    if (error instanceof ProviderAuthError) {
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
      return null;
    }
    throw error;
  }
}

export async function checkBookingPartyAuth(request, response, opts) {
  try {
    return await requireBookingPartyAuth({ ...opts, request });
  } catch (error) {
    if (error instanceof ProviderAuthError) {
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
      return null;
    }
    throw error;
  }
}
