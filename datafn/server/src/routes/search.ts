import type { DatafnPlugin, DatafnSchema } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import {
  TIMEZONE_CHANGE_RESOURCE_NAME,
  createTimezoneResolver,
  normalizeTemporalQuery,
  type DatafnTemporalClause,
  type DatafnTemporalConfig,
} from "@datafn/core";
import type { SearchProvider } from "../search-provider.js";
import type { DatafnLogger } from "../logger.js";
import { getBodyFromContext } from "../http/json.js";
import { okResponse, errorResponse } from "../http/errors.js";
import { executeCrossResourceSearch } from "../execution/search/cross-resource.js";
import { DatafnExecutionError } from "../execution/errors.js";
import {
  executeDbNativeCrossResourceSearch,
  NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
} from "../execution/search/native-fallback.js";
import { runBeforeSearch } from "../plugins/run-hooks.js";
import { getDatafnMultiRegionRuntimeConfig } from "../plugins/multi-region.js";

function analyzeFilterComplexity(
  node: unknown,
  depth = 1,
): { depth: number; conditions: number } {
  if (!node || typeof node !== "object") {
    return { depth, conditions: 0 };
  }
  if (Array.isArray(node)) {
    let maxDepth = depth;
    let conditions = 0;
    for (const item of node) {
      const result = analyzeFilterComplexity(item, depth + 1);
      maxDepth = Math.max(maxDepth, result.depth);
      conditions += result.conditions;
    }
    return { depth: maxDepth, conditions };
  }

  const record = node as Record<string, unknown>;
  let maxDepth = depth;
  let conditions = 0;

  for (const [key, value] of Object.entries(record)) {
    if (key === "$and" || key === "$or") {
      const nested = analyzeFilterComplexity(value, depth + 1);
      maxDepth = Math.max(maxDepth, nested.depth);
      conditions += nested.conditions;
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const ops = Object.keys(value as Record<string, unknown>);
      const looksLikeOperatorObject =
        ops.length > 0 &&
        ops.every(
          (op) =>
            op.startsWith("$") ||
            op === "eq" ||
            op === "ne" ||
            op === "gt" ||
            op === "gte" ||
            op === "lt" ||
            op === "lte" ||
            op === "in" ||
            op === "contains" ||
            op === "starts_with" ||
            op === "ends_with" ||
            op === "like",
        );

      if (looksLikeOperatorObject) {
        maxDepth = Math.max(maxDepth, depth + 1);
        conditions += ops.length;
      } else {
        const nested = analyzeFilterComplexity(value, depth + 1);
        maxDepth = Math.max(maxDepth, nested.depth);
        conditions += nested.conditions;
      }
      continue;
    }

    conditions += 1;
  }

  return { depth: maxDepth, conditions };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function normalizeSearchTemporalFilters(input: {
  raw: Record<string, unknown>;
  db: Adapter;
  namespace: string;
}): Promise<Record<string, Record<string, unknown>> | undefined> {
  const temporalByResource = isPlainObject(input.raw.temporalByResource)
    ? (input.raw.temporalByResource as Record<
        string,
        DatafnTemporalClause | readonly DatafnTemporalClause[]
      >)
    : undefined;
  const temporal = input.raw.temporal as
    | DatafnTemporalClause
    | readonly DatafnTemporalClause[]
    | undefined;
  const baseFilters = isPlainObject(input.raw.filters)
    ? (input.raw.filters as Record<string, Record<string, unknown>>)
    : {};

  if (!temporalByResource && !temporal) {
    return Object.keys(baseFilters).length > 0 ? baseFilters : undefined;
  }

  const normalizedFilters: Record<string, Record<string, unknown>> = {
    ...baseFilters,
  };
  const timezoneChanges = await input.db.findMany({
    model: TIMEZONE_CHANGE_RESOURCE_NAME,
    where: [],
    namespace: input.namespace,
  }).catch(() => []);
  const temporalConfig: DatafnTemporalConfig = {
    timezoneResolver: createTimezoneResolver(
      timezoneChanges as Record<string, unknown>[],
    ),
  };
  const resourcesForTopLevelTemporal = Array.isArray(input.raw.resources)
    ? input.raw.resources.filter((resource): resource is string => typeof resource === "string")
    : Object.keys(baseFilters);
  const resourceClauses = new Map<
    string,
    DatafnTemporalClause | readonly DatafnTemporalClause[]
  >();

  if (temporal) {
    for (const resource of resourcesForTopLevelTemporal) {
      resourceClauses.set(resource, temporal);
    }
  }
  if (temporalByResource) {
    for (const [resource, clause] of Object.entries(temporalByResource)) {
      resourceClauses.set(resource, clause);
    }
  }

  for (const [resource, clause] of resourceClauses) {
    const normalized = normalizeTemporalQuery(
      {
        resource,
        filters: normalizedFilters[resource],
        temporal: clause,
      },
      temporalConfig,
    );
    if (isPlainObject(normalized.filters)) {
      normalizedFilters[resource] = normalized.filters as Record<string, unknown>;
    }
  }

  return normalizedFilters;
}

export function createSearchHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
  searchProvider?: SearchProvider,
  logger?: DatafnLogger,
) {
  const multiRegionRuntime = getDatafnMultiRegionRuntimeConfig(plugins);
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const parseResult = await getBodyFromContext(req, ctx);
    if (!parseResult.ok) {
      return errorResponse(parseResult.error);
    }

    const body = parseResult.data;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: expected object",
        details: { path: "$" },
      });
    }

    const beforeHookResult = await runBeforeSearch(
      body,
      { plugins, schema: validatedSchema, context: ctx },
      plugins,
    );
    if (!beforeHookResult.ok) {
      return errorResponse(
        beforeHookResult.error as any,
        beforeHookResult.error.code === "FORBIDDEN" ? 403 : 400,
      );
    }

    if (
      typeof beforeHookResult.search !== "object" ||
      beforeHookResult.search === null ||
      Array.isArray(beforeHookResult.search)
    ) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: expected object",
        details: { path: "$" },
      });
    }

    const raw = beforeHookResult.search as Record<string, unknown>;

    if (typeof raw.query !== "string") {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Search query must not be empty",
        details: { path: "query" },
      });
    }
    const query = raw.query.trim();
    if (query === "") {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Search query must not be empty",
        details: { path: "query" },
      });
    }

    if (query.length > 1000) {
      return errorResponse({
        code: "LIMIT_EXCEEDED",
        message: "Search query exceeds maximum length",
        details: { path: "query" },
      });
    }

    if (raw.resources !== undefined) {
      if (!Array.isArray(raw.resources)) {
        return errorResponse({
          code: "DFQL_INVALID",
          message: "Invalid request: resources must be an array",
          details: { path: "resources" },
        });
      }
      if (raw.resources.length > 50) {
        return errorResponse({
          code: "LIMIT_EXCEEDED",
          message: "Too many resources in search request",
          details: { path: "resources" },
        });
      }
      if (raw.resources.some((resource) => typeof resource !== "string" || resource.trim() === "")) {
        return errorResponse({
          code: "DFQL_INVALID",
          message: "Invalid request: resources must contain non-empty strings",
          details: { path: "resources" },
        });
      }
    }

    const rawLimit = raw.limit;
    if (rawLimit !== undefined && (typeof rawLimit !== "number" || !Number.isFinite(rawLimit) || rawLimit < 1)) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: limit must be a positive number",
        details: { path: "limit" },
      });
    }

    const rawLimitPerResource = raw.limitPerResource;
    if (rawLimitPerResource !== undefined && (typeof rawLimitPerResource !== "number" || !Number.isFinite(rawLimitPerResource) || rawLimitPerResource < 1)) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: limitPerResource must be a positive number",
        details: { path: "limitPerResource" },
      });
    }
    if (raw.filters !== undefined && (typeof raw.filters !== "object" || raw.filters === null || Array.isArray(raw.filters))) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: filters must be an object",
        details: { path: "filters" },
      });
    }
    if (raw.prefix !== undefined && typeof raw.prefix !== "boolean") {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: prefix must be boolean",
        details: { path: "prefix" },
      });
    }
    if (
      raw.fuzzy !== undefined &&
      typeof raw.fuzzy !== "boolean" &&
      (typeof raw.fuzzy !== "number" || !Number.isFinite(raw.fuzzy) || raw.fuzzy < 0)
    ) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid request: fuzzy must be boolean or a non-negative number",
        details: { path: "fuzzy" },
      });
    }
    if (raw.fieldBoosts !== undefined) {
      if (!isPlainObject(raw.fieldBoosts)) {
        return errorResponse({
          code: "DFQL_INVALID",
          message: "Invalid request: fieldBoosts must be an object",
          details: { path: "fieldBoosts" },
        });
      }
      const boostEntries = Object.entries(raw.fieldBoosts);
      if (boostEntries.length > 100) {
        return errorResponse({
          code: "LIMIT_EXCEEDED",
          message: "Too many fieldBoosts entries in search request",
          details: { path: "fieldBoosts" },
        });
      }
      for (const [field, value] of boostEntries) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid request: fieldBoosts values must be finite positive numbers",
            details: { path: `fieldBoosts.${field}` },
          });
        }
      }
    }

    if (!db) {
      return errorResponse({
        code: "INTERNAL",
        message: "Internal error",
        details: { path: "$" },
      });
    }

    if (raw.filters) {
      const byResource = raw.filters as Record<string, unknown>;
      let maxDepth = 1;
      let conditionCount = 0;
      for (const filter of Object.values(byResource)) {
        const complexity = analyzeFilterComplexity(filter, 1);
        maxDepth = Math.max(maxDepth, complexity.depth);
        conditionCount += complexity.conditions;
      }
      if (maxDepth > 5) {
        return errorResponse({
          code: "DFQL_INVALID",
          message: "Search filters exceed allowed complexity",
          details: { path: "filters" },
        });
      }
      if (conditionCount > 200) {
        return errorResponse({
          code: "LIMIT_EXCEEDED",
          message: "Search filters exceed allowed complexity",
          details: { path: "filters" },
        });
      }
    }

    try {
      const namespace = await extractNamespace(ctx);
      const actorId = extractActorId ? await extractActorId(ctx) : undefined;
      const limit =
        typeof rawLimit === "number"
          ? Math.min(rawLimit, 10_000)
          : 50;
      const limitPerResource =
        typeof rawLimitPerResource === "number"
          ? Math.min(rawLimitPerResource, 1_000)
          : limit;
      const normalizedFilters = await normalizeSearchTemporalFilters({
        raw,
        db,
        namespace,
      });
      const searchParams = {
        query,
        resources: Array.isArray(raw.resources) ? (raw.resources as string[]) : undefined,
        fields: Array.isArray(raw.fields) ? (raw.fields as string[]) : undefined,
        limit,
        limitPerResource,
        prefix: raw.prefix as boolean | undefined,
        fuzzy: raw.fuzzy as boolean | number | undefined,
        fieldBoosts: raw.fieldBoosts as Record<string, number> | undefined,
        filters: normalizedFilters,
        select: Array.isArray(raw.select) ? (raw.select as string[]) : undefined,
        actorId,
        signal: req.signal,
      };

      const results = searchProvider
        ? await executeCrossResourceSearch(
            searchParams,
            searchProvider,
            db,
            validatedSchema,
            namespace,
            logger,
            multiRegionRuntime,
          )
        : await executeDbNativeCrossResourceSearch(
            searchParams,
            db,
            validatedSchema,
            namespace,
            logger,
          );

      return okResponse(results);
    } catch (err) {
      if (err instanceof DatafnExecutionError) {
        return errorResponse({
          code: err.code,
          message: err.message,
          details: err.details,
        }, err.code === "INTERNAL" ? 500 : 400);
      }
      if (!searchProvider) {
        return errorResponse({
          code: "DFQL_UNSUPPORTED",
          message: NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
          details: { path: "$" },
        }, 400);
      }
      logger?.error("Search execution failed", { error: String(err), operation: "search" });
      return errorResponse({
        code: "INTERNAL",
        message: "Internal error",
        details: { path: "$" },
      });
    }
  };
}
