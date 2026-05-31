import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Phase 12.0.5 — sponsor session state.
//
// Distinct from the citizen/worker identityStore (deviceOwnerId) by
// design — sponsors and citizens are mutually exclusive personas at
// the URL level (/sponsor/* vs /worker/*, /citizen/*). The bearer
// token is the *only* credential a sponsor has; admins created it
// once via POST /api/admin/sponsors and showed it to the sponsor
// out-of-band. There is no recovery path beyond "admin re-creates
// the sponsor".
//
// §15 trade-off: the token persists in localStorage. We accept this
// because (a) the same trade-off lives in the existing /shell/ MFI
// share-URL pattern, (b) the alternative (in-memory only) would
// force re-paste on every page reload which kills the demo flow,
// and (c) sponsors can sign out explicitly which wipes the store.
//
// The token is NEVER echoed into the DOM after entry — the entry
// field is password-masked and the only consumer is the Authorization
// header injector in api-sponsor.ts.

const LS_KEY = 'bharat-os.app.sponsorAuth.v1';

interface SponsorAuthStore {
  sponsorId: string | null;
  bearerToken: string | null;
  setAuth: (sponsorId: string, bearerToken: string) => void;
  clear: () => void;
}

export const useSponsorAuthStore = create<SponsorAuthStore>()(
  persist(
    (set) => ({
      sponsorId: null,
      bearerToken: null,
      setAuth: (sponsorId, bearerToken) => set({ sponsorId, bearerToken }),
      clear: () => set({ sponsorId: null, bearerToken: null })
    }),
    { name: LS_KEY, storage: createJSONStorage(() => localStorage) }
  )
);

export function clearSponsorAuth() {
  useSponsorAuthStore.getState().clear();
}
