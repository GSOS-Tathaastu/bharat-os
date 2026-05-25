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
import {
  recordCircuitState,
  recordSmsAttempt,
  recordSmsInflight
} from './metrics.mjs';

export const SMS_PROVIDER_PROTOCOL_VERSION = 'bos.phase0.sms-provider.v0';

const E164_PATTERN = /^\+\d{10,15}$/;

// Phase 5.4 — per-call timeout + circuit breaker tunables. Defaults
// chosen so a typical India-SMS API (responds in <500ms) treats
// >3s as outage; 5 consecutive REJECTED errors trips the circuit;
// circuit cools for 30s before a half-open probe.
const DEFAULT_SMS_TIMEOUT_MS = 3000;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_OPEN_MS = 30_000;
// Phase 5.8 — bulkhead concurrency cap. Default 10 in-flight per
// provider — sane upper bound for an India-SMS API (vendor docs
// typically rate-limit at 200-1000 req/s; 10 concurrent never
// approaches that, but does cap exposure to a hung vendor).
const DEFAULT_BULKHEAD_MAX = 10;

function readPositiveIntEnv(name, fallback) {
  const raw = process.env?.[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function smsTimeoutMs() {
  return readPositiveIntEnv('BHARAT_OS_SMS_TIMEOUT_MS', DEFAULT_SMS_TIMEOUT_MS);
}

function circuitFailureThreshold() {
  return readPositiveIntEnv(
    'BHARAT_OS_SMS_CIRCUIT_THRESHOLD',
    DEFAULT_CIRCUIT_FAILURE_THRESHOLD
  );
}

function circuitOpenMs() {
  return readPositiveIntEnv('BHARAT_OS_SMS_CIRCUIT_OPEN_MS', DEFAULT_CIRCUIT_OPEN_MS);
}

function bulkheadMaxConcurrent() {
  return readPositiveIntEnv('BHARAT_OS_SMS_BULKHEAD_MAX', DEFAULT_BULKHEAD_MAX);
}

// Tiny `fetch` wrapper that aborts after `timeoutMs` and re-throws
// as a tagged `SMS_PROVIDER_REJECTED` so the fallback chain treats
// timeout the same as vendor 5xx.
export async function fetchWithTimeout(url, init = {}, { timeoutMs, provider = 'unknown' } = {}) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : smsTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted =
      error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || controller.signal.aborted;
    const wrapped = new Error(
      aborted
        ? `${provider} send timed out after ${ms}ms`
        : `${provider} network error: ${error?.message ?? String(error)}`
    );
    wrapped.code = 'SMS_PROVIDER_REJECTED';
    wrapped.provider = provider;
    wrapped.providerResponse = aborted ? `timeout:${ms}ms` : `network:${error?.message ?? 'unknown'}`;
    wrapped.cause = error;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

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
    const response = await fetchWithTimeout(
      `https://media.smsgupshup.com/GatewayAPI/rest?${params.toString()}`,
      { method: 'GET' },
      { provider: 'gupshup' }
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
    const response = await fetchWithTimeout(
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
      },
      { provider: 'msg91' }
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
    const response = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${credentials}`
        },
        body: params.toString()
      },
      { provider: 'twilio' }
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

// Phase 5.4 — circuit breaker. Per-provider state tracks consecutive
// vendor REJECTED failures. After `threshold` (default 5) the
// circuit opens — subsequent sends short-circuit immediately with
// SMS_PROVIDER_CIRCUIT_OPEN so the fallback chain skips to the
// next provider without paying network latency. After `openMs`
// (default 30s) the next send is allowed through as a half-open
// probe; success closes the circuit, failure re-opens it.
//
// NOT_CONFIGURED is treated as a config issue, not a vendor
// failure, and does NOT count toward the threshold (config doesn't
// auto-heal in 30s).

const circuitStates = new Map(); // provider name → state object

function circuitInitialState() {
  return {
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: 0
  };
}

function transitionCircuit(provider, state, nextState) {
  if (state.state !== nextState) {
    state.state = nextState;
    recordCircuitState(provider, nextState);
  }
}

function circuitOpenError(provider, msUntilProbe) {
  const error = new Error(
    `${provider} circuit open — skipping for ~${Math.ceil(msUntilProbe / 1000)}s while it cools down.`
  );
  error.code = 'SMS_PROVIDER_CIRCUIT_OPEN';
  error.provider = provider;
  error.msUntilProbe = msUntilProbe;
  return error;
}

export function createCircuitBreakerProvider(provider, options = {}) {
  const name = provider.name;
  const state = circuitInitialState();
  circuitStates.set(name, state);
  recordCircuitState(name, 'closed');

  // `now` is injectable so tests can drive time forward without
  // hanging on real timers.
  return {
    name,
    _circuit: state,
    async send(args, callOptions = {}) {
      const now = callOptions.now ?? Date.now;
      const threshold = options.failureThreshold ?? circuitFailureThreshold();
      const openMs = options.openMs ?? circuitOpenMs();

      if (state.state === 'open') {
        const elapsed = now() - state.openedAt;
        if (elapsed < openMs) {
          throw circuitOpenError(name, openMs - elapsed);
        }
        transitionCircuit(name, state, 'half_open');
      }

      try {
        const result = await provider.send(args);
        if (state.state !== 'closed' || state.consecutiveFailures !== 0) {
          state.consecutiveFailures = 0;
          state.openedAt = 0;
          transitionCircuit(name, state, 'closed');
        }
        return result;
      } catch (error) {
        const code = error?.code;
        if (code === 'SMS_PROVIDER_NOT_CONFIGURED') {
          // Config failures don't heal automatically — don't open
          // the circuit. The fallback chain treats them as
          // recoverable for routing.
          throw error;
        }
        if (code === 'SMS_PROVIDER_REJECTED') {
          state.consecutiveFailures += 1;
          if (state.state === 'half_open' || state.consecutiveFailures >= threshold) {
            state.openedAt = now();
            transitionCircuit(name, state, 'open');
          }
        }
        throw error;
      }
    }
  };
}

// `resetCircuit(name?)` — test + ops helper. Clears the breaker
// state for one provider (or all when omitted) and emits the
// closed gauge sample. Useful when a vendor confirms recovery and
// ops wants to lift the cooldown immediately.
export function resetCircuit(name) {
  if (name) {
    const s = circuitStates.get(name);
    if (s) {
      s.state = 'closed';
      s.consecutiveFailures = 0;
      s.openedAt = 0;
      recordCircuitState(name, 'closed');
    }
    return;
  }
  for (const provName of circuitStates.keys()) {
    resetCircuit(provName);
  }
}

export function circuitStatusSnapshot() {
  const out = {};
  for (const [provName, s] of circuitStates) {
    out[provName] = {
      state: s.state,
      consecutiveFailures: s.consecutiveFailures,
      openedAt: s.openedAt
    };
  }
  return out;
}

// Phase 5.8 — bulkhead (concurrency cap). A hung vendor with no
// timeout fired yet can otherwise accumulate dozens of in-flight
// fetches, each holding a socket + Node heap. The bulkhead caps
// concurrent in-flight calls per provider; at capacity, future
// calls fast-fail with SMS_PROVIDER_BULKHEAD_FULL — a recoverable
// code so the fallback chain falls through to the next provider.
//
// Implementation: simple counter (no queue). Queuing would add
// latency for callers waiting on capacity to free up; we'd rather
// fail fast and let the fallback chain route around the busy
// provider.
//
// The bulkhead state is per-provider-name + module-scoped so
// concurrent calls through the same wrappedProvider share the
// counter (which is what we want).

const bulkheadStates = new Map(); // provider name → { inflight, maxConcurrent }

export function createBulkheadProvider(provider, options = {}) {
  const name = provider.name;
  const state = {
    inflight: 0,
    maxConcurrent: options.maxConcurrent ?? bulkheadMaxConcurrent()
  };
  bulkheadStates.set(name, state);
  recordSmsInflight(name, 0);

  return {
    name,
    _bulkhead: state,
    async send(args) {
      if (state.inflight >= state.maxConcurrent) {
        const error = new Error(
          `${name} bulkhead full — ${state.inflight}/${state.maxConcurrent} in-flight. Try a different provider.`
        );
        error.code = 'SMS_PROVIDER_BULKHEAD_FULL';
        error.provider = name;
        error.inflight = state.inflight;
        error.maxConcurrent = state.maxConcurrent;
        throw error;
      }
      state.inflight += 1;
      recordSmsInflight(name, state.inflight);
      try {
        return await provider.send(args);
      } finally {
        state.inflight = Math.max(0, state.inflight - 1);
        recordSmsInflight(name, state.inflight);
      }
    }
  };
}

export function bulkheadStatusSnapshot() {
  const out = {};
  for (const [name, s] of bulkheadStates) {
    out[name] = { inflight: s.inflight, maxConcurrent: s.maxConcurrent };
  }
  return out;
}

function wrappedProvider(provider) {
  // Order (outermost → innermost):
  //   bulkhead       — fastest rejection; doesn't waste a slot
  //                    on a known-broken vendor that the circuit
  //                    breaker is about to refuse anyway.
  //   circuit breaker — short-circuits when the breaker is open.
  //   telemetry       — records every attempt that survives the
  //                    two layers above.
  //   vendor          — actual fetch / send.
  //
  // The bulkhead going outermost matters: if a vendor's calls are
  // hanging (slow socket reads), we DON'T want to count them
  // against the breaker's failure threshold from inside a busy
  // bulkhead. Fast-fail at the bulkhead → fallback chain → next
  // vendor; the slow vendor's circuit eventually opens via
  // existing timeouts on the inflight calls.
  return createBulkheadProvider(
    createCircuitBreakerProvider(instrumentedProvider(provider))
  );
}

const PROVIDERS = {
  log: wrappedProvider(logProvider),
  gupshup: wrappedProvider(gupshupProvider),
  msg91: wrappedProvider(msg91Provider),
  karix: wrappedProvider(karixProvider),
  twilio: wrappedProvider(twilioProvider)
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
            error?.code === 'SMS_PROVIDER_REJECTED' ||
            error?.code === 'SMS_PROVIDER_CIRCUIT_OPEN' ||
            error?.code === 'SMS_PROVIDER_BULKHEAD_FULL';
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
