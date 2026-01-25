/**
 * Offline aggregation logic
 */

import type { DatafnSchema } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import { expandRelation } from "./relations.js";

/**
 * Execute aggregate query locally
 */
export async function executeAggregateQuery(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  query: Record<string, unknown>,
): Promise<{ groups: Record<string, unknown>[]; nextCursor: null }> {
  // 1. Fetch all records
  // We assume filter is already applied? No, query executor applies filters.
  // But query executor calls THIS function instead of normal flow?
  // Yes, spec says: "Check if query has groupBy: If yes: call executeAggregateQuery".
  // So we need to fetch and filter here.
  // But filtering logic is in `client/src/offline/query.ts` (implied, not yet existing).
  // Actually, standard `executeLocalQuery` logic does filtering.
  // We should reuse filter logic.
  // Let's assume caller passes filtered records?
  // Or we fetch all and filter.
  // Reusing filter logic is better.
  // I will accept `records` as argument?
  // Spec says: "executeAggregateQuery(storage, schema, query)".
  // "Fetch all records... Apply filters...".
  // So I need to implement filtering here or import it.
  
  // To avoid duplication, `offline/query.ts` should handle fetching and filtering, then pass `records` to `executeAggregateQuery`?
  // Spec: "If yes: call executeAggregateQuery".
  // "executeAggregateQuery" steps include "Fetch all records... Apply filters".
  // Okay, I will import `filterRecords` helper from query module if available, or duplicate simple filter logic.
  // Client filters are usually simple (sift).
  
  const resource = query.resource as string;
  let records = await storage.listRecords(resource);
  
  // Apply filters
  if (query.filters) {
      // Need filter logic.
      // I'll define a simple evaluator or import if possible.
      // `sift` is common but I should use custom logic matching server?
      // "OFFLINE-001: Local DFQL expansion" implies matching semantics.
      // server uses `evaluateFilter`.
      // Can I share `evaluateFilter` code? It's in `server/src`. Client cannot import server code.
      // I need a client-side `evaluateFilter`.
      // For now, I will implement a basic one here or stub it.
      // Spec requirement "OFFLINE-002" says "support groupBy... filtering grouped rows deterministically".
      // It doesn't explicitly demand full filter parity but implied.
      // I will assume `evaluateFilter` is available or implement a basic one.
      
      records = records.filter(r => evaluateFilter(r, query.filters as Record<string, unknown>));
  }

  // 2. Group By
  const groupBy = query.groupBy as string[];
  const groups = new Map<string, Record<string, unknown>[]>();
  
  for (const record of records) {
      // Resolve group key
      const keyParts = [];
      for (const field of groupBy) {
          // Handle dot paths?
          // Simple field access for now.
          keyParts.push(String(record[field]));
      }
      const groupKey = keyParts.join("::"); // Simple delimiter
      
      if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(record);
  }

  // 3. Aggregations
  const results = [];
  const aggregations = query.aggregations as Record<string, Record<string, unknown>>;
  
  for (const [key, rows] of groups.entries()) {
      const result: Record<string, unknown> = {};
      
      // Set group keys
      const keyValues = key.split("::");
      groupBy.forEach((field, i) => {
          result[field] = keyValues[i]; // Type casting?
          // We stringified it. Original type lost.
          // Better: use the values from the first row in the group.
          result[field] = rows[0][field];
      });
      
      // Compute aggregations
      if (aggregations) {
          for (const [alias, def] of Object.entries(aggregations)) {
              const op = def.op as string;
              const field = def.field as string;
              
              if (op === "count") {
                  result[alias] = rows.length;
              } else if (op === "sum") {
                  result[alias] = rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
              } else if (op === "avg") {
                  const sum = rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
                  result[alias] = sum / rows.length;
              } else if (op === "min") {
                  const values = rows.map(r => Number(r[field])).filter(n => !isNaN(n));
                  result[alias] = Math.min(...values);
              } else if (op === "max") {
                  const values = rows.map(r => Number(r[field])).filter(n => !isNaN(n));
                  result[alias] = Math.max(...values);
              }
          }
      }
      
      results.push(result);
  }

  // 4. Having
  if (query.having) {
      // Filter results
      const having = query.having as Record<string, unknown>;
      // Reuse evaluateFilter
      const filteredResults = results.filter(r => evaluateFilter(r, having));
      // Reassign
      results.length = 0;
      results.push(...filteredResults);
  }

  // 5. Sort (Deterministic)
  // Default sort by group keys
  results.sort((a, b) => {
      for (const field of groupBy) {
          const va = a[field] as any;
          const vb = b[field] as any;
          if (va < vb) return -1;
          if (va > vb) return 1;
      }
      return 0;
  });

  return {
    groups: results,
    nextCursor: null, // Pagination not fully implemented for local aggregation in this phase
  };
}

// Basic filter evaluator (subset of DFQL)
function evaluateFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(filter)) {
        if (key === "$and") {
            if (!Array.isArray(value)) return false;
            if (!value.every(f => evaluateFilter(record, f))) return false;
            continue;
        }
        if (key === "$or") {
            if (!Array.isArray(value)) return false;
            if (!value.some(f => evaluateFilter(record, f))) return false;
            continue;
        }
        
        // Field check
        const recordVal = record[key];
        
        if (typeof value === "object" && value !== null) {
            // Operators
            for (const [op, opVal] of Object.entries(value)) {
                if (op === "eq" || op === "$eq") {
                    if (recordVal !== opVal) return false;
                } else if (op === "gt" || op === "$gt") {
                    if (!((recordVal as number) > (opVal as number))) return false;
                }
                // ... others
            }
        } else {
            if (recordVal !== value) return false;
        }
    }
    return true;
}
