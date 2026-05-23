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
// Once the data channel opens, the initiator sends a JSON identity
// bundle (public identity record only — the vault encryption is a §7c
// hardening item). Receiver stores the bundle in localStorage as a new
// household member.
//
// The server is signaling-only — it never sees the bundle. §15
// pointer-not-payload.

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
  onProgress,
  ttlSeconds = 600
}) {
  if (!identity?.id) throw new Error('identity is required.');

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

  // Send the identity bundle. Phase 2a.14: public identity only — vault
  // encryption + recovery-phrase-driven decryption is a §7c hardening
  // step. The bundle shape stays forward-compatible.
  const bundle = {
    protocolVersion: 'bos.phase2a.pairing-bundle.v0',
    transferredAt: new Date().toISOString(),
    publicIdentity: {
      id: identity.id,
      displayName: identity.displayName,
      publicKeyPem: identity.publicKeyPem,
      attestations: identity.attestations ?? {}
    },
    note: 'Public identity record only. Vault keys + memory plaintext are NOT transferred in this scaffold.'
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
export async function startReceiver({
  claimCode,
  receiverFingerprint,
  onProgress
}) {
  if (!claimCode) throw new Error('claimCode is required.');

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

  try {
    channel.close();
    pc.close();
  } catch (_err) {
    // already closed
  }

  return { session, bundle };
}
