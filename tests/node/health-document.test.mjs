import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import {
  createHealthDocumentCapture,
  extractStructuredHealthDocument
} from '../../src/phase1/health-document.mjs';
import { executeToolAction } from '../../src/phase1/tools.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

const OCR_TEXT = `
Patient: Lakshmi Amma
Diagnosis: diabetes follow-up
HbA1c 6.8 %
BP 128/82
Tab Metformin 500mg
Follow-up 2026-06-15
`;

test('health document OCR text is converted into structured observations without retaining raw OCR', () => {
  const structured = extractStructuredHealthDocument(OCR_TEXT);
  assert.ok(structured.conditionHints.includes('diabetes'));
  assert.ok(structured.vitals.some((vital) => vital.type === 'hba1c' && vital.value === 6.8));
  assert.ok(structured.vitals.some((vital) => vital.type === 'blood_pressure' && vital.systolic === 128));
  assert.ok(structured.medications.some((med) => med.name === 'Metformin' && med.dose === '500mg'));
  assert.equal(structured.followUp, '2026-06-15');
  assert.equal(structured.rawOcrTextStored, false);
  assert.match(structured.sourceTextHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(structured).includes('Lakshmi Amma'), false);
});

test('health document capture stores image evidence and structured data without raw image payload', () => {
  const identity = createIdentity({ displayName: 'Health document actor' });
  const capture = createHealthDocumentCapture({
    actorId: identity.id,
    ocrText: OCR_TEXT,
    image: {
      mimeType: 'image/jpeg',
      byteLength: 12345,
      sha256: 'a'.repeat(64)
    }
  });

  assert.match(capture.captureId, /^bos:health-doc:/);
  assert.equal(capture.imageEvidence.rawImageStored, false);
  assert.equal(capture.imageEvidence.byteLength, 12345);
  assert.equal(capture.structured.rawOcrTextStored, false);
  assert.equal(JSON.stringify(capture).includes('Lakshmi Amma'), false);
});

test('ABHA upload path returns a mocked structured upload receipt behind consent', () => {
  const identity = createIdentity({ displayName: 'ABHA upload actor' });
  const capture = createHealthDocumentCapture({ actorId: identity.id, ocrText: OCR_TEXT });
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['health.record.write', 'consent.record'],
    purpose: 'Upload captured prescription'
  });

  const execution = executeToolAction(
    {
      actorId: identity.id,
      actionType: 'health_document_upload',
      tool: 'abha',
      scopes: ['health.record.write', 'consent.record'],
      regulated: true,
      piiHandling: 'summary',
      metadata: { healthDocumentCapture: capture }
    },
    [consent]
  );

  assert.equal(execution.status, 'completed');
  assert.equal(execution.toolReceipt.status, 'structured_upload_mocked');
  assert.equal(execution.toolReceipt.captureId, capture.captureId);
  assert.equal(execution.toolReceipt.privacy.rawImageStored, false);
  assert.equal(execution.toolReceipt.privacy.rawOcrTextStored, false);
  assert.equal(execution.toolReceipt.structured.vitals[0].type, 'hba1c');
});

test('store persists health document captures and ledger evidence', async () => {
  const { store } = await freshStore('health-document-store');
  const identity = createIdentity({ displayName: 'Stored health document actor' });
  const capture = createHealthDocumentCapture({ actorId: identity.id, ocrText: OCR_TEXT });
  const persisted = {
    ...capture,
    status: 'uploaded',
    abhaUpload: { uploadId: 'bos:abha-upload:test', status: 'structured_upload_mocked' }
  };

  await store.saveHealthDocumentCapture(persisted);

  assert.equal((await store.readHealthDocumentCapture(capture.captureId)).captureId, capture.captureId);
  assert.equal((await store.listHealthDocumentCaptures()).length, 1);
  const events = await store.listLedger({ type: 'health_document_capture.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].captureId, capture.captureId);
  assert.equal(events[0].uploadId, 'bos:abha-upload:test');
});
