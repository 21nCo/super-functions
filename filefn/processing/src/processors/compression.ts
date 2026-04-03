import { deflate, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { Processor, ProcessorInput, ProcessorResult, CompressionConfig } from '../types.js';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);

const ALL_MIME_TYPES = ['*/*'];

export function createCompressionProcessor(config: CompressionConfig = {}): Processor {
  const { algorithm = 'gzip', level = 6 } = config;

  return {
    name: 'compression',
    supportedMimeTypes: ALL_MIME_TYPES,

    async process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult> {
      try {
        const data = await getData();

        if (data.length === 0) {
          return {
            success: true,
            artifacts: [],
          };
        }

        const compressedData = await compress(data, algorithm, level);

        const compressionRatio = compressedData.length / data.length;

        if (compressionRatio >= 0.95) {
          return {
            success: true,
            artifacts: [],
          };
        }

        const extension = algorithm === 'gzip' ? 'gz' : 'deflate';
        const mimeType = algorithm === 'gzip' ? 'application/gzip' : 'application/octet-stream';

        return {
          success: true,
          artifacts: [
            {
              kind: `compressed-${algorithm}`,
              data: compressedData,
              mimeType,
              storageKey: `${input.storageKey}.${extension}`,
              metadata: {
                algorithm,
                level,
                originalSize: data.length,
                compressedSize: compressedData.length,
                compressionRatio,
                sourceFileId: input.fileId,
                sourceVersionId: input.versionId,
              },
            },
          ],
        };
      } catch (error) {
        return {
          success: false,
          artifacts: [],
          error: error instanceof Error ? error.message : 'Unknown compression error',
        };
      }
    },
  };
}

async function compress(data: Uint8Array, algorithm: 'gzip' | 'deflate', level: number): Promise<Uint8Array> {
  const options = { level };
  const buffer = Buffer.from(data);

  if (algorithm === 'gzip') {
    const result = await gzipAsync(buffer, options);
    return new Uint8Array(result);
  } else {
    const result = await deflateAsync(buffer, options);
    return new Uint8Array(result);
  }
}

export { ALL_MIME_TYPES as COMPRESSION_SUPPORTED_MIME_TYPES };
