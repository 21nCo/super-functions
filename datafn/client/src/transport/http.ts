import type { DatafnRemoteAdapter } from "../client.js";
import type {
  HttpTransportAuthProvider,
  HttpTransportErrorEvent
} from "@superfunctions/http";

export type DatafnHttpHeaders =
  | HeadersInit
  | null
  | undefined
  | (() => HeadersInit | null | undefined | Promise<HeadersInit | null | undefined>);

export interface DatafnHttpTransportOptions {
  fetch?: typeof fetch;
  headers?: DatafnHttpHeaders;
  credentials?: RequestCredentials;
  auth?: HttpTransportAuthProvider;
  onError?(event: HttpTransportErrorEvent): void;
}

/**
 * Default HTTP Transport for DataFn
 * Uses global fetch() to communicate with a remote DataFn server.
 */
export class DefaultHttpTransport implements DatafnRemoteAdapter {
  private customFetch: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly options: DatafnHttpTransportOptions = {},
  ) {
    if (baseUrl.endsWith("/")) {
      this.baseUrl = baseUrl.slice(0, -1);
    }
    this.customFetch = options?.fetch || globalThis.fetch.bind(globalThis);
  }

  async query(q: unknown): Promise<unknown> {
    // QRY-001: Extract signal from query if present
    let signal: AbortSignal | undefined;
    if (typeof q === "object" && q !== null && "signal" in q) {
      signal = (q as any).signal;
    }
    return this.post("query", q, signal);
  }

  async mutation(m: unknown): Promise<unknown> {
    return this.post("mutation", m);
  }

  async transact(t: unknown): Promise<unknown> {
    return this.post("transact", t);
  }

  async seed(payload: unknown): Promise<unknown> {
    return this.post("seed", payload);
  }

  async clone(payload: unknown): Promise<unknown> {
    return this.post("clone", payload);
  }

  async pull(payload: unknown): Promise<unknown> {
    return this.post("pull", payload);
  }

  async push(payload: unknown): Promise<unknown> {
    return this.post("push", payload);
  }

  async reconcile(payload: unknown): Promise<unknown> {
    return this.post("reconcile", payload);
  }

  async search(payload: unknown): Promise<unknown> {
    let signal: AbortSignal | undefined;
    if (typeof payload === "object" && payload !== null && "signal" in payload) {
      signal = (payload as any).signal;
    }
    return this.post("search", payload, signal);
  }

  async publicLinks(endpoint: string, payload: unknown): Promise<unknown> {
    return this.post(endpoint, payload);
  }

  private async post(
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
    canRetryAuth = true,
  ): Promise<unknown> {
    try {
      const url = `${this.baseUrl}/${endpoint}`;
      const response = await this.customFetch(url, {
        method: "POST",
        headers: await this.resolveHeaders(),
        credentials: await this.resolveCredentials(),
        body: this.serializeBody(body),
        signal,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const event = { endpoint, url, status: response.status, result };
        if (
          canRetryAuth &&
          (response.status === 401 || response.status === 403) &&
          this.options.auth?.onUnauthorized
        ) {
          const decision = await this.options.auth.onUnauthorized(event);
          if (decision === "retry") {
            return this.post(endpoint, body, signal, false);
          }
        }
        this.options.onError?.(event);
        if (
          result &&
          typeof result === "object" &&
          ("error" in result || (result as { ok?: unknown }).ok === false)
        ) {
          return result;
        }
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      return result;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return {
          ok: false,
          error: {
            code: "DFQL_ABORTED",
            message: endpoint === "search" ? "Search request aborted" : "Query aborted",
            details: { path: "signal" },
          },
        };
      }
      throw err;
    }
  }

  private serializeBody(body: unknown): string {
    return JSON.stringify(body) ?? "null";
  }

  private async resolveHeaders(): Promise<Headers> {
    const headers = new Headers({ "Content-Type": "application/json" });
    this.mergeHeaders(headers, await this.resolveConfiguredHeaders());
    this.mergeHeaders(headers, await this.options.auth?.getRequestHeaders?.());
    return headers;
  }

  private async resolveConfiguredHeaders(): Promise<HeadersInit | null | undefined> {
    const configuredHeaders = this.options.headers;
    return typeof configuredHeaders === "function"
      ? await configuredHeaders()
      : configuredHeaders;
  }

  private async resolveCredentials(): Promise<RequestCredentials | undefined> {
    return this.options.credentials ?? (await this.options.auth?.getCredentials?.());
  }

  private mergeHeaders(headers: Headers, input: HeadersInit | null | undefined) {
    if (!input) return;
    new Headers(input).forEach((value, key) => {
      headers.set(key, value);
    });
  }
}
