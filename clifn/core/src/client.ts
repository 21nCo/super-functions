import { MissingProfileError, type CredentialStore } from "./credentials.js";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T | null;
  headers: Headers;
}

export interface ApiClient {
  request<T = unknown>(options: ApiRequestOptions): Promise<ApiResponse<T>>;
  get<T = unknown>(path: string, query?: ApiRequestOptions["query"]): Promise<ApiResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  delete<T = unknown>(path: string): Promise<ApiResponse<T>>;
}

export interface ApiClientConfig {
  baseUrl?: string;
  credentials?: CredentialStore;
  profile?: string;
  apiKey?: string;
  projectId?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class HttpFailureError extends Error {
  readonly code = "CLIFN_HTTP_FAILURE";
  readonly status: number;
  readonly url: string;
  readonly responseBody: unknown;

  constructor(status: number, url: string, responseBody: unknown) {
    super(`HTTP request failed (${status}) for ${url}`);
    this.name = "HttpFailureError";
    this.status = status;
    this.url = url;
    this.responseBody = responseBody;
  }
}

export class HttpRequestError extends Error {
  readonly code = "CLIFN_HTTP_REQUEST_ERROR";
  readonly url: string;

  constructor(url: string, message: string, cause?: unknown) {
    super(`HTTP request error for ${url}: ${message}`);
    this.name = "HttpRequestError";
    this.url = url;
    this.cause = cause;
  }
}

function resolveAuth(config: ApiClientConfig): { baseUrl: string; apiKey: string } {
  if (config.baseUrl && config.apiKey) {
    return { baseUrl: config.baseUrl, apiKey: config.apiKey };
  }

  if (!config.credentials) {
    throw new HttpRequestError(
      "unknown",
      "api client requires either {baseUrl, apiKey} or a credentials store",
    );
  }

  const profileName = config.profile ?? "default";
  const profile = config.credentials.getProfile(profileName);
  return {
    baseUrl: profile.backend,
    apiKey: profile.key,
  };
}

function buildUrl(baseUrl: string, path: string, query?: ApiRequestOptions["query"]): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith("//")) {
    throw new HttpRequestError(baseUrl, "request path must be relative");
  }

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOneShotBody(value: unknown): boolean {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isBodyInitLike(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof FormData !== "undefined" && value instanceof FormData) ||
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
  );
}

function serializeRequestBody(body: unknown): {
  body: BodyInit | undefined;
  defaultContentType?: string;
} {
  if (body === undefined) {
    return { body: undefined };
  }

  if (isBodyInitLike(body)) {
    return { body };
  }

  return {
    body: JSON.stringify(body),
    defaultContentType: "application/json",
  };
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const auth = resolveAuth(config);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const retries = config.retries ?? 1;
  const retryDelayMs = config.retryDelayMs ?? 150;
  const timeoutMs = config.timeoutMs ?? 8_000;

  if (!fetchImpl) {
    throw new HttpRequestError(auth.baseUrl, "global fetch is not available");
  }

  async function doRequest<T = unknown>(options: ApiRequestOptions): Promise<ApiResponse<T>> {
    const method = options.method ?? "GET";
    let url: string;
    try {
      url = buildUrl(auth.baseUrl, options.path, options.query);
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "invalid request url";
      throw new HttpRequestError(auth.baseUrl, message, error);
    }
    const maxRetries = isOneShotBody(options.body) ? 0 : retries;

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const serializedBody = serializeRequestBody(options.body);
        const headers = new Headers();

        for (const [key, value] of Object.entries(config.defaultHeaders ?? {})) {
          headers.set(key, value);
        }

        for (const [key, value] of Object.entries(options.headers ?? {})) {
          headers.set(key, value);
        }

        if (!headers.has("authorization")) {
          headers.set("Authorization", `Bearer ${auth.apiKey}`);
        }

        if (config.projectId) {
          headers.set("X-Project-ID", config.projectId);
        }

        if (serializedBody.defaultContentType && !headers.has("content-type")) {
          headers.set("Content-Type", serializedBody.defaultContentType);
        }

        const response = await fetchImpl(url, {
          method,
          headers,
          body: serializedBody.body,
          signal: controller.signal,
        });

        const data = await readResponseBody(response);
        if (!response.ok) {
          if (attempt < maxRetries && shouldRetry(response.status)) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          throw new HttpFailureError(response.status, url, data);
        }

        return {
          status: response.status,
          data: data as T,
          headers: response.headers,
        };
      } catch (error) {
        if (error instanceof MissingProfileError || error instanceof HttpFailureError) {
          throw error;
        }
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        const message = error instanceof Error ? error.message : "unknown error";
        throw new HttpRequestError(url, message, error);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return {
    request: doRequest,
    get<T = unknown>(path: string, query?: ApiRequestOptions["query"]): Promise<ApiResponse<T>> {
      return doRequest<T>({ method: "GET", path, query });
    },
    post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return doRequest<T>({ method: "POST", path, body });
    },
    put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return doRequest<T>({ method: "PUT", path, body });
    },
    patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
      return doRequest<T>({ method: "PATCH", path, body });
    },
    delete<T = unknown>(path: string): Promise<ApiResponse<T>> {
      return doRequest<T>({ method: "DELETE", path });
    },
  };
}
