// Bharat OS §7c device pairing — browser-side WebRTC handshake.
//
// Two roles:
//   • initiator (the "old" device) — creates a pairing session, shows
//     a 6-digit claim code, creates an RTCPeerConnection + data channel,
//     posts its SDP offer to the signaling API, polls for the answer.
//   • receiver (the "new" device) — enters the claim code, fetches the
//     session, builds its own peer connection + data channel, creates
//     an SDP answer, posts it back.
//
// Phase 2a.17 ADR 0066: the data channel carries a two-part bundle:
//   • `publicIdentity` — public record (id, name, publicKeyPem,
//     attestations).
//   • `encryptedVault` — AES-GCM ciphertext under a PBKDF2 key derived
//     from the 12-word recovery phrase. The plaintext contains the
//     identity's privateKeyPem, vaultKeyBase64, and memory-record refs
//     — the secret material the receiver needs to *be* the same
//     person.
//
// The recovery phrase never crosses the wire. The receiver re-enters
// it locally; AES-GCM's auth tag rejects a wrong phrase outright.
// The server is signaling-only — it never sees the bundle. §15
// pointer-not-payload.

import { createVaultBundle, decryptVaultBundle } from '/shell/vault-transfer.mjs';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

async function waitForIceGathering(pc, timeoutMs = 4000) {
  if (pc.iceGatheringState === 'complete') return;
  return new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    // Bound the wait — if the candidate gathering hangs (no STUN reach)
    // we still try the partial SDP, which often works on localhost.
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, timeoutMs);
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json();
}

// Initiator side — old device that owns the identity.
export async function startInitiator({
  identity,
  fingerprint,
  recoveryPhrase,
  onProgress,
  ttlSeconds = 600
}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!recoveryPhrase) {
    throw new Error('recoveryPhrase is required to seal the vault bundle.');
  }

  onProgress?.({ phase: 'create_session' });
  const { session } = await fetchJson('/api/pairing/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      issuerIdentityId: identity.id,
      issuerDisplayName: identity.displayName,
      issuerPublicKeyFingerprint: fingerprint ?? '',
      ttlSeconds
    })
  });
  onProgress?.({ phase: 'session_created', session });

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel('bharat-os-pairing', { ordered: true });

  const connection = {
    sessionId: session.sessionId,
    claimCode: session.claimCode,
    expiresAt: session.expiresAt,
    pc,
    channel,
    bytesSent: 0,
    cancelled: false
  };

  // Offer + ICE
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  onProgress?.({ phase: 'sdp_offer_ready' });
  await fetchJson(`/api/pairing/sessions/${encodeURIComponent(session.sessionId)}/sdp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offer: pc.localDescription })
  });

  // Poll for the receiver's answer
  const pollInterval = 1500;
  const maxWaitMs = ttlSeconds * 1000;
  const startedAt = Date.now();
  let claimed = null;
  while (Date.now() - startedAt < maxWaitMs && !connection.cancelled) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const polled = await fetchJson(
      `/api/pairing/sessions/${encodeURIComponent(session.sessionId)}`
    );
    if (polled.session?.sdp?.answer && polled.session.status === 'claimed') {
      claimed = polled.session;
      break;
    }
    if (polled.session?.status === 'expired') {
      throw new Error('Pairing session expired before the new device claimed it.');
    }
    onProgress?.({ phase: 'waiting_for_claim', session: polled.session });
  }
  if (!claimed) throw new Error('Pairing session timed out.');

  onProgress?.({ phase: 'answer_received' });
  await pc.setRemoteDescription(claimed.sdp.answer);

  // Wait for data channel to open
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Data channel did not open in time.')), 15000);
    channel.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    channel.addEventListener('error', (event) => {
      clearTimeout(t);
      reject(new Error(`Data channel error: ${event.error?.message ?? 'unknown'}`));
    });
  });

  onProgress?.({ phase: 'channel_open' });

  // Phase 2a.17 ADR 0066 — two-part bundle:
  //   1. `publicIdentity` — public record (id, name, publicKeyPem,
  //      attestations).
  //   2. `encryptedVault` — AES-GCM ciphertext wrapping the
  //      privateKeyPem, vaultKeyBase64, and memory-record refs. The
  //      key is derived from the user's 12-word recovery phrase via
  //      PBKDF2; the phrase never crosses the wire.
  onProgress?.({ phase: 'fetching_vault_snapshot' });
  const snapshot = await fetchJson(
    `/api/identities/${encodeURIComponent(identity.id)}/vault-snapshot`
  );
  const fullIdentity = snapshot.identity;

  onProgress?.({ phase: 'encrypting_vault', recordCount: snapshot.memoryRecordRefs.length });
  const encryptedVault = await createVaultBundle({
    identity: fullIdentity,
    recoveryPhrase,
    memoryRecordRefs: snapshot.memoryRecordRefs ?? []
  });

  const bundle = {
    protocolVersion: 'bos.phase2a.pairing-bundle.v1',
    transferredAt: new Date().toISOString(),
    publicIdentity: {
      id: identity.id,
      displayName: identity.displayName,
      publicKeyPem: identity.publicKeyPem,
      attestations: identity.attestations ?? {}
    },
    encryptedVault,
    note: 'publicIdentity + encryptedVault. The receiver must enter the recovery phrase to decrypt the vault. Plaintext never crosses the wire.'
  };
  const bundleText = JSON.stringify(bundle);
  channel.send(bundleText);
  connection.bytesSent = bundleText.length;

  // Wait for receiver ack
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Receiver did not ack the bundle.')), 10000);
    channel.addEventListener('message', (event) => {
      try {
        const ack = JSON.parse(event.data);
        if (ack.ack === 'received') {
          clearTimeout(t);
          resolve();
        }
      } catch (_err) {
        // ignore non-JSON frames
      }
    }, { once: true });
  });

  onProgress?.({ phase: 'bundle_acked' });

  await fetchJson(`/api/pairing/sessions/${encodeURIComponent(session.sessionId)}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bytesTransferred: connection.bytesSent })
  });

  onProgress?.({ phase: 'completed', bytes: connection.bytesSent });

  try {
    channel.close();
    pc.close();
  } catch (_err) {
    // already closed
  }

  return { session, bytesSent: connection.bytesSent };
}

// Receiver side — new device claiming an identity transfer.
//
// `promptForRecoveryPhrase` is an async callback the shell supplies;
// it must return the 12-word phrase the user reads aloud / scans from
// the old device. Decryption is local — the phrase never leaves the
// receiver's browser.
export async function startReceiver({
  claimCode,
  receiverFingerprint,
  promptForRecoveryPhrase,
  onProgress
}) {
  if (!claimCode) throw new Error('claimCode is required.');
  if (typeof promptForRecoveryPhrase !== 'function') {
    throw new Error('promptForRecoveryPhrase callback is required.');
  }

  onProgress?.({ phase: 'lookup' });
  const { session } = await fetchJson(
    `/api/pairing/sessions/by-code/${encodeURIComponent(claimCode)}`
  );
  if (!session?.sdp?.offer) {
    throw new Error('Pairing session has no SDP offer yet — try again in a moment.');
  }
  onProgress?.({ phase: 'session_found', session });

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  let dataChannelResolver;
  const dataChannelReady = new Promise((resolve) => {
    dataChannelResolver = resolve;
  });
  pc.addEventListener('datachannel', (event) => {
    dataChannelResolver(event.channel);
  });

  await pc.setRemoteDescription(session.sdp.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  onProgress?.({ phase: 'sdp_answer_ready' });

  await fetchJson(`/api/pairing/sessions/${encodeURIComponent(session.sessionId)}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      receiverFingerprint: receiverFingerprint ?? 'demo-receiver',
      sdpAnswer: pc.localDescription
    })
  });

  const channel = await Promise.race([
    dataChannelReady,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('No data channel arrived in time.')), 15000)
    )
  ]);
  onProgress?.({ phase: 'channel_open' });

  const bundle = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Did not receive the identity bundle in time.')), 15000);
    channel.addEventListener('message', (event) => {
      clearTimeout(t);
      try {
        resolve(JSON.parse(event.data));
      } catch (err) {
        reject(err);
      }
    }, { once: true });
  });

  channel.send(JSON.stringify({ ack: 'received', at: new Date().toISOString() }));
  onProgress?.({ phase: 'bundle_received', bundle });

  // Phase 2a.17 — decrypt the vault on the receiver. If the bundle
  // doesn't carry an `encryptedVault` (older sender), we still surface
  // the public identity so existing pairings keep working.
  let decryptedVault = null;
  if (bundle?.encryptedVault) {
    onProgress?.({ phase: 'awaiting_recovery_phrase' });
    let lastError = null;
    for (let attempt = 0; attempt < 3 && !decryptedVault; attempt += 1) {
      const phrase = await promptForRecoveryPhrase({
        attempt,
        lastError: lastError ? String(lastError.message ?? lastError) : null
      });
      if (!phrase) {
        throw new Error('Receiver cancelled before entering the recovery phrase.');
      }
      try {
        decryptedVault = await decryptVaultBundle(bundle.encryptedVault, phrase);
      } catch (error) {
        lastError = error;
        onProgress?.({ phase: 'recovery_phrase_rejected', reason: error.message });
      }
    }
    if (!decryptedVault) {
      throw new Error('Recovery phrase rejected three times — pairing aborted.');
    }
    onProgress?.({ phase: 'vault_decrypted', recordCount: decryptedVault.memoryRecordRefs?.length ?? 0 });
  }

  try {
    channel.close();
    pc.close();
  } catch (_err) {
    // already closed
  }

  return { session, bundle, decryptedVault };
}
