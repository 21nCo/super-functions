import type { Adapter } from "@superfunctions/db";
import type { DatafnSchema } from "../../core-types.js";
import type { DatafnLogger } from "../../logger.js";
import type {
  CrossResourceSearchParams,
  SearchResult,
  SearchResultItem,
} from "./cross-resource.js";
import { DatafnExecutionError } from "../errors.js";
import { evaluateFilter } from "../query/filters.js";

export const NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE =
  "No search provider configured and DB adapter has no native search support";

export function hasDbNativeSearchSupport(db?: Adapter): boolean {
  return db?.capabilities?.operations?.fulltext === true;
}

type IndexConfig = { search?: readonly string[] };

function isIndexConfig(value: unknown): value is IndexConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function resolveSearchFields(
  resource: DatafnSchema["resources"][number],
  requestedFields?: string[],
): string[] {
  const configuredSearchFields = isIndexConfig(resource.indices)
    ? (resource.indices.search ?? [])
    : [];
  const searchable =
    configuredSearchFields.length > 0
      ? [...configuredSearchFields]
      : resource.fields
          .filter((field) => field.type === "string")
          .map((field) => field.name);

  if (!requestedFields || requestedFields.length === 0) {
    return searchable;
  }

  const requested = new Set(requestedFields);
  const intersected = searchable.filter((field: string) => requested.has(field));
  return intersected.length > 0 ? intersected : searchable;
}

function scoreFieldValue(raw: unknown, queryLower: string): number | null {
  if (typeof raw !== "string") return null;
  const idx = raw.toLowerCase().indexOf(queryLower);
  if (idx < 0) return null;
  return 1 / (idx + 1);
}

function applyFieldSelect(
  record: Record<string, unknown>,
  select?: string[],
): Record<string, unknown> {
  if (!select || select.length === 0) return record;
  const result: Record<string, unknown> = {};
  for (const field of select) {
    if (field in record) {
      result[field] = record[field];
    }
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

export async function executeDbNativeCrossResourceSearch(
  params: CrossResourceSearchParams,
  db: Adapter,
  schema: DatafnSchema,
  namespace: string,
  logger?: DatafnLogger,
): Promise<SearchResult> {
  if (!hasDbNativeSearchSupport(db)) {
    throw new DatafnExecutionError(
      "DFQL_UNSUPPORTED",
      NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
      "$",
    );
  }

  assertNotAborted(params.signal);

  const queryLower = params.query.toLowerCase();
  const limit = params.limit ?? 50;
  const limitPerResource = params.limitPerResource ?? limit;
  const requestedResources = params.resources ?? schema.resources.map((r) => r.name);

  const candidateRowsByResource = new Map<
    string,
    Array<{ row: Record<string, unknown>; score: number }>
  >();

  for (const resourceName of requestedResources) {
    assertNotAborted(params.signal);
    const resource = schema.resources.find((r) => r.name === resourceName);
    if (!resource) continue;

    const searchFields = resolveSearchFields(resource, params.fields);
    if (searchFields.length === 0) continue;

    const bestById = new Map<string, { row: Record<string, unknown>; score: number }>();

    for (const field of searchFields) {
      assertNotAborted(params.signal);
      let rows: Record<string, unknown>[];
      try {
        rows = (await db.findMany({
          model: resourceName,
          where: [{ field, operator: "contains", value: params.query }],
          namespace,
        })) as Record<string, unknown>[];
      } catch (error) {
        logger?.warn("DB-native search fallback failed", {
          resource: resourceName,
          field,
          error: String(error),
          operation: "search",
        });
        throw new DatafnExecutionError(
          "DFQL_UNSUPPORTED",
          NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
          "$",
        );
      }

      for (const row of rows) {
        const id = String(row.id ?? "");
        if (!id) continue;
        const score = scoreFieldValue(row[field], queryLower);
        if (score === null) continue;
        const current = bestById.get(id);
        if (!current || score > current.score) {
          bestById.set(id, { row, score });
        }
      }
    }

    const resourceRows = Array.from(bestById.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aId = String(a.row.id);
        const bId = String(b.row.id);
        return aId < bId ? -1 : aId > bId ? 1 : 0;
      })
      .slice(0, limitPerResource);

    if (resourceRows.length > 0) {
      candidateRowsByResource.set(resourceName, resourceRows);
    }
  }

  if (candidateRowsByResource.size === 0) {
    return { results: [] };
  }

  const fetchedByResource = new Map<string, Record<string, unknown>[]>();
  for (const [resource, entries] of candidateRowsByResource) {
    fetchedByResource.set(
      resource,
      entries.map((entry) => entry.row),
    );
  }
  const minimalStore = buildMinimalStore(fetchedByResource);

  const results: SearchResultItem[] = [];
  for (const [resource, entries] of candidateRowsByResource) {
    for (const entry of entries) {
      assertNotAborted(params.signal);
      const resourceFilter = params.filters?.[resource];
      if (resourceFilter) {
        const passes = evaluateFilter(
          entry.row,
          resourceFilter,
          resource,
          schema,
          minimalStore,
        );
        if (!passes) {
          continue;
        }
      }
      results.push({
        id: String(entry.row.id),
        resource,
        score: entry.score,
        data: applyFieldSelect(entry.row, params.select),
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { results: results.slice(0, limit) };
}

export async function executeDbNativeResourceSearch(
  db: Adapter,
  schema: DatafnSchema,
  namespace: string,
  params: {
    resource: string;
    query: string;
    fields?: string[];
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<string[]> {
  const result = await executeDbNativeCrossResourceSearch(
    {
      query: params.query,
      resources: [params.resource],
      fields: params.fields,
      limit: params.limit ?? 50,
      limitPerResource: params.limit ?? 50,
      signal: params.signal,
    },
    db,
    schema,
    namespace,
  );
  return result.results.map((item) => item.id);
}
