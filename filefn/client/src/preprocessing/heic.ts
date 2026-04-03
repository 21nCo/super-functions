import type {
  HeicConversionFunction,
  HeicConversionResult,
  HeicPreprocessorOptions,
  UploadPreprocessor,
} from './types.js';

export const FILEFN_HEIC_CONVERSION_FAILED = 'FILEFN_HEIC_CONVERSION_FAILED';

type Heic2AnyLike = (input: {
  blob: Blob;
  toType: 'image/jpeg';
  quality: number;
}) => Promise<Blob | Blob[]>;

function isHeicLike(fileName: string, mimeType: string): boolean {
  return /^image\/hei(c|f)$/i.test(mimeType) || /\.(heic|heif)$/i.test(fileName);
}

function normalizeOutputFileName(fileName: string): string {
  if (/\.(heic|heif)$/i.test(fileName)) {
    return fileName.replace(/\.(heic|heif)$/i, '.jpg');
  }
  return `${fileName}.jpg`;
}

function toBlob(result: HeicConversionResult): Blob | File {
  if (result instanceof Blob) {
    return result;
  }
  return result.file;
}

function extractFileName(result: HeicConversionResult, fallback: string): string {
  if (result instanceof Blob) {
    return fallback;
  }
  if ('name' in result.file && typeof result.file.name === 'string' && result.file.name.length > 0) {
    return result.file.name;
  }
  return result.fileName || fallback;
}

function extractMimeType(result: HeicConversionResult, fallback: string): string {
  if (result instanceof Blob) {
    return result.type || fallback;
  }
  return result.mimeType || result.file.type || fallback;
}

function buildClientError(code: string, message: string, cause?: unknown): Error & { code: string; cause?: unknown } {
  const error = new Error(message) as Error & { code: string; cause?: unknown };
  error.code = code;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function resolveConverter(
  options: HeicPreprocessorOptions,
): HeicConversionFunction | undefined {
  if (options.converter) {
    return options.converter;
  }

  const globalConverter = (globalThis as typeof globalThis & { heic2any?: Heic2AnyLike }).heic2any;
  if (typeof globalConverter !== 'function') {
    return undefined;
  }

  return async ({ file, targetMimeType, quality }) => {
    const blob = await globalConverter({
      blob: file,
      toType: targetMimeType,
      quality,
    });
    if (Array.isArray(blob)) {
      return blob[0];
    }
    return blob;
  };
}

function toNamedFile(blob: Blob | File, fileName: string, mimeType: string): File | Blob {
  if (typeof File !== 'undefined') {
    return new File([blob], fileName, { type: mimeType });
  }
  return new Blob([blob], { type: mimeType });
}

export function createHeicPreprocessor(options: HeicPreprocessorOptions = {}): UploadPreprocessor {
  return {
    name: 'heic',
    matches(context) {
      return isHeicLike(context.fileName, context.mimeType);
    },
    async process(context) {
      const converter = resolveConverter(options);
      if (!converter) {
        throw buildClientError(
          FILEFN_HEIC_CONVERSION_FAILED,
          'HEIC conversion is unavailable in this environment',
        );
      }

      try {
        const outputFileName = normalizeOutputFileName(context.fileName);
        const converted = await converter({
          file: context.file,
          fileName: context.fileName,
          mimeType: context.mimeType,
          targetMimeType: 'image/jpeg',
          quality: options.quality ?? 0.92,
        });
        const convertedMimeType = extractMimeType(converted, 'image/jpeg') || 'image/jpeg';
        const namedFile = toNamedFile(toBlob(converted), extractFileName(converted, outputFileName), convertedMimeType);

        return {
          file: namedFile,
          fileName: extractFileName(converted, outputFileName),
          mimeType: convertedMimeType,
          localSource: {
            kind: 'image',
            previewBehavior: 'direct-image',
          },
        };
      } catch (error) {
        throw buildClientError(
          FILEFN_HEIC_CONVERSION_FAILED,
          'HEIC conversion failed',
          error,
        );
      }
    },
  };
}
