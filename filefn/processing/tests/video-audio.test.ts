import sharp from 'sharp';
import { describe, it, expect, vi } from 'vitest';
import {
  createVideoProcessor,
  createAudioProcessor,
  supportsProcessor,
  VIDEO_SUPPORTED_MIME_TYPES,
  AUDIO_SUPPORTED_MIME_TYPES,
  type AudioProcessorProvider,
  type VideoProcessorProvider,
} from '../src/index.js';

function createMockVideoData(size: number = 1000): Uint8Array {
  const data = new Uint8Array(size);
  const header = new TextEncoder().encode('VIDEO_SOURCE_DATA');
  data.set(header, 0);
  for (let i = header.length; i < size; i++) {
    data[i] = i % 251;
  }
  return data;
}

function createMockVideoProvider(): VideoProcessorProvider {
  return {
    async generatePoster(request) {
      const buffer = await sharp({
        create: {
          width: request.width,
          height: request.height,
          channels: 3,
          background: { r: 24, g: 28, b: 40 },
        },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${request.width}" height="${request.height}">
                <rect width="100%" height="100%" fill="#181c28"/>
                <circle cx="${request.width / 2}" cy="${request.height / 2}" r="72" fill="#f8fafc" opacity="0.82"/>
                <polygon points="${request.width / 2 - 22},${request.height / 2 - 32} ${request.width / 2 - 22},${request.height / 2 + 32} ${request.width / 2 + 30},${request.height / 2}" fill="#181c28"/>
              </svg>`,
            ),
          },
        ]);

      if (request.format === 'png') {
        return new Uint8Array(await buffer.png().toBuffer());
      }
      if (request.format === 'webp') {
        return new Uint8Array(await buffer.webp({ quality: request.quality }).toBuffer());
      }
      return new Uint8Array(await buffer.jpeg({ quality: request.quality }).toBuffer());
    },
    async transcode(request) {
      const mimeType = request.codec === 'vp9' || request.codec === 'av1' ? 'video/webm' : 'video/mp4';
      const extension = mimeType === 'video/webm' ? 'webm' : 'mp4';
      const payload = new TextEncoder().encode(
        `TRANSCODED:${request.codec}:${request.resolution}:${request.bitrate}:${request.fps}`,
      );
      return {
        data: payload,
        mimeType,
        extension,
      };
    },
    async extractMetadata(request) {
      return {
        duration: 1.25,
        width: 320,
        height: 240,
        codec: 'h264',
        fps: '24/1',
        bitrate: '220000',
        audioCodec: null,
        audioSampleRate: null,
        audioChannels: null,
        fileSize: request.videoData.length,
        container: 'mov,mp4,m4a,3gp,3g2,mj2',
        creationTime: '2026-04-02T00:00:00.000Z',
      };
    },
  };
}

function createMockAudioData(size: number = 500): Uint8Array {
  const data = new Uint8Array(size);
  const header = new TextEncoder().encode('MOCK_AUDIO_DATA');
  data.set(header, 0);
  for (let i = header.length; i < size; i++) {
    data[i] = i % 251;
  }
  return data;
}

function createMockAudioProvider(): AudioProcessorProvider {
  return {
    async transcode(request) {
      const payloadSize = Math.max(
        1,
        Math.floor(
          request.audioData.length *
            Math.max(0.2, Math.min(1, Number.parseInt(request.bitrate.replace(/[^0-9]/g, ''), 10) / 320 || 0.4)),
        ),
      );
      const payload = new Uint8Array(payloadSize);
      payload.set(
        new TextEncoder().encode(`AUDIO:${request.codec}:${request.bitrate}:${request.sampleRate}:${request.channels}`),
      );
      const extensionMap = {
        mp3: 'mp3',
        aac: 'm4a',
        opus: 'opus',
        vorbis: 'ogg',
        flac: 'flac',
      } as const;
      const mimeTypeMap = {
        mp3: 'audio/mpeg',
        aac: 'audio/mp4',
        opus: 'audio/opus',
        vorbis: 'audio/ogg',
        flac: 'audio/flac',
      } as const;
      return {
        data: payload,
        extension: extensionMap[request.codec],
        mimeType: mimeTypeMap[request.codec],
      };
    },
    async extractMetadata(request) {
      return {
        duration: 245.8,
        codec: 'aac',
        bitrate: '192000',
        sampleRate: 44100,
        channels: 2,
        fileSize: request.audioData.length,
        format: 'mp4',
        title: 'Audio Track',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        year: '2024',
        genre: 'Unknown',
        creationTime: '2026-04-02T00:00:00.000Z',
      };
    },
    async generateWaveform(request) {
      const sampleCount = request.samples ?? 100;
      const samples = Array.from({ length: sampleCount }, (_, index) => {
        const offset = Math.min(
          request.audioData.length - 1,
          Math.floor((index / sampleCount) * request.audioData.length),
        );
        return Number(((request.audioData[offset] ?? 0) / 255).toFixed(4));
      });
      return {
        samples,
        peakAmplitude: Math.max(...samples),
        duration: 245.8,
      };
    },
  };
}

describe('Video Processor', () => {
  describe('Contract compliance', () => {
    it('should export Processor-compatible video processor', () => {
      const processor = createVideoProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('video');
      expect(processor.supportedMimeTypes).toEqual(VIDEO_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should support correct MIME types', () => {
      const processor = createVideoProcessor();
      expect(supportsProcessor(processor, 'video/mp4')).toBe(true);
      expect(supportsProcessor(processor, 'video/webm')).toBe(true);
      expect(supportsProcessor(processor, 'video/ogg')).toBe(true);
      expect(supportsProcessor(processor, 'video/quicktime')).toBe(true);
      expect(supportsProcessor(processor, 'video/x-matroska')).toBe(true);
      expect(supportsProcessor(processor, 'image/png')).toBe(false);
      expect(supportsProcessor(processor, 'audio/mpeg')).toBe(false);
    });
  });

  describe('Video processing', () => {
    it('should reject unsupported MIME types', async () => {
      const processor = createVideoProcessor();
      const getData = vi.fn();

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/image.png',
          mimeType: 'image/png',
          size: 1000,
          fileName: 'image.png',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
      expect(getData).not.toHaveBeenCalled();
    });

    it('should generate poster thumbnail by default', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: true,
        posterOptions: {
          timestamp: 2.5,
          width: 1280,
          height: 720,
          format: 'jpeg',
          quality: 85,
        },
        transcode: false,
      });

      const videoData = createMockVideoData(5000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'test/video.mp4',
          mimeType: 'video/mp4',
          size: videoData.length,
          fileName: 'video.mp4',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('video-poster');
      expect(result.artifacts[0].mimeType).toBe('image/jpeg');
      expect(result.artifacts[0].storageKey).toBe('test/video-poster.jpg');

      expect(result.artifacts[0].metadata).toMatchObject({
        timestamp: 2.5,
        width: 1280,
        height: 720,
        format: 'jpeg',
        quality: 85,
        sourceFileId: 'file_001',
        sourceVersionId: 'ver_001',
      });

      expect(result.artifacts[0].data.length).toBeGreaterThan(0);
      const posterMetadata = await sharp(result.artifacts[0].data).metadata();
      expect(posterMetadata.width).toBe(1280);
      expect(posterMetadata.height).toBe(720);
    });

    it('should generate poster in PNG format', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: true,
        posterOptions: {
          format: 'png',
          width: 640,
          height: 360,
        },
        transcode: false,
      });

      const videoData = createMockVideoData(5000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_002',
          versionId: 'ver_001',
          storageKey: 'test/video.webm',
          mimeType: 'video/webm',
          size: videoData.length,
          fileName: 'video.webm',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].kind).toBe('video-poster');
      expect(result.artifacts[0].mimeType).toBe('image/png');
      expect(result.artifacts[0].storageKey).toBe('test/video-poster.png');
      const posterMetadata = await sharp(result.artifacts[0].data).metadata();
      expect(posterMetadata.width).toBe(640);
      expect(posterMetadata.height).toBe(360);
    });

    it('should transcode video', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: false,
        transcode: true,
        transcodeOptions: {
          codec: 'h264',
          resolution: '720p',
          bitrate: '2M',
          fps: 30,
        },
      });

      const videoData = createMockVideoData(10000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_003',
          versionId: 'ver_001',
          storageKey: 'test/original.mp4',
          mimeType: 'video/mp4',
          size: videoData.length,
          fileName: 'original.mp4',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('video-transcoded-720p');
      expect(result.artifacts[0].mimeType).toBe('video/mp4');
      expect(result.artifacts[0].storageKey).toBe('test/original-720p.mp4');

      expect(result.artifacts[0].metadata).toMatchObject({
        codec: 'h264',
        resolution: '720p',
        bitrate: '2M',
        fps: 30,
        sourceFileId: 'file_003',
        sourceVersionId: 'ver_001',
      });

      expect(result.artifacts[0].data.length).toBeGreaterThan(0);
    });

    it('should transcode to VP9/WebM', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: false,
        transcode: true,
        transcodeOptions: {
          codec: 'vp9',
          resolution: '1080p',
        },
      });

      const videoData = createMockVideoData(10000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_004',
          versionId: 'ver_001',
          storageKey: 'test/video.mp4',
          mimeType: 'video/mp4',
          size: videoData.length,
          fileName: 'video.mp4',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].kind).toBe('video-transcoded-1080p');
      expect(result.artifacts[0].mimeType).toBe('video/webm');
      expect(result.artifacts[0].storageKey).toBe('test/video-1080p.webm');
    });

    it('should extract video metadata', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: false,
        transcode: false,
        extractMetadata: true,
      });

      const videoData = createMockVideoData(5000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_005',
          versionId: 'ver_001',
          storageKey: 'test/video.mp4',
          mimeType: 'video/mp4',
          size: videoData.length,
          fileName: 'video.mp4',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('video-metadata');
      expect(result.artifacts[0].mimeType).toBe('application/json');
      expect(result.artifacts[0].storageKey).toBe('test/video-metadata.json');

      const metadata = JSON.parse(new TextDecoder().decode(result.artifacts[0].data));
      expect(metadata.duration).toBeGreaterThan(0);
      expect(metadata.width).toBe(320);
      expect(metadata.height).toBe(240);
      expect(typeof metadata.codec).toBe('string');
      expect(metadata).toHaveProperty('fps');
      expect(metadata).toHaveProperty('bitrate');
      expect(metadata).toHaveProperty('audioCodec');
    });

    it('should generate all artifacts when all options enabled', async () => {
      const processor = createVideoProcessor({
        provider: createMockVideoProvider(),
        generatePoster: true,
        transcode: true,
        extractMetadata: true,
      });

      const videoData = createMockVideoData(10000);
      const getData = vi.fn().mockResolvedValue(videoData);

      const result = await processor.process(
        {
          fileId: 'file_006',
          versionId: 'ver_001',
          storageKey: 'test/complete.mp4',
          mimeType: 'video/mp4',
          size: videoData.length,
          fileName: 'complete.mp4',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(3);

      const kinds = result.artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['video-metadata', 'video-poster', 'video-transcoded-720p']);
    });

    it('should handle getData errors gracefully', async () => {
      const processor = createVideoProcessor();
      const getData = vi.fn().mockRejectedValue(new Error('Storage failure'));

      const result = await processor.process(
        {
          fileId: 'file_007',
          versionId: 'ver_001',
          storageKey: 'test/error.mp4',
          mimeType: 'video/mp4',
          size: 1000,
          fileName: 'error.mp4',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage failure');
      expect(result.artifacts).toHaveLength(0);
    });
  });
});

describe('Audio Processor', () => {
  describe('Contract compliance', () => {
    it('should export Processor-compatible audio processor', () => {
      const processor = createAudioProcessor();
      expect(processor).toBeDefined();
      expect(processor.name).toBe('audio');
      expect(processor.supportedMimeTypes).toEqual(AUDIO_SUPPORTED_MIME_TYPES);
      expect(typeof processor.process).toBe('function');
    });

    it('should support correct MIME types', () => {
      const processor = createAudioProcessor();
      expect(supportsProcessor(processor, 'audio/mpeg')).toBe(true);
      expect(supportsProcessor(processor, 'audio/mp3')).toBe(true);
      expect(supportsProcessor(processor, 'audio/mp4')).toBe(true);
      expect(supportsProcessor(processor, 'audio/aac')).toBe(true);
      expect(supportsProcessor(processor, 'audio/ogg')).toBe(true);
      expect(supportsProcessor(processor, 'audio/opus')).toBe(true);
      expect(supportsProcessor(processor, 'audio/wav')).toBe(true);
      expect(supportsProcessor(processor, 'audio/flac')).toBe(true);
      expect(supportsProcessor(processor, 'video/mp4')).toBe(false);
      expect(supportsProcessor(processor, 'image/jpeg')).toBe(false);
    });
  });

  describe('Audio processing', () => {
    it('should reject unsupported MIME types', async () => {
      const processor = createAudioProcessor();
      const getData = vi.fn();

      const result = await processor.process(
        {
          fileId: 'file_008',
          versionId: 'ver_001',
          storageKey: 'test/video.mp4',
          mimeType: 'video/mp4',
          size: 1000,
          fileName: 'video.mp4',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
      expect(getData).not.toHaveBeenCalled();
    });

    it('should transcode audio by default', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: {
          codec: 'aac',
          bitrate: '128k',
          sampleRate: 44100,
          channels: 2,
        },
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_009',
          versionId: 'ver_001',
          storageKey: 'test/audio.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'audio.mp3',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('audio-transcoded-aac');
      expect(result.artifacts[0].mimeType).toBe('audio/mp4');
      expect(result.artifacts[0].storageKey).toBe('test/audio-aac.m4a');

      expect(result.artifacts[0].metadata).toMatchObject({
        codec: 'aac',
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2,
        sourceFileId: 'file_009',
        sourceVersionId: 'ver_001',
      });

      expect(result.artifacts[0].data.length).toBeGreaterThan(0);
    });

    it('should transcode to MP3', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: {
          codec: 'mp3',
          bitrate: '192k',
        },
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_010',
          versionId: 'ver_001',
          storageKey: 'test/audio.flac',
          mimeType: 'audio/flac',
          size: audioData.length,
          fileName: 'audio.flac',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].kind).toBe('audio-transcoded-mp3');
      expect(result.artifacts[0].mimeType).toBe('audio/mpeg');
      expect(result.artifacts[0].storageKey).toBe('test/audio-mp3.mp3');
    });

    it('should transcode to Opus', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: {
          codec: 'opus',
          bitrate: '96k',
        },
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_011',
          versionId: 'ver_001',
          storageKey: 'test/audio.wav',
          mimeType: 'audio/wav',
          size: audioData.length,
          fileName: 'audio.wav',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].kind).toBe('audio-transcoded-opus');
      expect(result.artifacts[0].mimeType).toBe('audio/opus');
      expect(result.artifacts[0].storageKey).toBe('test/audio-opus.opus');
    });

    it('should extract audio metadata', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: false,
        extractMetadata: true,
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_012',
          versionId: 'ver_001',
          storageKey: 'test/song.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'song.mp3',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('audio-metadata');
      expect(result.artifacts[0].mimeType).toBe('application/json');
      expect(result.artifacts[0].storageKey).toBe('test/song-metadata.json');

      const metadata = JSON.parse(new TextDecoder().decode(result.artifacts[0].data));
      expect(metadata).toHaveProperty('duration');
      expect(metadata).toHaveProperty('codec');
      expect(metadata).toHaveProperty('bitrate');
      expect(metadata).toHaveProperty('sampleRate');
      expect(metadata).toHaveProperty('channels');
      expect(metadata).toHaveProperty('title');
      expect(metadata).toHaveProperty('artist');
      expect(metadata).toHaveProperty('album');
    });

    it('should generate waveform data', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: false,
        generateWaveform: true,
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_013',
          versionId: 'ver_001',
          storageKey: 'test/audio.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'audio.mp3',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe('audio-waveform');
      expect(result.artifacts[0].mimeType).toBe('application/json');
      expect(result.artifacts[0].storageKey).toBe('test/audio-waveform.json');

      const waveform = JSON.parse(new TextDecoder().decode(result.artifacts[0].data));
      expect(waveform).toHaveProperty('samples');
      expect(waveform).toHaveProperty('peakAmplitude');
      expect(waveform).toHaveProperty('duration');
      expect(Array.isArray(waveform.samples)).toBe(true);
      expect(waveform.samples.length).toBeGreaterThan(0);
    });

    it('should generate deterministic waveform output for the same input', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: false,
        generateWaveform: true,
      });

      const audioData = createMockAudioData(5000);
      const input = {
        fileId: 'file_013_repeat',
        versionId: 'ver_001',
        storageKey: 'test/audio-repeat.mp3',
        mimeType: 'audio/mpeg',
        size: audioData.length,
        fileName: 'audio-repeat.mp3',
      };

      const first = await processor.process(input, vi.fn().mockResolvedValue(audioData));
      const second = await processor.process(input, vi.fn().mockResolvedValue(audioData));

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(first.artifacts[0].data).toEqual(second.artifacts[0].data);
    });

    it('should generate all artifacts when all options enabled', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        extractMetadata: true,
        generateWaveform: true,
      });

      const audioData = createMockAudioData(5000);
      const getData = vi.fn().mockResolvedValue(audioData);

      const result = await processor.process(
        {
          fileId: 'file_014',
          versionId: 'ver_001',
          storageKey: 'test/complete.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'complete.mp3',
        },
        getData
      );

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(3);

      const kinds = result.artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['audio-metadata', 'audio-transcoded-aac', 'audio-waveform']);
    });

    it('should handle different bitrates correctly', async () => {
      const lowBitrate = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: { codec: 'aac', bitrate: '64k' },
      });

      const highBitrate = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: { codec: 'aac', bitrate: '256k' },
      });

      const audioData = createMockAudioData(10000);
      const getDataLow = vi.fn().mockResolvedValue(audioData);
      const getDataHigh = vi.fn().mockResolvedValue(audioData);

      const resultLow = await lowBitrate.process(
        {
          fileId: 'file_015',
          versionId: 'ver_001',
          storageKey: 'test/audio.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'audio.mp3',
        },
        getDataLow
      );

      const resultHigh = await highBitrate.process(
        {
          fileId: 'file_016',
          versionId: 'ver_001',
          storageKey: 'test/audio.mp3',
          mimeType: 'audio/mpeg',
          size: audioData.length,
          fileName: 'audio.mp3',
        },
        getDataHigh
      );

      expect(resultLow.success).toBe(true);
      expect(resultHigh.success).toBe(true);

      expect(resultLow.artifacts[0].data.length).toBeLessThan(resultHigh.artifacts[0].data.length);
    });

    it('falls back safely when bitrate is malformed', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: true,
        transcodeOptions: { codec: 'aac', bitrate: 'oops' },
      });

      const audioData = createMockAudioData(10000);
      const result = await processor.process(
        {
          fileId: 'file_016_bad_bitrate',
          versionId: 'ver_001',
          storageKey: 'test/audio.wav',
          mimeType: 'audio/wav',
          size: audioData.length,
          fileName: 'audio.wav',
        },
        vi.fn().mockResolvedValue(audioData),
      );

      expect(result.success).toBe(true);
      expect(result.artifacts[0].metadata).toMatchObject({ bitrate: 'oops' });
      expect(result.artifacts[0].data.length).toBeGreaterThan(0);
    });

    it('should handle getData errors gracefully', async () => {
      const processor = createAudioProcessor({ provider: createMockAudioProvider() });
      const getData = vi.fn().mockRejectedValue(new Error('Download failed'));

      const result = await processor.process(
        {
          fileId: 'file_017',
          versionId: 'ver_001',
          storageKey: 'test/error.mp3',
          mimeType: 'audio/mpeg',
          size: 1000,
          fileName: 'error.mp3',
        },
        getData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
      expect(result.artifacts).toHaveLength(0);
    });

    it('skips loading source bytes when every audio operation is disabled', async () => {
      const processor = createAudioProcessor({
        provider: createMockAudioProvider(),
        transcode: false,
        extractMetadata: false,
        generateWaveform: false,
      });
      const getData = vi.fn();

      const result = await processor.process(
        {
          fileId: 'file_audio_disabled',
          versionId: 'ver_001',
          storageKey: 'test/audio.mp3',
          mimeType: 'audio/mpeg',
          size: 1000,
          fileName: 'audio.mp3',
        },
        getData,
      );

      expect(result).toEqual({ success: true, artifacts: [] });
      expect(getData).not.toHaveBeenCalled();
    });
  });
});
