import type { OPFSStore, PendingUpload } from './opfs-store.js';
import { isRetryableError } from '../retry.js';

export interface UploadClient {
  uploadFile(input: {
    policy: string;
    file: File;
    metadata?: Record<string, unknown>;
    fileId?: string;
    idempotencyKey?: string;
    signal?: AbortSignal;
  }): Promise<{ fileId: string; versionId: string }>;
}

export interface SyncConfig {
  store: OPFSStore;
  client: UploadClient;
  maxRetries?: number;
  retryDelayMs?: number;
  onSyncProgress?: (progress: SyncProgress) => void;
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error, uploadSessionId: string) => void;
}

export interface SyncProgress {
  totalPending: number;
  completed: number;
  failed: number;
  current: string | null;
}

export interface SyncResult {
  succeeded: string[];
  failed: string[];
  totalProcessed: number;
}

export interface ConnectivityChecker {
  isOnline(): boolean;
  onOnline(callback: () => void): () => void;
  onOffline(callback: () => void): () => void;
}

type UploadCompletionListener = (result: { fileId: string; versionId: string } | Error) => void;

export class OfflineSync {
  private static readonly SETTLED_RESULT_TTL_MS = 5 * 60 * 1000;
  private config: Required<SyncConfig>;
  private isSyncing = false;
  private connectivityChecker: ConnectivityChecker;
  private listeners: Map<string, UploadCompletionListener[]> = new Map();
  private settledResults: Map<string, { fileId: string; versionId: string } | Error> = new Map();
  private settledResultTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private stopOnlineListener?: () => void;
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private cancelledUploads: Set<string> = new Set();
  private activeSyncControllers: Map<string, AbortController> = new Map();
  private inFlightSyncs: Map<string, Promise<{ fileId: string; versionId: string }>> = new Map();

  constructor(config: SyncConfig) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      onSyncProgress: () => {},
      onSyncComplete: () => {},
      onSyncError: () => {},
      ...config,
    };

    // Default connectivity checker using browser APIs
    this.connectivityChecker = this.createDefaultConnectivityChecker();
  }

  /**
   * Start listening for online events and automatically sync when online.
   */
  startAutoSync(): void {
    this.stopAutoSync();
    this.stopOnlineListener = this.connectivityChecker.onOnline(() => {
      void this.syncAll().catch(() => {});
    });
    if (this.connectivityChecker.isOnline()) {
      void this.syncAll().catch(() => {});
    }
  }

  /**
   * Stop listening for online events.
   */
  stopAutoSync(): void {
    this.stopOnlineListener?.();
    this.stopOnlineListener = undefined;
  }

  /**
   * Check if currently online.
   */
  isOnline(): boolean {
    return this.connectivityChecker.isOnline();
  }

  /**
   * Register a listener for a specific upload session completion.
   */
  waitForUpload(uploadSessionId: string): Promise<{ fileId: string; versionId: string }> {
    const settled = this.settledResults.get(uploadSessionId);
    if (settled) {
      if (settled instanceof Error) {
        return Promise.reject(settled);
      }
      return Promise.resolve(settled);
    }

    return new Promise((resolve, reject) => {
      if (!this.listeners.has(uploadSessionId)) {
        this.listeners.set(uploadSessionId, []);
      }
      this.listeners.get(uploadSessionId)!.push((result) => {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      });
    });
  }

  private notifyListeners(uploadSessionId: string, result: { fileId: string; versionId: string } | Error) {
    this.clearRetry(uploadSessionId);
    this.clearSettledResult(uploadSessionId);
    this.settledResults.set(uploadSessionId, result);
    const expiry = setTimeout(() => {
      this.clearSettledResult(uploadSessionId);
      this.settledResults.delete(uploadSessionId);
    }, OfflineSync.SETTLED_RESULT_TTL_MS);
    this.settledResultTimers.set(uploadSessionId, expiry);
    const listeners = this.listeners.get(uploadSessionId);
    if (listeners) {
      listeners.forEach(l => l(result));
      this.listeners.delete(uploadSessionId);
    }
  }

  /**
   * Sync all pending uploads.
   */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      // Return a promise that resolves when current sync finishes? 
      // For simplicity, throw or ignore.
      return { succeeded: [], failed: [], totalProcessed: 0 };
    }

    if (!this.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    this.isSyncing = true;

    try {
      const pendingSessionIds = await this.config.store.listPendingUploads();

      const result: SyncResult = {
        succeeded: [],
        failed: [],
        totalProcessed: 0,
      };

      const progress: SyncProgress = {
        totalPending: pendingSessionIds.length,
        completed: 0,
        failed: 0,
        current: null,
      };

      for (const uploadSessionId of pendingSessionIds) {
        if (this.cancelledUploads.has(uploadSessionId)) {
          await this.config.store.deletePendingUpload(uploadSessionId);
          continue;
        }
        progress.current = uploadSessionId;
        this.config.onSyncProgress(progress);

        try {
          const uploadResult = await this.syncOne(uploadSessionId);
          result.succeeded.push(uploadSessionId);
          progress.completed += 1;
          this.notifyListeners(uploadSessionId, uploadResult);
        } catch (error) {
          if (this.cancelledUploads.has(uploadSessionId)) {
            this.cancelledUploads.delete(uploadSessionId);
            continue;
          }
          const err = error instanceof Error ? error : new Error('Unknown error');
          result.failed.push(uploadSessionId);
          progress.failed += 1;
          this.config.onSyncError(err, uploadSessionId);

          // Check if we should notify listeners of failure (max retries reached)
          const pending = await this.config.store.getPendingUpload(uploadSessionId);
          if (pending && pending.retryCount >= this.config.maxRetries) {
            this.notifyListeners(uploadSessionId, err);
          } else if (pending && this.isOnline() && isRetryableError(err)) {
            this.scheduleRetry(uploadSessionId);
          } else {
            this.notifyListeners(uploadSessionId, err);
          }
        }

        result.totalProcessed += 1;
        this.config.onSyncProgress(progress);
      }

      progress.current = null;
      this.config.onSyncComplete(result);

      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single pending upload.
   */
  async syncOne(uploadSessionId: string): Promise<{ fileId: string; versionId: string }> {
    const existing = this.inFlightSyncs.get(uploadSessionId);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      const pendingUpload = await this.config.store.getPendingUpload(uploadSessionId);

      if (!pendingUpload) {
        throw new Error(`Pending upload ${uploadSessionId} not found`);
      }

      if (pendingUpload.retryCount >= this.config.maxRetries) {
        throw new Error(`Max retries exceeded for ${uploadSessionId}`);
      }

      try {
        const controller = new AbortController();
        this.activeSyncControllers.set(uploadSessionId, controller);
        const file = new File([pendingUpload.fileData], pendingUpload.fileName, {
          type: pendingUpload.mimeType,
        });

        const result = await this.config.client.uploadFile({
          policy: pendingUpload.policy,
          file,
          metadata: pendingUpload.metadata,
          fileId: pendingUpload.fileId,
          idempotencyKey: pendingUpload.idempotencyKey,
          signal: controller.signal,
        });

        await this.config.store.deletePendingUpload(uploadSessionId);
        return result;
      } catch (error) {
        if (this.cancelledUploads.has(uploadSessionId) || (error instanceof DOMException && error.name === 'AbortError')) {
          throw error;
        }
        await this.config.store.incrementRetryCount(uploadSessionId);
        throw error;
      } finally {
        this.activeSyncControllers.delete(uploadSessionId);
      }
    })();

    this.inFlightSyncs.set(uploadSessionId, task);
    try {
      return await task;
    } finally {
      if (this.inFlightSyncs.get(uploadSessionId) === task) {
        this.inFlightSyncs.delete(uploadSessionId);
      }
    }
  }

  /**
   * Manually trigger sync for a specific upload.
   */
  async syncUpload(uploadSessionId: string): Promise<void> {
    if (this.cancelledUploads.has(uploadSessionId)) {
      return;
    }
    if (!this.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    try {
      const result = await this.syncOne(uploadSessionId);
      this.notifyListeners(uploadSessionId, result);
    } catch (error) {
      if (this.cancelledUploads.has(uploadSessionId)) {
        this.cancelledUploads.delete(uploadSessionId);
        return;
      }
      const err = error instanceof Error ? error : new Error('Unknown error');
      const pending = await this.config.store.getPendingUpload(uploadSessionId);
      if (pending && pending.retryCount >= this.config.maxRetries) {
        this.notifyListeners(uploadSessionId, err);
        return;
      }
      if (pending && this.isOnline() && isRetryableError(err)) {
        this.scheduleRetry(uploadSessionId);
        return;
      }
      this.notifyListeners(uploadSessionId, err);
    }
  }

  /**
   * Set a custom connectivity checker.
   */
  setConnectivityChecker(checker: ConnectivityChecker): void {
    this.connectivityChecker = checker;
  }

  async cancelUpload(uploadSessionId: string, reason: Error = new DOMException('Aborted', 'AbortError')): Promise<void> {
    this.cancelledUploads.add(uploadSessionId);
    this.clearRetry(uploadSessionId);
    this.activeSyncControllers.get(uploadSessionId)?.abort();
    this.notifyListeners(uploadSessionId, reason);
    await this.config.store.deletePendingUpload(uploadSessionId);
  }

  private scheduleRetry(uploadSessionId: string): void {
    if (this.retryTimers.has(uploadSessionId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.retryTimers.delete(uploadSessionId);
      void this.syncUpload(uploadSessionId).catch((error) => {
        const err = error instanceof Error ? error : new Error('Unknown error');
        this.config.onSyncError(err, uploadSessionId);
      });
    }, this.config.retryDelayMs);
    this.retryTimers.set(uploadSessionId, timer);
  }

  private clearRetry(uploadSessionId: string): void {
    const timer = this.retryTimers.get(uploadSessionId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.retryTimers.delete(uploadSessionId);
  }

  private clearSettledResult(uploadSessionId: string): void {
    const timer = this.settledResultTimers.get(uploadSessionId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.settledResultTimers.delete(uploadSessionId);
  }

  private createDefaultConnectivityChecker(): ConnectivityChecker {
    return {
      isOnline: () => {
        if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
          return navigator.onLine;
        }
        return true; // Assume online if can't detect
      },
      onOnline: (callback: () => void) => {
        if (typeof window !== 'undefined') {
          window.addEventListener('online', callback);
        }
        return () => {
          if (typeof window !== 'undefined') {
            window.removeEventListener('online', callback);
          }
        };
      },
      onOffline: (callback: () => void) => {
        if (typeof window !== 'undefined') {
          window.addEventListener('offline', callback);
        }
        return () => {
          if (typeof window !== 'undefined') {
            window.removeEventListener('offline', callback);
          }
        };
      },
    };
  }
}

/**
 * Check if offline mode is currently needed.
 */
export function shouldUseOfflineMode(isOfflineEnabled: boolean): boolean {
  if (!isOfflineEnabled) return false;

  // Check if online
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return !navigator.onLine;
  }

  return false;
}

/**
 * Generate a unique upload session ID for offline staging.
 */
export function generateOfflineSessionId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
