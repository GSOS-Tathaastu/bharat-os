// Phase 12.1a.2 — Provider context store.
//
// Zustand-persist holding "which provider profile is the citizen
// currently acting as." NOT an auth credential (the provider
// gates use root identity + ownership), just a UX hat-toggle so
// providers with multiple profiles (cab driver + cook) can switch
// without bouncing through /provider every time.
//
// Distinct LS key from identity-store + sponsor-auth-store to
// prevent collisions.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const LS_KEY = 'bharat-os.app.providerContext.v1';

interface ProviderContextState {
  activeProviderIdentityId: string | null;
  setActiveProvider: (providerIdentityId: string | null) => void;
  clearActiveProvider: () => void;
}

export const useProviderContextStore = create<ProviderContextState>()(
  persist(
    (set) => ({
      activeProviderIdentityId: null,
      setActiveProvider: (providerIdentityId) =>
        set({ activeProviderIdentityId: providerIdentityId }),
      clearActiveProvider: () => set({ activeProviderIdentityId: null })
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => localStorage)
    }
  )
);
