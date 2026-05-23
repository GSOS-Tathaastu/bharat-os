import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const WORKER_NOTIFICATION_PROTOCOL_VERSION = 'bos.phase2a.worker-notification.v0';

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function endpointHost(endpoint) {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch (_error) {
    return 'invalid-endpoint';
  }
}

export function createPushSubscriptionRecord({
  identityId,
  endpoint,
  keys = {},
  permission = 'granted',
  source = 'shell',
  userAgent,
  subscribedAt = nowIso()
}) {
  if (!identityId) throw new Error('identityId is required.');
  const hasEndpoint = Boolean(endpoint);
  const core = {
    protocolVersion: WORKER_NOTIFICATION_PROTOCOL_VERSION,
    objectType: 'push-subscription',
    identityId,
    mode: hasEndpoint ? 'web_push' : 'local_notification',
    permission,
    source,
    endpointHash: hasEndpoint ? sha256Hex(endpoint) : null,
    endpointHost: endpointHost(endpoint),
    keysPresent: {
      p256dh: Boolean(keys?.p256dh),
      auth: Boolean(keys?.auth)
    },
    rawEndpointStored: false,
    rawKeysStored: false,
    userAgent: userAgent ? String(userAgent).slice(0, 160) : null,
    subscribedAt
  };

  return {
    subscriptionId: idFrom('bos:push-subscription', core),
    ...core
  };
}

export function createWorkerNotification({
  workerId,
  jobReference,
  title = 'Bharat OS job alert',
  body,
  locale = 'en-IN',
  urgency = 'normal',
  subscription,
  createdAt = nowIso()
}) {
  if (!workerId) throw new Error('workerId is required.');
  if (!jobReference) throw new Error('jobReference is required.');
  if (!body) throw new Error('body is required.');

  const hasSubscription = Boolean(subscription?.subscriptionId);
  const hasWebPushEndpoint = Boolean(subscription?.endpointHash);
  const core = {
    protocolVersion: WORKER_NOTIFICATION_PROTOCOL_VERSION,
    objectType: 'worker-notification',
    workerId,
    jobReference,
    content: {
      title,
      body,
      locale,
      urgency
    },
    subscriptionRef: hasSubscription
      ? {
          subscriptionId: subscription.subscriptionId,
          mode: subscription.mode,
          endpointHash: subscription.endpointHash,
          endpointHost: subscription.endpointHost
        }
      : null,
    delivery: {
      status: hasSubscription
        ? hasWebPushEndpoint
          ? 'queued_web_push'
          : 'queued_local_notification'
        : 'blocked_no_subscription',
      vapidIntegrated: false,
      sent: false,
      reason: hasSubscription ? null : 'worker has not enabled notifications'
    },
    privacy: {
      rawPushEndpointStored: false,
      rawPushKeysStored: false,
      exactLocationIncluded: false
    },
    createdAt
  };

  return {
    notificationId: idFrom('bos:worker-notification', core),
    ...core
  };
}
