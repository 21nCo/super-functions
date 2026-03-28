import type { Adapter } from "@superfunctions/db";
import type { DatafnSchema } from "../../core-types.js";
import type { SearchProvider } from "../../search-provider.js";
import type { DatafnLogger } from "../../logger.js";
import { DatafnExecutionError } from "../errors.js";
import { evaluateFilter } from "../query/filters.js";

export interface SearchResultItem {
  id: string;
  resource: string;
  score: number;
  data: Record<string, unknown>;
}

export interface SearchResult {
  results: SearchResultItem[];
}

export interface CrossResourceSearchParams {
  query: string;
  resources?: string[];
  fields?: string[];
  limit?: number;
  limitPerResource?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
  filters?: Record<string, Record<string, unknown>>;
  select?: string[];
  signal?: AbortSignal;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DatafnExecutionError(
      "DFQL_ABORTED",
      "Search request aborted",
      "signal",
    );
  }
}

function applyFieldSelect(
  record: Record<string, unknown>,
  select?: string[],
): Record<string, unknown> {
  if (!select || select.length === 0) return record;
  const result: Record<string, unknown> = {};
  for (const field of select) {
    if (field in record) result[field] = record[field];
  }
  return result;
}

function buildMinimalStore(
  fetchedByResource: Map<string, Record<string, unknown>[]>,
): {
  getRecords(resource: string): Record<string, unknown>[];
  getRecord(resource: string, id: string): Record<string, unknown> | null;
  getJoinRows(_key: string): never[];
  findRecords(resource: string, field: string, value: unknown): Record<string, unknown>[];
} {
  return {
    getRecords(resource: string) {
      return fetchedByResource.get(resource) ?? [];
    },
    getRecord(resource: string, id: string) {
      const rows = fetchedByResource.get(resource) ?? [];
      return rows.find((r) => String(r.id) === id) ?? null;
    },
    getJoinRows(_key: string) {
      return [];
    },
    findRecords(resource: string, field: string, value: unknown) {
      const rows = fetchedByResource.get(resource) ?? [];
      return rows.filter((r) => r[field] === value);
    },
  };
}

export async function executeCrossResourceSearch(
  params: CrossResourceSearchParams,
  searchProvider: SearchProvider,
  db: Adapter,
  schema: DatafnSchema,
  namespace: string,
  logger?: DatafnLogger,
): Promise<SearchResult> {
  assertNotAborted(params.signal);
  if (!searchProvider.searchAll) {
    throw new DatafnExecutionError(
      "DFQL_UNSUPPORTED",
      "Search provider does not support cross-resource search (searchAll not implemented)",
    );
  }

  const limit = Math.min(params.limit ?? 50, 10000);
  const limitPerResource =
    params.limitPerResource !== undefined
      ? Math.min(params.limitPerResource, 1000)
      : undefined;

  const candidates = await searchProvider.searchAll({
    query: params.query,
    resources: params.resources,
    fields: params.fields,
    limit,
    limitPerResource,
    prefix: params.prefix,
    fuzzy: params.fuzzy,
    fieldBoosts: params.fieldBoosts,
    signal: params.signal,
  });

  assertNotAborted(params.signal);
  if (candidates.length === 0) {
    return { results: [] };
  }

  const byResource = new Map<string, Array<{ id: string; score: number }>>();
  for (const c of candidates) {
    const arr = byResource.get(c.resource) ?? [];
    arr.push({ id: c.id, score: c.score });
    byResource.set(c.resource, arr);
  }

  const fetchedByResource = new Map<string, Record<string, unknown>[]>();
  await Promise.all(
    Array.from(byResource.entries()).map(async ([resource, resourceCandidates]) => {
      assertNotAborted(params.signal);
      const resourceSchema = schema.resources.find((r) => r.name === resource);
      if (!resourceSchema) return;
      const ids = resourceCandidates.map((c) => c.id);
      try {
        const rows = await db.findMany({
          model: resource,
          where: [{ field: "id", operator: "in", value: ids }],
          namespace,
        });
        fetchedByResource.set(resource, rows as Record<string, unknown>[]);
      } catch (err) {
        logger?.warn("Cross-resource search: failed to fetch records", {
          resource,
          error: String(err),
          operation: "search",
        });
      }
    }),
  );

  const rowMapByResource = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [resource, rows] of fetchedByResource) {
    const rowMap = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      rowMap.set(String(row.id), row);
    }
    rowMapByResource.set(resource, rowMap);
  }

  const minimalStore = buildMinimalStore(fetchedByResource);
  const allResults: SearchResultItem[] = [];

  for (const c of candidates) {
    assertNotAborted(params.signal);
    const rowMap = rowMapByResource.get(c.resource);
    if (!rowMap) continue;
    const row = rowMap.get(c.id);
    if (!row) continue;

    const resourceFilter = params.filters?.[c.resource];
    if (resourceFilter) {
      const passes = evaluateFilter(row, resourceFilter, c.resource, schema, minimalStore);
      if (!passes) continue;
    }

    const data = applyFieldSelect(row, params.select);
    allResults.push({ id: c.id, resource: c.resource, score: c.score, data });
  }

  allResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { results: allResults.slice(0, limit) };
}
