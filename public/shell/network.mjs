// Network helpers — Phase 4.4.
//
// Three concerns:
//
//   1. `fetchWithRetry(url, init, options)` — exponential-backoff
//      retry around `fetch` for transient failures. 5xx responses
//      and network errors retry; 4xx responses (validation errors,
//      auth failures) return immediately — retrying them is
//      pointless.
//
//   2. `onNetworkStatusChange(callback)` — wraps `navigator.onLine`
//      + browser online/offline events. Callback fires on every
//      transition with `{ online: boolean }`.
//
//   3. `categoriseError(error, response)` — turn an exception or
//      a non-ok response into a structured user-facing message
//      with a recommended action (retry / sign-in / give-up).
//
// All three are intentionally browser-side; the server's
// reliability is handled by Phase 4.1 (rate-limiter, structured
// logs, /readyz). This module is what the shell uses to be
// resilient to *its* network.

export const NETWORK_PROTOCOL_VERSION = 'bos.phase0.network.v0';

const DEFAULT_RETRY_DELAYS_MS = [200, 600, 1800];
// 5xx and 429 retry; everything else is a permanent client error.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, init = {}, options = {}) {
  const delays = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = delays.length + 1; // initial + retries
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(delays[attempt - 1]);
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      // Non-ok response: retry only if the status is in our
      // transient-failure allowlist.
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts - 1) {
        return response; // Non-retryable; caller handles the !ok.
      }
      lastError = new Error(`HTTP ${response.status}`);
      lastError.response = response;
    } catch (error) {
      // Network-level error (DNS, TCP, TLS, fetch abort). Retry if
      // we have attempts left.
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
    }
  }
  // Should not reach here; fail-safe re-throw.
  throw lastError ?? new Error('fetchWithRetry exhausted attempts');
}

// Convenience: parse JSON + retry. The corresponding fetchJson()
// in app.js stays untouched; routes that opt into resilience call
// fetchJsonWithRetry directly.
export async function fetchJsonWithRetry(url, init = {}, options = {}) {
  const response = await fetchWithRetry(url, init, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    error.statusCode = response.status;
    error.responseText = text;
    throw error;
  }
  return response.json();
}

// Network-status tracker. Returns a `subscribe(callback)` that
// fires the callback with the current state immediately AND on
// every transition. The unsubscribe function is returned so call
// sites can dispose listeners on tab close.
export function onNetworkStatusChange(callback) {
  if (typeof callback !== 'function') {
    throw new Error('onNetworkStatusChange requires a callback function.');
  }
  // Fire once with current state.
  const current = () => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false
  });
  callback(current());
  const onUp = () => callback({ online: true });
  const onDown = () => callback({ online: false });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    }
  };
}

// Map an error/response into a structured user-facing payload.
// Recommended action is one of:
//   'retry'   — transient; offer a Retry button
//   'wait'    — rate-limited; show countdown
//   'sign_in' — auth missing; route to first-run wizard
//   'fix_input' — 4xx validation; show error inline
//   'contact_support' — 5xx after retry exhaustion
//   'offline' — no network
export function categoriseError(error, response) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      category: 'offline',
      title: 'You\'re offline',
      message: 'Bharat OS will retry when your connection comes back. Your action is queued.',
      action: 'wait'
    };
  }
  if (response) {
    const status = response.status;
    if (status === 401 || status === 403) {
      return {
        category: 'auth',
        title: 'Sign in again',
        message: 'Your session needs a refresh. Open Profile → Sign-in security.',
        action: 'sign_in',
        status
      };
    }
    if (status === 429) {
      const retryAfter = parseInt(response.headers?.get?.('retry-after') ?? '5', 10);
      return {
        category: 'rate_limited',
        title: 'Too many requests',
        message: `Take a breather and try again in ${retryAfter}s.`,
        action: 'wait',
        retryAfterSeconds: retryAfter,
        status
      };
    }
    if (status >= 400 && status < 500) {
      return {
        category: 'validation',
        title: 'That didn\'t work',
        message: error?.message?.slice(0, 200) ?? `Server said: HTTP ${status}`,
        action: 'fix_input',
        status
      };
    }
    if (status >= 500) {
      return {
        category: 'server_error',
        title: 'Server hiccup',
        message: 'Something went wrong on our end. Tap Retry; if it keeps failing, write to support.',
        action: 'retry',
        status
      };
    }
  }
  // No response — pure network error (DNS, TLS, abort).
  return {
    category: 'network_error',
    title: 'Connection problem',
    message: error?.message ?? 'Could not reach Bharat OS.',
    action: 'retry'
  };
}
