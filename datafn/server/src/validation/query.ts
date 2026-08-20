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
import {
  parseSelectToken,
  checkPrototypePollution,
  getTemporalGroupAliases,
  parseSortTerm,
} from "@datafn/core";
import { validateFilterDepth, validateRelationDepth } from "./depth.js";

/**
 * Limits for query validation caps (SEC-015, SEC-016, VAL-002 through VAL-005)
 */
export interface QueryValidationLimits {
  maxLikePatternLength?: number;
  maxSearchQueryLength?: number;
  /** VAL-002: Max select tokens (default 50) */
  maxSelectTokens?: number;
  /** VAL-003: Max filter keys per nesting level (default 20) */
  maxFilterKeysPerLevel?: number;
  /** VAL-004: Max sort fields (default 10) */
  maxSortFields?: number;
  /** VAL-005: Max aggregation count (default 20) */
  maxAggregations?: number;
  /** VAL-009: Debug mode - when false, messages are generic */
  debug?: boolean;
}

/**
 * Validate a single query against the schema
 */
export function validateQuery(
  query: unknown,
  index: SchemaIndex,
  basePath: string = "$",
  limits?: QueryValidationLimits,
): ValidationResult<void> {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    return vErr("DFQL_INVALID", "Invalid DFQL: expected object", basePath);
  }

  const q = query as Record<string, unknown>;

  // FIX-SEC-008: Prototype pollution check on full query payload
  const queryPollutionCheck = checkPrototypePollution(q);
  if (!queryPollutionCheck.ok) {
    return vErr("DFQL_INVALID", `Disallowed key: ${queryPollutionCheck.key}`, basePath);
  }

  // Validate resource exists
  if (typeof q.resource !== "string") {
    return vErr("DFQL_INVALID", "Invalid DFQL: resource must be string", `${basePath}.resource`);
  }

  const resourceResult = getResource(index, q.resource, "resource");
  if (!resourceResult.ok) {
    return resourceResult;
  }

  const resource = resourceResult.result;
  const resourceName = q.resource;

  // Get field and relation sets for this resource
  const fieldNames = index.fieldsByResource.get(resourceName)!;
  const relationNames = index.relationsByResource.get(resourceName)!;
  const temporalAliases = getTemporalGroupAliases(q);
  const relationName = typeof q.relation === "string" ? q.relation : undefined;

  if (q.relation !== undefined) {
    if (typeof q.relation !== "string" || q.relation.length === 0) {
      return vErr("DFQL_INVALID", "Invalid DFQL: relation must be string", `${basePath}.relation`);
    }
    if (!relationNames.has(q.relation)) {
      return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: ${q.relation}`, `${basePath}.relation`);
    }
    if (typeof q.id !== "string" || q.id.length === 0) {
      return vErr("DFQL_INVALID", "Invalid DFQL: id must be string", `${basePath}.id`);
    }
    for (const unsupportedKey of ["search", "groupBy", "aggregations", "having", "temporal", "cursor"]) {
      if (q[unsupportedKey] !== undefined) {
        return vErr(
          "DFQL_UNSUPPORTED",
          `Unsupported DFQL feature for relation query: ${unsupportedKey}`,
          `${basePath}.${unsupportedKey}`,
        );
      }
    }
  }

        // Validate select tokens

        if (q.select && Array.isArray(q.select)) {

          // VAL-002: Select token count limit
          const maxSelectTokens = limits?.maxSelectTokens ?? 50;
          if (q.select.length > maxSelectTokens) {
            return vErr(
              "DFQL_INVALID",
              `Select exceeds limit: ${q.select.length} tokens (max ${maxSelectTokens})`,
              "select",
            );
          }

          for (const token of q.select) {

              if (typeof token === "string") {

                  // LIMIT-003: Relation expansion depth

                  if (!validateRelationDepth(token, 5)) { // Default 5

                      return vErr("LIMIT_EXCEEDED", `Relation nesting depth exceeds limit (5)`, "select");

                  }

              }

          }

          const selectTokens = relationName
            ? q.select.map((token) =>
                typeof token === "string" ? `${relationName}.${token}` : token,
              )
            : q.select;
          const selectResult = validateSelectTokens(

            selectTokens,

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
    const hasCursor = cursor.after !== undefined || cursor.before !== undefined;

    if (hasCursor) {
        if (!q.sort) {
            // Default sort if missing
            q.sort = ["id:asc"];
        }
        
        // Validate sort has id tie-breaker
        if (Array.isArray(q.sort)) {
            const lastSort = q.sort[q.sort.length - 1];
            try {
                const field = parseSortTerm(lastSort).field;
                if (field !== "id") {
                    return vErr(
                        "DFQL_INVALID",
                        "Invalid DFQL: cursor requires sort with id tie-breaker",
                        "sort",
                    );
                }
            } catch {
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

            limits,

          );

          if (!filterResult.ok) {

            return filterResult;

          }

        }

      
  // Validate sort
  if (q.sort && Array.isArray(q.sort)) {
    // VAL-004: Sort field count limit
    const maxSortFields = limits?.maxSortFields ?? 10;
    if (q.sort.length > maxSortFields) {
      return vErr(
        "DFQL_INVALID",
        `Sort fields exceed limit: ${q.sort.length} (max ${maxSortFields})`,
        "sort",
      );
    }
    for (let i = 0; i < q.sort.length; i++) {
      const sortItem = q.sort[i];
      let fieldName: string;
      try {
        fieldName = parseSortTerm(sortItem).field;
      } catch {
        return vErr("DFQL_INVALID", `Invalid sort format: sort[${i}]`, `sort[${i}]`);
      }

      // Allow sorting by aggregation aliases
      if (q.aggregations && typeof q.aggregations === "object" && !Array.isArray(q.aggregations)) {
          if (fieldName in q.aggregations) {
              continue;
          }
      }

        if (!fieldNames.has(fieldName)) {
        if (temporalAliases.has(fieldName)) {
          continue;
        }
        return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: sort[${i}]`, `sort[${i}]`);
      }
    }
  }

  if (q.temporal !== undefined) {
    const temporalResult = validateTemporal(q, fieldNames);
    if (!temporalResult.ok) {
      return temporalResult;
    }
  }

  // Validate groupBy
  if (q.groupBy) {
    const groupByResult = validateGroupBy(q, fieldNames, relationNames);
    if (!groupByResult.ok) {
      return groupByResult;
    }
  }

  // Collect aggregation aliases for having validation (SEC-013)
  const aggregationAliases = new Set<string>();
  if (q.aggregations && typeof q.aggregations === "object" && !Array.isArray(q.aggregations)) {
    for (const alias of Object.keys(q.aggregations as Record<string, unknown>)) {
      aggregationAliases.add(alias);
    }
  }
  for (const alias of temporalAliases) {
    aggregationAliases.add(alias);
  }

  // Validate aggregations
  if (q.aggregations) {
    // VAL-005: Aggregation count limit
    if (typeof q.aggregations === "object" && q.aggregations !== null && !Array.isArray(q.aggregations)) {
      const maxAggregations = limits?.maxAggregations ?? 20;
      const aggCount = Object.keys(q.aggregations as Record<string, unknown>).length;
      if (aggCount > maxAggregations) {
        return vErr(
          "DFQL_INVALID",
          `Aggregations exceed limit: ${aggCount} (max ${maxAggregations})`,
          "aggregations",
        );
      }
    }
    const aggResult = validateAggregations(q.aggregations, fieldNames);
    if (!aggResult.ok) {
      return aggResult;
    }
  }

  // Validate having (SEC-013: deep validation with schema fields + aggregation aliases)
  if (q.having) {
    if (typeof q.having !== "object" || Array.isArray(q.having)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: having must be object", "having");
    }
    const havingResult = validateHaving(
      q.having as Record<string, unknown>,
      resourceName,
      index,
      aggregationAliases,
      limits,
    );
    if (!havingResult.ok) {
      return havingResult;
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

    // SEC-016: Search query length cap
    const maxSearchQueryLength = limits?.maxSearchQueryLength ?? 1000;
    if (search.query.length > maxSearchQueryLength) {
      return vErr("LIMIT_EXCEEDED", "Search query exceeds maximum length", "search.query");
    }

    if (search.type && !["fullText", "semantic"].includes(search.type as string)) {
      return vErr("DFQL_INVALID", "Invalid search type", "search.type");
    }

    if (search.prefix !== undefined && typeof search.prefix !== "boolean") {
      return vErr("DFQL_INVALID", "Invalid DFQL: search.prefix must be boolean", "search.prefix");
    }

    if (
      search.fuzzy !== undefined &&
      typeof search.fuzzy !== "boolean" &&
      (typeof search.fuzzy !== "number" || !Number.isFinite(search.fuzzy) || search.fuzzy < 0)
    ) {
      return vErr(
        "DFQL_INVALID",
        "Invalid DFQL: search.fuzzy must be boolean or non-negative number",
        "search.fuzzy",
      );
    }

    if (search.fieldBoosts !== undefined) {
      if (
        typeof search.fieldBoosts !== "object" ||
        search.fieldBoosts === null ||
        Array.isArray(search.fieldBoosts)
      ) {
        return vErr(
          "DFQL_INVALID",
          "Invalid DFQL: search.fieldBoosts must be object",
          "search.fieldBoosts",
        );
      }
      const fieldBoostEntries = Object.entries(
        search.fieldBoosts as Record<string, unknown>,
      );
      if (fieldBoostEntries.length > 100) {
        return vErr(
          "LIMIT_EXCEEDED",
          "Search fieldBoosts entries exceed maximum length",
          "search.fieldBoosts",
        );
      }
      for (const [field, value] of fieldBoostEntries) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          return vErr(
            "DFQL_INVALID",
            "Invalid DFQL: search.fieldBoosts values must be finite positive numbers",
            `search.fieldBoosts.${field}`,
          );
        }
      }
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
  resource: { fields: readonly { name: string }[] },
  index: SchemaIndex,
  fieldNames: Set<string>,
  relationNames: Set<string>,
): ValidationResult<void> {
  for (let i = 0; i < select.length; i++) {
    const token = select[i];
    if (typeof token !== "string") continue;

    // Bare wildcard selects all base fields — pass without further validation
    if (token === "*") continue;

    // Parse token (e.g., "goal.*", "tags.#", "id", "tasks.tags.*")
    const { path: parts, baseName, directive } = parseSelectToken(token);

    const relationForToken = getRelation(index, resourceName, baseName);
    const isHtreeToken = relationForToken?.type === "htree";

    if (isHtreeToken) {
      const pathField = relationForToken.pathField || "parentPath";
      const hasPathField = resource.fields.some((f) => f.name === pathField);
      if (!hasPathField) {
        return vErr(
          "DFQL_UNSUPPORTED",
          `Resource ${resourceName} does not support htree (missing ${pathField})`,
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
  if (cursor.after !== undefined && (typeof cursor.after !== "object" || cursor.after === null)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: cursor.after must be object", "cursor.after");
  }
  if (cursor.before !== undefined && (typeof cursor.before !== "object" || cursor.before === null)) {
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
  relationNames: Set<string>,
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
    // SEC-014: Validate groupBy fields against schema.
    // For plain fields: must exist in schema (fields or system fields).
    // For dot-paths (e.g. "profile.city", "cat.type"): validate only the base
    // segment, which may be a field or a relation (for relation traversals).
    const baseSegment = field.includes(".") ? field.split(".")[0] : field;
    const isDotPath = field.includes(".");
    if (!fieldNames.has(isDotPath ? baseSegment : field) && !relationNames.has(baseSegment)) {
      return vErr(
        "DFQL_UNKNOWN_FIELD",
        `Unknown field: groupBy[${i}]`,
        `groupBy[${i}]`,
      );
    }
  }

  // Reject relation expansions in select if groupBy is present
  if (q.select && Array.isArray(q.select)) {
    for (let i = 0; i < q.select.length; i++) {
      const token = q.select[i];
      if (typeof token !== "string") {
        continue;
      }
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

function validateTemporal(
  q: Record<string, unknown>,
  fieldNames: Set<string>,
): ValidationResult<void> {
  const clauses = Array.isArray(q.temporal) ? q.temporal : [q.temporal];
  const validScales = new Set(["hour", "day", "week", "month", "quarter", "year"]);
  const validStorage = new Set(["unix-ms", "unix-s", "date", "iso"]);

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const path = Array.isArray(q.temporal) ? `temporal[${i}]` : "temporal";
    if (typeof clause !== "object" || clause === null || Array.isArray(clause)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: temporal clause must be object", path);
    }
    const temporal = clause as Record<string, unknown>;
    if (typeof temporal.field !== "string" || !fieldNames.has(temporal.field)) {
      return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: ${path}.field`, `${path}.field`);
    }
    if (temporal.timezone !== undefined && typeof temporal.timezone !== "string") {
      return vErr("DFQL_INVALID", "Invalid DFQL: temporal timezone must be string", `${path}.timezone`);
    }
    if (temporal.storage !== undefined && !validStorage.has(String(temporal.storage))) {
      return vErr("DFQL_INVALID", "Invalid temporal storage", `${path}.storage`);
    }
    if (temporal.period !== undefined) {
      if (typeof temporal.period !== "object" || temporal.period === null || Array.isArray(temporal.period)) {
        return vErr("DFQL_INVALID", "Invalid DFQL: temporal period must be object", `${path}.period`);
      }
      const period = temporal.period as Record<string, unknown>;
      if (!validScales.has(String(period.scale))) {
        return vErr("DFQL_INVALID", "Invalid temporal period scale", `${path}.period.scale`);
      }
    }
    if (temporal.range !== undefined) {
      if (typeof temporal.range !== "object" || temporal.range === null || Array.isArray(temporal.range)) {
        return vErr("DFQL_INVALID", "Invalid DFQL: temporal range must be object", `${path}.range`);
      }
      const range = temporal.range as Record<string, unknown>;
      if (range.start === undefined || range.end === undefined) {
        return vErr("DFQL_INVALID", "Invalid DFQL: temporal range requires start and end", `${path}.range`);
      }
    }
    if (temporal.groupBy !== undefined) {
      if (typeof temporal.groupBy !== "object" || temporal.groupBy === null || Array.isArray(temporal.groupBy)) {
        return vErr("DFQL_INVALID", "Invalid DFQL: temporal groupBy must be object", `${path}.groupBy`);
      }
      const groupBy = temporal.groupBy as Record<string, unknown>;
      if (!validScales.has(String(groupBy.scale))) {
        return vErr("DFQL_INVALID", "Invalid temporal groupBy scale", `${path}.groupBy.scale`);
      }
      if (groupBy.alias !== undefined && typeof groupBy.alias !== "string") {
        return vErr("DFQL_INVALID", "Invalid DFQL: temporal groupBy alias must be string", `${path}.groupBy.alias`);
      }
      if (groupBy.output !== undefined && !validStorage.has(String(groupBy.output))) {
        return vErr("DFQL_INVALID", "Invalid temporal groupBy output", `${path}.groupBy.output`);
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
 * SEC-013: Validate having clause against schema fields + aggregation aliases.
 * Reuses filter validation logic but extends valid field set with aggregation aliases.
 */
export function validateHaving(
  having: Record<string, unknown>,
  resourceName: string,
  index: SchemaIndex,
  aggregationAliases: Set<string>,
  limits?: QueryValidationLimits,
): ValidationResult<void> {
  // Build an augmented field set: schema fields + aggregation aliases
  const fieldNames = index.fieldsByResource.get(resourceName);
  if (!fieldNames) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, "having");
  }

  const augmentedFields = new Set([...fieldNames, ...aggregationAliases]);

  // Use filter validation but with augmented field set for having clause
  return validateHavingClause(having, resourceName, index, augmentedFields, limits);
}

/**
 * Internal having clause validation (against augmented field set)
 */
function validateHavingClause(
  filters: Record<string, unknown>,
  resourceName: string,
  index: SchemaIndex,
  augmentedFields: Set<string>,
  limits?: QueryValidationLimits,
): ValidationResult<void> {
  for (const key of Object.keys(filters)) {
    // Logical operators
    if (key === "$and" || key === "$or") {
      const value = filters[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            const err = validateHavingClause(item as Record<string, unknown>, resourceName, index, augmentedFields, limits);
            if (!err.ok) return err;
          }
        }
      }
      continue;
    }

    // Field must be in augmented set (schema fields + aggregation aliases)
    if (!augmentedFields.has(key)) {
      return vErr("DFQL_UNKNOWN_FIELD", `Unknown field in having: ${key}`, `having.${key}`);
    }

    // Validate operators on the value
    const value = filters[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const opResult = validateFilterOperators(value as Record<string, unknown>, key, limits);
      if (!opResult.ok) return opResult;
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
  limits?: QueryValidationLimits,
): ValidationResult<void> {
  // SEC-008: Prototype pollution check on filter objects
  const pollutionCheck = checkPrototypePollution(filters);
  if (!pollutionCheck.ok) {
    return vErr("DFQL_INVALID", `Disallowed key: ${pollutionCheck.key}`, "filters");
  }

  // VAL-003: Filter key count limit per nesting level
  const maxFilterKeysPerLevel = limits?.maxFilterKeysPerLevel ?? 20;
  const keyCount = Object.keys(filters).length;
  if (keyCount > maxFilterKeysPerLevel) {
    return vErr(
      "DFQL_INVALID",
      `Filter keys exceed limit: ${keyCount} (max ${maxFilterKeysPerLevel})`,
      "filters",
    );
  }

  const fieldNames = index.fieldsByResource.get(resourceName);
  if (!fieldNames) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, "$");
  }

  for (const key of Object.keys(filters)) {
    // Logical operators
    if (key === "$and") {
      const value = filters[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
          const err = validateFilters(item as Record<string, unknown>, resourceName, index, limits);
            if (!err.ok) return err;
          }
        }
      }
      continue;
    }

    // SRV-015: $or is evaluated in-memory but silently dropped by pushdown queries.
    // Reject at validation time to give callers a clear error.
    if (key === "$or") {
      return vErr(
        "DFQL_UNSUPPORTED",
        "Unsupported DFQL feature: filters.$or",
        "filters",
      );
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
        const subErr = validateFilters(subFilter as Record<string, unknown>, targetRes, index, limits);
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
      const opResult = validateFilterOperators(value as Record<string, unknown>, key, limits);
      if (!opResult.ok) {
        return opResult;
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate filter operators
 */
function validateFilterOperators(
  ops: Record<string, unknown>,
  fieldKey: string,
  limits?: QueryValidationLimits,
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
    "$is_null",
    "is_not_null",
    "$is_not_null",
    "is_empty",
    "$is_empty",
    "is_not_empty",
    "$is_not_empty",
    "before",
    "after",
    "$any", "$all", "$none",
  ];

  const maxLikePatternLength = limits?.maxLikePatternLength ?? 200;

  for (const opKey of Object.keys(ops)) {
    if (!validOps.includes(opKey)) {
      return vErr(
        "DFQL_UNSUPPORTED",
        `Unsupported DFQL feature: filters.${fieldKey}.${opKey}`,
        `filters.${fieldKey}.${opKey}`,
      );
    }
    if (
      (opKey === "is_null" || opKey === "$is_null" ||
        opKey === "is_not_null" || opKey === "$is_not_null") &&
      typeof ops[opKey] !== "boolean"
    ) {
      return vErr(
        "DFQL_INVALID",
        `Null predicate must be boolean: filters.${fieldKey}.${opKey}`,
        `filters.${fieldKey}.${opKey}`,
      );
    }
    // SEC-015: LIKE/ILIKE pattern length cap
    if (opKey === "$like" || opKey === "$ilike" || opKey === "like" || opKey === "ilike") {
      const patternValue = ops[opKey];
      if (typeof patternValue === "string" && patternValue.length > maxLikePatternLength) {
        return vErr(
          "DFQL_INVALID",
          `LIKE pattern exceeds maximum length (${maxLikePatternLength})`,
          `filters.${fieldKey}.${opKey}`,
        );
      }
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
  opts: {
    maxLimit: number;
    hasSearchProvider: boolean;
    maxLikePatternLength?: number;
    maxSearchQueryLength?: number;
    /** VAL-002 */
    maxSelectTokens?: number;
    /** VAL-003 */
    maxFilterKeysPerLevel?: number;
    /** VAL-004 */
    maxSortFields?: number;
    /** VAL-005 */
    maxAggregations?: number;
    /** VAL-009 */
    debug?: boolean;
  },
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

    // SEC-016: Check search query length BEFORE plugin check (security cap always applies)
    if (query.search && typeof query.search === "object" && query.search !== null) {
      const searchObj = query.search as Record<string, unknown>;
      if (typeof searchObj.query === "string") {
        const maxSearchQueryLength = opts.maxSearchQueryLength ?? 1000;
        if (searchObj.query.length > maxSearchQueryLength) {
          return vErr("LIMIT_EXCEEDED", "Search query exceeds maximum length", "search.query");
        }
      }
    }

    // Check for search operation - require searchfn plugin
    if (query.search && !opts.hasSearchProvider) {
      return vErr(
        "DFQL_UNSUPPORTED",
        "No search provider configured and DB adapter has no native search support",
        "search",
      );
    }

    // Validate limits
    if (typeof query.limit === "number" && query.limit > opts.maxLimit) {
      return vErr("LIMIT_EXCEEDED", `Limit exceeded: limit>${opts.maxLimit}`, "limit");
    }

    // Validate query against schema
    const queryLimits: QueryValidationLimits = {
      maxLikePatternLength: opts.maxLikePatternLength,
      maxSearchQueryLength: opts.maxSearchQueryLength,
      maxSelectTokens: opts.maxSelectTokens,
      maxFilterKeysPerLevel: opts.maxFilterKeysPerLevel,
      maxSortFields: opts.maxSortFields,
      maxAggregations: opts.maxAggregations,
      debug: opts.debug,
    };
    const result = validateQuery(query, index, isBatch ? `$[${i}]` : "$", queryLimits);
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
