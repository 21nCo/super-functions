export const FILEFN_BRIDGE_PROTOCOL = "filefn-bridge/v1" as const;

export const FILEFN_BRIDGE_CAPABILITIES = [
  "files",
  "uploads",
  "render",
  "shares",
  "grants",
  "processing",
  "events",
  "health",
] as const;

export const FILEFN_BRIDGE_METHODS = [
  "handshake",
  "file.list",
  "file.get",
  "file.delete",
  "version.list",
  "version.get",
  "download.resolve",
  "artifact.list",
  "artifact.download",
  "render.resolve",
  "policy.list",
  "quota.get",
  "grant.create",
  "grant.list",
  "grant.revoke",
  "share.create",
  "share.list",
  "share.revoke",
  "share.download.resolve",
  "processing.trigger",
  "upload.start",
  "upload.status",
  "upload.abort",
  "health.check",
] as const;

export const FILEFN_BRIDGE_EVENT_NAMES = [
  "bridge.ready",
  "bridge.closed",
  "upload.progress",
  "upload.completed",
  "upload.failed",
  "upload.cancelled",
  "health.changed",
] as const;

export type FileFnBridgeMethod = (typeof FILEFN_BRIDGE_METHODS)[number];
export type FileFnBridgeEventName = (typeof FILEFN_BRIDGE_EVENT_NAMES)[number];
export type FileFnBridgeCapability = (typeof FILEFN_BRIDGE_CAPABILITIES)[number];
export type FileFnBridgeErrorCode =
  | "BRIDGE_PROTOCOL_MISMATCH"
  | "BRIDGE_METHOD_UNSUPPORTED"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_HANDSHAKE_REQUIRED"
  | "BRIDGE_INVALID_SOURCE"
  | "NATIVE_ASSET_NOT_FOUND"
  | "BRIDGE_UPLOAD_NOT_FOUND"
  | "BRIDGE_INVALID_REQUEST"
  | "FILEFN_CLIENT_ERROR"
  | "FILEFN_CAPABILITY_UNAVAILABLE"
  | (string & {});

export interface FileFnBridgeError {
  code: FileFnBridgeErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface FileFnBridgeRequestEnvelope {
  protocol: typeof FILEFN_BRIDGE_PROTOCOL;
  id: string;
  method: FileFnBridgeMethod;
  payload?: unknown;
}

export type FileFnBridgeResponseEnvelope =
  | {
      protocol: typeof FILEFN_BRIDGE_PROTOCOL;
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      protocol: typeof FILEFN_BRIDGE_PROTOCOL;
      id: string;
      ok: false;
      error: FileFnBridgeError;
    };

export interface FileFnBridgeEventEnvelope {
  protocol: typeof FILEFN_BRIDGE_PROTOCOL;
  event: FileFnBridgeEventName;
  payload: unknown;
}

export interface CreateWKWebViewBridgeBusOptions {
  handlerName?: string;
  timeoutMs?: number;
}

export interface FileFnBridgeHandshakePayload {
  clientId: string;
  mode: "native-backed" | "web-owned";
  baseURL: string;
}

export interface FileFnBridgeHandshakeResult {
  bridgeVersion: number;
  uploadOwner: "native";
  authOwner: "native";
  previewScheme: string;
  capabilities: string[];
}

export interface FileFnBridgeUploadStartPayload {
  policy: string;
  assetHandle?: string;
  background?: boolean;
  fileId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface FileFnBridgeUploadStartResult {
  uploadID: string;
  fileId: string;
}

export interface FileFnBridgeUploadStatusResult {
  uploadID: string;
  fileId: string;
  state: string;
  bytesSent: number;
  bytesExpected: number;
  background: boolean;
  result?: { fileId: string; versionId: string } | null;
  error?: FileFnBridgeError | null;
}

export interface FileFnBridgeUploadAbortResult {
  uploadID: string;
  aborted: boolean;
}

export interface FileFnBridgeBus {
  request(message: FileFnBridgeRequestEnvelope): Promise<FileFnBridgeResponseEnvelope>;
  subscribe(handler: (event: FileFnBridgeEventEnvelope) => void): () => void;
}

export interface CreateNativeBackedFileFnClientOptions
  extends CreateWKWebViewBridgeBusOptions,
    FileFnBridgeHandshakePayload {}

export interface NativeBackedFileFnClient {
  handshake(): Promise<FileFnBridgeHandshakeResult>;
  request(method: Exclude<FileFnBridgeMethod, "handshake">, payload?: unknown): Promise<unknown>;
  listFiles(payload?: { cursor?: string; limit?: number }): Promise<unknown>;
  getFile(fileId: string): Promise<unknown>;
  deleteFile(fileId: string): Promise<{ deleted: true }>;
  listVersions(fileId: string): Promise<unknown>;
  getVersion(fileId: string, versionId: string): Promise<unknown>;
  downloadURL(fileId: string, options?: { versionId?: string }): Promise<unknown>;
  listArtifacts(fileId: string): Promise<unknown>;
  downloadArtifact(fileId: string, artifactId: string): Promise<unknown>;
  resolveRenderable(fileId: string, payload: { intent: string; versionId?: string }): Promise<unknown>;
  listPolicies(): Promise<unknown>;
  getStorageQuota(): Promise<unknown>;
  createGrant(fileId: string, request: Record<string, unknown>): Promise<unknown>;
  listGrants(fileId: string): Promise<unknown>;
  revokeGrant(fileId: string, permissionId: string): Promise<{ revoked: true }>;
  createShareLink(fileId: string, request: Record<string, unknown>): Promise<unknown>;
  listShareLinks(fileId: string): Promise<unknown>;
  revokeShareLink(fileId: string, token: string): Promise<{ revoked: true }>;
  resolveShareDownload(token: string): Promise<unknown>;
  triggerProcessing(fileId: string, request: Record<string, unknown>): Promise<unknown>;
  startUpload(payload: FileFnBridgeUploadStartPayload): Promise<FileFnBridgeUploadStartResult>;
  getUploadStatus(uploadID: string): Promise<FileFnBridgeUploadStatusResult>;
  abortUpload(uploadID: string): Promise<FileFnBridgeUploadAbortResult>;
  healthCheck(payload?: unknown): Promise<unknown>;
  subscribe(handler: (event: FileFnBridgeEventEnvelope) => void): () => void;
}

declare global {
  interface Window {
    __filefnBridgeReceive__?: (message: unknown) => void;
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (message: unknown) => void }>;
    };
  }
}

const BRIDGE_METHOD_SET = new Set<string>(FILEFN_BRIDGE_METHODS);
const BRIDGE_EVENT_SET = new Set<string>(FILEFN_BRIDGE_EVENT_NAMES);

export function isFileFnBridgeMethod(method: string): method is FileFnBridgeMethod {
  return BRIDGE_METHOD_SET.has(method);
}

export function isBridgeEventEnvelope(value: unknown): value is FileFnBridgeEventEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === FILEFN_BRIDGE_PROTOCOL &&
    typeof (value as { event?: unknown }).event === "string" &&
    BRIDGE_EVENT_SET.has((value as { event: string }).event)
  );
}

export function isBridgeResponseEnvelope(value: unknown): value is FileFnBridgeResponseEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === FILEFN_BRIDGE_PROTOCOL &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

export function isBridgeHandshakePayload(value: unknown): value is FileFnBridgeHandshakePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { clientId?: unknown }).clientId === "string" &&
    typeof (value as { baseURL?: unknown }).baseURL === "string" &&
    ((value as { mode?: unknown }).mode === "native-backed" ||
      (value as { mode?: unknown }).mode === "web-owned")
  );
}

export function isBridgeHandshakeResult(value: unknown): value is FileFnBridgeHandshakeResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { bridgeVersion?: unknown }).bridgeVersion === "number" &&
    (value as { uploadOwner?: unknown }).uploadOwner === "native" &&
    (value as { authOwner?: unknown }).authOwner === "native" &&
    typeof (value as { previewScheme?: unknown }).previewScheme === "string" &&
    Array.isArray((value as { capabilities?: unknown }).capabilities)
  );
}

export function createBridgeErrorResponse(
  id: string,
  code: FileFnBridgeErrorCode,
  message: string,
  details?: Record<string, unknown>,
): FileFnBridgeResponseEnvelope {
  return {
    protocol: FILEFN_BRIDGE_PROTOCOL,
    id,
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

export function nextBridgeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
