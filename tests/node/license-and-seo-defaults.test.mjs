// Phase 13.6.1 — LICENSE + SEO defaults regression pin.
//
// Assert that:
// - The repo root has a LICENSE file pinned to Apache 2.0.
// - The repo root has a NOTICE file pointing at the LICENSE.
// - The frontend index.html carries the SEO default tags
//   (title, description, og:title, og:description, twitter:card,
//    theme-color).
//
// Tests run cheaply against the on-disk source files. They guard
// the open-source claim made on the marketing pages and the
// shareable defaults relied on by useDocumentMeta on a per-route
// basis.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

describe('phase 13.6.1 / LICENSE', () => {
  it('exists at repo root', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'LICENSE'), 'utf8');
    assert.ok(text.length > 0, 'LICENSE is empty');
  });

  it('is Apache License Version 2.0', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'LICENSE'), 'utf8');
    assert.match(text, /Apache License/);
    assert.match(text, /Version 2\.0/);
    assert.match(
      text,
      /www\.apache\.org\/licenses\/LICENSE-2\.0/,
      'LICENSE must point at the canonical Apache 2.0 URL'
    );
  });

  it('carries an Apache 2.0 appendix copyright stanza', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'LICENSE'), 'utf8');
    assert.match(text, /Copyright \d{4} Bharat OS contributors/);
  });
});

describe('phase 13.6.1 / NOTICE', () => {
  it('exists at repo root', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'NOTICE'), 'utf8');
    assert.ok(text.length > 0, 'NOTICE is empty');
  });

  it('credits wllama + pdfjs-dist as the on-device runtime substrate', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'NOTICE'), 'utf8');
    assert.match(text, /wllama/);
    assert.match(text, /pdfjs-dist/);
  });

  it('points at the LICENSE file for the substrate itself', () => {
    const text = readFileSync(resolve(REPO_ROOT, 'NOTICE'), 'utf8');
    assert.match(text, /LICENSE file/);
    assert.match(text, /Apache License,\s+Version 2\.0/);
  });
});

describe('phase 13.6.1 / SEO defaults in index.html', () => {
  const html = readFileSync(resolve(REPO_ROOT, 'frontend', 'index.html'), 'utf8');

  it('declares lang="en"', () => {
    assert.match(html, /<html lang="en"/);
  });

  it('carries a non-empty title', () => {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(titleMatch, 'missing <title>');
    assert.ok(
      titleMatch[1].length > 10,
      'title must be substantive (>10 chars)'
    );
    assert.match(titleMatch[1], /Bharat OS/);
  });

  it('carries a description meta tag', () => {
    assert.match(html, /<meta\s+name="description"[\s\S]+?content="[^"]+"/);
  });

  it('carries og:type, og:title, og:description', () => {
    assert.match(html, /<meta\s+property="og:type"\s+content="website"/);
    assert.match(html, /<meta\s+property="og:title"[\s\S]+?content="[^"]+"/);
    assert.match(html, /<meta\s+property="og:description"[\s\S]+?content="[^"]+"/);
  });

  it('carries twitter:card + twitter:title + twitter:description', () => {
    assert.match(html, /<meta\s+name="twitter:card"\s+content="summary"/);
    assert.match(html, /<meta\s+name="twitter:title"[\s\S]+?content="[^"]+"/);
    assert.match(html, /<meta\s+name="twitter:description"[\s\S]+?content="[^"]+"/);
  });

  it('mentions Apache 2.0 in description (open-source claim)', () => {
    assert.match(html, /Apache 2\.0/);
  });

  it('carries theme-color set to the primary saffron (#FF9933)', () => {
    assert.match(html, /name="theme-color"\s+content="#FF9933"/);
  });
});
