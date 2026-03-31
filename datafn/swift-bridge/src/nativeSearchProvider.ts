import type { DatafnError, SearchProvider } from "@datafn/core";
import {
  requestBridgeMethod,
  type DatafnBridgeBus,
  type DatafnBridgeSearchAllPayload,
  type DatafnBridgeSearchAllResultItem,
  type DatafnBridgeSearchInitializePayload,
  type DatafnBridgeSearchResourceConfig,
  type DatafnBridgeSearchResult,
  type NativeBridgeMarker,
} from "./protocol.js";

function createSearchError(
  code: DatafnError["code"],
  message: string,
  details: Record<string, unknown>,
): DatafnError {
  return {
    code,
    message,
    details,
  };
}

function remapBridgeError(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "BRIDGE_UNAVAILABLE"
  ) {
    const bridgeError = error as DatafnError;
    throw createSearchError(
      "NATIVE_BRIDGE_UNAVAILABLE",
      bridgeError.message,
      (bridgeError.details as Record<string, unknown> | undefined) ?? { path: "bridge" },
    );
  }

  throw error;
}

function assertNonEmptyString(
  value: string,
  path: string,
  message: string,
): void {
  if (typeof value === "string" && value.trim().length > 0) {
    return;
  }

  throw createSearchError("DFQL_INVALID", message, { path });
}

function assertOptionalStringArray(
  value: string[] | undefined,
  path: string,
): void {
  if (typeof value === "undefined") {
    return;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw createSearchError("DFQL_INVALID", "Expected a non-empty string array", { path });
  }
}

function assertOptionalPositiveInteger(
  value: number | undefined,
  path: string,
  message: string,
): void {
  if (typeof value === "undefined") {
    return;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw createSearchError("DFQL_INVALID", message, { path });
  }
}

function assertOptionalFuzzy(
  value: boolean | number | undefined,
  path: string,
): void {
  if (typeof value === "undefined" || typeof value === "boolean") {
    return;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw createSearchError("DFQL_INVALID", "fuzzy must be a boolean or non-negative integer", {
      path,
    });
  }
}

function normalizeResourceConfig(
  resource: DatafnBridgeSearchResourceConfig,
  index: number,
): DatafnBridgeSearchResourceConfig | null {
  assertNonEmptyString(resource.name, `resources[${index}].name`, "resource name is required");
  assertOptionalStringArray(resource.searchFields, `resources[${index}].searchFields`);

  const searchFields = (resource.searchFields ?? [])
    .map((field) => field.trim())
    .filter((field, fieldIndex, fields) => field.length > 0 && fields.indexOf(field) === fieldIndex);

  if (searchFields.length === 0) {
    return null;
  }

  return {
    name: resource.name.trim(),
    searchFields,
  };
}

function validateInitializePayload(
  payload: DatafnBridgeSearchInitializePayload,
): DatafnBridgeSearchInitializePayload {
  if (!Array.isArray(payload.resources)) {
    throw createSearchError("DFQL_INVALID", "resources must be an array", { path: "resources" });
  }

  const resources = payload.resources
    .map((resource, index) => normalizeResourceConfig(resource, index))
    .filter((resource): resource is DatafnBridgeSearchResourceConfig => resource !== null);

  const seen = new Set<string>();
  for (const resource of resources) {
    const normalizedKey = resource.name.trim().toLowerCase();
    if (seen.has(normalizedKey)) {
      throw createSearchError("DFQL_INVALID", "Duplicate search resource definitions are not allowed", {
        path: "resources",
      });
    }
    seen.add(normalizedKey);
  }

  return { resources };
}

function validateSearchParams(
  params: Parameters<SearchProvider["search"]>[0],
): Parameters<SearchProvider["search"]>[0] {
  assertNonEmptyString(params.resource, "resource", "resource is required");
  assertNonEmptyString(params.query, "query", "query is required");
  assertOptionalStringArray(params.fields, "fields");
  assertOptionalPositiveInteger(params.limit, "limit", "limit must be a positive integer");
  assertOptionalFuzzy(params.fuzzy, "fuzzy");
  return params;
}

function validateSearchAllParams(
  params: NonNullable<SearchProvider["searchAll"]> extends (...args: infer TArgs) => unknown
    ? TArgs[0]
    : never,
): DatafnBridgeSearchAllPayload {
  assertNonEmptyString(params.query, "query", "query is required");
  assertOptionalStringArray(params.resources, "resources");
  assertOptionalStringArray(params.fields, "fields");
  assertOptionalPositiveInteger(params.limit, "limit", "limit must be a positive integer");
  assertOptionalPositiveInteger(
    params.limitPerResource,
    "limitPerResource",
    "limitPerResource must be a positive integer",
  );
  assertOptionalFuzzy(params.fuzzy, "fuzzy");
  return params;
}

export function createNativeBackedSearchProvider(
  bus: DatafnBridgeBus,
): SearchProvider & NativeBridgeMarker {
  return {
    __datafnNativeBacked: true,
    name: "native-backed-search",
    async initialize(config) {
      const payload = validateInitializePayload(config);
      try {
        await requestBridgeMethod<{ initialized: boolean }>(
          bus,
          "search.initialize",
          payload,
        );
      } catch (error) {
        remapBridgeError(error);
      }
    },
    async search(params) {
      const payload = validateSearchParams(params);
      try {
        const result = await requestBridgeMethod<DatafnBridgeSearchResult>(
          bus,
          "search.search",
          payload,
        );
        return result.ids;
      } catch (error) {
        remapBridgeError(error);
      }
    },
    async searchAll(params) {
      const payload = validateSearchAllParams(params);
      try {
        const result = await requestBridgeMethod<{
          results: DatafnBridgeSearchAllResultItem[];
        }>(
          bus,
          "search.searchAll",
          payload,
        );
        return result.results;
      } catch (error) {
        remapBridgeError(error);
      }
    },
    async updateIndices() {
      // Native-backed mode keeps index ownership in Swift. This remains a no-op
      // for SearchProvider compatibility until client routing flips in a later phase.
    },
    async dispose() {
      try {
        await requestBridgeMethod<void>(bus, "search.dispose");
      } catch (error) {
        remapBridgeError(error);
      }
    },
  };
}
