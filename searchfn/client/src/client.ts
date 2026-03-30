import type {
  SearchAdapter,
  IndexParams,
  SearchParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
} from "@searchfn/adapter-contracts";
import { SearchAdapterError } from "@searchfn/adapter-contracts";
import type { SearchClient, SearchClientConfig, SearchClientDefaults } from "./types";

const MAX_QUERY_LENGTH = 1000;
const MAX_LIMIT = 10_000;
const MAX_LIMIT_PER_RESOURCE = 1_000;
const MAX_INDEX_BATCH = 10_000;
const MAX_RESOURCES_PER_SEARCH_ALL = 50;

const DEFAULT_LIMIT = 10;
const DEFAULT_LIMIT_PER_RESOURCE = 10;

class SearchClientValidationError extends Error {
  readonly code: string;
  readonly details?: { path: string };

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = "SearchClientValidationError";
    this.code = code;
    this.details = path ? { path } : undefined;
  }
}

function validateResource(resource: string): void {
  if (!resource || typeof resource !== "string" || resource.trim().length === 0) {
    throw new SearchClientValidationError("DFQL_INVALID", "resource must be a non-empty string", "resource");
  }
}

function validateQuery(query: string): void {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new SearchClientValidationError("DFQL_INVALID", "Search query must not be empty", "query");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new SearchClientValidationError("LIMIT_EXCEEDED", `query exceeds maximum length of ${MAX_QUERY_LENGTH}`, "query");
  }
}

function validateLimit(limit: number | undefined, path: string, max: number): void {
  if (limit === undefined) return;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    throw new SearchClientValidationError("DFQL_INVALID", `${path} must be a positive number`, path);
  }
  if (limit > max) {
    throw new SearchClientValidationError("LIMIT_EXCEEDED", `${path} exceeds maximum of ${max}`, path);
  }
}

function clampLimit(value: number | undefined, defaultVal: number, max: number): number {
  if (value === undefined) return Math.min(defaultVal, max);
  return Math.min(value, max);
}

function deterministicSort(results: SearchAllResult[]): SearchAllResult[] {
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
    const aId = String(a.id);
    const bId = String(b.id);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
}

export function createSearchClient(config: SearchClientConfig): SearchClient {
  const { adapter } = config;
  const defaults: SearchClientDefaults = config.defaults ?? {};

  if (!adapter) {
    throw new SearchClientValidationError("DFQL_INVALID", "adapter is required", "adapter");
  }

  const client: SearchClient = {
    async index(params: IndexParams): Promise<void> {
      validateResource(params.resource);
      if (!Array.isArray(params.documents)) {
        throw new SearchClientValidationError("DFQL_INVALID", "documents must be an array", "documents");
      }
      if (params.documents.length > MAX_INDEX_BATCH) {
        throw new SearchClientValidationError("LIMIT_EXCEEDED", `documents exceeds maximum batch size of ${MAX_INDEX_BATCH}`, "documents");
      }
      return adapter.index(params);
    },

    async search(params: SearchParams): Promise<Array<string | number>> {
      validateResource(params.resource);
      validateQuery(params.query);
      validateLimit(params.limit, "limit", MAX_LIMIT);

      const effectiveLimit = clampLimit(params.limit, defaults.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const effectiveFuzzy = params.fuzzy ?? defaults.fuzzy;
      const effectivePrefix = params.prefix ?? defaults.prefix;
      const effectiveFieldBoosts = params.fieldBoosts ?? defaults.fieldBoosts;

      return adapter.search({
        ...params,
        limit: effectiveLimit,
        fuzzy: effectiveFuzzy,
        prefix: effectivePrefix,
        fieldBoosts: effectiveFieldBoosts,
      });
    },

    async searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
      validateQuery(params.query);
      validateLimit(params.limit, "limit", MAX_LIMIT);
      validateLimit(params.limitPerResource, "limitPerResource", MAX_LIMIT_PER_RESOURCE);

      if (params.resources !== undefined) {
        if (!Array.isArray(params.resources) || params.resources.length === 0) {
          throw new SearchClientValidationError("DFQL_INVALID", "resources must be a non-empty array when provided", "resources");
        }
        if (params.resources.length > MAX_RESOURCES_PER_SEARCH_ALL) {
          throw new SearchClientValidationError("LIMIT_EXCEEDED", `resources exceeds maximum of ${MAX_RESOURCES_PER_SEARCH_ALL}`, "resources");
        }
        params.resources.forEach((resource: string, index: number) => {
          try {
            validateResource(resource);
          } catch (error) {
            if (error instanceof SearchClientValidationError) {
              throw new SearchClientValidationError(error.code, error.message, `resources[${index}]`);
            }
            throw error;
          }
        });
      }

      const effectiveLimit = clampLimit(params.limit, defaults.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const effectiveLimitPerResource = clampLimit(
        params.limitPerResource,
        defaults.limitPerResource ?? DEFAULT_LIMIT_PER_RESOURCE,
        MAX_LIMIT_PER_RESOURCE,
      );
      const effectiveFuzzy = params.fuzzy ?? defaults.fuzzy;
      const effectivePrefix = params.prefix ?? defaults.prefix;
      const effectiveFieldBoosts = params.fieldBoosts ?? defaults.fieldBoosts;

      const searchParams: SearchAllParams = {
        ...params,
        limit: effectiveLimit,
        limitPerResource: effectiveLimitPerResource,
        fuzzy: effectiveFuzzy,
        prefix: effectivePrefix,
        fieldBoosts: effectiveFieldBoosts,
      };

      if (adapter.searchAll) {
        const results = await adapter.searchAll(searchParams);
        return deterministicSort(results).slice(0, effectiveLimit);
      }

      // Fallback: adapter lacks searchAll — require explicit resources
      if (!params.resources || params.resources.length === 0) {
        throw new SearchClientValidationError(
          "DFQL_INVALID",
          "resources are required when adapter.searchAll is unavailable",
          "resources",
        );
      }

      const allResults: SearchAllResult[] = [];
      for (const resource of params.resources) {
        const ids = await adapter.search({
          resource,
          query: searchParams.query,
          fields: searchParams.fields,
          limit: effectiveLimitPerResource,
          fuzzy: effectiveFuzzy,
          prefix: effectivePrefix,
          fieldBoosts: effectiveFieldBoosts,
          signal: searchParams.signal,
        });
        for (let i = 0; i < ids.length; i++) {
          allResults.push({
            resource,
            id: ids[i],
            score: ids.length - i, // positional score fallback
          });
        }
      }

      return deterministicSort(allResults).slice(0, effectiveLimit);
    },

    async remove(params: { resource: string; ids: Array<string | number>; signal?: AbortSignal }): Promise<void> {
      validateResource(params.resource);
      if (!Array.isArray(params.ids)) {
        throw new SearchClientValidationError("DFQL_INVALID", "ids must be an array", "ids");
      }
      return adapter.remove(params);
    },

    async clear(resource: string, signal?: AbortSignal): Promise<void> {
      validateResource(resource);
      return adapter.clear(resource, signal);
    },

    async dispose(): Promise<void> {
      if (adapter.dispose) {
        return adapter.dispose();
      }
    },

    adapterInfo() {
      return {
        name: adapter.name,
        capabilities: adapter.capabilities,
      };
    },
  };

  // Attach initialize only if adapter supports it
  if (adapter.initialize) {
    client.initialize = async (params: InitializeParams) => {
      return adapter.initialize!(params);
    };
  }

  return client;
}

export { SearchClientValidationError };
