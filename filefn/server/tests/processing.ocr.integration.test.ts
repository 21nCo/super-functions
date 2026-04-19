import { describe, it, expect, beforeEach } from 'vitest';
import { createProcessingService } from '../src/processing/service.js';
import {
  createOCRProcessor,
  createImageTransformProcessor,
  type OCRConfig,
  type ImageTransformConfig,
} from '@filefn/processing';
import type { StorageAdapter } from '@superfunctions/storage';
import type { Adapter } from '@superfunctions/db';
import { createEventEmitter } from '../src/events.js';
import sharp from 'sharp';

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
    async findMany({ model, where, namespace, orderBy }) {
      void orderBy;
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return [];
      if (!where || where.length === 0) {
        return Array.from(records.values()) as any[];
      }
      const filtered = [];
      for (const record of records.values()) {
        const match = where.every((w: any) => (record as any)[w.field] === w.value);
        if (match) filtered.push(record);
      }
      return filtered as any[];
    },
    async update() {
      return {} as any;
    },
    async upsert() {
      return {} as any;
    },
    async delete() {},
    async deleteMany() {},
    getDialect() {
      return 'sqlite' as any;
    },
    isReady() {
      return Promise.resolve(true);
    },
    close() {
      return Promise.resolve();
    },
  } as Adapter;
}

function createMockStorage(): StorageAdapter & { setData: (key: string, data: Uint8Array) => void } {
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

async function createTestImage(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('OCR Processing Integration', () => {
  let db: Adapter;
  let storage: StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    events = createEventEmitter();
  });

  describe('OCR processor with server integration', () => {
    it('should process image and create OCR text artifact', async () => {
      const ocrConfig: OCRConfig = {
        language: 'eng',
        outputFormat: 'text',
      };

      const processor = createOCRProcessor(ocrConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_001/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'tenant/file_001/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'document.png',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(result.artifactsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_001', {});
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].kind).toBe('ocr-text');
      expect(artifacts[0].mimeType).toBe('text/plain');
      expect(artifacts[0].storageKey).toBe('tenant/file_001/ver_001-ocr.txt');
    }, 15000);

    it('should create multiple OCR output formats when format is "all"', async () => {
      const ocrConfig: OCRConfig = {
        language: 'eng',
        outputFormat: 'all',
      };

      const processor = createOCRProcessor(ocrConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_002/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_002',
          versionId: 'ver_001',
          storageKey: 'tenant/file_002/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'invoice.png',
        },
        { principalId: 'user_123', requestId: 'req_002' }
      );

      expect(result.artifactsCreated).toBe(3);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_002', {});
      expect(artifacts).toHaveLength(3);

      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['ocr-hocr', 'ocr-json', 'ocr-text']);

      const mimeTypes = artifacts.map((a) => a.mimeType).sort();
      expect(mimeTypes).toEqual(['application/json', 'text/html', 'text/plain']);
    }, 15000);

    it('should handle OCR for JPEG images', async () => {
      const processor = createOCRProcessor({ outputFormat: 'json' });
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(1024, 768);
      storage.setData('tenant/file_003/ver_001.jpg', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_003',
          versionId: 'ver_001',
          storageKey: 'tenant/file_003/ver_001.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'scan.jpg',
        },
        { principalId: 'user_123', requestId: 'req_003' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_003', {});
      expect(artifacts[0].kind).toBe('ocr-json');
      expect(artifacts[0].mimeType).toBe('application/json');
    }, 15000);
  });

  describe('Image Transform processor with server integration', () => {
    it('should process resize operation and create artifact', async () => {
      const transformConfig: ImageTransformConfig = {
        operations: [
          {
            operation: 'resize',
            options: { width: 400, height: 300, fit: 'cover' },
            suffix: 'medium',
          },
        ],
        outputFormat: 'jpeg',
        outputQuality: 85,
      };

      const processor = createImageTransformProcessor(transformConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(1600, 1200);
      storage.setData('tenant/file_004/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_004',
          versionId: 'ver_001',
          storageKey: 'tenant/file_004/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'photo.png',
        },
        { principalId: 'user_123', requestId: 'req_004' }
      );

      expect(result.artifactsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_004', {});
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].kind).toBe('transform-medium');
      expect(artifacts[0].mimeType).toBe('image/jpeg');
      expect(artifacts[0].storageKey).toBe('tenant/file_004/ver_001-medium.jpg');
    });

    it('should process crop operation and create artifact', async () => {
      const transformConfig: ImageTransformConfig = {
        operations: [
          {
            operation: 'crop',
            options: { left: 100, top: 50, width: 400, height: 300 },
            suffix: 'cropped',
          },
        ],
        outputFormat: 'png',
      };

      const processor = createImageTransformProcessor(transformConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_005/ver_001.jpg', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_005',
          versionId: 'ver_001',
          storageKey: 'tenant/file_005/ver_001.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'landscape.jpg',
        },
        { principalId: 'user_123', requestId: 'req_005' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_005', {});
      expect(artifacts[0].kind).toBe('transform-cropped');
      expect(artifacts[0].mimeType).toBe('image/png');
    });

    it('should process rotate operation and create artifact', async () => {
      const transformConfig: ImageTransformConfig = {
        operations: [
          {
            operation: 'rotate',
            options: { angle: 90, background: { r: 255, g: 255, b: 255 } },
            suffix: 'rotated',
          },
        ],
        outputFormat: 'jpeg',
      };

      const processor = createImageTransformProcessor(transformConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_006/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_006',
          versionId: 'ver_001',
          storageKey: 'tenant/file_006/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'portrait.png',
        },
        { principalId: 'user_123', requestId: 'req_006' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_006', {});
      expect(artifacts[0].kind).toBe('transform-rotated');
    });

    it('should process multiple transform operations and create multiple artifacts', async () => {
      const transformConfig: ImageTransformConfig = {
        operations: [
          {
            operation: 'resize',
            options: { width: 800, height: 600 },
            suffix: 'large',
          },
          {
            operation: 'resize',
            options: { width: 400, height: 300 },
            suffix: 'medium',
          },
          {
            operation: 'resize',
            options: { width: 200, height: 150 },
            suffix: 'small',
          },
        ],
        outputFormat: 'webp',
        outputQuality: 80,
      };

      const processor = createImageTransformProcessor(transformConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(1600, 1200);
      storage.setData('tenant/file_007/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_007',
          versionId: 'ver_001',
          storageKey: 'tenant/file_007/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'gallery.png',
        },
        { principalId: 'user_123', requestId: 'req_007' }
      );

      expect(result.artifactsCreated).toBe(3);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_007', {});
      expect(artifacts).toHaveLength(3);

      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['transform-large', 'transform-medium', 'transform-small']);

      artifacts.forEach((artifact) => {
        expect(artifact.mimeType).toBe('image/webp');
      });
    });
  });

  describe('Combined OCR and Transform processing', () => {
    it('should run both OCR and transform processors on the same image', async () => {
      const ocrProcessor = createOCRProcessor({ outputFormat: 'text' });
      const transformProcessor = createImageTransformProcessor({
        operations: [{ operation: 'resize', options: { width: 400 }, suffix: 'thumb' }],
      });

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [ocrProcessor, transformProcessor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_008/ver_001.png', testImage);

      const result = await service.runProcessing(
        {
          fileId: 'file_008',
          versionId: 'ver_001',
          storageKey: 'tenant/file_008/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'receipt.png',
        },
        { principalId: 'user_123', requestId: 'req_008' }
      );

      expect(result.artifactsCreated).toBe(2);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_008', {});
      expect(artifacts).toHaveLength(2);

      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['ocr-text', 'transform-thumb']);
    });
  });

  describe('Artifact retrieval and download', () => {
    it('should retrieve OCR artifact download URL', async () => {
      const processor = createOCRProcessor({ outputFormat: 'text' });
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testImage = await createTestImage(800, 600);
      storage.setData('tenant/file_009/ver_001.png', testImage);

      await service.runProcessing(
        {
          fileId: 'file_009',
          versionId: 'ver_001',
          storageKey: 'tenant/file_009/ver_001.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'doc.png',
        },
        { principalId: 'user_123', requestId: 'req_009' }
      );

      const artifacts = await service.listArtifacts('file_009', {});
      const artifactId = artifacts[0].artifactId;

      const { url } = await service.getArtifactDownloadUrl(artifactId, {});

      expect(url).toContain('tenant/file_009/ver_001-ocr.txt');
      expect(url).toMatch(/^https:\/\/storage\.test\/download\//);
    });
  });
});
