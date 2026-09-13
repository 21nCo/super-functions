import { DATAFN_ROUTE_TICKET_HEADER, type DatafnRouteProvider } from "@datafn/core";
import { DatafnRegionalRouteCache, DatafnRegionalTransportError } from "./regional-route.js";
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
  routeProvider?: DatafnRouteProvider;
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
  readonly regionalRoutes?: DatafnRegionalRouteCache;

  dispose(): void { this.regionalRoutes?.dispose(); }

  constructor(
    private readonly baseUrl: string,
    private readonly options: DatafnHttpTransportOptions = {},
  ) {
    if (baseUrl.endsWith("/")) {
      this.baseUrl = baseUrl.slice(0, -1);
    }
    if (options.routeProvider) this.regionalRoutes = new DatafnRegionalRouteCache(options.routeProvider);
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
    canRetryRoute = true,
    serializedBody = this.serializeBody(body),
  ): Promise<unknown> {
    try {
      const headers = await this.resolveHeaders();
      const route = await this.regionalRoutes?.get();
      const url = `${route?.httpUrl ?? this.baseUrl}/${endpoint}`;
      if (route) {
        if (this.options.credentials === "include") throw new Error("DATAFN_ROUTE_COOKIE_CREDENTIALS_FORBIDDEN");
        for (const name of ["x-datafn-routing-assertion", "x-datafn-routing-namespace", "x-datafn-routing-region", "x-datafn-routing-epoch"]) headers.delete(name);
        headers.delete("cookie");
        headers.set(DATAFN_ROUTE_TICKET_HEADER, route.ticket);
      }
      const response = await this.customFetch(url, {
        method: "POST",
        headers,
        credentials: route ? "omit" : await this.resolveCredentials(),
        ...(route ? { redirect: "error" as const, cache: "no-store" as const } : {}),
        body: serializedBody,
        signal,
      }).catch(error => {
        if (route && error?.name !== "AbortError") throw new DatafnRegionalTransportError("DATAFN_REGIONAL_ENDPOINT_UNAVAILABLE");
        throw error;
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const event = { endpoint, url, status: response.status, result };
        const routingCode = result?.error?.code;
        if (route && ["DATAFN_ROUTE_TICKET_EXPIRED", "DATAFN_REGION_MISMATCH", "DATAFN_NAMESPACE_MOVING"].includes(routingCode)) {
          this.regionalRoutes!.invalidate(route);
          if (canRetryRoute && result?.error?.details?.executionStarted === false &&
            ((response.status === 401 && routingCode === "DATAFN_ROUTE_TICKET_EXPIRED") ||
              (response.status === 409 && routingCode !== "DATAFN_ROUTE_TICKET_EXPIRED"))) {
            return this.post(endpoint, body, signal, canRetryAuth, false, serializedBody);
          }
        }
        if (route && typeof routingCode === "string" && routingCode.startsWith("DATAFN_ROUTE_")) {
          this.options.onError?.(event);
          return result;
        }
        if (
          canRetryAuth &&
          (!route || ["query", "search", "pull", "clone", "reconcile"].includes(endpoint) || result?.error?.details?.executionStarted === false) &&
          (response.status === 401 || response.status === 403) &&
          this.options.auth?.onUnauthorized
        ) {
          const decision = await this.options.auth.onUnauthorized(event);
          if (decision === "retry") {
            return this.post(endpoint, body, signal, false, canRetryRoute, serializedBody);
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
