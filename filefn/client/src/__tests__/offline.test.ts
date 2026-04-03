import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileFnClient } from '../index.js';
import { OPFSStore } from '../offline/opfs-store.js';

// Mock mocks
const stagedUploads = new Map();
const mockUploadFile = vi.fn().mockResolvedValue({ fileId: 'f1', versionId: 'v1' });
let lastInitFileId: string | undefined;
let lastInitIdempotencyKey: string | undefined;

// Mock HttpClient
vi.mock('../client.js', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        createHttpClient: () => ({
            // But used by sync
            // The upload manager uses http client.
            // We can mock the upload manager or http client.
            // The sync logic calls manager.startUpload -> http.initUpload etc.
            // But we mocked UploadManager in sync? No, we mocked UploadClient in SyncConfig.
            // In index.ts, we create OfflineSync with a client that uses UploadManager.
            // So we need to mock HttpClient methods that UploadManager calls.
            initUpload: vi.fn().mockImplementation(async (params: { fileId?: string }) => {
                lastInitFileId = params.fileId;
                lastInitIdempotencyKey = (params as { idempotencyKey?: string }).idempotencyKey;
                return {
                    uploadSessionId: 'upl_real', totalParts: 1, chunkSizeBytes: 100
                };
            }),
            signPart: vi.fn().mockResolvedValue({ url: 'http://upload' }),
            uploadPartToSignedUrl: vi.fn().mockResolvedValue({ recorded: true }),
            completeUpload: vi.fn().mockImplementation(async () => ({ fileId: lastInitFileId || 'f1', versionId: 'v1' })),
            getRenderDescriptor: vi.fn().mockImplementation(async (fileId: string, options: { intent: string; versionId?: string }) => ({
                fileId,
                versionId: options.versionId ?? 'ver_remote',
                intent: options.intent,
                state: 'ready',
                mimeType: 'application/pdf',
                name: 'remote.pdf',
                size: 10,
                source: {
                    mode: 'artifact',
                    artifactId: 'art_remote',
                    artifactKind: 'pdf-preview-page-1-large',
                    url: '/remote/artifact'
                }
            })),
        })
    };
});

// Mock OPFSStore
vi.mock('../offline/opfs-store.js', () => {
  return {
    OPFSStore: class {
      constructor() {}
      static isSupported = vi.fn().mockReturnValue(true);
      async init() {}
      async stagePendingUpload(u: any) { stagedUploads.set(u.uploadSessionId, u); }
      async getPendingUpload(id: string) { return stagedUploads.get(id); }
      async getPendingUploadByFileId(fileId: string) {
        return Array.from(stagedUploads.values()).find((upload: any) => upload.fileId === fileId) || null;
      }
      async getPendingLocalDescriptor(fileId: string) {
        const upload = Array.from(stagedUploads.values()).find((entry: any) => entry.fileId === fileId);
        if (!upload) return null;
        return {
          fileId: upload.fileId,
          uploadSessionId: upload.uploadSessionId,
          state: 'pending-local',
          source: {
            ...upload.localSource,
            url: `blob:${fileId}`,
          },
        };
      }
      async listPendingUploads() { return Array.from(stagedUploads.keys()); }
      async deletePendingUpload(id: string) { stagedUploads.delete(id); }
      async incrementRetryCount() {}
    }
  };
});

describe('Offline Client', () => {
  let onlineCallback: (() => void) | undefined;

  beforeEach(() => {
    stagedUploads.clear();
    mockUploadFile.mockClear();
    lastInitFileId = undefined;
    lastInitIdempotencyKey = undefined;
    
    // Mock navigator
    if (typeof navigator === 'undefined') {
        global.navigator = {} as any;
    }
    Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
    });

    // Mock window events
    if (typeof window === 'undefined') {
        global.window = {
            addEventListener: vi.fn((event, cb) => {
                if (event === 'online') onlineCallback = cb;
            }),
            removeEventListener: vi.fn((event, cb) => {
                if (event === 'online' && onlineCallback === cb) onlineCallback = undefined;
            }),
        } as any;
    } else {
        vi.spyOn(window, 'addEventListener').mockImplementation((event, cb) => {
            if (event === 'online') onlineCallback = cb as any;
        });
        vi.spyOn(window, 'removeEventListener').mockImplementation((event, cb) => {
            if (event === 'online' && onlineCallback === cb) onlineCallback = undefined;
        });
    }
  });

  afterEach(() => {
    onlineCallback = undefined;
    vi.clearAllMocks();
  });

  it('TV-CLIENT-OFFLINE-001: should stage when offline and sync when online', async () => {
    // Go offline
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
        baseUrl: 'http://test',
        offline: { enabled: true }
    });

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const handle = client.uploadFile({ policy: 'p', file });

    // Wait for done() - it should block until sync
    const donePromise = handle.done();

    // Wait for staging (microtasks)
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify staged
    expect(stagedUploads.size).toBe(1);
    expect(stagedUploads.values().next().value.fileName).toBe('test.txt');
    expect(stagedUploads.values().next().value.fileId).toBe(handle.fileId);

    // Go online and trigger sync
    Object.defineProperty(navigator, 'onLine', { value: true });
    if (onlineCallback) await onlineCallback();

    // Wait for done to resolve
    const result = await donePromise;

    expect(result.fileId).toBe(handle.fileId);
    expect(stagedUploads.size).toBe(0);
  });

  it('syncs immediately after staging if connectivity already returned', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const handle = client.uploadFile({ policy: 'p', file });
    const donePromise = handle.done();

    Object.defineProperty(navigator, 'onLine', { value: true });
    const result = await donePromise;

    expect(result.fileId).toBe(handle.fileId);
    expect(stagedUploads.size).toBe(0);
  });

  it('persists idempotency keys through offline replay', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const handle = client.uploadFile({
      policy: 'p',
      file,
      idempotencyKey: 'idem_001',
    });

    const donePromise = handle.done();
    await new Promise(resolve => setTimeout(resolve, 0));

    Object.defineProperty(navigator, 'onLine', { value: true });
    if (onlineCallback) await onlineCallback();

    await donePromise;
    expect(lastInitIdempotencyKey).toBe('idem_001');
  });

  it('TV-CLIENT-002: should expose a pending-local descriptor for staged offline files', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const handle = client.uploadFile({ policy: 'p', file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const descriptor = await client.getPendingLocalDescriptor(handle.fileId);

    expect(descriptor).toEqual({
      fileId: handle.fileId,
      uploadSessionId: handle.uploadSessionId,
      state: 'pending-local',
      source: expect.objectContaining({
        mode: 'local-object-url',
        kind: 'image',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        previewBehavior: 'direct-image',
        url: `blob:${handle.fileId}`,
      }),
    });
  });

  it('TV-VIEW-002: should prefer a pending-local PDF source when requested', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['%PDF-1.4'], 'draft.pdf', { type: 'application/pdf' });
    const handle = client.uploadFile({ policy: 'p', file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const descriptor = await client.resolveRenderable({
      fileId: handle.fileId,
      intent: 'preview',
      preferLocal: true,
    });

    expect(descriptor).toEqual({
      fileId: handle.fileId,
      versionId: handle.uploadSessionId,
      intent: 'preview',
      state: 'pending-local',
      mimeType: 'application/pdf',
      name: 'draft.pdf',
      size: file.size,
      source: {
        mode: 'placeholder',
        placeholderKind: 'pdf-processing',
      },
      warnings: ['Pending local PDF preview artifact is not available yet.'],
    });
  });

  it('uses direct-pdf preview behavior when a staged source exposes it', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['%PDF-1.4'], 'draft.pdf', { type: 'application/pdf' });
    const handle = client.uploadFile({ policy: 'p', file });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const staged = stagedUploads.get(handle.uploadSessionId);
    staged.localSource = {
      ...staged.localSource,
      kind: 'pdf',
      previewBehavior: 'direct-pdf',
    };

    const descriptor = await client.resolveRenderable({
      fileId: handle.fileId,
      intent: 'preview',
      preferLocal: true,
    });

    expect(descriptor).toEqual(expect.objectContaining({
      state: 'pending-local',
      source: {
        mode: 'original',
        url: `blob:${handle.fileId}`,
      },
    }));
  });

  it('TV-VIEW-003: should ignore pending-local sources when an explicit version is requested', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['%PDF-1.4'], 'draft.pdf', { type: 'application/pdf' });
    const handle = client.uploadFile({ policy: 'p', file });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const descriptor = await client.resolveRenderable({
      fileId: handle.fileId,
      versionId: 'ver_remote_1',
      intent: 'preview',
      preferLocal: true,
    });

    expect(descriptor.versionId).toBe('ver_remote_1');
    expect((descriptor.source as { mode: string }).mode).not.toBe('placeholder');
  });

  it('TV-CLIENT-OFFLINE-003: aborting an offline upload rejects done() and clears staged data', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const handle = client.uploadFile({ policy: 'p', file });

    const donePromise = handle.done();
    handle.abort();

    await expect(donePromise).rejects.toThrow('Aborted');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stagedUploads.size).toBe(0);
  });

  it('TV-CLIENT-OFFLINE-NEG-001: defers OPFS errors until offline staging is selected', async () => {
    // Mock OPFS unsupported
    // @ts-ignore
    OPFSStore.isSupported.mockReturnValueOnce(false);

    const client = createFileFnClient({
      baseUrl: 'http://test',
      offline: { enabled: true }
    });

    expect(client).toBeDefined();

    Object.defineProperty(navigator, 'onLine', { value: false });
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    expect(() => client.uploadFile({ policy: 'p', file })).toThrow(/OPFS unavailable/);
  });
});
