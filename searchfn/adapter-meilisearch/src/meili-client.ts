import {
  abortedError,
  forbiddenError,
  retryBudgetExhaustedError,
  withRedactedErrorMessage,
} from "./internal/errors";
import { redactSensitive } from "./internal/redaction";
import { runWithRetry, type RetryPolicy } from "./internal/retry";

export type MeiliRetryPolicy = RetryPolicy;

export interface AdapterLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface MeiliClientOptions {
  host: string;
  apiKey?: string;
  requestTimeoutMs?: number;
  taskTimeoutMs?: number;
  retry?: MeiliRetryPolicy;
  logger?: AdapterLogger;
}

export interface MeiliRequestOptions {
  method: string;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  ignoreStatuses?: number[];
}

export interface MeiliResponse<T = unknown> {
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

function safePath(path: string): string {
  return redactSensitive(path);
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

function parseResponseBody<T>(text: string): T | string | undefined {
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortedError());
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(abortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class MeiliClient {
  private readonly requestTimeoutMs: number;
  private readonly taskTimeoutMs: number;

  constructor(private readonly options: MeiliClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.taskTimeoutMs = options.taskTimeoutMs ?? Math.max(this.requestTimeoutMs * 10, 120_000);
  }

  async request<T = unknown>(opts: MeiliRequestOptions): Promise<MeiliResponse<T>> {
    const ignoreStatuses = new Set(opts.ignoreStatuses ?? []);
    const startedAt = Date.now();

    const response = await runWithRetry(
      () => this.execute<T>(opts),
      {
        policy: this.options.retry,
        isRetryableResult: (result) => {
          return RETRYABLE_STATUS.has((result as MeiliResponse).status) && !ignoreStatuses.has((result as MeiliResponse).status);
        },
        isRetryableError,
        exhaustedError: retryBudgetExhaustedError(),
        onRetry: ({ attempt, delayMs, reason }) => {
          this.options.logger?.warn("adapter.retry", redactSensitive({
            backend: "meilisearch",
            operation: `${opts.method} ${safePath(opts.path)}`,
            attempt,
            delayMs,
            reason,
          }));
        },
      },
    );

    if ((response.status === 401 || response.status === 403) && !ignoreStatuses.has(response.status)) {
      throw forbiddenError("Meilisearch authorization failed");
    }
    if (response.status >= 400 && !ignoreStatuses.has(response.status)) {
      throw withRedactedErrorMessage(
        `Meilisearch request failed with status ${response.status}`,
        response.body,
      );
    }

    this.options.logger?.debug("adapter.request", redactSensitive({
      backend: "meilisearch",
      operation: `${opts.method} ${safePath(opts.path)}`,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));

    return response;
  }

  async waitForTask(taskUid: number, signal?: AbortSignal): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.taskTimeoutMs) {
      if (signal?.aborted) {
        throw abortedError();
      }
      const response = await this.request<{ status: string; error?: { message?: string } }>({
        method: "GET",
        path: `/tasks/${taskUid}`,
        signal,
      });

      const status = response.body?.status;
      if (status === "succeeded") return;
      if (status === "failed") {
        throw withRedactedErrorMessage("Meilisearch task failed", response.body?.error?.message ?? "unknown");
      }
      if (signal?.aborted) {
        throw abortedError();
      }
      await delay(50, signal);
    }
    throw retryBudgetExhaustedError();
  }

  private async execute<T>(opts: MeiliRequestOptions): Promise<MeiliResponse<T>> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.requestTimeoutMs);
    const merged = mergeSignals(timeoutController.signal, opts.signal);

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.options.apiKey) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }

    let body: string | undefined;
    if (opts.body !== undefined) {
      body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      headers["content-type"] = "application/json";
    }

    try {
      const url = new URL(opts.path, this.options.host.endsWith("/") ? this.options.host : `${this.options.host}/`);
      const response = await fetch(url, {
        method: opts.method,
        headers,
        body,
        signal: merged.signal,
      });

      const text = await response.text();
      const parsed = parseResponseBody<T>(text);

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
