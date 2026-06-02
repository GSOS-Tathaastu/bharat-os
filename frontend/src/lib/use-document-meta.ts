// Phase 13.6.1 — useDocumentMeta
//
// Tiny per-route head-tag updater. Zero new deps. Sets the document
// title + a handful of meta tags on mount, restores on unmount.
//
// Static defaults live in index.html so crawlers that don't run JS
// still see something sensible. This hook is for the per-route
// title bar + share-card override that improves the UX for users
// who DO load the JS.

import { useEffect } from 'react';

export interface DocumentMeta {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
}

const META_TAGS_MANAGED = [
  { selector: 'meta[name="description"]', attr: 'content' },
  { selector: 'meta[property="og:title"]', attr: 'content' },
  { selector: 'meta[property="og:description"]', attr: 'content' },
  { selector: 'meta[property="og:type"]', attr: 'content' },
  { selector: 'meta[name="twitter:title"]', attr: 'content' },
  { selector: 'meta[name="twitter:description"]', attr: 'content' }
] as const;

function setMeta(selector: string, attr: string, value: string): string | null {
  const el = document.querySelector(selector);
  if (!el) {
    return null;
  }
  const previous = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return previous;
}

export function useDocumentMeta(meta: DocumentMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = meta.title;

    const previousValues: Record<string, string | null> = {};
    const ogTitle = meta.ogTitle ?? meta.title;
    const ogDescription = meta.ogDescription ?? meta.description;
    const ogType = meta.ogType ?? 'website';

    previousValues['meta[name="description"]'] = setMeta(
      'meta[name="description"]',
      'content',
      meta.description
    );
    previousValues['meta[property="og:title"]'] = setMeta(
      'meta[property="og:title"]',
      'content',
      ogTitle
    );
    previousValues['meta[property="og:description"]'] = setMeta(
      'meta[property="og:description"]',
      'content',
      ogDescription
    );
    previousValues['meta[property="og:type"]'] = setMeta(
      'meta[property="og:type"]',
      'content',
      ogType
    );
    previousValues['meta[name="twitter:title"]'] = setMeta(
      'meta[name="twitter:title"]',
      'content',
      ogTitle
    );
    previousValues['meta[name="twitter:description"]'] = setMeta(
      'meta[name="twitter:description"]',
      'content',
      ogDescription
    );

    return () => {
      document.title = previousTitle;
      for (const { selector, attr } of META_TAGS_MANAGED) {
        const previous = previousValues[selector];
        if (previous === null || previous === undefined) {
          continue;
        }
        const el = document.querySelector(selector);
        if (el) {
          el.setAttribute(attr, previous);
        }
      }
    };
  }, [
    meta.title,
    meta.description,
    meta.ogTitle,
    meta.ogDescription,
    meta.ogType
  ]);
}
