import type {
  AudioConfig,
  AudioProcessorProvider,
  Processor,
  ProcessorInput,
  ProcessorResult,
} from '../types.js';

const SUPPORTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/wav',
  'audio/flac',
  'audio/x-m4a',
];

function requireProvider(provider: AudioProcessorProvider | undefined): AudioProcessorProvider {
  if (!provider) {
    throw new Error(
      'Audio processing requires a provider. Pass config.provider.',
    );
  }
  return provider;
}

export function createAudioProcessor(config: AudioConfig = {}): Processor {
  const {
    transcode = true,
    transcodeOptions = {},
    extractMetadata = false,
    generateWaveform = false,
    provider,
  } = config;

  const {
    codec = 'aac',
    bitrate = '128k',
    sampleRate = 44100,
    channels = 2,
  } = transcodeOptions;

  return {
    name: 'audio',
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
        if (!transcode && !extractMetadata && !generateWaveform) {
          return {
            success: true,
            artifacts: [],
          };
        }

        const runtime = requireProvider(provider);
        const audioData = await getData();
        const artifacts = [];
        const baseKey = input.storageKey.replace(/\.[^/.]+$/, '');

        if (transcode) {
          const transcoded = await runtime.transcode({
            input,
            audioData,
            codec,
            bitrate,
            sampleRate,
            channels,
          });

          artifacts.push({
            kind: `audio-transcoded-${codec}`,
            data: transcoded.data,
            mimeType: transcoded.mimeType,
            storageKey: `${baseKey}-${codec}.${transcoded.extension}`,
            metadata: {
              codec,
              bitrate,
              sampleRate,
              channels,
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: audioData.length,
              transcodedSize: transcoded.data.length,
              compressionRatio: audioData.length > 0 ? transcoded.data.length / audioData.length : 0,
            },
          });
        }

        if (extractMetadata) {
          const metadata = await runtime.extractMetadata({
            input,
            audioData,
          });
          const metadataJson = JSON.stringify(metadata, null, 2);
          const metadataBytes = new TextEncoder().encode(metadataJson);

          artifacts.push({
            kind: 'audio-metadata',
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

        if (generateWaveform) {
          const waveformData = await runtime.generateWaveform({
            input,
            audioData,
          });
          const waveformJson = JSON.stringify(waveformData, null, 2);
          const waveformBytes = new TextEncoder().encode(waveformJson);

          artifacts.push({
            kind: 'audio-waveform',
            data: waveformBytes,
            mimeType: 'application/json',
            storageKey: `${baseKey}-waveform.json`,
            metadata: {
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              samples: waveformData.samples.length,
              peakAmplitude: waveformData.peakAmplitude,
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
          error: error instanceof Error ? error.message : 'Unknown audio processing error',
        };
      }
    },
  };
}

export { SUPPORTED_MIME_TYPES as AUDIO_SUPPORTED_MIME_TYPES };
