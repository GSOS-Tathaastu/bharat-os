// DPDP Act 2023 — data subject rights — Phase 4.0.
//
// The Digital Personal Data Protection Act 2023 (India) requires every
// data fiduciary to provide named user-facing surfaces for:
//
//   • Right to access     — §11(1)(a): user can request all data
//                           processed by the fiduciary
//   • Right to correction — §12(1): user can request correction /
//                           erasure of inaccurate data
//   • Right to erasure    — §12(3): user can request deletion of
//                           personal data after the purpose is served
//   • Right to grievance  — §13: contact a Data Protection Officer
//                           (DPO) named publicly
//   • Right of nomination — §14: nominate someone to exercise rights
//                           on the user's behalf
//
// This module exposes two pure functions:
//
//   • collectUserData(store, identityId) — gathers every artifact
//     associated with the identity across all store directories.
//     Used by `GET /api/identities/:id/export`.
//
//   • erasureManifest(store, identityId) — emits a deletion plan
//     (which file paths will be removed) WITHOUT touching the
//     filesystem. The API handler runs the manifest and emits an
//     `account.erased` ledger event with the user's signed
//     authorization. Lets us preview deletion (DPDP §12(4) — the
//     user has a right to know what will be deleted).
//
// The actual cascading delete is in the API handler so we keep this
// module pure and node:test-friendly.
//
// §15 bindings preserved:
//
//   • The export is gated on the user's own active session (the API
//     handler verifies). No "search by someone else's identity ID"
//     leak.
//   • The exported bundle is the same data the user already had
//     access to — DPDP §11 grants visibility, not new disclosure.
//   • Erasure cascades through every artifact owned by or signed by
//     the user. Public ledger entries that mention the user are
//     redacted (the event type and timestamp survive; the user's
//     identityId is replaced with `<erased>` so the chain integrity
//     stays intact but the link to the person is broken).

export const DPDP_RIGHTS_PROTOCOL_VERSION = 'bos.phase1.dpdp-rights.v0';

// Data Protection Officer contact — published per DPDP §13. The
// actual address + email are populated from environment variables at
// deploy time; this module ships sensible placeholders so the
// privacy / terms pages render even on a dev box.
export const DEFAULT_DPO_CONTACT = {
  name: 'Bharat OS Data Protection Officer',
  email: 'dpo@bharat-os.in',
  postal:
    'Bharat OS Data Protection Officer, [postal address pending]',
  grievanceEscalation: 'https://www.dpdpb.gov.in (Data Protection Board of India)',
  responseSlaDays: 30,
  protocolVersion: DPDP_RIGHTS_PROTOCOL_VERSION
};

function safe(value, fallback = null) {
  return value === undefined ? fallback : value;
}

// Collects every artifact this user owns / authored / signed across
// the store. Returns a plain object suitable for JSON serialisation
// — the API handler streams it back to the client as a download.
//
// The structure mirrors the store's directory layout so a user can
// scan the JSON and recognise what each section represents. Each
// section also carries a `count` and `firstRecordedAt` /
// `lastRecordedAt` so the user gets summary stats at a glance.
export async function collectUserData(store, identityId, { at = new Date().toISOString() } = {}) {
  if (!store) throw new Error('store is required.');
  if (!identityId) throw new Error('identityId is required.');

  const identity = await store.readIdentity(identityId).catch(() => null);
  if (!identity) {
    throw new Error(`no identity ${identityId}`);
  }

  // Resolve every list in parallel; filter to records that pertain
  // to this identity. The filter rules are intentionally permissive
  // — we include anything where this identity is mentioned, because
  // DPDP §11 grants the user visibility into all processing.
  const [
    consents,
    decisions,
    orchestrations,
    skillPreflights,
    toolExecutions,
    memoryRecords,
    workerAuthorizations,
    flagReports,
    meshContributions,
    pairingSessions,
    healthDocuments,
    profileCredentials,
    pushSubscriptions,
    workerNotifications,
    federatedUpdates,
    attestations,
    earningsEntries,
    portableAttestations,
    incomeVerificationConsents,
    meshWithdrawals,
    collectiveMemberships,
    ledger
  ] = await Promise.all([
    store.listConsents().catch(() => []),
    store.listDecisions().catch(() => []),
    store.listOrchestrations().catch(() => []),
    store.listSkillPreflights().catch(() => []),
    store.listToolExecutions().catch(() => []),
    store.listMemoryRecords().catch(() => []),
    store.listWorkerAuthorizations().catch(() => []),
    store.listFlagReports().catch(() => []),
    store.listMeshContributionEvents().catch(() => []),
    store.listPairingSessions().catch(() => []),
    store.listHealthDocumentCaptures().catch(() => []),
    store.listProfileCredentials().catch(() => []),
    store.listPushSubscriptions().catch(() => []),
    store.listWorkerNotifications().catch(() => []),
    store.listFederatedUpdates().catch(() => []),
    store.listAttestations().catch(() => []),
    // Phase 6.0 — earnings-log surfaces in DPDP export + erasure
    // cascade. Optional (store may not implement it).
    store.listEarningsEntries
      ? store.listEarningsEntries({ identityId }).catch(() => [])
      : Promise.resolve([]),
    // Phase 5.9 — portable attestations on the worker side.
    store.listPortableAttestations
      ? store.listPortableAttestations({ workerId: identityId }).catch(() => [])
      : Promise.resolve([]),
    // Phase 6.1 — MFI income-verification consents the user has issued.
    store.listIncomeVerificationConsents
      ? store.listIncomeVerificationConsents({ workerId: identityId }).catch(() => [])
      : Promise.resolve([]),
    // Phase 6.1b — mesh-earnings UPI withdrawal requests.
    store.listMeshWithdrawals
      ? store.listMeshWithdrawals({ workerId: identityId }).catch(() => [])
      : Promise.resolve([]),
    // Phase 6.2 — collective memberships where the identity is
    // either the member or the issuing collective.
    store.listCollectiveMemberships
      ? Promise.all([
          store.listCollectiveMemberships({ memberId: identityId }).catch(() => []),
          store.listCollectiveMemberships({ collectiveId: identityId }).catch(() => [])
        ]).then(([asMember, asCollective]) => [...asMember, ...asCollective])
      : Promise.resolve([]),
    store.listLedger({ limit: undefined, newestFirst: false }).catch(() => [])
  ]);

  const filterBySubject = (records) =>
    records.filter(
      (r) =>
        r.subjectId === identityId ||
        r.ownerId === identityId ||
        r.actorId === identityId ||
        r.operatorId === identityId ||
        r.contributorId === identityId ||
        r.workerId === identityId ||
        r.identityId === identityId ||
        r.reporterId === identityId ||
        r.issuerIdentityId === identityId ||
        r.decision?.request?.actorId === identityId ||
        r.action?.actorId === identityId
    );

  const ledgerEntries = ledger.filter((event) =>
    [
      event.identityId,
      event.subjectId,
      event.ownerId,
      event.actorId,
      event.operatorId,
      event.contributorId,
      event.workerId,
      event.reporterId
    ].includes(identityId)
  );

  const stats = (records) => ({
    count: records.length,
    firstRecordedAt:
      records.length === 0
        ? null
        : records.reduce((min, r) => {
            const t = r.createdAt ?? r.issuedAt ?? r.at ?? r.submittedAt ?? null;
            return !min || (t && t < min) ? t : min;
          }, null),
    lastRecordedAt:
      records.length === 0
        ? null
        : records.reduce((max, r) => {
            const t = r.createdAt ?? r.issuedAt ?? r.at ?? r.submittedAt ?? null;
            return !max || (t && t > max) ? t : max;
          }, null)
  });

  const subjectConsents = filterBySubject(consents);
  const subjectDecisions = filterBySubject(decisions);
  const subjectOrchestrations = filterBySubject(orchestrations);
  const subjectPreflights = filterBySubject(skillPreflights);
  const subjectExecutions = filterBySubject(toolExecutions);
  const subjectMemoryRecords = filterBySubject(memoryRecords);
  const subjectWorkerAuthorizations = filterBySubject(workerAuthorizations);
  const subjectFlagsAuthored = flagReports.filter((f) => f.reporterId === identityId);
  const subjectFlagsAgainst = flagReports.filter((f) => f.subjectId === identityId);
  const subjectMeshContributions = filterBySubject(meshContributions);
  const subjectPairings = pairingSessions.filter(
    (s) => s.issuerIdentityId === identityId || s.receiverFingerprint?.includes?.(identityId)
  );
  const subjectHealthDocuments = filterBySubject(healthDocuments);
  const subjectCredentials = filterBySubject(profileCredentials);
  const subjectPushSubscriptions = filterBySubject(pushSubscriptions);
  const subjectWorkerNotifications = filterBySubject(workerNotifications);
  const subjectFederatedUpdates = filterBySubject(federatedUpdates);
  const subjectAttestations = filterBySubject(attestations);
  // earningsEntries are pre-filtered (we passed identityId to
  // listEarningsEntries) but defensive double-filter is cheap.
  const subjectEarnings = (earningsEntries ?? []).filter(
    (e) => e.identityId === identityId
  );
  // Portable attestations — pre-filtered by workerId; defensive
  // re-filter is cheap.
  const subjectPortableAttestations = (portableAttestations ?? []).filter(
    (a) => a.workerId === identityId
  );
  // MFI income-verification consents — pre-filtered by workerId.
  const subjectIncomeVerificationConsents = (
    incomeVerificationConsents ?? []
  ).filter((c) => c.workerId === identityId);
  // Mesh-earnings UPI withdrawals — pre-filtered by workerId.
  const subjectMeshWithdrawals = (meshWithdrawals ?? []).filter(
    (w) => w.workerId === identityId
  );
  // Collective memberships — already filtered to entries where
  // the identity is either the member or the collective; dedupe
  // by membershipId in case both halves matched.
  const dedupedMemberships = new Map();
  for (const m of collectiveMemberships ?? []) {
    if (m?.membershipId) dedupedMemberships.set(m.membershipId, m);
  }
  const subjectCollectiveMemberships = [...dedupedMemberships.values()];

  return {
    protocolVersion: DPDP_RIGHTS_PROTOCOL_VERSION,
    objectType: 'dpdp-data-subject-export',
    exportedAt: at,
    subject: {
      identityId,
      displayName: identity.displayName,
      publicKeyPem: identity.publicKeyPem,
      attestations: identity.attestations ?? {},
      createdAt: identity.createdAt
      // privateKeyPem + vaultKeyBase64 deliberately NOT included.
      // DPDP §11 grants access to data ABOUT the user, not the
      // user's secret cryptographic material. The user already
      // controls these via the §7c recovery phrase; exporting them
      // a second time creates an attack surface (a stolen export
      // file = a fully usable identity).
    },
    sections: {
      identity: {
        ...stats([identity]),
        // §15: never serialize the cryptographic secret material into
        // an export bundle, even when the user asks for "all my data".
        // The user already controls private + vault keys via the §7c
        // recovery phrase; a second copy in an export file is an
        // attack surface (stolen export = full impersonation).
        records: [
          {
            ...identity,
            privateKeyPem: undefined,
            vaultKeyBase64: undefined
          }
        ]
      },
      consents: { ...stats(subjectConsents), records: subjectConsents },
      decisions: { ...stats(subjectDecisions), records: subjectDecisions },
      orchestrations: {
        ...stats(subjectOrchestrations),
        records: subjectOrchestrations
      },
      skillPreflights: {
        ...stats(subjectPreflights),
        records: subjectPreflights
      },
      toolExecutions: { ...stats(subjectExecutions), records: subjectExecutions },
      memoryRecords: {
        ...stats(subjectMemoryRecords),
        records: subjectMemoryRecords
      },
      workerAuthorizations: {
        ...stats(subjectWorkerAuthorizations),
        records: subjectWorkerAuthorizations
      },
      flagsAuthored: { ...stats(subjectFlagsAuthored), records: subjectFlagsAuthored },
      flagsAgainst: { ...stats(subjectFlagsAgainst), records: subjectFlagsAgainst },
      meshContributions: {
        ...stats(subjectMeshContributions),
        records: subjectMeshContributions
      },
      pairingSessions: { ...stats(subjectPairings), records: subjectPairings },
      healthDocuments: {
        ...stats(subjectHealthDocuments),
        records: subjectHealthDocuments
      },
      profileCredentials: {
        ...stats(subjectCredentials),
        records: subjectCredentials
      },
      pushSubscriptions: {
        ...stats(subjectPushSubscriptions),
        records: subjectPushSubscriptions
      },
      workerNotifications: {
        ...stats(subjectWorkerNotifications),
        records: subjectWorkerNotifications
      },
      federatedUpdates: {
        ...stats(subjectFederatedUpdates),
        records: subjectFederatedUpdates
      },
      attestations: { ...stats(subjectAttestations), records: subjectAttestations },
      // Phase 6.0 — single-player earnings tracker. All entries are
      // user-typed, never scraped from aggregators.
      earningsLog: { ...stats(subjectEarnings), records: subjectEarnings },
      // Phase 5.9 — portable work-history attestations the worker
      // has accumulated.
      portableAttestations: {
        ...stats(subjectPortableAttestations),
        records: subjectPortableAttestations
      },
      // Phase 6.1 — income-verification consents the user has issued
      // to MFIs / lenders. The consent record itself is user data
      // (it authorises external read access) so it's in the export
      // + erasure scope.
      incomeVerificationConsents: {
        ...stats(subjectIncomeVerificationConsents),
        records: subjectIncomeVerificationConsents
      },
      // Phase 6.1b — mesh-earnings UPI cash-out requests. Contains
      // the UPI ID (stored in the JSON blob); export gives the user
      // visibility into every payout request they've made.
      meshWithdrawals: {
        ...stats(subjectMeshWithdrawals),
        records: subjectMeshWithdrawals
      },
      // Phase 6.2 — collective memberships (worker side AND, if the
      // identity is a collective, its issued attestations).
      collectiveMemberships: {
        ...stats(subjectCollectiveMemberships),
        records: subjectCollectiveMemberships
      },
      ledger: { ...stats(ledgerEntries), records: ledgerEntries }
    },
    notice: {
      whatThisIs:
        'A complete export of every record associated with your Bharat OS identity. Bharat OS holds no other data about you — what is in this file is what is in our store.',
      doesNotInclude:
        'Your Ed25519 private key and vault key are NOT in this export. Those are protected by your 12-word recovery phrase and never leave the device. This is intentional — exposing them in an export file would let anyone who steals the file impersonate you.',
      yourRights: [
        'Right to access — granted by this export',
        'Right to correction — POST /api/consents/:id/revoke + re-issue with corrected fields',
        'Right to erasure — DELETE /api/identities/:id (cascades through all listed sections)',
        'Right to grievance — contact the DPO (see grievanceContact below)'
      ],
      grievanceContact: DEFAULT_DPO_CONTACT,
      slaForResponse: '30 days from request, per DPDP §11(1)(a)'
    }
  };
}

// Builds a deletion plan — which records would be erased. Pure;
// does NOT touch the filesystem. The API handler is responsible
// for the actual cascade.
//
// Returns:
//   {
//     identityId,
//     plannedDeletions: { sectionName: count, … },
//     totalRecords,
//     ledgerEntryRedactions,
//     noticeText
//   }
export async function erasureManifest(store, identityId, { at = new Date().toISOString() } = {}) {
  if (!store) throw new Error('store is required.');
  if (!identityId) throw new Error('identityId is required.');

  const data = await collectUserData(store, identityId, { at });
  const plannedDeletions = {};
  let totalRecords = 0;
  for (const [section, payload] of Object.entries(data.sections)) {
    if (section === 'ledger') continue; // ledger entries are redacted, not deleted
    if (section === 'identity') {
      plannedDeletions[section] = 1;
      totalRecords += 1;
      continue;
    }
    plannedDeletions[section] = payload.count;
    totalRecords += payload.count;
  }
  return {
    protocolVersion: DPDP_RIGHTS_PROTOCOL_VERSION,
    objectType: 'dpdp-erasure-manifest',
    identityId,
    generatedAt: at,
    plannedDeletions,
    totalRecords,
    ledgerEntryRedactions: data.sections.ledger.count,
    noticeText:
      `You're about to erase ${totalRecords} records associated with identity ${identityId}. ` +
      `${data.sections.ledger.count} additional ledger entries will be redacted ` +
      `(the chain stays intact for the rest of the system, but your identityId is replaced ` +
      `with "<erased>" so no one can link those events back to you).\n\n` +
      `This is permanent. Your recovery phrase WILL NOT bring this account back. ` +
      `If you ever want to use Bharat OS again, you'll start over with a new identity.`
  };
}

// Redacts a ledger event by replacing the user's identityId with the
// fixed string '<erased>'. The event type, timestamp, and any
// non-identity payload survive so the chain integrity (and other
// users' visibility into events that legitimately involve them) is
// preserved.
export function redactLedgerEntry(event, identityId) {
  if (!event || typeof event !== 'object') return event;
  const redacted = { ...event };
  for (const key of [
    'identityId',
    'subjectId',
    'ownerId',
    'actorId',
    'operatorId',
    'contributorId',
    'workerId',
    'reporterId',
    'issuerIdentityId'
  ]) {
    if (redacted[key] === identityId) {
      redacted[key] = '<erased>';
    }
  }
  return redacted;
}
