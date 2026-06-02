/// <reference types="vite/client" />

// Phase 13.0.1 — `?url` query suffix is a Vite-specific import
// that resolves to a bundled URL string. Used by pdf-text-extract.ts
// to point pdfjs's GlobalWorkerOptions.workerSrc at the locally-
// bundled worker (no CDN fetch).
declare module '*?url' {
  const src: string;
  export default src;
}
