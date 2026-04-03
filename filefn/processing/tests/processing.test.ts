import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  createThumbnailProcessor,
  createPdfPreviewProcessor,
  createCompressionProcessor,
  supportsProcessor,
  THUMBNAIL_SUPPORTED_MIME_TYPES,
  PDF_PREVIEW_SUPPORTED_MIME_TYPES,
  COMPRESSION_SUPPORTED_MIME_TYPES,
} from '../src/index.js';

async function createTestImage(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('@filefn/processing', () => {
  describe('Processor contracts', () => {
    it('should export Processor-compatible thumbnail processor', () => {
      const processor = createThumbnailProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('thumbnail');
      expect(processor.supportedMimeTypes).toEqual(THUMBNAIL_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should export Processor-compatible compression processor', () => {
      const processor = createCompressionProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('compression');
      expect(processor.supportedMimeTypes).toEqual(COMPRESSION_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should export Processor-compatible PDF preview processor', () => {
      const processor = createPdfPreviewProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('pdf-preview');
      expect(processor.supportedMimeTypes).toEqual(PDF_PREVIEW_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });
  });

  describe('supportsProcessor', () => {
    it('should match specific MIME types', () => {
      const processor = createThumbnailProcessor();
      expect(supportsProcessor(processor, 'image/png')).toBe(true);
      expect(supportsProcessor(processor, 'image/jpeg')).toBe(true);
      expect(supportsProcessor(processor, 'image/webp')).toBe(true);
      expect(supportsProcessor(processor, 'application/pdf')).toBe(false);
    });

    it('should match wildcard MIME types', () => {
      const processor = createCompressionProcessor();
      expect(supportsProcessor(processor, 'image/png')).toBe(true);
      expect(supportsProcessor(processor, 'application/json')).toBe(true);
      expect(supportsProcessor(processor, 'text/plain')).toBe(true);
    });
  });

  describe('ThumbnailProcessor', () => {
    it('should reject unsupported MIME types', async () => {
      const processor = createThumbnailProcessor();
      const getData = vi.fn();

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/document.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          fileName: 'document.pdf',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE');
      expect(getData).not.toHaveBeenCalled();
    });

    it('should generate real thumbnail artifacts for PNG images', async () => {
      const processor = createThumbnailProcessor({
        sizes: [
          { name: 'small', width: 100, height: 100 },
          { name: 'large', width: 400, height: 400 },
        ],
        quality: 80,
        format: 'jpeg',
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'image.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(2);

      const smallThumb = result.artifacts[0];
      expect(smallThumb.kind).toBe('thumbnail-small');
      expect(smallThumb.mimeType).toBe('image/jpeg');
      expect(smallThumb.storageKey).toContain('-thumb-small.jpg');
      expect(smallThumb.data.length).toBeGreaterThan(0);

      const smallMeta = await sharp(Buffer.from(smallThumb.data)).metadata();
      expect(smallMeta.width).toBeLessThanOrEqual(100);
      expect(smallMeta.height).toBeLessThanOrEqual(100);

      const largeThumb = result.artifacts[1];
      expect(largeThumb.kind).toBe('thumbnail-large');
      expect(largeThumb.mimeType).toBe('image/jpeg');

      const largeMeta = await sharp(Buffer.from(largeThumb.data)).metadata();
      expect(largeMeta.width).toBeLessThanOrEqual(400);
      expect(largeMeta.height).toBeLessThanOrEqual(400);

      expect(getData).toHaveBeenCalledOnce();
    });

    it('should preserve aspect ratio (fit inside)', async () => {
      const processor = createThumbnailProcessor({
        sizes: [{ name: 'thumb', width: 100, height: 100 }],
      });

      const wideImage = await createTestImage(1000, 500);
      const getData = vi.fn().mockResolvedValue(wideImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/wide.png',
          mimeType: 'image/png',
          size: wideImage.length,
          fileName: 'wide.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      const meta = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(50);
    });

    it('should not enlarge small images', async () => {
      const processor = createThumbnailProcessor({
        sizes: [{ name: 'thumb', width: 500, height: 500 }],
      });

      const smallImage = await createTestImage(100, 100);
      const getData = vi.fn().mockResolvedValue(smallImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/small.png',
          mimeType: 'image/png',
          size: smallImage.length,
          fileName: 'small.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      const meta = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(100);
    });

    it('should support webp output format', async () => {
      const processor = createThumbnailProcessor({
        sizes: [{ name: 'thumb', width: 100, height: 100 }],
        format: 'webp',
        quality: 90,
      });

      const testImage = await createTestImage(400, 400);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'image.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].mimeType).toBe('image/webp');
      expect(result.artifacts[0].storageKey).toContain('.webp');

      const meta = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(meta.format).toBe('webp');
    });

    it('should support png output format', async () => {
      const processor = createThumbnailProcessor({
        sizes: [{ name: 'thumb', width: 100, height: 100 }],
        format: 'png',
      });

      const testImage = await createTestImage(400, 400);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/image.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'image.jpg',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].mimeType).toBe('image/png');
      expect(result.artifacts[0].storageKey).toContain('.png');
    });

    it('should include metadata in artifact output', async () => {
      const processor = createThumbnailProcessor({
        sizes: [{ name: 'small', width: 150, height: 150 }],
        quality: 75,
        format: 'jpeg',
      });

      const testImage = await createTestImage(600, 400);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/photo.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'photo.jpg',
        },
        getData
      );

      expect(result.success).toBe(true);
      const artifact = result.artifacts[0];
      expect(artifact.metadata).toMatchObject({
        width: 150,
        height: 150,
        quality: 75,
        format: 'jpeg',
        sourceFileId: 'file_001',
        sourceVersionId: 'ver_001',
      });
      expect(artifact.metadata?.originalSize).toBe(testImage.length);
      expect(artifact.metadata?.thumbnailSize).toBe(artifact.data.length);
    });
  });

  describe('CompressionProcessor', () => {
    it('should compress data using gzip by default', async () => {
      const processor = createCompressionProcessor();

      const testData = new Uint8Array(1000);
      testData.fill(65);
      const getData = vi.fn().mockResolvedValue(testData);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/data.txt',
          mimeType: 'text/plain',
          size: testData.length,
          fileName: 'data.txt',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].kind).toBe('compressed-gzip');
      expect(result.artifacts[0].mimeType).toBe('application/gzip');
      expect(result.artifacts[0].storageKey).toBe('test/data.txt.gz');
      expect(result.artifacts[0].data.length).toBeLessThan(testData.length);

      expect(result.artifacts[0].metadata).toMatchObject({
        algorithm: 'gzip',
        originalSize: 1000,
      });
      expect(result.artifacts[0].metadata?.compressedSize).toBe(result.artifacts[0].data.length);
    });

    it('should skip compression if ratio is too low (incompressible data)', async () => {
      const processor = createCompressionProcessor();

      const randomData = new Uint8Array(100);
      for (let i = 0; i < randomData.length; i++) {
        randomData[i] = Math.floor(Math.random() * 256);
      }
      const getData = vi.fn().mockResolvedValue(randomData);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/random.bin',
          mimeType: 'application/octet-stream',
          size: randomData.length,
          fileName: 'random.bin',
        },
        getData
      );

      expect(result.success).toBe(true);
    });

    it('should use deflate when configured', async () => {
      const processor = createCompressionProcessor({ algorithm: 'deflate' });

      const testData = new Uint8Array(1000);
      testData.fill(66);
      const getData = vi.fn().mockResolvedValue(testData);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/data.txt',
          mimeType: 'text/plain',
          size: testData.length,
          fileName: 'data.txt',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].kind).toBe('compressed-deflate');
      expect(result.artifacts[0].storageKey).toBe('test/data.txt.deflate');
    });

    it('should respect compression level', async () => {
      const lowCompression = createCompressionProcessor({ level: 1 });
      const highCompression = createCompressionProcessor({ level: 9 });

      const testData = new Uint8Array(10000);
      for (let i = 0; i < testData.length; i++) {
        testData[i] = i % 100;
      }

      const lowResult = await lowCompression.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/data.bin',
          mimeType: 'application/octet-stream',
          size: testData.length,
          fileName: 'data.bin',
        },
        async () => testData
      );

      const highResult = await highCompression.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/data.bin',
          mimeType: 'application/octet-stream',
          size: testData.length,
          fileName: 'data.bin',
        },
        async () => testData
      );

      expect(lowResult.success).toBe(true);
      expect(highResult.success).toBe(true);
      expect(lowResult.artifacts).toHaveLength(1);
      expect(highResult.artifacts).toHaveLength(1);
      expect(highResult.artifacts[0].data.length).toBeLessThanOrEqual(lowResult.artifacts[0].data.length);
    });
  });

  describe('PdfPreviewProcessor', () => {
    it('should reject unsupported MIME types with a stable error code', async () => {
      const processor = createPdfPreviewProcessor();

      const result = await processor.process(
        {
          fileId: 'file_002',
          versionId: 'ver_002',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: 128,
          fileName: 'image.png',
        },
        vi.fn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE');
    });

    it('should emit canonical PDF preview kinds even when rasterization falls back to placeholders', async () => {
      const processor = createPdfPreviewProcessor();
      const invalidPdf = new TextEncoder().encode('not-a-real-pdf');
      const getData = vi.fn().mockResolvedValue(invalidPdf);

      const result = await processor.process(
        {
          fileId: 'file_pdf_001',
          versionId: 'ver_pdf_001',
          storageKey: 'test/report.pdf',
          mimeType: 'application/pdf',
          size: invalidPdf.length,
          fileName: 'report.pdf',
        },
        getData,
      );

      expect(result.success).toBe(true);
      expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
        'pdf-preview-page-1-small',
        'pdf-preview-page-1-medium',
        'pdf-preview-page-1-large',
      ]);
      expect(result.artifacts.every((artifact) => artifact.mimeType === 'image/png')).toBe(true);
      expect(result.artifacts.every((artifact) => artifact.storageKey.includes('-pdf-preview-page-1-'))).toBe(true);
      expect(result.artifacts.every((artifact) => artifact.metadata?.pageNumber === 1)).toBe(true);
      expect(result.artifacts.every((artifact) => artifact.metadata?.renderMode)).toBe(true);
      expect(result.artifacts.every((artifact) => artifact.data.length > 0)).toBe(true);
      expect(getData).toHaveBeenCalledOnce();
    });

    it('should surface a stable error code when input retrieval fails', async () => {
      const processor = createPdfPreviewProcessor();

      const result = await processor.process(
        {
          fileId: 'file_pdf_002',
          versionId: 'ver_pdf_002',
          storageKey: 'test/broken.pdf',
          mimeType: 'application/pdf',
          size: 0,
          fileName: 'broken.pdf',
        },
        vi.fn().mockRejectedValue(new Error('boom')),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('FILEFN_PROCESSING_PDF_PREVIEW_FAILED');
    });
  });
});
