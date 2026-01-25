/**
 * Offline query executor
 */

import type { DatafnSchema } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import { materializeSelect } from "./relations.js";
import { executeAggregateQuery } from "./aggregate.js";

/**
 * Execute a local query
 */
export async function executeLocalQuery(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  query: Record<string, unknown>,
): Promise<{ data?: any[]; groups?: any[]; nextCursor?: any }> {
  // Check for aggregation
  if (query.groupBy) {
    return executeAggregateQuery(storage, schema, query);
  }

  const resource = query.resource as string;
  let records = await storage.listRecords(resource);

  // Apply filters
  if (query.filters) {
    records = records.filter(r => evaluateFilter(r, query.filters as Record<string, unknown>));
  }

  // Sort
  if (query.sort) {
      const sort = query.sort as string[];
      records.sort((a, b) => {
          for (const term of sort) {
              const [field, dir] = term.split(":");
              const va = a[field] as any;
              const vb = b[field] as any;
              if (va < vb) return dir === "desc" ? 1 : -1;
              if (va > vb) return dir === "desc" ? -1 : 1;
          }
          return 0;
      });
  }

  // Pagination
  // Skip for now or simple slice
  if (query.limit) {
      records = records.slice(0, query.limit as number);
  }

  // Select / Expansion
  if (query.select) {
      records = await materializeSelect(storage, schema, resource, records, query.select as string[]);
  }

  return {
    data: records,
    nextCursor: null
  };
}

// Duplicated filter logic (should be shared)
function evaluateFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
        if (key === "$and") {
            if (!Array.isArray(value)) return false;
            if (!value.every(f => evaluateFilter(record, f))) return false;
            continue;
        }
        
        const recordVal = record[key];
        
        if (typeof value === "object" && value !== null) {
             for (const [op, opVal] of Object.entries(value)) {
                if (op === "eq" || op === "$eq") {
                    if (recordVal !== opVal) return false;
                }
             }
        } else {
            if (recordVal !== value) return false;
        }
    }
    return true;
}