// Bharat OS shell — service-worker registration.
// Split out from index.html so the page can ship under a strict
// Content-Security-Policy without 'unsafe-inline' script-src.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/shell/service-worker.js', { scope: '/shell/' })
      .catch((error) => console.warn('shell SW registration failed', error));
  });
}
