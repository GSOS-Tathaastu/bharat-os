// Phase 2a.1.5 — opfs.ts regression pins for the mobile-install OOM fix.
//
// We can't reach the real OPFS in jsdom, but we can pin:
//   - estimateInstallFeasible behaviour against a mocked navigator.storage
//   - DownloadFailureError classification of common error shapes

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateInstallFeasible, DownloadFailureError } from './opfs';

const originalStorage = Object.getOwnPropertyDescriptor(window.navigator, 'storage');

function setStorage(impl: Partial<StorageManager> | undefined) {
  if (impl === undefined) {
    Object.defineProperty(window.navigator, 'storage', {
      configurable: true,
      value: undefined
    });
    return;
  }
  Object.defineProperty(window.navigator, 'storage', {
    configurable: true,
    value: impl as StorageManager
  });
}

describe('estimateInstallFeasible', () => {
  beforeEach(() => {
    setStorage(undefined);
  });

  afterEach(() => {
    if (originalStorage) {
      Object.defineProperty(window.navigator, 'storage', originalStorage);
    }
  });

  it('returns ok when navigator.storage.estimate is unavailable', async () => {
    const result = await estimateInstallFeasible(1_000_000_000);
    expect(result.ok).toBe(true);
  });

  it('returns ok when quota is unknown (estimate.quota null)', async () => {
    setStorage({ estimate: vi.fn(async () => ({})) });
    const result = await estimateInstallFeasible(1_000_000_000);
    expect(result.ok).toBe(true);
  });

  it('returns insufficient when free space < 1.3× expected', async () => {
    // 1.0 GB expected; 1.0 GB free → margin needed 1.3 GB → insufficient.
    setStorage({
      estimate: vi.fn(async () => ({
        quota: 2_000_000_000,
        usage: 1_000_000_000
      }))
    });
    const result = await estimateInstallFeasible(1_000_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('insufficient');
      expect(result.freeBytes).toBe(1_000_000_000);
      expect(result.quotaBytes).toBe(2_000_000_000);
    }
  });

  it('returns ok when free space exceeds the 1.3× safety margin', async () => {
    // 1.0 GB expected; 2.0 GB free → safely fits.
    setStorage({
      estimate: vi.fn(async () => ({
        quota: 5_000_000_000,
        usage: 3_000_000_000
      }))
    });
    const result = await estimateInstallFeasible(1_000_000_000);
    expect(result.ok).toBe(true);
  });

  it('returns ok if estimate() throws (defensive fallback)', async () => {
    setStorage({
      estimate: vi.fn(async () => {
        throw new Error('boom');
      })
    });
    const result = await estimateInstallFeasible(1_000_000_000);
    expect(result.ok).toBe(true);
  });
});

describe('DownloadFailureError', () => {
  it('carries a discriminated failureCode the UI can branch on', () => {
    const err = new DownloadFailureError('oom', 'tab killed');
    expect(err.failureCode).toBe('oom');
    expect(err.message).toBe('tab killed');
    expect(err.name).toBe('DownloadFailureError');
    expect(err).toBeInstanceOf(Error);
    expect(err.downloadedBytes).toBe(0);
    expect(err.quotaSnapshot).toBeUndefined();
  });

  it('preserves the original cause for debugging', () => {
    const inner = new Error('inner');
    const err = new DownloadFailureError('network_aborted', 'wrap', { cause: inner });
    expect(err.cause).toBe(inner);
  });

  it('Phase 2a.1.6 — carries downloadedBytes + quotaSnapshot through the error path', () => {
    const err = new DownloadFailureError('quota_exceeded', 'oof', {
      downloadedBytes: 800_000_000,
      quotaSnapshot: { quotaBytes: 10_000_000_000, usageBytes: 50_000 }
    });
    expect(err.downloadedBytes).toBe(800_000_000);
    expect(err.quotaSnapshot?.quotaBytes).toBe(10_000_000_000);
    expect(err.quotaSnapshot?.usageBytes).toBe(50_000);
  });
});
