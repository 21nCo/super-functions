import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchAllResult,
  IndexParams,
  SearchParams,
  SearchAllParams,
  RemoveParams,
  InitializeParams,
  SearchDefaults,
} from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
import {
  ElasticClient,
  type ElasticDialect,
  type ElasticRetryPolicy,
  type AdapterLogger,
} from "./elastic-client";

export interface ElasticsearchAdapterOptions {
  node: string;
  auth?: { username: string; password: string } | { apiKey: string };
  engine?: ElasticDialect;
  indexPrefix?: string;
  requestTimeoutMs?: number;
  retry?: ElasticRetryPolicy;
  logger?: AdapterLogger;
  defaults?: SearchDefaults;
}

interface ElasticHit {
  _id: string;
  _score?: number | null;
}

const SUPPORTED_DIALECTS = new Set<ElasticDialect>(["elasticsearch", "opensearch"]);

function sanitizeResourceName(resource: string): string {
  return resource.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}

function coerceId(value: string): string | number {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) {
      return parsed;
    }
  }
  return value;
}

interface ElasticBulkResponseItem {
  index?: { _id?: string; _index?: string; status?: number; error?: unknown };
  delete?: { _id?: string; _index?: string; status?: number; error?: unknown };
}

interface ElasticBulkResponse {
  errors?: boolean;
  items?: ElasticBulkResponseItem[];
}

function getBulkFailureMessage(response: ElasticBulkResponse | undefined): string {
  const failedItem = response?.items?.find((item) => item.index?.error ?? item.delete?.error);
  const failure = failedItem?.index ?? failedItem?.delete;
  if (!failure?.error) {
    return "Bulk operation failed";
  }

  return `Bulk operation failed for ${failure._index ?? "unknown-index"}/${failure._id ?? "unknown-id"}: ${JSON.stringify(failure.error)}`;
}

export class ElasticsearchAdapter implements SearchAdapter {
  readonly name: string = "elastic-compatible";
  readonly capabilities: SearchAdapterCapabilities = {
    persistent: true,
    searchAll: true,
    fuzzy: true,
    prefix: true,
    fieldBoosts: true,
  };

  private readonly dialect: ElasticDialect;
  private readonly indexPrefix: string;
  private readonly client: ElasticClient;
  private readonly defaults?: SearchDefaults;
  private disposed = false;
  private readonly resources = new Map<string, string[]>();

  constructor(public readonly options: ElasticsearchAdapterOptions) {
    const dialect = options.engine ?? "elasticsearch";
    if (!SUPPORTED_DIALECTS.has(dialect)) {
      throw new SearchAdapterError("DFQL_UNSUPPORTED", "Unsupported elastic dialect");
    }
    this.dialect = dialect;
    this.indexPrefix = options.indexPrefix ?? "searchfn";
    this.defaults = options.defaults;
    this.client = new ElasticClient({
      node: options.node,
      dialect,
      auth: options.auth,
      requestTimeoutMs: options.requestTimeoutMs,
      retry: options.retry,
      logger: options.logger,
    });
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

  /**
   * Resolves per-call options using resolution order:
   *   query param ?? construct-time default ?? off
   */
  private resolveOptions(params: SearchParams | SearchAllParams): {
    fuzzy: boolean | number | undefined;
    prefix: boolean | undefined;
    fieldBoosts: Record<string, number> | undefined;
  } {
    return {
      fuzzy: params.fuzzy ?? this.defaults?.fuzzy,
      prefix: params.prefix ?? this.defaults?.prefix,
      fieldBoosts: params.fieldBoosts ?? this.defaults?.fieldBoosts,
    };
  }

  /**
   * Builds the Elasticsearch/OpenSearch query object based on the resolved
   * fuzzy and prefix options.
   *
   * - No prefix, no fuzzy  → single multi_match (unchanged behaviour)
   * - Fuzzy only           → single multi_match with fuzziness: "AUTO"
   * - Prefix only          → bool.should [multi_match, phrase_prefix]
   * - Both                 → bool.should [multi_match, phrase_prefix, fuzzy multi_match]
   */
  private buildElasticQuery(
    query: string,
    fields: string[],
    fuzzy: boolean | number | undefined,
    prefix: boolean | undefined,
  ): unknown {
    const useFuzzy = !!fuzzy;
    const usePrefix = !!prefix;

    if (!usePrefix && !useFuzzy) {
      return { multi_match: { query, fields } };
    }

    if (useFuzzy && !usePrefix) {
      return { multi_match: { query, fields, fuzziness: "AUTO" } };
    }

    const should: unknown[] = [
      { multi_match: { query, fields } },
      { multi_match: { query, fields, type: "phrase_prefix" } },
    ];

    if (useFuzzy) {
      should.push({ multi_match: { query, fields, fuzziness: "AUTO" } });
    }

    return { bool: { should, minimum_should_match: 1 } };
  }

  async initialize(params: InitializeParams): Promise<void> {
    if (this.disposed) {
      this.disposed = false;
    }
    for (const resource of params.resources) {
      const indexName = this.indexName(resource.name);
      const fields = resource.searchFields.length > 0 ? resource.searchFields : ["content"];
      this.resources.set(resource.name, fields);

      const exists = await this.client.request({
        method: "HEAD",
        path: `/${indexName}`,
        ignoreStatuses: [404],
      });

      if (exists.status === 404) {
        await this.client.request({
          method: "PUT",
          path: `/${indexName}`,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              refresh_interval: "1s",
            },
            mappings: {
              dynamic: true,
              properties: {
                ...Object.fromEntries(fields.map((field) => [field, { type: "text" }])),
              },
            },
          },
          ignoreStatuses: [400],
        });
      } else {
        await this.client.request({
          method: "PUT",
          path: `/${indexName}/_mapping`,
          body: {
            properties: {
              ...Object.fromEntries(fields.map((field) => [field, { type: "text" }])),
            },
          },
        });
      }
    }
  }

  async index({ resource, documents, signal }: IndexParams): Promise<void> {
    this.assertNotDisposed();
    if (documents.length === 0) return;

    const indexName = this.indexName(resource);
    const payload: string[] = [];
    for (const document of documents) {
      if (signal?.aborted) {
        throw new SearchAdapterError("DFQL_ABORTED", "Index operation aborted");
      }
      payload.push(JSON.stringify({ index: { _index: indexName, _id: String(document.id) } }));
      payload.push(JSON.stringify(document.fields));
    }

    const response = await this.client.request<ElasticBulkResponse>({
      method: "POST",
      path: "/_bulk?refresh=wait_for&filter_path=errors,items.*._id,items.*._index,items.*.status,items.*.error",
      body: `${payload.join("\n")}\n`,
      contentType: "application/x-ndjson",
      signal,
    });
    if (response.body?.errors) {
      throw new SearchAdapterError("INTERNAL", getBulkFailureMessage(response.body));
    }
  }

  async search(params: SearchParams): Promise<Array<string | number>> {
    this.assertNotDisposed();

    const { fuzzy, prefix, fieldBoosts } = this.resolveOptions(params);
    const indexName = this.indexName(params.resource);
    const fields = params.fields?.length
      ? params.fields
      : this.resources.get(params.resource) ?? ["*"];
    const boostedFields = fields.map((field) =>
      fieldBoosts?.[field] ? `${field}^${fieldBoosts[field]}` : field,
    );

    const response = await this.client.request<{ hits?: { hits?: ElasticHit[] } }>({
      method: "POST",
      path: `/${indexName}/_search`,
      body: {
        size: Math.max(1, params.limit ?? 10),
        track_total_hits: false,
        query: this.buildElasticQuery(params.query, boostedFields, fuzzy, prefix),
        sort: [{ _score: { order: "desc" } }, { _id: { order: "asc" } }],
      },
      signal: params.signal,
      ignoreStatuses: [404],
    });

    if (response.status === 404) {
      return [];
    }

    return (response.body?.hits?.hits ?? []).map((hit) => coerceId(hit._id));
  }

  async searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
    this.assertNotDisposed();

    const { fuzzy, prefix, fieldBoosts } = this.resolveOptions(params);
    const resources = params.resources?.length ? params.resources : Array.from(this.resources.keys());
    const limit = Math.max(1, params.limit ?? 10);
    const limitPerResource = Math.max(1, params.limitPerResource ?? limit);

    const allResults: SearchAllResult[] = [];
    for (const resource of resources) {
      const indexName = this.indexName(resource);
      const fields = params.fields?.length ? params.fields : this.resources.get(resource) ?? ["*"];
      const boostedFields = fields.map((field) =>
        fieldBoosts?.[field] ? `${field}^${fieldBoosts[field]}` : field,
      );

      const response = await this.client.request<{ hits?: { hits?: ElasticHit[] } }>({
        method: "POST",
        path: `/${indexName}/_search`,
        body: {
          size: limitPerResource,
          track_total_hits: false,
          query: this.buildElasticQuery(params.query, boostedFields, fuzzy, prefix),
          sort: [{ _score: { order: "desc" } }, { _id: { order: "asc" } }],
        },
        signal: params.signal,
        ignoreStatuses: [404],
      });

      if (response.status === 404) continue;

      for (const hit of response.body?.hits?.hits ?? []) {
        allResults.push({
          resource,
          id: coerceId(hit._id),
          score: hit._score ?? 0,
        });
      }
    }

    allResults.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.resource !== b.resource) return a.resource.localeCompare(b.resource);
      return String(a.id).localeCompare(String(b.id));
    });
    return allResults.slice(0, limit);
  }

  async remove({ resource, ids, signal }: RemoveParams): Promise<void> {
    this.assertNotDisposed();
    if (ids.length === 0) return;

    const indexName = this.indexName(resource);
    const payload: string[] = [];
    for (const id of ids) {
      payload.push(JSON.stringify({ delete: { _index: indexName, _id: String(id) } }));
    }

    const response = await this.client.request<ElasticBulkResponse>({
      method: "POST",
      path: "/_bulk?refresh=wait_for&filter_path=errors,items.*._id,items.*._index,items.*.status,items.*.error",
      body: `${payload.join("\n")}\n`,
      contentType: "application/x-ndjson",
      signal,
      ignoreStatuses: [404],
    });
    if (response.body?.errors) {
      throw new SearchAdapterError("INTERNAL", getBulkFailureMessage(response.body));
    }
  }

  async clear(resource: string, signal?: AbortSignal): Promise<void> {
    this.assertNotDisposed();
    const indexName = this.indexName(resource);
    await this.client.request({
      method: "POST",
      path: `/${indexName}/_delete_by_query?refresh=true&conflicts=proceed`,
      body: { query: { match_all: {} } },
      signal,
      ignoreStatuses: [404],
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}
