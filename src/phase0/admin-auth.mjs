// Admin-endpoint authentication — Phase 5.7.
//
// The ops admin endpoints (circuit reset, cooldown override, manual
// snapshot) are SHARED-SECRET-gated via the `BHARAT_OS_ADMIN_TOKEN`
// env var. The secret travels in the `Authorization: Bearer <token>`
// header.
//
// This is intentionally simpler than a full mTLS / signed-JWT
// scheme:
//   • The endpoints are operational — they're called from a
//     known IP space (an ops jumphost or a CI runner) and only
//     during incident response, not as part of normal user
//     traffic.
//   • Compromise of the token means an attacker can lift a
//     SIM-swap cooldown or reset a circuit. Both are AUDITED —
//     every admin call emits a ledger event with `operator` ref —
//     so an unauthorised override is *visible* after the fact.
//   • Rotation is a deploy-time env-var update; the launch-runbook
//     documents rotating quarterly + after any suspected leak.
//
// When the token env var is NOT set, every admin endpoint refuses
// with 503 "admin endpoints disabled". This is the SAFE default —
// a deploy that forgets to set the token can't accidentally expose
// them.

import { logger } from './logger.mjs';

export const ADMIN_AUTH_PROTOCOL_VERSION = 'bos.phase0.admin-auth.v0';

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Returns the operator identifier when authorised, throws an
// AdminAuthError when not. AdminAuthError carries the suggested
// HTTP status so the route handler can `jsonResponse(response,
// error.status, …)` without a per-route branch.
export class AdminAuthError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
    this.code = code;
  }
}

export function requireAdminToken(request, { requestId } = {}) {
  const configured = process.env.BHARAT_OS_ADMIN_TOKEN;
  if (!configured || configured.length < 16) {
    throw new AdminAuthError({
      status: 503,
      code: 'admin_disabled',
      message:
        'Admin endpoints disabled. Set BHARAT_OS_ADMIN_TOKEN (>=16 chars) to enable. ' +
        'Refusing to serve admin operations without a configured secret.'
    });
  }
  const headerValue = request.headers?.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(headerValue);
  if (!match) {
    logger.warn('admin_auth_missing_bearer', { requestId });
    throw new AdminAuthError({
      status: 401,
      code: 'missing_authorization',
      message: 'Admin endpoints require an Authorization: Bearer <token> header.'
    });
  }
  const presented = match[1].trim();
  if (!constantTimeEquals(presented, configured)) {
    logger.warn('admin_auth_token_mismatch', { requestId });
    throw new AdminAuthError({
      status: 401,
      code: 'invalid_token',
      message: 'Admin token does not match.'
    });
  }
  // Optional operator label: clients pass `X-Bharat-Os-Operator:
  // <name>` so the audit trail records WHO took the action. Defaults
  // to 'unattributed-operator' when missing.
  const operator =
    String(request.headers?.['x-bharat-os-operator'] ?? 'unattributed-operator')
      .trim()
      .slice(0, 80);
  return {
    operator: operator || 'unattributed-operator',
    protocolVersion: ADMIN_AUTH_PROTOCOL_VERSION
  };
}

// Convenience wrapper for route handlers — caller just does:
//   const auth = await checkAdminAuth(request, response, { requestId });
//   if (!auth) return; // response already sent
// Encapsulates the catch-and-jsonResponse boilerplate.
export function checkAdminAuth(request, response, { requestId } = {}) {
  try {
    return requireAdminToken(request, { requestId });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ error: { code: error.code, message: error.message } })
      );
      return null;
    }
    throw error;
  }
}
