// Phase 13.7.3 — Worker encryption keypair store.
//
// The worker's long-lived P-256 ECDH keypair lives in
// localStorage on this device only. The public key gets
// published in the worker's capacity envelope; the private key
// NEVER leaves the device. A persona switch + erase clears it
// per the DPDP §12 cascade pattern (other Zustand persist
// stores like profile-store and identity-store follow the same
// shape).
//
// One keypair per worker identity (the keypair-store is keyed
// on identityId so multiple personas on the same device don't
// collide).
//
// §15 bindings:
//   • The private key NEVER leaves the device.
//   • Only the public key is published, and only on the worker's
//     own capacity envelope (which they control).
//   • Cleared on persona forget / identity erase.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  generateWorkerEncryptionKeypair,
  type WorkerEncryptionKeypair
} from './compute-encryption';

const STORE_VERSION = 1;

interface WorkerKeypairStoreState {
  /** identityId → keypair. One entry per persona on this device. */
  byIdentity: Record<string, WorkerEncryptionKeypair>;
  ensureKeypair: (identityId: string) => Promise<WorkerEncryptionKeypair>;
  getKeypair: (identityId: string) => WorkerEncryptionKeypair | null;
  clearForIdentity: (identityId: string) => void;
  clearAll: () => void;
}

export const useWorkerKeypairStore = create<WorkerKeypairStoreState>()(
  persist(
    (set, get) => ({
      byIdentity: {},
      ensureKeypair: async (identityId: string) => {
        const existing = get().byIdentity[identityId];
        if (existing) return existing;
        const fresh = await generateWorkerEncryptionKeypair();
        set((state) => ({
          byIdentity: { ...state.byIdentity, [identityId]: fresh }
        }));
        return fresh;
      },
      getKeypair: (identityId: string) => get().byIdentity[identityId] ?? null,
      clearForIdentity: (identityId: string) => {
        set((state) => {
          const next = { ...state.byIdentity };
          delete next[identityId];
          return { byIdentity: next };
        });
      },
      clearAll: () => set({ byIdentity: {} })
    }),
    {
      name: 'bos:phase13.compute-serving-worker-keypair',
      version: STORE_VERSION
    }
  )
);
