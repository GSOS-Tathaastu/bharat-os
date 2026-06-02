// Phase 13.6.1 — useDocumentMeta tests.
//
// Verify the hook sets document.title + the managed meta tags on
// mount and restores them on unmount. Static defaults in index.html
// (not present in the jsdom test env) — we seed the head manually
// in beforeEach.

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentMeta } from './use-document-meta';

function seedHead() {
  document.head.innerHTML = `
    <title>Original title</title>
    <meta name="description" content="Original description" />
    <meta property="og:title" content="Original og:title" />
    <meta property="og:description" content="Original og:description" />
    <meta property="og:type" content="website" />
    <meta name="twitter:title" content="Original twitter:title" />
    <meta name="twitter:description" content="Original twitter:description" />
  `;
  document.title = 'Original title';
}

function metaContent(selector: string): string | null {
  const el = document.querySelector(selector);
  return el?.getAttribute('content') ?? null;
}

describe('useDocumentMeta', () => {
  beforeEach(() => {
    seedHead();
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('sets title + description + og + twitter on mount', () => {
    const { unmount } = renderHook(() =>
      useDocumentMeta({
        title: 'About · Bharat OS',
        description: 'India-first AI-native OS substrate'
      })
    );
    expect(document.title).toBe('About · Bharat OS');
    expect(metaContent('meta[name="description"]')).toBe(
      'India-first AI-native OS substrate'
    );
    expect(metaContent('meta[property="og:title"]')).toBe('About · Bharat OS');
    expect(metaContent('meta[property="og:description"]')).toBe(
      'India-first AI-native OS substrate'
    );
    expect(metaContent('meta[name="twitter:title"]')).toBe('About · Bharat OS');
    expect(metaContent('meta[name="twitter:description"]')).toBe(
      'India-first AI-native OS substrate'
    );
    unmount();
  });

  it('uses ogTitle / ogDescription overrides when provided', () => {
    renderHook(() =>
      useDocumentMeta({
        title: 'For sponsors · Bharat OS',
        description: 'Per-page description',
        ogTitle: 'Custom og title',
        ogDescription: 'Custom og description'
      })
    );
    expect(metaContent('meta[property="og:title"]')).toBe('Custom og title');
    expect(metaContent('meta[property="og:description"]')).toBe(
      'Custom og description'
    );
  });

  it('restores previous title + meta on unmount', () => {
    const { unmount } = renderHook(() =>
      useDocumentMeta({
        title: 'Temp title',
        description: 'Temp description'
      })
    );
    expect(document.title).toBe('Temp title');
    unmount();
    expect(document.title).toBe('Original title');
    expect(metaContent('meta[name="description"]')).toBe(
      'Original description'
    );
    expect(metaContent('meta[property="og:title"]')).toBe('Original og:title');
    expect(metaContent('meta[property="og:description"]')).toBe(
      'Original og:description'
    );
    expect(metaContent('meta[name="twitter:title"]')).toBe(
      'Original twitter:title'
    );
    expect(metaContent('meta[name="twitter:description"]')).toBe(
      'Original twitter:description'
    );
  });

  it('does not crash if a meta tag is missing in the head', () => {
    document.head.innerHTML = '<title>Bare</title>';
    document.title = 'Bare';
    const { unmount } = renderHook(() =>
      useDocumentMeta({
        title: 'Replacement',
        description: 'No meta tags exist; should not crash'
      })
    );
    expect(document.title).toBe('Replacement');
    expect(() => unmount()).not.toThrow();
    expect(document.title).toBe('Bare');
  });
});
