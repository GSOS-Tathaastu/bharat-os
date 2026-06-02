// Phase 13.0.1 — On-device PDF text-layer extractor.
//
// Pure-FE wrapper around pdfjs-dist that reads a PDF File, extracts
// the text layer page-by-page, and returns a typed envelope the
// SLM-E doc summariser can consume. Image-only / scanned PDFs
// (no text layer) surface as a typed `no_text_layer` error so the
// citizen sees an honest "this PDF has no text — paste it instead"
// hint, NOT a silent empty paste.
//
// §15 bindings:
//   • Pure-FE. The PDF blob never leaves the browser. The pdfjs
//     worker is loaded from the local Vite bundle (no CDN
//     fetch). Zero network IO in the extract path.
//   • Honest empty state. Encrypted PDFs, image-only scans, and
//     corrupt PDFs all return typed errors the panel can render
//     specifically.
//   • Size cap. Refuses files larger than `MAX_PDF_BYTES` and
//     limits extracted text to `MAX_EXTRACT_CHARS` to keep the
//     downstream SLM summariser's char-cap meaningful.
//   • Protocol version pinned. Bumping requires a new ADR.
//
// What this module is NOT:
//   • An OCR pipeline. Scanned-image PDFs need Tesseract.js or a
//     multimodal SLM — deferred to a future Phase 13.x.
//   • A renderer. We only need page.getTextContent(); never call
//     page.render() so the canvas / worker thread stays light.
//
// Shared CORE substrate per the common-features-as-core-substrates
// memory binding: future SLM-F / SLM-H / Phase 12.x consumers
// (kirana receipt scans, scheme PDF intake, ABHA reports) compose
// the same exports.

import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

export const PDF_EXTRACT_PROTOCOL_VERSION = 'bos.phase13.pdf-text-extract.v1' as const;

/** Hard upload cap. PDFs above this size are rejected at boundary. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Hard cap on extracted text.
 *  Phase 13.0.1 adversarial fix SF-4 — aligned to the SLM-E
 *  `DOC_INPUT_CHAR_CAP` so the chars the citizen sees in the
 *  truncation notice match the chars the SLM actually receives.
 *  Earlier 12000-char cap was double-clamped silently by the
 *  summariser to 6000, lying to the citizen via the panel notice. */
export const MAX_EXTRACT_CHARS = 6_000;

/** Hard page cap. A 200-page tome would otherwise spin pdfjs for
 *  20+ seconds; cap so the citizen sees an honest truncation. */
export const MAX_EXTRACT_PAGES = 32;

export type PdfExtractErrorCode =
  | 'unsupported_mime'
  | 'too_large'
  | 'encrypted'
  | 'corrupt'
  | 'no_text_layer';

export class PdfExtractError extends Error {
  readonly code: PdfExtractErrorCode;
  constructor(code: PdfExtractErrorCode, message: string) {
    super(message);
    this.name = 'PdfExtractError';
    this.code = code;
  }
}

/** Phase 13.0.1 SF-5 — specific reason for any truncation so the
 *  panel renders a non-contradictory citizen-facing message. */
export type TruncatedReason = 'pages' | 'chars' | 'both' | null;

export interface PdfExtractResult {
  protocolVersion: typeof PDF_EXTRACT_PROTOCOL_VERSION;
  /** Extracted text concatenated across pages, separated by `\n\n`. */
  text: string;
  /** Total pages in the PDF (may be more than the number we read
   *  if truncated to MAX_EXTRACT_PAGES). */
  pageCount: number;
  /** Pages we successfully read at least some text from.
   *  Phase 13.0.1 SF-2 — was previously `Math.min(pageCount,
   *  maxPages)`; that lied when individual pages errored mid-loop. */
  pagesExtracted: number;
  /** Raw extracted chars BEFORE the MAX_EXTRACT_CHARS clamp. */
  charsExtracted: number;
  /** True when the extract was clamped on chars OR pages. */
  truncated: boolean;
  /** Phase 13.0.1 SF-5 — precise truncation reason. */
  truncatedReason: TruncatedReason;
}

interface ExtractOptions {
  /** Override the default char cap (mostly for tests). */
  maxChars?: number;
  /** Override the default page cap (mostly for tests). */
  maxPages?: number;
  /** Test-injection seam — see vi.mock in the test file. */
  getDocument?: typeof pdfjs.getDocument;
}

let workerConfigured = false;
function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

// ─── Pure helpers (unit-tested in isolation) ───────────────────

/** Join a single page's text items into a string. Inserts a space
 *  between items that pdfjs has marked with `hasEOL` so adjacent
 *  table cells don't fuse. */
export function joinPageText(items: ReadonlyArray<{ str?: string; hasEOL?: boolean }>): string {
  let out = '';
  for (const item of items) {
    const s = item?.str ?? '';
    out += s;
    if (item?.hasEOL) {
      out += '\n';
    } else if (s && !s.endsWith(' ') && !s.endsWith('\n')) {
      out += ' ';
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

/** Classify a raw pdfjs error into a typed `PdfExtractErrorCode`.
 *  Exported so the panel can also use it on errors thrown outside
 *  this module (e.g. file picker rejections). */
export function classifyPdfError(err: unknown): PdfExtractErrorCode {
  if (err instanceof PdfExtractError) return err.code;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('password') || lower.includes('encrypted')) return 'encrypted';
  if (lower.includes('invalid pdf') || lower.includes('missing pdf') || lower.includes('startxref')) {
    return 'corrupt';
  }
  return 'corrupt';
}

/** Truncate concatenated extracted text to `cap` chars at the
 *  nearest preceding whitespace so the SLM doesn't see a
 *  half-word at the boundary. Returns the original string when
 *  already within cap. */
export function truncateExtracted(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const sliced = text.slice(0, cap);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > cap * 0.5) return sliced.slice(0, lastSpace);
  return sliced;
}

// ─── Main extractor ────────────────────────────────────────────

/**
 * Read a PDF File, extract its text layer, and return a typed
 * envelope. Throws `PdfExtractError` on any classifiable failure.
 *
 * The pdfjs worker is loaded lazily from the local Vite bundle on
 * first call. Subsequent calls reuse the cached worker URL.
 *
 * Test-injection seam: pass `opts.getDocument` to substitute a
 * mock; vitest does this to avoid running the real pdfjs worker
 * in jsdom (no Worker constructor) and to control the page count.
 */
export async function extractPdfText(
  file: File,
  opts: ExtractOptions = {}
): Promise<PdfExtractResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new PdfExtractError(
      'unsupported_mime',
      `Unsupported MIME type: ${file.type || '(unknown)'}.`
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfExtractError(
      'too_large',
      `PDF is too large (${Math.round(file.size / (1024 * 1024))} MB; limit ${MAX_PDF_BYTES / (1024 * 1024)} MB).`
    );
  }

  ensureWorker();
  const maxChars = opts.maxChars ?? MAX_EXTRACT_CHARS;
  const maxPages = opts.maxPages ?? MAX_EXTRACT_PAGES;
  const buffer = await file.arrayBuffer();
  const getDocument = opts.getDocument ?? pdfjs.getDocument;
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new PdfExtractError(classifyPdfError(err), (err as Error).message ?? 'Could not open PDF.');
  }

  const pageCount = pdf.numPages;
  const pagesToRead = Math.min(pageCount, maxPages);
  const pageTexts: string[] = [];
  let charsExtracted = 0;
  let truncatedOnChars = false;
  // Phase 13.0.1 SF-2 — track success vs failure pages so we can
  // (a) report accurate `pagesExtracted` and (b) distinguish a
  // genuinely image-only PDF from a textual PDF whose pages all
  // errored (worker crash / OOM / detached buffer).
  let pagesWithText = 0;
  let pagesFailed = 0;
  let pagesReadAttempted = 0;

  for (let i = 1; i <= pagesToRead; i += 1) {
    pagesReadAttempted += 1;
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = joinPageText(content.items as Array<{ str?: string; hasEOL?: boolean }>);
      if (pageText.length > 0) pagesWithText += 1;
      charsExtracted += pageText.length;
      pageTexts.push(pageText);
      if (charsExtracted >= maxChars) {
        truncatedOnChars = true;
        break;
      }
    } catch (err) {
      pagesFailed += 1;
      pageTexts.push('');
      // Catastrophic password failure stops the loop — the citizen
      // can't recover by reading more pages.
      if ((err as Error).message?.toLowerCase().includes('password')) {
        throw new PdfExtractError('encrypted', 'PDF requires a password to read.');
      }
    }
  }

  // Phase 13.0.1 SF-2 — if every page we tried failed, this is a
  // corrupt PDF (or worker crash), NOT an image-only scan. Throw
  // `corrupt` rather than the misleading `no_text_layer`.
  if (pagesReadAttempted > 0 && pagesFailed === pagesReadAttempted) {
    throw new PdfExtractError(
      'corrupt',
      'Could not read any pages from this PDF.'
    );
  }

  const joinedRaw = pageTexts.filter(Boolean).join('\n\n').trim();
  if (joinedRaw.length === 0) {
    throw new PdfExtractError(
      'no_text_layer',
      'This PDF has no readable text layer — likely a scanned image. Paste the text instead.'
    );
  }

  const finalText = truncateExtracted(joinedRaw, maxChars);
  const pagesTruncated = pageCount > pagesToRead;
  const truncated = truncatedOnChars || pagesTruncated;
  let truncatedReason: TruncatedReason = null;
  if (truncatedOnChars && pagesTruncated) truncatedReason = 'both';
  else if (truncatedOnChars) truncatedReason = 'chars';
  else if (pagesTruncated) truncatedReason = 'pages';

  return {
    protocolVersion: PDF_EXTRACT_PROTOCOL_VERSION,
    text: finalText,
    pageCount,
    pagesExtracted: pagesWithText,
    charsExtracted: joinedRaw.length,
    truncated,
    truncatedReason
  };
}
