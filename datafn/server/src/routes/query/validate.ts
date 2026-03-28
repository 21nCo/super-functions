/**
 * FIX-SRV-005: Query validation module
 * Extracted from routes/query.ts — single responsibility: DFQL structural validation
 */

import type { DatafnSchema } from "../../core-types.js";
import type { SchemaIndex, QueryValidationLimits } from "../../validation/index.js";
import { validateQueryBody as validateQueryBodyCore } from "../../validation/index.js";
import { getCapabilityFields, resolveCapabilities } from "@datafn/core";

export interface QueryRouteValidationOpts extends QueryValidationLimits {
  maxLimit: number;
  hasSearchProvider: boolean;
}

function getResourceFieldNames(
  schema: DatafnSchema,
  resourceName: string,
): Set<string> {
  const resource = schema.resources.find((r) => r.name === resourceName);
  const fields = new Set<string>(["id"]);
  if (!resource) {
    return fields;
  }

  const resolvedCapabilities = resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );
  for (const capabilityField of getCapabilityFields(resolvedCapabilities as any)) {
    fields.add(capabilityField.name);
  }
  for (const field of resource.fields) {
    fields.add(field.name);
  }

  return fields;
}

/**
 * FIX-SRV-005: Runtime validation bridge used by routes/query.ts.
 * Delegates to the canonical validation module to preserve behavior.
 */
export function validateQueryBody(
  body: unknown,
  index: SchemaIndex,
  opts: QueryRouteValidationOpts,
) {
  return validateQueryBodyCore(body, index, opts);
}

/**
 * Validate a single query object against the schema
 */
export function validateQuery(
  query: unknown,
  schema: DatafnSchema,
): { ok: true } | { ok: false; code: string; message: string; path: string } {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: "Invalid DFQL: expected object",
      path: "$",
    };
  }

  const q = query as Record<string, unknown>;

  // Validate resource exists
  if (typeof q.resource !== "string") {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: "Invalid DFQL: resource must be string",
      path: "resource",
    };
  }

  const resource = schema.resources.find((r) => r.name === q.resource);
  if (!resource) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${q.resource}`,
      path: "resource",
    };
  }

  const fieldNames = getResourceFieldNames(schema, resource.name);

  // Collect all relation names
  const relationNames = new Set<string>();
  if (schema.relations) {
    for (const rel of schema.relations) {
      if (rel.from === q.resource && rel.relation) {
        relationNames.add(rel.relation);
      }
      if (rel.to === q.resource && rel.inverse) {
        relationNames.add(rel.inverse);
      }
    }
  }

  // Validate select tokens
  if (q.select && Array.isArray(q.select)) {
    for (let i = 0; i < q.select.length; i++) {
      const token = q.select[i];
      if (typeof token !== "string") continue;

      // Parse token (e.g., "goal.*", "tags.#", "id", "tasks.tags.*")
      const parts = token.split(".");
      const baseName = parts[0];
      const directive = parts.slice(1).join(".") || undefined;

      // Phase 13: HTREE support
      const isHtreeToken = baseName === "parent" || baseName === "children";

      if (isHtreeToken) {
        // Check if resource has parentPath field
        const hasParentPath = resource.fields.some(
          (f) => f.name === "parentPath",
        ); // or check pathField
        if (!hasParentPath) {
          return {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: `Resource ${q.resource} does not support htree (missing parentPath)`,
            path: `select[${i}]`,
          };
        }

        if (baseName === "parent") {
          // parent.* is allowed. parent.** is rejected (TV-HTREE-002)
          if (directive === "**") {
            return {
              ok: false,
              code: "DFQL_UNSUPPORTED",
              message: `Unsupported DFQL feature: select.parent.**`,
              path: `select[${i}]`,
            };
          }
          if (directive !== "*") {
            return {
              ok: false,
              code: "DFQL_UNSUPPORTED", // or INVALID?
              message: `Unsupported or invalid parent directive: ${token}`,
              path: `select[${i}]`,
            };
          }
        } else if (baseName === "children") {
          // children.* and children.** allowed
          if (directive !== "*" && directive !== "**") {
            return {
              ok: false,
              code: "DFQL_UNSUPPORTED",
              message: `Unsupported or invalid children directive: ${token}`,
              path: `select[${i}]`,
            };
          }
        }
        continue;
      }

      // Check if it's a field or relation
      if (!fieldNames.has(baseName) && !relationNames.has(baseName)) {
        return {
          ok: false,
          code:
            parts.length > 1 ? "DFQL_UNKNOWN_RELATION" : "DFQL_UNKNOWN_FIELD",
          message:
            parts.length > 1
              ? `Unknown relation: select[${i}]`
              : `Unknown field: select[${i}]`,
          path: `select[${i}]`,
        };
      }

      // If it has directives (.*,  .#, etc.), verify it's a relation
      if (parts.length > 1 && !relationNames.has(baseName)) {
        return {
          ok: false,
          code: "DFQL_UNKNOWN_RELATION",
          message: `Unknown relation: select[${i}]`,
          path: `select[${i}]`,
        };
      }

      // For nested tokens (e.g., "tasks.tags.*"), validate intermediate relations
      if (parts.length > 2) {
        // Validate intermediate relation exists
        const intermediateRelation = schema.relations?.find(
          (r) =>
            (r.from === q.resource && r.relation === baseName) ||
            (r.to === q.resource && r.inverse === baseName),
        );

        if (!intermediateRelation) {
          return {
            ok: false,
            code: "DFQL_UNKNOWN_RELATION",
            message: `Unknown relation: select[${i}]`,
            path: `select[${i}]`,
          };
        }

        // Validate next level relation
        const targetResource =
          intermediateRelation.from === q.resource
            ? intermediateRelation.to
            : intermediateRelation.from;
        const nextRelation = parts[1];

        const nextRelationExists = schema.relations?.some(
          (r) =>
            (r.from === targetResource && r.relation === nextRelation) ||
            (r.to === targetResource && r.inverse === nextRelation),
        );

        if (
          !nextRelationExists &&
          nextRelation !== "*" &&
          nextRelation !== "#" &&
          nextRelation !== "*#"
        ) {
          return {
            ok: false,
            code: "DFQL_UNKNOWN_RELATION",
            message: `Unknown relation: select[${i}]`,
            path: `select[${i}]`,
          };
        }
      }
    }
  }

  // Validate count
  if (q.count !== undefined && typeof q.count !== "boolean") {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: "Invalid DFQL: count must be boolean",
      path: "count",
    };
  }

  // Validate cursor
  if (q.cursor && typeof q.cursor === "object") {
    const cursor = q.cursor as Record<string, unknown>;
    // Before or After
    if (cursor.after !== undefined) {
      if (typeof cursor.after !== "object" || cursor.after === null) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Invalid DFQL: cursor.after must be object",
          path: "cursor.after",
        };
      }
    }
    if (cursor.before !== undefined) {
      if (typeof cursor.before !== "object" || cursor.before === null) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Invalid DFQL: cursor.before must be object",
          path: "cursor.before",
        };
      }
      // Check for sort with id tie-breaker
      const sort = q.sort as string[] | undefined;
      const hasIdSort =
        Array.isArray(sort) &&
        sort.some((s) => s === "id" || s === "id:asc" || s === "id:desc");
      if (!hasIdSort) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Invalid DFQL: cursor requires sort with id tie-breaker",
          path: "$", // Standardize path? Vector says "$"
        };
      }
    }
  }

  // Validate omit tokens
  if (q.omit && Array.isArray(q.omit)) {
    for (let i = 0; i < q.omit.length; i++) {
      const field = q.omit[i];
      if (typeof field !== "string") continue;

      // Check if field exists in resource schema
      if (!fieldNames.has(field)) {
        return {
          ok: false,
          code: "DFQL_UNKNOWN_FIELD",
          message: `Unknown field: omit[${i}]`,
          path: `omit[${i}]`,
        };
      }
    }
  }

  // Validate filters
  if (q.filters && typeof q.filters === "object" && !Array.isArray(q.filters)) {
    const filterErrors = validateFilters(
      q.filters as Record<string, unknown>,
      q.resource as string,
      schema,
    );
    if (filterErrors) {
      return filterErrors;
    }
  }

  // Phase 15: Validate groupBy
  if (q.groupBy) {
    if (!Array.isArray(q.groupBy)) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: "Invalid DFQL: groupBy must be an array",
        path: "groupBy",
      };
    }
    for (let i = 0; i < q.groupBy.length; i++) {
      const field = q.groupBy[i];
      if (typeof field !== "string") {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Invalid DFQL: groupBy element must be string",
          path: `groupBy[${i}]`,
        };
      }
    }

    // Reject relation expansions in select if groupBy is present
    if (q.select && Array.isArray(q.select)) {
      for (let i = 0; i < q.select.length; i++) {
        const token = q.select[i];
        if (typeof token !== "string") {
          continue;
        }
        if (
          token.includes(".*") ||
          token.includes(".**") ||
          token.endsWith(".#")
        ) {
          return {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: "Relation expansion not allowed with groupBy",
            path: `select[${i}]`,
          };
        }
      }
    }
  }

  // Phase 15: Validate aggregations
  if (q.aggregations) {
    if (
      typeof q.aggregations !== "object" ||
      q.aggregations === null ||
      Array.isArray(q.aggregations)
    ) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: "Invalid DFQL: aggregations must be an object",
        path: "aggregations",
      };
    }
    for (const [alias, def] of Object.entries(q.aggregations)) {
      if (typeof def !== "object" || def === null) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Invalid aggregation definition",
          path: `aggregations.${alias}`,
        };
      }
      const agg = def as Record<string, unknown>;
      const validOps = ["count", "sum", "min", "max", "avg"];
      if (!validOps.includes(agg.op as string)) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: `Invalid aggregation operator: ${agg.op}`,
          path: `aggregations.${alias}.op`,
        };
      }
      if (typeof agg.field !== "string") {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: "Aggregation field must be string",
          path: `aggregations.${alias}.field`,
        };
      }
      if (agg.op === "count" && agg.field === "*") {
        // valid
      } else {
        // check field existence?
      }
    }
  }

  // Phase 15: Validate having
  if (q.having) {
    if (typeof q.having !== "object" || Array.isArray(q.having)) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: "Invalid DFQL: having must be object",
        path: "having",
      };
    }
  }

  return { ok: true };
}

/**
 * Recursively validate filters against schema
 */
export function validateFilters(
  filters: Record<string, unknown>,
  resourceName: string,
  schema: DatafnSchema,
): { ok: false; code: string; message: string; path: string } | null {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${resourceName}`,
      path: `$`,
    };
  }

  // Build field/relation sets for this level
  const fieldNames = getResourceFieldNames(schema, resource.name);

  const rules = schema.relations || [];

  for (const key of Object.keys(filters)) {
    // Logical operators
    if (key === "$and" || key === "$or") {
      const value = filters[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            const err = validateFilters(
              item as Record<string, unknown>,
              resourceName,
              schema,
            );
            if (err) return err;
          }
        }
      }
      continue;
    }

    // Dot-path: "goal.label"
    if (key.includes(".")) {
      const parts = key.split(".");
      let currentRes = resourceName;

      for (let i = 0; i < parts.length - 1; i++) {
        const relName = parts[i];
        const rel = rules.find(
          (r) =>
            (r.from === currentRes && r.relation === relName) ||
            (r.to === currentRes && r.inverse === relName),
        );

        if (!rel) {
          return {
            ok: false,
            code: "DFQL_UNKNOWN_FIELD",
            message: `Unknown path segment: ${relName}`,
            path: `filters.${key}`,
          };
        }
        const nextRes =
          rel.from === currentRes
            ? rel.to
            : rel.from;
        currentRes = Array.isArray(nextRes) ? nextRes[0] : nextRes;
      }

      const lastField = parts[parts.length - 1];
      const targetFields = getResourceFieldNames(schema, currentRes);

      if (!targetFields.has(lastField)) {
        return {
          ok: false,
          code: "DFQL_UNKNOWN_FIELD",
          message: `Unknown field: ${lastField} on ${currentRes}`,
          path: `filters.${key}`,
        };
      }
      continue;
    }

    // Check if it's a relation (for quantifiers)
    const rel = rules.find(
      (r) =>
        (r.from === resourceName && r.relation === key) ||
        (r.to === resourceName && r.inverse === key),
    );

    if (rel) {
      const val = filters[key];
      if (typeof val !== "object" || val === null) {
        return {
          ok: false,
          code: "DFQL_INVALID",
          message: `Relation filter must be object`,
          path: `filters.${key}`,
        };
      }

      const ops = val as Record<string, unknown>;
      const validOps = ["$any", "$all", "$none"];

      for (const opKey of Object.keys(ops)) {
        if (!validOps.includes(opKey)) {
          return {
            ok: false,
            code: "DFQL_INVALID",
            message: `Unknown relation quantifier: ${opKey}`,
            path: `filters.${key}`,
          };
        }
        const relationTarget = rel.from === resourceName ? rel.to : rel.from;
        const targetRes = Array.isArray(relationTarget)
          ? relationTarget[0]
          : relationTarget;
        const subFilter = ops[opKey];
        if (subFilter && typeof subFilter === "object") {
          const subErr = validateFilters(
            subFilter as Record<string, unknown>,
            targetRes,
            schema,
          );
          if (subErr) return subErr;
        }
      }
      continue;
    }

    // Regular field filter
    if (!fieldNames.has(key)) {
      return {
        ok: false,
        code: "DFQL_UNKNOWN_FIELD",
        message: `Unknown field: filters.${key}`,
        path: `filters.${key}`,
      };
    }

    // Field value validation (operators)
    const value = filters[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      const validOps = [
        "eq",
        "$eq",
        "ne",
        "$ne",
        "gt",
        "$gt",
        "gte",
        "$gte",
        "lt",
        "$lt",
        "lte",
        "$lte",
        "like",
        "$like",
        "ilike",
        "$ilike",
        "in",
        "$in",
        "not_in",
        "$nin",
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
        "$any",
        "$all",
        "$none",
      ];
      for (const opKey of Object.keys(ops)) {
        if (!validOps.includes(opKey)) {
          return {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: `Unsupported DFQL feature: filters.${key}.${opKey}`,
            path: `filters.${key}.${opKey}`,
          };
        }
      }
    }
  }

  return null;
}
