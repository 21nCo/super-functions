export interface ProcessorInput {
  fileId: string;
  versionId: string;
  storageKey: string;
  mimeType: string;
  size: number;
  fileName: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessorOutputArtifact {
  kind: string;
  data: Uint8Array;
  mimeType: string;
  storageKey: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessorResult {
  success: boolean;
  artifacts: ProcessorOutputArtifact[];
  error?: string;
}

export interface Processor {
  name: string;
  supportedMimeTypes: string[];
  process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult>;
}

export interface ProcessingConfig {
  processors: Processor[];
  enabled?: boolean;
}

export interface ProcessingJobInput {
  fileId: string;
  versionId: string;
  storageKey: string;
  mimeType: string;
  size: number;
  fileName: string;
  tenantId?: string;
}

export interface ProcessingJobResult {
  fileId: string;
  versionId: string;
  success: boolean;
  artifactsCreated: number;
  errors?: string[];
}

export interface ThumbnailConfig {
  sizes?: ThumbnailSize[];
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface PdfPreviewConfig {
  sizes?: ThumbnailSize[];
  density?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface ThumbnailSize {
  name: string;
  width: number;
  height: number;
}

export interface CompressionConfig {
  algorithm?: 'gzip' | 'deflate';
  level?: number;
}

export interface OCRConfig {
  language?: string;
  outputFormat?: 'text' | 'hocr' | 'json' | 'all';
  provider?: OCRProcessorProvider;
}

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

export interface VideoTranscodeOptions {
  codec?: 'h264' | 'h265' | 'vp9' | 'av1';
  resolution?: '1080p' | '720p' | '480p' | '360p';
  bitrate?: string;
  fps?: number;
  includeAudio?: boolean;
  audioCodec?: 'aac' | 'opus' | 'copy';
}

export interface VideoPosterOptions {
  timestamp?: number;
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export interface VideoConfig {
  generatePoster?: boolean;
  posterOptions?: VideoPosterOptions;
  transcode?: boolean;
  transcodeOptions?: VideoTranscodeOptions;
  extractMetadata?: boolean;
  provider?: VideoProcessorProvider;
}

export interface VideoPosterRequest {
  input: ProcessorInput;
  videoData: Uint8Array;
  timestamp: number;
  duration?: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

export interface VideoTranscodeRequest {
  input: ProcessorInput;
  videoData: Uint8Array;
  codec: 'h264' | 'h265' | 'vp9' | 'av1';
  resolution: '1080p' | '720p' | '480p' | '360p';
  bitrate: string;
  fps: number;
  includeAudio?: boolean;
  audioCodec?: 'aac' | 'opus' | 'copy';
}

export interface VideoMetadataRequest {
  input: ProcessorInput;
  videoData: Uint8Array;
}

export interface VideoTranscodeResult {
  data: Uint8Array;
  mimeType: string;
  extension: string;
}

export interface VideoProcessorProvider {
  generatePoster(request: VideoPosterRequest): Promise<Uint8Array>;
  transcode(request: VideoTranscodeRequest): Promise<VideoTranscodeResult>;
  extractMetadata(request: VideoMetadataRequest): Promise<Record<string, unknown>>;
}

export interface OCRProviderRequest {
  input: ProcessorInput;
  imageData: Uint8Array;
  language: string;
  includeHOCR: boolean;
}

export interface OCRProviderResult {
  text: string;
  confidence: number;
  hocr?: string | null;
}

export interface OCRProcessorProvider {
  recognize(request: OCRProviderRequest): Promise<OCRProviderResult>;
}

export interface AudioTranscodeOptions {
  codec?: 'mp3' | 'aac' | 'opus' | 'vorbis' | 'flac';
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
}

export interface AudioConfig {
  transcode?: boolean;
  transcodeOptions?: AudioTranscodeOptions;
  extractMetadata?: boolean;
  generateWaveform?: boolean;
  provider?: AudioProcessorProvider;
}

export interface AudioMetadataRequest {
  input: ProcessorInput;
  audioData: Uint8Array;
}

export interface AudioWaveformRequest {
  input: ProcessorInput;
  audioData: Uint8Array;
  samples?: number;
}

export interface AudioTranscodeRequest {
  input: ProcessorInput;
  audioData: Uint8Array;
  codec: 'mp3' | 'aac' | 'opus' | 'vorbis' | 'flac';
  bitrate: string;
  sampleRate: number;
  channels: number;
}

export interface AudioWaveformResult {
  samples: number[];
  peakAmplitude: number;
  duration: number;
}

export interface AudioTranscodeResult {
  data: Uint8Array;
  mimeType: string;
  extension: string;
}

export interface AudioProcessorProvider {
  transcode(request: AudioTranscodeRequest): Promise<AudioTranscodeResult>;
  extractMetadata(request: AudioMetadataRequest): Promise<Record<string, unknown>>;
  generateWaveform(request: AudioWaveformRequest): Promise<AudioWaveformResult>;
}
