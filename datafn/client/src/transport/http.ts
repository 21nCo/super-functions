import type { DatafnRemoteAdapter } from "../client.js";

/**
 * Default HTTP Transport for DataFn
 * Uses global fetch() to communicate with a remote DataFn server.
 */
export class DefaultHttpTransport implements DatafnRemoteAdapter {
  private customFetch: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options?: { fetch?: typeof fetch },
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

  private async post(endpoint: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      const response = await this.customFetch(`${this.baseUrl}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal, // QRY-001: Pass signal to fetch
      });

      if (!response.ok) {
        // Try to parse error envelope if available
        try {
          const errorBody = await response.json();
          // If it looks like a DataFn envelope, return it (it will be unwrapped/checked by caller)
          if (
            errorBody &&
            typeof errorBody === "object" &&
            (errorBody.error || errorBody.ok === false)
          ) {
            return errorBody;
          }
        } catch {
          // ignore JSON parse error
        }
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (err: any) {
      // QRY-001: Convert AbortError to DFQL_ABORTED
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
}
