import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OPFSStore } from '../src/offline/opfs-store.js';
import { OfflineSync, shouldUseOfflineMode, generateOfflineSessionId } from '../src/offline/sync.js';
import type { PendingUpload } from '../src/offline/opfs-store.js';
import type { ConnectivityChecker, UploadClient } from '../src/offline/sync.js';

// Mock OPFS API
class MockFileSystemDirectoryHandle {
  private entries = new Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.entries.has(name)) {
      if (options?.create) {
        const dir = new MockFileSystemDirectoryHandle();
        this.entries.set(name, dir);
        return dir;
      }
      throw new Error(`Directory ${name} not found`);
    }
    const entry = this.entries.get(name)!;
    if (!(entry instanceof MockFileSystemDirectoryHandle)) {
      throw new Error(`${name} is not a directory`);
    }
    return entry;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.entries.has(name)) {
      if (options?.create) {
        const file = new MockFileSystemFileHandle();
        this.entries.set(name, file);
        return file;
      }
      throw new Error(`File ${name} not found`);
    }
    const entry = this.entries.get(name)!;
    if (!(entry instanceof MockFileSystemFileHandle)) {
      throw new Error(`${name} is not a file`);
    }
    return entry;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }) {
    void options;
    this.entries.delete(name);
  }

  async *values() {
    for (const [name, entry] of this.entries.entries()) {
      yield {
        name,
        kind: entry instanceof MockFileSystemDirectoryHandle ? 'directory' : 'file',
      };
    }
  }
}

class MockFileSystemFileHandle {
  private content: ArrayBuffer | string = new ArrayBuffer(0);

  async createWritable() {
    return {
      write: async (data: ArrayBuffer | string) => {
        this.content = data;
      },
      close: async () => {},
    };
  }

  async getFile() {
    return {
      arrayBuffer: async () => {
        if (typeof this.content === 'string') {
          return new TextEncoder().encode(this.content).buffer;
        }
        return this.content;
      },
      text: async () => {
        if (typeof this.content === 'string') {
          return this.content;
        }
        return new TextDecoder().decode(this.content);
      },
    };
  }
}

describe('OPFSStore', () => {
  let mockRoot: MockFileSystemDirectoryHandle;

  beforeEach(() => {
    mockRoot = new MockFileSystemDirectoryHandle();

    // Mock navigator.storage
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => mockRoot,
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:pending-local'),
    });
  });

  describe('TV-CLIENT-OFFLINE-NEG-001: OPFS unavailable', () => {
    it('should detect when OPFS is not supported', () => {
      vi.stubGlobal('navigator', undefined);

      const isSupported = OPFSStore.isSupported();
      expect(isSupported).toBe(false);

      // Restore for other tests
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: async () => mockRoot,
        },
      });
    });

    it('should throw error when initializing without OPFS support', async () => {
      vi.stubGlobal('navigator', undefined);

      const store = new OPFSStore();

      await expect(store.init()).rejects.toThrow('OPFS is not supported');

      // Restore for other tests
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: async () => mockRoot,
        },
      });
    });

    it('should throw FILEFN_OFFLINE_UNSUPPORTED equivalent error', async () => {
      vi.stubGlobal('navigator', undefined);

      const store = new OPFSStore();

      try {
        await store.init();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('OPFS is not supported');
      }

      // Restore for other tests
      vi.stubGlobal('navigator', {
        storage: {
          getDirectory: async () => mockRoot,
        },
      });
    });
  });

  describe('TV-CLIENT-OFFLINE-001: Staging and syncing', () => {
    it('should stage pending upload in OPFS', async () => {
      const store = new OPFSStore();
      await store.init();

      const testData = new TextEncoder().encode('Test file content');
      const pendingUpload: PendingUpload = {
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'test.txt',
        size: testData.length,
        mimeType: 'text/plain',
        fileData: testData.buffer,
        metadata: { userId: 'user_123' },
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      await store.stagePendingUpload(pendingUpload);

      const retrieved = await store.getPendingUpload('offline_001');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.uploadSessionId).toBe('offline_001');
      expect(retrieved!.policy).toBe('test-policy');
      expect(retrieved!.fileName).toBe('test.txt');
      expect(retrieved!.size).toBe(testData.length);
      expect(retrieved!.mimeType).toBe('text/plain');
      expect(new Uint8Array(retrieved!.fileData)).toEqual(testData);
      expect(retrieved!.fileId).toBe('offline_001');
      expect(retrieved!.localSource).toMatchObject({
        mode: 'local-object-url',
        previewBehavior: 'download-only',
      });
    });

    it('TV-CLIENT-002: should resolve a pending-local descriptor by fileId', async () => {
      const store = new OPFSStore();
      await store.init();

      await store.stagePendingUpload({
        uploadSessionId: 'offline_img_001',
        fileId: 'file_local_img',
        policy: 'images',
        fileName: 'photo.jpg',
        size: 12,
        mimeType: 'image/jpeg',
        fileData: new TextEncoder().encode('image-bytes').buffer,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      const descriptor = await store.getPendingLocalDescriptor('file_local_img');

      expect(descriptor).toEqual({
        fileId: 'file_local_img',
        uploadSessionId: 'offline_img_001',
        state: 'pending-local',
        source: expect.objectContaining({
          mode: 'local-object-url',
          kind: 'image',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          previewBehavior: 'direct-image',
          url: 'blob:pending-local',
        }),
      });
    });

    it('prefers the newest pending upload when a fileId is reused', async () => {
      const store = new OPFSStore();
      await store.init();

      await store.stagePendingUpload({
        uploadSessionId: 'offline_old_001',
        fileId: 'file_reused',
        policy: 'images',
        fileName: 'older.jpg',
        size: 12,
        mimeType: 'image/jpeg',
        fileData: new TextEncoder().encode('old').buffer,
        createdAt: '2026-04-02T10:00:00.000Z',
        retryCount: 0,
      });
      await store.stagePendingUpload({
        uploadSessionId: 'offline_new_001',
        fileId: 'file_reused',
        policy: 'images',
        fileName: 'newer.jpg',
        size: 12,
        mimeType: 'image/jpeg',
        fileData: new TextEncoder().encode('new').buffer,
        createdAt: '2026-04-02T11:00:00.000Z',
        retryCount: 0,
      });

      const descriptor = await store.getPendingLocalDescriptor('file_reused');

      expect(descriptor?.uploadSessionId).toBe('offline_new_001');
      expect(descriptor?.source.fileName).toBe('newer.jpg');
    });

    it('should list all pending uploads', async () => {
      const store = new OPFSStore();
      await store.init();

      const uploads = [
        { uploadSessionId: 'offline_001', policy: 'p1', fileName: 'f1.txt', size: 10, mimeType: 'text/plain', fileData: new ArrayBuffer(10), createdAt: new Date().toISOString(), retryCount: 0 },
        { uploadSessionId: 'offline_002', policy: 'p2', fileName: 'f2.txt', size: 20, mimeType: 'text/plain', fileData: new ArrayBuffer(20), createdAt: new Date().toISOString(), retryCount: 0 },
        { uploadSessionId: 'offline_003', policy: 'p3', fileName: 'f3.txt', size: 30, mimeType: 'text/plain', fileData: new ArrayBuffer(30), createdAt: new Date().toISOString(), retryCount: 0 },
      ];

      for (const upload of uploads) {
        await store.stagePendingUpload(upload);
      }

      const list = await store.listPendingUploads();

      expect(list).toHaveLength(3);
      expect(list).toContain('offline_001');
      expect(list).toContain('offline_002');
      expect(list).toContain('offline_003');
    });

    it('should delete pending upload after successful sync', async () => {
      const store = new OPFSStore();
      await store.init();

      const pendingUpload: PendingUpload = {
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'test.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      await store.stagePendingUpload(pendingUpload);

      let retrieved = await store.getPendingUpload('offline_001');
      expect(retrieved).not.toBeNull();

      await store.deletePendingUpload('offline_001');

      retrieved = await store.getPendingUpload('offline_001');
      expect(retrieved).toBeNull();
    });

    it('should increment retry count', async () => {
      const store = new OPFSStore();
      await store.init();

      const pendingUpload: PendingUpload = {
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'test.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      await store.stagePendingUpload(pendingUpload);

      await store.incrementRetryCount('offline_001');

      const retrieved = await store.getPendingUpload('offline_001');
      expect(retrieved!.retryCount).toBe(1);

      await store.incrementRetryCount('offline_001');

      const retrieved2 = await store.getPendingUpload('offline_001');
      expect(retrieved2!.retryCount).toBe(2);
    });

    it('cleans up partial staging directories when metadata write fails', async () => {
      const store = new OPFSStore();
      await store.init();

      const rootDir = (store as any).rootDir;
      const originalGetDirectoryHandle = rootDir.getDirectoryHandle.bind(rootDir);
      rootDir.getDirectoryHandle = async (name: string, options?: { create?: boolean }) => {
        const dir = await originalGetDirectoryHandle(name, options);
        const originalGetFileHandle = dir.getFileHandle.bind(dir);
        dir.getFileHandle = async (fileName: string, fileOptions?: { create?: boolean }) => {
          const handle = await originalGetFileHandle(fileName, fileOptions);
          if (fileName === 'metadata.json') {
            return {
              async createWritable() {
                return {
                  write: async () => {
                    throw new Error('metadata write failed');
                  },
                  close: async () => {},
                };
              },
            };
          }
          return handle;
        };
        return dir;
      };

      const pendingUpload: PendingUpload = {
        uploadSessionId: 'offline_partial_001',
        policy: 'test-policy',
        fileName: 'test.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      await expect(store.stagePendingUpload(pendingUpload)).rejects.toThrow('metadata write failed');
      expect(await store.listPendingUploads()).toEqual([]);
    });

    it('should calculate total size of pending uploads', async () => {
      const store = new OPFSStore();
      await store.init();

      await store.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'p',
        fileName: 'f1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      await store.stagePendingUpload({
        uploadSessionId: 'offline_002',
        policy: 'p',
        fileName: 'f2.txt',
        size: 250,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(250),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      const totalSize = await store.getTotalSize();
      expect(totalSize).toBe(350);
    });

    it('should clear all pending uploads', async () => {
      const store = new OPFSStore();
      await store.init();

      await store.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'p',
        fileName: 'f1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      await store.stagePendingUpload({
        uploadSessionId: 'offline_002',
        policy: 'p',
        fileName: 'f2.txt',
        size: 200,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(200),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      let list = await store.listPendingUploads();
      expect(list).toHaveLength(2);

      await store.clearAll();

      list = await store.listPendingUploads();
      expect(list).toHaveLength(0);
    });
  });
});

describe('OfflineSync', () => {
  let mockStore: OPFSStore;
  let mockClient: UploadClient;
  let mockConnectivityChecker: ConnectivityChecker;

  beforeEach(() => {
    const mockRoot = new MockFileSystemDirectoryHandle();

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => mockRoot,
      },
      onLine: true,
    });

    mockStore = new OPFSStore();

    mockClient = {
      uploadFile: vi.fn().mockResolvedValue({ fileId: 'file_001', versionId: 'ver_001' }),
    };

    mockConnectivityChecker = {
      isOnline: () => true,
      onOnline: vi.fn(),
      onOffline: vi.fn(),
    };
  });

  describe('Sync functionality', () => {
    it('should sync all pending uploads when online', async () => {
      await mockStore.init();

      // Stage some uploads
      await mockStore.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'file1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new TextEncoder().encode('File 1 content').buffer,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      await mockStore.stagePendingUpload({
        uploadSessionId: 'offline_002',
        policy: 'test-policy',
        fileName: 'file2.txt',
        size: 200,
        mimeType: 'text/plain',
        fileData: new TextEncoder().encode('File 2 content').buffer,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      const sync = new OfflineSync({
        store: mockStore,
        client: mockClient,
      });

      sync.setConnectivityChecker(mockConnectivityChecker);

      const result = await sync.syncAll();

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);

      // Verify uploads were called
      expect(mockClient.uploadFile).toHaveBeenCalledTimes(2);

      // Verify uploads were deleted
      const remainingUploads = await mockStore.listPendingUploads();
      expect(remainingUploads).toHaveLength(0);
    });

    it('should handle failed uploads and increment retry count', async () => {
      await mockStore.init();

      await mockStore.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'file1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new TextEncoder().encode('File content').buffer,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      // Mock client to fail
      const failingClient: UploadClient = {
        uploadFile: vi.fn().mockRejectedValue(new Error('Upload failed')),
      };

      const sync = new OfflineSync({
        store: mockStore,
        client: failingClient,
      });

      sync.setConnectivityChecker(mockConnectivityChecker);

      const result = await sync.syncAll();

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.totalProcessed).toBe(1);

      // Verify retry count was incremented
      const upload = await mockStore.getPendingUpload('offline_001');
      expect(upload!.retryCount).toBe(1);
    });

    it('should respect max retries limit', async () => {
      await mockStore.init();

      await mockStore.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'file1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new TextEncoder().encode('File content').buffer,
        createdAt: new Date().toISOString(),
        retryCount: 3, // Already at max
      });

      const sync = new OfflineSync({
        store: mockStore,
        client: mockClient,
        maxRetries: 3,
      });

      sync.setConnectivityChecker(mockConnectivityChecker);

      const result = await sync.syncAll();

      expect(result.failed).toHaveLength(1);
      expect(mockClient.uploadFile).not.toHaveBeenCalled();
    });

    it('should call progress callbacks', async () => {
      await mockStore.init();

      await mockStore.stagePendingUpload({
        uploadSessionId: 'offline_001',
        policy: 'test-policy',
        fileName: 'file1.txt',
        size: 100,
        mimeType: 'text/plain',
        fileData: new ArrayBuffer(100),
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });

      const onProgress = vi.fn();
      const onComplete = vi.fn();

      const sync = new OfflineSync({
        store: mockStore,
        client: mockClient,
        onSyncProgress: onProgress,
        onSyncComplete: onComplete,
      });

      sync.setConnectivityChecker(mockConnectivityChecker);

      await sync.syncAll();

      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          succeeded: ['offline_001'],
          failed: [],
          totalProcessed: 1,
        })
      );
    });

    it('should throw when trying to sync while offline', async () => {
      const offlineChecker: ConnectivityChecker = {
        isOnline: () => false,
        onOnline: vi.fn(),
        onOffline: vi.fn(),
      };

      const sync = new OfflineSync({
        store: mockStore,
        client: mockClient,
      });

      sync.setConnectivityChecker(offlineChecker);

      await expect(sync.syncAll()).rejects.toThrow('Cannot sync while offline');
    });
  });
});

describe('Offline helpers', () => {
  it('should detect when offline mode is needed', () => {
    vi.stubGlobal('navigator', { onLine: false });

    const shouldUse = shouldUseOfflineMode(true);
    expect(shouldUse).toBe(true);
  });

  it('should not use offline mode when disabled', () => {
    vi.stubGlobal('navigator', { onLine: false });

    const shouldUse = shouldUseOfflineMode(false);
    expect(shouldUse).toBe(false);
  });

  it('should generate unique offline session IDs', () => {
    const id1 = generateOfflineSessionId();
    const id2 = generateOfflineSessionId();

    expect(id1).toMatch(/^offline_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^offline_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});
