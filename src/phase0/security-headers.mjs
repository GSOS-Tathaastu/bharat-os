// Production security headers — Phase 4.1.
//
// One function that returns the headers object to merge into every
// HTTP response. The CSP is intentionally strict: 'self' only for
// scripts and styles, with explicit allowlist entries for the two
// CDN origins the shell legitimately depends on (esm.sh for the
// qrcode and transformers.js modules, cdn.jsdelivr.net for the
// Tesseract.js OCR data).
//
// HSTS is opt-in via `enableHsts` because in local dev (plain HTTP)
// the header would lock the user's browser into requiring HTTPS for
// localhost, which would be hostile. Production deployments set
// BHARAT_OS_HSTS=1 to enable.

const SHELL_CDN_ALLOWLIST = ['https://esm.sh', 'https://cdn.jsdelivr.net'];

const BASE_CSP_DIRECTIVES = {
  // Default: same-origin only. Every other directive narrows from
  // there.
  'default-src': ["'self'"],
  // Scripts: same-origin + the two CDNs we use for transformers.js
  // and qrcode. No 'unsafe-inline' — the shell HTML has been
  // de-inlined in Phase 4.1.
  'script-src': ["'self'", ...SHELL_CDN_ALLOWLIST],
  // Styles: same-origin only. We don't use 'unsafe-inline' even
  // though some inline styles exist in templates — the inline style
  // attribute is allowed under 'style-src-attr', which we set
  // permissively because de-inlining every style attribute is
  // out-of-scope here.
  'style-src': ["'self'"],
  'style-src-attr': ["'unsafe-inline'"],
  // Images: same-origin + data: (avatars, QR codes) + blob: (camera
  // captures). External images are not allowed.
  'img-src': ["'self'", 'data:', 'blob:'],
  // Fonts: same-origin only.
  'font-src': ["'self'"],
  // Connect: same-origin + the CDNs (for ESM lazy-imports) + wss:/
  // ws: for future WebSocket use. WebRTC peer connections do not
  // go through the CSP — they use the dedicated webrtc-src
  // directive which is implicit.
  'connect-src': ["'self'", ...SHELL_CDN_ALLOWLIST, 'wss:', 'ws:'],
  // Media: blob: for the camera video element used by §7c QR scan.
  'media-src': ["'self'", 'blob:'],
  // Workers: same-origin only. The service worker is at /shell/sw.
  'worker-src': ["'self'"],
  // Frames: none — Bharat OS never iframes anything.
  'frame-src': ["'none'"],
  // Embedding US (others framing us): none — also enforced by
  // X-Frame-Options below as a fallback for older browsers.
  'frame-ancestors': ["'none'"],
  // Base URI: lock to 'self' so a script injection can't change the
  // document base and reroute relative URLs.
  'base-uri': ["'self'"],
  // Form action: same-origin only (we use fetch + JSON, not form
  // POSTs, but tighten anyway).
  'form-action': ["'self'"],
  // Object: deprecated tags (<embed>, <object>) — block entirely.
  'object-src': ["'none'"],
  // Upgrade-insecure-requests: in production this forces any http://
  // sub-resource to be upgraded to https://. Harmless in dev.
  'upgrade-insecure-requests': []
};

function formatCsp(directives) {
  return Object.entries(directives)
    .map(([directive, values]) =>
      values.length === 0 ? directive : `${directive} ${values.join(' ')}`
    )
    .join('; ');
}

export function buildContentSecurityPolicy({ extraScriptSrc = [], extraConnectSrc = [] } = {}) {
  const directives = { ...BASE_CSP_DIRECTIVES };
  if (extraScriptSrc.length > 0) {
    directives['script-src'] = [...directives['script-src'], ...extraScriptSrc];
  }
  if (extraConnectSrc.length > 0) {
    directives['connect-src'] = [...directives['connect-src'], ...extraConnectSrc];
  }
  return formatCsp(directives);
}

export function buildSecurityHeaders({
  enableHsts = false,
  hstsMaxAgeSeconds = 60 * 60 * 24 * 365,
  permissionsAllowlist = [
    "camera=(self)",          // §7c QR scan needs this
    "microphone=(self)",      // voice intent needs this
    "geolocation=()",         // not needed; deny entirely
    "payment=()",             // we use UPI deep-links, not Payment Request API
    "usb=()",
    "interest-cohort=()"      // legacy FLoC; deny entirely
  ],
  cspExtras
} = {}) {
  const headers = {
    'content-security-policy': buildContentSecurityPolicy(cspExtras),
    // Defence-in-depth fallbacks for browsers that don't fully
    // implement CSP.
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': permissionsAllowlist.join(', '),
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin'
  };
  if (enableHsts) {
    // includeSubDomains + preload — only set this in real production
    // once you're committed to HTTPS forever on the apex + all
    // subdomains. The Phase 0 API server defaults to off; the
    // deployment Dockerfile or reverse proxy sets BHARAT_OS_HSTS=1.
    headers['strict-transport-security'] = `max-age=${hstsMaxAgeSeconds}; includeSubDomains; preload`;
  }
  return headers;
}

// Apply all security headers to a response object in one call.
// Returns the response (chainable) so the caller can keep writing
// other headers.
export function applySecurityHeaders(response, options = {}) {
  const headers = buildSecurityHeaders(options);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  return response;
}
