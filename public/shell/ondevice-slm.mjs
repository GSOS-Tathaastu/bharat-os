// Bharat OS — on-device SLM intent classifier (Phase 2a.12).
//
// Loads transformers.js + the paraphrase-multilingual-MiniLM-L12-v2
// embedding model (~120 MB, WASM + ONNX) from a CDN, computes embeddings
// for the six canonical action templates once at warm-up, then classifies
// each user intent by cosine similarity against the action embeddings.
//
// Why an embedding model and not a generative LLM:
//   - 120 MB vs 1.5–4 GB. Fits Tier 3 of the §17 footprint table.
//   - Real multilingual coverage (handles Hindi, Marathi, Bhojpuri,
//     Tamil, Bengali, English) — aligns with §1 / §7a.
//   - Deterministic enough to demo (cosine similarity, not sampling),
//     while still being genuine ML.
//   - Pairs cleanly with the §7e adaptive router: this is the "local
//     SLM" tier; cloud frontier model stays the escape hatch.
//
// The §17 status board lists this as Phase 2a queue #7. The model lives
// entirely client-side; the server never sees the model bytes.

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// One short, code-mixed description per canonical action — the embedding
// space anchors. Includes Indic-script + romanized phrases so the
// multilingual model has clean signal in every supported language.
const ACTION_TEMPLATES = {
  service_booking:
    'book a cab, taxi, ride, hotel, room, train ticket, flight, food, grocery; मुझे कैब बुक करो; एनक्कु டாக்ஸி வேண்டும்; আমার ট্যাক্সি দরকার; service booking',
  labor_match_post:
    'hire workers, find labor for brick kiln, post a job, daily wages, mazdoor chahiye, kamgar, मजदूर चाहिए, रोजगार, தொழிலாளர், শ্রমিক, dihadi',
  scheme_delivery:
    'government scheme, subsidy, PM Mudra, Mudra loan eligibility, ration, DBT, सरकारी योजना, scheme ka labh chahiye, யோஜனா, প্রকল্প, eligibility',
  regulated_onboarding:
    'open a bank current account, KYC, apply for a loan, NBFC, financial onboarding, बैंक खाता खोलना, business loan, bank account',
  health_record_read:
    'show my health record, ABHA, diabetes follow-up, medical, hospital, doctor visit, स्वास्थ्य रिकॉर्ड, मेरी सेहत, ABHA records, prescription',
  mesh_storage:
    'store this file on the mesh, backup, archive, save securely, सुरक्षित रखो, store on bharat mesh'
};

const state = {
  classifierPromise: null,
  classifier: null,
  actionEmbeddings: null,
  ready: false,
  loading: false,
  lastError: null
};

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function isReady() {
  return state.ready;
}

export function isLoading() {
  return state.loading;
}

export function lastError() {
  return state.lastError;
}

// onProgress receives { status, name, file, progress, total, loaded }
// from transformers.js — useful for rendering a download bar.
export async function ensureClassifier(onProgress) {
  if (state.classifier) return state.classifier;
  if (state.classifierPromise) return state.classifierPromise;
  state.loading = true;
  state.lastError = null;

  state.classifierPromise = (async () => {
    try {
      const transformers = await import(/* @vite-ignore */ `${TRANSFORMERS_CDN}/dist/transformers.min.js`);
      const { pipeline, env } = transformers;
      env.useBrowserCache = true;
      env.allowLocalModels = false;
      env.remoteHost = 'https://huggingface.co/';
      env.remotePathTemplate = '{model}/resolve/{revision}/';

      const classifier = await pipeline('feature-extraction', MODEL_ID, {
        progress_callback: onProgress,
        quantized: true
      });
      state.classifier = classifier;
      return classifier;
    } catch (error) {
      state.lastError = error;
      state.classifierPromise = null;
      state.loading = false;
      throw error;
    }
  })();

  return state.classifierPromise;
}

async function ensureActionEmbeddings(classifier) {
  if (state.actionEmbeddings) return state.actionEmbeddings;
  const entries = await Promise.all(
    Object.entries(ACTION_TEMPLATES).map(async ([action, text]) => {
      const output = await classifier(text, { pooling: 'mean', normalize: true });
      return [action, Array.from(output.data)];
    })
  );
  state.actionEmbeddings = Object.fromEntries(entries);
  return state.actionEmbeddings;
}

// Initialize the model + warm-up embeddings. Resolves once everything is
// ready to classify intents. Throws on failure (e.g., CDN unreachable,
// quota exceeded). Caller should fall back to deterministic regex on error.
export async function warmUp(onProgress) {
  const classifier = await ensureClassifier(onProgress);
  await ensureActionEmbeddings(classifier);
  state.ready = true;
  state.loading = false;
  return {
    modelId: MODEL_ID,
    runtime: 'transformers.js (WASM/WebGPU)',
    actionCount: Object.keys(ACTION_TEMPLATES).length
  };
}

// Classify a user intent. Returns the top action + all-action scores +
// model metadata. Caller decides whether the top score is high enough to
// trust (we surface the raw similarity so the demo can show confidence).
export async function classifyIntent(intentText) {
  if (!state.ready) {
    throw new Error('on-device SLM is not ready — call warmUp() first.');
  }
  const output = await state.classifier(intentText, { pooling: 'mean', normalize: true });
  const intentEmbedding = Array.from(output.data);
  const scores = Object.entries(state.actionEmbeddings)
    .map(([action, embedding]) => ({
      action,
      similarity: cosineSimilarity(intentEmbedding, embedding)
    }))
    .sort((left, right) => right.similarity - left.similarity);

  return {
    top: scores[0],
    scores,
    modelId: MODEL_ID,
    runtime: 'transformers.js'
  };
}

export const SLM_CONFIG = {
  modelId: MODEL_ID,
  approxBytes: 120 * 1024 * 1024,
  templates: ACTION_TEMPLATES,
  cdn: TRANSFORMERS_CDN
};
