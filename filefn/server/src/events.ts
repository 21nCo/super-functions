import { EventEmitter } from 'events';

export interface FileFnEvent {
  type: string;
  timestamp: string;
  requestId?: string;
}

const SECRET_EVENT_PATTERNS = [
  /https?:\/\/[^\s"']+\?[^\s"']*(?:X-Amz-Signature|Signature|sig|token|key)=[^\s"'&]+/gi,
  /[?&](?:X-Amz-Signature|Signature|sig|token|key)=[^\s"'&]+/gi,
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  /upls_live_[A-Za-z0-9\-_]+/g,
];

function shouldRedactEventKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    lowerKey.includes('token') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('password') ||
    lowerKey.includes('signature') ||
    lowerKey.includes('signedurl') ||
    lowerKey.includes('signed_url') ||
    lowerKey.includes('authorization')
  );
}

function sanitizeEventValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (shouldRedactEventKey(key)) return '[REDACTED]';

  if (typeof value === 'string') {
    let sanitized = value;
    for (const pattern of SECRET_EVENT_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEventValue(key, item));
  }

  if (typeof value === 'object') {
    return sanitizeEventData(value as Record<string, unknown>);
  }

  return value;
}

function sanitizeEventData<T extends Record<string, unknown>>(data: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeEventValue(key, value);
  }
  return sanitized as T;
}

export interface UploadStartedEvent extends FileFnEvent {
  type: 'upload.started';
  uploadSessionId: string;
  fileName: string;
  size: number;
  mimeType: string;
  policy: string;
  principalId?: string;
  tenantId?: string;
}

export interface PartRecordedEvent extends FileFnEvent {
  type: 'part.recorded';
  uploadSessionId: string;
  partNumber: number;
  size: number;
}

export interface FileUploadedEvent extends FileFnEvent {
  type: 'file:uploaded';
  fileId: string;
  versionId: string;
  fileName: string;
  size: number;
  mimeType: string;
  ownerId: string;
  tenantId?: string;
}

export interface FileDeletedEvent extends FileFnEvent {
  type: 'file:deleted';
  fileId: string;
  ownerId: string;
  tenantId?: string;
}

export interface ProcessingStartedEvent extends FileFnEvent {
  type: 'processing.started';
  fileId: string;
  versionId: string;
}

export interface ProcessingCompletedEvent extends FileFnEvent {
  type: 'processing.completed';
  fileId: string;
  versionId: string;
  artifactsCreated: number;
}

export interface ProcessingFailedEvent extends FileFnEvent {
  type: 'processing.failed';
  fileId: string;
  versionId: string;
  error?: string;
}

export type FileFnEventTypes = {
  'upload.started': UploadStartedEvent;
  'part.recorded': PartRecordedEvent;
  'file:uploaded': FileUploadedEvent;
  'file:deleted': FileDeletedEvent;
  'processing.started': ProcessingStartedEvent;
  'processing.completed': ProcessingCompletedEvent;
  'processing.failed': ProcessingFailedEvent;
};

export class FileFnEventEmitter extends EventEmitter {
  emit<K extends keyof FileFnEventTypes>(event: K, payload: FileFnEventTypes[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof FileFnEventTypes>(event: K, listener: (payload: FileFnEventTypes[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof FileFnEventTypes>(event: K, listener: (payload: FileFnEventTypes[K]) => void): this {
    return super.once(event, listener);
  }
}

export function createUploadStartedEvent(
  data: Omit<UploadStartedEvent, 'type' | 'timestamp' | 'requestId'>,
  requestId?: string
): UploadStartedEvent {
  const sanitizedData = sanitizeEventData(data);
  return {
    type: 'upload.started',
    timestamp: new Date().toISOString(),
    requestId,
    ...sanitizedData,
  };
}

export function createPartRecordedEvent(
  data: Omit<PartRecordedEvent, 'type' | 'timestamp' | 'requestId'>,
  requestId?: string
): PartRecordedEvent {
  const sanitizedData = sanitizeEventData(data);
  return {
    type: 'part.recorded',
    timestamp: new Date().toISOString(),
    requestId,
    ...sanitizedData,
  };
}

export function createFileUploadedEvent(
  data: Omit<FileUploadedEvent, 'type' | 'timestamp' | 'requestId'>,
  requestId?: string
): FileUploadedEvent {
  const sanitizedData = sanitizeEventData(data);
  return {
    type: 'file:uploaded',
    timestamp: new Date().toISOString(),
    requestId,
    ...sanitizedData,
  };
}

export function createFileDeletedEvent(
  data: Omit<FileDeletedEvent, 'type' | 'timestamp' | 'requestId'>,
  requestId?: string
): FileDeletedEvent {
  const sanitizedData = sanitizeEventData(data);
  return {
    type: 'file:deleted',
    timestamp: new Date().toISOString(),
    requestId,
    ...sanitizedData,
  };
}

export function createEventEmitter(): FileFnEventEmitter {
  return new FileFnEventEmitter();
}

export type FileFnEventType = keyof FileFnEventTypes;
