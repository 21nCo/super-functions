import { evaluateFilter } from "./filters.js";
import { parseSortTerms } from "./sort.js";
import { applyLimitOffset, applyCursorAfter, computeNextCursor } from "./pagination.js";

/**
 * Execute an aggregate query using in-memory grouping and aggregation
 */
export function executeAggregateQuery(
  query: Record<string, unknown>,
  records: any[],
  schema: any,
  store: any,
): { groups: any[]; nextCursor: unknown | null } {
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
  const groups = new Map<string, any[]>();

  for (const record of filtered) {
    const keyParts = groupBy.map((field) => {
      // Resolve field value (support dot path)
      const val = resolveValue(
        record,
        field,
        schema,
        store,
        query.resource as string,
      );
      return String(val); // Composite key component
    });
    const key = keyParts.join("||"); // Simple separator for map key

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  // 3. Aggregate
  const aggregations = (query.aggregations as Record<string, any>) || {};
  let results: any[] = [];

  for (const [key, groupRecords] of groups.entries()) {
    const row: any = {};

    // Add group keys to row
    const keyParts = key.split("||");
    groupBy.forEach((field, idx) => {
      // Re-resolve value from sample record to preserve type (mostly)
      // or rely on stringified key if we only have scalar keys
      const sample = groupRecords[0];
      const val = resolveValue(
        sample,
        field,
        schema,
        store,
        query.resource as string,
      );
      row[field] = val;
    });

    // Calculate aggregations
    for (const [alias, def] of Object.entries(aggregations)) {
      const { op, field } = def;
      row[alias] = calculateAggregation(
        op,
        field,
        groupRecords,
        schema,
        store,
        query.resource as string,
      );
    }

    results.push(row);
  }

  // 4. Having
  if (query.having) {
    results = results.filter((row) =>
      evaluateFilter(
        row,
        query.having as any,
        query.resource as string,
        schema,
        store,
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

function orderGroupedResults(groups: any[], sortTerms: any[]): any[] {
  return groups.sort((a, b) => {
    for (const term of sortTerms) {
      const field = term.field;
      const direction = term.direction === "asc" ? 1 : -1;
      
      const valA = a[field];
      const valB = b[field];
      
      if (valA < valB) return -1 * direction;
      if (valA > valB) return 1 * direction;
    }
    return 0;
  });
}

function resolveValue(
  record: any,
  path: string,
  schema: any,
  store: any,
  resourceName: string,
): any {
  if (!path.includes(".")) {
    return record[path];
  }

  // Dot path resolution
  const parts = path.split(".");
  
  // Check if base is a field on current resource (Nested Object)
  // We need to check schema to be sure, but if relation check fails, fallback to object property?
  // Or check schema first.
  const resource = schema.resources.find((r: any) => r.name === resourceName);
  const baseName = parts[0];
  const isField = resource?.fields.some((f: any) => f.name === baseName);
  
  if (isField) {
      // Nested object traversal
      let current = record;
      for (const part of parts) {
          if (current === null || current === undefined) return undefined;
          current = current[part];
      }
      return current;
  }

  let currentRecord = record;
  let currentResource = resourceName;

  for (let i = 0; i < parts.length - 1; i++) {
    const relName = parts[i];
    // Find relation
    const rel = schema.relations?.find(
      (r: any) =>
        (r.from === currentResource && r.relation === relName) ||
        (r.to === currentResource && r.inverse === relName),
    );

    if (!rel) return undefined; // Invalid path or not loaded

    const isForward = rel.from === currentResource;

    if (rel.type === "many-one" && isForward) {
      const fk = (rel as any).fkField || (rel as any).foreignKey;
      const targetId = currentRecord[fk];
      if (!targetId) return null;
      const target = store.getRecord(rel.to, targetId);
      if (!target) return null;
      currentRecord = target;
      currentResource = rel.to;
    } else {
      return undefined; // Not supported
    }
  }

  const lastField = parts[parts.length - 1];
  return currentRecord[lastField];
}

function calculateAggregation(
  op: string,
  field: string,
  records: any[],
  schema: any,
  store: any,
  resourceName: string,
): any {
  if (op === "count") {
    return records.length;
  }

  const values = records
    .map((r) => r[field])
    .filter((v) => v !== null && v !== undefined);

  if (values.length === 0) return null; // or 0? SQL says null for sum/avg/min/max of empty.

  if (op === "sum") {
    return values.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
  }
  if (op === "min") {
    // string or number comparison
    // assuming homogeneous
    let min = values[0];
    for (const v of values) {
      if (v < min) min = v;
    }
    return min;
  }
  if (op === "max") {
    let max = values[0];
    for (const v of values) {
      if (v > max) max = v;
    }
    return max;
  }
  if (op === "avg") {
    const sum = values.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
    return sum / values.length;
  }
  return null;
}
