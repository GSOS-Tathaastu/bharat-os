// Bharat OS — vernacular shell prototype.
// The user-facing surface. Voice-first or text. Picks a persona, sends
// intent to the same /api/orchestrations the operator console uses.
// Renders an action-type-specific card in the user's detected language.
// Phase 1.43 — first cut of UI 2 (§17 / docs/ui/ROADMAP.md).

const $ = (id) => document.getElementById(id);

const SUGGESTIONS_BY_LANG = {
  'hi-IN': [
    'मुझे योजना का लाभ चाहिए',
    'टैक्सी बुक करो',
    'मेरा सेहत रिकॉर्ड दिखाओ'
  ],
  'hi-Latn-IN': [
    'Mujhe sarkari yojana ke labh chahiye',
    'Mujhe ek cab book karo',
    'Mera bank khata kholna hai'
  ],
  'mr-IN': ['मला सरकारी योजना हवी', 'टॅक्सी बुक कर', 'आरोग्य नोंदणी दाखव'],
  'ta-IN': ['எனக்கு திட்டம் வேண்டும்', 'டாக்ஸி புக் பண்ணு', 'மருத்துவ பதிவு காட்டு'],
  'bn-IN': ['আমার সরকারি প্রকল্প দরকার', 'ট্যাক্সি বুক করো', 'স্বাস্থ্য রেকর্ড দেখাও'],
  'bho-IN': ['हमरा सरकारी योजना चाहीं', 'टैक्सी बुक करा', 'सेहत के रिकार्ड देखावा'],
  'en-IN': [
    'I want to apply for a small loan',
    'Book me a cab',
    'Show me my health record'
  ]
};

const GREETING_BY_LANG = {
  'hi-IN': { title: 'आज आप क्या करना चाहते हैं?', sub: 'अपनी भाषा में बोलें या लिखें।' },
  'hi-Latn-IN': { title: 'Aaj aap kya karna chahte hain?', sub: 'Apni bhasha mein bolein ya likhein.' },
  'mr-IN': { title: 'आज तुम्हाला काय करायचे आहे?', sub: 'तुमच्या भाषेत बोला किंवा लिहा.' },
  'ta-IN': { title: 'இன்று என்ன செய்ய விரும்புகிறீர்கள்?', sub: 'உங்கள் மொழியில் பேசுங்கள் அல்லது எழுதுங்கள்.' },
  'bn-IN': { title: 'আজ আপনি কী করতে চান?', sub: 'নিজের ভাষায় বলুন বা লিখুন।' },
  'bho-IN': { title: 'राउर का करे के बा?', sub: 'अपन भाषा में बोलीं।' },
  'en-IN': { title: 'What do you want to do today?', sub: 'Speak in any language. Hindi · Marathi · Bhojpuri · Tamil · Bengali · English.' }
};

const ACTION_ICON_BY_TYPE = {
  regulated_onboarding: '🏦',
  scheme_delivery: '🪙',
  health_record_read: '🩺',
  labor_match_post: '🛠️',
  service_booking: '🚖',
  mesh_storage: '💾'
};

const ACTION_LABEL_BY_TYPE = {
  regulated_onboarding: 'Regulated onboarding',
  scheme_delivery: 'Scheme eligibility',
  health_record_read: 'Health record',
  labor_match_post: 'Labor matching',
  service_booking: 'Service booking',
  mesh_storage: 'Mesh storage'
};

// localStorage keys for the device model. A real Bharat OS device knows
// only its own household — owner + optional household members added by
// §9A in-person handshake. The demo lets you "re-initialize the device"
// as a different persona to walk through §9C vignettes, but that is
// framed as switching pretend-devices, not switching profiles on the
// same device.
const LS_KEY_OWNER = 'bharat-os.shell.deviceOwnerId';
const LS_KEY_HOUSEHOLD = 'bharat-os.shell.householdIds';

const state = {
  identities: [],
  activeIdentity: null,
  deviceOwnerId: null,
  householdMemberIds: [],
  recognition: null,
  recognizing: false
};

function loadDeviceState() {
  state.deviceOwnerId = localStorage.getItem(LS_KEY_OWNER);
  try {
    state.householdMemberIds = JSON.parse(localStorage.getItem(LS_KEY_HOUSEHOLD) || '[]');
  } catch (_error) {
    state.householdMemberIds = [];
  }
}

function saveDeviceState() {
  if (state.deviceOwnerId) {
    localStorage.setItem(LS_KEY_OWNER, state.deviceOwnerId);
  } else {
    localStorage.removeItem(LS_KEY_OWNER);
  }
  localStorage.setItem(LS_KEY_HOUSEHOLD, JSON.stringify(state.householdMemberIds));
}

function householdSet() {
  const set = new Set();
  if (state.deviceOwnerId) set.add(state.deviceOwnerId);
  for (const id of state.householdMemberIds) set.add(id);
  return set;
}

function reinitializeDeviceAs(identityId) {
  state.deviceOwnerId = identityId;
  state.householdMemberIds = [];
  saveDeviceState();
  const owner = state.identities.find((i) => i.id === identityId);
  if (owner) setActiveProfile(owner);
  renderProfileList();
  showToast('Device re-initialized. Real Bharat OS would only ever know one household.');
}

function addHouseholdMember(identityId) {
  if (!state.deviceOwnerId) {
    state.deviceOwnerId = identityId;
  } else if (!state.householdMemberIds.includes(identityId) && identityId !== state.deviceOwnerId) {
    state.householdMemberIds.push(identityId);
  }
  saveDeviceState();
  renderProfileList();
  showToast('Added to household. (Real Bharat OS requires a §9A in-person handshake — this demo skips it.)');
}

function setBrandSub(localeOrLang) {
  $('brandSub').textContent = `${localeOrLang ?? 'en-IN'} · vernacular shell`;
}

function profileInitials(name) {
  if (!name) return '?';
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function setActiveProfile(identity) {
  state.activeIdentity = identity;
  if (!identity) {
    $('profileAvatar').textContent = '--';
    $('profileName').textContent = 'No profile';
    $('profileLanguage').textContent = 'English';
    return;
  }
  $('profileAvatar').textContent = profileInitials(identity.displayName ?? '?');
  $('profileName').textContent = identity.displayName ?? identity.id;
  $('profileLanguage').textContent = inferProfileLanguage(identity);
  applyGreeting(profileLocale(identity));
  renderSuggestions(profileLocale(identity));
  loadRecent();
}

function inferProfileLanguage(identity) {
  const text = (identity.displayName ?? '').toLowerCase();
  if (text.includes('tamil')) return 'Tamil';
  if (text.includes('marathi')) return 'Marathi';
  if (text.includes('bengali')) return 'Bengali';
  if (text.includes('bhojpuri') || text.includes('eastern up') || text.includes('patna')) return 'Bhojpuri';
  if (text.includes('rural') || text.includes('varanasi')) return 'Hindi';
  return 'English';
}

function profileLocale(identity) {
  const lang = inferProfileLanguage(identity);
  return (
    {
      Hindi: 'hi-IN',
      Marathi: 'mr-IN',
      Bhojpuri: 'bho-IN',
      Tamil: 'ta-IN',
      Bengali: 'bn-IN',
      English: 'en-IN'
    }[lang] ?? 'en-IN'
  );
}

function applyGreeting(locale) {
  const greeting = GREETING_BY_LANG[locale] ?? GREETING_BY_LANG['en-IN'];
  $('promptGreeting').textContent = greeting.title;
  $('promptGreetingSub').textContent = greeting.sub;
  setBrandSub(locale);
}

function renderSuggestions(locale) {
  const items = SUGGESTIONS_BY_LANG[locale] ?? SUGGESTIONS_BY_LANG['en-IN'];
  const row = $('suggestionRow');
  row.innerHTML = items
    .map((text) => `<button class="chip" type="button" data-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`)
    .join('');
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function shortId(id) {
  return String(id ?? '').slice(0, 24);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function loadIdentities() {
  loadDeviceState();
  const data = await fetchJson('/api/identities');
  state.identities = data.identities ?? [];

  if (state.identities.length === 0) {
    renderProfileList();
    return;
  }

  // First-run device claim: pick the first non-bootstrap identity and
  // remember the choice. Subsequent loads honour the stored owner.
  if (!state.deviceOwnerId) {
    const owner = state.identities.find((id) => !/(bootstrap|tenant)/i.test(id.displayName ?? '')) ?? state.identities[0];
    state.deviceOwnerId = owner.id;
    saveDeviceState();
  }

  // Re-bind to the stored owner unless they no longer exist (e.g. demo
  // store rotated), in which case re-claim.
  const owner =
    state.identities.find((i) => i.id === state.deviceOwnerId) ??
    state.identities.find((id) => !/(bootstrap|tenant)/i.test(id.displayName ?? '')) ??
    state.identities[0];
  if (owner.id !== state.deviceOwnerId) {
    state.deviceOwnerId = owner.id;
    saveDeviceState();
  }
  setActiveProfile(owner);
  renderProfileList();
}

function renderProfileList() {
  const list = $('profileList');
  const household = householdSet();
  const householdIdentities = state.identities.filter((i) => household.has(i.id));
  const otherIdentities = state.identities.filter(
    (i) => !household.has(i.id) && !/(bootstrap|tenant)/i.test(i.displayName ?? '')
  );

  const renderRow = (identity, kind) => {
    const active = state.activeIdentity?.id === identity.id ? ' active' : '';
    const extra =
      kind === 'household'
        ? ''
        : `<button class="secondary-action" type="button" data-add-household="${escapeHtml(identity.id)}">Add to household</button>`;
    const primaryAction =
      kind === 'household'
        ? `data-identity-id="${escapeHtml(identity.id)}"`
        : `data-reinit-as="${escapeHtml(identity.id)}"`;
    return `
      <li>
        <button type="button" class="${active.trim()}" ${primaryAction}>
          <span class="avatar">${escapeHtml(profileInitials(identity.displayName))}</span>
          <span>
            <span class="profile-list-name">${escapeHtml(identity.displayName ?? identity.id)}</span><br/>
            <span class="profile-list-id">${escapeHtml(shortId(identity.id))}</span>
          </span>
        </button>
        ${extra}
      </li>
    `;
  };

  let html = '<li class="profile-section"><h4>Your household — this device</h4></li>';
  if (householdIdentities.length === 0) {
    html += '<li class="profile-empty">No profiles claimed on this device yet.</li>';
  } else {
    html += householdIdentities.map((i) => renderRow(i, 'household')).join('');
  }

  if (otherIdentities.length > 0) {
    html += `
      <li class="profile-section">
        <h4>Demo: switch this device to another persona</h4>
        <p class="profile-demo-note">
          A real Bharat OS device only knows your household. This list is
          <strong>demo-only</strong> — tapping a persona re-initializes the device
          as if it were that person's phone. Adding to your household would, in
          production, require a §9A in-person handshake.
        </p>
      </li>
    `;
    html += otherIdentities.map((i) => renderRow(i, 'demo')).join('');
  }

  list.innerHTML = html;
}

async function loadRecent() {
  if (!state.activeIdentity) return;
  try {
    const data = await fetchJson('/api/orchestrations');
    const all = data.orchestrations ?? [];
    const mine = all
      .filter((o) => o.actionRequest?.actorId === state.activeIdentity.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5);
    const list = $('recentList');
    if (mine.length === 0) {
      list.innerHTML = '<li class="recent-empty">No activity yet on this profile. Try a suggestion above.</li>';
      return;
    }
    list.innerHTML = mine
      .map((o) => {
        const intent = o.intent?.intentText ?? '--';
        const icon = ACTION_ICON_BY_TYPE[o.actionRequest?.actionType] ?? '•';
        return `
          <li>
            <span aria-hidden="true">${icon}</span>
            <span class="recent-intent" title="${escapeHtml(intent)}">${escapeHtml(intent)}</span>
            <span class="recent-status ${escapeHtml(o.status)}">${escapeHtml(o.status ?? '--')}</span>
          </li>
        `;
      })
      .join('');
  } catch (error) {
    console.warn('loadRecent', error);
  }
}

function sanityCheckActor() {
  if (!state.activeIdentity) {
    showToast('Pick a profile first.');
    return false;
  }
  return true;
}

function buildIntentPayload(intentText) {
  const actor = state.activeIdentity;
  const locale = profileLocale(actor);
  return {
    actorId: actor.id,
    intentText,
    locale,
    execute: true
  };
}

async function sendIntent() {
  const intent = $('intentInput').value.trim();
  if (!intent) {
    showToast('Type or speak your intent first.');
    return;
  }
  if (!sanityCheckActor()) return;

  const sendButton = $('sendButton');
  sendButton.disabled = true;
  $('flowSection').hidden = false;
  $('flowDetected').textContent = 'Sending intent…';
  $('flowList').innerHTML = '<li>routing to /api/orchestrations</li>';
  $('flowConfidence').textContent = '';
  $('resultSection').hidden = true;

  try {
    const data = await fetchJson('/api/orchestrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildIntentPayload(intent))
    });
    renderOrchestration(data.orchestration);
    await loadRecent();
  } catch (error) {
    $('flowDetected').textContent = 'Network error';
    $('flowList').innerHTML = `<li class="blocked">${escapeHtml(error.message)}</li>`;
    showToast(error.message);
  } finally {
    sendButton.disabled = false;
  }
}

function renderOrchestration(o) {
  if (!o) return;
  const intent = o.intent ?? {};
  const action = o.actionRequest ?? {};
  const detected = intent.detectedLocale ?? 'en-IN';
  const lang = intent.detectedLanguageId ?? detected.split('-')[0];
  $('flowDetected').textContent = `${ACTION_LABEL_BY_TYPE[action.actionType] ?? action.actionType} · ${detected} (${lang})`;
  $('flowConfidence').textContent = `confidence ${(Math.round(((intent.languageConfidence ?? 0) * 100)))}%`;

  const planRows = (o.plan ?? [])
    .map((step) => {
      const cls = step.status === 'passed' || step.status === 'complete' || step.status === 'ready_or_executed' ? 'complete' :
                  step.status === 'blocked' ? 'blocked' : '';
      return `
        <li class="${cls}">
          <span>${escapeHtml(step.step.replace(/_/g, ' '))}</span>
          <span class="flow-layer">${escapeHtml(step.layer ?? '')} · ${escapeHtml(step.status ?? '')}</span>
        </li>
      `;
    })
    .join('');
  $('flowList').innerHTML = planRows;

  // Result card
  const section = $('resultSection');
  section.hidden = false;
  const status = o.status ?? 'planned';
  const statusBadge = status === 'completed' ? '' : status === 'blocked' ? ' blocked' : ' planned';
  const icon = ACTION_ICON_BY_TYPE[action.actionType] ?? '•';
  const actionLabel = ACTION_LABEL_BY_TYPE[action.actionType] ?? action.actionType ?? 'Action';
  $('resultHeader').innerHTML = `
    <span aria-hidden="true">${icon}</span>
    <span>${escapeHtml(actionLabel)}</span>
    <span class="badge${statusBadge}">${escapeHtml(status)}</span>
  `;

  const localized = o.localizedResponse;
  const vernacular = localized
    ? `<div class="vernacular" lang="${escapeHtml(localized.locale)}">${escapeHtml(localized.text)}</div>`
    : '';

  const receipt = o.execution?.toolReceipt ?? {};
  const detail = renderActionDetail(action.actionType, receipt, o);
  $('resultBody').innerHTML = `
    ${vernacular}
    ${detail}
  `;

  const failed = o.failedPolicies ?? [];
  const evidenceParts = [
    `orchestrationId · ${shortId(o.orchestrationId)}`,
    `decisionId · ${shortId(o.decisionId)}`,
    `auditHash · ${shortId(o.auditHash)}`
  ];
  if (failed.length > 0) evidenceParts.push(`failed · ${failed.join(', ')}`);
  $('resultEvidence').textContent = evidenceParts.join('  ·  ');
}

function renderActionDetail(actionType, receipt, orchestration) {
  if (actionType === 'service_booking') {
    const chosen = receipt.chosen ?? {};
    const fare = receipt.fare ? `₹${receipt.fare.amount} ${receipt.fare.currency}` : '--';
    const quote = receipt.quote ?? {};
    const route = [quote.from, quote.to].filter(Boolean).join(' → ') || '--';
    return `
      <dl class="result-detail-grid">
        <dt>Provider</dt><dd>${escapeHtml(chosen.providerName ?? '--')} (${escapeHtml(chosen.source ?? '--')})</dd>
        <dt>Vertical</dt><dd>${escapeHtml(receipt.vertical ?? '--')}</dd>
        <dt>Route</dt><dd>${escapeHtml(route)}</dd>
        <dt>Fare</dt><dd>${escapeHtml(fare)}</dd>
        <dt>Commission</dt><dd>${chosen.commissionPct ?? 0}% (native marketplace)</dd>
        <dt>Booking ref</dt><dd>${escapeHtml(shortId(receipt.bookingRef ?? ''))}</dd>
      </dl>
    `;
  }
  if (actionType === 'labor_match_post') {
    return `
      <dl class="result-detail-grid">
        <dt>Tool</dt><dd>${escapeHtml(receipt.toolId ?? '--')}</dd>
        <dt>Escrow</dt><dd>${escapeHtml(receipt.escrowId ?? '--')}</dd>
        <dt>Amount</dt><dd>₹${receipt.amount ?? '--'} ${escapeHtml(receipt.currency ?? 'INR')}</dd>
        <dt>Worker charged</dt><dd>${receipt.workerCharged === false ? 'No (§15)' : '--'}</dd>
      </dl>
    `;
  }
  if (actionType === 'scheme_delivery') {
    const docs = receipt.documents ?? [];
    return `
      <div>DigiLocker references returned (no raw files):</div>
      <ul>${docs.map((d) => `<li>${escapeHtml(d.type)}: <code>${escapeHtml(shortId(d.ref))}</code></li>`).join('')}</ul>
    `;
  }
  if (actionType === 'health_record_read') {
    const signal = receipt.healthSignal ?? {};
    return `
      <dl class="result-detail-grid">
        <dt>Conditions</dt><dd>${signal.conditionCount ?? '--'}</dd>
        <dt>Latest record</dt><dd>${escapeHtml(signal.latestRecordMonth ?? '--')}</dd>
        <dt>Bundle ref</dt><dd>${escapeHtml(shortId(signal.recordBundleRef ?? ''))}</dd>
        <dt>Raw records</dt><dd>${receipt.rawRecordsReturned === false ? 'Not exposed (§15)' : '--'}</dd>
      </dl>
    `;
  }
  if (actionType === 'regulated_onboarding') {
    const fin = receipt.financialSignal ?? {};
    return `
      <dl class="result-detail-grid">
        <dt>Income band</dt><dd>${escapeHtml(fin.incomeBand ?? '--')}</dd>
        <dt>Cashflow score</dt><dd>${fin.cashflowScore ?? '--'}</dd>
        <dt>Data window</dt><dd>${fin.dataWindowDays ?? '--'} days</dd>
        <dt>Raw transactions</dt><dd>${receipt.rawTransactionsReturned === false ? 'Not exposed (§15)' : '--'}</dd>
      </dl>
    `;
  }
  if (actionType === 'mesh_storage') {
    return `
      <dl class="result-detail-grid">
        <dt>Storage class</dt><dd>${escapeHtml(receipt.storageClass ?? '--')}</dd>
        <dt>Placement</dt><dd>${escapeHtml(receipt.placementPolicy ?? '--')}</dd>
        <dt>Payload</dt><dd>${receipt.payloadIncluded === false ? 'Pointer-not-payload (§15)' : '--'}</dd>
      </dl>
    `;
  }
  return `<pre class="result-detail-grid">${escapeHtml(JSON.stringify(receipt, null, 2))}</pre>`;
}

// ─── Voice input (Web Speech API) ─────────────────────────────────────────
// Voice in the browser is fragile: Chrome's SpeechRecognition needs a
// secure context (HTTPS / localhost) AND a network connection to Google's
// cloud STT. Firefox doesn't ship it at all. On a LAN IP over HTTP (the
// phone PWA case) it will fail with "service-not-allowed". So we map
// every error to a useful sentence and keep the text path obvious.

const VOICE_ERROR_HELP = {
  'not-allowed': 'Mic permission denied. Allow microphone in your browser settings — or just type below.',
  'service-not-allowed': 'Voice needs HTTPS or localhost. On your phone, type below — or set up an HTTPS tunnel for the demo.',
  'network': 'Voice service unreachable. Chrome\'s STT needs internet. Type below instead.',
  'audio-capture': 'No microphone detected. Type your intent below.',
  'no-speech': 'Didn\'t catch any speech — try again, or type below.',
  'aborted': null, // silent — user cancelled
  'language-not-supported': 'Your browser doesn\'t support this language for voice. Type below.'
};

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('micButton');
  const micLabel = $('micLabel');

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micLabel.textContent = 'Voice unavailable — type below';
    micBtn.title = 'This browser does not support speech recognition. Use Chrome desktop or Chrome Android on localhost / HTTPS.';
    return;
  }

  // Detect insecure context (LAN IP over HTTP). Don't disable the button,
  // but warn so the user knows what to expect.
  if (window.isSecureContext === false) {
    micBtn.title = 'Voice may not work here — Web Speech API requires HTTPS or localhost. Text input always works.';
    micLabel.textContent = 'Hold to try voice (LAN/HTTP)';
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join('');
    $('intentInput').value = transcript;
  };

  recognition.onstart = () => {
    state.recognizing = true;
    micBtn.setAttribute('aria-pressed', 'true');
    micLabel.textContent = 'Listening…';
  };

  recognition.onend = () => {
    state.recognizing = false;
    micBtn.setAttribute('aria-pressed', 'false');
    if (window.isSecureContext === false) {
      micLabel.textContent = 'Hold to try voice (LAN/HTTP)';
    } else {
      micLabel.textContent = 'Hold to speak';
    }
  };

  recognition.onerror = (event) => {
    state.recognizing = false;
    micBtn.setAttribute('aria-pressed', 'false');
    micLabel.textContent = 'Hold to speak';
    const code = event.error ?? 'unknown';
    const help = code in VOICE_ERROR_HELP ? VOICE_ERROR_HELP[code] : `Voice error: ${code}. Try typing instead.`;
    if (help) showToast(help);
    // Bring focus to the textarea so the user can immediately type.
    if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'network' || code === 'audio-capture') {
      $('intentInput').focus();
    }
  };

  state.recognition = recognition;
}

function toggleVoice() {
  if (!state.recognition) {
    $('intentInput').focus();
    return;
  }
  if (state.recognizing) {
    state.recognition.stop();
    return;
  }
  if (state.activeIdentity) {
    state.recognition.lang = profileLocale(state.activeIdentity);
  } else {
    state.recognition.lang = 'en-IN';
  }
  $('intentInput').value = '';
  try {
    state.recognition.start();
  } catch (error) {
    // Some browsers throw if start() is called twice or in quick succession.
    showToast(`Could not start voice: ${error.message}. Type below instead.`);
    $('intentInput').focus();
  }
}

// ─── Wire-up ──────────────────────────────────────────────────────────────
$('sendButton').addEventListener('click', sendIntent);
$('intentInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendIntent();
  }
});

$('suggestionRow').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-suggestion]');
  if (!chip) return;
  $('intentInput').value = chip.dataset.suggestion;
  sendIntent();
});

$('micButton').addEventListener('click', toggleVoice);

$('profileButton').addEventListener('click', () => {
  $('profileSheet').hidden = false;
});
$('closeProfileSheet').addEventListener('click', () => {
  $('profileSheet').hidden = true;
});
$('profileList').addEventListener('click', (event) => {
  const switchButton = event.target.closest('[data-identity-id]');
  if (switchButton) {
    const identity = state.identities.find((i) => i.id === switchButton.dataset.identityId);
    if (identity) {
      setActiveProfile(identity);
      renderProfileList();
      $('profileSheet').hidden = true;
    }
    return;
  }
  const reinitButton = event.target.closest('[data-reinit-as]');
  if (reinitButton) {
    reinitializeDeviceAs(reinitButton.dataset.reinitAs);
    $('profileSheet').hidden = true;
    return;
  }
  const addButton = event.target.closest('[data-add-household]');
  if (addButton) {
    addHouseholdMember(addButton.dataset.addHousehold);
  }
});

$('refreshRecent').addEventListener('click', loadRecent);

setupVoice();
loadIdentities().catch((error) => {
  showToast(`Could not reach Bharat OS: ${error.message}`);
});
