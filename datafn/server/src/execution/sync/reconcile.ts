/**
 * Reconcile implementation - counts-based drift detection
 * 
 * Implements SYNC-007: Server reconcile endpoint returns deterministic counts
 * for resources and join stores.
 */

import type { DatafnErrorCode, DatafnSchema } from "../../core-types.js";
import { getJoinStoreKey, getRelationJoinTableName } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import { ChangeTrackingService } from "./change-tracking.js";
import type { SequenceStore } from "./sequence-store.js";
import type { DatafnLogger } from "../../logger.js";
import { isPrivateShareableResource, resolveAccessLevel } from "../../validation/authz.js";

function resourceIdMatches(schema: DatafnSchema, resourceName: string, id: string) {
  const resource = schema.resources.find((item) => item.name === resourceName);
  const prefix = resource?.idPrefix ?? resourceName;
  return id === prefix || id.startsWith(`${prefix}:`);
}

function shouldIncludeJoinRowForStore(
  row: Record<string, unknown>,
  relation: NonNullable<DatafnSchema["relations"]>[number],
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

export interface ReconcileRequest {
  clientId: string;
  resources: string[];
  includeJoins?: boolean;
  actorId?: string;
}

export interface ReconcileResult {
  ok: boolean;
  counts?: Record<string, number>;
  joinCounts?: Record<string, number>;
  latestCursor?: string;
  error?: {
    code: DatafnErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Execute reconcile operation - return deterministic counts for drift detection
 */
export async function executeReconcile(
  request: ReconcileRequest,
  schema: DatafnSchema,
  db: Adapter,
  namespace: string,
  sequenceStore?: SequenceStore,
  logger?: DatafnLogger,
): Promise<ReconcileResult> {
  // Validate clientId
  if (!request.clientId || typeof request.clientId !== "string") {
    return {
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      },
    };
  }

  // Validate resources array
  if (!Array.isArray(request.resources)) {
    return {
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: resources must be array",
        details: { path: "resources" },
      },
    };
  }

  const counts: Record<string, number> = {};
  let joinCounts: Record<string, number> | undefined;
  const actorId = request.actorId;

  // Validate and count each requested resource
  for (const resourceName of request.resources) {
    const resource = schema.resources.find((r) => r.name === resourceName);

    if (!resource) {
      return {
        ok: false,
        error: {
          code: "DFQL_UNKNOWN_RESOURCE",
          message: `Unknown resource: ${resourceName}`,
          details: { path: `resources[${request.resources.indexOf(resourceName)}]` },
        },
      };
    }

    // Check for isRemoteOnly flag (reconcile doesn't make sense for remote-only)
    if ((resource as any).isRemoteOnly) {
      return {
        ok: false,
        error: {
          code: "DFQL_INVALID",
          message: `Invalid DFQL: remote-only table cannot be reconciled: ${resourceName}`,
          details: { path: `resources[${request.resources.indexOf(resourceName)}]` },
        },
      };
    }

    try {
      if (isPrivateShareableResource(schema, resourceName)) {
        if (!actorId) {
          counts[resourceName] = 0;
          continue;
        }
        const rows = await db.findMany({
          model: resourceName,
          where: [],
          namespace,
        });
        let visibleCount = 0;
        for (const row of rows) {
          const recordId = typeof row.id === "string" ? row.id : null;
          if (!recordId) {
            continue;
          }
          const level = await resolveAccessLevel(
            db,
            schema,
            resourceName,
            recordId,
            actorId,
            namespace,
          );
          if (level) {
            visibleCount++;
          }
        }
        counts[resourceName] = visibleCount;
        continue;
      }

      // SCA-001: Use db.count() instead of loading all records
      if (typeof db.count === "function") {
        counts[resourceName] = await db.count({
          model: resourceName,
          where: [],
          namespace,
        });
      } else {
        // Alternate path for adapters without count support
        logger?.warn("Adapter lacks count() — using findMany path", {
          operation: "reconcile",
          resource: resourceName,
        });
        const records = await db.findMany({
          model: resourceName,
          where: [],
          namespace,
        });
        counts[resourceName] = records.length;
      }
    } catch (error) {
      logger?.warn("Reconcile: resource count failed", { error: String(error), resource: resourceName, operation: "reconcile-count" });
      // On adapter error, return 0 count
      counts[resourceName] = 0;
    }
  }

  // Include join counts if requested (SYNC-007)
  if (request.includeJoins && schema.relations) {
    joinCounts = {};

    for (const relation of schema.relations) {
      // Skip relations that aren't many-many (no join rows)
      if (relation.type !== "many-many") continue;

      // Check if this relation involves any of the requested resources
      const fromResources = Array.isArray(relation.from)
        ? relation.from
        : [relation.from];
      const toResources = Array.isArray(relation.to) ? relation.to : [relation.to];
      const involvesRequestedResource =
        fromResources.some((name) => request.resources.includes(name)) ||
        toResources.some((name) => request.resources.includes(name));

      if (!involvesRequestedResource) continue;

      const fromCol = relation.joinColumns?.from || "from";
      const toCol = relation.joinColumns?.to || "to";
      if (fromResources.length === 1 && toResources.length === 1) {
        const fromResource = fromResources[0];
        const toResource = toResources[0];
        const relationTouchesPrivateResource =
          isPrivateShareableResource(schema, fromResource) ||
          isPrivateShareableResource(schema, toResource);
        if (
          !relation.joinTable &&
          !relationTouchesPrivateResource &&
          typeof db.count === "function"
        ) {
          const joinTableName = getRelationJoinTableName(relation, fromResource);
          const joinStoreKey = getJoinStoreKey(fromResource, relation.relation!, toResource);
          let countSucceeded = false;
          try {
            joinCounts[joinStoreKey] = await db.count({
              model: joinTableName,
              where: [],
              namespace,
            });
            countSucceeded = true;
          } catch (error) {
            logger?.warn("Reconcile: join count failed", {
              error: String(error),
              joinTable: joinTableName,
              operation: "reconcile-join-count",
            });
          }
          if (countSucceeded) continue;
        }
      }

      for (const fromResource of fromResources) {
        const joinTableName = getRelationJoinTableName(relation, fromResource);
        let joinRecords: Record<string, unknown>[] = [];
        try {
          joinRecords = await db.findMany({
            model: joinTableName,
            where: [],
            namespace,
          });
        } catch (error) {
          logger?.warn("Reconcile: join count failed", { error: String(error), joinTable: joinTableName, operation: "reconcile-join-count" });
        }

        const normalizedRows = joinRecords.map((row) => ({
          ...row,
          from: row[fromCol],
          to: row[toCol],
        }));

        for (const toResource of toResources) {
          const joinStoreKey = getJoinStoreKey(fromResource, relation.relation!, toResource);
          const relationTouchesPrivateResource =
            isPrivateShareableResource(schema, fromResource) ||
            isPrivateShareableResource(schema, toResource);

          if (relationTouchesPrivateResource && !actorId) {
            joinCounts[joinStoreKey] = 0;
            continue;
          }

          joinCounts[joinStoreKey] = normalizedRows.filter((row) =>
            shouldIncludeJoinRowForStore(row, relation, schema, fromResource, toResource),
          ).length;
        }
      }
    }
  }

  // Get latest cursor (global max across requested resources)
  const changeTracking = new ChangeTrackingService(db, namespace, sequenceStore);
  const latestCursor = String(await changeTracking.getCurrentServerSeq());

  return {
    ok: true,
    counts,
    joinCounts,
    latestCursor,
  };
}
