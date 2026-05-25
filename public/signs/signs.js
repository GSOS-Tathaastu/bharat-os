// Bharat OS portable-attestation signing page — Phase 5.9.
//
// Single static page; no Bharat OS install required. Reads the
// tokenId from the URL path, lets the customer sign at Tier 0
// (anonymous tap) or Tier 1 (OTP-confirmed). Tier 2 (Bharat OS
// signed) requires the customer's Bharat OS app and is surfaced
// only as a deep-link prompt — completing the signature happens
// inside the customer's app, not on this page.

(() => {
  const $ = (id) => document.getElementById(id);
  const tokenId = decodeURIComponent(location.pathname.replace(/^\/sign\//, ''));

  let tier1OtpId = null;

  function show(sectionId) {
    for (const id of ['loading', 'ready', 'tier1-phone', 'tier1-code', 'done', 'error']) {
      $(id).hidden = id !== sectionId;
    }
  }
  function showError(message) {
    $('error-message').textContent = message;
    show('error');
  }

  async function tier0() {
    try {
      const res = await fetch(`/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier0`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showError(body.error?.message ?? `Sign failed (HTTP ${res.status}).`);
        return;
      }
      show('done');
    } catch (error) {
      showError(`Network error: ${error?.message ?? error}`);
    }
  }

  function tier1() {
    show('tier1-phone');
  }

  async function tier1Send() {
    const phone = $('tier1-phone-input').value.trim();
    if (!phone) {
      showError('Enter a phone number.');
      return;
    }
    try {
      const res = await fetch(`/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(body.error?.message ?? `Send failed (HTTP ${res.status}).`);
        return;
      }
      tier1OtpId = body.otpId;
      $('tier1-phone-masked').textContent = body.phoneMasked ?? phone;
      show('tier1-code');
    } catch (error) {
      showError(`Network error: ${error?.message ?? error}`);
    }
  }

  async function tier1Verify() {
    const code = $('tier1-code-input').value.trim();
    if (!code || !tier1OtpId) {
      showError('Enter the 6-digit code.');
      return;
    }
    try {
      const res = await fetch(`/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier1/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otpId: tier1OtpId, code })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(body.error?.message ?? `Verify failed (HTTP ${res.status}).`);
        return;
      }
      show('done');
    } catch (error) {
      showError(`Network error: ${error?.message ?? error}`);
    }
  }

  function tier2() {
    // Deep-link into the customer's installed Bharat OS app. The
    // app handles fetching the canonical payload, signing locally
    // with the customer's private key, and POSTing the signature.
    // If the app isn't installed the deep link silently fails;
    // we fall back to the explanation.
    const deep = `bharat-os://sign/${encodeURIComponent(tokenId)}`;
    window.location.href = deep;
    setTimeout(() => {
      showError(
        'Bharat OS app not installed. Use the OTP option above, or install Bharat OS first and reload this page.'
      );
    }, 1500);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!tokenId) {
      showError('No token in the URL.');
      return;
    }
    show('ready');
    document.querySelectorAll('button.tier').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-tier');
        if (tier === '0') tier0();
        else if (tier === '1') tier1();
        else if (tier === '2') tier2();
      });
    });
    $('tier1-send').addEventListener('click', tier1Send);
    $('tier1-verify').addEventListener('click', tier1Verify);
  });
})();
