import { describe, expect, it, vi } from 'vitest';

// Phase 13.0.1 — pdfjs-dist 6.x main entry imports browser-only
// APIs (DOMMatrix) that jsdom does not provide. We don't actually
// USE pdfjs in these tests — every extractPdfText call passes
// `opts.getDocument` as a test-injection seam — so it's safe to
// stub the module entirely at the import boundary.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0, getPage: () => null }) })
}));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: '/mock-worker.mjs' }));

import {
  PDF_EXTRACT_PROTOCOL_VERSION,
  MAX_PDF_BYTES,
  MAX_EXTRACT_CHARS,
  MAX_EXTRACT_PAGES,
  PdfExtractError,
  joinPageText,
  classifyPdfError,
  truncateExtracted,
  extractPdfText
} from './pdf-text-extract';

describe('PDF_EXTRACT_PROTOCOL_VERSION', () => {
  it('is pinned to bos.phase13.pdf-text-extract.v1', () => {
    expect(PDF_EXTRACT_PROTOCOL_VERSION).toBe('bos.phase13.pdf-text-extract.v1');
  });

  it('exposes sensible caps', () => {
    expect(MAX_PDF_BYTES).toBe(10 * 1024 * 1024);
    // Phase 13.0.1 SF-4 — aligned to SLM-E DOC_INPUT_CHAR_CAP so
    // panel notice and SLM input are consistent.
    expect(MAX_EXTRACT_CHARS).toBe(6000);
    expect(MAX_EXTRACT_PAGES).toBe(32);
  });
});

describe('joinPageText', () => {
  it('returns empty string on empty input', () => {
    expect(joinPageText([])).toBe('');
  });

  it('joins simple items with single spaces', () => {
    expect(joinPageText([{ str: 'hello' }, { str: 'world' }])).toBe('hello world');
  });

  it('honours hasEOL with a newline', () => {
    expect(joinPageText([{ str: 'first' }, { str: 'line', hasEOL: true }, { str: 'next' }])).toBe(
      'first line\nnext'
    );
  });

  it('skips undefined str safely', () => {
    expect(joinPageText([{ str: 'a' }, { str: undefined }, { str: 'b' }])).toBe('a b');
  });

  it('strips trailing whitespace before newlines', () => {
    expect(joinPageText([{ str: 'word  ', hasEOL: true }, { str: 'next' }])).toBe('word\nnext');
  });
});

describe('classifyPdfError', () => {
  it('returns the .code field on a PdfExtractError', () => {
    expect(
      classifyPdfError(new PdfExtractError('no_text_layer', 'oops'))
    ).toBe('no_text_layer');
  });

  it('maps password / encrypted strings to encrypted', () => {
    expect(classifyPdfError(new Error('Password required'))).toBe('encrypted');
    expect(classifyPdfError(new Error('PDF is encrypted'))).toBe('encrypted');
  });

  it('maps invalid pdf / missing pdf / startxref to corrupt', () => {
    expect(classifyPdfError(new Error('Invalid PDF structure'))).toBe('corrupt');
    expect(classifyPdfError(new Error('Missing PDF'))).toBe('corrupt');
    expect(classifyPdfError(new Error('startxref not found'))).toBe('corrupt');
  });

  it('defaults to corrupt for unknown errors', () => {
    expect(classifyPdfError(new Error('something unexpected'))).toBe('corrupt');
    expect(classifyPdfError('a string error')).toBe('corrupt');
    expect(classifyPdfError(null)).toBe('corrupt');
  });
});

describe('truncateExtracted', () => {
  it('returns the input unchanged when within cap', () => {
    expect(truncateExtracted('short text', 100)).toBe('short text');
  });

  it('truncates at the nearest preceding whitespace when past cap', () => {
    const text = 'one two three four five six seven eight nine ten';
    const out = truncateExtracted(text, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith(' ')).toBe(false);
    // Last char is alphanumeric (a complete word, not a fragment).
    expect(/[a-z]$/i.test(out)).toBe(true);
  });

  it('falls back to hard-slice when no whitespace in the first half of cap', () => {
    const text = 'aaaaaaaaaaaaaaaaaaaaaaaaaa bb';
    const out = truncateExtracted(text, 10);
    expect(out).toBe(text.slice(0, 10));
  });
});

// ─── extractPdfText — mocked pdfjs ─────────────────────────────

// jsdom's File does not implement arrayBuffer(). Build a minimal
// file-like with the props extractPdfText actually reads (type,
// size, arrayBuffer) and cast for the test seam.
function makePdfFile(bytes: Uint8Array, type = 'application/pdf'): File {
  const buf = bytes.buffer.slice(0) as ArrayBuffer;
  const fileLike = {
    name: 'test.pdf',
    type,
    size: bytes.length,
    arrayBuffer: async () => buf
  };
  return fileLike as unknown as File;
}

function mockGetDocument(pages: Array<Array<{ str?: string; hasEOL?: boolean }>>) {
  return ((_args: unknown) => ({
    promise: Promise.resolve({
      numPages: pages.length,
      async getPage(i: number) {
        return {
          async getTextContent() {
            return { items: pages[i - 1] ?? [] };
          }
        };
      }
    })
  })) as unknown as NonNullable<Parameters<typeof extractPdfText>[1]>['getDocument'];
}

describe('extractPdfText — happy path', () => {
  it('extracts text across pages and stamps the protocol version', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF magic header
    const getDocument = mockGetDocument([
      [{ str: 'page' }, { str: 'one' }],
      [{ str: 'page' }, { str: 'two', hasEOL: true }, { str: 'tail' }]
    ]);
    const out = await extractPdfText(file, { getDocument });
    expect(out.protocolVersion).toBe(PDF_EXTRACT_PROTOCOL_VERSION);
    expect(out.text).toMatch(/page one/);
    expect(out.text).toMatch(/page two/);
    expect(out.pageCount).toBe(2);
    expect(out.pagesExtracted).toBe(2);
    expect(out.truncated).toBe(false);
    expect(out.truncatedReason).toBeNull();
  });

  it('truncates on the configured maxChars + flags reason="chars"', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = mockGetDocument([
      [{ str: 'a'.repeat(1000) }],
      [{ str: 'b'.repeat(1000) }],
      [{ str: 'c'.repeat(1000) }]
    ]);
    const out = await extractPdfText(file, { getDocument, maxChars: 1500 });
    expect(out.text.length).toBeLessThanOrEqual(1500);
    expect(out.truncated).toBe(true);
    expect(out.truncatedReason).toBe('chars');
  });

  it('truncates on the configured maxPages + flags reason="pages"', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const pages = Array.from({ length: 50 }, (_, i) => [{ str: `page-${i}` }]);
    const getDocument = mockGetDocument(pages);
    const out = await extractPdfText(file, { getDocument, maxPages: 3 });
    expect(out.pageCount).toBe(50);
    expect(out.pagesExtracted).toBe(3);
    expect(out.truncated).toBe(true);
    expect(out.truncatedReason).toBe('pages');
  });

  it('SF-5 — single-page char-clamp reports reason="chars" (not "both")', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = mockGetDocument([
      [{ str: 'a'.repeat(2000) }]
    ]);
    const out = await extractPdfText(file, { getDocument, maxChars: 500 });
    expect(out.pageCount).toBe(1);
    expect(out.pagesExtracted).toBe(1);
    expect(out.truncatedReason).toBe('chars');
  });

  it('SF-5 — chars-AND-pages truncation reports reason="both"', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const pages = Array.from({ length: 10 }, () => [{ str: 'x'.repeat(500) }]);
    const getDocument = mockGetDocument(pages);
    const out = await extractPdfText(file, { getDocument, maxChars: 1200, maxPages: 5 });
    expect(out.truncated).toBe(true);
    expect(out.truncatedReason).toBe('both');
  });
});

describe('extractPdfText — typed errors', () => {
  it('throws unsupported_mime on non-PDF MIME', async () => {
    const file = makePdfFile(new Uint8Array([1, 2, 3]), 'application/octet-stream');
    await expect(extractPdfText(file, { getDocument: mockGetDocument([]) })).rejects.toMatchObject({
      code: 'unsupported_mime'
    });
  });

  it('throws too_large above MAX_PDF_BYTES', async () => {
    // Don't actually allocate 10 MB — just lie about size.
    const huge = {
      name: 'huge.pdf',
      type: 'application/pdf',
      size: MAX_PDF_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as unknown as File;
    await expect(extractPdfText(huge, { getDocument: mockGetDocument([]) })).rejects.toMatchObject({
      code: 'too_large'
    });
  });

  it('classifies an encrypted PDF error', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = (() => ({
      promise: Promise.reject(new Error('Password required to open this PDF'))
    })) as unknown as NonNullable<Parameters<typeof extractPdfText>[1]>['getDocument'];
    await expect(extractPdfText(file, { getDocument })).rejects.toMatchObject({
      code: 'encrypted'
    });
  });

  it('throws no_text_layer on a PDF whose pages contribute zero chars', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = mockGetDocument([[], []]);
    await expect(extractPdfText(file, { getDocument })).rejects.toMatchObject({
      code: 'no_text_layer'
    });
  });

  it('SF-2 — partial per-page failures: pagesExtracted reflects only successful pages', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    // Build a getDocument where pages 1 and 3 succeed, page 2 throws.
    const getDocument = (() => ({
      promise: Promise.resolve({
        numPages: 3,
        async getPage(i: number) {
          if (i === 2) throw new Error('worker hiccup');
          return {
            async getTextContent() {
              return { items: [{ str: `page-${i}` }] };
            }
          };
        }
      })
    })) as unknown as NonNullable<Parameters<typeof extractPdfText>[1]>['getDocument'];
    const out = await extractPdfText(file, { getDocument });
    expect(out.pageCount).toBe(3);
    expect(out.pagesExtracted).toBe(2); // pages 1 + 3 only
    expect(out.text).toMatch(/page-1/);
    expect(out.text).toMatch(/page-3/);
  });

  it('SF-2 — ALL pages fail → throws corrupt (not no_text_layer)', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = (() => ({
      promise: Promise.resolve({
        numPages: 3,
        async getPage(_i: number) {
          throw new Error('worker crashed');
        }
      })
    })) as unknown as NonNullable<Parameters<typeof extractPdfText>[1]>['getDocument'];
    await expect(extractPdfText(file, { getDocument })).rejects.toMatchObject({
      code: 'corrupt'
    });
  });

  it('classifies a corrupt PDF error', async () => {
    const file = makePdfFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const getDocument = (() => ({
      promise: Promise.reject(new Error('Invalid PDF: missing startxref'))
    })) as unknown as NonNullable<Parameters<typeof extractPdfText>[1]>['getDocument'];
    await expect(extractPdfText(file, { getDocument })).rejects.toMatchObject({
      code: 'corrupt'
    });
  });
});
