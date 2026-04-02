import { describe, it, expect, beforeEach } from 'vitest';
import { createProcessingService } from '../src/processing/service.js';
import {
  createVideoProcessor,
  createAudioProcessor,
  type VideoConfig,
  type AudioConfig,
} from '@filefn/processing';
import type { StorageAdapter } from '@superfunctions/storage';
import type { Adapter } from '@superfunctions/db';
import { createEventEmitter } from '../src/events.js';

function createMockDb(): Adapter {
  const storage = new Map<string, Map<string, unknown>>();

  return {
    async create({ model, data, namespace }) {
      const key = `${namespace}:${model}`;
      if (!storage.has(key)) storage.set(key, new Map());
      const id = (data as any).artifactId || (data as any).fileId || Math.random().toString();
      storage.get(key)!.set(id, data);
      return data;
    },
    async findOne({ model, where, namespace }) {
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return null;
      for (const record of records.values()) {
        const match = where.every((w: any) => (record as any)[w.field] === w.value);
        if (match) return record as any;
      }
      return null;
    },
    async findMany({ model, where, namespace, orderBy }) {
      void orderBy;
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return [];
      if (!where || where.length === 0) {
        return Array.from(records.values()) as any[];
      }
      const filtered = [];
      for (const record of records.values()) {
        const match = where.every((w: any) => (record as any)[w.field] === w.value);
        if (match) filtered.push(record);
      }
      return filtered as any[];
    },
    async update() {
      return {} as any;
    },
    async upsert() {
      return {} as any;
    },
    async delete() {},
    async deleteMany() {},
    getDialect() {
      return 'sqlite' as any;
    },
    isReady() {
      return Promise.resolve(true);
    },
    close() {
      return Promise.resolve();
    },
  } as Adapter;
}

function createMockStorage(): StorageAdapter & { setData: (key: string, data: Uint8Array) => void } {
  const objects = new Map<string, Uint8Array>();

  return {
    name: 'mock',
    capabilities: {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: true,
      proxyStreamingDownload: true,
    },
    async statObject({ key }) {
      const data = objects.get(key);
      if (!data) throw new Error('Not found');
      return { key, size: data.length };
    },
    async deleteObject({ key }) {
      objects.delete(key);
    },
    async signDownloadUrl({ key }) {
      return { url: `https://storage.test/download/${key}` };
    },
    async openDownloadStream({ key }) {
      const data = objects.get(key);
      if (!data) throw new Error('Not found');
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
    async openUploadStream({ key }) {
      const chunks: Uint8Array[] = [];
      return new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
        close() {
          const total = chunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          objects.set(key, merged);
        },
      });
    },
    setData(key: string, data: Uint8Array) {
      objects.set(key, data);
    },
  } as StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
}

function createMockVideoData(size: number = 5000): Uint8Array {
  const data = new Uint8Array(size);
  const header = new TextEncoder().encode('MOCK_VIDEO_DATA');
  data.set(header, 0);
  for (let i = header.length; i < size; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return data;
}

function createMockAudioData(size: number = 3000): Uint8Array {
  const data = new Uint8Array(size);
  const header = new TextEncoder().encode('MOCK_AUDIO_DATA');
  data.set(header, 0);
  for (let i = header.length; i < size; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return data;
}

describe('Video Processing Integration', () => {
  let db: Adapter;
  let storage: StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    events = createEventEmitter();
  });

  describe('Video processor with server integration', () => {
    it('should process video and create poster artifact', async () => {
      const videoConfig: VideoConfig = {
        generatePoster: true,
        posterOptions: {
          timestamp: 1.5,
          width: 1280,
          height: 720,
          format: 'jpeg',
        },
        transcode: false,
      };

      const processor = createVideoProcessor(videoConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testVideo = createMockVideoData(10000);
      storage.setData('tenant/file_001/ver_001.mp4', testVideo);

      const result = await service.runProcessing(
        {
          fileId: 'file_001',
          versionId: 'ver_001',
          storageKey: 'tenant/file_001/ver_001.mp4',
          mimeType: 'video/mp4',
          size: testVideo.length,
          fileName: 'video.mp4',
        },
        { principalId: 'user_123', requestId: 'req_001' }
      );

      expect(result.artifactsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_001', {});
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].kind).toBe('video-poster');
      expect(artifacts[0].mimeType).toBe('image/jpeg');
      expect(artifacts[0].storageKey).toBe('tenant/file_001/ver_001-poster.jpg');
    });

    it('should transcode video and create transcoded artifact', async () => {
      const videoConfig: VideoConfig = {
        generatePoster: false,
        transcode: true,
        transcodeOptions: {
          codec: 'h264',
          resolution: '720p',
          bitrate: '2M',
          fps: 30,
        },
      };

      const processor = createVideoProcessor(videoConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testVideo = createMockVideoData(10000);
      storage.setData('tenant/file_002/ver_001.mp4', testVideo);

      const result = await service.runProcessing(
        {
          fileId: 'file_002',
          versionId: 'ver_001',
          storageKey: 'tenant/file_002/ver_001.mp4',
          mimeType: 'video/mp4',
          size: testVideo.length,
          fileName: 'video.mp4',
        },
        { principalId: 'user_123', requestId: 'req_002' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_002', {});
      expect(artifacts[0].kind).toBe('video-transcoded-720p');
      expect(artifacts[0].mimeType).toBe('video/mp4');
      expect(artifacts[0].storageKey).toBe('tenant/file_002/ver_001-720p.mp4');
    });

    it('should extract video metadata', async () => {
      const videoConfig: VideoConfig = {
        generatePoster: false,
        transcode: false,
        extractMetadata: true,
      };

      const processor = createVideoProcessor(videoConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testVideo = createMockVideoData(5000);
      storage.setData('tenant/file_003/ver_001.webm', testVideo);

      const result = await service.runProcessing(
        {
          fileId: 'file_003',
          versionId: 'ver_001',
          storageKey: 'tenant/file_003/ver_001.webm',
          mimeType: 'video/webm',
          size: testVideo.length,
          fileName: 'video.webm',
        },
        { principalId: 'user_123', requestId: 'req_003' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_003', {});
      expect(artifacts[0].kind).toBe('video-metadata');
      expect(artifacts[0].mimeType).toBe('application/json');
    });

    it('should create all video artifacts when all options enabled', async () => {
      const videoConfig: VideoConfig = {
        generatePoster: true,
        transcode: true,
        extractMetadata: true,
      };

      const processor = createVideoProcessor(videoConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testVideo = createMockVideoData(10000);
      storage.setData('tenant/file_004/ver_001.mp4', testVideo);

      const result = await service.runProcessing(
        {
          fileId: 'file_004',
          versionId: 'ver_001',
          storageKey: 'tenant/file_004/ver_001.mp4',
          mimeType: 'video/mp4',
          size: testVideo.length,
          fileName: 'full-video.mp4',
        },
        { principalId: 'user_123', requestId: 'req_004' }
      );

      expect(result.artifactsCreated).toBe(3);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_004', {});
      expect(artifacts).toHaveLength(3);

      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['video-metadata', 'video-poster', 'video-transcoded-720p']);
    });

    it('should transcode to multiple resolutions', async () => {
      const processor720 = createVideoProcessor({
        generatePoster: false,
        transcode: true,
        transcodeOptions: { resolution: '720p' },
      });

      const processor480 = createVideoProcessor({
        generatePoster: false,
        transcode: true,
        transcodeOptions: { resolution: '480p' },
      });

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor720, processor480],
        enabled: true,
      });

      const testVideo = createMockVideoData(15000);
      storage.setData('tenant/file_005/ver_001.mp4', testVideo);

      const result = await service.runProcessing(
        {
          fileId: 'file_005',
          versionId: 'ver_001',
          storageKey: 'tenant/file_005/ver_001.mp4',
          mimeType: 'video/mp4',
          size: testVideo.length,
          fileName: 'multi-res.mp4',
        },
        { principalId: 'user_123', requestId: 'req_005' }
      );

      expect(result.artifactsCreated).toBe(2);

      const artifacts = await service.listArtifacts('file_005', {});
      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['video-transcoded-480p', 'video-transcoded-720p']);
    });
  });
});

describe('Audio Processing Integration', () => {
  let db: Adapter;
  let storage: StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    events = createEventEmitter();
  });

  describe('Audio processor with server integration', () => {
    it('should transcode audio and create artifact', async () => {
      const audioConfig: AudioConfig = {
        transcode: true,
        transcodeOptions: {
          codec: 'aac',
          bitrate: '128k',
          sampleRate: 44100,
          channels: 2,
        },
      };

      const processor = createAudioProcessor(audioConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testAudio = createMockAudioData(5000);
      storage.setData('tenant/file_006/ver_001.mp3', testAudio);

      const result = await service.runProcessing(
        {
          fileId: 'file_006',
          versionId: 'ver_001',
          storageKey: 'tenant/file_006/ver_001.mp3',
          mimeType: 'audio/mpeg',
          size: testAudio.length,
          fileName: 'audio.mp3',
        },
        { principalId: 'user_123', requestId: 'req_006' }
      );

      expect(result.artifactsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_006', {});
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].kind).toBe('audio-transcoded-aac');
      expect(artifacts[0].mimeType).toBe('audio/mp4');
      expect(artifacts[0].storageKey).toBe('tenant/file_006/ver_001-aac.m4a');
    });

    it('should extract audio metadata', async () => {
      const audioConfig: AudioConfig = {
        transcode: false,
        extractMetadata: true,
      };

      const processor = createAudioProcessor(audioConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testAudio = createMockAudioData(5000);
      storage.setData('tenant/file_007/ver_001.flac', testAudio);

      const result = await service.runProcessing(
        {
          fileId: 'file_007',
          versionId: 'ver_001',
          storageKey: 'tenant/file_007/ver_001.flac',
          mimeType: 'audio/flac',
          size: testAudio.length,
          fileName: 'audio.flac',
        },
        { principalId: 'user_123', requestId: 'req_007' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_007', {});
      expect(artifacts[0].kind).toBe('audio-metadata');
      expect(artifacts[0].mimeType).toBe('application/json');
    });

    it('should generate audio waveform', async () => {
      const audioConfig: AudioConfig = {
        transcode: false,
        generateWaveform: true,
      };

      const processor = createAudioProcessor(audioConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testAudio = createMockAudioData(5000);
      storage.setData('tenant/file_008/ver_001.mp3', testAudio);

      const result = await service.runProcessing(
        {
          fileId: 'file_008',
          versionId: 'ver_001',
          storageKey: 'tenant/file_008/ver_001.mp3',
          mimeType: 'audio/mpeg',
          size: testAudio.length,
          fileName: 'podcast.mp3',
        },
        { principalId: 'user_123', requestId: 'req_008' }
      );

      expect(result.artifactsCreated).toBe(1);

      const artifacts = await service.listArtifacts('file_008', {});
      expect(artifacts[0].kind).toBe('audio-waveform');
      expect(artifacts[0].mimeType).toBe('application/json');
    });

    it('should create all audio artifacts when all options enabled', async () => {
      const audioConfig: AudioConfig = {
        transcode: true,
        extractMetadata: true,
        generateWaveform: true,
      };

      const processor = createAudioProcessor(audioConfig);
      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processor],
        enabled: true,
      });

      const testAudio = createMockAudioData(5000);
      storage.setData('tenant/file_009/ver_001.wav', testAudio);

      const result = await service.runProcessing(
        {
          fileId: 'file_009',
          versionId: 'ver_001',
          storageKey: 'tenant/file_009/ver_001.wav',
          mimeType: 'audio/wav',
          size: testAudio.length,
          fileName: 'full-audio.wav',
        },
        { principalId: 'user_123', requestId: 'req_009' }
      );

      expect(result.artifactsCreated).toBe(3);
      expect(result.errors).toHaveLength(0);

      const artifacts = await service.listArtifacts('file_009', {});
      expect(artifacts).toHaveLength(3);

      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['audio-metadata', 'audio-transcoded-aac', 'audio-waveform']);
    });

    it('should transcode to multiple formats', async () => {
      const processorAAC = createAudioProcessor({
        transcode: true,
        transcodeOptions: { codec: 'aac', bitrate: '128k' },
      });

      const processorMP3 = createAudioProcessor({
        transcode: true,
        transcodeOptions: { codec: 'mp3', bitrate: '192k' },
      });

      const service = createProcessingService({
        db,
        storage,
        events,
        processors: [processorAAC, processorMP3],
        enabled: true,
      });

      const testAudio = createMockAudioData(8000);
      storage.setData('tenant/file_010/ver_001.flac', testAudio);

      const result = await service.runProcessing(
        {
          fileId: 'file_010',
          versionId: 'ver_001',
          storageKey: 'tenant/file_010/ver_001.flac',
          mimeType: 'audio/flac',
          size: testAudio.length,
          fileName: 'multi-format.flac',
        },
        { principalId: 'user_123', requestId: 'req_010' }
      );

      expect(result.artifactsCreated).toBe(2);

      const artifacts = await service.listArtifacts('file_010', {});
      const kinds = artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(['audio-transcoded-aac', 'audio-transcoded-mp3']);
    });
  });
});

describe('Combined Video and Audio Processing', () => {
  let db: Adapter;
  let storage: StorageAdapter & { setData: (key: string, data: Uint8Array) => void };
  let events: ReturnType<typeof createEventEmitter>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    events = createEventEmitter();
  });

  it('should handle mixed media processing with video and audio processors', async () => {
    const videoProcessor = createVideoProcessor({ generatePoster: true, transcode: false });
    const audioProcessor = createAudioProcessor({ transcode: true, extractMetadata: false });

    const service = createProcessingService({
      db,
      storage,
      events,
      processors: [videoProcessor, audioProcessor],
      enabled: true,
    });

    const testVideo = createMockVideoData(8000);
    storage.setData('tenant/file_011/ver_001.mp4', testVideo);

    const videoResult = await service.runProcessing(
      {
        fileId: 'file_011',
        versionId: 'ver_001',
        storageKey: 'tenant/file_011/ver_001.mp4',
        mimeType: 'video/mp4',
        size: testVideo.length,
        fileName: 'movie.mp4',
      },
      { principalId: 'user_123', requestId: 'req_011' }
    );

    expect(videoResult.artifactsCreated).toBe(1);

    const testAudio = createMockAudioData(5000);
    storage.setData('tenant/file_012/ver_001.mp3', testAudio);

    const audioResult = await service.runProcessing(
      {
        fileId: 'file_012',
        versionId: 'ver_001',
        storageKey: 'tenant/file_012/ver_001.mp3',
        mimeType: 'audio/mpeg',
        size: testAudio.length,
        fileName: 'song.mp3',
      },
      { principalId: 'user_123', requestId: 'req_012' }
    );

    expect(audioResult.artifactsCreated).toBe(1);

    const videoArtifacts = await service.listArtifacts('file_011', {});
    const audioArtifacts = await service.listArtifacts('file_012', {});

    expect(videoArtifacts[0].kind).toBe('video-poster');
    expect(audioArtifacts[0].kind).toBe('audio-transcoded-aac');
  });

  it('should retrieve video and audio artifact download URLs', async () => {
    const videoProcessor = createVideoProcessor({ generatePoster: true, transcode: false });
    const audioProcessor = createAudioProcessor({ transcode: true });

    const service = createProcessingService({
      db,
      storage,
      events,
      processors: [videoProcessor, audioProcessor],
      enabled: true,
    });

    const testVideo = createMockVideoData(5000);
    storage.setData('tenant/file_013/ver_001.mp4', testVideo);

    await service.runProcessing(
      {
        fileId: 'file_013',
        versionId: 'ver_001',
        storageKey: 'tenant/file_013/ver_001.mp4',
        mimeType: 'video/mp4',
        size: testVideo.length,
        fileName: 'video.mp4',
      },
      { principalId: 'user_123', requestId: 'req_013' }
    );

    const testAudio = createMockAudioData(4000);
    storage.setData('tenant/file_014/ver_001.mp3', testAudio);

    await service.runProcessing(
      {
        fileId: 'file_014',
        versionId: 'ver_001',
        storageKey: 'tenant/file_014/ver_001.mp3',
        mimeType: 'audio/mpeg',
        size: testAudio.length,
        fileName: 'song.mp3',
      },
      { principalId: 'user_123', requestId: 'req_014' }
    );

    const videoArtifacts = await service.listArtifacts('file_013', {});
    const audioArtifacts = await service.listArtifacts('file_014', {});
    const videoArtifactId = videoArtifacts[0].artifactId;
    const audioArtifactId = audioArtifacts.find((artifact) => artifact.kind.startsWith('audio-transcoded-'))?.artifactId;

    const { url: videoUrl } = await service.getArtifactDownloadUrl(videoArtifactId, {});
    const { url: audioUrl } = await service.getArtifactDownloadUrl(audioArtifactId!, {});

    expect(videoUrl).toContain('tenant/file_013/ver_001-poster.jpg');
    expect(videoUrl).toMatch(/^https:\/\/storage\.test\/download\//);
    expect(audioUrl).toContain('tenant/file_014/ver_001-aac.m4a');
    expect(audioUrl).toMatch(/^https:\/\/storage\.test\/download\//);
  });
});
