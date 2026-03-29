import type { DatafnRemoteAdapter } from "@datafn/client";
import { getDemoHeaders, type DemoIdentity } from "./api";

type DemoRemoteAdapterOptions = {
  baseUrl: string;
  getIdentity: () => DemoIdentity;
  fetchImpl?: typeof fetch;
};

export class DemoRemoteAdapter implements DatafnRemoteAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DemoRemoteAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  query(q: unknown): Promise<unknown> {
    let signal: AbortSignal | undefined;
    if (typeof q === "object" && q !== null && "signal" in q) {
      signal = (q as { signal?: AbortSignal }).signal;
    }
    return this.post("query", q, signal);
  }

  mutation(m: unknown): Promise<unknown> {
    return this.post("mutation", m);
  }

  transact(t: unknown): Promise<unknown> {
    return this.post("transact", t);
  }

  seed(payload: unknown): Promise<unknown> {
    return this.post("seed", payload);
  }

  clone(payload: unknown): Promise<unknown> {
    return this.post("clone", payload);
  }

  pull(payload: unknown): Promise<unknown> {
    return this.post("pull", payload);
  }

  push(payload: unknown): Promise<unknown> {
    return this.post("push", payload);
  }

  reconcile(payload: unknown): Promise<unknown> {
    return this.post("reconcile", payload);
  }

  search(payload: unknown): Promise<unknown> {
    let signal: AbortSignal | undefined;
    if (typeof payload === "object" && payload !== null && "signal" in payload) {
      signal = (payload as { signal?: AbortSignal }).signal;
    }
    return this.post("search", payload, signal);
  }

  private async post(
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const identity = this.options.getIdentity();
    const baseUrl = this.options.baseUrl.endsWith("/")
      ? this.options.baseUrl.slice(0, -1)
      : this.options.baseUrl;

    try {
      const response = await this.fetchImpl(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDemoHeaders(identity),
        },
        body: JSON.stringify(body),
        signal,
      });

      const rawPayload = await response.text();
      let payload: unknown = null;
      if (rawPayload.trim().length > 0) {
        try {
          payload = JSON.parse(rawPayload);
        } catch {
          if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
          }
          throw new Error(`Invalid JSON response from ${endpoint}`);
        }
      }

      if (!response.ok) {
        if (
          payload &&
          typeof payload === "object" &&
          ("error" in payload || ("ok" in payload && payload.ok === false))
        ) {
          return payload;
        }
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      return payload;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
      ) {
        return {
          ok: false,
          error: {
            code: "DFQL_ABORTED",
            message: endpoint === "search" ? "Search request aborted" : "Query aborted",
            details: { path: "signal" },
          },
        };
      }
      throw error;
    }
  }
}
