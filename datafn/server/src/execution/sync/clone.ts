/**
 * Clone implementation - full data sync with change tracking
 */

import type { DatafnErrorCode, DatafnRelationSchema, DatafnSchema } from "../../core-types.js";
import { getJoinStoreKey, getRelationJoinTableName } from "@datafn/core";
import type { Adapter, WhereClause } from "@superfunctions/db";
import type { SequenceStore } from "./sequence-store.js";
import { ChangeTrackingService } from "./change-tracking.js";
import type { DatafnLogger } from "../../logger.js";
import { isPrivateShareableResource, resolveAccessLevel } from "../../validation/authz.js";

export interface CloneRequest {
  clientId: string;
  tables?: string[]; // Optional: specific tables to clone
  page?: {
    table: string;
    afterId: string | null;
    limit: number;
  };
  includeJoins?: boolean;
  actorId?: string;
}

export interface CloneResult {
  ok: boolean;
  data: Record<string, Array<Record<string, unknown>>>;
  cursors: Record<string, string>;
  joins?: Record<string, Array<Record<string, unknown>>>;
  next?: Record<string, string | null>;
  /** SCA-002: true when auto-pagination was triggered because total > maxCloneRecords */
  paginated?: boolean;
  error?: {
    code: DatafnErrorCode;
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
  db: Adapter,
  namespace: string,
  sequenceStore?: SequenceStore,
  maxCloneRecords: number = 10_000,
  logger?: DatafnLogger,
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
  const next: Record<string, string | null> = {};
  let joins: Record<string, Array<Record<string, unknown>>> | undefined;

  // Determine which tables to clone
  const tablesToClone = request.tables || schema.resources.map((r) => r.name);
  const actorId = request.actorId;

  const filterActorVisibleRows = async (
    resource: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> => {
    if (!isPrivateShareableResource(schema, resource)) {
      return rows;
    }
    if (!actorId) {
      return [];
    }
    const visible: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const recordId = typeof row.id === "string" ? row.id : null;
      if (!recordId) {
        continue;
      }
      const level = await resolveAccessLevel(
        db,
        schema,
        resource,
        recordId,
        actorId,
        namespace,
      );
      if (level) {
        visible.push(row);
      }
    }
    return visible;
  };

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

  // Create change tracking service with user/tenant namespace and optional sequence store
  const changeTracking = new ChangeTrackingService(db, namespace, sequenceStore);

  // Handle paginated clone if page parameter is provided
  if (request.page) {
    const { table, afterId, limit } = request.page;

    // Validate page table is in requested tables
    if (!tablesToClone.includes(table)) {
      return {
        ok: false,
        data: {},
        cursors: {},
        error: {
          code: "DFQL_INVALID",
          message: `Invalid DFQL: page.table must be in tables list: ${table}`,
          details: { path: "page.table" },
        },
      };
    }

    // Enforce maximum page size (default 1000)
    const effectiveLimit = Math.min(limit, 1000);

    try {
      // Build where clause for afterId pagination
      const where: WhereClause[] = afterId
        ? [{ field: "id", operator: "gt", value: afterId }]
        : [];

      const records = await db.findMany({
        model: table,
        where,
        orderBy: [{ field: "id", direction: "asc" }],
        limit: effectiveLimit,
        namespace,
      });
      data[table] = await filterActorVisibleRows(table, records);

      // Compute next marker
      if (records.length === effectiveLimit) {
        // More pages exist
        const lastRecord = records[records.length - 1];
        next[table] = lastRecord.id as string;
      } else {
        // This was the last page
        next[table] = null;
      }

      // Get latest serverSeq for this table as cursor
      const latestSeq = await changeTracking.getLatestServerSeq({
        resource: table,
      });
      cursors[table] = String(latestSeq);
    } catch (error) {
      logger?.warn("Clone: paginated fetch failed", { error: String(error), resource: table, operation: "clone-paginate" });
      // On adapter error, return empty data for this table
      data[table] = [];
      cursors[table] = "0";
      next[table] = null;
    }

    // For paginated clone of other tables in the list (if any), return empty arrays
    for (const tableName of tablesToClone) {
      if (tableName !== table && !data[tableName]) {
        data[tableName] = [];
        const latestSeq = await changeTracking.getLatestServerSeq({
          resource: tableName,
        });
        cursors[tableName] = String(latestSeq);
      }
    }
  } else {
    // SCA-002: Count total records first to decide if auto-pagination is needed
    let totalCount = 0;
    const tableCounts: Record<string, number> = {};
    for (const tableName of tablesToClone) {
      try {
        if (typeof db.count === "function") {
          tableCounts[tableName] = await db.count({ model: tableName, where: [], namespace });
        } else {
          const recs = await db.findMany({ model: tableName, where: [], namespace });
          tableCounts[tableName] = recs.length;
        }
        totalCount += tableCounts[tableName];
      } catch (error) {
        logger?.warn("Clone: table count failed", { error: String(error), resource: tableName, operation: "clone-count" });
        tableCounts[tableName] = 0;
      }
    }

    let paginated = false;

    if (totalCount > maxCloneRecords) {
      // SCA-002: Auto-paginate — return first maxCloneRecords records across tables
      paginated = true;
      let remaining = maxCloneRecords;

      for (const tableName of tablesToClone) {
        try {
          if (remaining <= 0) {
            data[tableName] = [];
            next[tableName] = tableCounts[tableName] > 0 ? "" : null;
          } else {
            const records = await db.findMany({
              model: tableName,
              where: [],
              orderBy: [{ field: "id", direction: "asc" }],
              limit: remaining,
              namespace,
            });
            data[tableName] = await filterActorVisibleRows(tableName, records);
            remaining -= records.length;

            // Set next cursor if more records exist
            if (records.length < tableCounts[tableName]) {
              const lastRecord = records[records.length - 1];
              next[tableName] = lastRecord?.id as string ?? null;
            } else {
              next[tableName] = null;
            }
          }

          const latestSeq = await changeTracking.getLatestServerSeq({ resource: tableName });
          cursors[tableName] = String(latestSeq);
        } catch (error) {
          logger?.warn("Clone: auto-paginate fetch failed", { error: String(error), resource: tableName, operation: "clone-paginate" });
          data[tableName] = [];
          cursors[tableName] = "0";
          next[tableName] = null;
        }
      }
    } else {
      // Non-paginated: get all records for each table, sorted by id
      for (const tableName of tablesToClone) {
        try {
          const records = await db.findMany({
            model: tableName,
            where: [],
            orderBy: [{ field: "id", direction: "asc" }],
            namespace,
          });
          data[tableName] = await filterActorVisibleRows(tableName, records);

          const latestSeq = await changeTracking.getLatestServerSeq({ resource: tableName });
          cursors[tableName] = String(latestSeq);
        } catch (error) {
          logger?.warn("Clone: fetch failed", { error: String(error), resource: tableName, operation: "clone-fetch" });
          data[tableName] = [];
          cursors[tableName] = "0";
        }
      }
    }

    // Set paginated flag on result if needed (handled below in return)
    if (paginated) {
      return {
        ok: true,
        data,
        cursors,
        joins,
        next: Object.keys(next).length > 0 ? next : undefined,
        paginated: true,
      };
    }
  }

  // Include join rows if requested (SYNC-001, SYNC-006)
  if (request.includeJoins && schema.relations) {
    joins = {};

    for (const relation of schema.relations) {
      // Skip relations that aren't many-many (no join rows)
      if (relation.type !== "many-many") continue;

      const froms = Array.isArray(relation.from) ? relation.from : [relation.from];
      const tos = Array.isArray(relation.to) ? relation.to : [relation.to];
      const joinTableName = getRelationJoinTableName(relation, froms[0]);
      const fromCol = relation.joinColumns?.from || "from";
      const toCol = relation.joinColumns?.to || "to";

      try {
        const joinRecords = await db.findMany({
          model: joinTableName,
          where: [],
          orderBy: [{ field: "id", direction: "asc" }],
          namespace,
        });

        const normalizedRows = joinRecords.map((row) =>
          normalizeJoinCloneRow(row, fromCol, toCol),
        );

        for (const from of froms) {
          for (const to of tos) {
            const joinStoreKey = getJoinStoreKey(from, relation.relation!, to);
            const rowsForStore = normalizedRows.filter((row) =>
              shouldIncludeJoinRowForStore(row, relation, schema, from, to),
            );
            if (rowsForStore.length > 0) {
              joins[joinStoreKey] = rowsForStore;
            }
          }
        }
      } catch (error) {
        logger?.warn("Clone: join table fetch failed", { error: String(error), operation: "clone-joins" });
        // Join table might not exist or be queryable; skip gracefully
        continue;
      }
    }
  }

  return {
    ok: true,
    data,
    cursors,
    joins,
    next: Object.keys(next).length > 0 ? next : undefined,
  };
}

function normalizeJoinCloneRow(
  row: Record<string, unknown>,
  fromCol: string,
  toCol: string,
): Record<string, unknown> {
  const normalized = { ...row };
  if (fromCol !== "from") {
    normalized.from = normalized[fromCol];
    delete normalized[fromCol];
  }
  if (toCol !== "to") {
    normalized.to = normalized[toCol];
    delete normalized[toCol];
  }
  return normalized;
}

function shouldIncludeJoinRowForStore(
  row: Record<string, unknown>,
  relation: DatafnRelationSchema,
  schema: DatafnSchema,
  from: string,
  to: string,
): boolean {
  const froms = Array.isArray(relation.from) ? relation.from : [relation.from];
  const tos = Array.isArray(relation.to) ? relation.to : [relation.to];
  if (typeof row.fromResource === "string" && row.fromResource !== from) {
    return false;
  }
  if (typeof row.toResource === "string" && row.toResource !== to) {
    return false;
  }
  const fromValue = typeof row.from === "string" ? row.from : undefined;
  const toValue = typeof row.to === "string" ? row.to : undefined;

  const fromMatches =
    froms.length === 1 || !fromValue || resourceIdMatches(schema, from, fromValue);
  const toMatches =
    tos.length === 1 || !toValue || resourceIdMatches(schema, to, toValue);
  return fromMatches && toMatches;
}

function resourceIdMatches(schema: DatafnSchema, resourceName: string, id: string) {
  const resource = schema.resources.find((item) => item.name === resourceName);
  const configuredPrefix = resource?.idPrefix ?? resourceName;
  const prefix = configuredPrefix.endsWith(":") && configuredPrefix.length > 1
    ? configuredPrefix.slice(0, -1)
    : configuredPrefix;
  return id === prefix || id.startsWith(`${prefix}:`);
}
