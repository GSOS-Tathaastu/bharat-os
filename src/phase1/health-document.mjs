import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const HEALTH_DOCUMENT_PROTOCOL_VERSION = 'bos.phase2a.health-document.v0';

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  return match ? match[1] : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractVitals(text) {
  const vitals = [];
  const hba1c = number(firstMatch(text, /\bHbA1c\b[^0-9]*(\d+(?:\.\d+)?)/i));
  if (hba1c !== null) vitals.push({ type: 'hba1c', value: hba1c, unit: '%' });

  const glucose = number(firstMatch(text, /\b(?:glucose|sugar|fbs|rbs)\b[^0-9]*(\d{2,3})/i));
  if (glucose !== null) vitals.push({ type: 'blood_glucose', value: glucose, unit: 'mg/dL' });

  const bp = /\b(?:bp|blood pressure)\b[^0-9]*(\d{2,3})\s*\/\s*(\d{2,3})/i.exec(text);
  if (bp) {
    vitals.push({
      type: 'blood_pressure',
      systolic: number(bp[1]),
      diastolic: number(bp[2]),
      unit: 'mmHg'
    });
  }

  return vitals;
}

function extractMedications(text) {
  const meds = [];
  const seen = new Set();
  const pattern =
    /\b(?:tab(?:let)?|cap(?:sule)?|syrup|inj(?:ection)?)\.?\s+([A-Za-z][A-Za-z0-9 -]{1,40}?)(?:\s+(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|units?)))?(?=\s*(?:\n|,|;|\.|$))/gi;

  for (const match of text.matchAll(pattern)) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    const dose = match[2]?.trim() ?? null;
    const key = `${name.toLowerCase()}|${dose ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      meds.push({ name, dose });
    }
  }
  return meds;
}

function extractConditions(text) {
  const checks = [
    ['diabetes', /\b(?:diabetes|diabetic|sugar)\b/i],
    ['hypertension', /\b(?:hypertension|high bp|blood pressure)\b/i],
    ['fever', /\bfever\b/i],
    ['asthma', /\basthma\b/i]
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([condition]) => condition);
}

export function extractStructuredHealthDocument(ocrText = '') {
  const normalizedText = normalizeText(ocrText);
  if (!normalizedText) throw new Error('ocrText is required.');

  return {
    conditionHints: extractConditions(normalizedText),
    medications: extractMedications(normalizedText),
    vitals: extractVitals(normalizedText),
    followUp: firstMatch(normalizedText, /\bfollow[- ]?up\b[^0-9]*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i),
    sourceTextHash: sha256Hex(normalizedText),
    sourceTextBytes: Buffer.byteLength(normalizedText, 'utf8'),
    rawOcrTextStored: false
  };
}

export function createHealthDocumentCapture({
  actorId,
  documentType = 'prescription',
  locale = 'en-IN',
  captureMode = 'camera_or_file',
  image = {},
  ocrText,
  capturedAt = nowIso()
}) {
  if (!actorId) throw new Error('actorId is required.');
  const structured = extractStructuredHealthDocument(ocrText);
  const imageEvidence = {
    mimeType: image.mimeType ?? null,
    byteLength: Number(image.byteLength ?? 0),
    sha256: image.sha256 ?? image.hash ?? null,
    rawImageStored: false
  };

  const core = {
    protocolVersion: HEALTH_DOCUMENT_PROTOCOL_VERSION,
    objectType: 'health-document-capture',
    actorId,
    documentType,
    locale,
    captureMode,
    imageEvidence,
    structured,
    capturedAt
  };

  return {
    captureId: idFrom('bos:health-doc', core),
    ...core
  };
}

export function createAbhaStructuredUploadReceipt(capture, { uploadedAt = nowIso() } = {}) {
  if (!capture?.captureId) throw new Error('health document capture is required.');
  const core = {
    protocolVersion: HEALTH_DOCUMENT_PROTOCOL_VERSION,
    objectType: 'abha-structured-upload',
    toolId: 'abha',
    status: 'structured_upload_mocked',
    actorId: capture.actorId,
    captureId: capture.captureId,
    documentType: capture.documentType,
    recordBundleRef: idFrom('abha:bundle', {
      actorId: capture.actorId,
      captureId: capture.captureId,
      sourceTextHash: capture.structured.sourceTextHash
    }),
    structured: capture.structured,
    privacy: {
      rawImageStored: false,
      rawOcrTextStored: false,
      pointerNotPayload: true
    },
    uploadedAt
  };

  return {
    uploadId: idFrom('bos:abha-upload', core),
    ...core
  };
}
