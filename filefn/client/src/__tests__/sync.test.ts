import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OfflineSync } from '../offline/sync.js';

describe('OfflineSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries transient sync failures while online and resolves late waiters once', async () => {
    let retryCount = 0;
    const pending = {
      uploadSessionId: 'offline_retry_1',
      fileId: 'file_retry_1',
      policy: 'p',
      fileName: 'retry.txt',
      size: 4,
      mimeType: 'text/plain',
      fileData: new TextEncoder().encode('test').buffer,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const store = {
      async listPendingUploads() {
        return ['offline_retry_1'];
      },
      async getPendingUpload() {
        return pending;
      },
      async deletePendingUpload() {
        return;
      },
      async incrementRetryCount() {
        retryCount += 1;
        pending.retryCount = retryCount;
      },
    };

    const client = {
      uploadFile: vi
        .fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({ fileId: 'file_retry_1', versionId: 'ver_retry_1' }),
    };

    const sync = new OfflineSync({
      store: store as any,
      client,
      retryDelayMs: 25,
      maxRetries: 2,
    });
    sync.setConnectivityChecker({
      isOnline: () => true,
      onOnline: () => () => {},
      onOffline: () => () => {},
    });

    await sync.syncAll();
    expect(client.uploadFile).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25);
    const settled = await sync.waitForUpload('offline_retry_1');
    expect(settled).toEqual({ fileId: 'file_retry_1', versionId: 'ver_retry_1' });
    await expect(sync.waitForUpload('offline_retry_1')).resolves.toEqual({
      fileId: 'file_retry_1',
      versionId: 'ver_retry_1',
    });
  });

  it('keeps settled results available on the fast path until expiry', async () => {
    const sync = new OfflineSync({
      store: {
        async listPendingUploads() { return []; },
        async getPendingUpload() { return null; },
        async deletePendingUpload() { return; },
        async incrementRetryCount() { return; },
      } as any,
      client: {
        async uploadFile() {
          return { fileId: 'file', versionId: 'ver' };
        },
      },
    });

    sync.setConnectivityChecker({
      isOnline: () => true,
      onOnline: () => () => {},
      onOffline: () => () => {},
    });

    const notify = sync as unknown as {
      notifyListeners: (uploadSessionId: string, result: { fileId: string; versionId: string } | Error) => void;
    };
    notify.notifyListeners('offline_done_1', { fileId: 'file_done_1', versionId: 'ver_done_1' });

    await expect(sync.waitForUpload('offline_done_1')).resolves.toEqual({
      fileId: 'file_done_1',
      versionId: 'ver_done_1',
    });
    await expect(sync.waitForUpload('offline_done_1')).resolves.toEqual({
      fileId: 'file_done_1',
      versionId: 'ver_done_1',
    });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    const thirdWait = Promise.race([
      sync.waitForUpload('offline_done_1').then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 0)),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await expect(thirdWait).resolves.toBe('pending');
  });

  it('rejects waiting uploads after cancellation and removes staged data', async () => {
    const store = {
      async listPendingUploads() { return ['offline_cancel_1']; },
      async getPendingUpload() { return null; },
      async deletePendingUpload() { return; },
      async incrementRetryCount() { return; },
    };

    const sync = new OfflineSync({
      store: store as any,
      client: {
        async uploadFile() {
          return { fileId: 'file', versionId: 'ver' };
        },
      },
    });

    const waitPromise = sync.waitForUpload('offline_cancel_1');
    await sync.cancelUpload('offline_cancel_1');

    await expect(waitPromise).rejects.toThrow('Aborted');
  });

  it('aborts an in-flight sync without scheduling a retry', async () => {
    let deleted = false;
    const pending = {
      uploadSessionId: 'offline_cancel_live_1',
      fileId: 'file_cancel_live_1',
      policy: 'p',
      idempotencyKey: 'idem_cancel_live_1',
      fileName: 'cancel.txt',
      size: 4,
      mimeType: 'text/plain',
      fileData: new TextEncoder().encode('test').buffer,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const store = {
      async listPendingUploads() {
        return deleted ? [] : [pending.uploadSessionId];
      },
      async getPendingUpload() {
        return deleted ? null : pending;
      },
      async deletePendingUpload() {
        deleted = true;
      },
      async incrementRetryCount() {
        throw new Error('retry count should not increment after abort');
      },
    };

    let abortSignal: AbortSignal | undefined;
    const client = {
      uploadFile: vi.fn().mockImplementation(async (input: { signal?: AbortSignal }) => {
        abortSignal = input.signal;
        return await new Promise((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      }),
    };

    const sync = new OfflineSync({
      store: store as any,
      client,
      retryDelayMs: 25,
      maxRetries: 2,
    });
    sync.setConnectivityChecker({
      isOnline: () => true,
      onOnline: () => () => {},
      onOffline: () => () => {},
    });

    const syncPromise = sync.syncUpload(pending.uploadSessionId);
    await vi.advanceTimersByTimeAsync(0);
    expect(abortSignal).toBeDefined();

    await sync.cancelUpload(pending.uploadSessionId);
    await expect(syncPromise).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(25);
    expect(client.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('serializes duplicate sync attempts for the same upload session', async () => {
    const pending = {
      uploadSessionId: 'offline_dup_1',
      fileId: 'file_dup_1',
      policy: 'p',
      fileName: 'dup.txt',
      size: 4,
      mimeType: 'text/plain',
      fileData: new TextEncoder().encode('test').buffer,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const store = {
      async listPendingUploads() {
        return [pending.uploadSessionId];
      },
      async getPendingUpload() {
        return pending;
      },
      async deletePendingUpload() {
        return;
      },
      async incrementRetryCount() {
        return;
      },
    };

    let release!: () => void;
    const client = {
      uploadFile: vi.fn().mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { fileId: 'file_dup_1', versionId: 'ver_dup_1' };
      }),
    };

    const sync = new OfflineSync({
      store: store as any,
      client,
    });
    sync.setConnectivityChecker({
      isOnline: () => true,
      onOnline: () => () => {},
      onOffline: () => () => {},
    });

    const first = sync.syncUpload(pending.uploadSessionId);
    const second = sync.syncUpload(pending.uploadSessionId);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.uploadFile).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
    expect(client.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable failures', async () => {
    const pending = {
      uploadSessionId: 'offline_perm_1',
      fileId: 'file_perm_1',
      policy: 'p',
      fileName: 'perm.txt',
      size: 4,
      mimeType: 'text/plain',
      fileData: new TextEncoder().encode('test').buffer,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const store = {
      async listPendingUploads() {
        return [pending.uploadSessionId];
      },
      async getPendingUpload() {
        return pending;
      },
      async deletePendingUpload() {
        return;
      },
      async incrementRetryCount() {
        pending.retryCount += 1;
      },
    };

    const authError = new Error('forbidden') as Error & { status?: number };
    authError.status = 403;

    const sync = new OfflineSync({
      store: store as any,
      client: {
        uploadFile: vi.fn().mockRejectedValue(authError),
      },
      retryDelayMs: 25,
      maxRetries: 2,
    });
    sync.setConnectivityChecker({
      isOnline: () => true,
      onOnline: () => () => {},
      onOffline: () => () => {},
    });

    const result = await sync.syncAll();
    expect(result.failed).toEqual(['offline_perm_1']);
    await vi.advanceTimersByTimeAsync(25);
    expect(pending.retryCount).toBe(1);
  });
});
