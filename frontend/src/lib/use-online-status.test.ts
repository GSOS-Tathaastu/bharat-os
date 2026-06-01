import { describe, expect, it } from 'vitest';
import { resolveOnlineState } from './use-online-status';

describe('resolveOnlineState', () => {
  it('navigator offline → offline regardless of fetch outcome', () => {
    expect(resolveOnlineState({ navigatorOnline: false, lastFetchWasNetworkError: false })).toBe('offline');
    expect(resolveOnlineState({ navigatorOnline: false, lastFetchWasNetworkError: true })).toBe('offline');
  });
  it('navigator online + healthy fetch → online', () => {
    expect(resolveOnlineState({ navigatorOnline: true, lastFetchWasNetworkError: false })).toBe('online');
  });
  it('navigator online + network error → offline (captive-portal style)', () => {
    expect(resolveOnlineState({ navigatorOnline: true, lastFetchWasNetworkError: true })).toBe('offline');
  });
});
