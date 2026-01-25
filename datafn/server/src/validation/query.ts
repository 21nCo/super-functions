/**
 * Query validation for DFQL
 * Validates queries before execution to ensure schema-bounded correctness
 */

import type { SchemaIndex, ValidationResult } from "./schema.js";
import {
  vOk,
  vErr,
  getResource,
  isFieldOrRelation,
  getRelationTarget,
  getRelation,
} from "./schema.js";
import { validateFilterDepth, validateRelationDepth } from "./depth.js";

/**
 * Validate a single query against the schema
 */
export function validateQuery(
  query: unknown,
  index: SchemaIndex,
  basePath: string = "$",
): ValidationResult<void> {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    return vErr("DFQL_INVALID", "Invalid DFQL: expected object or array", basePath);
  }

  const q = query as Record<string, unknown>;

  // Validate resource exists
  if (typeof q.resource !== "string") {
    return vErr("DFQL_INVALID", "Invalid DFQL: resource must be string", `${basePath}.resource`);
  }

  const resourceResult = getResource(index, q.resource, "resource");
  if (!resourceResult.ok) {
    return resourceResult;
  }

  const resource = resourceResult.value;
  const resourceName = q.resource;

  // Get field and relation sets for this resource
  const fieldNames = index.fieldsByResource.get(resourceName)!;
  const relationNames = index.relationsByResource.get(resourceName)!;

        // Validate select tokens

        if (q.select && Array.isArray(q.select)) {

          for (const token of q.select) {

              if (typeof token === "string") {

                  // LIMIT-003: Relation expansion depth

                  if (!validateRelationDepth(token, 5)) { // Default 5

                      return vErr("LIMIT_EXCEEDED", `Relation nesting depth exceeds limit (5)`, "select");

                  }

              }

          }

          const selectResult = validateSelectTokens(

            q.select,

            resourceName,

            resource,

            index,

            fieldNames,

            relationNames,

          );

          if (!selectResult.ok) {

            return selectResult;

          }

        }

      
    // Validate count
  if (q.count !== undefined && typeof q.count !== "boolean") {
    return vErr("DFQL_INVALID", "Invalid DFQL: count must be boolean", "count");
  }

  // Validate cursor and sort tie-breaker
  if (q.cursor && typeof q.cursor === "object") {
    const cursor = q.cursor as Record<string, unknown>;
    const hasCursor = cursor.after || cursor.before;

    if (hasCursor) {
        if (!q.sort) {
            // Default sort if missing
            q.sort = ["id:asc"];
        }
        
        // Validate sort has id tie-breaker
        if (Array.isArray(q.sort)) {
            const lastSort = q.sort[q.sort.length - 1];
            if (typeof lastSort === "string") {
                const parts = lastSort.split(":");
                const field = parts[0];
                if (field !== "id") {
                    return vErr(
                        "DFQL_INVALID",
                        "Cursor pagination requires id as final sort key",
                        "sort",
                    );
                }
            } else {
                 return vErr("DFQL_INVALID", "Invalid sort format", "sort");
            }
        }
    }

    const cursorResult = validateCursor(q.cursor as Record<string, unknown>, q.sort);
    if (!cursorResult.ok) {
      return cursorResult;
    }
  }

  // Validate omit tokens
  if (q.omit && Array.isArray(q.omit)) {
    for (let i = 0; i < q.omit.length; i++) {
      const field = q.omit[i];
      if (typeof field !== "string") continue;

      if (!fieldNames.has(field)) {
        return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: omit[${i}]`, `omit[${i}]`);
      }
    }
  }

        // Validate filters

        if (q.filters && typeof q.filters === "object" && !Array.isArray(q.filters)) {

          // LIMIT-002: Filter nesting depth

          if (!validateFilterDepth(q.filters, 10)) { // Default 10

              return vErr("LIMIT_EXCEEDED", `Filter nesting depth exceeds limit (10)`, "filters");

          }

      

          const filterResult = validateFilters(

            q.filters as Record<string, unknown>,

            resourceName,

            index,

          );

          if (!filterResult.ok) {

            return filterResult;

          }

        }

      
    // Validate sort
  if (q.sort && Array.isArray(q.sort)) {
    for (let i = 0; i < q.sort.length; i++) {
      const sortItem = q.sort[i];
      if (typeof sortItem !== "string") continue;

      // Parse sort field (can be "fieldName" or "fieldName:asc/desc")
      const parts = sortItem.split(":");
      const fieldName = parts[0];

      // Allow sorting by aggregation aliases
      if (q.aggregations && typeof q.aggregations === "object" && !Array.isArray(q.aggregations)) {
          if (fieldName in q.aggregations) {
              continue;
          }
      }

      if (!fieldNames.has(fieldName)) {
        return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: sort[${i}]`, `sort[${i}]`);
      }
    }
  }

  // Validate groupBy
  if (q.groupBy) {
    const groupByResult = validateGroupBy(q, fieldNames);
    if (!groupByResult.ok) {
      return groupByResult;
    }
  }

  // Validate aggregations
  if (q.aggregations) {
    const aggResult = validateAggregations(q.aggregations, fieldNames);
    if (!aggResult.ok) {
      return aggResult;
    }
  }

  // Validate having
  if (q.having) {
    if (typeof q.having !== "object" || Array.isArray(q.having)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: having must be object", "having");
    }
  }

  // Validate search
  if (q.search) {
    if (typeof q.search !== "object" || q.search === null || Array.isArray(q.search)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: search must be object", "search");
    }
    const search = q.search as Record<string, unknown>;

    if (typeof search.query !== "string") {
      return vErr("DFQL_INVALID", "Search query must be string", "search.query");
    }

    if (search.type && !["fullText", "semantic"].includes(search.type as string)) {
      return vErr("DFQL_INVALID", "Invalid search type", "search.type");
    }

    if (search.fields) {
      if (!Array.isArray(search.fields)) {
        return vErr("DFQL_INVALID", "Search fields must be array", "search.fields");
      }
      for (let i = 0; i < search.fields.length; i++) {
        const f = search.fields[i];
        if (typeof f !== "string") {
           return vErr("DFQL_INVALID", "Search field must be string", `search.fields[${i}]`);
        }
        if (!fieldNames.has(f)) {
          return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: ${f}`, `search.fields[${i}]`);
        }
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate select tokens
 */
function validateSelectTokens(
  select: unknown[],
  resourceName: string,
  resource: { fields: Array<{ name: string }> },
  index: SchemaIndex,
  fieldNames: Set<string>,
  relationNames: Set<string>,
): ValidationResult<void> {
  for (let i = 0; i < select.length; i++) {
    const token = select[i];
    if (typeof token !== "string") continue;

    // Parse token (e.g., "goal.*", "tags.#", "id", "tasks.tags.*")
    const parts = token.split(".");
    const baseName = parts[0];
    const directive = parts.slice(1).join(".") || undefined;

    // HTREE support
    const isHtreeToken = baseName === "parent" || baseName === "children";

    if (isHtreeToken) {
      const hasParentPath = resource.fields.some((f) => f.name === "parentPath");
      if (!hasParentPath) {
        return vErr(
          "DFQL_UNSUPPORTED",
          `Resource ${resourceName} does not support htree (missing parentPath)`,
          `select[${i}]`,
        );
      }

      if (baseName === "parent") {
        if (directive === "**") {
          return vErr(
            "DFQL_UNSUPPORTED",
            `Unsupported DFQL feature: select.parent.**`,
            `select[${i}]`,
          );
        }
        if (directive !== "*") {
          return vErr(
            "DFQL_UNSUPPORTED",
            `Unsupported or invalid parent directive: ${token}`,
            `select[${i}]`,
          );
        }
      } else if (baseName === "children") {
        if (directive !== "*" && directive !== "**") {
          return vErr(
            "DFQL_UNSUPPORTED",
            `Unsupported or invalid children directive: ${token}`,
            `select[${i}]`,
          );
        }
      }
      continue;
    }

    // Check if it's a field or relation
    if (!fieldNames.has(baseName) && !relationNames.has(baseName)) {
      return vErr(
        parts.length > 1 ? "DFQL_UNKNOWN_RELATION" : "DFQL_UNKNOWN_FIELD",
        parts.length > 1 ? `Unknown relation: select[${i}]` : `Unknown field: select[${i}]`,
        `select[${i}]`,
      );
    }

    // If it has directives (.*, .#, etc.), verify it's a relation
    if (parts.length > 1 && !relationNames.has(baseName)) {
      return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: select[${i}]`, `select[${i}]`);
    }

    // For nested tokens (e.g., "tasks.tags.*"), validate intermediate relations
    if (parts.length > 2) {
      const intermediateRelation = getRelation(index, resourceName, baseName);

      if (!intermediateRelation) {
        return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: select[${i}]`, `select[${i}]`);
      }

      const targetResource = getRelationTarget(index, resourceName, baseName);
      if (!targetResource) {
        return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: select[${i}]`, `select[${i}]`);
      }

      const nextRelation = parts[1];
      const targetRelations = index.relationsByResource.get(targetResource);

      const isDirective = ["*", "#", "*#"].includes(nextRelation);
      if (!isDirective && !targetRelations?.has(nextRelation)) {
        return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: select[${i}]`, `select[${i}]`);
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate cursor
 */
function validateCursor(
  cursor: Record<string, unknown>,
  sort: unknown,
): ValidationResult<void> {
  if (cursor.after && (typeof cursor.after !== "object" || cursor.after === null)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: cursor.after must be object", "cursor.after");
  }
  if (cursor.before && (typeof cursor.before !== "object" || cursor.before === null)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: cursor.before must be object", "cursor.before");
  }
  return vOk(undefined);
}

/**
 * Validate groupBy
 */
function validateGroupBy(
  q: Record<string, unknown>,
  fieldNames: Set<string>,
): ValidationResult<void> {
  if (!Array.isArray(q.groupBy)) {
    return vErr("DFQL_INVALID", "Invalid DFQL: groupBy must be an array", "groupBy");
  }

  for (let i = 0; i < q.groupBy.length; i++) {
    const field = q.groupBy[i];
    if (typeof field !== "string") {
      return vErr(
        "DFQL_INVALID",
        "Invalid DFQL: groupBy element must be string",
        `groupBy[${i}]`,
      );
    }
  }

  // Reject relation expansions in select if groupBy is present
  if (q.select && Array.isArray(q.select)) {
    for (let i = 0; i < q.select.length; i++) {
      const token = q.select[i] as string;
      if (token.includes(".*") || token.includes(".**") || token.endsWith(".#")) {
        return vErr(
          "DFQL_UNSUPPORTED",
          "Relation expansion not allowed with groupBy",
          `select[${i}]`,
        );
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate aggregations
 */
function validateAggregations(
  aggregations: unknown,
  fieldNames: Set<string>,
): ValidationResult<void> {
  if (typeof aggregations !== "object" || aggregations === null || Array.isArray(aggregations)) {
    return vErr("DFQL_INVALID", "Invalid DFQL: aggregations must be an object", "aggregations");
  }

  const validOps = ["count", "sum", "min", "max", "avg"];

  for (const [alias, def] of Object.entries(aggregations)) {
    if (typeof def !== "object" || def === null) {
      return vErr("DFQL_INVALID", "Invalid aggregation definition", `aggregations.${alias}`);
    }

    const agg = def as Record<string, unknown>;
    if (!validOps.includes(agg.op as string)) {
      return vErr(
        "DFQL_INVALID",
        `Invalid aggregation operator: ${agg.op}`,
        `aggregations.${alias}.op`,
      );
    }

    if (typeof agg.field !== "string") {
      return vErr(
        "DFQL_INVALID",
        "Aggregation field must be string",
        `aggregations.${alias}.field`,
      );
    }

    // Allow count(*) 
    if (agg.op === "count" && agg.field === "*") {
      continue;
    }

    // Validate field exists for other operations
    if (!fieldNames.has(agg.field)) {
      return vErr(
        "DFQL_UNKNOWN_FIELD",
        `Unknown field: ${agg.field}`,
        `aggregations.${alias}.field`,
      );
    }
  }

  return vOk(undefined);
}

/**
 * Recursively validate filters against schema
 */
export function validateFilters(
  filters: Record<string, unknown>,
  resourceName: string,
  index: SchemaIndex,
): ValidationResult<void> {
  const fieldNames = index.fieldsByResource.get(resourceName);
  if (!fieldNames) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, "$");
  }

  for (const key of Object.keys(filters)) {
    // Logical operators
    if (key === "$and" || key === "$or") {
      const value = filters[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            const err = validateFilters(item as Record<string, unknown>, resourceName, index);
            if (!err.ok) return err;
          }
        }
      }
      continue;
    }

    // Dot-path: "goal.label" or "profile.city"
    if (key.includes(".")) {
      const parts = key.split(".");
      
      // Check if base is a field on current resource (Nested Object)
      if (fieldNames.has(parts[0])) {
          // If it's a field, we assume nested access is valid (e.g. JSON/Object)
          // We could strictly check type if schema provided it, but for now allow it.
          // Recursively validate operators on the value?
          const value = filters[key];
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
             const opResult = validateFilterOperators(value as Record<string, unknown>, key);
             if (!opResult.ok) return opResult;
          }
          continue;
      }

      let currentRes = resourceName;

      // Traverse all but last part to find target resource
      // (Original logic continued)
      // Actually my previous replace truncated the logic. 
      // I need to restore the logic for relation traversal if NOT a field.
      // But I can't guess what was there unless I read what I replaced.
      // Let's rewrite the block completely based on context.
      
      for (let i = 0; i < parts.length - 1; i++) {
        const relName = parts[i];
        const rel = getRelation(index, currentRes, relName);

        if (!rel) {
          return vErr("DFQL_UNKNOWN_FIELD", `Unknown path segment: ${relName}`, `filters.${key}`);
        }

        const target = getRelationTarget(index, currentRes, relName);
        if (!target) {
          return vErr("DFQL_UNKNOWN_FIELD", `Unknown path segment: ${relName}`, `filters.${key}`);
        }
        currentRes = target;
      }

      const lastField = parts[parts.length - 1];
      const targetFields = index.fieldsByResource.get(currentRes);

      if (!targetFields?.has(lastField)) {
        return vErr(
          "DFQL_UNKNOWN_FIELD",
          `Unknown field: ${lastField} on ${currentRes}`,
          `filters.${key}`,
        );
      }
      continue;
    }


    // Check if it's a relation
    const relations = index.relationsByResource.get(resourceName);
    if (relations?.has(key)) {
      const val = filters[key];
      if (typeof val !== "object" || val === null) {
        return vErr("DFQL_INVALID", `Relation filter must be object`, `filters.${key}`);
      }

      const ops = val as Record<string, unknown>;
      const validOps = ["$any", "$all", "$none"];

      for (const opKey of Object.keys(ops)) {
        if (!validOps.includes(opKey)) {
          return vErr("DFQL_INVALID", `Unknown relation quantifier: ${opKey}`, `filters.${key}`);
        }

        const targetRes = getRelationTarget(index, resourceName, key);
        if (!targetRes) {
          return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: ${key}`, `filters.${key}`);
        }

        const subFilter = ops[opKey];
        if (subFilter && typeof subFilter === "object") {
          const subErr = validateFilters(subFilter as Record<string, unknown>, targetRes, index);
          if (!subErr.ok) return subErr;
        }
      }
      continue;
    }

    // Regular field filter
    if (!fieldNames.has(key)) {
      return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: filters.${key}`, `filters.${key}`);
    }

    // Field value validation (operators)
    const value = filters[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const opResult = validateFilterOperators(value as Record<string, unknown>, key);
      if (!opResult.ok) {
        return opResult;
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate dot-path in filters
 */
function validateDotPath(
  key: string,
  resourceName: string,
  index: SchemaIndex,
): ValidationResult<void> {
  const parts = key.split(".");
  let currentRes = resourceName;

  for (let i = 0; i < parts.length - 1; i++) {
    const relName = parts[i];
    const rel = getRelation(index, currentRes, relName);

    if (!rel) {
      return vErr("DFQL_UNKNOWN_FIELD", `Unknown path segment: ${relName}`, `filters.${key}`);
    }

    const target = getRelationTarget(index, currentRes, relName);
    if (!target) {
      return vErr("DFQL_UNKNOWN_FIELD", `Unknown path segment: ${relName}`, `filters.${key}`);
    }
    currentRes = target;
  }

  const lastField = parts[parts.length - 1];
  const targetFields = index.fieldsByResource.get(currentRes);

  if (!targetFields?.has(lastField)) {
    return vErr(
      "DFQL_UNKNOWN_FIELD",
      `Unknown field: ${lastField} on ${currentRes}`,
      `filters.${key}`,
    );
  }

  return vOk(undefined);
}

/**
 * Validate filter operators
 */
function validateFilterOperators(
  ops: Record<string, unknown>,
  fieldKey: string,
): ValidationResult<void> {
  const validOps = [
    "eq", "$eq",
    "ne", "$ne",
    "gt", "$gt",
    "gte", "$gte",
    "lt", "$lt",
    "lte", "$lte",
    "like", "$like",
    "ilike", "$ilike",
    "in", "$in",
    "not_in", "$nin",
    "not_like",
    "not_ilike",
    "between",
    "not_between",
    "is_null",
    "is_not_null",
    "is_empty",
    "is_not_empty",
    "before",
    "after",
    "$any", "$all", "$none",
  ];

  for (const opKey of Object.keys(ops)) {
    if (!validOps.includes(opKey)) {
      return vErr(
        "DFQL_UNSUPPORTED",
        `Unsupported DFQL feature: filters.${fieldKey}.${opKey}`,
        `filters.${fieldKey}.${opKey}`,
      );
    }
  }

  return vOk(undefined);
}

/**
 * Validate query body (single or batch)
 */
export function validateQueryBody(
  body: unknown,
  index: SchemaIndex,
  opts: { maxLimit: number; hasSearchPlugin: boolean },
): ValidationResult<{ isBatch: boolean; queries: Record<string, unknown>[] }> {
  if (typeof body !== "object" || body === null) {
    return vErr("DFQL_INVALID", "Invalid DFQL: expected object or array", "$");
  }

  const isBatch = Array.isArray(body);
  const queries = isBatch ? (body as unknown[]) : [body];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];

    // Basic type check
    if (typeof q !== "object" || q === null || Array.isArray(q)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: expected object or array", "$");
    }

    const query = q as Record<string, unknown>;

    // Check for search operation - require searchfn plugin
    if (query.search && !opts.hasSearchPlugin) {
      return vErr("DFQL_UNSUPPORTED", "DFQL search requires searchfn plugin", "search");
    }

    // Validate limits
    if (typeof query.limit === "number" && query.limit > opts.maxLimit) {
      return vErr("LIMIT_EXCEEDED", `Limit exceeded: limit>${opts.maxLimit}`, "limit");
    }

    // Validate query against schema
    const result = validateQuery(query, index, isBatch ? `$[${i}]` : "$");
    if (!result.ok) {
      // Add index to error for batch operations
      if (isBatch) {
        return {
          ok: false,
          error: {
            ...result.error,
            details: { ...result.error.details, index: i },
          },
        };
      }
      return result;
    }
  }

  return vOk({
    isBatch,
    queries: queries as Record<string, unknown>[],
  });
}
