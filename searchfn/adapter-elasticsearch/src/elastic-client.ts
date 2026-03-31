import {
  abortedError,
  forbiddenError,
  retryBudgetExhaustedError,
  withRedactedErrorMessage,
} from "./internal/errors";
import { redactSensitive } from "./internal/redaction";
import { runWithRetry, type RetryPolicy } from "./internal/retry";

export type ElasticDialect = "elasticsearch" | "opensearch";

export type ElasticRetryPolicy = RetryPolicy;

export interface AdapterLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ElasticClientOptions {
  node: string;
  dialect: ElasticDialect;
  auth?: { username: string; password: string } | { apiKey: string };
  requestTimeoutMs?: number;
  retry?: ElasticRetryPolicy;
  logger?: AdapterLogger;
}

export interface ElasticRequestOptions {
  method: string;
  path: string;
  body?: unknown;
  contentType?: string;
  signal?: AbortSignal;
  ignoreStatuses?: number[];
}

export interface ElasticResponse<T = unknown> {
  status: number;
  body?: T;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ETIMEDOUT") ||
    err.message.includes("fetch failed")
  );
}

function mergeSignals(
  ...signals: Array<AbortSignal | undefined>
): { signal?: AbortSignal; cleanup(): void } {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (activeSignals.length === 0) {
    return {
      signal: undefined,
      cleanup() {},
    };
  }
  const controller = new AbortController();
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
  const cleanup = () => {
    for (const { signal, listener } of listeners) {
      signal.removeEventListener("abort", listener);
    }
    listeners.length = 0;
  };
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      cleanup();
      return { signal: controller.signal, cleanup };
    }
    const listener = () => {
      cleanup();
      controller.abort();
    };
    signal.addEventListener("abort", listener, { once: true });
    listeners.push({ signal, listener });
  }
  return { signal: controller.signal, cleanup };
}

function parseResponseBody<T>(
  text: string,
  options: { strictJson: boolean },
): T | string | undefined {
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (options.strictJson) {
      const invalidJsonError = new Error("Elastic backend returned invalid JSON");
      (invalidJsonError as Error & { cause?: unknown }).cause = error;
      throw invalidJsonError;
    }
    return text;
  }
}

function buildRequestUrl(base: string, path: string): URL {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(normalizedPath, normalizedBase);
}

export class ElasticClient {
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: ElasticClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  async request<T = unknown>(opts: ElasticRequestOptions): Promise<ElasticResponse<T>> {
    const ignoreStatuses = new Set(opts.ignoreStatuses ?? []);
    const startedAt = Date.now();

    const response = await runWithRetry(
      () => this.execute<T>(opts),
      {
        policy: this.options.retry,
        isRetryableResult: (result) => {
          return RETRYABLE_STATUS.has((result as ElasticResponse).status) && !ignoreStatuses.has((result as ElasticResponse).status);
        },
        isRetryableError,
        exhaustedError: retryBudgetExhaustedError(),
        onRetry: ({ attempt, delayMs, reason }) => {
          this.options.logger?.warn("adapter.retry", redactSensitive({
            backend: this.options.dialect,
            operation: `${opts.method} ${opts.path}`,
            attempt,
            delayMs,
            reason,
          }));
        },
      },
    );

    if ((response.status === 401 || response.status === 403) && !ignoreStatuses.has(response.status)) {
      throw forbiddenError("Backend authorization failed");
    }
    if (response.status >= 400 && !ignoreStatuses.has(response.status)) {
      throw withRedactedErrorMessage(
        `Elastic backend request failed with status ${response.status}`,
        typeof response.body === "string" ? response.body : JSON.stringify(response.body),
      );
    }

    this.options.logger?.debug("adapter.request", redactSensitive({
      backend: this.options.dialect,
      operation: `${opts.method} ${opts.path}`,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));

    return response;
  }

  private async execute<T>(opts: ElasticRequestOptions): Promise<ElasticResponse<T>> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.requestTimeoutMs);
    const merged = mergeSignals(timeoutController.signal, opts.signal);

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.options.auth) {
      if ("apiKey" in this.options.auth) {
        headers.authorization = `ApiKey ${this.options.auth.apiKey}`;
      } else {
        const token = Buffer.from(`${this.options.auth.username}:${this.options.auth.password}`).toString(
          "base64",
        );
        headers.authorization = `Basic ${token}`;
      }
    }

    let body: string | undefined;
    if (opts.body !== undefined) {
      if (typeof opts.body === "string") {
        body = opts.body;
      } else {
        body = JSON.stringify(opts.body);
      }
      headers["content-type"] = opts.contentType ?? "application/json";
    }

    try {
      const url = buildRequestUrl(this.options.node, opts.path);
      const response = await fetch(url, {
        method: opts.method,
        headers,
        body,
        signal: merged.signal,
      });

      const text = await response.text();
      const parsed = parseResponseBody<T>(text, {
        strictJson: response.ok,
      });

      return {
        status: response.status,
        body: parsed as T | undefined,
      };
    } catch (error) {
      if (opts.signal?.aborted) {
        throw abortedError();
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      merged.cleanup();
    }
  }
}
