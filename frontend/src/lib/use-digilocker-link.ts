// Phase 12.2.7 — useDigilockerLink hook.
//
// Wraps the Phase 12.2.6 DigiLocker endpoints
// (authorize / callback / status / DELETE link). Stub mode runs
// the whole OAuth dance via fetch (no popup); live mode opens a
// popup window and waits for postMessage from the callback page.
//
// §15 bindings the hook honors:
//   - Never stores the access or refresh token client-side; the
//     /status endpoint that the hook polls returns only
//     {linked, mode, scope, linkedAt, expiresAt}.
//   - actingRootIdentityId travels in the X-Bharat-OS-Acting-
//     Identity header ONLY, never in the URL query string
//     (Phase 12.2.7 adversarial fix L1-2: the shell's service
//     worker logs URLs, and the rootIdentityId in a query
//     string would land in those logs + the referer header.
//     The rootIdentityId isn't a secret, but it's a stable
//     per-user correlator that shouldn't sit in URL telemetry).
//   - The link operation is two-phase (authorize → callback). The
//     hook keeps the parts orchestrated so a partial completion
//     surfaces cleanly to the citizen.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface DigilockerLinkStatus {
  linked: boolean;
  mode?: 'stub' | 'live';
  scope?: string;
  linkedAt?: string;
  expiresAt?: string;
}

interface AuthorizeResponse {
  ok: true;
  mode: 'stub' | 'live';
  state: string;
  authorizeUrl: string;
  expiresAt: string;
}

interface CallbackResponse {
  ok: true;
  mode: 'stub' | 'live';
  linked: true;
  rootIdentityId: string;
  scope: string;
  expiresAt: string;
  next: string;
}

// Phase 12.2.7 adversarial fix L1-1 — defensive same-origin
// check on the BE-supplied authorize URL. If the BE allowlist
// had a regression and let an absolute attacker URL through,
// `new URL(absoluteUrl, base)` would happily resolve to it and
// the FE would fetch it. Require a relative path OR an absolute
// URL matching window.location.origin.
function assertSameOriginCallback(authorizeUrl: string): URL {
  const resolved = new URL(authorizeUrl, window.location.origin);
  if (resolved.origin !== window.location.origin) {
    throw new Error(`DigiLocker authorize URL points off-origin: ${resolved.origin}`);
  }
  return resolved;
}

// Status query — kept fresh per active identity so the wizard
// updates immediately after link/unlink.
export function useDigilockerLinkStatus(rootIdentityId: string | null | undefined) {
  return useQuery<DigilockerLinkStatus>({
    queryKey: ['digilocker', 'status', rootIdentityId],
    enabled: Boolean(rootIdentityId),
    queryFn: () =>
      api<DigilockerLinkStatus>(
        '/api/digilocker/status',
        {
          headers: { 'X-Bharat-OS-Acting-Identity': rootIdentityId as string }
        }
      ),
    staleTime: 30_000
  });
}

// Link mutation — runs authorize + callback in sequence. Stub
// mode completes without opening a browser window because the
// authorizeUrl in stub points directly at our own callback;
// firing it as a fetch is equivalent to the citizen completing
// the OAuth dance. Live mode would open the URL in a popup; v1
// returns the URL and lets the caller handle the popup
// orchestration (deferred to Phase 12.2.8 when partner keys
// arrive).
export function useLinkDigilocker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rootIdentityId }: { rootIdentityId: string }) => {
      const auth = await api<AuthorizeResponse>(
        '/api/digilocker/authorize',
        {
          headers: { 'X-Bharat-OS-Acting-Identity': rootIdentityId }
        }
      );
      if (auth.mode === 'stub') {
        // Stub OAuth: the authorizeUrl already points at our own
        // callback. Hit it directly so the citizen doesn't see a
        // bogus redirect dialog.
        let callbackUrl: URL;
        try {
          callbackUrl = assertSameOriginCallback(auth.authorizeUrl);
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : 'malformed authorize URL');
        }
        const callback = await api<CallbackResponse>(
          `${callbackUrl.pathname}${callbackUrl.search}`
        );
        return { mode: 'stub' as const, auth, callback };
      }
      // Live mode — the caller must open auth.authorizeUrl in a
      // popup window AND listen for postMessage from the
      // callback page. v1 returns the URL + state so the FE can
      // orchestrate; Phase 12.2.8 will ship the popup helper.
      return { mode: 'live' as const, auth, callback: null };
    },
    onSuccess: (_data, { rootIdentityId }) => {
      qc.invalidateQueries({ queryKey: ['digilocker', 'status', rootIdentityId] });
    }
  });
}

export function useUnlinkDigilocker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rootIdentityId }: { rootIdentityId: string }) =>
      api<{ ok: true; unlinked: true }>(
        '/api/digilocker/link',
        {
          method: 'DELETE',
          headers: { 'X-Bharat-OS-Acting-Identity': rootIdentityId }
        }
      ),
    onSuccess: (_data, { rootIdentityId }) => {
      qc.invalidateQueries({ queryKey: ['digilocker', 'status', rootIdentityId] });
    }
  });
}
