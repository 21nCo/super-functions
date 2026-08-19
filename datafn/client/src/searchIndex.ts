import type { DatafnSchema } from "@datafn/core";
import { KV_RESOURCE_NAME } from "@datafn/core";
import { createClientError } from "./errors.js";
import type { DatafnStorageAdapter } from "./storage.js";

export type DatafnSearchIndexResource = {
  name: string;
  searchFields: string[];
};

/**
 * Resolves schema search index declarations into provider resource descriptors.
 */
export function deriveSearchProviderResources(
  schema: DatafnSchema,
): DatafnSearchIndexResource[] {
  const resources: DatafnSearchIndexResource[] = [];
  const seen = new Set<string>();

  for (const [index, resource] of schema.resources.entries()) {
    const searchPath = `schema.resources[${index}].indices.search`;
    const rawSearchFields = Array.isArray(resource.indices)
      ? []
      : ((resource.indices && "search" in resource.indices
          ? resource.indices.search
          : []) ?? []);

    if (!Array.isArray(rawSearchFields)) {
      throw createClientError(
        "DFQL_INVALID",
        "Invalid schema search index configuration: search fields must be an array",
        { path: searchPath },
      );
    }

    const searchFields = rawSearchFields.map((field, fieldIndex) => {
      if (typeof field !== "string" || field.trim().length === 0) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid schema search index configuration: search fields must be non-empty strings",
          { path: `${searchPath}[${fieldIndex}]` },
        );
      }
      return field.trim();
    });

    if (searchFields.length === 0) {
      continue;
    }

    const resourceName = resource.name.trim();
    const normalizedResourceName = resourceName.toLowerCase();
    if (seen.has(normalizedResourceName)) {
      throw createClientError(
        "DFQL_INVALID",
        "Duplicate normalized search resource definitions are not allowed",
        { path: "resources" },
      );
    }
    seen.add(normalizedResourceName);

    resources.push({
      name: resourceName,
      searchFields: Array.from(new Set(searchFields)),
    });
  }

  return resources;
}

/**
 * Produces the stable fingerprint stored with local SearchFn index markers.
 */
export function buildSearchIndexFingerprint(input: {
  providerName?: string;
  resource: DatafnSearchIndexResource;
  version?: string;
}): string {
  return stableSearchFingerprint({
    providerName: input.providerName ?? "unknown",
    resource: input.resource.name,
    fields: input.resource.searchFields,
    version: input.version ?? "default",
  });
}

/**
 * Checks whether the local search index marker matches the current provider and schema version.
 */
export async function isSearchIndexMarkedCurrent(input: {
  storage: DatafnStorageAdapter;
  resource: string;
  fingerprint: string;
}): Promise<boolean> {
  const marker = await getSearchIndexMarkerState(input);
  return marker.fingerprint === input.fingerprint;
}

/** Reads the persisted marker so rebuilds can distinguish first use from a version change. */
export async function getSearchIndexMarkerState(input: {
  storage: DatafnStorageAdapter;
  resource: string;
}): Promise<{ exists: boolean; fingerprint?: string }> {
  try {
    const marker = await input.storage.getRecord(
      KV_RESOURCE_NAME,
      searchIndexMarkerId(input.resource),
    );
    if (!marker) return { exists: false };
    const value = marker?.value;
    const fingerprint = typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).fingerprint
      : undefined;
    return {
      exists: true,
      ...(typeof fingerprint === "string" ? { fingerprint } : {}),
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Writes the local search index marker after a resource index is known current.
 */
export async function markSearchIndexCurrent(input: {
  storage: DatafnStorageAdapter;
  resource: string;
  fingerprint: string;
}): Promise<void> {
  try {
    await input.storage.upsertRecord(KV_RESOURCE_NAME, {
      id: searchIndexMarkerId(input.resource),
      value: {
        fingerprint: input.fingerprint,
        indexedAt: Date.now(),
      },
    });
  } catch {
  }
}

/**
 * Removes the local search index marker so the next search can repair the resource index.
 */
export async function clearSearchIndexCurrent(input: {
  storage: DatafnStorageAdapter;
  resource: string;
}): Promise<void> {
  try {
    await input.storage.deleteRecord(
      KV_RESOURCE_NAME,
      searchIndexMarkerId(input.resource),
    );
  } catch {
  }
}

function stableSearchFingerprint(value: unknown): string {
  const raw = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function searchIndexMarkerId(resource: string): string {
  return `__datafn_search_index:${resource}`;
}
