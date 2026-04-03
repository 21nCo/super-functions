import type {
  ArtifactDescriptor,
  RenderDescriptor,
  FileFnClientConfig,
  InitUploadResponse,
  UploadStatusResponse,
  SignPartResponse,
  CompletePartResponse,
  CompleteUploadResponse,
  AbortUploadResponse,
} from "./types.js";
import {
  resolveRetryOptions,
  withRetry,
  type ResolvedRetryOptions,
} from "./retry.js";

export interface FileFnErrorDetails {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class FileFnHttpError extends Error {
  public readonly code?: string;
  public readonly requestId?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "FileFnHttpError";

    // Extract structured error from canonical envelope
    if (body && typeof body === "object" && "error" in body) {
      const envelope = body as {
        ok: false;
        error: FileFnErrorDetails;
        requestId?: string;
      };
      this.code = envelope.error.code;
      this.details = envelope.error.details;
      if (envelope.requestId) {
        this.requestId = envelope.requestId;
      }
    }
  }
}

export interface HttpClient {
  initUpload(
    params: {
      policy: string;
      fileName: string;
      size: number;
      mimeType: string;
      metadata?: Record<string, unknown>;
      fileId?: string;
      idempotencyKey?: string;
    },
    signal?: AbortSignal,
  ): Promise<InitUploadResponse>;

  getFile(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;

  listArtifacts(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<ArtifactDescriptor[]>;

  downloadUrl(
    fileId: string,
    options?: { versionId?: string },
    signal?: AbortSignal,
  ): Promise<{ url: string }>;

  downloadArtifact(
    fileId: string,
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<{ url: string; headers?: Record<string, string> }>;

  getRenderDescriptor(
    fileId: string,
    options: { intent: string; versionId?: string },
    signal?: AbortSignal,
  ): Promise<RenderDescriptor>;

  deleteFile(fileId: string, signal?: AbortSignal): Promise<void>;

  getUploadStatus(
    uploadSessionId: string,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<UploadStatusResponse>;

  signPart(
    uploadSessionId: string,
    partNumber: number,
    contentLength: number,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<SignPartResponse>;

  completePart(
    uploadSessionId: string,
    partNumber: number,
    etag: string,
    size: number,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<CompletePartResponse>;

  completeUpload(
    uploadSessionId: string,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<CompleteUploadResponse>;

  abortUpload(
    uploadSessionId: string,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<AbortUploadResponse>;

  uploadPartToSignedUrl(
    url: string,
    headers: Record<string, string>,
    body: Blob,
    uploadSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<{ etag: string; recorded?: boolean }>;
}

export function createHttpClient(config: FileFnClientConfig): HttpClient {
  const retryOptions = resolveRetryOptions(config.retryOptions);
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function readResponseBody(response: Response): Promise<{
    rawBody: string;
    parsedBody: unknown;
    isJson: boolean;
  }> {
    if (typeof response.text === "function") {
      const rawBody = await response.text();
      if (!rawBody) {
        return { rawBody, parsedBody: undefined, isJson: false };
      }

      try {
        return { rawBody, parsedBody: JSON.parse(rawBody), isJson: true };
      } catch {
        if (typeof response.json === "function") {
          try {
            const parsedBody = await response.json();
            return { rawBody, parsedBody, isJson: true };
          } catch {
            // Fall back to the raw text body when a second parse is not possible.
          }
        }
        return { rawBody, parsedBody: rawBody, isJson: false };
      }
    }

    if (typeof response.json === "function") {
      const parsedBody = await response.json();
      return {
        rawBody: typeof parsedBody === "string" ? parsedBody : "",
        parsedBody,
        isJson: true,
      };
    }

    return { rawBody: "", parsedBody: undefined, isJson: false };
  }

  async function getHeaders(includeJsonContentType = false): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }

    if (config.getAuthHeaders) {
      const authHeaders = await config.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }

    return headers;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    options: ResolvedRetryOptions = retryOptions,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return withRetry(
      async () => {
        const hasJsonBody = body !== undefined;
        const headers = await getHeaders(hasJsonBody);
        if (extraHeaders) {
          Object.assign(headers, extraHeaders);
        }
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal,
        });

        if (!response.ok) {
          const { rawBody, parsedBody, isJson } = await readResponseBody(response);
          const errorBody = rawBody ? (isJson ? parsedBody : rawBody) : parsedBody;
          throw new FileFnHttpError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorBody,
          );
        }

        const contentLength =
          typeof response.headers?.get === "function"
            ? response.headers.get("content-length")
            : null;
        const contentType =
          typeof response.headers?.get === "function"
            ? response.headers.get("content-type") || ""
            : "";
        if (response.status === 204 || contentLength === '0') {
          return undefined as T;
        }

        const { rawBody, parsedBody, isJson } = await readResponseBody(response);
        if (!rawBody) {
          if (parsedBody === undefined) {
            return undefined as T;
          }
          if (!isJson) {
            return parsedBody as T;
          }
        }

        const json = parsedBody;

        // Unwrap canonical envelope { ok: true, data: T }
        if (
          json &&
          typeof json === "object" &&
          "ok" in json &&
          json.ok === true &&
          "data" in json
        ) {
          return json.data as T;
        }

        // If not a canonical envelope, return as-is for backwards compatibility
        return json as T;
      },
      options,
      signal,
    );
  }

  return {
    async initUpload(params, signal) {
      return request<InitUploadResponse>(
        "POST",
        "/upload/init",
        params,
        signal,
      );
    },

    async getFile(fileId, signal) {
      return request<Record<string, unknown>>(
        "GET",
        `/${fileId}`,
        undefined,
        signal,
      );
    },

    async listArtifacts(fileId, signal) {
      const response = await request<{ artifacts: ArtifactDescriptor[] }>(
        "GET",
        `/${fileId}/artifacts`,
        undefined,
        signal,
      );
      return response.artifacts;
    },

    async downloadUrl(fileId, options, signal) {
      const path = options?.versionId
        ? `/${fileId}/versions/${options.versionId}/download`
        : `/${fileId}/download`;
      return request<{ url: string }>("GET", path, undefined, signal);
    },

    async downloadArtifact(fileId, artifactId, signal) {
      return request<{ url: string; headers?: Record<string, string> }>(
        "GET",
        `/${fileId}/artifacts/${artifactId}/download`,
        undefined,
        signal,
      );
    },

    async getRenderDescriptor(fileId, options, signal) {
      const search = new URLSearchParams({ intent: options.intent });
      if (options.versionId) {
        search.set("versionId", options.versionId);
      }
      return request<RenderDescriptor>(
        "GET",
        `/${fileId}/render?${search.toString()}`,
        undefined,
        signal,
      );
    },

    async deleteFile(fileId, signal) {
      await request<void>("DELETE", `/${fileId}`, undefined, signal);
    },

    async getUploadStatus(uploadSessionId, uploadSessionToken, signal) {
      return request<UploadStatusResponse>(
        "GET",
        `/upload/${uploadSessionId}/status`,
        undefined,
        signal,
        retryOptions,
        uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : undefined,
      );
    },

    async signPart(uploadSessionId, partNumber, contentLength, uploadSessionToken, signal) {
      return request<SignPartResponse>(
        "POST",
        `/upload/${uploadSessionId}/parts/${partNumber}/sign`,
        { contentLength },
        signal,
        retryOptions,
        uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : undefined,
      );
    },

    async completePart(uploadSessionId, partNumber, etag, size, uploadSessionToken, signal) {
      return request<CompletePartResponse>(
        "POST",
        `/upload/${uploadSessionId}/parts/${partNumber}/complete`,
        { etag, size },
        signal,
        retryOptions,
        uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : undefined,
      );
    },

    async completeUpload(uploadSessionId, uploadSessionToken, signal) {
      return request<CompleteUploadResponse>(
        "POST",
        `/upload/${uploadSessionId}/complete`,
        undefined,
        signal,
        retryOptions,
        uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : undefined,
      );
    },

    async abortUpload(uploadSessionId, uploadSessionToken, signal) {
      return request<AbortUploadResponse>(
        "POST",
        `/upload/${uploadSessionId}/abort`,
        undefined,
        signal,
        retryOptions,
        uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : undefined,
      );
    },

    async uploadPartToSignedUrl(url, headers, body, uploadSessionToken, signal) {
      return withRetry(
        async () => {
          // If URL is relative (proxy upload), prepend baseUrl
          const finalUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;

          const requestHeaders = {
            ...headers,
            ...(uploadSessionToken ? { "x-upload-session-token": uploadSessionToken } : {}),
          };
          const response = await fetch(finalUrl, {
            method: "PUT",
            headers: requestHeaders,
            body,
            signal,
          });

          if (!response.ok) {
            throw new FileFnHttpError(
              `Upload failed: HTTP ${response.status}`,
              response.status,
            );
          }

          // Check if response is JSON (proxy upload)
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const json = await response.json();
            // Canonical envelope check
            if (
              json &&
              typeof json === "object" &&
              "ok" in json &&
              json.ok === true &&
              "data" in json
            ) {
              return {
                etag: json.data.etag,
                recorded: json.data.recorded,
              };
            }
            // Fallback or raw json
            return { etag: json.etag || "", recorded: json.recorded };
          }

          return { etag: response.headers.get("ETag") || "" };
        },
        retryOptions,
        signal,
      );
    },
  };
}
