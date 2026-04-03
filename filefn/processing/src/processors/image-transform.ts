import sharp from 'sharp';
import type { Processor, ProcessorInput, ProcessorResult } from '../types.js';

const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/tiff',
];

export type ImageTransformOperation = 'resize' | 'crop' | 'rotate';

export interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  withoutEnlargement?: boolean;
}

export interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RotateOptions {
  angle: number;
  background?: { r: number; g: number; b: number; alpha?: number };
}

export interface ImageTransformConfig {
  operations: Array<{
    operation: ImageTransformOperation;
    options: ResizeOptions | CropOptions | RotateOptions;
    suffix?: string;
  }>;
  outputFormat?: 'jpeg' | 'png' | 'webp';
  outputQuality?: number;
}

export function createImageTransformProcessor(config: ImageTransformConfig): Processor {
  const { operations, outputFormat = 'jpeg', outputQuality = 85 } = config;

  if (!operations || operations.length === 0) {
    throw new Error('ImageTransformProcessor requires at least one operation');
  }

  return {
    name: 'image-transform',
    supportedMimeTypes: SUPPORTED_MIME_TYPES,

    async process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult> {
      if (!SUPPORTED_MIME_TYPES.includes(input.mimeType)) {
        return {
          success: false,
          artifacts: [],
          error: `Unsupported MIME type: ${input.mimeType}`,
        };
      }

      try {
        const imageData = await getData();
        const artifacts = [];

        for (const { operation, options, suffix } of operations) {
          const transformedData = await applyTransform(
            imageData,
            operation,
            options,
            outputFormat,
            outputQuality
          );

          const outputMimeType =
            outputFormat === 'png' ? 'image/png' : outputFormat === 'webp' ? 'image/webp' : 'image/jpeg';
          const extension = outputFormat === 'png' ? 'png' : outputFormat === 'webp' ? 'webp' : 'jpg';

          const baseKey = input.storageKey.replace(/\.[^.]+$/, '');
          const operationSuffix = suffix || `${operation}`;

          artifacts.push({
            kind: `transform-${operationSuffix}`,
            data: transformedData,
            mimeType: outputMimeType,
            storageKey: `${baseKey}-${operationSuffix}.${extension}`,
            metadata: {
              operation,
              options,
              outputFormat,
              outputQuality,
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: imageData.length,
              transformedSize: transformedData.length,
            },
          });
        }

        return {
          success: true,
          artifacts,
        };
      } catch (error) {
        return {
          success: false,
          artifacts: [],
          error: error instanceof Error ? error.message : 'Unknown image transform error',
        };
      }
    },
  };
}

async function applyTransform(
  imageData: Uint8Array,
  operation: ImageTransformOperation,
  options: ResizeOptions | CropOptions | RotateOptions,
  outputFormat: 'jpeg' | 'png' | 'webp',
  outputQuality: number
): Promise<Uint8Array> {
  const buffer = Buffer.from(imageData);
  let pipeline = sharp(buffer);

  switch (operation) {
    case 'resize': {
      const resizeOpts = options as ResizeOptions;
      pipeline = pipeline.resize(resizeOpts.width, resizeOpts.height, {
        fit: resizeOpts.fit || 'cover',
        withoutEnlargement: resizeOpts.withoutEnlargement !== false,
      });
      break;
    }

    case 'crop': {
      const cropOpts = options as CropOptions;
      pipeline = pipeline.extract({
        left: cropOpts.left,
        top: cropOpts.top,
        width: cropOpts.width,
        height: cropOpts.height,
      });
      break;
    }

    case 'rotate': {
      const rotateOpts = options as RotateOptions;
      pipeline = pipeline.rotate(rotateOpts.angle, {
        background: rotateOpts.background || { r: 255, g: 255, b: 255, alpha: 1 },
      });
      break;
    }

    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }

  switch (outputFormat) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: outputQuality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ quality: outputQuality, compressionLevel: 9 });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality: outputQuality });
      break;
  }

  const result = await pipeline.toBuffer();
  return new Uint8Array(result);
}

export { SUPPORTED_MIME_TYPES as IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES };
