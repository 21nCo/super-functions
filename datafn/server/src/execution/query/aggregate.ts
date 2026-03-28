import { evaluateFilter } from "./filters.js";
import { parseSortTerms } from "./sort.js";
import { calculateAggregation } from "@datafn/core";
import { applyLimitOffset, applyCursorAfter, computeNextCursor } from "./pagination.js";

/**
 * Execute an aggregate query using in-memory grouping and aggregation
 */
export function executeAggregateQuery(
  query: Record<string, unknown>,
  records: Record<string, unknown>[],
  schema: { resources: Array<{ name: string; fields: Array<{ name: string }> }>; relations?: unknown[] },
  store: { getRecord: (resource: string, id: string) => Record<string, unknown> | null | undefined },
): { groups: Record<string, unknown>[]; nextCursor: unknown | null } {
  // EXE-013: Cache resource schema lookup (called per record otherwise)
  const resourceSchema = schema.resources.find((r) => r.name === query.resource);

  // 1. Filter
  let filtered = records;

  if (query.filters) {
    filtered = records.filter((record) =>
      evaluateFilter(
        record,
        query.filters as any,
        query.resource as string,
        schema,
        store,
      ),
    );
  }

  // 2. Group
  const groupBy = query.groupBy as string[];
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const record of filtered) {
    const keyParts = groupBy.map((field) => {
      // Resolve field value (support dot path)
      const val = resolveValue(
        record,
        field,
        schema,
        store,
        query.resource as string,
        resourceSchema,
      );
      return String(val); // Composite key component
    });
    const key = JSON.stringify(keyParts); // Structured key avoids collision when values contain separator chars

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  // 3. Aggregate
  const aggregations = (query.aggregations as Record<string, { op: string; field: string }>) || {};
  let results: Record<string, unknown>[] = [];

  for (const [, groupRecords] of groups.entries()) {
    const row: Record<string, unknown> = {};

    // Add group keys to row — re-resolve from sample record to preserve types
    groupBy.forEach((field) => {
      const sample = groupRecords[0];
      const val = resolveValue(
        sample,
        field,
        schema,
        store,
        query.resource as string,
        resourceSchema,
      );
      row[field] = val;
    });

    // Calculate aggregations
    for (const [alias, def] of Object.entries(aggregations)) {
      const { op, field } = def as { op: string; field: string };
      row[alias] = calculateAggregation(op, field, groupRecords);
    }

    results.push(row);
  }

  // 4. Having
  if (query.having) {
    results = results.filter((row) =>
      evaluateFilter(
        row,
        query.having as Record<string, unknown>,
        query.resource as string,
        schema as Parameters<typeof evaluateFilter>[3],
        store as Parameters<typeof evaluateFilter>[4],
      ),
    );
  }

  // 5. Order
  const sort = query.sort as string[] | undefined;
  // If no sort provided, default to group keys ASC
  const effectiveSort = sort || groupBy.map(k => `${k}:asc`);
  
  const sortTerms = parseSortTerms(effectiveSort);
  results = orderGroupedResults(results, sortTerms);

  // 6. Pagination (Cursor/Limit/Offset)
  // Apply cursor.after if present
  if (query.cursor && (query.cursor as any).after) {
    results = applyCursorAfter(results, (query.cursor as any).after, sortTerms);
  }
  
  // Apply limit/offset
  // Fetch limit + 1 for nextCursor check
  const limit = typeof query.limit === "number" ? query.limit : undefined;
  const offset = typeof query.offset === "number" ? query.offset : undefined;
  
  // Apply Limit+Offset
  const paginated = applyLimitOffset(results, limit ? limit + 1 : undefined, offset);
  
  // Compute nextCursor
  const nextCursor = computeNextCursor(paginated, sortTerms, limit);
  
  // Slice to limit
  if (limit && paginated.length > limit) {
    paginated.length = limit;
  }

  return {
    groups: paginated,
    nextCursor,
  };
}

function orderGroupedResults(groups: Record<string, unknown>[], sortTerms: Array<{ field: string; direction: string }>): Record<string, unknown>[] {
  const compareUnknown = (a: unknown, b: unknown): number => {
    if (a === b) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === "number" && typeof b === "number") {
      return a < b ? -1 : 1;
    }
    const aText = String(a);
    const bText = String(b);
    return aText < bText ? -1 : aText > bText ? 1 : 0;
  };

  // LOW-019: Use spread to avoid mutating the input array
  return [...groups].sort((a, b) => {
    for (const term of sortTerms) {
      const field = term.field;
      const direction = term.direction === "asc" ? 1 : -1;
      
      const valA = a[field];
      const valB = b[field];
      const cmp = compareUnknown(valA, valB);
      if (cmp < 0) return -1 * direction;
      if (cmp > 0) return 1 * direction;
    }
    return 0;
  });
}

function resolveValue(
  record: Record<string, unknown>,
  path: string,
  schema: { resources: Array<{ name: string; fields: Array<{ name: string }> }>; relations?: unknown[] },
  store: { getRecord: (resource: string, id: string) => Record<string, unknown> | null | undefined },
  resourceName: string,
  precomputedResource?: { name: string; fields: Array<{ name: string }> }, // EXE-013: pre-computed to avoid per-record O(n) lookup
): unknown {
  if (!path.includes(".")) {
    return record[path];
  }

  // Dot path resolution
  const parts = path.split(".");

  // EXE-013: Use pre-computed resource schema when available
  const resource = precomputedResource ?? schema.resources.find((r) => r.name === resourceName);
  const baseName = parts[0];
  const isField = resource?.fields.some((f) => f.name === baseName);
  
  if (isField) {
      // Nested object traversal
      let current: unknown = record;
      for (const part of parts) {
          if (current === null || current === undefined) return undefined;
          if (typeof current !== "object") return undefined;
          current = (current as Record<string, unknown>)[part];
      }
      return current;
  }

  let currentRecord: Record<string, unknown> = record;
  let currentResource = resourceName;

  for (let i = 0; i < parts.length - 1; i++) {
    const relName = parts[i];
    // Find relation
    const rel = (schema.relations as Array<Record<string, unknown>> | undefined)?.find(
      (r) =>
        (r.from === currentResource && r.relation === relName) ||
        (r.to === currentResource && r.inverse === relName),
    );

    if (!rel) return undefined; // Invalid path or not loaded

    const isForward = rel.from === currentResource;

    if (rel.type === "many-one" && isForward) {
      const fk = (rel.fkField || rel.foreignKey) as string;
      const targetId = currentRecord[fk];
      if (!targetId) return null;
      const target = store.getRecord(rel.to as string, targetId as string);
      if (!target) return null;
      currentRecord = target;
      currentResource = rel.to as string;
    } else {
      return undefined; // Not supported
    }
  }

  const lastField = parts[parts.length - 1];
  return currentRecord[lastField];
}

// calculateAggregation is imported from @datafn/core above.
