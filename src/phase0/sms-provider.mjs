// SMS provider abstraction — Phase 4.3.
//
// Bharat OS needs phone-OTP for recovery (when a user loses their
// 12-word phrase, OTP is the only practical fallback) and for any
// future "verify your phone" attestation. The production providers
// (Gupshup, Karix, MSG91, Twilio) need vendor contracts and an
// onboarded sender ID — that's a Tier 1 partner integration per
// the launch roadmap.
//
// This module ships the protocol abstraction with a `log` provider
// that prints OTPs to the structured logger (dev mode, no SMS
// actually sent) plus stubs for the real vendors that throw on
// `send` until configured. When the partner contract lands,
// implementing the stub is a small change — the API surface and
// the rate-limiter / database integration stays the same.

import { logger } from './logger.mjs';

export const SMS_PROVIDER_PROTOCOL_VERSION = 'bos.phase0.sms-provider.v0';

const E164_PATTERN = /^\+\d{10,15}$/;

export function normalisePhone(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Accept Indian numbers without the country code; auto-prepend +91
  // when the user types a 10-digit number. Reject anything else that
  // doesn't look like E.164.
  const digitsOnly = raw.replace(/[^\d+]/g, '');
  let normalised = digitsOnly;
  if (digitsOnly.startsWith('+')) {
    normalised = digitsOnly;
  } else if (digitsOnly.length === 10) {
    normalised = `+91${digitsOnly}`;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    normalised = `+${digitsOnly}`;
  }
  return E164_PATTERN.test(normalised) ? normalised : null;
}

// Provider interface: each implementation has `send({ phone, body })`
// returning `{ ok: true, providerMessageId }` on success.

const logProvider = {
  name: 'log',
  async send({ phone, body }) {
    // The OTP body is logged but the phone number is partially
    // masked so even a stolen log file doesn't reveal the full
    // number. §15: phone numbers count as PII and must not appear
    // verbatim in observability output.
    const masked = phone.replace(/(?<=^\+\d{3})\d+(?=\d{2}$)/, '****');
    logger.info('sms.outgoing', {
      provider: 'log',
      phoneMasked: masked,
      bodyLength: body.length,
      // Body itself is intentionally not in the log; OTPs are
      // sensitive. For dev visibility we use a separate stdout
      // write that ISN'T routed through the logger's PII scrub.
    });
    // Dev-only: print the OTP body to stdout in a way that ops can
    // grep but that doesn't pollute the structured log stream.
    if (process.env.BHARAT_OS_LOG_OTP_BODIES === '1') {
      process.stdout.write(`[DEV OTP] to=${masked}: ${body}\n`);
    }
    return {
      ok: true,
      providerMessageId: `log-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`
    };
  }
};

function notConfiguredProvider(name) {
  return {
    name,
    async send() {
      throw new Error(
        `${name} SMS provider not configured. Set BHARAT_OS_SMS_${name.toUpperCase()}_API_KEY ` +
          `(and any vendor-specific env vars) before selecting this provider.`
      );
    }
  };
}

const PROVIDERS = {
  log: logProvider,
  gupshup: notConfiguredProvider('gupshup'),
  msg91: notConfiguredProvider('msg91'),
  karix: notConfiguredProvider('karix'),
  twilio: notConfiguredProvider('twilio')
};

// Public surface: caller asks for a provider by name (default 'log').
// The selected provider's `send` is the only function call sites use.
export function getSmsProvider(name) {
  const requested = name ?? process.env.BHARAT_OS_SMS_PROVIDER ?? 'log';
  const provider = PROVIDERS[requested];
  if (!provider) {
    throw new Error(`unknown SMS provider: ${requested}. Known: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  return provider;
}

// Convenience: dispatch through the configured provider in one call.
export async function sendSms({ phone, body, provider }) {
  const normalised = normalisePhone(phone);
  if (!normalised) {
    throw new Error('invalid phone number — expected E.164 (+91XXXXXXXXXX) or a 10-digit Indian number.');
  }
  if (!body || typeof body !== 'string' || body.length > 320) {
    throw new Error('SMS body is required and must be <= 320 characters.');
  }
  const selected = provider ?? getSmsProvider();
  return selected.send({ phone: normalised, body });
}
