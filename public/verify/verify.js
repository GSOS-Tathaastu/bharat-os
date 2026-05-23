// Bharat OS verifier page — §13A #7 Trust-as-a-service.
//
// Reads the attestation ID from the query string, calls the
// server-side verify endpoint, and renders pass / expired /
// invalid / not-found into the card. No client-side crypto here —
// verification happens on the server via `verifyTrustAttestation`,
// which gives us tested behaviour and a single failure mode.

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));
}

function renderStatus({ status, reason, payload, subject, attestationId }) {
  const card = $('verifyCard');
  let badgeClass = 'invalid';
  let badgeLabel = 'INVALID';
  let lead = reason ?? 'Unknown error';

  if (status === 'valid') {
    badgeClass = 'valid';
    badgeLabel = 'VERIFIED ✓';
    lead = 'Signature verified against the subject\'s published public key.';
  } else if (status === 'expired') {
    badgeClass = 'expired';
    badgeLabel = 'EXPIRED';
    lead = 'Signature is valid but the share window has ended.';
  } else if (status === 'unknown_subject') {
    badgeClass = 'invalid';
    badgeLabel = 'UNKNOWN SUBJECT';
    lead = 'The subject identity is not registered with this Bharat OS instance.';
  } else if (status === 'signature_invalid') {
    badgeClass = 'invalid';
    badgeLabel = 'SIGNATURE INVALID';
    lead = 'Signature did not verify. The attestation may have been tampered with.';
  } else if (status === 'malformed') {
    badgeClass = 'invalid';
    badgeLabel = 'MALFORMED';
    lead = reason ?? 'Attestation envelope is not well-formed.';
  } else if (status === 'not_found') {
    badgeClass = 'invalid';
    badgeLabel = 'NOT FOUND';
    lead = 'No attestation with this ID exists on this Bharat OS server.';
  }

  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  const issuedAt = payload?.issuedAt ? new Date(payload.issuedAt).toLocaleString() : '—';
  const expiresAt = payload?.expiresAt ? new Date(payload.expiresAt).toLocaleString() : '—';

  card.innerHTML = `
    <div class="verify-status">
      <span class="verify-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      <span class="verify-status-text">${escapeHtml(lead)}</span>
    </div>

    ${payload ? `
      <dl class="verify-row">
        <dt>Attestation</dt>
        <dd class="verify-mono">${escapeHtml(attestationId)}</dd>
        <dt>Subject</dt>
        <dd>
          ${escapeHtml(subject?.displayName ?? '—')}<br/>
          <span class="verify-mono">fingerprint · ${escapeHtml(subject?.publicKeyFingerprint ?? '—')}</span>
        </dd>
        <dt>Issued for</dt>
        <dd>${escapeHtml(payload.verifierName ?? '—')} · ${escapeHtml(payload.purpose ?? '—')}</dd>
        <dt>Issued at</dt>
        <dd>${escapeHtml(issuedAt)}</dd>
        <dt>Expires at</dt>
        <dd>${escapeHtml(expiresAt)} (share window ${escapeHtml(String(payload.shareDays ?? '—'))} days)</dd>
      </dl>

      <div class="verify-claims">
        <h3>Disclosed claims (bands &amp; booleans only)</h3>
        <ul>
          ${claims
            .map((c) => `<li><strong>${escapeHtml(c.claim)}</strong><span>${escapeHtml(String(c.value))}</span></li>`)
            .join('') || '<li>none</li>'}
        </ul>
      </div>
    ` : ''}
  `;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const attestationId = params.get('attestationId');
  if (!attestationId) {
    renderStatus({
      status: 'malformed',
      reason: 'No ?attestationId=… in the URL.',
      attestationId: '—'
    });
    return;
  }
  try {
    const response = await fetch(
      `/api/attestations/${encodeURIComponent(attestationId)}/verify`,
      { method: 'POST' }
    );
    if (response.status === 404) {
      renderStatus({ status: 'not_found', reason: 'Attestation not found.', attestationId });
      return;
    }
    if (!response.ok) {
      renderStatus({
        status: 'invalid',
        reason: `HTTP ${response.status}`,
        attestationId
      });
      return;
    }
    const data = await response.json();
    renderStatus({
      attestationId,
      status: data.status,
      reason: data.reason,
      payload: data.payload,
      subject: data.subject
    });
  } catch (error) {
    renderStatus({
      status: 'invalid',
      reason: `Network error: ${error.message}`,
      attestationId
    });
  }
}

main();
