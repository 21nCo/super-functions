import type { DatafnSchema } from "@datafn/core";

/**
 * DFQL mutation type definitions
 */

export type MutationOperation =
  | "insert"
  | "merge"
  | "replace"
  | "delete"
  | "relate"
  | "modifyRelation"
  | "unrelate";

export interface DFQLMutation {
  resource: string;
  version: number;
  operation: MutationOperation;
  clientId: string;
  mutationId: string;
  id: string;
  record?: Record<string, unknown>;
  if?: Record<string, unknown>; // Optimistic concurrency guard
  relations?: Record<string, unknown>; // Relation operations payload
}

export interface RelationOperation {
  $ref: string; // Target record ID
  [key: string]: unknown; // Metadata fields
}

/**
 * Build a full record for replace operation
 * Clears unspecified fields to defaults/null, preserves system fields
 */
export function buildReplaceRecord(
  schema: DatafnSchema,
  resourceName: string,
  existingRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
): {
  ok: true;
  record: Record<string, unknown>;
} | {
  ok: false;
  code: string;
  message: string;
  path: string;
} {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) {
    return {
      ok: false,
      code: "DFQL_UNKNOWN_RESOURCE",
      message: `Unknown resource: ${resourceName}`,
      path: "resource",
    };
  }

  const result: Record<string, unknown> = {};
  const now = new Date().toISOString();

  for (const field of resource.fields) {
    const key = field.name;

    // System fields preservation/update
    if (key === "id") {
      result[key] = existingRecord[key];
      continue;
    }
    if (key === "createdAt") {
      result[key] = existingRecord[key];
      continue;
    }
    if (key === "createdBy") {
      result[key] = existingRecord[key];
      continue;
    }
    if (key === "updatedAt") {
      result[key] = now;
      continue;
    }
    // updatedBy - if we had context we'd set it. For now, preserve or allow override?
    // "Update updatedBy (from context)" - implies we should set it if we have it.
    // Since we don't, let's treat it as a normal field (can be overwritten or cleared).
    // Actually, usually updatedBy is preserved if not provided?
    // "Replace ... clears unspecified fields". So if not provided, it should be cleared/defaulted.
    // BUT we want to preserve system fields.
    // Let's assume updatedBy is managed by client for now if not in context.

    // Normal fields
    if (Object.prototype.hasOwnProperty.call(newRecord, key)) {
      result[key] = newRecord[key];
    } else {
      // Not provided: set to default or null
      result[key] = field.default !== undefined ? field.default : null;
    }

    // Validation: Required check
    // If required and value is null/undefined (and not a generated field like id)
    // Note: boolean false or number 0 are valid.
    if (
      field.required &&
      (result[key] === null || result[key] === undefined)
    ) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: `Required field missing: ${key}`,
        path: `record.${key}`,
      };
    }
  }

  return { ok: true, record: result };
}
