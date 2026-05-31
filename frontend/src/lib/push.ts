// Phase 12.0.4 — Web Push subscription helpers.
//
// The VAPID public key from /api/push-public-key arrives as a
// URL-safe Base64 string (Phase 7.0 convention). The browser's
// PushManager.subscribe expects a Uint8Array of the raw public key
// bytes. Helper below converts.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // SW lives at /app/sw.js (Vite copies frontend/public/sw.js to
    // the build root which the BE serves as /app/sw.js). Scope
    // defaults to /app/ — fine for our needs.
    const reg = await navigator.serviceWorker.register('/app/sw.js');
    return reg;
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

export interface SubscribeArgs {
  vapidPublicKey: string;
}

export interface SubscribeResult {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribeToPush({
  vapidPublicKey
}: SubscribeArgs): Promise<SubscribeResult | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return null;
  const reg = await registerAppServiceWorker();
  if (!reg) return null;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  // Cast Uint8Array → BufferSource shape the PushManager expects.
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as unknown as BufferSource
  });
  const subJson = sub.toJSON();
  return {
    endpoint: subJson.endpoint ?? sub.endpoint,
    keys: {
      p256dh: subJson.keys?.p256dh ?? arrayBufferToBase64Url(sub.getKey('p256dh')),
      auth: subJson.keys?.auth ?? arrayBufferToBase64Url(sub.getKey('auth'))
    }
  };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration('/app/sw.js');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  await sub.unsubscribe();
  return true;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/app/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}
