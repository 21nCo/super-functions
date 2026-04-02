import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProcessingService, type Processor } from '../src/processing/service.js';
import type { StorageAdapter } from '@superfunctions/storage';
import type { Adapter } from '@superfunctions/db';
import { createEventEmitter } from '../src/events.js';

function createMockDb(): Adapter {
  const storage = new Map<string, Map<string, unknown>>();

  return {
    async create({ model, data, namespace }) {
      const key = `${namespace}:${model}`;
      if (!storage.has(key)) storage.set(key, new Map());
      const id = (data as any).artifactId || (data as any).fileId || Math.random().toString();
      storage.get(key)!.set(id, data);
      return data;
    },
    async findOne({ model, where, namespace }) {
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return null;
      for (const record of records.values()) {
        const match = where.every((w: any) => (record as any)[w.field] === w.value);
        if (match) return record as any;
      }
      return null;
    },
    async findMany({ model, namespace }) {
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return [];
      return Array.from(records.values()) as any[];
    },
    async update() { return {} as any; },
    async upsert() { return {} as any; },
    async delete() {},
    async deleteMany() {},
    getDialect() { return 'sqlite' as any; },
    isReady() { return Promise.resolve(true); },
    close() { return Promise.resolve(); },
  } as Adapter;
}

function createMockStorage(): StorageAdapter {
  const objects = new Map<string, Uint8Array>();

  return {
    name: 'mock',
    capabilities: {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: true,
      proxyStreamingDownload: true,
    },
    async statObject({ key }) {
      const data = objects.get(key);
      if (!data) throw new Error('Not found');
      return { key, size: data.length };
    },
    async deleteObject({ key }) {
      objects.delete(key);
    },
    async signDownloadUrl({ key }) {
      return { url: `https://storage.test/download/${key}` };
    },
    async openDownloadStream({ key }) {
      const data = objects.get(key);
      if (!data) throw new Error('Not found');
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
    async openUploadStream({ key }) {
      const chunks: Uint8Array[] = [];
      return new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
        close() {
          const total = chunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          objects.set(key, merged);
        },
      });
    },
    setData(key: string, data: Uint8Array) {
      objects.set(key, data);
    },
  } as StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
}

function createMockProcessor(name: string, mimeTypes: string[]): Processor {
  return {
    name,
    supportedMimeTypes: mimeTypes,
    async process(input, getData) {
      const data = await getData();
      return {
        success: true,
        artifacts: [
          {
            kind: `${name}-output`,
            data: new Uint8Array([...data.slice(0, 10), 1, 2, 3]),
            mimeType: 'application/octet-stream',
            storageKey: `${input.storageKey}.${name}`,
          },
        ],
      };
    },
  };
}

describe('ProcessingService Integration', () => {
  let db: Adapter;
  let storage: StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    events = createEventEmitter();
  });

  describe('TV-PROCESS-001: Processing triggered after upload', () => {
    it('should trigger processing and create artifacts', async () => {
      const processor = createMockProcessor('test', ['image/png']);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      storage.setData('test/image.png', testData);

      const processingStarted = vi.fn();
      events.on('processing.started', processingStarted);

      const result = await service.triggerProcessing(
        {
          fileId: 'file_0001',
          versionId: 'ver_0001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: testData.length,
          fileName: 'image.png',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(processingStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'processing.started',
          fileId: 'file_0001',
          versionId: 'ver_0001',
        })
      );

      await vi.waitFor(async () => {
        const artifacts = await service.listArtifacts('file_0001', {});
        expect(artifacts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('TV-PROCESS-NEG-001: Processing disabled', () => {
    it('should not trigger processing when disabled', async () => {
      const processor = createMockProcessor('test', ['image/png']);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: false,
      });

      const processingStarted = vi.fn();
      events.on('processing.started', processingStarted);

      const result = await service.triggerProcessing(
        {
          fileId: 'file_0001',
          versionId: 'ver_0001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'image.png',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(result.enqueued).toBe(false);
      expect(processingStarted).not.toHaveBeenCalled();
    });

    it('should not trigger processing when no processors configured', async () => {
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [],
        enabled: true,
      });

      const result = await service.triggerProcessing(
        {
          fileId: 'file_0001',
          versionId: 'ver_0001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'image.png',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(result.enqueued).toBe(false);
    });
  });

  describe('TV-PROCESS-FLOW-001: FlowFn integration', () => {
    it('should enqueue processing via FlowFn when provided', async () => {
      const processor = createMockProcessor('test', ['image/png']);
      const mockQueueAdd = vi.fn().mockResolvedValue({ jobId: 'job_001' });
      const mockFlowFn = {
        getQueue: vi.fn().mockReturnValue({
          name: 'filefn.processing',
          add: mockQueueAdd,
        }),
      };

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        flowFn: mockFlowFn,
        enabled: true,
      });

      const result = await service.triggerProcessing(
        {
          fileId: 'file_0001',
          versionId: 'ver_0001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'image.png',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('job_001');
      expect(mockFlowFn.getQueue).toHaveBeenCalledWith('filefn.processing');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file_0001',
          versionId: 'ver_0001',
          idempotencyKey: 'processing:file_0001:ver_0001:test',
        })
      );
    });

    it('should throw FILEFN_PROCESSING_ENQUEUE_FAILED on queue error', async () => {
      const processor = createMockProcessor('test', ['image/png']);
      const mockFlowFn = {
        getQueue: vi.fn().mockReturnValue({
          name: 'filefn.processing',
          add: vi.fn().mockRejectedValue(new Error('Queue error')),
        }),
      };

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        flowFn: mockFlowFn,
        enabled: true,
      });

      await expect(
        service.triggerProcessing(
          {
            fileId: 'file_0001',
            versionId: 'ver_0001',
            storageKey: 'test/image.png',
            mimeType: 'image/png',
            size: 1000,
            fileName: 'image.png',
          },
          { principalId: 'user_123', requestId: 'req_001' }
        )
      ).rejects.toMatchObject({ code: 'FILEFN_PROCESSING_ENQUEUE_FAILED' });
    });
  });

  describe('Artifact management', () => {
    it('should list artifacts for a file', async () => {
      await db.create({
        model: 'fileArtifacts',
        data: {
          artifactId: 'art_001',
          fileId: 'file_0001',
          versionId: 'ver_0001',
          kind: 'thumbnail-small',
          storageKey: 'test/thumb.jpg',
          mimeType: 'image/jpeg',
          size: 1000,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [],
        enabled: false,
      });

      const artifacts = await service.listArtifacts('file_0001', {});

      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].artifactId).toBe('art_001');
      expect(artifacts[0].kind).toBe('thumbnail-small');
    });

    it('should get artifact download URL', async () => {
      await db.create({
        model: 'fileArtifacts',
        data: {
          artifactId: 'art_001',
          fileId: 'file_0001',
          versionId: 'ver_0001',
          kind: 'thumbnail-small',
          storageKey: 'test/thumb.jpg',
          mimeType: 'image/jpeg',
          size: 1000,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [],
        enabled: false,
      });

      const { url } = await service.getArtifactDownloadUrl('art_001', {});

      expect(url).toBe('https://storage.test/download/test/thumb.jpg');
    });

    it('should throw not found for missing artifact', async () => {
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [],
        enabled: false,
      });

      await expect(
        service.getArtifactDownloadUrl('nonexistent', {})
      ).rejects.toThrow('not found');
    });
  });
});
