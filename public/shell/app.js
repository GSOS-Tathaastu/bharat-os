import * as ondeviceSlm from './ondevice-slm.mjs';
import * as pairing from './pairing.mjs';

// Bharat OS — vernacular shell prototype.
// The user-facing surface. Voice-first or text. Picks a persona, sends
// intent to the same /api/orchestrations the operator console uses.
// Renders an action-type-specific card in the user's detected language.
// Phase 1.43 — first cut of UI 2 (§17 / docs/ui/ROADMAP.md).

const $ = (id) => document.getElementById(id);

const SUGGESTIONS_BY_LANG = {
  'hi-IN': [
    'मुझे ₹50,000 का छोटा कारोबारी लोन चाहिए',
    'ऑफिस से घर तक टैक्सी बुक करो',
    'मेरा HbA1c रिकॉर्ड दिखाओ',
    'मुझे मकान मालिक के लिए विश्वास प्रमाण-पत्र चाहिए',
    'आज का ब्रीफ सुनाओ',
    'कल रात बैंगलोर से हैदराबाद की ट्रेन बुक करो'
  ],
  'hi-Latn-IN': [
    'Mujhe ₹50,000 ka chhota karza chahiye',
    'Office se ghar tak cab book karo',
    'Mera health record dikhao',
    'Landlord ke liye trust attestation chahiye',
    'Aaj ka brief sunao',
    'Bangalore se Hyderabad ki train book karo'
  ],
  'mr-IN': [
    'मला छोटा व्यवसाय कर्ज हवे',
    'ऑफिस ते घर टॅक्सी बुक कर',
    'माझा आरोग्य रेकॉर्ड दाखव',
    'मला मकान मालकासाठी विश्वास प्रमाणपत्र हवे',
    'आजचा संक्षेप सांग',
    'पुणे ते मुंबई ट्रेन बुक कर'
  ],
  'ta-IN': [
    'எனக்கு ₹50,000 சிறு வணிக கடன் வேண்டும்',
    'அலுவலகத்திலிருந்து வீட்டுக்கு டாக்ஸி புக் பண்ணு',
    'என் சர்க்கரை நோய் பதிவு காட்டு',
    'வீட்டு உரிமையாளருக்கு நம்பிக்கை சான்றிதழ் வேண்டும்',
    'இன்றைய சுருக்கம் சொல்',
    'பெங்களூரிலிருந்து சென்னை ரயில் புக் பண்ணு'
  ],
  'bn-IN': [
    'আমার ছোট ব্যবসার জন্য ৫০,০০০ টাকার ঋণ দরকার',
    'অফিস থেকে বাড়ি ট্যাক্সি বুক করো',
    'আমার স্বাস্থ্য রেকর্ড দেখাও',
    'বাড়িওয়ালার জন্য বিশ্বাস সনদ দাও',
    'আজকের সংক্ষেপ বলো',
    'কলকাতা থেকে দিল্লি ট্রেন বুক করো'
  ],
  'bho-IN': [
    'हमरा छोटा करजा चाहीं',
    'ऑफिस से घर ले टैक्सी बुक करा',
    'सेहत के रिकार्ड देखावा',
    'मकान मालिक खातिर भरोसा के प्रमाण-पत्र दा',
    'आज के ब्रीफ सुनावा',
    'पटना से दिल्ली के ट्रेन बुक करा'
  ],
  'en-IN': [
    'I want a ₹50,000 small business loan',
    'Book a cab from office to home',
    'Show me my health record',
    'Generate a trust attestation for my landlord',
    'Give me my morning brief',
    'Book a Bangalore to Hyderabad train for tomorrow night'
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
  mesh_storage: '💾',
  trust_attestation: '🛡️',
  daily_brief: '📋'
};

const ACTION_LABEL_BY_TYPE = {
  regulated_onboarding: 'Regulated onboarding',
  scheme_delivery: 'Scheme eligibility',
  health_record_read: 'Health record',
  labor_match_post: 'Labor matching',
  service_booking: 'Service booking',
  mesh_storage: 'Mesh storage',
  trust_attestation: 'Trust attestation',
  daily_brief: 'Daily brief'
};

// localStorage keys for the device model. A real Bharat OS device knows
// only its own household — owner + optional household members added by
// §9A in-person handshake. The demo lets you "re-initialize the device"
// as a different persona to walk through §9C vignettes, but that is
// framed as switching pretend-devices, not switching profiles on the
// same device.
const LS_KEY_OWNER = 'bharat-os.shell.deviceOwnerId';
const LS_KEY_HOUSEHOLD = 'bharat-os.shell.householdIds';
const LS_KEY_ONBOARDING_SEEN = 'bharat-os.shell.onboardingSeen.v1';

const state = {
  identities: [],
  activeIdentity: null,
  deviceOwnerId: null,
  householdMemberIds: [],
  recognition: null,
  recognizing: false,
  voiceRuntimePlan: null,
  ttsRuntimePlan: null,
  onDeviceRuntimePlan: null,
  lastLocalizedResponse: null,
  profileCredentials: [],
  workerAlertSubscription: null,
  healthDocImage: null
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
  refreshFlagReportSubjectOptions();
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
    state.voiceRuntimePlan = null;
    state.ttsRuntimePlan = null;
    state.onDeviceRuntimePlan = null;
    state.lastLocalizedResponse = null;
    state.profileCredentials = [];
    state.workerAlertSubscription = null;
    updateProfileAuthStatus();
    updateWorkerAlertStatus();
    return;
  }
  $('profileAvatar').textContent = profileInitials(identity.displayName ?? '?');
  $('profileName').textContent = identity.displayName ?? identity.id;
  $('profileLanguage').textContent = inferProfileLanguage(identity);
  applyGreeting(profileLocale(identity));
  renderSuggestions(profileLocale(identity));
  loadVoiceRuntimePlan().catch((error) => console.warn('loadVoiceRuntimePlan', error));
  loadTtsRuntimePlan().catch((error) => console.warn('loadTtsRuntimePlan', error));
  loadOnDeviceRuntimePlan().catch((error) => console.warn('loadOnDeviceRuntimePlan', error));
  loadRecent();
  loadProfileCredentials().catch((error) => console.warn('loadProfileCredentials', error));
  loadWorkerAlertSubscription().catch((error) => console.warn('loadWorkerAlertSubscription', error));
  if (typeof stopMeshNode === 'function') stopMeshNode();
  if (typeof loadMeshSummary === 'function') {
    loadMeshSummary().catch((error) => console.warn('loadMeshSummary', error));
  }
  if (typeof loadTrustPassport === 'function') {
    loadTrustPassport().catch((error) => console.warn('loadTrustPassport', error));
  }
  if (typeof loadFederatedRounds === 'function') {
    loadFederatedRounds().catch((error) => console.warn('loadFederatedRounds', error));
  }
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

function hexFromBuffer(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBuffer(value) {
  const base64 = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function identityUserHandle(identityId) {
  const encoded = new TextEncoder().encode(identityId);
  if (!globalThis.crypto?.subtle) return encoded.slice(0, 64);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return digest.slice(0, 32);
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

async function loadVoiceRuntimePlan() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const locale = state.activeIdentity ? profileLocale(state.activeIdentity) : 'en-IN';
  const data = await fetchJson(
    `/api/voice/runtime?locale=${encodeURIComponent(locale)}&webSpeechAvailable=${Boolean(SpeechRecognition)}&secureContext=${window.isSecureContext !== false}`
  );
  state.voiceRuntimePlan = data.plan;
  if (state.voiceRuntimePlan?.runtime === 'indic_whisper_wasm') {
    $('micLabel').textContent = 'Hold for offline voice';
  }
}

async function loadTtsRuntimePlan() {
  const locale = state.activeIdentity ? profileLocale(state.activeIdentity) : 'en-IN';
  const data = await fetchJson(
    `/api/tts/runtime?locale=${encodeURIComponent(locale)}&speechSynthesisAvailable=${'speechSynthesis' in window}`
  );
  state.ttsRuntimePlan = data.plan;
}

async function loadOnDeviceRuntimePlan() {
  const webGpuAvailable = Boolean(navigator.gpu);
  const data = await fetchJson(
    `/api/on-device/runtime?task=intent_planning&webGpuAvailable=${webGpuAvailable}&wasmAvailable=true`
  );
  state.onDeviceRuntimePlan = data.plan;
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
  refreshFlagReportSubjectOptions();
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
    execute: true,
    metadata: {
      onDeviceRuntime: state.onDeviceRuntimePlan
        ? {
            runtime: state.onDeviceRuntimePlan.runtime,
            localModelReady: state.onDeviceRuntimePlan.localModelReady,
            planId: state.onDeviceRuntimePlan.onDeviceRuntimePlanId
          }
        : null
    }
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

  // If the on-device SLM is loaded, run a real on-device intent
  // classification first. Surface the top-action and confidence with the
  // orchestration so the result card shows what the local model thought.
  let onDeviceClassification = null;
  if (slmState.enabled && ondeviceSlm.isReady()) {
    try {
      $('flowList').innerHTML =
        '<li>L8 on-device SLM: classifying intent via multilingual MiniLM…</li>';
      const result = await ondeviceSlm.classifyIntent(intent);
      onDeviceClassification = {
        topAction: result.top.action,
        topSimilarity: Number(result.top.similarity.toFixed(4)),
        scores: result.scores.map((score) => ({
          action: score.action,
          similarity: Number(score.similarity.toFixed(4))
        })),
        modelId: result.modelId,
        runtime: result.runtime
      };
      slmState.lastClassification = onDeviceClassification;
    } catch (error) {
      console.warn('on-device SLM classification failed', error);
    }
  }

  try {
    const payload = buildIntentPayload(intent);
    if (onDeviceClassification) {
      payload.metadata = {
        ...payload.metadata,
        onDeviceClassification
      };
      // If the local model is confident, honor its action choice. We
      // require a meaningful margin over the runner-up so deterministic
      // L7 still wins on ambiguous intents.
      const top = onDeviceClassification.scores[0];
      const second = onDeviceClassification.scores[1];
      const margin = top && second ? top.similarity - second.similarity : 0;
      if (top && top.similarity > 0.55 && margin > 0.04) {
        payload.actionType = top.action;
      }
    }
    const data = await fetchJson('/api/orchestrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    renderOrchestration(data.orchestration, { onDeviceClassification });
    await loadRecent();
  } catch (error) {
    $('flowDetected').textContent = 'Network error';
    $('flowList').innerHTML = `<li class="blocked">${escapeHtml(error.message)}</li>`;
    showToast(error.message);
  } finally {
    sendButton.disabled = false;
  }
}

function renderOrchestration(o, { onDeviceClassification = null } = {}) {
  if (!o) return;
  const intent = o.intent ?? {};
  const action = o.actionRequest ?? {};
  const detected = intent.detectedLocale ?? 'en-IN';
  const lang = intent.detectedLanguageId ?? detected.split('-')[0];
  $('flowDetected').textContent = `${ACTION_LABEL_BY_TYPE[action.actionType] ?? action.actionType} · ${detected} (${lang})`;
  $('flowConfidence').textContent = `confidence ${(Math.round(((intent.languageConfidence ?? 0) * 100)))}%`;

  const slmRow = onDeviceClassification
    ? `<li class="complete">
         <span>L8 on-device SLM · ${escapeHtml(onDeviceClassification.topAction.replace(/_/g, ' '))} ${(onDeviceClassification.topSimilarity * 100).toFixed(0)}%</span>
         <span class="flow-layer">${escapeHtml(onDeviceClassification.modelId.split('/').pop())} · ${escapeHtml(onDeviceClassification.runtime)}</span>
       </li>`
    : '';
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
  $('flowList').innerHTML = slmRow + planRows;

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
  state.lastLocalizedResponse = localized ?? null;
  const vernacular = localized
    ? `<div class="vernacular" lang="${escapeHtml(localized.locale)}">${escapeHtml(localized.text)}</div>
       <button class="listen-action" type="button" data-speak-latest>Listen</button>`
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
    const payment = receipt.payment ?? {};
    const paymentAction = payment.uri
      ? `<a class="pay-action" href="${escapeHtml(payment.uri)}" aria-label="Pay ${escapeHtml(fare)} with UPI">Pay with UPI</a>`
      : '';
    const handoffs = Array.isArray(receipt.appHandoffs) ? receipt.appHandoffs : [];
    const handoffActions = handoffs.length > 0
      ? `<div class="handoff-row">
          <span class="handoff-label">Or open in your app:</span>
          ${handoffs.map((h) => `
            <a class="handoff-action"
               href="${escapeHtml(h.uri)}"
               data-fallback="${escapeHtml(h.webFallback)}"
               data-app="${escapeHtml(h.app)}"
               rel="noopener">${escapeHtml(h.label)}</a>
          `).join('')}
        </div>`
      : '';
    return `
      <dl class="result-detail-grid">
        <dt>Provider</dt><dd>${escapeHtml(chosen.providerName ?? '--')} (${escapeHtml(chosen.source ?? '--')})</dd>
        <dt>Vertical</dt><dd>${escapeHtml(receipt.vertical ?? '--')}</dd>
        <dt>Route</dt><dd>${escapeHtml(route)}</dd>
        <dt>Fare</dt><dd>${escapeHtml(fare)}</dd>
        <dt>Payment</dt><dd>${payment.uri ? `UPI · ${escapeHtml(payment.payeeName ?? 'provider')}` : '--'}</dd>
        <dt>Commission</dt><dd>${chosen.commissionPct ?? 0}% (native marketplace)</dd>
        <dt>Booking ref</dt><dd>${escapeHtml(shortId(receipt.bookingRef ?? ''))}</dd>
      </dl>
      ${paymentAction}
      ${handoffActions}
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
  if (actionType === 'trust_attestation') {
    const claims = Array.isArray(receipt.claims) ? receipt.claims : [];
    const expiresAt = receipt.expiresAt
      ? new Date(receipt.expiresAt).toLocaleString()
      : '--';
    return `
      <dl class="result-detail-grid">
        <dt>Verifier</dt><dd>${escapeHtml(receipt.verifierName ?? '--')}</dd>
        <dt>Purpose</dt><dd>${escapeHtml(receipt.purpose ?? '--')}</dd>
        <dt>Share window</dt><dd>${receipt.shareDays ?? '--'} days · expires ${escapeHtml(expiresAt)}</dd>
        <dt>Attestation</dt><dd><code>${escapeHtml(shortId(receipt.attestationId ?? ''))}</code></dd>
        <dt>Raw PII</dt><dd>${receipt.rawPiiReturned === false ? 'Not exposed — selective disclosure (§15)' : '--'}</dd>
      </dl>
      <div class="attestation-claims">
        <div class="attestation-claims-label">Disclosed claims (bands or booleans only):</div>
        <ul class="attestation-claims-list">
          ${claims.map((c) => `<li><strong>${escapeHtml(c.claim)}</strong>: ${escapeHtml(String(c.value))}</li>`).join('') || '<li>none</li>'}
        </ul>
      </div>
    `;
  }
  if (actionType === 'daily_brief') {
    const sections = Array.isArray(receipt.sections) ? receipt.sections : [];
    const brief = receipt.brief ?? null;
    const briefBody = brief?.text
      ? `<pre class="daily-brief-body" lang="${escapeHtml(brief.locale ?? 'en-IN')}">${escapeHtml(brief.text)}</pre>`
      : `<p class="diagnostics-note" style="margin: 0;">Brief envelope only — no signals were threaded.</p>`;
    const populated = Array.isArray(brief?.sectionsPopulated)
      ? brief.sectionsPopulated.join(' · ') || '—'
      : '—';
    const renderer = brief?.renderer
      ? `${brief.renderer}${brief.renderer === 'template_v0' ? ' (Tier 4 SLM would replace this)' : ''}`
      : '—';
    return `
      ${briefBody}
      <dl class="result-detail-grid">
        <dt>Runtime</dt><dd>${escapeHtml(receipt.runtime ?? '--')}</dd>
        <dt>Network legs</dt><dd>${receipt.networkLegs ?? '--'} (composed on-device)</dd>
        <dt>Horizon</dt><dd>${receipt.horizonHours ?? '--'} hours</dd>
        <dt>Sections requested</dt><dd>${sections.map((s) => escapeHtml(s)).join(' · ') || '--'}</dd>
        <dt>Sections populated</dt><dd>${escapeHtml(populated)}</dd>
        <dt>Renderer</dt><dd>${escapeHtml(renderer)}</dd>
        <dt>Brief ref</dt><dd><code>${escapeHtml(shortId(receipt.briefId ?? ''))}</code></dd>
      </dl>
      <p class="diagnostics-note" style="margin: 8px 0 0;">
        ${escapeHtml(brief?.rendererNote ?? 'Composed under §7e on-device routing. Nothing leaves the device.')}
      </p>
    `;
  }
  return `<pre class="result-detail-grid">${escapeHtml(JSON.stringify(receipt, null, 2))}</pre>`;
}

// ─── Health document capture (Phase 2a.2 scaffold) ───────────────────────
// Phase 2a.3 profile passkey binding scaffold.
async function speakLatestLocalizedResponse() {
  const response = state.lastLocalizedResponse;
  if (!response?.text) {
    showToast('No response to speak yet.');
    return;
  }
  if (!state.ttsRuntimePlan) {
    await loadTtsRuntimePlan().catch((error) => console.warn('loadTtsRuntimePlan', error));
  }
  if (!('speechSynthesis' in window)) {
    showToast('Speech output is not available in this browser.');
    return;
  }
  if (state.ttsRuntimePlan?.runtime === 'indic_tts_wasm') {
    showToast('Offline TTS model pack found; WASM playback is not wired yet.');
  }
  const utterance = new SpeechSynthesisUtterance(response.text);
  utterance.lang = response.locale ?? profileLocale(state.activeIdentity);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function passkeysAvailable() {
  return Boolean(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get && window.isSecureContext !== false);
}

function updateProfileAuthStatus() {
  const count = state.profileCredentials.length;
  $('profileAuthStatus').textContent = count === 1 ? '1 passkey' : `${count} passkeys`;
  $('profileAuthVerifyButton').disabled = count === 0;
}

function renderProfileAuthResult(title, rows) {
  const box = $('profileAuthResult');
  box.hidden = false;
  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <dl class="result-detail-grid">
      ${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}
    </dl>
  `;
}

async function loadProfileCredentials() {
  if (!state.activeIdentity) {
    state.profileCredentials = [];
    updateProfileAuthStatus();
    return;
  }
  const data = await fetchJson(`/api/profile-auth/credentials?identityId=${encodeURIComponent(state.activeIdentity.id)}`);
  state.profileCredentials = data.credentials ?? [];
  updateProfileAuthStatus();
}

async function createProfileAuthChallenge(ceremony) {
  const data = await fetchJson('/api/profile-auth/challenges', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identityId: state.activeIdentity.id, ceremony })
  });
  return data.challenge;
}

async function bindProfilePasskey() {
  if (!sanityCheckActor()) return;
  if (!passkeysAvailable()) {
    showToast('Passkeys need WebAuthn in a secure browser context.');
    return;
  }

  const button = $('profileAuthBindButton');
  button.disabled = true;
  try {
    const challenge = await createProfileAuthChallenge('register');
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlToBuffer(challenge.challengeBase64Url),
        rp: { name: 'Bharat OS' },
        user: {
          id: await identityUserHandle(state.activeIdentity.id),
          name: state.activeIdentity.displayName ?? state.activeIdentity.id,
          displayName: state.activeIdentity.displayName ?? 'Bharat OS profile'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred'
        },
        attestation: 'none',
        timeout: 60000
      }
    });
    if (!credential) throw new Error('Passkey registration was cancelled.');

    const stored = await fetchJson('/api/profile-auth/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: state.activeIdentity.id,
        credentialId: bufferToBase64Url(credential.rawId),
        challenge,
        publicKeyAlgorithm: 'ES256',
        transports: credential.response?.getTransports?.() ?? [],
        userVerified: false
      })
    });

    await loadProfileCredentials();
    renderProfileAuthResult('Passkey bound', [
      ['Credential', shortId(stored.credential.profileCredentialId)],
      ['Challenge', shortId(stored.credential.challengeId)],
      ['Material', 'No private key stored']
    ]);
    showToast('Passkey bound to profile.');
  } catch (error) {
    renderProfileAuthResult('Passkey not bound', [['Reason', error.message]]);
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function verifyProfilePasskey() {
  if (!sanityCheckActor()) return;
  if (!passkeysAvailable()) {
    showToast('Passkeys need WebAuthn in a secure browser context.');
    return;
  }

  if (state.profileCredentials.length === 0) await loadProfileCredentials();
  const credential = state.profileCredentials[0];
  if (!credential) {
    showToast('Bind a passkey first.');
    return;
  }

  const button = $('profileAuthVerifyButton');
  button.disabled = true;
  try {
    const challenge = await createProfileAuthChallenge('verify');
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBuffer(challenge.challengeBase64Url),
        allowCredentials: [
          {
            type: 'public-key',
            id: base64UrlToBuffer(credential.credentialId),
            transports: credential.transports ?? []
          }
        ],
        userVerification: 'preferred',
        timeout: 60000
      }
    });
    if (!assertion) throw new Error('Passkey verification was cancelled.');

    const response = await fetch('/api/profile-auth/assertions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: state.activeIdentity.id,
        credentialId: bufferToBase64Url(assertion.rawId),
        challenge
      })
    });
    const body = await response.json();
    renderProfileAuthResult(body.ok ? 'Passkey verified' : 'Passkey blocked', [
      ['Credential', shortId(credential.profileCredentialId)],
      ['Challenge', shortId(challenge.challengeId)],
      ['Result', body.verification?.valid ? 'valid' : (body.verification?.reasons ?? []).join(', ')]
    ]);
    showToast(body.ok ? 'Passkey verified for this profile.' : 'Passkey verification blocked.');
  } catch (error) {
    renderProfileAuthResult('Passkey not verified', [['Reason', error.message]]);
    showToast(error.message);
  } finally {
    button.disabled = state.profileCredentials.length === 0;
  }
}

// Phase 2a.4 worker alert scaffold. Real Web Push delivery needs VAPID keys and
// a push sender; this demo records capability and uses service-worker local
// notifications when the browser grants permission.
function workerAlertsAvailable() {
  return Boolean('Notification' in window && 'serviceWorker' in navigator);
}

function updateWorkerAlertStatus() {
  const status = state.workerAlertSubscription
    ? state.workerAlertSubscription.mode === 'web_push'
      ? 'Web Push'
      : 'Local'
    : 'Off';
  $('workerAlertStatus').textContent = status;
  $('workerAlertTestButton').disabled = !state.workerAlertSubscription;
}

function renderWorkerAlertResult(title, rows) {
  const box = $('workerAlertResult');
  box.hidden = false;
  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <dl class="result-detail-grid">
      ${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}
    </dl>
  `;
}

async function loadWorkerAlertSubscription() {
  if (!state.activeIdentity) {
    state.workerAlertSubscription = null;
    updateWorkerAlertStatus();
    return;
  }
  const data = await fetchJson(`/api/push/subscriptions?identityId=${encodeURIComponent(state.activeIdentity.id)}`);
  state.workerAlertSubscription = (data.subscriptions ?? [])
    .sort((a, b) => String(b.subscribedAt).localeCompare(String(a.subscribedAt)))[0] ?? null;
  updateWorkerAlertStatus();
}

async function enableWorkerAlerts() {
  if (!sanityCheckActor()) return;
  if (!workerAlertsAvailable()) {
    showToast('Notifications need service worker support in this browser.');
    return;
  }

  const button = $('workerAlertEnableButton');
  button.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');

    const registration = await navigator.serviceWorker.ready;
    const pushSubscription = await registration.pushManager?.getSubscription?.();
    const serialized = pushSubscription?.toJSON?.() ?? {};
    const saved = await fetchJson('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: state.activeIdentity.id,
        endpoint: serialized.endpoint,
        keys: serialized.keys ?? {},
        permission,
        source: 'shell',
        userAgent: navigator.userAgent
      })
    });

    state.workerAlertSubscription = saved.subscription;
    updateWorkerAlertStatus();
    renderWorkerAlertResult('Alerts enabled', [
      ['Mode', saved.subscription.mode],
      ['Subscription', shortId(saved.subscription.subscriptionId)],
      ['Endpoint', saved.subscription.rawEndpointStored ? 'stored' : 'hashed only']
    ]);
    showToast('Worker alerts enabled.');
  } catch (error) {
    renderWorkerAlertResult('Alerts not enabled', [['Reason', error.message]]);
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function testWorkerAlert() {
  if (!sanityCheckActor()) return;
  if (!state.workerAlertSubscription) await loadWorkerAlertSubscription();
  if (!state.workerAlertSubscription) {
    showToast('Enable alerts first.');
    return;
  }

  const button = $('workerAlertTestButton');
  button.disabled = true;
  try {
    const response = await fetch('/api/worker-notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workerId: state.activeIdentity.id,
        jobReference: `demo-job-${Date.now()}`,
        title: 'Bharat OS job alert',
        body: 'Nearby work is available. Escrow is required.',
        locale: profileLocale(state.activeIdentity),
        urgency: 'normal'
      })
    });
    const body = await response.json();
    const notification = body.notification;
    renderWorkerAlertResult(body.ok ? 'Alert queued' : 'Alert blocked', [
      ['Delivery', notification.delivery.status],
      ['Notification', shortId(notification.notificationId)],
      ['VAPID', notification.delivery.vapidIntegrated ? 'ready' : 'not integrated']
    ]);

    if (Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(notification.content.title, {
        body: notification.content.body,
        tag: notification.notificationId,
        data: { url: '/shell/', notificationId: notification.notificationId }
      });
    }
    showToast(body.ok ? 'Worker alert queued.' : 'Worker alert blocked.');
  } catch (error) {
    renderWorkerAlertResult('Alert failed', [['Reason', error.message]]);
    showToast(error.message);
  } finally {
    button.disabled = !state.workerAlertSubscription;
  }
}

// Lazy-load Tesseract.js from a CDN the first time the user picks a health
// document image. Worth ~7 MB (engine + Hindi + English + Tamil language
// data) but only fetched once, then cached by the service worker for offline
// use. See §17 footprint accounting.
let tesseractWorkerPromise = null;
async function ensureTesseractWorker() {
  if (tesseractWorkerPromise) return tesseractWorkerPromise;
  tesseractWorkerPromise = (async () => {
    $('healthDocFileMeta').textContent = 'Loading OCR engine (~7 MB, first time only)…';
    const mod = await import('https://esm.sh/tesseract.js@5');
    const worker = await mod.createWorker(['eng', 'hin', 'tam']);
    return worker;
  })();
  return tesseractWorkerPromise;
}

async function handleHealthDocFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    state.healthDocImage = null;
    $('healthDocFileMeta').textContent = 'No image selected';
    return;
  }

  let sha256 = null;
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    sha256 = hexFromBuffer(hash);
  }
  state.healthDocImage = {
    mimeType: file.type || 'application/octet-stream',
    byteLength: file.size,
    sha256
  };
  $('healthDocFileMeta').textContent = `${Math.round(file.size / 1024)} KB · ${file.type || 'file'} · running OCR…`;

  // Real OCR via Tesseract.js (Phase 2a.8 — Indic OCR wired). If the load or
  // recognize fails (offline, CDN unreachable), the manual textarea is still
  // the fallback path — uploadHealthDocument just won't get blank text from us.
  const objectUrl = URL.createObjectURL(file);
  try {
    const worker = await ensureTesseractWorker();
    $('healthDocFileMeta').textContent = `${Math.round(file.size / 1024)} KB · recognizing text…`;
    const { data } = await worker.recognize(objectUrl);
    const recognizedText = (data?.text ?? '').trim();
    if (recognizedText) {
      const textarea = $('healthDocText');
      // Only auto-fill if the user hasn't already typed something.
      if (!textarea.value.trim()) {
        textarea.value = recognizedText;
      }
      const confidence = Math.round(data?.confidence ?? 0);
      $('healthDocFileMeta').textContent =
        `${Math.round(file.size / 1024)} KB · OCR ${confidence}% · ${recognizedText.length} chars`;
    } else {
      $('healthDocFileMeta').textContent =
        `${Math.round(file.size / 1024)} KB · OCR found no text — type below`;
    }
  } catch (error) {
    $('healthDocFileMeta').textContent =
      `${Math.round(file.size / 1024)} KB · OCR offline — type the text manually`;
    console.warn('Tesseract.js OCR failed', error);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderHealthDocumentResult(body) {
  const box = $('healthDocResult');
  box.hidden = false;
  if (!body.ok) {
    const missing = body.preflight?.remediation?.consentGrant?.scopes?.join(', ') ?? 'health consent';
    box.innerHTML = `<strong>Blocked</strong><br/><span>Consent required: ${escapeHtml(missing)}</span>`;
    return;
  }

  const upload = body.capture?.abhaUpload ?? {};
  const structured = body.capture?.structured ?? {};
  const vitals = (structured.vitals ?? []).map((vital) => vital.type).join(', ') || 'none';
  const meds = (structured.medications ?? []).map((med) => med.name).join(', ') || 'none';
  box.innerHTML = `
    <strong>ABHA upload ready</strong>
    <dl class="result-detail-grid">
      <dt>Upload</dt><dd>${escapeHtml(shortId(upload.uploadId ?? ''))}</dd>
      <dt>Vitals</dt><dd>${escapeHtml(vitals)}</dd>
      <dt>Meds</dt><dd>${escapeHtml(meds)}</dd>
      <dt>Raw image</dt><dd>Not stored (§15)</dd>
    </dl>
  `;
}

async function uploadHealthDocument() {
  if (!sanityCheckActor()) return;
  const text = $('healthDocText').value.trim();
  if (!text) {
    showToast('Add OCR text before upload.');
    $('healthDocText').focus();
    return;
  }

  const button = $('healthDocUploadButton');
  button.disabled = true;
  try {
    const response = await fetch('/api/health-documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: state.activeIdentity.id,
        documentType: 'prescription',
        locale: profileLocale(state.activeIdentity),
        captureMode: state.healthDocImage ? 'camera_or_file' : 'text_fallback',
        image: state.healthDocImage ?? {},
        ocrText: text
      })
    });
    const body = await response.json();
    renderHealthDocumentResult(body);
    showToast(body.ok ? 'ABHA structured upload receipt created.' : 'Consent needed before ABHA upload.');
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
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
$('resultBody').addEventListener('click', (event) => {
  if (event.target.closest('[data-speak-latest]')) {
    speakLatestLocalizedResponse();
  }
});

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
$('profileAuthBindButton').addEventListener('click', bindProfilePasskey);
$('profileAuthVerifyButton').addEventListener('click', verifyProfilePasskey);
$('workerAlertEnableButton').addEventListener('click', enableWorkerAlerts);
$('workerAlertTestButton').addEventListener('click', testWorkerAlert);
$('healthDocFile').addEventListener('change', handleHealthDocFile);
$('healthDocUploadButton').addEventListener('click', uploadHealthDocument);

// ─── §9A flag report ───────────────────────────────────────────────────────
function refreshFlagReportSubjectOptions() {
  const select = $('flagSubjectSelect');
  if (!select) return;
  const currentSelection = select.value;
  const currentActor = state.activeIdentity?.id;
  const candidates = (state.identities ?? []).filter(
    (id) => id.id !== currentActor && !/(bootstrap|tenant)/i.test(id.displayName ?? '')
  );
  const optionsHtml = ['<option value="">— Choose who you\'re reporting —</option>']
    .concat(
      candidates.map(
        (identity) =>
          `<option value="${escapeHtml(identity.id)}">${escapeHtml(identity.displayName ?? identity.id)}</option>`
      )
    )
    .join('');
  select.innerHTML = optionsHtml;
  if (currentSelection && candidates.some((c) => c.id === currentSelection)) {
    select.value = currentSelection;
  }
}

async function submitFlagReport() {
  if (!sanityCheckActor()) return;
  const subjectActorId = $('flagSubjectSelect').value;
  const category = $('flagCategorySelect').value;
  const severity = $('flagSeveritySelect').value;
  const summary = $('flagSummary').value.trim();
  if (!subjectActorId) {
    showToast('Pick who you\'re reporting first.');
    return;
  }
  if (summary.length < 4) {
    showToast('Add a short summary (min 4 chars).');
    return;
  }

  const button = $('flagReportSubmit');
  button.disabled = true;
  try {
    const data = await fetchJson('/api/flags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reporterId: state.activeIdentity.id,
        subjectActorId,
        category,
        severity,
        summary,
        signWithIdentityId: state.activeIdentity.id
      })
    });
    const box = $('flagReportResult');
    box.hidden = false;
    box.innerHTML = `
      <strong>Report filed and signed</strong>
      <dl class="result-detail-grid">
        <dt>Flag</dt><dd>${escapeHtml(shortId(data.flag.flagId))}</dd>
        <dt>Severity</dt><dd>${escapeHtml(data.flag.severity)}</dd>
        <dt>Signature</dt><dd>${data.integrity?.signatureValid ? 'verified' : 'unverified'}</dd>
        <dt>Status</dt><dd>${escapeHtml(data.flag.status)}</dd>
      </dl>
    `;
    $('flagSummary').value = '';
    showToast('Report filed.');
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

// ─── Diagnostics panel ─────────────────────────────────────────────────────
// Honest "what's running vs scaffold" surface for investor demos. Maps to
// the Phase 2a.x status board in BHARAT_OS.md §17.
const DIAGNOSTICS = [
  { id: '2a.1', label: 'UPI deep-link payment', status: 'real', detail: 'upi://pay?... opens the user\'s UPI app on result cards' },
  { id: '2a.2', label: 'Health doc OCR + ABHA upload', status: 'real', detail: 'Tesseract.js (eng/hin/tam) auto-OCR + deterministic field extraction; raw image and OCR text not stored (§15)' },
  { id: '2a.3', label: 'Per-profile passkey (WebAuthn)', status: 'real-client', detail: 'navigator.credentials.create/get binds a real device passkey. Server attestation verification is still scaffold.' },
  { id: '2a.4', label: 'Worker alerts (local notifications)', status: 'partial', detail: 'Real Notification.requestPermission + showNotification. Server-side VAPID Web Push is scaffold.' },
  { id: '2a.5', label: 'Indic ASR voice input', status: 'partial', detail: 'Web Speech API today (needs HTTPS/localhost). IndicWhisper-WASM offline runtime is scaffold.' },
  { id: '2a.6', label: 'Vernacular TTS (Listen)', status: 'real', detail: 'Browser speechSynthesis speaks the localizedResponse. IndicTTS-WASM upgrade is scaffold.' },
  { id: '2a.7', label: 'On-device SLM intent', status: 'placeholder', detail: 'Deterministic regex today. WebGPU + transformers.js / Sarvam-1 q4 is opt-in Tier 4.' },
  { id: '7c', label: 'Device pairing handshake', status: 'placeholder', detail: 'localStorage scaffold today. Real WebRTC ephemeral-key transport is Phase 2a queue #8.' },
  { id: '2a.9', label: 'One-tap reporting + flag ledger (§9A)', status: 'real', detail: 'Reporter signs the flag with their identity key; 3+ open high-severity flags auto-block the subject\'s sensitive actions until human review.' }
];
function renderDiagnostics() {
  const list = $('diagnosticsList');
  if (!list) return;
  const live = DIAGNOSTICS.map((d) => {
    if (d.id === '2a.7') {
      if (ondeviceSlm.isReady()) {
        return {
          ...d,
          status: 'real',
          detail: `Multilingual MiniLM L12 v2 loaded in-browser via transformers.js (WASM). Cosine-similarity intent classification across the six canonical action types. Cached after first download (~120 MB).`
        };
      }
      if (ondeviceSlm.isLoading()) {
        return { ...d, status: 'partial', detail: 'Loading the multilingual MiniLM model into browser cache (~120 MB)…' };
      }
    }
    return d;
  });
  list.innerHTML = live.map((d) => {
    const cls = d.status === 'real' ? 'good' : d.status === 'placeholder' ? 'bad' : 'warn';
    const label = d.status === 'real' ? 'real' : d.status === 'real-client' ? 'real (client)' : d.status === 'partial' ? 'partial' : 'placeholder';
    return `
      <li>
        <div class="diagnostics-row">
          <span class="diagnostics-id">${escapeHtml(d.id)}</span>
          <span class="diagnostics-label">${escapeHtml(d.label)}</span>
          <span class="tag ${cls}">${escapeHtml(label)}</span>
        </div>
        <div class="diagnostics-detail">${escapeHtml(d.detail)}</div>
      </li>
    `;
  }).join('');
}
renderDiagnostics();

$('flagReportSubmit').addEventListener('click', submitFlagReport);

// ─── On-device SLM intent classifier (Phase 2a.12) ────────────────────────
// Lazy-loaded multilingual MiniLM embedding model via transformers.js.
// One-tap warm-up; subsequent intents get a real on-device classification
// in addition to the deterministic L8 vernacular module.

const slmState = {
  enabled: false,
  lastClassification: null
};

function setSlmStatus(label, { progress, busy, ready, error } = {}) {
  const button = $('slmLoadButton');
  const labelEl = $('slmLoadLabel');
  const progressEl = $('slmProgress');
  const statusEl = $('slmStatus');

  if (busy !== undefined) button.disabled = Boolean(busy);
  if (label !== undefined) labelEl.textContent = label;
  if (ready) button.classList.add('ready');
  else button.classList.remove('ready');

  if (progress !== undefined) {
    progressEl.hidden = progress === null;
    if (progress !== null) progressEl.value = Math.max(0, Math.min(100, progress));
  }

  if (error) {
    statusEl.hidden = false;
    statusEl.textContent = error;
    statusEl.dataset.tone = 'bad';
  } else if (ready) {
    statusEl.hidden = false;
    statusEl.textContent = 'Multilingual MiniLM ready on this device.';
    statusEl.dataset.tone = 'good';
  } else {
    statusEl.hidden = true;
  }
}

async function loadOnDeviceSlm() {
  if (slmState.enabled) return;
  setSlmStatus('Connecting to model registry…', { busy: true, progress: 0 });

  try {
    let lastFile = '';
    await ondeviceSlm.warmUp((event) => {
      if (event.status === 'progress' && event.file) {
        const pct = event.total
          ? Math.round((event.loaded / event.total) * 100)
          : null;
        if (event.file !== lastFile) {
          lastFile = event.file;
        }
        setSlmStatus(`Downloading ${event.file} ${pct ?? '–'}%`, {
          busy: true,
          progress: pct ?? 0
        });
      } else if (event.status === 'ready' || event.status === 'done') {
        setSlmStatus('Warming up action templates…', { busy: true, progress: 95 });
      }
    });
    slmState.enabled = true;
    setSlmStatus('🧠 On-device AI ready — cached for next load', {
      busy: false,
      progress: 100,
      ready: true
    });
    renderDiagnostics();
    // Tell the API our local model is ready so the on-device runtime
    // metadata in subsequent orchestrations reflects reality.
    try {
      await fetch('/api/on-device/model-packs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelId: ondeviceSlm.SLM_CONFIG.modelId,
          family: 'paraphrase-multilingual-MiniLM-L12-v2',
          runtime: 'wasm_transformersjs',
          bytes: ondeviceSlm.SLM_CONFIG.approxBytes,
          capabilities: ['intent_planning'],
          localeCoverage: ['hi-IN', 'mr-IN', 'bho-IN', 'ta-IN', 'bn-IN', 'en-IN'],
          source: 'browser-cache'
        })
      });
    } catch (_error) {
      // Non-fatal — the model is still local and usable.
    }
  } catch (error) {
    slmState.enabled = false;
    setSlmStatus('Load on-device AI (≈120 MB, cached after)', {
      busy: false,
      progress: null,
      error: `Could not load model: ${error.message}. The shell falls back to deterministic L8 — your intent still works.`
    });
  }
}

$('slmLoadButton').addEventListener('click', loadOnDeviceSlm);

// ─── §13B mesh node — foreground ticker ────────────────────────────────────
// While the shell is active and the user opted in, simulate the operator's
// node serving inference + storage to peers. Each tick POSTs a real signed
// contribution event so the audit ledger and NCS reflect actual activity;
// the earnings ticker climbs and the diagnostics panel surfaces the live
// state. Background Sync (best-effort) keeps ticking when the tab is hidden.

const meshState = {
  active: false,
  intervalId: null,
  consecutiveFailures: 0,
  lastEventAt: null,
  totalPaise: 0,
  totalTokens: 0,
  totalBytesServed: 0
};

function formatRupees(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function formatBytesShort(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function setMeshStatus(text, { tone } = {}) {
  $('meshNodeStatus').textContent = text;
  $('meshNodeStatus').dataset.tone = tone ?? '';
}

function renderMeshTicker(summary) {
  $('meshEarningsRupees').textContent = formatRupees(summary.totalPaise);
  $('meshServedSummary').textContent =
    `${summary.totalTokensServed.toLocaleString('en-IN')} tokens · ${formatBytesShort(summary.totalBytesServed)}`;
}

async function loadMeshSummary() {
  if (!state.activeIdentity) return;
  try {
    const data = await fetchJson(
      `/api/mesh/contributions/summary/${encodeURIComponent(state.activeIdentity.id)}`
    );
    renderMeshTicker(data.summary);
    meshState.totalPaise = data.summary.totalPaise;
    meshState.totalTokens = data.summary.totalTokensServed;
    meshState.totalBytesServed = data.summary.totalBytesServed;
  } catch (_error) {
    // Pre-2a.13 API, fine to ignore on first load.
  }
  // Also pull the contribution block into the NCS readout.
  try {
    const contribution = await fetchJson(
      `/api/identities/${encodeURIComponent(state.activeIdentity.id)}/contribution`
    );
    const c = contribution.contribution;
    $('meshNcsValue').textContent =
      `${c.class} · ${formatBytesShort(Math.abs(c.scoreBytes))} ${c.scoreBytes >= 0 ? 'net' : 'deficit'}`;
  } catch (_error) {
    // ignore
  }
}

function pickWorkload() {
  // 60% inference, 30% storage_serve, 10% storage_store
  const roll = Math.random();
  if (roll < 0.6) {
    // 5k–30k tokens per tick
    return {
      workloadType: 'inference',
      tokens: 5_000 + Math.floor(Math.random() * 25_000)
    };
  }
  if (roll < 0.9) {
    // 256 KB – 4 MB egress per tick
    return {
      workloadType: 'storage_serve',
      bytes: 256 * 1024 + Math.floor(Math.random() * 4 * 1024 * 1024)
    };
  }
  // ~50 GB stored for one minute tick (still rounds to 0 paise — that's by design)
  return {
    workloadType: 'storage_store',
    bytes: 50 * (1024 ** 3) + Math.floor(Math.random() * 50 * 1024 ** 3)
  };
}

async function fireMeshTick() {
  if (!state.activeIdentity) return;
  const workload = pickWorkload();
  try {
    const data = await fetchJson('/api/mesh/contributions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operatorId: state.activeIdentity.id,
        nodeId: null,
        peerId: 'bos:peer:demo',
        charging: true,
        wifi: true,
        batteryPercent: 88,
        ...workload
      })
    });
    meshState.consecutiveFailures = 0;
    meshState.lastEventAt = data.event.at;
    meshState.totalPaise += data.event.payoutPaise ?? 0;
    if (data.event.tokens) meshState.totalTokens += data.event.tokens;
    if (data.event.bytes && data.event.workloadType === 'storage_serve') {
      meshState.totalBytesServed += data.event.bytes;
    }
    renderMeshTicker({
      totalPaise: meshState.totalPaise,
      totalTokensServed: meshState.totalTokens,
      totalBytesServed: meshState.totalBytesServed
    });
    const lastBox = $('meshLastEvent');
    lastBox.hidden = false;
    lastBox.innerHTML = `
      <strong>${escapeHtml(workload.workloadType.replace(/_/g, ' '))}</strong> —
      <span class="mono">+${data.event.payoutPaise} paise</span>
      ${workload.tokens ? `· ${workload.tokens.toLocaleString('en-IN')} tokens` : ''}
      ${workload.bytes ? `· ${formatBytesShort(workload.bytes)}` : ''}
    `;
  } catch (error) {
    meshState.consecutiveFailures += 1;
    if (meshState.consecutiveFailures >= 3) {
      setMeshStatus('Network errors — pausing', { tone: 'bad' });
      stopMeshNode();
    }
  }
}

async function startMeshNode() {
  if (meshState.active || !sanityCheckActor()) return;
  meshState.active = true;
  $('meshStartButton').disabled = true;
  $('meshStopButton').disabled = false;
  setMeshStatus('Active · ticking every 8s', { tone: 'good' });
  // Fire one immediately so the ticker moves before the first interval.
  await fireMeshTick();
  meshState.intervalId = window.setInterval(fireMeshTick, 8000);
  // Best-effort periodic background sync so ticks continue when the tab
  // is hidden. Many browsers will gate this behind site-engagement score
  // and installed-PWA status; we register either way and accept silent
  // no-ops on platforms that don't support it.
  try {
    if ('serviceWorker' in navigator && 'periodicSync' in (await navigator.serviceWorker.ready)) {
      const reg = await navigator.serviceWorker.ready;
      await reg.periodicSync.register('bharat-os-mesh-tick', {
        minInterval: 12 * 60 * 60 * 1000 // 12 hours minimum per Chrome
      });
    }
  } catch (_error) {
    // ignore — foreground ticker still works
  }
}

function stopMeshNode() {
  meshState.active = false;
  if (meshState.intervalId) {
    window.clearInterval(meshState.intervalId);
    meshState.intervalId = null;
  }
  $('meshStartButton').disabled = false;
  $('meshStopButton').disabled = true;
  setMeshStatus('Idle', { tone: '' });
}

$('meshStartButton').addEventListener('click', startMeshNode);
$('meshStopButton').addEventListener('click', stopMeshNode);

// ─── §7f federated rounds — Phase 3.0 ─────────────────────────────────────
//
// Lists active rounds the user can join, and a one-tap join button.
// The actual on-device training is a Phase 3.1+ commitment (TF.js /
// ONNX Runtime Web); the join action here ships a placeholder
// gradient hash with the round's max-epsilon DP noise label and
// records the donation consent. Earns UPI credits via the §7f mesh
// workload class.

async function loadFederatedRounds() {
  if (!state.activeIdentity) return;
  try {
    const data = await fetchJson('/api/federated/rounds');
    const rounds = (data.rounds ?? []).filter(
      (r) => r.status === 'accepting_updates'
    );
    renderFederatedRounds(rounds);
  } catch (error) {
    $('federatedRoundsStatus').textContent = `Error: ${error.message.slice(0, 40)}`;
  }
}

function renderFederatedRounds(rounds) {
  const list = $('federatedRoundsList');
  const status = $('federatedRoundsStatus');
  if (rounds.length === 0) {
    status.textContent = 'No active rounds';
    list.innerHTML = `<li class="federated-empty">No active rounds. Tap *Refresh* to check again.</li>`;
    return;
  }
  status.textContent = `${rounds.length} active`;
  list.innerHTML = rounds
    .map((round) => {
      const payout = `₹${(round.payoutPaisePerUpdate / 100).toFixed(2)}`;
      const deadline = round.deadlineAt
        ? new Date(round.deadlineAt).toLocaleString()
        : '—';
      const progress = `${round.updateCount}/${round.maxParticipants}`;
      const epsilon = round.maxEpsilon;
      return `
        <li class="federated-row" data-round-id="${escapeHtml(round.roundId)}" data-baseline="${escapeHtml(round.baselineModelHash)}" data-epsilon="${escapeHtml(String(epsilon))}">
          <div class="federated-row-head">
            <strong>${escapeHtml(round.modelName)}</strong>
            <span class="federated-payout">${escapeHtml(payout)} / update</span>
          </div>
          <div class="federated-row-meta">
            ε ≤ ${escapeHtml(String(epsilon))} · ${escapeHtml(progress)} contributors · deadline ${escapeHtml(deadline)}
          </div>
          <button type="button" class="secondary-button" data-join-round="${escapeHtml(round.roundId)}">
            Join round
          </button>
          <div class="federated-row-result" hidden></div>
        </li>
      `;
    })
    .join('');
}

async function joinFederatedRound(roundId, { baselineModelHash, epsilon }) {
  if (!sanityCheckActor()) return;
  const li = document.querySelector(`[data-round-id="${CSS.escape(roundId)}"]`);
  const result = li?.querySelector('.federated-row-result');
  if (result) {
    result.hidden = false;
    result.textContent = 'Granting donation consent + composing update…';
  }

  try {
    // 1) Mint a fresh donation consent for this round and sign it.
    //    The server stores it; the federated-round artifact checks
    //    for it on update submission.
    const consentResponse = await fetchJson('/api/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: state.activeIdentity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['training.donate', 'consent.record'],
        purpose: 'federated_donation',
        ttlSeconds: 6 * 60 * 60,
        constraints: { roundId },
        signWithIdentityId: state.activeIdentity.id,
        signRole: 'subject'
      })
    });
    if (!consentResponse?.ok && !consentResponse?.consent) {
      throw new Error('Could not mint donation consent.');
    }

    // 2) Compose a placeholder gradient hash (real on-device
    //    training is Phase 3.1+). Phase 3.0 ships the substrate;
    //    the hash carries the round id + a per-device nonce.
    const seed = `${roundId}:${state.activeIdentity.id}:${Date.now()}`;
    const seedBytes = new TextEncoder().encode(seed);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', seedBytes);
    const gradientHash = `sha256:${hexFromBuffer(digest)}`;

    // 3) Build + sign the update on the server (the demo doesn't
    //    have the contributor private key in the browser yet — the
    //    `/api/federated/rounds/:id/updates` route signs on behalf
    //    of the contributor identity it reads from the store).
    const updateResponse = await fetchJson(
      `/api/federated/rounds/${encodeURIComponent(roundId)}/updates/sign-and-submit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contributorId: state.activeIdentity.id,
          baselineModelHash,
          gradientHash,
          differentialPrivacyEpsilon: Number(epsilon),
          sampleCount: 256
        })
      }
    );

    if (result) {
      const payout = updateResponse?.update?.payoutPaise
        ? `+₹${(updateResponse.update.payoutPaise / 100).toFixed(2)}`
        : '';
      result.textContent = `Joined — update accepted ${payout}. Earnings ticked the mesh ledger.`;
    }
    // Refresh mesh summary so the new federated_round earning shows.
    loadMeshSummary?.().catch(() => {});
    loadFederatedRounds().catch(() => {});
  } catch (error) {
    if (result) result.textContent = `Failed: ${error.message}`;
  }
}

$('federatedRoundsRefresh')?.addEventListener('click', () => {
  loadFederatedRounds().catch(() => {});
});

$('federatedRoundsList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-join-round]');
  if (!button) return;
  const li = button.closest('[data-round-id]');
  joinFederatedRound(button.dataset.joinRound, {
    baselineModelHash: li.dataset.baseline,
    epsilon: li.dataset.epsilon
  });
});

// ─── Trust Passport — Phase 2a.20 ──────────────────────────────────────────
//
// Reads the live Trust Passport for the active profile from
// `/api/trust-passports/:id` and surfaces a compact card with what a
// verifier would see (assurance level, attestation count, active
// consents, NCS class, open §9A flags). The "preview" action
// renders the band-or-boolean disclosure preview without minting an
// attestation — §15 selective-disclosure made visible.
const trustState = {
  lastPassport: null,
  lastFetchedFor: null
};

function setTrustPassportLevel(level) {
  const el = $('trustPassportLevel');
  if (!el) return;
  el.textContent = level ? level : '—';
  el.dataset.tone = level === 'verified' ? 'good' : level === 'basic' ? 'bad' : '';
}

function renderTrustPassport(passport) {
  if (!passport) return;
  trustState.lastPassport = passport;
  trustState.lastFetchedFor = passport.subjectId;
  setTrustPassportLevel(passport.assurance?.level);
  $('trustPassportAttestations').textContent = String(passport.attestations?.count ?? 0);
  $('trustPassportConsents').textContent =
    `${passport.consents?.active ?? 0} active · ${passport.consents?.verified ?? 0} verified`;
  const meshClass = passport.mesh?.class;
  $('trustPassportNcs').textContent = meshClass
    ? `${meshClass}${passport.mesh?.nodeCount ? ` · ${passport.mesh.nodeCount} node${passport.mesh.nodeCount === 1 ? '' : 's'}` : ''}`
    : '—';
  const openFlagCount =
    passport.flagReports?.open ??
    passport.flagReports?.openHighSeverity ??
    0;
  const flagEl = $('trustPassportFlags');
  flagEl.textContent = openFlagCount === 0 ? '0 open' : `${openFlagCount} open`;
  flagEl.dataset.tone = openFlagCount === 0 ? 'good' : 'bad';
  $('trustPassportEvidence').hidden = true;
}

async function loadTrustPassport() {
  if (!state.activeIdentity) return;
  try {
    const data = await fetchJson(
      `/api/trust-passports/${encodeURIComponent(state.activeIdentity.id)}`
    );
    renderTrustPassport(data.passport);
  } catch (error) {
    setTrustPassportLevel('error');
    console.warn('loadTrustPassport', error);
  }
}

function previewVerifierView() {
  const passport = trustState.lastPassport;
  const box = $('trustPassportEvidence');
  if (!passport) {
    showToast('No passport loaded yet. Refresh first.');
    return;
  }
  // Selective-disclosure preview: bands and booleans only, no raw
  // values — matches the trust_passport_attestation tool output.
  const attestationTypes = passport.attestations?.types ?? [];
  const incomeBand = attestationTypes.includes('aadhaar_offline')
    ? 'INR_50K_75K_MONTHLY'
    : 'undisclosed';
  const rows = [
    ['identity_verified', attestationTypes.length > 0 ? 'true' : 'false'],
    ['income_band', incomeBand],
    ['active_consents', `${passport.consents?.active ?? 0} (band: ${(passport.consents?.active ?? 0) > 5 ? 'many' : 'few'})`],
    ['mesh_class', passport.mesh?.class ?? 'unknown'],
    ['no_open_flags', String((passport.flagReports?.open ?? 0) === 0)],
    ['issued_against', shortId(passport.publicKeyFingerprint ?? '')]
  ];
  box.hidden = false;
  box.innerHTML = `
    <div class="trust-evidence-label">Verifier preview — bands &amp; booleans only:</div>
    <ul class="trust-evidence-list">
      ${rows.map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v))}</li>`).join('')}
    </ul>
    <p class="diagnostics-note" style="margin: 6px 0 0;">
      This is what a landlord, NBFC, or HR portal would see if you
      issued an attestation right now. Raw income, exact employer,
      account numbers — none of it is in the envelope. §15
      pointer-not-payload.
    </p>
  `;
}

$('trustPassportRefresh')?.addEventListener('click', () => {
  loadTrustPassport().catch((error) => showToast(`Trust Passport refresh failed: ${error.message}`));
});
$('trustPassportPreview')?.addEventListener('click', previewVerifierView);

// Sign and share — Phase 2a.22.
//
// Mints a real trust_passport_attestation via the orchestration API
// (auto-signed server-side with the subject's identity per ADR 0072),
// then renders the verifier URL + QR so a landlord/NBFC can open it
// on any browser and see the signed claims.
async function signAndShareAttestation() {
  if (!sanityCheckActor()) return;
  const verifierName = window.prompt(
    'Who is this attestation for? (e.g. "Kothrud Landlord", "Acme NBFC")',
    'Landlord'
  );
  if (!verifierName) return;
  const shareDays = Number(
    window.prompt('Share window in days (1-90)?', '14') ?? '14'
  );
  const box = $('trustPassportShare');
  box.hidden = false;
  box.innerHTML = '<div class="diagnostics-note">Granting consent + minting attestation…</div>';

  try {
    // 1) Mint a donation-purpose consent for the trust attestation.
    await fetchJson('/api/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: state.activeIdentity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['trust.attest', 'consent.record'],
        purpose: 'trust_attestation',
        ttlSeconds: shareDays * 24 * 60 * 60,
        signWithIdentityId: state.activeIdentity.id,
        signRole: 'subject'
      })
    });

    // 2) Run the orchestration to mint + auto-sign the attestation.
    const data = await fetchJson('/api/orchestrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: state.activeIdentity.id,
        actionType: 'trust_attestation',
        intentText: `Generate a trust attestation for ${verifierName}`,
        locale: profileLocale(state.activeIdentity),
        execute: true,
        metadata: {
          verifierName,
          shareDays,
          purpose: 'tenant_verification'
        }
      })
    });

    const attestation = data.attestation;
    if (!attestation?.attestationId) {
      throw new Error('Orchestration did not return a signed attestation.');
    }
    const verifyUrl = `${window.location.origin}/verify/?attestationId=${encodeURIComponent(attestation.attestationId)}`;

    // 3) Render the URL + QR.
    box.innerHTML = `
      <div class="trust-share-label">Attestation minted &amp; signed. Share this link with ${escapeHtml(verifierName)}:</div>
      <div class="trust-share-url">
        <input type="text" readonly value="${escapeHtml(verifyUrl)}" id="trustShareUrlInput" />
        <button id="trustShareCopyButton" class="link-button" type="button">Copy</button>
      </div>
      <div id="trustShareQr" class="trust-share-qr"></div>
      <p class="diagnostics-note" style="margin: 0;">
        Expires ${escapeHtml(new Date(attestation.expiresAt).toLocaleString())}. The
        verifier sees the signed envelope (bands &amp; booleans) — never
        your underlying records. §15 selective disclosure.
      </p>
    `;
    document.getElementById('trustShareCopyButton').addEventListener('click', async () => {
      const input = document.getElementById('trustShareUrlInput');
      try {
        await navigator.clipboard.writeText(input.value);
        showToast('Verify URL copied to clipboard.');
      } catch (_error) {
        input.select();
        showToast('Tap and hold to copy.');
      }
    });
    renderQrInto(document.getElementById('trustShareQr'), verifyUrl).catch((err) =>
      console.warn('QR render', err)
    );
  } catch (error) {
    box.innerHTML = `<div class="diagnostics-note" style="color: var(--bad);">Failed: ${escapeHtml(error.message)}</div>`;
  }
}

$('trustPassportSignShare')?.addEventListener('click', signAndShareAttestation);

// ─── §7c device pairing — WebRTC handshake UI ──────────────────────────────

// QR payload shape — versioned so future fields don't break older
// scanners. Keep small so the QR stays low-density and readable.
const QR_PAYLOAD_VERSION = 'bos.qr.v1';

function makeQrPayload({ claimCode, phrase }) {
  return JSON.stringify({ v: QR_PAYLOAD_VERSION, code: claimCode, phrase });
}

function parseQrPayload(text) {
  try {
    const obj = JSON.parse(text);
    if (obj?.v !== QR_PAYLOAD_VERSION) return null;
    if (!/^\d{6}$/.test(obj.code ?? '')) return null;
    return { claimCode: String(obj.code), phrase: String(obj.phrase ?? '') };
  } catch (_error) {
    return null;
  }
}

// Lazy-load the qrcode library from a CDN the same way the SLM and
// Tesseract loaders do. Bundle is tiny (~10 KB gzipped) so first
// pairing has a 100ms delay only on cold cache.
let qrLibPromise = null;
async function loadQrLib() {
  if (!qrLibPromise) {
    qrLibPromise = import('https://esm.sh/qrcode@1.5.3?bundle');
  }
  return qrLibPromise;
}

async function renderQrInto(target, text) {
  try {
    const lib = await loadQrLib();
    const QR = lib.default ?? lib;
    const svg = await QR.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#0c1018', light: '#ffffff' }
    });
    target.hidden = false;
    target.innerHTML = svg;
  } catch (error) {
    target.hidden = false;
    target.innerHTML = `<div class="diagnostics-note">QR render failed (${escapeHtml(error.message)}). Use the 6-digit code below.</div>`;
  }
}

async function scanQrFromCamera({ onProgress } = {}) {
  if (!('BarcodeDetector' in window)) {
    throw new Error('BarcodeDetector API not available on this browser. Use "Paste QR text" instead.');
  }
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  const video = $('pairingScanVideo');
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
  } catch (_error) {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  video.srcObject = stream;
  video.hidden = false;
  await video.play().catch(() => null);
  onProgress?.({ phase: 'scanning' });

  const startMs = Date.now();
  try {
    while (Date.now() - startMs < 30_000) {
      const barcodes = await detector.detect(video).catch(() => []);
      const qr = barcodes.find((b) => b.format === 'qr_code');
      if (qr?.rawValue) {
        const parsed = parseQrPayload(qr.rawValue);
        if (parsed) return parsed;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('No QR scanned in 30s.');
  } finally {
    video.pause?.();
    video.srcObject = null;
    video.hidden = true;
    stream?.getTracks().forEach((track) => track.stop());
  }
}

function setPairingStatus(text, { tone } = {}) {
  $('pairingStatus').textContent = text;
  $('pairingStatus').dataset.tone = tone ?? '';
}

function renderPairingResult(title, rows, { tone } = {}) {
  const box = $('pairingResult');
  box.hidden = false;
  box.dataset.tone = tone ?? '';
  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <dl class="result-detail-grid">
      ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
    </dl>
  `;
}

async function startPairingInitiator() {
  if (!sanityCheckActor()) return;
  const button = $('pairingInitiateButton');
  button.disabled = true;
  $('pairingResult').hidden = true;
  setPairingStatus('Fetching recovery phrase…');

  try {
    const identity = state.activeIdentity;
    const fingerprint = identity.publicKeyPem
      ? await hashString(identity.publicKeyPem)
      : 'demo-fingerprint';

    // Phase 2a.17 — fetch the deterministic 12-word phrase. It
    // displays alongside the 6-digit claim code so the user can
    // read both to the new device.
    const phraseResponse = await fetchJson(
      `/api/identities/${encodeURIComponent(identity.id)}/recovery-phrase`
    );
    const recoveryPhrase = phraseResponse?.recovery?.phrase;
    if (!recoveryPhrase) {
      throw new Error('Could not fetch recovery phrase from server.');
    }

    let displayedCode = false;
    setPairingStatus('Creating session…');
    const result = await pairing.startInitiator({
      identity,
      fingerprint,
      recoveryPhrase,
      onProgress: (event) => {
        if (event.phase === 'session_created' && !displayedCode) {
          displayedCode = true;
          const display = $('pairingCodeDisplay');
          display.hidden = false;
          display.innerHTML = `
            <div class="pairing-code-line">Code · <span class="pairing-code-value">${escapeHtml(event.session.claimCode)}</span></div>
            <div class="pairing-phrase">Recovery phrase (read to the new device):</div>
            <div class="pairing-phrase-value">${escapeHtml(recoveryPhrase)}</div>
          `;
          // QR encodes both the claim code and the recovery phrase so
          // the receiver scans once instead of typing two things.
          renderQrInto(
            $('pairingQrDisplay'),
            makeQrPayload({ claimCode: event.session.claimCode, phrase: recoveryPhrase })
          ).catch((err) => console.warn('QR render', err));
          setPairingStatus('Waiting for new device to claim…');
        } else if (event.phase === 'fetching_vault_snapshot') {
          setPairingStatus('Sealing vault under recovery phrase…', { tone: 'good' });
        } else if (event.phase === 'channel_open') {
          setPairingStatus('Data channel open — transferring…', { tone: 'good' });
        } else if (event.phase === 'completed') {
          setPairingStatus(`Done — ${event.bytes} bytes transferred`, { tone: 'good' });
        }
      }
    });
    renderPairingResult('Pairing completed', [
      ['Session', shortId(result.session.sessionId)],
      ['Code', result.session.claimCode],
      ['Bytes sent', String(result.bytesSent)],
      ['Vault encryption', 'AES-GCM-256 under PBKDF2(phrase, 200k iters)'],
      ['Server saw', 'SDP only (zero identity bytes — §15)']
    ], { tone: 'good' });
    $('pairingCodeDisplay').hidden = true;
    $('pairingQrDisplay').hidden = true;
  } catch (error) {
    setPairingStatus('Pairing failed', { tone: 'bad' });
    renderPairingResult('Pairing did not complete', [['Reason', error.message]], { tone: 'bad' });
  } finally {
    button.disabled = false;
  }
}

// `prefilledPhrase`: when the user arrives via a QR scan / paste,
// the phrase is already known and the prompt is skipped. Manual code
// entry still falls back to window.prompt for the phrase.
async function claimPairingFromCode({ prefilledPhrase = null } = {}) {
  if (!sanityCheckActor()) return;
  const code = $('pairingClaimInput').value.trim();
  if (!/^\d{6}$/.test(code)) {
    showToast('Enter the 6-digit pairing code from the other device.');
    return;
  }
  const button = $('pairingClaimButton');
  button.disabled = true;
  $('pairingResult').hidden = true;
  setPairingStatus('Claiming session…');

  try {
    const receiverFingerprint = await hashString(state.activeIdentity.id);
    let usedPrefilled = false;
    const result = await pairing.startReceiver({
      claimCode: code,
      receiverFingerprint,
      promptForRecoveryPhrase: async ({ attempt, lastError }) => {
        // QR scan / paste already supplied the phrase — try once
        // before falling back to the manual prompt on rejection.
        if (prefilledPhrase && !usedPrefilled) {
          usedPrefilled = true;
          return prefilledPhrase;
        }
        const lead =
          attempt === 0
            ? 'Recovery phrase from the old device (12 words separated by spaces):'
            : `Recovery phrase did not decrypt the vault${lastError ? ` (${lastError})` : ''}. Try again:`;
        // Browser prompt() is synchronous; wrap in microtask so the
        // status string can paint first.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const phrase = window.prompt(lead, '');
        return phrase?.trim() ?? null;
      },
      onProgress: (event) => {
        if (event.phase === 'session_found') setPairingStatus('Session found — exchanging SDP…');
        if (event.phase === 'channel_open') setPairingStatus('Data channel open — receiving…', { tone: 'good' });
        if (event.phase === 'bundle_received') setPairingStatus('Bundle received — decrypting vault…', { tone: 'good' });
        if (event.phase === 'awaiting_recovery_phrase') setPairingStatus('Awaiting recovery phrase…');
        if (event.phase === 'recovery_phrase_rejected') setPairingStatus(`Phrase rejected: ${event.reason}`, { tone: 'bad' });
        if (event.phase === 'vault_decrypted') setPairingStatus(`Vault decrypted (${event.recordCount} record refs)`, { tone: 'good' });
      }
    });

    // Persist the incoming identity as a household member on this device.
    // If the vault decrypted, the public identity is now backed by real
    // private-key material on the receiver side (in a real Phase 2b
    // build, that material would land in the hardware keystore here).
    const incoming = result.bundle.publicIdentity;
    if (incoming?.id && !state.identities.some((i) => i.id === incoming.id)) {
      state.identities.push(incoming);
      addHouseholdMember(incoming.id);
    }

    const rows = [
      ['Incoming identity', incoming?.displayName ?? '--'],
      ['ID', shortId(incoming?.id ?? '')],
      ['Bundle bytes', String(JSON.stringify(result.bundle).length)],
      ['Server saw', 'SDP only — direct peer transfer over WebRTC']
    ];
    if (result.decryptedVault) {
      rows.push([
        'Vault',
        `Decrypted — ${result.decryptedVault.memoryRecordRefs?.length ?? 0} memory refs, private key + vault key recovered`
      ]);
    } else {
      rows.push(['Vault', 'No encrypted vault in bundle (public-only)']);
    }

    renderPairingResult('Identity received and added to household', rows, { tone: 'good' });
    $('pairingClaimInput').value = '';
  } catch (error) {
    setPairingStatus('Claim failed', { tone: 'bad' });
    renderPairingResult('Could not complete claim', [['Reason', error.message]], { tone: 'bad' });
  } finally {
    button.disabled = false;
  }
}

async function hashString(value) {
  if (!globalThis.crypto?.subtle) return String(value).slice(0, 24);
  const bytes = new TextEncoder().encode(String(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return hexFromBuffer(hash).slice(0, 24);
}

$('pairingInitiateButton').addEventListener('click', startPairingInitiator);
$('pairingClaimButton').addEventListener('click', () => claimPairingFromCode());

async function claimFromQrPayload(parsed, { source }) {
  if (!parsed) {
    showToast('That QR did not look like a Bharat OS pairing code.');
    return;
  }
  $('pairingClaimInput').value = parsed.claimCode;
  setPairingStatus(`Got code + phrase from ${source} — claiming…`, { tone: 'good' });
  await claimPairingFromCode({ prefilledPhrase: parsed.phrase });
}

$('pairingScanButton')?.addEventListener('click', async () => {
  setPairingStatus('Starting camera scan…');
  try {
    const parsed = await scanQrFromCamera({
      onProgress: () => setPairingStatus('Scanning for QR…')
    });
    await claimFromQrPayload(parsed, { source: 'QR scan' });
  } catch (error) {
    setPairingStatus('Scan failed', { tone: 'bad' });
    showToast(error.message);
  }
});

$('pairingPasteButton')?.addEventListener('click', async () => {
  const text = window.prompt(
    'Paste the QR payload text (or just the 6-digit code if you only have that):',
    ''
  );
  if (!text) return;
  const trimmed = text.trim();
  // First try JSON QR payload; fall back to a raw 6-digit code that
  // claims without a prefilled phrase (existing prompt flow).
  const parsed = parseQrPayload(trimmed);
  if (parsed) {
    await claimFromQrPayload(parsed, { source: 'paste' });
    return;
  }
  if (/^\d{6}$/.test(trimmed)) {
    $('pairingClaimInput').value = trimmed;
    await claimPairingFromCode();
    return;
  }
  showToast('Could not parse that as a pairing code or QR payload.');
});


// App handoff fallback: if the deep link doesn't open the installed app
// within a short window, navigate to the web fallback URL. This is a
// best-effort heuristic — there's no reliable API to detect "app opened"
// cross-browser, but the page-visibility trick covers most cases.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a.handoff-action');
  if (!link) return;
  const fallback = link.dataset.fallback;
  if (!fallback) return;
  let didOpen = false;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') didOpen = true;
  };
  document.addEventListener('visibilitychange', onVisibility);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (!didOpen) {
      window.location.href = fallback;
    }
  }, 1500);
});

function setupOnboarding() {
  const sheet = $('onboardingSheet');
  const dismiss = () => {
    try {
      localStorage.setItem(LS_KEY_ONBOARDING_SEEN, '1');
    } catch (_error) {
      /* private-mode storage failure is fine */
    }
    sheet.hidden = true;
  };
  $('onboardingSkip')?.addEventListener('click', dismiss);
  $('onboardingDone')?.addEventListener('click', dismiss);
  $('replayTour')?.addEventListener('click', () => {
    sheet.hidden = false;
  });
}

function maybeShowOnboarding() {
  let seen = null;
  try {
    seen = localStorage.getItem(LS_KEY_ONBOARDING_SEEN);
  } catch (_error) {
    seen = null;
  }
  if (!seen) {
    $('onboardingSheet').hidden = false;
  }
}

setupVoice();
setupOnboarding();
loadIdentities()
  .then(() => maybeShowOnboarding())
  .catch((error) => {
    showToast(`Could not reach Bharat OS: ${error.message}`);
  });
