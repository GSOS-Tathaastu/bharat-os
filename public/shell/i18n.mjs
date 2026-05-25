// Lightweight i18n — Phase 4.5.
//
// Bharat OS speaks 6 official Indian languages + English. Phase
// 4.5 ships the translation framework + seed translations for the
// highest-impact user-facing surfaces (welcome wizard, bottom nav,
// DPDP card, phone-OTP card). Lower-traffic copy stays English
// for v1; future translations from native speakers replace the
// seed strings without changing the wiring.
//
// §17 honesty: translations marked `seed` are machine-assisted
// drafts. Native-speaker review for production is a known gap
// captured in the ADR.
//
// Usage:
//
//   import { t, setLocale, onLocaleChange } from '/shell/i18n.mjs';
//
//   element.textContent = t('welcome.title');
//   setLocale('hi-IN');
//   onLocaleChange((locale) => rerenderUI());
//
// Lookup: t('key', { fallback: 'English text' }) returns the
// translation in the active locale, falling back to en-IN and
// then to the fallback string if neither exists.

export const I18N_PROTOCOL_VERSION = 'bos.phase0.i18n.v0';

export const SUPPORTED_LOCALES = [
  'en-IN',
  'hi-IN',
  'hi-Latn-IN',
  'mr-IN',
  'bho-IN',
  'ta-IN',
  'bn-IN'
];

const LS_KEY_LOCALE = 'bharat-os.shell.locale.v1';

// Seed translations. Keys use dot notation for grouping. Every
// key is required to have an `en-IN` value; other locales are
// best-effort.
//
// Sources for non-English: machine translation seed; production
// build will replace with native-speaker review. The §17 honesty
// note on the locale switcher tells users explicitly when they're
// reading a seed translation.
const DICTIONARIES = {
  'en-IN': {
    'welcome.title': 'Welcome to Bharat OS',
    'welcome.subtitle': 'Your phone, your identity, your data.',
    'welcome.choice.new.title': 'Set up a new identity',
    'welcome.choice.new.sub': 'Create your Bharat OS profile. Takes 60 seconds.',
    'welcome.choice.migrate.title': 'Move from another phone',
    'welcome.choice.migrate.sub': 'Scan a QR or enter a 6-digit code from your old device.',
    'welcome.choice.demo.title': 'Try a demo persona',
    'welcome.choice.demo.sub': 'Walk through Bharat OS as one of the seeded characters. Demo only — not for real use.',
    'welcome.legal': 'By continuing, you accept our Terms of Service and acknowledge our Privacy Policy.',
    'nav.home': 'Home',
    'nav.earn': 'Earn',
    'nav.trust': 'Trust',
    'nav.profile': 'Profile',
    'card.dpdp.title': 'Your data rights',
    'card.dpdp.note': 'Under India\'s Data Protection Act, you have the right to see every record we hold about you, to delete your account permanently, and to raise a grievance with our Data Protection Officer.',
    'card.dpdp.export': 'Download my data',
    'card.dpdp.delete': 'Delete my account',
    'card.dpdp.dpo': 'Contact DPO',
    'card.phone.title': 'Phone (recovery)',
    'card.phone.note': 'Optional. If you ever lose your recovery phrase, a verified phone number is your fallback path to get back in. Bharat OS sends a 6-digit code; we never store the code, only its hash.',
    'card.phone.send': 'Send code',
    'card.phone.verify': 'Verify',
    'card.phone.cancel': 'Cancel',
    'card.phone.status.notVerified': 'Not verified',
    'card.phone.status.verified': 'Verified',
    'error.network': 'Connection problem',
    'error.offline': 'You\'re offline. Bharat OS will retry when your connection is back.',
    'error.rateLimited': 'Too many requests',
    'action.retry': 'Retry',
    'action.dismiss': 'Dismiss'
  },
  'hi-IN': {
    'welcome.title': 'भारत OS में आपका स्वागत है',
    'welcome.subtitle': 'आपका फोन, आपकी पहचान, आपका डेटा।',
    'welcome.choice.new.title': 'नई पहचान सेट करें',
    'welcome.choice.new.sub': 'अपनी भारत OS प्रोफाइल बनाएँ। 60 सेकंड लगते हैं।',
    'welcome.choice.migrate.title': 'पुराने फोन से लाएँ',
    'welcome.choice.migrate.sub': 'पुराने डिवाइस से QR स्कैन करें या 6-अंकों का कोड डालें।',
    'welcome.choice.demo.title': 'डेमो परिचय आज़माएँ',
    'welcome.choice.demo.sub': 'भारत OS को एक डेमो पहचान के रूप में आज़माएँ। केवल डेमो — वास्तविक उपयोग के लिए नहीं।',
    'welcome.legal': 'जारी रखकर, आप हमारी सेवा शर्तें स्वीकार करते हैं और गोपनीयता नीति की पुष्टि करते हैं।',
    'nav.home': 'मुख्य',
    'nav.earn': 'कमाई',
    'nav.trust': 'विश्वास',
    'nav.profile': 'प्रोफाइल',
    'card.dpdp.title': 'आपके डेटा अधिकार',
    'card.dpdp.note': 'भारत के डेटा संरक्षण अधिनियम के तहत, आपको हमारे पास मौजूद हर रिकॉर्ड देखने, अपना खाता स्थायी रूप से हटाने और हमारे डेटा संरक्षण अधिकारी से शिकायत करने का अधिकार है।',
    'card.dpdp.export': 'मेरा डेटा डाउनलोड करें',
    'card.dpdp.delete': 'मेरा खाता हटाएँ',
    'card.dpdp.dpo': 'DPO से संपर्क करें',
    'card.phone.title': 'फोन (वापसी का तरीका)',
    'card.phone.note': 'वैकल्पिक। यदि आप अपना रिकवरी फ्रेज़ खो दें, तो सत्यापित फोन नंबर आपका वापसी का रास्ता है। भारत OS एक 6-अंकों का कोड भेजता है; हम कोड कभी संग्रहीत नहीं करते, केवल उसका हैश।',
    'card.phone.send': 'कोड भेजें',
    'card.phone.verify': 'सत्यापित करें',
    'card.phone.cancel': 'रद्द करें',
    'card.phone.status.notVerified': 'सत्यापित नहीं',
    'card.phone.status.verified': 'सत्यापित',
    'error.network': 'कनेक्शन की समस्या',
    'error.offline': 'आप ऑफलाइन हैं। कनेक्शन वापस आने पर भारत OS पुनः प्रयास करेगा।',
    'error.rateLimited': 'बहुत अधिक अनुरोध',
    'action.retry': 'पुनः प्रयास',
    'action.dismiss': 'खारिज करें'
  },
  'hi-Latn-IN': {
    'welcome.title': 'Bharat OS mein aapka swagat hai',
    'welcome.subtitle': 'Aapka phone, aapki pehchaan, aapka data.',
    'welcome.choice.new.title': 'Nayi pehchaan set karein',
    'welcome.choice.new.sub': 'Apni Bharat OS profile banayein. 60 second lagte hain.',
    'welcome.choice.migrate.title': 'Purane phone se laayein',
    'welcome.choice.migrate.sub': 'Purane device se QR scan karein ya 6-digit code daalein.',
    'welcome.choice.demo.title': 'Demo persona aazmayein',
    'welcome.choice.demo.sub': 'Bharat OS ko demo persona ke roop mein aazmayein. Sirf demo — asli istemaal ke liye nahi.',
    'welcome.legal': 'Jaari rakhne se, aap hamari Terms of Service swikar karte hain aur Privacy Policy ki pushti karte hain.',
    'nav.home': 'Home',
    'nav.earn': 'Kamaai',
    'nav.trust': 'Bharosa',
    'nav.profile': 'Profile',
    'card.dpdp.title': 'Aapke data adhikaar',
    'card.dpdp.export': 'Mera data download karein',
    'card.dpdp.delete': 'Mera khaata hatayein',
    'card.dpdp.dpo': 'DPO se sampark karein',
    'card.phone.title': 'Phone (recovery)',
    'card.phone.send': 'Code bhejein',
    'card.phone.verify': 'Verify karein',
    'card.phone.cancel': 'Cancel',
    'card.phone.status.notVerified': 'Verified nahi',
    'card.phone.status.verified': 'Verified',
    'error.network': 'Connection ki samasya',
    'error.offline': 'Aap offline hain. Connection waapas aane par Bharat OS phir try karega.',
    'error.rateLimited': 'Bahut sare requests',
    'action.retry': 'Retry',
    'action.dismiss': 'Khaarij'
  },
  'mr-IN': {
    'welcome.title': 'भारत OS मध्ये आपले स्वागत आहे',
    'welcome.subtitle': 'आपला फोन, आपली ओळख, आपला डेटा.',
    'welcome.choice.new.title': 'नवीन ओळख तयार करा',
    'welcome.choice.migrate.title': 'दुसऱ्या फोनवरून आणा',
    'welcome.choice.demo.title': 'डेमो परिचय आजमावा',
    'nav.home': 'मुख्य',
    'nav.earn': 'कमाई',
    'nav.trust': 'विश्वास',
    'nav.profile': 'प्रोफाइल',
    'card.dpdp.title': 'आपले डेटा अधिकार',
    'card.dpdp.export': 'माझा डेटा डाउनलोड करा',
    'card.dpdp.delete': 'माझे खाते हटवा',
    'card.dpdp.dpo': 'DPO शी संपर्क साधा',
    'card.phone.title': 'फोन (परत येण्याचा मार्ग)',
    'card.phone.send': 'कोड पाठवा',
    'card.phone.verify': 'सत्यापित करा',
    'card.phone.cancel': 'रद्द करा',
    'error.offline': 'आपण ऑफलाइन आहात. कनेक्शन परत आल्यावर भारत OS पुन्हा प्रयत्न करेल.',
    'action.retry': 'पुन्हा प्रयत्न करा'
  },
  'bho-IN': {
    'welcome.title': 'भारत OS में राउर स्वागत बा',
    'welcome.subtitle': 'राउर फोन, राउर पहचान, राउर डेटा।',
    'welcome.choice.new.title': 'नया पहचान बनाईं',
    'welcome.choice.migrate.title': 'दूसरा फोन से लाईं',
    'welcome.choice.demo.title': 'डेमो परिचय आजमाईं',
    'nav.home': 'मुख्य',
    'nav.earn': 'कमाई',
    'nav.trust': 'भरोसा',
    'nav.profile': 'प्रोफाइल',
    'card.dpdp.title': 'राउर डेटा अधिकार',
    'card.phone.title': 'फोन (वापसी)',
    'card.phone.send': 'कोड भेजीं',
    'card.phone.verify': 'सत्यापित करीं',
    'card.phone.cancel': 'रद्द करीं',
    'action.retry': 'दोबारा कोशिश'
  },
  'ta-IN': {
    'welcome.title': 'பாரத் OS-க்கு உங்களை வரவேற்கிறோம்',
    'welcome.subtitle': 'உங்கள் தொலைபேசி, உங்கள் அடையாளம், உங்கள் தரவு.',
    'welcome.choice.new.title': 'புதிய அடையாளம் உருவாக்கவும்',
    'welcome.choice.migrate.title': 'மற்றொரு தொலைபேசியிலிருந்து கொண்டு வாருங்கள்',
    'welcome.choice.demo.title': 'டெமோ முயற்சிக்கவும்',
    'nav.home': 'முகப்பு',
    'nav.earn': 'சம்பாதி',
    'nav.trust': 'நம்பிக்கை',
    'nav.profile': 'சுயவிவரம்',
    'card.dpdp.title': 'உங்கள் தரவு உரிமைகள்',
    'card.dpdp.export': 'எனது தரவை பதிவிறக்கவும்',
    'card.dpdp.delete': 'எனது கணக்கை நீக்கவும்',
    'card.phone.title': 'தொலைபேசி (மீட்பு)',
    'card.phone.send': 'குறியீட்டை அனுப்பவும்',
    'card.phone.verify': 'சரிபார்க்கவும்',
    'card.phone.cancel': 'ரத்து செய்',
    'error.offline': 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். இணைப்பு திரும்பும்போது மீண்டும் முயற்சிக்கும்.',
    'action.retry': 'மீண்டும் முயற்சி'
  },
  'bn-IN': {
    'welcome.title': 'ভারত OS-এ স্বাগতম',
    'welcome.subtitle': 'আপনার ফোন, আপনার পরিচয়, আপনার ডেটা।',
    'welcome.choice.new.title': 'নতুন পরিচয় তৈরি করুন',
    'welcome.choice.migrate.title': 'অন্য ফোন থেকে আনুন',
    'welcome.choice.demo.title': 'ডেমো চেষ্টা করুন',
    'nav.home': 'হোম',
    'nav.earn': 'আয়',
    'nav.trust': 'বিশ্বাস',
    'nav.profile': 'প্রোফাইল',
    'card.dpdp.title': 'আপনার ডেটা অধিকার',
    'card.dpdp.export': 'আমার ডেটা ডাউনলোড করুন',
    'card.dpdp.delete': 'আমার অ্যাকাউন্ট মুছুন',
    'card.phone.title': 'ফোন (পুনরুদ্ধার)',
    'card.phone.send': 'কোড পাঠান',
    'card.phone.verify': 'যাচাই করুন',
    'card.phone.cancel': 'বাতিল',
    'error.offline': 'আপনি অফলাইন। সংযোগ ফিরে এলে ভারত OS আবার চেষ্টা করবে।',
    'action.retry': 'আবার চেষ্টা'
  }
};

let activeLocale = 'en-IN';
const listeners = new Set();

function loadStoredLocale() {
  try {
    const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY_LOCALE) : null);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch (_error) {
    /* private-mode storage failure is fine */
  }
  return null;
}

// Init: pick saved locale, then browser preference, then en-IN.
const stored = loadStoredLocale();
if (stored) {
  activeLocale = stored;
} else if (typeof navigator !== 'undefined') {
  const browser = navigator.language ?? navigator.userLanguage ?? '';
  if (SUPPORTED_LOCALES.includes(browser)) activeLocale = browser;
  else if (browser.startsWith('hi')) activeLocale = 'hi-IN';
  else if (browser.startsWith('ta')) activeLocale = 'ta-IN';
  else if (browser.startsWith('bn')) activeLocale = 'bn-IN';
  else if (browser.startsWith('mr')) activeLocale = 'mr-IN';
}

export function getLocale() {
  return activeLocale;
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`unsupported locale: ${locale}`);
  }
  if (locale === activeLocale) return;
  activeLocale = locale;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY_LOCALE, locale);
    }
  } catch (_error) {
    /* fine */
  }
  for (const listener of listeners) {
    try {
      listener(locale);
    } catch (error) {
      console.warn('i18n listener threw', error);
    }
  }
}

export function onLocaleChange(callback) {
  if (typeof callback !== 'function') {
    throw new Error('onLocaleChange requires a function.');
  }
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// t(key, { fallback })
//
//   1. Look up the active locale's dictionary.
//   2. Fall back to en-IN if missing.
//   3. Fall back to the explicit `fallback` option if still missing.
//   4. Fall back to the key itself as a last resort (so missing
//      keys are visible during dev).
export function t(key, { fallback, locale } = {}) {
  const target = locale ?? activeLocale;
  const dict = DICTIONARIES[target];
  if (dict && key in dict) return dict[key];
  const en = DICTIONARIES['en-IN'];
  if (en && key in en) return en[key];
  if (fallback !== undefined) return fallback;
  return key;
}

// Apply translations to every element with a `data-i18n="key"`
// attribute. Re-runnable — call again after setLocale to update.
export function applyI18n(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (!key) continue;
    el.textContent = t(key);
  }
  // Attribute-only translations: data-i18n-aria-label, etc.
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
}

// Per-locale completion stats — useful for the §17 honesty board
// and the language picker UI. A locale that's only 30% translated
// should say so.
export function getLocaleCoverage(locale) {
  const dict = DICTIONARIES[locale];
  const en = DICTIONARIES['en-IN'];
  if (!dict || !en) return { total: 0, translated: 0, pct: 0 };
  const total = Object.keys(en).length;
  const translated = Object.keys(en).filter((k) => k in dict).length;
  return { total, translated, pct: Math.round((translated / total) * 100) };
}

export function listLocales() {
  return SUPPORTED_LOCALES.map((locale) => ({
    locale,
    coverage: getLocaleCoverage(locale)
  }));
}
