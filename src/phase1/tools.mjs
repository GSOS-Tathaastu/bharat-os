import { sha256Hex, stableStringify } from '../phase0/core.mjs';
import { createAbhaStructuredUploadReceipt } from './health-document.mjs';
import { evaluateDecision } from './policy.mjs';

export const TOOL_PROTOCOL_VERSION = 'bos.phase1.tools.v0';

export const TOOL_REGISTRY = [
  {
    toolId: 'uidai_offline_ekyc',
    layer: 'L3',
    mocked: true,
    description: 'Offline eKYC verification mock; returns an attestation token, not Aadhaar payload.'
  },
  {
    toolId: 'digilocker',
    layer: 'L3',
    mocked: true,
    description: 'DigiLocker document metadata mock; returns document references, not raw files.'
  },
  {
    toolId: 'account_aggregator',
    layer: 'L3',
    mocked: true,
    description: 'Account Aggregator financial-summary mock; returns derived signals only.'
  },
  {
    toolId: 'abha',
    layer: 'L3',
    mocked: true,
    description: 'ABHA health-summary mock; returns minimal summary and record references.'
  },
  {
    toolId: 'upi_escrow',
    layer: 'L3',
    mocked: true,
    description: 'UPI escrow mock for consent-bound wage or workflow settlement.'
  },
  {
    toolId: 'mesh.storage',
    layer: 'L2',
    mocked: true,
    description: 'Mesh storage control-plane mock.'
  },
  {
    toolId: 'bharat_marketplace',
    layer: 'L6',
    mocked: true,
    description: 'Bharat OS native L6 service marketplace mock. The OS-owned substrate for cab / hotel / ticket / food / grocery / professional-services booking — provider registry, matching, settlement, policy, and audit all live in Bharat OS. May internally call the ONDC bridge during Phase A density bootstrap; never depends on it. See §9B.'
  },
  {
    toolId: 'ondc_beckn',
    layer: 'L3',
    mocked: true,
    description: 'ONDC / Beckn-protocol bridge mock. Phase A density adapter only — Bharat OS does not depend on ONDC for substrate (§9B). Outbound: discovers ONDC sellers when native supply is thin. Inbound interop happens on Beckn endpoints exposed by Bharat OS itself.'
  }
];

// Service-booking verticals Bharat OS exposes via the native L6 marketplace
// (and via the ONDC bridge during Phase A). Adding a new vertical is additive —
// the policy engine and Trust Passport do not need changes.
export const SERVICE_VERTICALS = ['cab', 'hotel', 'ticket', 'food', 'grocery', 'services'];

function nowIso() {
  return new Date().toISOString();
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function token(prefix, payload) {
  return `${prefix}_${sha256Hex(stableStringify(payload)).slice(0, 16)}`;
}

function safeAmount(money = {}) {
  return {
    amount: Number(money.amount ?? 0),
    currency: money.currency ?? 'INR',
    limit: money.limit
  };
}

export function createUpiDeepLink({
  payeeAddress,
  payeeName,
  amount,
  currency = 'INR',
  transactionRef,
  transactionNote
}) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || currency !== 'INR') {
    return null;
  }

  const params = new URLSearchParams({
    pa: payeeAddress,
    pn: payeeName,
    am: numericAmount.toFixed(2),
    cu: 'INR',
    tr: transactionRef,
    tn: transactionNote
  });

  return `upi://pay?${params.toString()}`;
}

function serviceBookingPayment(request, { bookingRef, providerName, vertical, defaultPayeeAddress }) {
  const money = safeAmount(request.money);
  const payeeAddress = request.metadata?.payeeVpa ?? defaultPayeeAddress;
  const payeeName = request.metadata?.payeeName ?? providerName;
  const transactionNote =
    request.metadata?.transactionNote ?? `Bharat OS ${vertical} booking`;
  const transactionRef =
    request.metadata?.transactionRef ??
    token('bos_upi', {
      actorId: request.actorId,
      bookingRef,
      amount: money.amount,
      currency: money.currency
    });
  const uri = createUpiDeepLink({
    payeeAddress,
    payeeName,
    amount: money.amount,
    currency: money.currency,
    transactionRef,
    transactionNote
  });

  if (!uri) return null;

  return {
    rail: 'upi',
    mode: 'deep_link',
    partnerIntegrated: false,
    requiresUserApproval: true,
    payeeAddress,
    payeeName,
    amount: money.amount,
    currency: money.currency,
    transactionRef,
    transactionNote,
    uri
  };
}

function uidaiOfflineEkyc(request) {
  return {
    toolId: 'uidai_offline_ekyc',
    status: 'verified',
    attestationToken: token('uidai_offline', {
      actorId: request.actorId,
      actionType: request.actionType
    }),
    piiReturned: false,
    aadhaarPayloadStored: false
  };
}

function digilocker(request) {
  const requested = request.metadata?.documents ?? ['identity', 'address'];
  return {
    toolId: 'digilocker',
    status: 'ready',
    documents: requested.map((type) => ({
      type,
      ref: token('dl_doc', { actorId: request.actorId, type }),
      payloadIncluded: false
    })),
    piiReturned: false
  };
}

function accountAggregator(request) {
  return {
    toolId: 'account_aggregator',
    status: 'summarized',
    financialSignal: {
      incomeBand: request.metadata?.incomeBand ?? 'INR_25K_50K_MONTHLY',
      cashflowScore: 72,
      dataWindowDays: 180,
      sourceRef: token('aa_summary', {
        actorId: request.actorId,
        actionType: request.actionType
      })
    },
    rawTransactionsReturned: false
  };
}

function abha(request) {
  if (request.actionType === 'health_document_upload') {
    const capture = request.metadata?.healthDocumentCapture;
    if (!capture) {
      throw new Error('health_document_upload requires metadata.healthDocumentCapture.');
    }
    return createAbhaStructuredUploadReceipt(capture);
  }

  return {
    toolId: 'abha',
    status: 'summarized',
    healthSignal: {
      conditionCount: 2,
      latestRecordMonth: '2026-05',
      recordBundleRef: token('abha_bundle', {
        actorId: request.actorId,
        actionType: request.actionType
      })
    },
    rawRecordsReturned: false
  };
}

function upiEscrow(request) {
  const money = safeAmount(request.money);
  if (money.amount <= 0) {
    throw new Error('UPI escrow requires a positive amount.');
  }
  if (money.limit !== undefined && money.amount > money.limit) {
    throw new Error('UPI escrow amount exceeds the declared user limit.');
  }

  return {
    toolId: 'upi_escrow',
    status: 'escrow_created',
    escrowId: idFrom('bos:escrow', {
      actorId: request.actorId,
      amount: money.amount,
      currency: money.currency,
      at: nowIso()
    }),
    amount: money.amount,
    currency: money.currency,
    workerCharged: false
  };
}

function meshStorage(request) {
  return {
    toolId: 'mesh.storage',
    status: 'accepted',
    storageClass: request.metadata?.storageClass ?? 'cold-object',
    placementPolicy: 'kyc_wifi_charging_threshold',
    payloadIncluded: false
  };
}

// Mocked ONDC / Beckn outbound bridge. In production this is a Beckn-compliant
// client (search → select → init → confirm) speaking to ONDC seller apps. The
// mock collapses all those calls into one provider quote — Bharat OS's native
// marketplace then decides whether to use it.
function ondcBeckn(request) {
  const vertical = request.metadata?.vertical ?? 'cab';
  if (!SERVICE_VERTICALS.includes(vertical)) {
    throw new Error(`Service vertical '${vertical}' is not supported. Allowed: ${SERVICE_VERTICALS.join(', ')}.`);
  }
  const money = safeAmount(request.money);
  const providerName =
    request.metadata?.providerName ??
    {
      cab: 'Namma Yatri (ONDC mock)',
      hotel: 'OYO-via-ONDC (mock)',
      ticket: 'IRCTC-via-ONDC (mock)',
      food: 'Local Kitchen via ONDC (mock)',
      grocery: 'Kirana via ONDC (mock)',
      services: 'Urban Services via ONDC (mock)'
    }[vertical];
  const bookingRef = idFrom('ondc:booking', {
    actorId: request.actorId,
    vertical,
    providerName,
    at: nowIso()
  });

  return {
    toolId: 'ondc_beckn',
    source: 'ondc',
    status: 'confirmed',
    protocol: 'beckn-2.0',
    vertical,
    providerId: token('ondc_provider', { vertical, providerName }),
    providerName,
    bookingRef,
    fare: money.amount > 0 ? { amount: money.amount, currency: money.currency } : null,
    payment: serviceBookingPayment(request, {
      bookingRef,
      providerName,
      vertical,
      defaultPayeeAddress: 'ondc.provider@upi'
    }),
    quote: {
      from: request.metadata?.from ?? null,
      to: request.metadata?.to ?? null,
      etaMinutes: request.metadata?.etaMinutes ?? null,
      headcount: request.metadata?.headcount ?? null,
      checkIn: request.metadata?.checkIn ?? null,
      checkOut: request.metadata?.checkOut ?? null
    },
    payloadIncluded: false,
    sellerPiiReturned: false
  };
}

// Bharat OS native L6 service marketplace. This is the substrate — provider
// registry, matching, Trust-Passport ranking, settlement, policy, and audit
// all live here. During Phase A the marketplace may opportunistically include
// ONDC bridge quotes (via `ondc_beckn`) to bootstrap supply density. The
// caller never has to choose — the marketplace returns one normalized booking
// receipt whose `sources` field shows where the chosen provider came from.
function bharatMarketplace(request) {
  const vertical = request.metadata?.vertical ?? 'cab';
  if (!SERVICE_VERTICALS.includes(vertical)) {
    throw new Error(`Service vertical '${vertical}' is not supported. Allowed: ${SERVICE_VERTICALS.join(', ')}.`);
  }
  const money = safeAmount(request.money);

  // Native providers — these are KYC'd, identity-anchored entries from the
  // Bharat OS provider registry. The mock seeds one per vertical.
  const nativeProvider = {
    providerId: token('bos_provider', { vertical, registry: 'native' }),
    providerName: {
      cab: 'Bharat OS Driver (native)',
      hotel: 'Bharat OS Stay (native)',
      ticket: 'Bharat OS Travel Desk (native)',
      food: 'Bharat OS Kitchen (native)',
      grocery: 'Bharat OS Kirana (native)',
      services: 'Bharat OS Services (native)'
    }[vertical],
    source: 'native',
    trustPassportScore: 0.78,
    commissionPct: 0
  };

  // Whether to include an ONDC bridge quote in the candidate set.
  // Default: include for Phase A density. Caller can disable via
  // metadata.includeOndcBridge=false to test native-only paths.
  const includeBridge = request.metadata?.includeOndcBridge !== false;
  const bridgeQuote = includeBridge ? ondcBeckn(request) : null;

  // Matching: native provider wins by default because it carries zero
  // commission and ranks on Trust Passport; the bridge is the fallback.
  // This is the design principle from §9B — the substrate prefers itself.
  const chosen = nativeProvider;
  const sources = bridgeQuote ? ['native', 'ondc-bridge'] : ['native'];
  const bookingRef = idFrom('bos:booking', {
    actorId: request.actorId,
    vertical,
    providerId: chosen.providerId,
    at: nowIso()
  });

  return {
    toolId: 'bharat_marketplace',
    layer: 'L6',
    status: 'confirmed',
    vertical,
    chosen: {
      providerId: chosen.providerId,
      providerName: chosen.providerName,
      source: chosen.source,
      trustPassportScore: chosen.trustPassportScore,
      commissionPct: chosen.commissionPct
    },
    bookingRef,
    fare: money.amount > 0 ? { amount: money.amount, currency: money.currency } : null,
    payment: serviceBookingPayment(request, {
      bookingRef,
      providerName: chosen.providerName,
      vertical,
      defaultPayeeAddress: 'bharatos.marketplace@upi'
    }),
    quote: {
      from: request.metadata?.from ?? null,
      to: request.metadata?.to ?? null,
      etaMinutes: request.metadata?.etaMinutes ?? null,
      headcount: request.metadata?.headcount ?? null,
      checkIn: request.metadata?.checkIn ?? null,
      checkOut: request.metadata?.checkOut ?? null
    },
    sources,
    bridgeAvailable: Boolean(bridgeQuote),
    bridgeReference: bridgeQuote
      ? { providerId: bridgeQuote.providerId, bookingRef: bridgeQuote.bookingRef }
      : null,
    payloadIncluded: false,
    sellerPiiReturned: false
  };
}

const ADAPTERS = {
  uidai_offline_ekyc: uidaiOfflineEkyc,
  digilocker,
  account_aggregator: accountAggregator,
  abha,
  upi_escrow: upiEscrow,
  'mesh.storage': meshStorage,
  ondc_beckn: ondcBeckn,
  bharat_marketplace: bharatMarketplace
};

export function listTools() {
  return TOOL_REGISTRY;
}

export function createBlockedToolExecution(decision, { skillPreflightId, at = nowIso() } = {}) {
  const blocked = {
    protocolVersion: TOOL_PROTOCOL_VERSION,
    objectType: 'tool-execution',
    skillPreflightId,
    status: 'blocked',
    decisionId: decision.decisionId,
    decision,
    toolReceipt: null,
    startedAt: at,
    finishedAt: at
  };

  return {
    executionId: idFrom('bos:tool-exec', blocked),
    auditHash: sha256Hex(stableStringify(blocked)),
    ...blocked
  };
}

export function executeToolAction(request, consents = [], options = {}) {
  const decision = evaluateDecision(request, consents, options);
  const startedAt = nowIso();

  if (!decision.approved) {
    return createBlockedToolExecution(decision, {
      skillPreflightId: options.skillPreflightId,
      at: startedAt
    });
  }

  const adapter = ADAPTERS[decision.request.tool];
  if (!adapter) {
    const failed = {
      protocolVersion: TOOL_PROTOCOL_VERSION,
      objectType: 'tool-execution',
      skillPreflightId: options.skillPreflightId,
      status: 'failed',
      decisionId: decision.decisionId,
      decision,
      toolReceipt: null,
      error: `No adapter registered for ${decision.request.tool}.`,
      startedAt,
      finishedAt: nowIso()
    };
    return {
      executionId: idFrom('bos:tool-exec', failed),
      auditHash: sha256Hex(stableStringify(failed)),
      ...failed
    };
  }

  try {
    const toolReceipt = adapter(decision.request);
    const completed = {
      protocolVersion: TOOL_PROTOCOL_VERSION,
      objectType: 'tool-execution',
      skillPreflightId: options.skillPreflightId,
      status: 'completed',
      decisionId: decision.decisionId,
      decision,
      toolReceipt,
      startedAt,
      finishedAt: nowIso()
    };
    return {
      executionId: idFrom('bos:tool-exec', completed),
      auditHash: sha256Hex(stableStringify(completed)),
      ...completed
    };
  } catch (error) {
    const failed = {
      protocolVersion: TOOL_PROTOCOL_VERSION,
      objectType: 'tool-execution',
      skillPreflightId: options.skillPreflightId,
      status: 'failed',
      decisionId: decision.decisionId,
      decision,
      toolReceipt: null,
      error: error.message,
      startedAt,
      finishedAt: nowIso()
    };
    return {
      executionId: idFrom('bos:tool-exec', failed),
      auditHash: sha256Hex(stableStringify(failed)),
      ...failed
    };
  }
}
