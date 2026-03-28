/**
 * Data export and import for backup and restore
 */

import type { DatafnSchema } from "@datafn/core";
import { getJoinStoreKey } from "@datafn/core";
import type { DatafnStorageAdapter } from "./storage.js";
import { createClientError } from "./errors.js";
import type { SyncFacade } from "./sync.js";

/**
 * Export payload format version 1
 */
export interface DatafnExportPayload {
  version: 1;
  exportedAt: string; // ISO 8601
  schema: Array<{ name: string; version: number }>;
  resources: Record<string, Array<Record<string, unknown>>>;
  joins?: Record<string, Array<Record<string, unknown>>>;
}

/**
 * Import result with per-resource stats
 */
export interface DatafnImportResult {
  ok: boolean;
  stats: {
    resources: Record<string, { imported: number; skipped: number }>;
    joins: Record<string, { imported: number; skipped: number }>;
  };
  errors: Array<{ resource: string; id: string; code: string; message: string }>;
}

/**
 * Options for data export
 */
export interface DatafnExportOptions {
  /** Filter export to specific resources. If omitted, exports all non-remote-only resources. */
  resources?: string[];
}

/**
 * Options for data import
 */
export interface DatafnImportOptions {
  /** When true, trigger cloneUp after import to sync changes to server. Default: false. */
  triggerCloneUp?: boolean;
}

/**
 * Resolve the set of resources to export based on schema and filter options
 */
function resolveExportScope(
  schema: DatafnSchema,
  resourceNames?: string[],
): Array<{ name: string; version: number }> {
  const allExportable = schema.resources.filter(r => !r.isRemoteOnly);
  
  if (!resourceNames || resourceNames.length === 0) {
    // Export all non-remote-only resources
    return allExportable.map(r => ({ name: r.name, version: r.version }));
  }
  
  // Filter to specified resources
  const result: Array<{ name: string; version: number }> = [];
  for (const name of resourceNames) {
    const resource = allExportable.find(r => r.name === name);
    if (resource) {
      result.push({ name: resource.name, version: resource.version });
    }
  }
  
  return result;
}

/**
 * Export all local records and join rows as structured JSON
 */
export async function exportData(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  options?: DatafnExportOptions,
): Promise<DatafnExportPayload> {
  const resources = resolveExportScope(schema, options?.resources);
  
  const payload: DatafnExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    schema: resources.map(r => ({ name: r.name, version: r.version })),
    resources: {},
    joins: {},
  };
  
  // Export records for each resource
  for (const resource of resources) {
    payload.resources[resource.name] = await storage.listRecords(resource.name);
  }
  
  // Export join rows for many-many relations (handle multi-resource from/to arrays)
  for (const relation of schema.relations ?? []) {
    if (relation.type !== "many-many") continue;
    const froms = Array.isArray(relation.from) ? relation.from : [relation.from];
    const tos = Array.isArray(relation.to) ? relation.to : [relation.to];
    const relName = relation.relation ?? "rel";
    for (const f of froms) {
      for (const t of tos) {
        const storeName = getJoinStoreKey(f, relName, t);
        try {
          payload.joins![storeName] = await storage.listJoinRows(storeName);
        } catch (err) {
          // Join store may not exist if no relations have been created
          // Continue without error
        }
      }
    }
  }
  
  return payload;
}

/**
 * Import records and join rows from a structured JSON payload
 */
export async function importData(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  sync: SyncFacade,
  data: DatafnExportPayload,
  options?: DatafnImportOptions,
): Promise<DatafnImportResult> {
  // Validate version
  if (data.version !== 1) {
    throw createClientError(
      "DFQL_INVALID",
      "Unsupported export version",
      { path: "version", version: data.version },
    );
  }
  
  const result: DatafnImportResult = {
    ok: true,
    stats: {
      resources: {},
      joins: {},
    },
    errors: [],
  };
  
  // Import records
  for (const [resourceName, records] of Object.entries(data.resources)) {
    const resourceSchema = schema.resources.find(r => r.name === resourceName);
    if (!resourceSchema) {
      // Skip unknown resources (not an error)
      continue;
    }
    
    let imported = 0;
    let skipped = 0;
    
    for (const record of records) {
      try {
        await storage.upsertRecord(resourceName, record);
        imported++;
      } catch (err) {
        skipped++;
        result.errors.push({
          resource: resourceName,
          id: String(record.id),
          code: "IMPORT_FAILED",
          message: String(err),
        });
      }
    }
    
    result.stats.resources[resourceName] = { imported, skipped };
  }
  
  // Import join rows
  for (const [storeName, rows] of Object.entries(data.joins ?? {})) {
    let imported = 0;
    let skipped = 0;
    
    for (const row of rows) {
      try {
        await storage.upsertJoinRow(storeName, row);
        imported++;
      } catch (err) {
        skipped++;
        // Join row errors are not added to errors array (less critical)
      }
    }
    
    result.stats.joins[storeName] = { imported, skipped };
  }
  
  // Trigger cloneUp if requested
  if (options?.triggerCloneUp && sync.cloneUp) {
    await sync.cloneUp();
  }
  
  // Mark result as not ok if there were any errors
  if (result.errors.length > 0) {
    result.ok = false;
  }
  
  return result;
}
