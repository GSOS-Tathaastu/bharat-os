// L8 — Vernacular layer.
//
// Deterministic, dependency-free intent normalization and response localization
// for the canonical orchestration templates. Coverage today: Hindi (hi),
// Marathi (mr), Bhojpuri (bho), Tamil (ta), Bengali (bn) — script-native and
// romanized. This is the seam where Bhashini / IndicWhisper / IndicTTS /
// IndicTrans2 integrations will land. See BHARAT_OS.md §7a and §17.

export const VERNACULAR_PROTOCOL_VERSION = 'bos.phase1.vernacular.v0';

const DEVANAGARI = /[ऀ-ॿ]/;
const TAMIL = /[஀-௿]/;
const BENGALI = /[ঀ-৿]/;

export const VERNACULAR_LANGUAGES = [
  {
    languageId: 'hi',
    locale: 'hi-IN',
    romanizedLocale: 'hi-Latn-IN',
    label: 'Hindi',
    script: 'Devanagari',
    scriptTest: DEVANAGARI,
    // Keywords used only to disambiguate Devanagari languages from each other.
    devanagariMarkers: ['है', 'हूँ', 'मुझे', 'मेरा', 'चाहिए', 'कृपया'],
    romanizedMarkers: ['mujhe', 'mera', 'meri', 'chahiye', 'kripya', 'kya']
  },
  {
    languageId: 'mr',
    locale: 'mr-IN',
    romanizedLocale: 'mr-Latn-IN',
    label: 'Marathi',
    script: 'Devanagari',
    scriptTest: DEVANAGARI,
    devanagariMarkers: ['आहे', 'मला', 'माझे', 'पाहिजे', 'करायचे'],
    romanizedMarkers: ['mala', 'majhe', 'pahije', 'karaycha', 'aahe', 'kasa']
  },
  {
    languageId: 'bho',
    locale: 'bho-IN',
    romanizedLocale: 'bho-Latn-IN',
    label: 'Bhojpuri',
    script: 'Devanagari',
    scriptTest: DEVANAGARI,
    devanagariMarkers: ['बा', 'हमरा', 'चाहीं', 'कइल', 'भइल'],
    romanizedMarkers: ['hamra', 'humra', 'chahin', 'chaahin', 'kail', 'bhail', 'rauaa']
  },
  {
    languageId: 'ta',
    locale: 'ta-IN',
    romanizedLocale: 'ta-Latn-IN',
    label: 'Tamil',
    script: 'Tamil',
    scriptTest: TAMIL,
    devanagariMarkers: [],
    romanizedMarkers: ['enakku', 'enaku', 'venum', 'naan', 'tevai', 'kudu']
  },
  {
    languageId: 'bn',
    locale: 'bn-IN',
    romanizedLocale: 'bn-Latn-IN',
    label: 'Bengali',
    script: 'Bengali',
    scriptTest: BENGALI,
    devanagariMarkers: [],
    romanizedMarkers: ['amake', 'amar', 'lagbe', 'chai', 'ki', 'korbo']
  }
];

// Each entry binds a canonical action type to language-specific patterns. A
// match yields the action type *and* the language. We deliberately keep both
// script and romanized variants for every language because the §7a "romanized
// Bharat" reality is how rural users actually type.
export const VERNACULAR_INTENT_ALIASES = [
  // ─── Hindi ──────────────────────────────────────────────────────────────
  {
    languageId: 'hi',
    actionType: 'health_record_read',
    label: 'Hindi health record intent',
    hints: ['health', 'abha', 'medical', 'record'],
    patterns: [
      /(स्वास्थ्य|इलाज|दवाई|मेडिकल|रिकॉर्ड|बीमारी)/,
      /\b(swasthya|ilaaj|ilaj|dawai|medical record|abha|bimari)\b/i
    ]
  },
  {
    languageId: 'hi',
    actionType: 'labor_match_post',
    label: 'Hindi labor matching intent',
    hints: ['labor', 'worker', 'job', 'wage', 'hire'],
    patterns: [
      /(मजदूर|कामगार|नौकरी|रोजगार|दिहाड़ी|काम)/,
      /\b(mazdoor|majdoor|kamgar|kaamgaar|naukri|rojgar|rozgar|dihadi|kaam)\b/i
    ]
  },
  {
    languageId: 'hi',
    actionType: 'scheme_delivery',
    label: 'Hindi scheme delivery intent',
    hints: ['scheme', 'benefit', 'subsidy', 'eligibility', 'ration', 'dbt'],
    patterns: [
      /(योजना|लाभ|सब्सिडी|राशन|पात्र)/,
      /\b(yojana|labh|sarkari|subsidy|ration|patra|eligible)\b/i
    ]
  },
  {
    languageId: 'hi',
    actionType: 'regulated_onboarding',
    label: 'Hindi regulated onboarding intent',
    hints: ['account', 'onboard', 'kyc', 'bank', 'loan'],
    patterns: [
      /(बैंक|खाता|ऋण|लोन|केवाईसी|कारोबारी|कारोबार|व्यवसाय)/,
      /\b(bank|khata|khaata|loan|karz|karza|karzaa|karja|karjaa|kyc|business|nbfc)\b/i
    ]
  },
  {
    languageId: 'hi',
    actionType: 'mesh_storage',
    label: 'Hindi storage intent',
    hints: ['store', 'storage', 'mesh', 'backup', 'archive'],
    patterns: [
      /(सुरक्षित|संग्रह|बैकअप|फाइल)/,
      /\b(surakshit|sangrah|backup|file|rakhna|rakho)\b/i
    ]
  },
  {
    languageId: 'hi',
    actionType: 'service_booking',
    label: 'Hindi service booking intent',
    hints: ['book', 'cab', 'taxi', 'hotel', 'ticket', 'food', 'grocery', 'service'],
    patterns: [
      /(कैब|टैक्सी|गाड़ी|होटल|कमरा|टिकट|खाना|राशन|किराना|बुक)/,
      /\b(cab|taxi|gaadi|hotel|kamra|ticket|khana|ration|kirana|book\s*kar(o|do|de)|mangwa(o|do|de))\b/i
    ]
  },

  // ─── Marathi ────────────────────────────────────────────────────────────
  {
    languageId: 'mr',
    actionType: 'health_record_read',
    label: 'Marathi health record intent',
    hints: ['health', 'abha', 'medical', 'record'],
    patterns: [
      /(आरोग्य|वैद्यकीय|औषध|रुग्ण|नोंद)/,
      /\b(arogya|vaidyakiya|aushadh|rugna|nond|aabha)\b/i
    ]
  },
  {
    languageId: 'mr',
    actionType: 'labor_match_post',
    label: 'Marathi labor matching intent',
    hints: ['labor', 'worker', 'job', 'wage', 'hire'],
    patterns: [
      /(मजूर|कामगार|नोकरी|रोजगार|मजुरी)/,
      /\b(majur|kamgar|nokri|rojgar|majuri)\b/i
    ]
  },
  {
    languageId: 'mr',
    actionType: 'scheme_delivery',
    label: 'Marathi scheme delivery intent',
    hints: ['scheme', 'benefit', 'subsidy', 'eligibility'],
    patterns: [
      /(योजना|लाभ|अनुदान|सवलत|पात्र)/,
      /\b(yojana|labh|anudan|savlat|patra)\b/i
    ]
  },
  {
    languageId: 'mr',
    actionType: 'regulated_onboarding',
    label: 'Marathi regulated onboarding intent',
    hints: ['account', 'bank', 'loan', 'kyc'],
    patterns: [
      /(बँक|खाते|कर्ज|केवायसी)/,
      /\b(bank|khate|karj|kyc)\b/i
    ]
  },
  {
    languageId: 'mr',
    actionType: 'mesh_storage',
    label: 'Marathi storage intent',
    hints: ['store', 'storage', 'mesh', 'backup'],
    patterns: [
      /(साठवण|बॅकअप|सुरक्षित|फाइल)/,
      /\b(sathvan|backup|surakshit|file|thev)\b/i
    ]
  },
  {
    languageId: 'mr',
    actionType: 'service_booking',
    label: 'Marathi service booking intent',
    hints: ['book', 'cab', 'taxi', 'hotel', 'ticket', 'food'],
    patterns: [
      /(टॅक्सी|कॅब|गाडी|हॉटेल|खोली|तिकीट|जेवण|किराणा|बुक)/,
      /\b(taxi|cab|gaadi|hotel|kholi|tiket|jevan|kirana|book\s*kar)\b/i
    ]
  },

  // ─── Bhojpuri ───────────────────────────────────────────────────────────
  {
    languageId: 'bho',
    actionType: 'health_record_read',
    label: 'Bhojpuri health record intent',
    hints: ['health', 'abha', 'medical', 'record'],
    patterns: [
      /(बेमारी|दवाई|डाक्टर|इलाज)/,
      /\b(bemari|dawai|daktar|ilaaj|abha)\b/i
    ]
  },
  {
    languageId: 'bho',
    actionType: 'labor_match_post',
    label: 'Bhojpuri labor matching intent',
    hints: ['labor', 'worker', 'job', 'wage', 'hire', 'brick'],
    patterns: [
      /(मजूर|मजदूर|काम|भट्ठा|दिहाड़ी)/,
      /\b(majdoor|mazoor|kaam|bhattha|dihadi|dihaari)\b/i
    ]
  },
  {
    languageId: 'bho',
    actionType: 'scheme_delivery',
    label: 'Bhojpuri scheme delivery intent',
    hints: ['scheme', 'benefit', 'subsidy', 'ration'],
    patterns: [
      /(योजना|लाभ|राशन|सरकारी)/,
      /\b(yojana|labh|ration|sarkari)\b/i
    ]
  },
  {
    languageId: 'bho',
    actionType: 'regulated_onboarding',
    label: 'Bhojpuri regulated onboarding intent',
    hints: ['account', 'bank', 'loan', 'kyc'],
    patterns: [
      /(बैंक|खाता|करजा|लोन)/,
      /\b(bank|khaata|karja|loan|kyc)\b/i
    ]
  },
  {
    languageId: 'bho',
    actionType: 'mesh_storage',
    label: 'Bhojpuri storage intent',
    hints: ['store', 'storage', 'mesh', 'backup'],
    patterns: [
      /(सुरक्षित|बैकअप|फाइल|राख)/,
      /\b(surakshit|backup|file|rakh|rakha)\b/i
    ]
  },
  {
    languageId: 'bho',
    actionType: 'service_booking',
    label: 'Bhojpuri service booking intent',
    hints: ['book', 'cab', 'taxi', 'hotel', 'ticket', 'food'],
    patterns: [
      /(टैक्सी|गाड़ी|होटल|टिकट|खाना|बुक)/,
      /\b(taxi|gaadi|hotel|tikat|khana|book\s*kara)\b/i
    ]
  },

  // ─── Tamil ──────────────────────────────────────────────────────────────
  {
    languageId: 'ta',
    actionType: 'health_record_read',
    label: 'Tamil health record intent',
    hints: ['health', 'abha', 'medical', 'record'],
    patterns: [
      /(மருத்துவ|நோய்|மருந்து|உடல்நலம்|பதிவு)/,
      /\b(maruthuva|noi|marundhu|udalnalam|pathivu|abha)\b/i
    ]
  },
  {
    languageId: 'ta',
    actionType: 'labor_match_post',
    label: 'Tamil labor matching intent',
    hints: ['labor', 'worker', 'job', 'wage', 'hire'],
    patterns: [
      /(தொழிலாளர்|வேலை|கூலி|பணி)/,
      /\b(thozhilalar|velai|kooli|pani|kaali)\b/i
    ]
  },
  {
    languageId: 'ta',
    actionType: 'scheme_delivery',
    label: 'Tamil scheme delivery intent',
    hints: ['scheme', 'benefit', 'subsidy', 'eligibility'],
    patterns: [
      /(திட்டம்|நலத்திட்டம்|மானியம்|தகுதி)/,
      /\b(thittam|naltittam|maniyam|thaguthi)\b/i
    ]
  },
  {
    languageId: 'ta',
    actionType: 'regulated_onboarding',
    label: 'Tamil regulated onboarding intent',
    hints: ['account', 'bank', 'loan', 'kyc'],
    patterns: [
      /(வங்கி|கணக்கு|கடன்|கேவைசி)/,
      /\b(vangi|kanakku|kadan|kyc)\b/i
    ]
  },
  {
    languageId: 'ta',
    actionType: 'mesh_storage',
    label: 'Tamil storage intent',
    hints: ['store', 'storage', 'mesh', 'backup'],
    patterns: [
      /(சேமி|சேமிப்பு|காப்பு|கோப்பு)/,
      /\b(semi|semippu|kaappu|koppu|backup)\b/i
    ]
  },
  {
    languageId: 'ta',
    actionType: 'service_booking',
    label: 'Tamil service booking intent',
    hints: ['book', 'cab', 'taxi', 'hotel', 'ticket', 'food'],
    patterns: [
      /(டாக்ஸி|கேப்|வண்டி|ஹோட்டல்|அறை|டிக்கெட்|உணவு|புக்)/,
      /\b(taxi|cab|vandi|hotel|arai|ticket|unavu|book\s*pannu)\b/i
    ]
  },

  // ─── Bengali ────────────────────────────────────────────────────────────
  {
    languageId: 'bn',
    actionType: 'health_record_read',
    label: 'Bengali health record intent',
    hints: ['health', 'abha', 'medical', 'record'],
    patterns: [
      /(স্বাস্থ্য|চিকিৎসা|ওষুধ|রোগ|রেকর্ড)/,
      /\b(swasthya|chikitsa|oshudh|rog|record|abha)\b/i
    ]
  },
  {
    languageId: 'bn',
    actionType: 'labor_match_post',
    label: 'Bengali labor matching intent',
    hints: ['labor', 'worker', 'job', 'wage', 'hire'],
    patterns: [
      /(শ্রমিক|মজুর|কাজ|মজুরি|চাকরি)/,
      /\b(sromik|majur|kaaj|majuri|chakri)\b/i
    ]
  },
  {
    languageId: 'bn',
    actionType: 'scheme_delivery',
    label: 'Bengali scheme delivery intent',
    hints: ['scheme', 'benefit', 'subsidy', 'eligibility'],
    patterns: [
      /(প্রকল্প|সুবিধা|ভর্তুকি|রেশন|যোগ্য)/,
      /\b(prokolpo|subidha|bhortuki|ration|jogyo)\b/i
    ]
  },
  {
    languageId: 'bn',
    actionType: 'regulated_onboarding',
    label: 'Bengali regulated onboarding intent',
    hints: ['account', 'bank', 'loan', 'kyc'],
    patterns: [
      /(ব্যাংক|হিসাব|ঋণ|কেওয়াইসি)/,
      /\b(bank|hisab|rin|loan|kyc)\b/i
    ]
  },
  {
    languageId: 'bn',
    actionType: 'mesh_storage',
    label: 'Bengali storage intent',
    hints: ['store', 'storage', 'mesh', 'backup'],
    patterns: [
      /(সংরক্ষণ|ব্যাকআপ|নিরাপদ|ফাইল)/,
      /\b(sanrakshan|backup|nirapad|file|rakho)\b/i
    ]
  },
  {
    languageId: 'bn',
    actionType: 'service_booking',
    label: 'Bengali service booking intent',
    hints: ['book', 'cab', 'taxi', 'hotel', 'ticket', 'food'],
    patterns: [
      /(ট্যাক্সি|গাড়ি|হোটেল|ঘর|টিকিট|খাবার|বুক)/,
      /\b(taxi|cab|gari|hotel|ghor|tikit|khabar|book\s*koro)\b/i
    ]
  }
];

const INTENT_PATTERNS = [
  { actionType: 'health_record_read', pattern: /\b(health|abha|diabetes|medical|record)\b/i },
  { actionType: 'labor_match_post', pattern: /\b(labou?r\w*|worker\w*|job|wage|escrow|brick)\b/i },
  { actionType: 'scheme_delivery', pattern: /\b(scheme|benefit|subsidy|eligib|ration|dbt)\b/i },
  { actionType: 'regulated_onboarding', pattern: /\b(account|onboard|kyc|bank|loan|nbfc)\b/i },
  { actionType: 'service_booking', pattern: /\b(book|booking|cab|taxi|uber|ola|rapido|hotel|room|stay|ticket|train|flight|bus|food|order|grocery|electrician|plumber|carpenter|doctor|appointment|namma\s*yatri|ondc)\b/i },
  { actionType: 'mesh_storage', pattern: /\b(store|storage|mesh|backup|archive)\b/i }
];

// Localized response phrases for the canonical action types. These are short,
// status-bearing strings the shell or operator console can render back to a
// user. English is the fallback. Keep these intentionally minimal — the full
// generative UI renderer (§17) is future work.
export const VERNACULAR_RESPONSES = {
  health_record_read: {
    planned: {
      'en-IN': 'Your health record request is ready to run.',
      'hi-IN': 'आपका स्वास्थ्य रिकॉर्ड अनुरोध तैयार है।',
      'hi-Latn-IN': 'Aapka swasthya record anurodh taiyar hai.',
      'mr-IN': 'तुमची आरोग्य नोंदणी विनंती तयार आहे.',
      'bho-IN': 'राउर सेहत के रिकार्ड के अनुरोध तइयार बा।',
      'ta-IN': 'உங்கள் மருத்துவ பதிவு கோரிக்கை தயாராக உள்ளது.',
      'bn-IN': 'আপনার স্বাস্থ্য রেকর্ড অনুরোধ প্রস্তুত।'
    },
    blocked: {
      'en-IN': 'Health record request blocked — consent required.',
      'hi-IN': 'स्वास्थ्य रिकॉर्ड के लिए सहमति आवश्यक है।',
      'hi-Latn-IN': 'Swasthya record ke liye consent zaroori hai.',
      'mr-IN': 'आरोग्य नोंदणीसाठी संमती आवश्यक आहे.',
      'bho-IN': 'सेहत के रिकार्ड खातिर सहमति चाहीं।',
      'ta-IN': 'மருத்துவ பதிவுக்கு ஒப்புதல் தேவை.',
      'bn-IN': 'স্বাস্থ্য রেকর্ডের জন্য সম্মতি প্রয়োজন।'
    },
    completed: {
      'en-IN': 'Health record summary retrieved.',
      'hi-IN': 'स्वास्थ्य रिकॉर्ड का सारांश प्राप्त हो गया।',
      'hi-Latn-IN': 'Swasthya record summary mil gaya.',
      'mr-IN': 'आरोग्य नोंदणी सारांश मिळाला.',
      'bho-IN': 'सेहत के रिकार्ड के सारांश मिल गइल।',
      'ta-IN': 'மருத்துவ பதிவின் சுருக்கம் கிடைத்தது.',
      'bn-IN': 'স্বাস্থ্য রেকর্ডের সারাংশ পাওয়া গেছে।'
    }
  },
  labor_match_post: {
    planned: {
      'en-IN': 'Labor matching request is ready — wages are held in escrow until completion.',
      'hi-IN': 'मजदूर मिलान अनुरोध तैयार है — मजदूरी काम पूरा होने तक एस्क्रो में रहेगी।',
      'hi-Latn-IN': 'Mazdoor milan anurodh taiyar hai — majdoori escrow mein rahegi.',
      'mr-IN': 'मजूर जुळवणी विनंती तयार आहे — मजुरी एस्क्रोमध्ये राखीव आहे.',
      'bho-IN': 'मजदूर मिलान के अनुरोध तइयार बा — मजदूरी एस्क्रो में रही।',
      'ta-IN': 'தொழிலாளர் பொருத்த கோரிக்கை தயார் — கூலி காப்பகத்தில் வைக்கப்படும்.',
      'bn-IN': 'শ্রমিক মিলান অনুরোধ প্রস্তুত — মজুরি এসক্রোতে রাখা হবে।'
    },
    blocked: {
      'en-IN': 'Labor request blocked. Workers will never be asked to pay.',
      'hi-IN': 'मजदूर अनुरोध रुका हुआ है। मजदूर से कोई शुल्क नहीं लिया जाएगा।',
      'hi-Latn-IN': 'Mazdoor anurodh ruka hai. Mazdoor se koi shulk nahi liya jayega.',
      'mr-IN': 'मजूर विनंती थांबवली. मजुराकडून शुल्क घेतले जाणार नाही.',
      'bho-IN': 'मजदूर अनुरोध रुकल बा। मजदूर से कौनो पइसा ना लीहल जाई।',
      'ta-IN': 'தொழிலாளர் கோரிக்கை நிறுத்தப்பட்டது. தொழிலாளரிடம் கட்டணம் கேட்கப்படாது.',
      'bn-IN': 'শ্রমিক অনুরোধ আটকে আছে। শ্রমিকের কাছ থেকে ফি নেওয়া হবে না।'
    },
    completed: {
      'en-IN': 'Workers notified; escrow created.',
      'hi-IN': 'मजदूरों को सूचना भेज दी गई; एस्क्रो बना दिया गया।',
      'hi-Latn-IN': 'Mazdooron ko soochna bhej di; escrow ban gaya.',
      'mr-IN': 'मजुरांना कळवले; एस्क्रो तयार झाला.',
      'bho-IN': 'मजदूरन के बता दिहल गइल; एस्क्रो बन गइल।',
      'ta-IN': 'தொழிலாளர்களுக்கு அறிவிக்கப்பட்டது; காப்பகம் உருவாக்கப்பட்டது.',
      'bn-IN': 'শ্রমিকদের জানানো হয়েছে; এসক্রো তৈরি হয়েছে।'
    }
  },
  scheme_delivery: {
    planned: {
      'en-IN': 'Scheme eligibility check is ready to run.',
      'hi-IN': 'योजना पात्रता जांच तैयार है।',
      'hi-Latn-IN': 'Yojana patrata jaanch taiyar hai.',
      'mr-IN': 'योजना पात्रता तपासणी तयार आहे.',
      'bho-IN': 'योजना खातिर पात्रता जांच तइयार बा।',
      'ta-IN': 'திட்ட தகுதி சோதனை தயார்.',
      'bn-IN': 'প্রকল্প যোগ্যতা যাচাই প্রস্তুত।'
    },
    blocked: {
      'en-IN': 'Scheme check blocked — consent required.',
      'hi-IN': 'योजना जांच के लिए सहमति आवश्यक है।',
      'hi-Latn-IN': 'Yojana jaanch ke liye consent zaroori hai.',
      'mr-IN': 'योजना तपासणीसाठी संमती आवश्यक आहे.',
      'bho-IN': 'योजना जांच खातिर सहमति चाहीं।',
      'ta-IN': 'திட்டச் சோதனைக்கு ஒப்புதல் தேவை.',
      'bn-IN': 'প্রকল্প যাচাইয়ের জন্য সম্মতি প্রয়োজন।'
    },
    completed: {
      'en-IN': 'Eligible schemes retrieved.',
      'hi-IN': 'पात्र योजनाएं प्राप्त हो गईं।',
      'hi-Latn-IN': 'Patra yojanayein mil gayin.',
      'mr-IN': 'पात्र योजना मिळाल्या.',
      'bho-IN': 'पात्र योजना मिल गइल।',
      'ta-IN': 'தகுதியான திட்டங்கள் கிடைத்தன.',
      'bn-IN': 'যোগ্য প্রকল্প পাওয়া গেছে।'
    }
  },
  regulated_onboarding: {
    planned: {
      'en-IN': 'Onboarding is ready to run.',
      'hi-IN': 'खाता खोलने का अनुरोध तैयार है।',
      'hi-Latn-IN': 'Khata kholne ka anurodh taiyar hai.',
      'mr-IN': 'खाते उघडण्याची विनंती तयार आहे.',
      'bho-IN': 'खाता खोले के अनुरोध तइयार बा।',
      'ta-IN': 'கணக்கு திறப்பு கோரிக்கை தயார்.',
      'bn-IN': 'অ্যাকাউন্ট খোলার অনুরোধ প্রস্তুত।'
    },
    blocked: {
      'en-IN': 'Onboarding blocked — consent required.',
      'hi-IN': 'खाता खोलने के लिए सहमति आवश्यक है।',
      'hi-Latn-IN': 'Khata kholne ke liye consent zaroori hai.',
      'mr-IN': 'खाते उघडण्यासाठी संमती आवश्यक आहे.',
      'bho-IN': 'खाता खोले खातिर सहमति चाहीं।',
      'ta-IN': 'கணக்கு திறக்க ஒப்புதல் தேவை.',
      'bn-IN': 'অ্যাকাউন্ট খোলার জন্য সম্মতি প্রয়োজন।'
    },
    completed: {
      'en-IN': 'Onboarding completed.',
      'hi-IN': 'खाता खोलने की प्रक्रिया पूरी हुई।',
      'hi-Latn-IN': 'Khata kholne ka kaam pura hua.',
      'mr-IN': 'खाते उघडण्याची प्रक्रिया पूर्ण झाली.',
      'bho-IN': 'खाता खोले के काम पूरा भइल।',
      'ta-IN': 'கணக்கு திறப்பு முடிந்தது.',
      'bn-IN': 'অ্যাকাউন্ট খোলা সম্পন্ন।'
    }
  },
  mesh_storage: {
    planned: {
      'en-IN': 'Storage request is ready.',
      'hi-IN': 'भंडारण अनुरोध तैयार है।',
      'hi-Latn-IN': 'Storage anurodh taiyar hai.',
      'mr-IN': 'साठवण विनंती तयार आहे.',
      'bho-IN': 'भंडारण अनुरोध तइयार बा।',
      'ta-IN': 'சேமிப்பு கோரிக்கை தயார்.',
      'bn-IN': 'সঞ্চয় অনুরোধ প্রস্তুত।'
    },
    blocked: {
      'en-IN': 'Storage request blocked.',
      'hi-IN': 'भंडारण अनुरोध रुका हुआ है।',
      'hi-Latn-IN': 'Storage anurodh ruka hai.',
      'mr-IN': 'साठवण विनंती थांबवली.',
      'bho-IN': 'भंडारण अनुरोध रुकल बा।',
      'ta-IN': 'சேமிப்பு கோரிக்கை நிறுத்தப்பட்டது.',
      'bn-IN': 'সঞ্চয় অনুরোধ আটকানো হয়েছে।'
    },
    completed: {
      'en-IN': 'Stored on the mesh.',
      'hi-IN': 'मेश पर सुरक्षित कर दिया गया।',
      'hi-Latn-IN': 'Mesh par store ho gaya.',
      'mr-IN': 'मेशवर साठवले गेले.',
      'bho-IN': 'मेश पर रख दिहल गइल।',
      'ta-IN': 'மெஷில் சேமிக்கப்பட்டது.',
      'bn-IN': 'মেশে সংরক্ষিত হয়েছে।'
    }
  },
  service_booking: {
    planned: {
      'en-IN': 'Looking for the best provider for you.',
      'hi-IN': 'आपके लिए सबसे अच्छा प्रदाता ढूंढ रहा हूं।',
      'hi-Latn-IN': 'Aapke liye behatreen provider dhundh raha hoon.',
      'mr-IN': 'तुमच्यासाठी सर्वोत्तम सेवा पुरवठादार शोधत आहे.',
      'bho-IN': 'राउर खातिर बढ़िया प्रदाता खोजल जा रहल बा।',
      'ta-IN': 'உங்களுக்கு சிறந்த சேவையாளரைத் தேடுகிறேன்.',
      'bn-IN': 'আপনার জন্য সেরা পরিষেবা খুঁজছি।'
    },
    blocked: {
      'en-IN': 'Booking blocked — consent required.',
      'hi-IN': 'बुकिंग के लिए सहमति आवश्यक है।',
      'hi-Latn-IN': 'Booking ke liye consent zaroori hai.',
      'mr-IN': 'बुकिंगसाठी संमती आवश्यक आहे.',
      'bho-IN': 'बुकिंग खातिर सहमति चाहीं।',
      'ta-IN': 'பதிவுக்கு ஒப்புதல் தேவை.',
      'bn-IN': 'বুকিংয়ের জন্য সম্মতি প্রয়োজন।'
    },
    completed: {
      'en-IN': 'Booking confirmed.',
      'hi-IN': 'बुकिंग पक्की हो गई।',
      'hi-Latn-IN': 'Booking confirm ho gayi.',
      'mr-IN': 'बुकिंग निश्चित झाली.',
      'bho-IN': 'बुकिंग पक्का हो गइल।',
      'ta-IN': 'பதிவு உறுதி செய்யப்பட்டது.',
      'bn-IN': 'বুকিং নিশ্চিত হয়েছে।'
    }
  }
};

function languageById(languageId) {
  return VERNACULAR_LANGUAGES.find((lang) => lang.languageId === languageId) ?? null;
}

function scoreLanguageFromText(originalText) {
  let bestLanguageId = null;
  let bestScore = 0;
  for (const lang of VERNACULAR_LANGUAGES) {
    let score = 0;
    if (lang.scriptTest.test(originalText)) {
      // Script match is a strong base signal; can still be refined by markers.
      score += 2;
    }
    for (const marker of lang.devanagariMarkers) {
      if (originalText.includes(marker)) score += 2;
    }
    for (const marker of lang.romanizedMarkers) {
      const re = new RegExp(`\\b${marker}\\b`, 'i');
      if (re.test(originalText)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLanguageId = lang.languageId;
    }
  }
  return { languageId: bestLanguageId, score: bestScore };
}

function detectLocale(originalText, requestedLocale, matchedAliases, scoredLanguageId) {
  // If the caller asked for a specific locale, honor it.
  if (requestedLocale && requestedLocale !== 'en-IN') return requestedLocale;

  // Otherwise pick the strongest alias hit; ties are broken by script presence.
  const candidateId = matchedAliases[0]?.languageId ?? scoredLanguageId;
  const lang = candidateId ? languageById(candidateId) : null;
  if (!lang) return requestedLocale ?? 'en-IN';

  return lang.scriptTest.test(originalText) ? lang.locale : lang.romanizedLocale;
}

export function normalizeIntent(intentText = '', { locale = 'en-IN' } = {}) {
  const originalText = String(intentText ?? '').trim();

  const rawMatches = VERNACULAR_INTENT_ALIASES.filter((alias) =>
    alias.patterns.some((pattern) => pattern.test(originalText))
  ).map((alias) => ({
    actionType: alias.actionType,
    label: alias.label,
    languageId: alias.languageId,
    hints: alias.hints
  }));

  const { languageId: scoredLanguageId } = scoreLanguageFromText(originalText);

  // Detect pure English: ASCII-only AND no Indic-language markers anywhere.
  // The Indic-romanized aliases deliberately include code-mixed English
  // words like "cab" or "hotel" to catch Hinglish ("mujhe ek cab book karo"),
  // so without this guard a sentence like "Book me a cab" gets mis-flagged
  // as Hindi-romanized just because the Hindi alias matched.
  const isAscii = !/[^\x00-\x7F]/.test(originalText);
  const englishish = isAscii && scoredLanguageId === null;

  // When multiple languages match the same intent (common across the
  // Devanagari family — Hindi / Marathi / Bhojpuri share script), prefer the
  // language with the highest language-marker score. If the text is plain
  // English, drop the Indic-romanized matches entirely so we don't claim a
  // language we didn't actually detect.
  let matchedAliases;
  if (englishish) {
    matchedAliases = [];
  } else if (scoredLanguageId) {
    matchedAliases = [
      ...rawMatches.filter((m) => m.languageId === scoredLanguageId),
      ...rawMatches.filter((m) => m.languageId !== scoredLanguageId)
    ];
  } else {
    matchedAliases = rawMatches;
  }

  const detectedLocale = detectLocale(originalText, locale, matchedAliases, scoredLanguageId);
  const detectedLanguageId =
    matchedAliases[0]?.languageId ??
    scoredLanguageId ??
    (detectedLocale && detectedLocale !== 'en-IN' ? detectedLocale.split('-')[0] : null);

  const hintText = matchedAliases.flatMap((alias) => alias.hints).join(' ');
  const normalizedText = [originalText, hintText].filter(Boolean).join(' ').trim();

  return {
    originalText,
    normalizedText,
    requestedLocale: locale,
    detectedLocale,
    detectedLanguageId,
    matchedAliases,
    confidence: matchedAliases.length > 0 ? Math.min(0.95, 0.65 + matchedAliases.length * 0.1) : 0.5
  };
}

export function inferActionTypeFromNormalized(normalized) {
  if (normalized.matchedAliases.length > 0) {
    return normalized.matchedAliases[0].actionType;
  }
  for (const candidate of INTENT_PATTERNS) {
    if (candidate.pattern.test(normalized.normalizedText)) {
      return candidate.actionType;
    }
  }
  return 'mesh_storage';
}

export function inferActionType(intentText = '', options = {}) {
  return inferActionTypeFromNormalized(normalizeIntent(intentText, options));
}

export function listSupportedLanguages() {
  return VERNACULAR_LANGUAGES.map((lang) => ({
    languageId: lang.languageId,
    label: lang.label,
    locale: lang.locale,
    romanizedLocale: lang.romanizedLocale,
    script: lang.script
  }));
}

// Look up a localized status string for a given action type and lifecycle
// status. Falls back gracefully: requested locale → romanized variant for the
// same language → English. Never throws on unknown action types — returns null.
export function localizeResponse(actionType, status, locale = 'en-IN') {
  const bucket = VERNACULAR_RESPONSES[actionType];
  if (!bucket) return null;
  const phrases = bucket[status];
  if (!phrases) return null;

  if (phrases[locale]) {
    return { text: phrases[locale], locale, fallbackUsed: false };
  }

  // Try the romanized variant for the same language family.
  const lang = VERNACULAR_LANGUAGES.find(
    (l) => l.locale === locale || l.romanizedLocale === locale
  );
  if (lang) {
    if (phrases[lang.locale]) {
      return { text: phrases[lang.locale], locale: lang.locale, fallbackUsed: true };
    }
    if (phrases[lang.romanizedLocale]) {
      return {
        text: phrases[lang.romanizedLocale],
        locale: lang.romanizedLocale,
        fallbackUsed: true
      };
    }
  }

  return { text: phrases['en-IN'], locale: 'en-IN', fallbackUsed: true };
}
