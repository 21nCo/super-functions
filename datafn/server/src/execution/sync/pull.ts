/**
 * Pull implementation - incremental updates since cursor using change tracking
 */

import type { DatafnSchema } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import { ChangeTrackingService } from "./change-tracking.js";

export interface PullRequest {
  clientId: string;
  cursors: Record<string, string>; // Table name -> cursor (serverSeq as string)
}

export interface PullResult {
  ok: boolean;
  records: Record<string, Array<Record<string, unknown>>>;
  deleted: Record<string, string[]>;
  cursors: Record<string, string>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Validate cursor is a base-10 integer string
 */
function validateCursor(cursor: string): boolean {
  return /^\d+$/.test(cursor);
}

/**
 * Execute pull operation - return changes since cursor
 */
export async function executePull(
  request: PullRequest,
  schema: DatafnSchema,
  db: Adapter
): Promise<PullResult> {
  // Validate clientId
  if (!request.clientId || typeof request.clientId !== "string") {
    return {
      ok: false,
      records: {},
      deleted: {},
      cursors: {},
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      },
    };
  }

  // Validate cursors
  for (const [tableName, cursor] of Object.entries(request.cursors)) {
    if (!validateCursor(cursor)) {
      return {
        ok: false,
        records: {},
        deleted: {},
        cursors: {},
        error: {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: cursor must be an integer string",
          details: { path: `cursors.${tableName}` },
        },
      };
    }
  }

  const records: Record<string, Array<Record<string, unknown>>> = {};
  const deleted: Record<string, string[]> = {};
  const newCursors: Record<string, string> = {};

  // Create change tracking service
  const changeTracking = new ChangeTrackingService(db);

  // For each table in request
  for (const [tableName, cursorStr] of Object.entries(request.cursors)) {
    const resource = schema.resources.find((r) => r.name === tableName);

    if (!resource) {
      return {
        ok: false,
        records: {},
        deleted: {},
        cursors: {},
        error: {
          code: "DFQL_UNKNOWN_RESOURCE",
          message: `Unknown resource: ${tableName}`,
          details: { path: "cursors" },
        },
      };
    }

    const cursorSeq = parseInt(cursorStr, 10);

    // Get changes since cursor
    const changes = await changeTracking.getChangesSince({
      resource: tableName,
      sinceSeq: cursorSeq,
    });

    // Separate into records (upserts) and deleted
    const upserts: Array<Record<string, unknown>> = [];
    const deletedIds: string[] = [];

    for (const change of changes) {
      if (change.op === "upsert" && change.record) {
        upserts.push(change.record);
      } else if (change.op === "delete") {
        deletedIds.push(change.id);
      }
    }

    records[tableName] = upserts;
    deleted[tableName] = deletedIds;

    // Get latest serverSeq for new cursor
    const latestSeq = await changeTracking.getLatestServerSeq({
      resource: tableName,
    });
    newCursors[tableName] = String(latestSeq);
  }

  return {
    ok: true,
    records,
    deleted,
    cursors: newCursors,
  };
}
