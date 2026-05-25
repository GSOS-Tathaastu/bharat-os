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
import { recordSmsAttempt } from './metrics.mjs';

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

function notConfigured(name, missingEnvVars) {
  const error = new Error(
    `${name} SMS provider not configured. Set ${missingEnvVars.join(', ')} before selecting this provider.`
  );
  error.code = 'SMS_PROVIDER_NOT_CONFIGURED';
  error.provider = name;
  error.missing = missingEnvVars;
  return error;
}

// ─── Gupshup HTTP integration (Phase 5.1) ──────────────────────────────────
//
// Gupshup is the dominant India-onshore SMS provider for OTP /
// transactional delivery. Their v1 SMS API is a simple POST to
// `https://media.smsgupshup.com/GatewayAPI/rest` with credentials
// in the query string + body.
//
// Required env vars when BHARAT_OS_SMS_PROVIDER=gupshup:
//   • BHARAT_OS_SMS_GUPSHUP_USERID
//   • BHARAT_OS_SMS_GUPSHUP_PASSWORD
//   • BHARAT_OS_SMS_GUPSHUP_SOURCE   — registered DLT sender ID
//   • (optional) BHARAT_OS_SMS_GUPSHUP_PRINCIPAL_ENTITY_ID — DLT
//   • (optional) BHARAT_OS_SMS_GUPSHUP_TEMPLATE_ID — DLT template
//
// Gupshup's response shape: a single line "success | <messageId>"
// on success, "error | <reason>" on failure. We parse defensively
// (Gupshup occasionally returns JSON; we tolerate either).

const gupshupProvider = {
  name: 'gupshup',
  async send({ phone, body }) {
    const userId = process.env.BHARAT_OS_SMS_GUPSHUP_USERID;
    const password = process.env.BHARAT_OS_SMS_GUPSHUP_PASSWORD;
    const source = process.env.BHARAT_OS_SMS_GUPSHUP_SOURCE;
    if (!userId || !password || !source) {
      throw notConfigured('gupshup', [
        'BHARAT_OS_SMS_GUPSHUP_USERID',
        'BHARAT_OS_SMS_GUPSHUP_PASSWORD',
        'BHARAT_OS_SMS_GUPSHUP_SOURCE'
      ]);
    }
    // Gupshup expects send_to in 91XXXXXXXXXX form (no leading +).
    const sendTo = phone.startsWith('+') ? phone.slice(1) : phone;
    const params = new URLSearchParams({
      method: 'SendMessage',
      send_to: sendTo,
      msg: body,
      msg_type: 'TEXT',
      userid: userId,
      password,
      v: '1.1',
      auth_scheme: 'plain',
      source,
      format: 'text'
    });
    const principalEntityId = process.env.BHARAT_OS_SMS_GUPSHUP_PRINCIPAL_ENTITY_ID;
    const templateId = process.env.BHARAT_OS_SMS_GUPSHUP_TEMPLATE_ID;
    if (principalEntityId) params.set('principalEntityId', principalEntityId);
    if (templateId) params.set('dltTemplateId', templateId);
    const response = await fetch(
      `https://media.smsgupshup.com/GatewayAPI/rest?${params.toString()}`,
      { method: 'GET' }
    );
    const text = (await response.text()).trim();
    // Two response shapes: "success | <id>" or JSON.
    if (text.startsWith('success')) {
      const parts = text.split('|').map((p) => p.trim());
      return { ok: true, providerMessageId: parts[1] ?? 'gupshup-unknown', provider: 'gupshup' };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      // not json
    }
    if (parsed?.response?.status === 'success') {
      return { ok: true, providerMessageId: parsed.response.id ?? 'gupshup-unknown', provider: 'gupshup' };
    }
    const error = new Error(`gupshup send failed: ${text.slice(0, 200)}`);
    error.code = 'SMS_PROVIDER_REJECTED';
    error.provider = 'gupshup';
    error.providerResponse = text.slice(0, 500);
    throw error;
  }
};

// ─── MSG91 HTTP integration (Phase 5.1) ────────────────────────────────────
//
// MSG91 is the cost-effective high-volume option for India.
// Their v5 API uses an `authkey` header + JSON body.
//
// Required env vars:
//   • BHARAT_OS_SMS_MSG91_AUTH_KEY
//   • BHARAT_OS_SMS_MSG91_SENDER_ID (6-char DLT-registered)
//   • (optional) BHARAT_OS_SMS_MSG91_FLOW_ID — DLT template flow

const msg91Provider = {
  name: 'msg91',
  async send({ phone, body }) {
    const authKey = process.env.BHARAT_OS_SMS_MSG91_AUTH_KEY;
    const sender = process.env.BHARAT_OS_SMS_MSG91_SENDER_ID;
    if (!authKey || !sender) {
      throw notConfigured('msg91', [
        'BHARAT_OS_SMS_MSG91_AUTH_KEY',
        'BHARAT_OS_SMS_MSG91_SENDER_ID'
      ]);
    }
    // MSG91 expects mobiles in 91XXXXXXXXXX form.
    const mobile = phone.startsWith('+') ? phone.slice(1) : phone;
    const flowId = process.env.BHARAT_OS_SMS_MSG91_FLOW_ID;
    const payload = flowId
      ? {
          flow_id: flowId,
          sender,
          mobiles: mobile,
          // Flow templates use named variables; the OTP body's
          // 6-digit code is extracted by the caller's template.
          // We pass the full body in the OTP variable for the
          // common case.
          OTP: body.match(/\d{6}/)?.[0] ?? '',
          BODY: body
        }
      : {
          sender,
          route: '4', // transactional
          country: '91',
          sms: [{ message: body, to: [mobile] }]
        };
    const response = await fetch(
      flowId
        ? 'https://control.msg91.com/api/v5/flow'
        : 'https://control.msg91.com/api/v5/send',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authkey: authKey
        },
        body: JSON.stringify(payload)
      }
    );
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      // not json
    }
    if (response.ok && parsed?.type === 'success') {
      return {
        ok: true,
        providerMessageId: parsed.message ?? parsed.requestId ?? 'msg91-unknown',
        provider: 'msg91'
      };
    }
    const error = new Error(`msg91 send failed: ${text.slice(0, 200)}`);
    error.code = 'SMS_PROVIDER_REJECTED';
    error.provider = 'msg91';
    error.providerResponse = text.slice(0, 500);
    throw error;
  }
};

// ─── Twilio HTTP integration (Phase 5.1) ───────────────────────────────────
//
// Twilio is the international fallback (US / EU / SEA). Their REST
// API uses Basic auth + form-encoded body.
//
// Required env vars:
//   • BHARAT_OS_SMS_TWILIO_ACCOUNT_SID
//   • BHARAT_OS_SMS_TWILIO_AUTH_TOKEN
//   • BHARAT_OS_SMS_TWILIO_FROM (E.164 sending number or Messaging
//     Service SID, e.g. MGxxxx…)

const twilioProvider = {
  name: 'twilio',
  async send({ phone, body }) {
    const accountSid = process.env.BHARAT_OS_SMS_TWILIO_ACCOUNT_SID;
    const authToken = process.env.BHARAT_OS_SMS_TWILIO_AUTH_TOKEN;
    const from = process.env.BHARAT_OS_SMS_TWILIO_FROM;
    if (!accountSid || !authToken || !from) {
      throw notConfigured('twilio', [
        'BHARAT_OS_SMS_TWILIO_ACCOUNT_SID',
        'BHARAT_OS_SMS_TWILIO_AUTH_TOKEN',
        'BHARAT_OS_SMS_TWILIO_FROM'
      ]);
    }
    const params = new URLSearchParams({
      To: phone,
      Body: body
    });
    // Messaging Service SIDs start with MG; plain numbers don't.
    if (from.startsWith('MG')) {
      params.set('MessagingServiceSid', from);
    } else {
      params.set('From', from);
    }
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${credentials}`
        },
        body: params.toString()
      }
    );
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      // not json
    }
    if (response.ok && parsed?.sid) {
      return { ok: true, providerMessageId: parsed.sid, provider: 'twilio' };
    }
    const error = new Error(`twilio send failed: ${parsed?.message ?? text.slice(0, 200)}`);
    error.code = 'SMS_PROVIDER_REJECTED';
    error.provider = 'twilio';
    error.providerStatusCode = parsed?.code ?? null;
    error.providerResponse = text.slice(0, 500);
    throw error;
  }
};

// Karix is a Bharat Bill Payment Service ecosystem partner; their
// SMS API is similar to MSG91. Leaving as a stub until we have a
// concrete contract — the public docs require a partner login to
// access. Same shape as the others when implemented.
const karixProvider = {
  name: 'karix',
  async send() {
    throw notConfigured('karix', [
      'BHARAT_OS_SMS_KARIX_USERNAME',
      'BHARAT_OS_SMS_KARIX_PASSWORD'
    ]);
  }
};

// Phase 5.3 — telemetry wrapper. Each provider's `send` is wrapped
// so every attempt increments `bos_sms_send_total{provider, outcome}`
// in /metrics. Outcome buckets: 'success' / 'rejected' /
// 'not_configured' / 'error'. The wrapping is module-internal so
// individual provider implementations stay clean.
function outcomeFromError(error) {
  if (error?.code === 'SMS_PROVIDER_NOT_CONFIGURED') return 'not_configured';
  if (error?.code === 'SMS_PROVIDER_REJECTED') return 'rejected';
  return 'error';
}

function instrumentedProvider(provider) {
  return {
    name: provider.name,
    async send(args) {
      try {
        const result = await provider.send(args);
        recordSmsAttempt({ provider: provider.name, outcome: 'success' });
        return result;
      } catch (error) {
        recordSmsAttempt({
          provider: provider.name,
          outcome: outcomeFromError(error)
        });
        throw error;
      }
    }
  };
}

const PROVIDERS = {
  log: instrumentedProvider(logProvider),
  gupshup: instrumentedProvider(gupshupProvider),
  msg91: instrumentedProvider(msg91Provider),
  karix: instrumentedProvider(karixProvider),
  twilio: instrumentedProvider(twilioProvider)
};

// Phase 5.3 — fallback chain. Wraps an ordered list of providers.
// On send: walk the list, return the first success. On
// SMS_PROVIDER_NOT_CONFIGURED or SMS_PROVIDER_REJECTED, fall
// through to the next provider. If all fail, throw
// SMS_PROVIDER_FALLBACK_EXHAUSTED with a per-provider attempt
// report.
//
// §15: phone + body are passed identically to each provider; the
// fallback layer itself does not log or persist them. Per-vendor
// telemetry (success / rejected / not_configured counts) is
// already recorded by the instrumented inner providers — operators
// see which vendor in the chain succeeded via /metrics.
export function createFallbackProvider(providerList) {
  if (!Array.isArray(providerList) || providerList.length === 0) {
    throw new Error('createFallbackProvider requires a non-empty array of providers.');
  }
  for (const p of providerList) {
    if (!p || typeof p.send !== 'function' || typeof p.name !== 'string') {
      throw new Error('every entry must be a provider with `name` + `send`.');
    }
  }
  return {
    name: `fallback:${providerList.map((p) => p.name).join('>')}`,
    isFallback: true,
    providers: providerList,
    async send(args) {
      const attempts = [];
      for (const provider of providerList) {
        try {
          const result = await provider.send(args);
          return {
            ...result,
            fallbackChain: [...attempts.map((a) => a.provider), provider.name],
            fallbackAttempts: attempts
          };
        } catch (error) {
          // Only fall through on KNOWN provider error codes. An
          // unexpected error (network blowup, programmer bug)
          // surfaces immediately so it's not silently swallowed.
          const isKnown =
            error?.code === 'SMS_PROVIDER_NOT_CONFIGURED' ||
            error?.code === 'SMS_PROVIDER_REJECTED';
          attempts.push({
            provider: provider.name,
            code: error?.code ?? 'UNKNOWN',
            message: error?.message ?? String(error)
          });
          if (!isKnown) throw error;
        }
      }
      const error = new Error(
        `SMS fallback chain exhausted (${providerList.map((p) => p.name).join(' → ')}). ` +
          `All ${providerList.length} providers failed.`
      );
      error.code = 'SMS_PROVIDER_FALLBACK_EXHAUSTED';
      error.attempts = attempts;
      throw error;
    }
  };
}

// Public surface: caller asks for a provider by name (default 'log').
// The selected provider's `send` is the only function call sites use.
//
// Phase 5.3: when `BHARAT_OS_SMS_FALLBACK_CHAIN` is set (comma-
// separated provider names) AND no explicit `name` is passed, the
// returned provider is a fallback chain wrapping the listed
// providers in order. Otherwise the legacy single-provider lookup
// applies via `BHARAT_OS_SMS_PROVIDER`.
export function getSmsProvider(name) {
  if (!name) {
    const chainEnv = process.env.BHARAT_OS_SMS_FALLBACK_CHAIN;
    if (chainEnv && chainEnv.trim()) {
      const chainNames = chainEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (chainNames.length === 0) {
        throw new Error(
          'BHARAT_OS_SMS_FALLBACK_CHAIN must be a non-empty comma-separated list of provider names.'
        );
      }
      const providers = chainNames.map((n) => {
        const p = PROVIDERS[n];
        if (!p) {
          throw new Error(
            `unknown SMS provider in fallback chain: '${n}'. Known: ${Object.keys(PROVIDERS).join(', ')}.`
          );
        }
        return p;
      });
      return createFallbackProvider(providers);
    }
  }
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
