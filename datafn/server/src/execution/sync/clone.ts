/**
 * Clone implementation - full data sync with change tracking
 */

import type { DatafnSchema } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import { ChangeTrackingService } from "./change-tracking.js";

export interface CloneRequest {
  clientId: string;
  tables?: string[]; // Optional: specific tables to clone
}

export interface CloneResult {
  ok: boolean;
  data: Record<string, Array<Record<string, unknown>>>;
  cursors: Record<string, string>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Execute clone operation - return full dataset with cursors
 */
export async function executeClone(
  request: CloneRequest,
  schema: DatafnSchema,
  db: Adapter
): Promise<CloneResult> {
  // Validate clientId
  if (!request.clientId || typeof request.clientId !== "string") {
    return {
      ok: false,
      data: {},
      cursors: {},
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      },
    };
  }

  const data: Record<string, Array<Record<string, unknown>>> = {};
  const cursors: Record<string, string> = {};

  // Determine which tables to clone
  const tablesToClone = request.tables || schema.resources.map((r) => r.name);

  // Check for isRemoteOnly tables
  for (const tableName of tablesToClone) {
    const resource = schema.resources.find((r) => r.name === tableName);

    if (!resource) {
      return {
        ok: false,
        data: {},
        cursors: {},
        error: {
          code: "DFQL_UNKNOWN_RESOURCE",
          message: `Unknown resource: ${tableName}`,
          details: { path: "tables" },
        },
      };
    }

    // Check for isRemoteOnly flag
    if ((resource as any).isRemoteOnly) {
      return {
        ok: false,
        data: {},
        cursors: {},
        error: {
          code: "DFQL_INVALID",
          message: `Invalid DFQL: remote-only table cannot be cloned: ${tableName}`,
          details: { path: "tables" },
        },
      };
    }
  }

  // Create change tracking service for cursor generation
  const changeTracking = new ChangeTrackingService(db);

  // Get all records for each table, sorted by id
  for (const tableName of tablesToClone) {
    try {
      const records = await db.findMany({
        model: tableName,
        where: [],
        orderBy: [{ field: "id", direction: "asc" }],
        namespace: "datafn",
      });

      data[tableName] = records;

      // Get latest serverSeq for this table as cursor
      const latestSeq = await changeTracking.getLatestServerSeq({
        resource: tableName,
      });
      cursors[tableName] = String(latestSeq);
    } catch (error) {
      // On adapter error, return empty data for this table
      data[tableName] = [];
      cursors[tableName] = "0";
    }
  }

  return {
    ok: true,
    data,
    cursors,
  };
}
