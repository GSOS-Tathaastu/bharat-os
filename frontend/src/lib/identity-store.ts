import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Identity } from './api';

// Phase 11.1 — active-identity state. Persists to localStorage under a
// /app-specific key so it never collides with /shell/.
const LS_KEY = 'bharat-os.app.deviceOwnerId';

interface IdentityStore {
  activeIdentityId: string | null;
  setActive: (id: string | null) => void;
  clear: () => void;
}

export const useIdentityStore = create<IdentityStore>()(
  persist(
    (set) => ({
      activeIdentityId: null,
      setActive: (id) => set({ activeIdentityId: id }),
      clear: () => set({ activeIdentityId: null })
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => localStorage)
    }
  )
);

// Persona classification — used by onboarding + the worker/citizen
// switcher. Heuristic on display name; precise enough for the seeded
// demo personas.
export type PersonaKind = 'worker' | 'citizen';

const WORKER_HINTS = [
  /\bmesh\b/i,
  /driver/i,
  /contractor/i,
  /engineering student/i, // Priya
  /freelance/i,
  /CA\b/i // Rajesh as freelancer
];

export function classifyPersona(identity: Identity | undefined | null): PersonaKind {
  if (!identity) return 'citizen';
  const text = (identity.displayName ?? '') + ' ' + JSON.stringify(identity.attestations ?? {});
  for (const re of WORKER_HINTS) {
    if (re.test(text)) return 'worker';
  }
  return 'citizen';
}
