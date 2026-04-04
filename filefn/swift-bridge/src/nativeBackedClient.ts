import {
  FILEFN_BRIDGE_PROTOCOL,
  isBridgeHandshakeResult,
  nextBridgeRequestId,
  type CreateNativeBackedFileFnClientOptions,
  type FileFnBridgeBus,
  type FileFnBridgeError,
  type FileFnBridgeEventEnvelope,
  type FileFnBridgeHandshakeResult,
  type FileFnBridgeMethod,
  type FileFnBridgeRequestEnvelope,
  type FileFnBridgeResponseEnvelope,
  type FileFnBridgeUploadAbortResult,
  type FileFnBridgeUploadStartPayload,
  type FileFnBridgeUploadStartResult,
  type FileFnBridgeUploadStatusResult,
  type NativeBackedFileFnClient,
} from "./protocol.js";
import { createWKWebViewBridgeBus } from "./wkwebviewBus.js";

export class FileFnBridgeClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: FileFnBridgeError["code"], message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "FileFnBridgeClientError";
    this.code = code;
    this.details = details;
  }
}

function assertBridgeSuccess(
  response: FileFnBridgeResponseEnvelope,
): asserts response is Extract<FileFnBridgeResponseEnvelope, { ok: true }> {
  if (!response.ok) {
    throw new FileFnBridgeClientError(
      response.error.code,
      response.error.message,
      response.error.details,
    );
  }
}

function buildRequest(
  method: FileFnBridgeRequestEnvelope["method"],
  payload?: unknown,
): FileFnBridgeRequestEnvelope {
  return {
    protocol: FILEFN_BRIDGE_PROTOCOL,
    id: nextBridgeRequestId(),
    method,
    payload,
  };
}

export function createNativeBackedFileFnClient(
  options: CreateNativeBackedFileFnClientOptions,
  bus: FileFnBridgeBus = createWKWebViewBridgeBus(options),
): NativeBackedFileFnClient {
  let handshakeResult: FileFnBridgeHandshakeResult | null = null;

  const request = async (
    method: Exclude<FileFnBridgeMethod, "handshake">,
    payload?: unknown,
  ): Promise<unknown> => {
    if (handshakeResult == null) {
      throw new FileFnBridgeClientError(
        "BRIDGE_HANDSHAKE_REQUIRED",
        "handshake must complete before native-backed requests",
      );
    }

    const response = await bus.request(buildRequest(method, payload));
    assertBridgeSuccess(response);
    return response.result;
  };

  return {
    async handshake() {
      const response = await bus.request(
        buildRequest("handshake", {
          clientId: options.clientId,
          mode: options.mode,
          baseURL: options.baseURL,
        }),
      );

      assertBridgeSuccess(response);
      if (!isBridgeHandshakeResult(response.result)) {
        throw new FileFnBridgeClientError(
          "BRIDGE_PROTOCOL_MISMATCH",
          "Native bridge returned an invalid handshake payload",
        );
      }

      handshakeResult = response.result;
      return handshakeResult;
    },
    request,
    listFiles(payload) {
      return request("file.list", payload);
    },
    getFile(fileId) {
      return request("file.get", { fileId });
    },
    async deleteFile(fileId) {
      return request("file.delete", { fileId }) as Promise<{ deleted: true }>;
    },
    listVersions(fileId) {
      return request("version.list", { fileId });
    },
    getVersion(fileId, versionId) {
      return request("version.get", { fileId, versionId });
    },
    downloadURL(fileId, options) {
      return request("download.resolve", { fileId, versionId: options?.versionId });
    },
    listArtifacts(fileId) {
      return request("artifact.list", { fileId });
    },
    downloadArtifact(fileId, artifactId) {
      return request("artifact.download", { fileId, artifactId });
    },
    resolveRenderable(fileId, payload) {
      return request("render.resolve", { fileId, ...payload });
    },
    listPolicies() {
      return request("policy.list");
    },
    getStorageQuota() {
      return request("quota.get");
    },
    createGrant(fileId, grantRequest) {
      return request("grant.create", { fileId, request: grantRequest });
    },
    listGrants(fileId) {
      return request("grant.list", { fileId });
    },
    async revokeGrant(fileId, permissionId) {
      return request("grant.revoke", { fileId, permissionId }) as Promise<{ revoked: true }>;
    },
    createShareLink(fileId, shareRequest) {
      return request("share.create", { fileId, request: shareRequest });
    },
    listShareLinks(fileId) {
      return request("share.list", { fileId });
    },
    async revokeShareLink(fileId, token) {
      return request("share.revoke", { fileId, token }) as Promise<{ revoked: true }>;
    },
    resolveShareDownload(token) {
      return request("share.download.resolve", { token });
    },
    triggerProcessing(fileId, processingRequest) {
      return request("processing.trigger", { fileId, request: processingRequest });
    },
    startUpload(payload: FileFnBridgeUploadStartPayload) {
      return request("upload.start", payload) as Promise<FileFnBridgeUploadStartResult>;
    },
    getUploadStatus(uploadID: string) {
      return request("upload.status", { uploadID }) as Promise<FileFnBridgeUploadStatusResult>;
    },
    abortUpload(uploadID: string) {
      return request("upload.abort", { uploadID }) as Promise<FileFnBridgeUploadAbortResult>;
    },
    healthCheck(payload?: unknown) {
      return request("health.check", payload);
    },
    subscribe(handler: (event: FileFnBridgeEventEnvelope) => void) {
      return bus.subscribe(handler);
    },
  };
}
