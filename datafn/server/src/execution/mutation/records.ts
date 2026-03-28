/**
 * Record CRUD operations (insert, merge, replace, delete)
 */

import type { DatafnSchema, DatafnResourceSchema } from "../../core-types.js";
import type { DataStore } from "../store.js";

/**
 * Insert a new record
 */
export function insertRecord(
  store: DataStore & {
    setRecord: (
      resource: string,
      id: string,
      record: Record<string, unknown>
    ) => void;
  },
  schema: DatafnSchema,
  resource: string,
  id: string,
  recordData: Record<string, unknown>
): { ok: true } | { ok: false; code: string; message: string; path: string } {
  // Check if record already exists
  const existing = store.getRecord(resource, id);
  if (existing) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Conflict",
      path: "id",
    };
  }

  // Validate field names
  const resourceSchema = schema.resources.find((r) => r.name === resource);
  if (!resourceSchema) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${resource}`,
      path: "resource",
    };
  }

  const validFields = new Set(resourceSchema.fields.map((f) => f.name));
  for (const key of Object.keys(recordData)) {
    if (!validFields.has(key)) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: `Invalid DFQL: unknown field ${key}`,
        path: `record.${key}`,
      };
    }
  }

  // Insert record
  const fullRecord = { id, ...recordData };
  store.setRecord(resource, id, fullRecord);

  return { ok: true };
}

/**
 * Merge fields into an existing record
 */
export function mergeRecord(
  store: DataStore & {
    setRecord: (
      resource: string,
      id: string,
      record: Record<string, unknown>
    ) => void;
  },
  schema: DatafnSchema,
  resource: string,
  id: string,
  recordData: Record<string, unknown>
): { ok: true } | { ok: false; code: string; message: string; path: string } {
  // Get existing record
  const existing = store.getRecord(resource, id);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Not found",
      path: "id",
    };
  }

  // Validate field names
  const resourceSchema = schema.resources.find((r) => r.name === resource);
  if (!resourceSchema) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${resource}`,
      path: "resource",
    };
  }

  const validFields = new Set(resourceSchema.fields.map((f) => f.name));
  for (const key of Object.keys(recordData)) {
    if (!validFields.has(key)) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: `Invalid DFQL: unknown field ${key}`,
        path: `record.${key}`,
      };
    }
  }

  // Merge fields
  const merged = { ...existing, ...recordData };
  store.setRecord(resource, id, merged);

  return { ok: true };
}

/**
 * Replace a record's schema-defined fields
 */
export function replaceRecord(
  store: DataStore & {
    setRecord: (
      resource: string,
      id: string,
      record: Record<string, unknown>
    ) => void;
  },
  schema: DatafnSchema,
  resource: string,
  id: string,
  recordData: Record<string, unknown>
): { ok: true } | { ok: false; code: string; message: string; path: string } {
  // Get existing record
  const existing = store.getRecord(resource, id);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Not found",
      path: "id",
    };
  }

  // Validate field names
  const resourceSchema = schema.resources.find((r) => r.name === resource);
  if (!resourceSchema) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${resource}`,
      path: "resource",
    };
  }

  const validFields = new Set(resourceSchema.fields.map((f) => f.name));
  for (const key of Object.keys(recordData)) {
    if (!validFields.has(key)) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: `Invalid DFQL: unknown field ${key}`,
        path: `record.${key}`,
      };
    }
  }

  // Replace: Keep id, replace schema fields with provided fields
  const replaced: Record<string, unknown> = { id };
  for (const key of Object.keys(recordData)) {
    replaced[key] = recordData[key];
  }

  store.setRecord(resource, id, replaced);

  return { ok: true };
}

/**
 * Delete a record
 */
export function deleteRecord(
  store: DataStore & { deleteRecord: (resource: string, id: string) => void },
  resource: string,
  id: string
): { ok: true } | { ok: false; code: string; message: string; path: string } {
  // Delete record (even if it doesn't exist - idempotent)
  store.deleteRecord(resource, id);

  return { ok: true };
}
