import sharp from 'sharp';
import type { PdfPreviewConfig, Processor, ProcessorInput, ProcessorResult, ThumbnailSize } from '../types.js';

const DEFAULT_SIZES: ThumbnailSize[] = [
  { name: 'small', width: 150, height: 150 },
  { name: 'medium', width: 300, height: 300 },
  { name: 'large', width: 600, height: 600 },
];

const SUPPORTED_MIME_TYPES = ['application/pdf'];
const UNSUPPORTED_MIME_TYPE_ERROR = 'FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE';
const PDF_PREVIEW_FAILED_ERROR = 'FILEFN_PROCESSING_PDF_PREVIEW_FAILED';

export function createPdfPreviewProcessor(config: PdfPreviewConfig = {}): Processor {
  const {
    sizes = DEFAULT_SIZES,
    density = 144,
    quality = 85,
    format = 'png',
  } = config;

  return {
    name: 'pdf-preview',
    supportedMimeTypes: SUPPORTED_MIME_TYPES,

    async process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult> {
      if (!SUPPORTED_MIME_TYPES.includes(input.mimeType)) {
        return {
          success: false,
          artifacts: [],
          error: UNSUPPORTED_MIME_TYPE_ERROR,
        };
      }

      try {
        const pdfData = await getData();
        const renderedFirstPage = await renderPdfFirstPage(pdfData, density);
        const artifacts = [];

        for (const size of sizes) {
          const previewData = renderedFirstPage
            ? await renderResizedPreview(renderedFirstPage, size, format, quality)
            : await renderPlaceholderPreview(pdfData, input.fileName, size, format, quality);
          const extension = outputExtension(format);
          const outputMimeType = outputMime(format);
          const baseKey = input.storageKey.replace(/\.[^.]+$/, '');

          artifacts.push({
            kind: `pdf-preview-page-1-${size.name}`,
            data: previewData,
            mimeType: outputMimeType,
            storageKey: `${baseKey}-pdf-preview-page-1-${size.name}.${extension}`,
            metadata: {
              width: size.width,
              height: size.height,
              density,
              pageNumber: 1,
              format,
              renderMode: renderedFirstPage ? 'page-rasterized' : 'placeholder',
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: pdfData.length,
              previewSize: previewData.length,
            },
          });
        }

        return {
          success: true,
          artifacts,
        };
      } catch (error) {
        void error;
        return {
          success: false,
          artifacts: [],
          error: PDF_PREVIEW_FAILED_ERROR,
        };
      }
    },
  };
}

async function renderPdfFirstPage(pdfData: Uint8Array, density: number): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(pdfData), { density, page: 0 }).png().toBuffer();
  } catch {
    return null;
  }
}

async function renderResizedPreview(
  renderedFirstPage: Buffer,
  size: ThumbnailSize,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
): Promise<Uint8Array> {
  const output = await encodeImage(
    sharp(renderedFirstPage).resize(size.width, size.height, {
      fit: 'inside',
      withoutEnlargement: true,
    }),
    format,
    quality,
  );

  return new Uint8Array(output);
}

async function renderPlaceholderPreview(
  pdfData: Uint8Array,
  fileName: string,
  size: ThumbnailSize,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
): Promise<Uint8Array> {
  const accent = Array.from(hashSeed(pdfData)).slice(0, 3);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
  <rect width="${size.width}" height="${size.height}" fill="rgb(243,244,246)"/>
  <rect x="${Math.round(size.width * 0.12)}" y="${Math.round(size.height * 0.08)}" rx="${Math.max(6, Math.round(size.width * 0.03))}" ry="${Math.max(6, Math.round(size.width * 0.03))}" width="${Math.round(size.width * 0.76)}" height="${Math.round(size.height * 0.84)}" fill="white" stroke="rgb(209,213,219)" stroke-width="2"/>
  <rect x="${Math.round(size.width * 0.12)}" y="${Math.round(size.height * 0.08)}" width="${Math.round(size.width * 0.76)}" height="${Math.max(18, Math.round(size.height * 0.14))}" fill="rgb(${accent[0]},${accent[1]},${accent[2]})"/>
  <text x="${Math.round(size.width * 0.16)}" y="${Math.round(size.height * 0.18)}" font-family="Arial, sans-serif" font-weight="700" font-size="${Math.max(14, Math.round(size.width * 0.11))}" fill="white">PDF</text>
  <text x="${Math.round(size.width * 0.16)}" y="${Math.round(size.height * 0.33)}" font-family="Arial, sans-serif" font-size="${Math.max(10, Math.round(size.width * 0.055))}" fill="rgb(31,41,55)">${escapeXml(trimLabel(fileName, 18))}</text>
  <line x1="${Math.round(size.width * 0.18)}" y1="${Math.round(size.height * 0.46)}" x2="${Math.round(size.width * 0.76)}" y2="${Math.round(size.height * 0.46)}" stroke="rgb(203,213,225)" stroke-width="6" stroke-linecap="round"/>
  <line x1="${Math.round(size.width * 0.18)}" y1="${Math.round(size.height * 0.58)}" x2="${Math.round(size.width * 0.7)}" y2="${Math.round(size.height * 0.58)}" stroke="rgb(226,232,240)" stroke-width="6" stroke-linecap="round"/>
  <line x1="${Math.round(size.width * 0.18)}" y1="${Math.round(size.height * 0.7)}" x2="${Math.round(size.width * 0.74)}" y2="${Math.round(size.height * 0.7)}" stroke="rgb(226,232,240)" stroke-width="6" stroke-linecap="round"/>
</svg>`;
  const output = await encodeImage(sharp(Buffer.from(svg)), format, quality);
  return new Uint8Array(output);
}

async function encodeImage(
  instance: sharp.Sharp,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
): Promise<Buffer> {
  switch (format) {
    case 'jpeg':
      return instance.jpeg({ quality, mozjpeg: true }).toBuffer();
    case 'webp':
      return instance.webp({ quality }).toBuffer();
    default:
      return instance.png({ quality, compressionLevel: 9 }).toBuffer();
  }
}

function hashSeed(data: Uint8Array): Uint8Array {
  const seed = new Uint8Array(3);
  for (let i = 0; i < data.length; i++) {
    seed[i % seed.length] = (seed[i % seed.length] + data[i] + i) % 256;
  }
  return seed;
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function trimLabel(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 3))}...`;
}

function outputMime(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function outputExtension(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'webp':
      return 'webp';
    default:
      return 'png';
  }
}

export { SUPPORTED_MIME_TYPES as PDF_PREVIEW_SUPPORTED_MIME_TYPES };
export { PDF_PREVIEW_FAILED_ERROR, UNSUPPORTED_MIME_TYPE_ERROR as PDF_PREVIEW_UNSUPPORTED_MIME_TYPE_ERROR };
