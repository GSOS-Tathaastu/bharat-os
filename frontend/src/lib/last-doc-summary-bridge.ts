// Phase 13.4 — last-doc-summary bridge.
//
// Tiny in-memory zustand store that lets the DocSummariserPanel
// publish its last successful summary so a sibling SkillAgentPanel
// can read it without prop drilling. Per-identity scoped — the
// snapshot includes ownerIdentityId so a cross-identity flip
// nukes the value at read time.
//
// §15 bindings:
//   • In-memory only. No localStorage / sessionStorage / IndexedDB.
//     Citizen B opening the same tab after Citizen A signs out
//     sees no cleartext bytes.
//   • Owner gating. `getLastDocSummary(identityId)` returns null
//     when the snapshot's owner != identityId; defence-in-depth
//     against an unmount race on identity flip.
//   • Bytes never leave device. The store is local, not a fetch.

import { create } from 'zustand';
import type { ParsedDocSummary } from './doc-summariser';

export interface LastDocSummarySnapshot {
  ownerIdentityId: string;
  docKind: ParsedDocSummary['fields']['docKind'];
  parsed: ParsedDocSummary;
  capturedAt: string;
}

interface LastDocSummaryState {
  snapshot: LastDocSummarySnapshot | null;
  setSnapshot: (snapshot: LastDocSummarySnapshot) => void;
  clear: () => void;
}

export const useLastDocSummaryBridge = create<LastDocSummaryState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  clear: () => set({ snapshot: null })
}));

/**
 * Owner-scoped accessor. Returns the snapshot ONLY when its
 * ownerIdentityId matches the caller's identityId — protects
 * against a cross-identity read race during sign-out / switch.
 */
export function getLastDocSummary(identityId: string | null | undefined): LastDocSummarySnapshot | null {
  if (!identityId) return null;
  const snap = useLastDocSummaryBridge.getState().snapshot;
  if (!snap || snap.ownerIdentityId !== identityId) return null;
  return snap;
}
