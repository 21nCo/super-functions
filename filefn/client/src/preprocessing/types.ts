export type PendingLocalSourceKind = 'image' | 'pdf' | 'binary';
export type PendingLocalPreviewBehavior =
  | 'direct-image'
  | 'direct-pdf'
  | 'deterministic-placeholder'
  | 'download-only';

export interface PendingLocalSourceMetadata {
  mode: 'local-object-url';
  kind: PendingLocalSourceKind;
  fileName: string;
  mimeType: string;
  size: number;
  opfsDataFile: string;
  previewBehavior: PendingLocalPreviewBehavior;
}

export interface UploadPreprocessorContext {
  fileId: string;
  file: File | Blob;
  fileName: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
  localSource: PendingLocalSourceMetadata;
}

export interface UploadPreprocessorResult {
  file: File | Blob;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  localSource?: Partial<PendingLocalSourceMetadata>;
}

export interface UploadPreprocessor {
  name: string;
  matches(context: UploadPreprocessorContext): boolean | Promise<boolean>;
  process(context: UploadPreprocessorContext): Promise<UploadPreprocessorResult>;
}

export interface HeicConversionInput {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  targetMimeType: 'image/jpeg';
  quality: number;
}

export type HeicConversionResult =
  | Blob
  | File
  | {
      file: File | Blob;
      fileName?: string;
      mimeType?: string;
    };

export type HeicConversionFunction = (
  input: HeicConversionInput,
) => Promise<HeicConversionResult>;

export interface HeicPreprocessorOptions {
  converter?: HeicConversionFunction;
  quality?: number;
}
