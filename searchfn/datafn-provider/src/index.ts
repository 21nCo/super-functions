import type { SearchAdapter } from "@searchfn/adapter-contracts";
import type { SearchProvider } from "@datafn/core";
import {
  instrumentMethods,
  normalizeObservability,
  type ObservabilityInput,
} from "@superfunctions/observability";

export type { SearchProvider };

export interface CreateSearchProviderOptions {
  /**
   * Per-resource search field configuration.
   * Used to extract searchable fields from mutation records when calling updateIndices().
   * Keys are resource names; values are arrays of field names to index.
   *
   * @example
   * { tasks: ["title", "description"], notes: ["content"] }
   */
  resourceFields?: Record<string, string[]>;
  observability?: ObservabilityInput;
}

interface SearchProviderSearchParams {
  resource: string;
  query: string;
  fields?: string[];
  limit?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
  namespaceFilter?: string[];
  regionFilter?: string[];
  signal?: AbortSignal;
}

interface SearchProviderSearchAllParams {
  query: string;
  resources?: string[];
  fields?: string[];
  limit?: number;
  limitPerResource?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
  namespaceFilter?: string[];
  regionFilter?: string[];
  signal?: AbortSignal;
}

interface UpdateIndicesParams {
  resource: string;
  records: Record<string, unknown>[];
  operation: "upsert" | "delete";
}

class SearchProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SearchProviderError";
    this.code = code;
  }
}

const FALLBACK_CONCURRENCY = 10;

/**
 * Creates a DataFn SearchProvider from any SearchAdapter.
 * The factory does NOT modify the adapter instance.
 */
export function createSearchProvider(
  adapter: SearchAdapter,
  options?: CreateSearchProviderOptions,
): SearchProvider {
  const resourceFields = options?.resourceFields ?? {};
  const observability = normalizeObservability(options?.observability)?.child({
    component: "searchfn.provider",
  });

  const provider: SearchProvider = {
    get name() {
      return adapter.name;
    },

    async search(params: SearchProviderSearchParams) {
      const ids = await adapter.search({
        resource: params.resource,
        query: params.query,
        fields: params.fields,
        limit: params.limit ?? 50,
        fuzzy: params.fuzzy,
        prefix: params.prefix,
        fieldBoosts: params.fieldBoosts,
        namespaceFilter: params.namespaceFilter,
        regionFilter: params.regionFilter,
        signal: params.signal,
      });
      return ids.map((id: string | number) => String(id));
    },

    async updateIndices({ resource, records, operation }: UpdateIndicesParams) {
      if (operation === "delete") {
        await adapter.remove({
          resource,
          ids: records.map((r: Record<string, unknown>) => String(r.id)),
        });
      } else {
        const searchFieldNames = resourceFields[resource];
        const documents = records.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          fields: extractFields(r, searchFieldNames),
          metadata: extractMetadata(r),
        }));
        await adapter.index({ resource, documents });
      }
    },

    async clearIndices(resource: string) {
      await adapter.clear(resource);
    },

    async searchAll(params: SearchProviderSearchAllParams) {
      if (adapter.searchAll) {
        const results = await adapter.searchAll({
          query: params.query,
          resources: params.resources,
          fields: params.fields,
          limit: params.limit,
          limitPerResource: params.limitPerResource,
          fuzzy: params.fuzzy,
          prefix: params.prefix,
          fieldBoosts: params.fieldBoosts,
          namespaceFilter: params.namespaceFilter,
          regionFilter: params.regionFilter,
          signal: params.signal,
        });
        return results.map((r: { resource: string; id: string | number; score: number }) => ({
          resource: r.resource,
          id: String(r.id),
          score: r.score,
        }));
      }

      const resources = params.resources ?? Object.keys(resourceFields);
      if (resources.length === 0) {
        throw new SearchProviderError(
          "DFQL_INVALID",
          "resources are required when adapter.searchAll is unavailable",
        );
      }

      const limitPerResource = params.limitPerResource ?? 50;
      const allResults: Array<{ resource: string; id: string; score: number }> = [];
      let firstError: unknown;

      for (let i = 0; i < resources.length; i += FALLBACK_CONCURRENCY) {
        const batch = resources.slice(i, i + FALLBACK_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (resource: string) => {
            const ids = await adapter.search({
              resource,
              query: params.query,
              fields: params.fields,
              limit: limitPerResource,
              fuzzy: params.fuzzy,
              prefix: params.prefix,
              fieldBoosts: params.fieldBoosts,
              namespaceFilter: params.namespaceFilter,
              regionFilter: params.regionFilter,
              signal: params.signal,
            });
            return ids.map((id: string | number, index: number) => ({
              resource,
              id: String(id),
              score: limitPerResource - index,
            }));
          }),
        );
        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            allResults.push(...result.value);
            continue;
          }
          if (firstError === undefined) {
            firstError = result.reason;
          }
        }
      }

      if (allResults.length === 0 && firstError !== undefined) {
        throw firstError;
      }

      allResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      if (params.limit !== undefined) {
        return allResults.slice(0, params.limit);
      }
      return allResults;
    },

    async initialize(config: { resources: Array<{ name: string; searchFields: string[] }> }) {
      if (adapter.initialize) {
        await adapter.initialize(config);
      }
    },

    async dispose() {
      if (adapter.dispose) {
        await adapter.dispose();
      }
    },
  };

  return instrumentMethods({
    target: provider,
    observability,
    kind: "search",
    component: "searchfn.provider",
    extract: ({ property, args }) => {
      const input = args[0] as Record<string, unknown> | undefined;
      return {
        operation: String(property),
        resource: typeof input?.resource === "string" ? input.resource : undefined,
      };
    },
  });
}

function extractFields(
  record: Record<string, unknown>,
  fields?: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const keys = fields ?? Object.keys(record).filter((k) => k !== "id");
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    } else if (typeof value === "object") {
      result[key] = safeStringify(value);
    }
  }
  return result;
}

function extractMetadata(record: Record<string, unknown>): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (typeof record.__ns === "string") metadata.__ns = record.__ns;
  if (typeof record.__region === "string") metadata.__region = record.__region;
  return metadata;
}

function safeStringify(value: object): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
