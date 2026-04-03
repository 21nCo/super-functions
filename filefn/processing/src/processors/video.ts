import type {
  Processor,
  ProcessorInput,
  ProcessorResult,
  VideoConfig,
  VideoProcessorProvider,
} from '../types.js';

const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

function requireProvider(provider: VideoProcessorProvider | undefined): VideoProcessorProvider {
  if (!provider) {
    throw new Error(
      'Video processing requires a provider. Pass config.provider or use createCommandVideoProvider().',
    );
  }
  return provider;
}

export function createVideoProcessor(config: VideoConfig = {}): Processor {
  const {
    generatePoster = true,
    posterOptions = {},
    transcode = true,
    transcodeOptions = {},
    extractMetadata = false,
    provider,
  } = config;

  const {
    timestamp = 1.0,
    width = 1280,
    height = 720,
    format = 'jpeg',
    quality = 85,
  } = posterOptions;

  const {
    codec = 'h264',
    resolution = '720p',
    bitrate = '2M',
    fps = 30,
  } = transcodeOptions;

  return {
    name: 'video',
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
        const videoData = await getData();
        const artifacts = [];
        const baseKey = input.storageKey.replace(/\.[^.]+$/, '');
        const runtime = (generatePoster || transcode || extractMetadata)
          ? requireProvider(provider)
          : undefined;

        if (generatePoster && runtime) {
          const posterData = await runtime.generatePoster({
            input,
            videoData,
            timestamp,
            width,
            height,
            format,
            quality,
          });

          const posterMimeType =
            format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
          const extension = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';

          artifacts.push({
            kind: 'video-poster',
            data: posterData,
            mimeType: posterMimeType,
            storageKey: `${baseKey}-poster.${extension}`,
            metadata: {
              timestamp,
              width,
              height,
              format,
              quality,
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: videoData.length,
              posterSize: posterData.length,
            },
          });
        }

        if (transcode && runtime) {
          const transcoded = await runtime.transcode({
            input,
            videoData,
            codec,
            resolution,
            bitrate,
            fps,
          });

          artifacts.push({
            kind: `video-transcoded-${resolution}`,
            data: transcoded.data,
            mimeType: transcoded.mimeType,
            storageKey: `${baseKey}-${resolution}.${transcoded.extension}`,
            metadata: {
              codec,
              resolution,
              bitrate,
              fps,
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: videoData.length,
              transcodedSize: transcoded.data.length,
              compressionRatio: videoData.length > 0 ? transcoded.data.length / videoData.length : 0,
            },
          });
        }

        if (extractMetadata && runtime) {
          const metadata = await runtime.extractMetadata({
            input,
            videoData,
          });
          const metadataJson = JSON.stringify(metadata, null, 2);
          const metadataBytes = new TextEncoder().encode(metadataJson);

          artifacts.push({
            kind: 'video-metadata',
            data: metadataBytes,
            mimeType: 'application/json',
            storageKey: `${baseKey}-metadata.json`,
            metadata: {
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              extractedAt: new Date().toISOString(),
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
          error: error instanceof Error ? error.message : 'Unknown video processing error',
        };
      }
    },
  };
}

export { SUPPORTED_MIME_TYPES as VIDEO_SUPPORTED_MIME_TYPES };
