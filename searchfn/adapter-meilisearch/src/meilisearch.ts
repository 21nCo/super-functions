import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchDefaults,
  SearchAllResult,
  IndexParams,
  SearchParams,
  SearchAllParams,
  RemoveParams,
  InitializeParams,
} from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
import { normalizeObservability, type ObservabilityInput, type ObservationLogger } from "@superfunctions/observability";
import { MeiliClient, type MeiliRetryPolicy, type AdapterLogger } from "./meili-client";
import { createHash } from "node:crypto";

export interface MeilisearchAdapterOptions {
  host: string;
  apiKey?: string;
  indexPrefix?: string;
  requestTimeoutMs?: number;
  taskTimeoutMs?: number;
  retry?: MeiliRetryPolicy;
  observability?: ObservabilityInput;
  /** Construct-time defaults applied when query params are omitted. */
  defaults?: SearchDefaults;
}

interface MeiliTaskResult {
  taskUid: number;
}

interface MeiliSearchResponse {
  hits: Array<Record<string, unknown>>;
}

function sanitizeResourceName(resource: string): string {
  const base = resource.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "resource";
  const hash = createHash("sha1").update(resource).digest("hex").slice(0, 8);
  return `${base}_${hash}`;
}

function coerceId(value: unknown): string | number {
  const asString = String(value);
  if (/^(0|[1-9]\d*)$/.test(asString)) {
    const asNumber = Number(asString);
    if (Number.isSafeInteger(asNumber) && String(asNumber) === asString) {
      return asNumber;
    }
  }
  return asString;
}

export class MeilisearchAdapter implements SearchAdapter {
  readonly name = "meilisearch";
  readonly capabilities: SearchAdapterCapabilities = {
    persistent: true,
    searchAll: true,
    fuzzy: true,
    fieldBoosts: false,
    prefix: false,
  };

  private readonly client: MeiliClient;
  private readonly indexPrefix: string;
  private readonly defaults: SearchDefaults;
  private disposed = false;
  private readonly resources = new Map<string, string[]>();

  constructor(public readonly options: MeilisearchAdapterOptions) {
    const observability = normalizeObservability(options.observability)?.child({
      component: "searchfn.meilisearch",
    });
    this.client = new MeiliClient({
      host: options.host,
      apiKey: options.apiKey,
      requestTimeoutMs: options.requestTimeoutMs,
      taskTimeoutMs: options.taskTimeoutMs,
      retry: options.retry,
      logger: adapterLoggerFromObservability(observability?.logger),
    });
    this.indexPrefix = options.indexPrefix ?? "searchfn";
    this.defaults = options.defaults ?? {};
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new SearchAdapterError(
        SEARCH_ADAPTER_DISPOSED,
        "Search adapter is disposed. Call initialize() before use.",
      );
    }
  }

  private indexName(resource: string): string {
    return `${this.indexPrefix}_${sanitizeResourceName(resource)}`;
  }

  async initialize(params: InitializeParams): Promise<void> {
    if (this.disposed) {
      this.disposed = false;
    }
    this.resources.clear();

    for (const resource of params.resources) {
      const indexName = this.indexName(resource.name);
      this.resources.set(resource.name, resource.searchFields);

      const create = await this.client.request<MeiliTaskResult>({
        method: "POST",
        path: "/indexes",
        body: { uid: indexName, primaryKey: "id" },
        ignoreStatuses: [400],
      });
      if (create.body?.taskUid !== undefined) {
        await this.client.waitForTask(create.body.taskUid);
      }

      const searchable = await this.client.request<MeiliTaskResult>({
        method: "PUT",
        path: `/indexes/${indexName}/settings/searchable-attributes`,
        body: resource.searchFields,
      });
      if (searchable.body?.taskUid !== undefined) {
        await this.client.waitForTask(searchable.body.taskUid);
      }
    }
  }

  async index({ resource, documents, signal }: IndexParams): Promise<void> {
    this.assertNotDisposed();
    if (documents.length === 0) return;

    const indexName = this.indexName(resource);
    const payload = documents.map((doc) => ({ ...doc.fields, id: String(doc.id) }));
    const add = await this.client.request<MeiliTaskResult>({
      method: "POST",
      path: `/indexes/${indexName}/documents`,
      body: payload,
      signal,
    });
    if (add.body?.taskUid !== undefined) {
      await this.client.waitForTask(add.body.taskUid, signal);
    }
  }

  async search(params: SearchParams): Promise<Array<string | number>> {
    this.assertNotDisposed();
    if (params.fields !== undefined && params.fields.length === 0) {
      return [];
    }

    const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;
    const indexName = this.indexName(params.resource);
    const response = await this.client.request<MeiliSearchResponse>({
      method: "POST",
      path: `/indexes/${indexName}/search`,
      body: {
        q: params.query,
        limit: Math.max(1, params.limit ?? 10),
        attributesToSearchOn: params.fields !== undefined ? params.fields : undefined,
        typoTolerance: effectiveFuzzy ? undefined : "min",
      },
      signal: params.signal,
      ignoreStatuses: [404],
    });

    if (response.status === 404) return [];

    return (response.body?.hits ?? []).map((hit) => coerceId(hit.id));
  }

  async searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
    this.assertNotDisposed();
    if (params.fields !== undefined && params.fields.length === 0) {
      return [];
    }

    const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;
    const resources = params.resources ?? Array.from(this.resources.keys());
    if (resources.length === 0) {
      return [];
    }
    const limit = Math.max(1, params.limit ?? 10);
    const limitPerResource = Math.max(1, params.limitPerResource ?? limit);
    const merged: SearchAllResult[] = [];

    for (const resource of resources) {
      const indexName = this.indexName(resource);
      const response = await this.client.request<MeiliSearchResponse>({
        method: "POST",
        path: `/indexes/${indexName}/search`,
        body: {
          q: params.query,
          limit: limitPerResource,
          attributesToSearchOn: params.fields !== undefined ? params.fields : undefined,
          typoTolerance: effectiveFuzzy ? undefined : "min",
        },
        signal: params.signal,
        ignoreStatuses: [404],
      });
      if (response.status === 404) continue;

      const hits = response.body?.hits ?? [];
      for (let i = 0; i < hits.length; i++) {
        merged.push({
          resource,
          id: coerceId(hits[i].id),
          score: hits.length > 1 ? (hits.length - i) / hits.length : 1,
        });
      }
    }

    merged.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.resource !== b.resource) return a.resource.localeCompare(b.resource);
      return String(a.id).localeCompare(String(b.id));
    });

    return merged.slice(0, limit);
  }

  async remove({ resource, ids, signal }: RemoveParams): Promise<void> {
    this.assertNotDisposed();
    if (ids.length === 0) return;

    const indexName = this.indexName(resource);
    const remove = await this.client.request<MeiliTaskResult>({
      method: "POST",
      path: `/indexes/${indexName}/documents/delete-batch`,
      body: ids.map((id) => String(id)),
      signal,
      ignoreStatuses: [404],
    });
    if (remove.body?.taskUid !== undefined) {
      await this.client.waitForTask(remove.body.taskUid, signal);
    }
  }

  async clear(resource: string, signal?: AbortSignal): Promise<void> {
    this.assertNotDisposed();
    const indexName = this.indexName(resource);
    const clear = await this.client.request<MeiliTaskResult>({
      method: "DELETE",
      path: `/indexes/${indexName}/documents`,
      signal,
      ignoreStatuses: [404],
    });
    if (clear.body?.taskUid !== undefined) {
      await this.client.waitForTask(clear.body.taskUid, signal);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

function adapterLoggerFromObservability(logger: ObservationLogger | undefined): AdapterLogger | undefined {
  if (!logger) return undefined;
  return {
    debug: (message, context) => logger.debug?.(message, context),
    warn: (message, context) => logger.warn?.(message, context),
    error: (message, context) => logger.error?.(message, context),
  };
}
