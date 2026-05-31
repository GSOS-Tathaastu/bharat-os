import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Phase 11.0 — Vite serves /app/ in dev, builds static bundle into
// public/app/build/ so the existing Phase 0 API can serve it without
// any new build pipeline glue. Backend zero-npm-dep posture preserved.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  resolve: {
    alias: {
      '@': path.resolve(here, 'src')
    }
  },
  build: {
    outDir: path.resolve(here, '../public/app/build'),
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/shell': 'http://127.0.0.1:8787',
      '/console': 'http://127.0.0.1:8787',
      '/verify': 'http://127.0.0.1:8787'
    }
  }
});
