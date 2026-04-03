export type {
  Processor,
  ProcessorInput,
  ProcessorOutputArtifact,
  ProcessorResult,
  ProcessingConfig,
  ProcessingJobInput,
  ProcessingJobResult,
  ThumbnailConfig,
  ThumbnailSize,
  PdfPreviewConfig,
  CompressionConfig,
  OCRConfig,
  OCRProcessorProvider,
  OCRProviderRequest,
  OCRProviderResult,
  ImageTransformOperation,
  ImageTransformConfig,
  ResizeOptions,
  CropOptions,
  RotateOptions,
  VideoConfig,
  VideoMetadataRequest,
  VideoTranscodeOptions,
  VideoTranscodeRequest,
  VideoTranscodeResult,
  VideoPosterOptions,
  VideoPosterRequest,
  VideoProcessorProvider,
  AudioConfig,
  AudioMetadataRequest,
  AudioProcessorProvider,
  AudioTranscodeOptions,
  AudioTranscodeRequest,
  AudioTranscodeResult,
  AudioWaveformRequest,
  AudioWaveformResult,
} from './types.js';

export {
  createThumbnailProcessor,
  THUMBNAIL_SUPPORTED_MIME_TYPES,
} from './processors/thumbnail.js';

export {
  createPdfPreviewProcessor,
  PDF_PREVIEW_SUPPORTED_MIME_TYPES,
} from './processors/pdf-preview.js';

export {
  createCompressionProcessor,
  COMPRESSION_SUPPORTED_MIME_TYPES,
} from './processors/compression.js';

export {
  createOCRProcessor,
  OCR_SUPPORTED_MIME_TYPES,
} from './processors/ocr.js';
export { createTesseractJsOCRProvider } from './providers/tesseract-ocr.js';

export {
  createImageTransformProcessor,
  IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES,
} from './processors/image-transform.js';

export {
  createVideoProcessor,
  VIDEO_SUPPORTED_MIME_TYPES,
} from './processors/video.js';
export { createCommandVideoProvider } from './providers/video-command.js';

export {
  createAudioProcessor,
  AUDIO_SUPPORTED_MIME_TYPES,
} from './processors/audio.js';
export { createCommandAudioProvider } from './providers/audio-command.js';

export interface ProcessingPipeline {
  name: string;
  process(data: Uint8Array): Promise<Uint8Array>;
}

export function createPipeline(steps: ProcessingPipeline[]): ProcessingPipeline {
  return {
    name: 'composite',
    async process(data: Uint8Array): Promise<Uint8Array> {
      let result = data;
      for (const step of steps) {
        result = await step.process(result);
      }
      return result;
    },
  };
}

export function supportsProcessor(processor: { supportedMimeTypes: string[] }, mimeType: string): boolean {
  if (processor.supportedMimeTypes.includes('*/*')) {
    return true;
  }
  return processor.supportedMimeTypes.includes(mimeType);
}
