import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  createOCRProcessor,
  createImageTransformProcessor,
  supportsProcessor,
  OCR_SUPPORTED_MIME_TYPES,
  IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES,
} from '../src/index.js';

const OCR_TEST_TIMEOUT_MS = 15_000;

function normalizeOCRText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

async function createTestImage(width: number, height: number, text: string = 'HELLO FILEFN'): Promise<Uint8Array> {
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="50%" y="45%" text-anchor="middle" font-size="72" font-family="Arial" font-weight="700" fill="black">${text}</text>
      <text x="50%" y="65%" text-anchor="middle" font-size="72" font-family="Arial" font-weight="700" fill="black">OCR TEST</text>
    </svg>
  `);
  const buffer = await sharp(svg).png().toBuffer();
  return new Uint8Array(buffer);
}

describe('OCR Processor', () => {
  describe('Contract compliance', () => {
    it('should export Processor-compatible OCR processor', () => {
      const processor = createOCRProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('ocr');
      expect(processor.supportedMimeTypes).toEqual(OCR_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should support correct MIME types', () => {
      const processor = createOCRProcessor();
      expect(supportsProcessor(processor, 'image/png')).toBe(true);
      expect(supportsProcessor(processor, 'image/jpeg')).toBe(true);
      expect(supportsProcessor(processor, 'image/webp')).toBe(true);
      expect(supportsProcessor(processor, 'image/gif')).toBe(true);
      expect(supportsProcessor(processor, 'image/tiff')).toBe(true);
      expect(supportsProcessor(processor, 'application/pdf')).toBe(false);
      expect(supportsProcessor(processor, 'text/plain')).toBe(false);
    });
  });

  describe('OCR processing', () => {
    it('should reject unsupported MIME types', async () => {
      const processor = createOCRProcessor();
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
      expect(result.error).toContain('Unsupported MIME type');
      expect(getData).not.toHaveBeenCalled();
    });

    it('should extract text from PNG image (text format)', async () => {
      const processor = createOCRProcessor({ outputFormat: 'text', language: 'eng' });

      const testImage = await createTestImage(1200, 800);
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
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('ocr-text');
      expect(result.artifacts[0].mimeType).toBe('text/plain');
      expect(result.artifacts[0].storageKey).toBe('test/image-ocr.txt');

      const extractedText = new TextDecoder().decode(result.artifacts[0].data);
      expect(normalizeOCRText(extractedText)).toContain('HELLO FILEFN');
      expect(extractedText.length).toBeGreaterThan(0);

      expect(result.artifacts[0].metadata).toMatchObject({
        language: 'eng',
        format: 'text',
        sourceFileId: 'file_001',
        sourceVersionId: 'ver_001',
      });
    }, OCR_TEST_TIMEOUT_MS);

    it('should extract text in JSON format', async () => {
      const processor = createOCRProcessor({ outputFormat: 'json', language: 'eng' });

      const testImage = await createTestImage(1200, 800, 'BONJOUR FILEFN');
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_002',
          versionId: 'ver_002',
          storageKey: 'test/french.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'french.jpg',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('ocr-json');
      expect(result.artifacts[0].mimeType).toBe('application/json');
      expect(result.artifacts[0].storageKey).toBe('test/french-ocr.json');

      const jsonData = JSON.parse(new TextDecoder().decode(result.artifacts[0].data));
      expect(jsonData).toHaveProperty('text');
      expect(jsonData).toHaveProperty('language', 'eng');
      expect(jsonData).toHaveProperty('confidence');
      expect(jsonData).toHaveProperty('extractedAt');
      expect(normalizeOCRText(jsonData.text)).toContain('BONJOUR FILEFN');
    }, OCR_TEST_TIMEOUT_MS);

    it('should extract text in hOCR format', async () => {
      const processor = createOCRProcessor({ outputFormat: 'hocr' });

      const testImage = await createTestImage(1200, 800);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_003',
          versionId: 'ver_003',
          storageKey: 'test/document.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'document.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('ocr-hocr');
      expect(result.artifacts[0].mimeType).toBe('text/html');
      expect(result.artifacts[0].storageKey).toBe('test/document-ocr.hocr');

      const hocrContent = new TextDecoder().decode(result.artifacts[0].data);
      expect(hocrContent).toContain('ocr_page');
      expect(hocrContent).toContain('ocr_line');
      expect(normalizeOCRText(hocrContent)).toContain('HELLO');
    }, OCR_TEST_TIMEOUT_MS);

    it('should extract text in all formats when format is "all"', async () => {
      const processor = createOCRProcessor({ outputFormat: 'all' });

      const testImage = await createTestImage(1200, 800);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_004',
          versionId: 'ver_004',
          storageKey: 'test/multiformat.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'multiformat.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(3);

      const kinds = result.artifacts.map((a) => a.kind);
      expect(kinds).toContain('ocr-text');
      expect(kinds).toContain('ocr-json');
      expect(kinds).toContain('ocr-hocr');

      const mimeTypes = result.artifacts.map((a) => a.mimeType);
      expect(mimeTypes).toContain('text/plain');
      expect(mimeTypes).toContain('application/json');
      expect(mimeTypes).toContain('text/html');
    }, OCR_TEST_TIMEOUT_MS);

    it('should handle getData errors gracefully', async () => {
      const processor = createOCRProcessor();
      const getData = vi.fn().mockRejectedValue(new Error('Storage failure'));

      const result = await processor.process(
        {
          fileId: 'file_005',
          versionId: 'ver_005',
          storageKey: 'test/error.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'error.png',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage failure');
      expect(result.artifacts).toHaveLength(0);
    });
  });
});

describe('Image Transform Processor', () => {
  describe('Contract compliance', () => {
    it('should export Processor-compatible image transform processor', () => {
      const processor = createImageTransformProcessor({
        operations: [{ operation: 'resize', options: { width: 100 } }],
      });
      expect(processor).toBeDefined();
      expect(processor.name).toBe('image-transform');
      expect(processor.supportedMimeTypes).toEqual(IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should support correct MIME types', () => {
      const processor = createImageTransformProcessor({
        operations: [{ operation: 'resize', options: { width: 100 } }],
      });
      expect(supportsProcessor(processor, 'image/png')).toBe(true);
      expect(supportsProcessor(processor, 'image/jpeg')).toBe(true);
      expect(supportsProcessor(processor, 'image/webp')).toBe(true);
      expect(supportsProcessor(processor, 'image/gif')).toBe(true);
      expect(supportsProcessor(processor, 'application/pdf')).toBe(false);
    });

    it('should throw when no operations are provided', () => {
      expect(() => {
        createImageTransformProcessor({ operations: [] });
      }).toThrow('requires at least one operation');
    });
  });

  describe('Resize operation', () => {
    it('should resize image to specified dimensions', async () => {
      const processor = createImageTransformProcessor({
        operations: [
          {
            operation: 'resize',
            options: { width: 400, height: 300, fit: 'cover' },
            suffix: 'resized',
          },
        ],
        outputFormat: 'jpeg',
        outputQuality: 85,
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_006',
          versionId: 'ver_006',
          storageKey: 'test/original.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'original.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('transform-resized');
      expect(result.artifacts[0].mimeType).toBe('image/jpeg');
      expect(result.artifacts[0].storageKey).toBe('test/original-resized.jpg');

      expect(result.artifacts[0].metadata).toMatchObject({
        operation: 'resize',
        options: { width: 400, height: 300, fit: 'cover' },
        outputFormat: 'jpeg',
        outputQuality: 85,
        sourceFileId: 'file_006',
        sourceVersionId: 'ver_006',
      });

      const resizedImage = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(resizedImage.width).toBeLessThanOrEqual(400);
      expect(resizedImage.height).toBeLessThanOrEqual(300);
    });

    it('should respect withoutEnlargement option', async () => {
      const processor = createImageTransformProcessor({
        operations: [
          {
            operation: 'resize',
            options: { width: 1600, height: 1200, withoutEnlargement: true },
          },
        ],
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_007',
          versionId: 'ver_007',
          storageKey: 'test/small.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'small.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      const resizedImage = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(resizedImage.width).toBe(800);
      expect(resizedImage.height).toBe(600);
    });
  });

  describe('Crop operation', () => {
    it('should crop image to specified region', async () => {
      const processor = createImageTransformProcessor({
        operations: [
          {
            operation: 'crop',
            options: { left: 100, top: 50, width: 200, height: 150 },
            suffix: 'cropped',
          },
        ],
        outputFormat: 'png',
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_008',
          versionId: 'ver_008',
          storageKey: 'test/photo.jpg',
          mimeType: 'image/jpeg',
          size: testImage.length,
          fileName: 'photo.jpg',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('transform-cropped');
      expect(result.artifacts[0].mimeType).toBe('image/png');
      expect(result.artifacts[0].storageKey).toBe('test/photo-cropped.png');

      const croppedImage = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(croppedImage.width).toBe(200);
      expect(croppedImage.height).toBe(150);
    });
  });

  describe('Rotate operation', () => {
    it('should rotate image by specified angle', async () => {
      const processor = createImageTransformProcessor({
        operations: [
          {
            operation: 'rotate',
            options: { angle: 90, background: { r: 255, g: 255, b: 255 } },
            suffix: 'rotated-90',
          },
        ],
        outputFormat: 'jpeg',
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_009',
          versionId: 'ver_009',
          storageKey: 'test/landscape.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'landscape.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('transform-rotated-90');
      expect(result.artifacts[0].mimeType).toBe('image/jpeg');
      expect(result.artifacts[0].storageKey).toBe('test/landscape-rotated-90.jpg');

      const rotatedImage = await sharp(Buffer.from(result.artifacts[0].data)).metadata();
      expect(rotatedImage.width).toBe(600);
      expect(rotatedImage.height).toBe(800);
    });
  });

  describe('Multiple operations', () => {
    it('should apply multiple transformations', async () => {
      const processor = createImageTransformProcessor({
        operations: [
          {
            operation: 'resize',
            options: { width: 400, height: 300 },
            suffix: 'small',
          },
          {
            operation: 'rotate',
            options: { angle: 45 },
            suffix: 'rotated',
          },
        ],
        outputFormat: 'webp',
        outputQuality: 80,
      });

      const testImage = await createTestImage(800, 600);
      const getData = vi.fn().mockResolvedValue(testImage);

      const result = await processor.process(
        {
          fileId: 'file_010',
          versionId: 'ver_010',
          storageKey: 'test/multi.png',
          mimeType: 'image/png',
          size: testImage.length,
          fileName: 'multi.png',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].kind).toBe('transform-small');
      expect(result.artifacts[1].kind).toBe('transform-rotated');
      expect(result.artifacts[0].mimeType).toBe('image/webp');
      expect(result.artifacts[1].mimeType).toBe('image/webp');
    });
  });

  describe('Error handling', () => {
    it('should reject unsupported MIME types', async () => {
      const processor = createImageTransformProcessor({
        operations: [{ operation: 'resize', options: { width: 100 } }],
      });
      const getData = vi.fn();

      const result = await processor.process(
        {
          fileId: 'file_011',
          versionId: 'ver_011',
          storageKey: 'test/document.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          fileName: 'document.pdf',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
      expect(getData).not.toHaveBeenCalled();
    });

    it('should handle getData errors gracefully', async () => {
      const processor = createImageTransformProcessor({
        operations: [{ operation: 'resize', options: { width: 100 } }],
      });
      const getData = vi.fn().mockRejectedValue(new Error('Download failed'));

      const result = await processor.process(
        {
          fileId: 'file_012',
          versionId: 'ver_012',
          storageKey: 'test/error.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'error.png',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
      expect(result.artifacts).toHaveLength(0);
    });
  });
});
