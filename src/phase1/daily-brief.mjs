// §9C vignette 16b — daily-brief composer (Phase 2a.19).
//
// Two halves:
//
//   1. `gatherDailyBriefSignals(store, identityId, horizonHours)` —
//      reads local activity from the BosStore and emits a structured
//      signals object. Pure server-side; the orchestration API
//      handler calls this before dispatching the daily_brief tool
//      and threads the signals through `request.metadata.signals`.
//
//   2. `renderDailyBrief({ signals, locale, displayName })` —
//      template-based vernacular renderer that turns the signals
//      object into a short brief text in the user's locale. Used by
//      the `daily_brief_compose` tool adapter.
//
// §15 bindings:
//   • All composition happens on the server-as-stand-in-for-device
//     (Phase 2a) or in-device (Phase 2b). The signals never leave
//     the user's profile boundary.
//   • Numbers and dates render as bands or short labels; no raw
//     transaction text, no PII strings reach the brief body.
//   • The brief object carries `rawPiiReturned: false` per the §15
//     pointer-not-payload rule.
//
// Tier 4 future:
//   • Once the on-device generative SLM (Sarvam-1 q4 / Gemma 2 q4)
//     is wired, `renderDailyBrief` becomes a fallback. The SLM
//     consumes the same signals object and produces fluent prose
//     in the user's language. The signals contract stays the same.

export const DAILY_BRIEF_PROTOCOL_VERSION = 'bos.phase1.daily-brief.v0';

const HOUR_MS = 60 * 60 * 1000;

function safeDate(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function isWithinHorizon(value, sinceMs) {
  const date = safeDate(value);
  if (!date) return false;
  return date.getTime() >= sinceMs;
}

function formatRupees(paise) {
  if (!Number.isFinite(paise) || paise <= 0) return '₹0.00';
  return `₹${(paise / 100).toFixed(2)}`;
}

function describeAction(orchestration) {
  // Compact phrase per action type. Localized variants live in the
  // template tables below; this is the canonical English fallback.
  const at = orchestration.actionType ?? orchestration.action?.actionType;
  const label = {
    regulated_onboarding: 'opened a regulated workflow',
    scheme_delivery: 'requested a scheme eligibility check',
    health_record_read: 'pulled a health record summary',
    labor_match_post: 'posted a labor match request',
    service_booking: 'booked a service',
    mesh_storage: 'placed data on the mesh',
    trust_attestation: 'minted a trust attestation',
    daily_brief: 'asked for a brief',
    health_document_upload: 'uploaded a health document'
  }[at] ?? 'ran an action';
  return label;
}

// Server-side signal gatherer. Called by the orchestration API
// handler before it dispatches the daily_brief tool, so the tool
// adapter receives a structured payload via `request.metadata.signals`
// and can render without any further store reads.
export async function gatherDailyBriefSignals(
  store,
  identityId,
  { horizonHours = 24, at = new Date().toISOString() } = {}
) {
  if (!store) throw new Error('store is required.');
  if (!identityId) throw new Error('identityId is required.');
  const now = new Date(at).getTime();
  const sinceMs = now - horizonHours * HOUR_MS;

  // Recent activity — orchestrations from this identity.
  const orchestrations = (await store.listOrchestrations().catch(() => [])) ?? [];
  const recent = orchestrations
    .filter((o) => {
      const actor =
        o.action?.actorId ?? o.actorId ?? o.decision?.request?.actorId;
      return actor === identityId && isWithinHorizon(o.completedAt ?? o.createdAt ?? o.at, sinceMs);
    })
    .slice(0, 5)
    .map((o) => ({
      orchestrationId: o.orchestrationId,
      actionType: o.action?.actionType ?? o.actionType,
      status: o.status,
      at: o.completedAt ?? o.createdAt ?? o.at ?? null,
      summary: describeAction(o)
    }));

  // Mesh earnings — contribution events from this operator in the
  // horizon window. Sums paise; presents as ₹.
  const meshEvents = (await store.listMeshContributionEvents?.().catch(() => [])) ?? [];
  const horizonMesh = meshEvents.filter(
    (event) =>
      event.operatorId === identityId &&
      isWithinHorizon(event.at ?? event.createdAt, sinceMs)
  );
  const meshPaise = horizonMesh.reduce(
    (sum, event) => sum + Number(event.payoutPaise ?? 0),
    0
  );
  const meshTokens = horizonMesh.reduce(
    (sum, event) => sum + Number(event.tokens ?? 0),
    0
  );
  const meshBytes = horizonMesh.reduce(
    (sum, event) => sum + Number(event.bytes ?? 0),
    0
  );

  // Expiring consents — anything where expiresAt is between now and
  // now + 7 days, ordered soonest first.
  const consents = (await store.listConsents().catch(() => [])) ?? [];
  const sevenDays = now + 7 * 24 * HOUR_MS;
  const expiringConsents = consents
    .filter(
      (consent) =>
        consent.subjectId === identityId &&
        consent.expiresAt &&
        Date.parse(consent.expiresAt) > now &&
        Date.parse(consent.expiresAt) < sevenDays
    )
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
    .slice(0, 3)
    .map((consent) => ({
      consentId: consent.consentId,
      purpose: consent.purpose,
      expiresAt: consent.expiresAt,
      scopes: consent.scopes ?? []
    }));

  // Open §9A flag reports against this identity — any open report
  // should surface in the brief.
  const flags = (await store.listFlagReports?.().catch(() => [])) ?? [];
  const openFlagsAgainstUser = flags.filter(
    (flag) =>
      flag.subjectId === identityId &&
      ['pending', 'under_review'].includes(flag.status)
  ).length;

  return {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    horizonHours,
    asOf: at,
    recent,
    mesh: {
      earnedPaise: meshPaise,
      tokens: meshTokens,
      bytes: meshBytes,
      eventCount: horizonMesh.length
    },
    expiringConsents,
    openFlags: openFlagsAgainstUser
  };
}

// Locale-aware brief renderer. Returns plain text (a few short
// lines) plus the section keys actually populated, so the shell can
// render either the text or a structured fallback.
const TEMPLATES = {
  greeting: {
    'en-IN': (name) => `Good morning${name ? `, ${name}` : ''}.`,
    'hi-IN': (name) => `नमस्ते${name ? `, ${name}` : ''}।`,
    'hi-Latn-IN': (name) => `Namaste${name ? `, ${name}` : ''}.`,
    'mr-IN': (name) => `नमस्कार${name ? `, ${name}` : ''}.`,
    'bho-IN': (name) => `परनाम${name ? `, ${name}` : ''}।`,
    'ta-IN': (name) => `காலை வணக்கம்${name ? `, ${name}` : ''}.`,
    'bn-IN': (name) => `সুপ্রভাত${name ? `, ${name}` : ''}।`
  },
  meshHeader: {
    'en-IN': (amount, events) => `Your mesh node earned ${amount} across ${events} contribution${events === 1 ? '' : 's'}.`,
    'hi-IN': (amount, events) => `आपके मेश नोड ने ${events} योगदान में ${amount} कमाए।`,
    'hi-Latn-IN': (amount, events) => `Aapke mesh node ne ${events} contribution mein ${amount} kamaye.`,
    'mr-IN': (amount, events) => `तुमच्या मेश नोडने ${events} योगदानात ${amount} कमावले.`,
    'bho-IN': (amount, events) => `राउर मेश नोड ${events} योगदान में ${amount} कमाइल बा।`,
    'ta-IN': (amount, events) => `உங்கள் மெஷ் முனை ${events} பங்களிப்புகளில் ${amount} சம்பாதித்தது.`,
    'bn-IN': (amount, events) => `আপনার মেশ নোড ${events}টি অবদানে ${amount} আয় করেছে।`
  },
  meshEmpty: {
    'en-IN': () => 'Your mesh node was idle in the last window (no contributions).',
    'hi-IN': () => 'आपका मेश नोड हाल में निष्क्रिय रहा।',
    'hi-Latn-IN': () => 'Aapka mesh node haal mein nishkriya raha.',
    'mr-IN': () => 'तुमचा मेश नोड अलीकडे निष्क्रिय होता.',
    'bho-IN': () => 'राउर मेश नोड हाल में निष्क्रिय रहल।',
    'ta-IN': () => 'உங்கள் மெஷ் முனை சமீபத்தில் செயலற்றதாக இருந்தது.',
    'bn-IN': () => 'আপনার মেশ নোড সাম্প্রতিক সময়ে নিষ্ক্রিয় ছিল।'
  },
  recentHeader: {
    'en-IN': (count) => `${count} recent action${count === 1 ? '' : 's'} on this profile:`,
    'hi-IN': (count) => `इस प्रोफाइल पर ${count} हाल की गतिविधि:`,
    'hi-Latn-IN': (count) => `Is profile par ${count} haal ki gatividhi:`,
    'mr-IN': (count) => `या प्रोफाइलवर ${count} अलीकडील क्रिया:`,
    'bho-IN': (count) => `एह प्रोफाइल पर ${count} हाल के गतिविधि:`,
    'ta-IN': (count) => `இந்த சுயவிவரத்தில் ${count} சமீபத்திய செயல்கள்:`,
    'bn-IN': (count) => `এই প্রোফাইলে ${count}টি সাম্প্রতিক কার্যকলাপ:`
  },
  recentEmpty: {
    'en-IN': () => 'No recent actions on this profile in the last window.',
    'hi-IN': () => 'इस प्रोफाइल पर हाल में कोई गतिविधि नहीं।',
    'hi-Latn-IN': () => 'Is profile par haal mein koi gatividhi nahi.',
    'mr-IN': () => 'या प्रोफाइलवर अलीकडे कोणतीही क्रिया नाही.',
    'bho-IN': () => 'एह प्रोफाइल पर हाल में कौनो गतिविधि ना।',
    'ta-IN': () => 'இந்த சுயவிவரத்தில் சமீபத்திய செயல்கள் இல்லை.',
    'bn-IN': () => 'এই প্রোফাইলে সাম্প্রতিক কোনো কার্যকলাপ নেই।'
  },
  consentHeader: {
    'en-IN': (count) => `${count} consent${count === 1 ? '' : 's'} expiring in the next 7 days:`,
    'hi-IN': (count) => `अगले 7 दिनों में ${count} सहमतियाँ समाप्त हो रही हैं:`,
    'hi-Latn-IN': (count) => `Agle 7 dino mein ${count} consents khatm ho rahi hain:`,
    'mr-IN': (count) => `पुढील 7 दिवसांत ${count} संमती संपत आहेत:`,
    'bho-IN': (count) => `अगिला 7 दिन में ${count} सहमति खतम हो रहल बा:`,
    'ta-IN': (count) => `அடுத்த 7 நாட்களில் ${count} ஒப்புதல்கள் காலாவதியாகும்:`,
    'bn-IN': (count) => `পরবর্তী 7 দিনে ${count}টি সম্মতি শেষ হচ্ছে:`
  },
  flagWarning: {
    'en-IN': (count) => `${count} open §9A flag${count === 1 ? '' : 's'} against this profile. Review before sensitive actions.`,
    'hi-IN': (count) => `इस प्रोफाइल पर ${count} खुले §9A flag हैं। संवेदनशील कार्य से पहले समीक्षा करें।`,
    'hi-Latn-IN': (count) => `Is profile par ${count} khule §9A flag hain. Sensitive action se pehle review karein.`,
    'mr-IN': (count) => `या प्रोफाइलवर ${count} खुले §9A flag आहेत. संवेदनशील क्रिया करण्यापूर्वी पुनरावलोकन करा.`,
    'bho-IN': (count) => `एह प्रोफाइल पर ${count} खुले §9A flag बा। संवेदनशील काम से पहिले देख ली।`,
    'ta-IN': (count) => `இந்த சுயவிவரத்தில் ${count} திறந்த §9A flags உள்ளன. முக்கியமான செயல்களுக்கு முன் சரிபார்க்கவும்.`,
    'bn-IN': (count) => `এই প্রোফাইলে ${count}টি খোলা §9A flag আছে। সংবেদনশীল কাজের আগে যাচাই করুন।`
  },
  footer: {
    'en-IN': () => 'Composed on-device (§7e). Nothing left your phone.',
    'hi-IN': () => 'आपके फोन पर ही बनाया गया (§7e)। कुछ भी बाहर नहीं गया।',
    'hi-Latn-IN': () => 'Aapke phone par hi banaya gaya (§7e). Kuch bhi bahar nahi gaya.',
    'mr-IN': () => 'तुमच्या फोनवरच तयार झाला (§7e). काहीही बाहेर गेले नाही.',
    'bho-IN': () => 'राउर फोन पर बनल बा (§7e)। कुछो बाहर ना गइल।',
    'ta-IN': () => 'தொலைபேசியில் தயாராக்கப்பட்டது (§7e). எதுவும் வெளியே போகவில்லை.',
    'bn-IN': () => 'ফোনেই তৈরি (§7e)। কিছুই বাইরে যায়নি।'
  }
};

function pickTemplate(table, locale) {
  return table[locale] ?? table['en-IN'];
}

export function renderDailyBrief({
  signals,
  locale = 'en-IN',
  displayName = null
} = {}) {
  if (!signals) throw new Error('signals is required.');
  const lines = [];
  const sectionsPopulated = [];

  lines.push(pickTemplate(TEMPLATES.greeting, locale)(displayName));

  if (signals.mesh?.eventCount > 0) {
    lines.push(
      pickTemplate(TEMPLATES.meshHeader, locale)(
        formatRupees(signals.mesh.earnedPaise),
        signals.mesh.eventCount
      )
    );
    sectionsPopulated.push('mesh');
  } else {
    lines.push(pickTemplate(TEMPLATES.meshEmpty, locale)());
  }

  if (signals.recent?.length > 0) {
    lines.push(pickTemplate(TEMPLATES.recentHeader, locale)(signals.recent.length));
    for (const item of signals.recent) {
      lines.push(`  • ${item.summary} (${item.status ?? '—'})`);
    }
    sectionsPopulated.push('recent');
  } else {
    lines.push(pickTemplate(TEMPLATES.recentEmpty, locale)());
  }

  if (signals.expiringConsents?.length > 0) {
    lines.push(
      pickTemplate(TEMPLATES.consentHeader, locale)(signals.expiringConsents.length)
    );
    for (const consent of signals.expiringConsents) {
      const expiry = consent.expiresAt
        ? new Date(consent.expiresAt).toISOString().slice(0, 10)
        : '—';
      lines.push(`  • ${consent.purpose ?? '—'} → ${expiry}`);
    }
    sectionsPopulated.push('consents');
  }

  if (signals.openFlags > 0) {
    lines.push(pickTemplate(TEMPLATES.flagWarning, locale)(signals.openFlags));
    sectionsPopulated.push('flags');
  }

  lines.push(pickTemplate(TEMPLATES.footer, locale)());

  return {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    locale,
    text: lines.join('\n'),
    lineCount: lines.length,
    sectionsPopulated,
    renderer: 'template_v0',
    rendererNote:
      'Template-based renderer. Tier 4 generative SLM (Sarvam-1 q4 / Gemma 2 q4) will replace this with fluent prose once installed.',
    rawPiiReturned: false
  };
}
