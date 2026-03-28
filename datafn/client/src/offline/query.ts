/**
 * Offline query executor
 */

import type { DatafnSchema } from "@datafn/core";
import {
  evaluateFilter as coreEvaluateFilter,
  parseSortTerms,
  sortRecords,
  type SchemaIndex,
  normalizeFilterOps,
} from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import { materializeSelect } from "./relations.js";
import { executeAggregateQuery } from "./aggregate.js";

/**
 * Execute a local query with index-aware routing (OFFQ-001)
 */
export async function executeLocalQuery(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  query: Record<string, unknown>,
  _schemaIndex?: SchemaIndex,
): Promise<{ data?: any[]; groups?: any[]; nextCursor?: any }> {
  // Check for aggregation
  if (query.groupBy) {
    return executeAggregateQuery(storage, schema, query);
  }

  const resource = query.resource as string;
  let records: Record<string, unknown>[] = [];
  let usedIndexedPath = false;
  // CLI-012: tracks whether the index fetch fully satisfied all filter conditions
  let filterFullySatisfied = false;

  // Planning step: detect index-aware routing opportunities (OFFQ-001)
  if (query.filters) {
    const filters = query.filters as Record<string, unknown>;
    
    // Case 1: id eq → use getRecord
    if (filters.id && typeof filters.id === "object") {
      const idFilter = filters.id as Record<string, unknown>;
      if (idFilter.eq !== undefined) {
        const record = await storage.getRecord(resource, idFilter.eq as string);
        records = record ? [record] : [];
        usedIndexedPath = true;
        // Filter fully satisfied only when id eq is the sole filter condition
        if (Object.keys(filters).length === 1) {
          filterFullySatisfied = true;
        }
      }
    }
    
    // Case 2: single-field indexed eq → use findRecords
    if (!usedIndexedPath) {
      const singleFieldEq = detectSingleFieldEq(filters);
      if (singleFieldEq) {
        const { field, value } = singleFieldEq;
        // findRecords will use index if available, else fall back to scan
        records = await storage.findRecords(resource, field, value);
        usedIndexedPath = true;
        // detectSingleFieldEq guarantees exactly one key — fully satisfied
        filterFullySatisfied = true;
      }
    }
  }

  // Scan path with deterministic ordering
  if (!usedIndexedPath) {
    records = await storage.listRecords(resource);
  }

  // Apply filters only when not fully satisfied by the indexed path (CLI-012)
  if (query.filters && !filterFullySatisfied) {
    const normalized = normalizeFilterOps(query.filters as Record<string, unknown>);
    records = records.filter((r) => applyFilter(r, normalized));
  }

  // Sort using shared core utilities
  if (query.sort) {
    const terms = parseSortTerms(query.sort as string[]);
    records = sortRecords(records, terms);
  } else if (!usedIndexedPath) {
    // Deterministic ordering: stable sort by id:asc when scan path is used
    records = sortRecords(records, [{ field: "id", direction: "asc" }]);
  }

  // Pagination
  if (query.limit || query.offset) {
    const offset = (query.offset as number) || 0;
    const limit = (query.limit as number) || records.length;
    records = records.slice(offset, offset + limit);
  }

  // Select / Expansion
  if (query.select) {
    records = await materializeSelect(
      storage,
      schema,
      resource,
      records,
      query.select as string[],
    );
  }

  return {
    data: records,
    nextCursor: null,
  };
}

/** Wrap core evaluateFilter to add field-path context to error messages. */
function applyFilter(
  record: Record<string, unknown>,
  filters: Record<string, unknown>,
  path = "filters",
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    const fieldPath = `${path}.${key}`;
    try {
      if (key === "$and" && Array.isArray(value)) {
        for (const sub of value as Record<string, unknown>[]) {
          if (!applyFilter(record, sub, path)) return false;
        }
        continue;
      }
      if (key === "$or" && Array.isArray(value)) {
        let matched = false;
        for (const sub of value as Record<string, unknown>[]) {
          try {
            if (applyFilter(record, sub, path)) { matched = true; break; }
          } catch { /* continue */ }
        }
        if (!matched) {
          // Re-run to surface errors from all branches
          for (const sub of value as Record<string, unknown>[]) {
            applyFilter(record, sub, path);
          }
          return false;
        }
        continue;
      }
      if (!coreEvaluateFilter(record, { [key]: value })) return false;
    } catch (err: any) {
      if (err && (err.code === "DFQL_UNSUPPORTED" || err.code === "DFQL_INVALID")) {
        throw { ...err, message: `${err.message}: ${fieldPath}` };
      }
      throw err;
    }
  }
  return true;
}

// normalizeFilterOps is imported from @datafn/core above.

/**
 * Detect if filters contain a single-field eq that could use an index.
 * Returns null if not applicable, or { field, value } if applicable.
 */
function detectSingleFieldEq(
  filters: Record<string, unknown>,
): { field: string; value: unknown } | null {
  const keys = Object.keys(filters);
  
  // Only consider if exactly one field and it's not a logical operator
  if (keys.length !== 1) return null;
  const key = keys[0];
  if (key.startsWith("$")) return null;
  
  const val = filters[key];
  
  // Check for { field: { eq: value } } or { field: { $eq: value } }
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const ops = val as Record<string, unknown>;
    if (ops.eq !== undefined && Object.keys(ops).length === 1) {
      return { field: key, value: ops.eq };
    }
    if (ops.$eq !== undefined && Object.keys(ops).length === 1) {
      return { field: key, value: ops.$eq };
    }
  }
  
  return null;
}
