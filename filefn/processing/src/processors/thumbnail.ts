import sharp from 'sharp';
import type { Processor, ProcessorInput, ProcessorResult, ThumbnailConfig, ThumbnailSize } from '../types.js';

const UNSUPPORTED_MIME_TYPE_ERROR = 'FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE';
const THUMBNAIL_FAILED_ERROR = 'FILEFN_PROCESSING_THUMBNAIL_FAILED';

const DEFAULT_SIZES: ThumbnailSize[] = [
  { name: 'small', width: 150, height: 150 },
  { name: 'medium', width: 300, height: 300 },
  { name: 'large', width: 600, height: 600 },
];

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/tiff'];

export function createThumbnailProcessor(config: ThumbnailConfig = { sizes: DEFAULT_SIZES }): Processor {
  const { sizes = DEFAULT_SIZES, quality = 80, format = 'jpeg' } = config;

  return {
    name: 'thumbnail',
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
        const imageData = await getData();
        const artifacts = [];

        for (const size of sizes) {
          const thumbnailData = await generateThumbnail(imageData, size, quality, format);
          const outputMimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
          const extension = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';

          const baseKey = input.storageKey.replace(/\.[^.]+$/, '');

          artifacts.push({
            kind: `thumbnail-${size.name}`,
            data: thumbnailData,
            mimeType: outputMimeType,
            storageKey: `${baseKey}-thumb-${size.name}.${extension}`,
            metadata: {
              width: size.width,
              height: size.height,
              quality,
              format,
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: imageData.length,
              thumbnailSize: thumbnailData.length,
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
          error: THUMBNAIL_FAILED_ERROR,
        };
      }
    },
  };
}

async function generateThumbnail(
  imageData: Uint8Array,
  size: ThumbnailSize,
  quality: number,
  format: 'jpeg' | 'png' | 'webp'
): Promise<Uint8Array> {
  const buffer = Buffer.from(imageData);

  let pipeline = sharp(buffer)
    .resize(size.width, size.height, {
      fit: 'inside',
      withoutEnlargement: true,
    });

  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ quality, compressionLevel: 9 });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
  }

  const result = await pipeline.toBuffer();
  return new Uint8Array(result);
}

export { SUPPORTED_MIME_TYPES as THUMBNAIL_SUPPORTED_MIME_TYPES };
export { THUMBNAIL_FAILED_ERROR, UNSUPPORTED_MIME_TYPE_ERROR };
