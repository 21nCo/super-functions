/**
 * Client-side search plugin.
 *
 * Legacy MiniSearch-only mode remains for compatibility when no provider is configured,
 * but provider-backed mode is the preferred path.
 */

import type {
  DatafnPlugin,
  DatafnHookContext,
  DatafnSchema,
  SearchProvider,
} from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import MiniSearch from "minisearch";

export interface ClientSearchConfig {
  /**
   * Legacy MiniSearch-only boost map.
   * Deprecated when `searchProvider` is configured.
   */
  boost?: Record<string, number>;

  /** Optional storage adapter (if not provided via sync payload). */
  storage?: DatafnStorageAdapter;

  /** Preferred provider-backed search/index implementation. */
  searchProvider?: SearchProvider;
}

interface SearchIndexEntry {
  index: MiniSearch;
  fields: string[];
}

type ParsedSearch = {
  query: string;
  type?: "fullText" | "semantic";
  fields?: string[];
  limit?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
};

const UPSERT_MUTATION_OPERATIONS = new Set([
  "insert",
  "merge",
  "replace",
  "upsert",
  "trash",
  "restore",
  "archive",
  "unarchive",
]);

/**
 * Create a client-side search plugin.
 */
export function createClientSearchPlugin(options?: ClientSearchConfig): DatafnPlugin {
  const indices = new Map<string, SearchIndexEntry>();
  const boost = options?.boost;
  let storage: DatafnStorageAdapter | undefined = options?.storage;
  const searchProvider = options?.searchProvider;

  if (searchProvider && boost) {
    console.warn(
      "[client-search] deprecated legacy MiniSearch boost is ignored when provider mode is enabled",
    );
  }

  return {
    name: "client-search",
    runsOn: ["client"],

    async afterSync(ctx: DatafnHookContext, phase: string, payload: unknown, _result: unknown) {
      const ctxStorage = (payload as { storage?: DatafnStorageAdapter } | null)?.storage;
      if (ctxStorage) {
        storage = ctxStorage;
      }

      if (phase !== "clone" && phase !== "pull") {
        return;
      }

      if (searchProvider) {
        if (!storage) {
          console.warn("[client-search] No storage adapter available, skipping provider index rebuild");
          return;
        }
        await rebuildProviderIndices(ctx.schema, storage, searchProvider);
        return;
      }

      if (!storage) {
        console.warn("[client-search] No storage adapter available, skipping index rebuild");
        return;
      }

      await rebuildIndices(ctx.schema, storage, indices);
    },

    async afterMutation(_ctx: DatafnHookContext, m: unknown | unknown[], _result: unknown) {
      if (searchProvider) {
        if (Array.isArray(m)) {
          for (const mutation of m) {
            await updateProviderIndex(searchProvider, mutation, storage);
          }
          return;
        }

        await updateProviderIndex(searchProvider, m, storage);
        return;
      }

      if (!storage) {
        return;
      }

      if (Array.isArray(m)) {
        for (const mutation of m) {
          await updateIndex(indices, mutation, storage);
        }
        return;
      }

      await updateIndex(indices, m, storage);
    },

    async beforeQuery(_ctx: DatafnHookContext, q: unknown) {
      if (Array.isArray(q)) {
        return q;
      }

      const query = q as Record<string, unknown>;
      const resource = query.resource as string | undefined;
      const parsedSearch = parseSearchInput(query.search);

      if (!resource || !parsedSearch) {
        return query;
      }

      if (searchProvider) {
        if (storage) {
          const hydrationState = await storage.getHydrationState(resource);
          if (hydrationState !== "ready") {
            return query;
          }
        }

        try {
          const providerIds = await (searchProvider.search as any)({
            resource,
            query: parsedSearch.query,
            type: parsedSearch.type,
            fields: parsedSearch.fields,
            limit: parsedSearch.limit,
            prefix: parsedSearch.prefix,
            fuzzy: parsedSearch.fuzzy,
            fieldBoosts: parsedSearch.fieldBoosts,
            signal: query.signal as AbortSignal | undefined,
          });
          const candidateIds = dedupeIds(providerIds);
          return withCandidateFilter(query, candidateIds);
        } catch (error) {
          console.error("[client-search] Provider search failed:", error);
          return query;
        }
      }

      const indexEntry = indices.get(resource);
      if (!indexEntry) {
        return query;
      }

      if (storage) {
        const hydrationState = await storage.getHydrationState(resource);
        if (hydrationState !== "ready") {
          return query;
        }
      }

      try {
        const searchOptions: {
          fuzzy?: boolean | number;
          prefix?: boolean;
          boost?: Record<string, number>;
        } = {
          fuzzy: parsedSearch.fuzzy ?? 0.2,
          prefix: parsedSearch.prefix ?? true,
        };

        if (parsedSearch.fieldBoosts) {
          searchOptions.boost = parsedSearch.fieldBoosts;
        } else if (boost) {
          searchOptions.boost = boost;
        }

        const searchResults = indexEntry.index.search(parsedSearch.query, searchOptions);
        const candidateIds = dedupeIds(
          searchResults.map((result) => String((result as { id?: unknown }).id ?? "")),
        );

        return {
          ...query,
          _searchCandidateIds: candidateIds,
        };
      } catch (error) {
        console.error("[client-search] Search failed:", error);
        return query;
      }
    },
  };
}

function withCandidateFilter(
  query: Record<string, unknown>,
  candidateIds: string[],
): Record<string, unknown> {
  const idFilter = { id: { in: candidateIds } };
  const filters = query.filters;

  if (isPlainObject(filters) && Object.keys(filters).length > 0) {
    return {
      ...query,
      filters: {
        $and: [filters, idFilter],
      },
      _searchCandidateIds: candidateIds,
    };
  }

  return {
    ...query,
    filters: idFilter,
    _searchCandidateIds: candidateIds,
  };
}

function dedupeIds(ids: unknown[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of ids) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }

  return output;
}

function parseSearchInput(search: unknown): ParsedSearch | null {
  if (typeof search === "string") {
    const query = search.trim();
    return query.length > 0 ? { query } : null;
  }

  if (!isPlainObject(search)) {
    return null;
  }

  const query = typeof search.query === "string" ? search.query.trim() : "";
  if (query.length === 0) {
    return null;
  }

  const parsed: ParsedSearch = { query };

  if (search.type === "fullText" || search.type === "semantic") {
    parsed.type = search.type;
  }

  if (Array.isArray(search.fields)) {
    parsed.fields = search.fields.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof search.limit === "number" && Number.isFinite(search.limit)) {
    parsed.limit = search.limit;
  }

  if (typeof search.prefix === "boolean") {
    parsed.prefix = search.prefix;
  }

  if (
    typeof search.fuzzy === "boolean" ||
    (typeof search.fuzzy === "number" && Number.isFinite(search.fuzzy))
  ) {
    parsed.fuzzy = search.fuzzy;
  }

  if (isPlainObject(search.fieldBoosts)) {
    parsed.fieldBoosts = search.fieldBoosts as Record<string, number>;
  }

  return parsed;
}

/** Rebuild provider indices from storage records for searchable resources. */
async function rebuildProviderIndices(
  schema: DatafnSchema,
  storage: DatafnStorageAdapter,
  searchProvider: SearchProvider,
): Promise<void> {
  for (const resource of schema.resources) {
    const searchFields = getSearchFields(resource as unknown as Record<string, unknown>);
    if (!searchFields || searchFields.length === 0) {
      continue;
    }

    try {
      const records = await storage.listRecords(resource.name);
      if (records.length === 0) {
        continue;
      }
      await searchProvider.updateIndices({
        resource: resource.name,
        records,
        operation: "upsert",
      });
    } catch (error) {
      console.error(`[client-search] Failed provider index rebuild for ${resource.name}:`, error);
    }
  }
}

async function updateProviderIndex(
  searchProvider: SearchProvider,
  mutation: unknown,
  storage?: DatafnStorageAdapter,
): Promise<void> {
  if (!isPlainObject(mutation)) {
    return;
  }

  const resource = typeof mutation.resource === "string" ? mutation.resource : undefined;
  const operation = typeof mutation.operation === "string" ? mutation.operation : undefined;
  const id = typeof mutation.id === "string" ? mutation.id : undefined;

  if (!resource || !operation || !id) {
    return;
  }

  try {
    if (operation === "delete") {
      await searchProvider.updateIndices({
        resource,
        records: [{ id }],
        operation: "delete",
      });
      return;
    }

    if (!UPSERT_MUTATION_OPERATIONS.has(operation)) {
      return;
    }

    const storedRecord = storage ? await storage.getRecord(resource, id) : null;
    const mutationRecord = isPlainObject(mutation.record) ? mutation.record : null;
    const record = storedRecord ?? (mutationRecord ? { ...mutationRecord, id } : null);

    if (!record) {
      return;
    }

    await searchProvider.updateIndices({
      resource,
      records: [record],
      operation: "upsert",
    });
  } catch (error) {
    console.error(`[client-search] Failed provider index update for ${resource}:`, error);
  }
}

/** Rebuild all legacy MiniSearch indices from storage. */
async function rebuildIndices(
  schema: DatafnSchema,
  storage: DatafnStorageAdapter,
  indices: Map<string, SearchIndexEntry>,
): Promise<void> {
  indices.clear();

  for (const resource of schema.resources) {
    const searchFields = getSearchFields(resource as unknown as Record<string, unknown>);
    if (!searchFields || searchFields.length === 0) {
      continue;
    }

    try {
      const index = new MiniSearch({
        fields: searchFields,
        storeFields: [],
      });

      const records = await storage.listRecords(resource.name);
      for (const record of records) {
        const doc = buildSearchDocument(record, searchFields);
        if (doc) {
          index.add(doc);
        }
      }

      indices.set(resource.name, {
        index,
        fields: searchFields,
      });
    } catch (error) {
      console.error(`[client-search] Failed to build index for ${resource.name}:`, error);
    }
  }
}

/** Update legacy MiniSearch index on mutation. */
async function updateIndex(
  indices: Map<string, SearchIndexEntry>,
  mutation: unknown,
  storage: DatafnStorageAdapter,
): Promise<void> {
  if (!isPlainObject(mutation)) {
    return;
  }

  const resource = typeof mutation.resource === "string" ? mutation.resource : undefined;
  const operation = typeof mutation.operation === "string" ? mutation.operation : undefined;
  const id = typeof mutation.id === "string" ? mutation.id : undefined;

  if (!resource || !id) {
    return;
  }

  const indexEntry = indices.get(resource);
  if (!indexEntry) {
    return;
  }

  try {
    switch (operation) {
      case "insert":
      case "merge":
      case "replace": {
        const record = await storage.getRecord(resource, id);
        if (!record) {
          if (indexEntry.index.has(id)) {
            indexEntry.index.remove(id);
          }
          return;
        }

        const doc = buildSearchDocument(record, indexEntry.fields);
        if (!doc) {
          return;
        }

        try {
          if (indexEntry.index.has(id)) {
            indexEntry.index.remove(id);
          }
        } catch {
          // no-op: index entry may not exist yet
        }

        indexEntry.index.add(doc);
        break;
      }

      case "delete": {
        try {
          indexEntry.index.discard(id);
        } catch {
          // no-op: index entry may not exist
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`[client-search] Failed to update index for ${resource}:`, error);
  }
}

function getSearchFields(resource: Record<string, unknown>): string[] | null {
  const indices = resource.indices;
  if (!indices) {
    return null;
  }

  if (typeof indices === "object" && !Array.isArray(indices)) {
    const search = (indices as Record<string, unknown>).search;
    if (Array.isArray(search)) {
      return search as string[];
    }
    return null;
  }

  return null;
}

function buildSearchDocument(
  record: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> | null {
  const id = record.id as string | undefined;
  if (!id) {
    return null;
  }

  const doc: Record<string, unknown> = { id };

  for (const field of fields) {
    const value = record[field];
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string") {
      doc[field] = value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      doc[field] = String(value);
      continue;
    }

    if (typeof value === "object") {
      doc[field] = JSON.stringify(value);
    }
  }

  return doc;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
