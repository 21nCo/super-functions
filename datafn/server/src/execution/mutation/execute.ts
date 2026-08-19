/**
 * Mutation execution logic
 */

import type { DatafnSchema, DatafnPlugin } from "../../core-types.js";
import type { Adapter } from "@superfunctions/db";
import { randomUUID } from "crypto";
import type { IdempotencyStore, MutationResult } from "../idempotency.js";
import { type DFQLMutation, buildReplaceRecord } from "./dfql.js";
import { resolveCapabilities } from "@datafn/core";
import { executeRelate, executeModifyRelation, executeUnrelate, extractJoinDeltas, extractRelationFkDeltas } from "./relations.js";
import { executeSchemaAwareMerge } from "./merge-decision.js";
import { executeShare, executeUnshare, getPermissionsTable } from "./share.js";
import { ChangeTrackingService, recordChangeWithRetry, recordChangesWithRetry } from "../sync/change-tracking.js";
import {
  applyRelationInheritanceForRelate,
  applyRelationInheritanceForShare,
  applyRelationInheritanceForUnrelate,
  applyRelationInheritanceForUnshare,
  collectRelationInheritanceTargetsForUnrelate,
  enforceRelateConsentForInheritance,
} from "../relations/inheritance.js";
import { evaluateGuard } from "./guards.js";
import type { DatafnLogger } from "../../logger.js";
import { validateShareableOperationAccess } from "../../validation/authz.js";
import type { SearchProvider } from "../../search-provider.js";

const SEARCH_UPSERT_OPS = new Set(["insert", "merge", "replace", "trash", "restore", "archive", "unarchive"]);

async function tryUpdateSearchIndex(
  searchProvider: SearchProvider,
  mutation: DFQLMutation,
  logger?: DatafnLogger,
): Promise<void> {
  const op = mutation.operation === "delete" ? "delete" : "upsert";
  const shouldIndex = op === "delete" || SEARCH_UPSERT_OPS.has(mutation.operation);
  if (!shouldIndex) return;
  try {
    await searchProvider.updateIndices({
      resource: mutation.resource,
      records: [{ id: mutation.id, ...(mutation.record || {}) }],
      operation: op,
    });
  } catch (e) {
    logger?.error("Search index update failed (non-fatal)", {
      error: String(e),
      operation: "search-index-update",
      resource: mutation.resource,
    });
  }
}

function hasSimpleCapability(
  resolvedCapabilities: unknown[],
  capability: "timestamps" | "audit" | "trash" | "archivable",
): boolean {
  return resolvedCapabilities.some((entry) => entry === capability);
}

function resolveCapabilitiesForResource(
  schema: DatafnSchema,
  resourceName: string,
): unknown[] {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) return [];
  return resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );
}

export function stripReadonlyCapabilityFields(
  record: Record<string, unknown>,
  resolvedCapabilities: unknown[],
): Record<string, unknown> {
  const stripped = { ...record };

  if (hasSimpleCapability(resolvedCapabilities, "timestamps")) {
    delete stripped.createdAt;
    delete stripped.updatedAt;
  }
  if (hasSimpleCapability(resolvedCapabilities, "audit")) {
    delete stripped.createdBy;
    delete stripped.updatedBy;
  }
  if (hasSimpleCapability(resolvedCapabilities, "trash")) {
    delete stripped.trashedAt;
    delete stripped.trashedBy;
  }

  return stripped;
}

function injectCapabilityFieldsOnInsert(
  record: Record<string, unknown>,
  resolvedCapabilities: unknown[],
  actorId?: string,
): Record<string, unknown> {
  const next = { ...record };
  const now = Date.now();

  if (hasSimpleCapability(resolvedCapabilities, "timestamps")) {
    next.createdAt = now;
    next.updatedAt = now;
  }
  if (hasSimpleCapability(resolvedCapabilities, "audit")) {
    next.createdBy = actorId ?? null;
    next.updatedBy = actorId ?? null;
  }

  return next;
}

function injectCapabilityFieldsOnUpdate(
  record: Record<string, unknown>,
  resolvedCapabilities: unknown[],
  actorId?: string,
): Record<string, unknown> {
  const next = { ...record };

  if (hasSimpleCapability(resolvedCapabilities, "timestamps")) {
    next.updatedAt = Date.now();
  }
  if (hasSimpleCapability(resolvedCapabilities, "audit")) {
    next.updatedBy = actorId ?? null;
  }

  return next;
}

function hasTrashCapability(resolvedCapabilities: unknown[]): boolean {
  return resolvedCapabilities.some((entry) => entry === "trash");
}

function hasArchivableCapability(resolvedCapabilities: unknown[]): boolean {
  return resolvedCapabilities.some((entry) => entry === "archivable");
}

function hasShareableCapability(resolvedCapabilities: unknown[]): boolean {
  return resolvedCapabilities.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "shareable" in (entry as Record<string, unknown>),
  );
}

/**
 * REL-011 / DI-002: Core operation execution (operation switch + change tracking).
 * Called within a transaction from the guarded path, or directly from the main path.
 * Does NOT include idempotency check/set, guard evaluation, or search index updates.
 */
async function executeMutationCore(
  mutation: DFQLMutation,
  db: Adapter,
  schema: DatafnSchema,
  namespace: string,
  effectiveMutationId: string,
  changeTracking: ChangeTrackingService,
  actorId?: string,
  logger?: DatafnLogger,
): Promise<MutationResult> {
  const resolvedCapabilities = resolveCapabilitiesForResource(schema, mutation.resource);
  let opResult:
    | { ok: true }
    | { ok: false; code: string; message: string; path: string };
  let resolvedRecord: Record<string, unknown> | undefined;
  let changeOverride:
    | {
        resource: string;
        id: string;
        op: "upsert" | "delete";
        record: Record<string, unknown> | null;
      }
    | undefined;
  // EXE-008: flag to skip change tracking when deleting a non-existent record
  let skipChangeTracking = false;

  try {
    switch (mutation.operation) {
      case "insert":
        try {
          const strippedRecord = stripReadonlyCapabilityFields(
            mutation.record || {},
            resolvedCapabilities,
          );
          const insertRecord = injectCapabilityFieldsOnInsert(
            strippedRecord,
            resolvedCapabilities,
            actorId,
          );
          await db.create({
            model: mutation.resource,
            data: { id: mutation.id, ...insertRecord },
            namespace,
          });
          resolvedRecord = insertRecord;
          opResult = { ok: true };
        } catch (error: any) {
          // EXE-010: Log original error for observability
          logger?.error("Mutation insert failed", { error: String(error), operation: "insert", resource: mutation.resource });
          // EXE-005: Check error.code before message matching
          const code = error?.code;
          const msg = (error?.message || "").toLowerCase();
          if (
            code === "23505" || code === "UNIQUE_VIOLATION" || code === "ER_DUP_ENTRY" ||
            code === "SQLITE_CONSTRAINT_UNIQUE" ||
            msg.includes("unique") || msg.includes("duplicate") || msg.includes("already exists") || msg.includes("conflict")
          ) {
            opResult = { ok: false, code: "CONFLICT", message: "Record already exists", path: "id" };
          } else {
            opResult = { ok: false, code: "INTERNAL", message: error?.message || "Internal error", path: "$" };
          }
        }
        break;

      case "merge":
        {
          const strippedRecord = stripReadonlyCapabilityFields(
            mutation.record || {},
            resolvedCapabilities,
          );
          const mergeData = injectCapabilityFieldsOnUpdate(
            strippedRecord,
            resolvedCapabilities,
            actorId,
          );
          const strictUpdateNotFound = db.capabilities?.operations?.strictUpdateNotFound === true;
          const mergeResult = await executeSchemaAwareMerge({
            schema,
            resource: mutation.resource,
            id: mutation.id,
            delta: mergeData,
            update: async () => {
              const updated = await db.update({
                model: mutation.resource,
                where: [{ field: "id", operator: "eq", value: mutation.id }],
                data: mergeData,
                namespace,
              });
              if (strictUpdateNotFound && !updated) {
                throw { name: "NotFoundError", message: "Record not found after update" };
              }
            },
            create: async (record) => {
              await db.create({
                model: mutation.resource,
                data: record,
                namespace,
              });
            },
            ...(strictUpdateNotFound
              ? {}
              : {
                  findOne: async () =>
                    db.findOne({
                      model: mutation.resource,
                      where: [{ field: "id", operator: "eq", value: mutation.id }],
                      namespace,
                    }),
                }),
          });

          if (mergeResult.ok) {
            resolvedRecord = mergeData;
            opResult = { ok: true };
          } else {
            if (mergeResult.code === "INTERNAL") {
              logger?.error("Mutation merge failed", {
                error: String(mergeResult.error),
                operation: "merge",
                resource: mutation.resource,
              });
            }
            opResult = {
              ok: false,
              code: mergeResult.code,
              message: mergeResult.message,
              path: mergeResult.path,
            };
          }
        }
        break;

      case "replace":
        try {
          const existing = await db.findOne({
            model: mutation.resource,
            where: [{ field: "id", operator: "eq", value: mutation.id }],
            namespace,
          });
          if (!existing) {
            opResult = { ok: false, code: "NOT_FOUND", message: `Record not found: ${mutation.id}`, path: "id" };
            break;
          }
          const strippedRecord = stripReadonlyCapabilityFields(
            mutation.record || {},
            resolvedCapabilities,
          );
          const updateRecord = injectCapabilityFieldsOnUpdate(
            strippedRecord,
            resolvedCapabilities,
            actorId,
          );
          const buildResult = buildReplaceRecord(
            schema,
            mutation.resource,
            existing,
            updateRecord,
            resolvedCapabilities,
          );
          if (!buildResult.ok) {
            opResult = { ok: false, code: buildResult.code, message: buildResult.message, path: buildResult.path };
            break;
          }
          await db.update({
            model: mutation.resource,
            where: [{ field: "id", operator: "eq", value: mutation.id }],
            data: buildResult.record,
            namespace,
          });
          resolvedRecord = buildResult.record;
          opResult = { ok: true };
        } catch (e: any) {
          // EXE-010: Log original error for observability
          logger?.error("Mutation replace failed", { error: String(e), operation: "replace", resource: mutation.resource });
          opResult = { ok: false, code: "INTERNAL", message: e?.message || "Internal error", path: "$" };
        }
        break;

      case "delete": {
        // EXE-008: Check existence before change tracking (delete of non-existent is idempotent)
        const existingForDelete = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        await db.delete({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        if (!existingForDelete) {
          // Record didn't exist — skip change tracking (no-op delete)
          skipChangeTracking = true;
        }
        if (hasShareableCapability(resolvedCapabilities)) {
          const permissionRows = await db.findMany({
            model: getPermissionsTable(mutation.resource),
            where: [{ field: "resourceId", operator: "eq", value: mutation.id }],
            namespace,
          });
          for (const permissionRow of permissionRows) {
            await db.delete({
              model: getPermissionsTable(mutation.resource),
              where: [{ field: "id", operator: "eq", value: permissionRow.id }],
              namespace,
            });
          }
        }
        opResult = { ok: true };
        break;
      }

      case "trash": {
        if (!hasTrashCapability(resolvedCapabilities)) {
          opResult = {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: "Unsupported DFQL feature: mutation.operation.trash",
            path: "operation",
          };
          break;
        }

        const existing = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });

        if (!existing) {
          opResult = { ok: false, code: "NOT_FOUND", message: `Record not found: ${mutation.id}`, path: "id" };
          break;
        }

        const trashPayload = injectCapabilityFieldsOnUpdate(
          { trashedAt: Date.now(), trashedBy: actorId ?? null },
          resolvedCapabilities,
          actorId,
        );

        await db.update({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          data: trashPayload,
          namespace,
        });

        const updated = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        resolvedRecord = (updated as Record<string, unknown> | null) ?? {
          id: mutation.id,
          ...existing,
          ...trashPayload,
        };
        opResult = { ok: true };
        break;
      }

      case "restore": {
        if (!hasTrashCapability(resolvedCapabilities)) {
          opResult = {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: "Unsupported DFQL feature: mutation.operation.restore",
            path: "operation",
          };
          break;
        }

        const existing = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });

        if (!existing) {
          opResult = { ok: false, code: "NOT_FOUND", message: `Record not found: ${mutation.id}`, path: "id" };
          break;
        }

        const existingRecord = existing as Record<string, unknown>;
        const isCurrentlyTrashed =
          existingRecord.trashedAt !== null && existingRecord.trashedAt !== undefined;

        if (!isCurrentlyTrashed) {
          skipChangeTracking = true;
          opResult = { ok: true };
          break;
        }

        const restorePayload = injectCapabilityFieldsOnUpdate(
          { trashedAt: null, trashedBy: null },
          resolvedCapabilities,
          actorId,
        );

        await db.update({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          data: restorePayload,
          namespace,
        });

        const updated = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        resolvedRecord = (updated as Record<string, unknown> | null) ?? {
          id: mutation.id,
          ...existingRecord,
          ...restorePayload,
        };
        opResult = { ok: true };
        break;
      }

      case "archive": {
        if (!hasArchivableCapability(resolvedCapabilities)) {
          opResult = {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: "Unsupported DFQL feature: mutation.operation.archive",
            path: "operation",
          };
          break;
        }

        const existing = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });

        if (!existing) {
          opResult = { ok: false, code: "NOT_FOUND", message: `Record not found: ${mutation.id}`, path: "id" };
          break;
        }

        const archivePayload = injectCapabilityFieldsOnUpdate(
          { isArchived: true },
          resolvedCapabilities,
          actorId,
        );

        await db.update({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          data: archivePayload,
          namespace,
        });

        const updated = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        resolvedRecord = (updated as Record<string, unknown> | null) ?? {
          id: mutation.id,
          ...(existing as Record<string, unknown>),
          ...archivePayload,
        };
        opResult = { ok: true };
        break;
      }

      case "unarchive": {
        if (!hasArchivableCapability(resolvedCapabilities)) {
          opResult = {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: "Unsupported DFQL feature: mutation.operation.unarchive",
            path: "operation",
          };
          break;
        }

        const existing = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });

        if (!existing) {
          opResult = { ok: false, code: "NOT_FOUND", message: `Record not found: ${mutation.id}`, path: "id" };
          break;
        }

        const unarchivePayload = injectCapabilityFieldsOnUpdate(
          { isArchived: false },
          resolvedCapabilities,
          actorId,
        );

        await db.update({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          data: unarchivePayload,
          namespace,
        });

        const updated = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace,
        });
        resolvedRecord = (updated as Record<string, unknown> | null) ?? {
          id: mutation.id,
          ...(existing as Record<string, unknown>),
          ...unarchivePayload,
        };
        opResult = { ok: true };
        break;
      }

      case "share": {
        const shareResult = await executeShare(
          db,
          mutation as any,
          resolvedCapabilities,
          namespace,
          actorId,
          logger,
        );
        if (!shareResult.ok) {
          opResult = {
            ok: false,
            code: shareResult.code,
            message: shareResult.message,
            path: shareResult.path,
          };
          break;
        }
        changeOverride = {
          resource: getPermissionsTable(mutation.resource),
          id: String(shareResult.permissionRecord.id),
          op: "upsert",
          record: shareResult.permissionRecord,
        };
        const inheritanceShareResult = await applyRelationInheritanceForShare({
          db,
          schema,
          namespace,
          actorId,
          parentResource: mutation.resource,
          parentId:
            typeof shareResult.permissionRecord.resourceId === "string"
              ? shareResult.permissionRecord.resourceId
              : null,
          principalId: String(shareResult.permissionRecord.principalId ?? ""),
          level:
            (shareResult.permissionRecord.level as "viewer" | "editor" | "owner") ??
            "viewer",
        });
        if (!inheritanceShareResult.ok) {
          opResult = inheritanceShareResult;
          break;
        }
        opResult = { ok: true };
        break;
      }

      case "unshare": {
        const unshareResult = await executeUnshare(
          db,
          mutation as any,
          resolvedCapabilities,
          namespace,
          actorId,
          logger,
        );
        if (!unshareResult.ok) {
          opResult = {
            ok: false,
            code: unshareResult.code,
            message: unshareResult.message,
            path: unshareResult.path,
          };
          break;
        }
        if (!unshareResult.deleted) {
          skipChangeTracking = true;
        } else {
          const inheritanceUnsharePrincipal =
            mutation.shareWith?.principalId ??
            (mutation.shareWith?.userId
              ? (String(mutation.shareWith.userId).includes(":")
                ? String(mutation.shareWith.userId)
                : `user:${mutation.shareWith.userId}`)
              : undefined);
          if (typeof inheritanceUnsharePrincipal === "string") {
            const inheritanceUnshareResult = await applyRelationInheritanceForUnshare({
              db,
              schema,
              namespace,
              parentResource: mutation.resource,
              parentId: mutation.scope === "resource" ? null : mutation.id,
              principalId: inheritanceUnsharePrincipal,
            });
            if (!inheritanceUnshareResult.ok) {
              opResult = inheritanceUnshareResult;
              break;
            }
          }
          changeOverride = {
            resource: getPermissionsTable(mutation.resource),
            id: unshareResult.changeId,
            op: "delete",
            record: null,
          };
        }
        opResult = { ok: true };
        break;
      }

      case "relate":
        try {
          const consentResult = await enforceRelateConsentForInheritance({
            schema,
            db,
            namespace,
            mutation,
          });
          if (!consentResult.ok) {
            opResult = consentResult;
            break;
          }

          opResult = await executeRelate(db, schema, mutation, namespace, actorId);
          if (opResult.ok) {
            const inheritanceRelateResult = await applyRelationInheritanceForRelate({
              db,
              schema,
              namespace,
              actorId,
              mutation,
            });
            if (!inheritanceRelateResult.ok) {
              opResult = inheritanceRelateResult;
            }
          }
        } catch (e: any) {
          // EXE-010: Log original error for observability
          logger?.error("Mutation relate failed", { error: String(e), operation: "relate", resource: mutation.resource });
          opResult = { ok: false, code: "INTERNAL", message: e?.message || "Internal error", path: "$" };
        }
        break;

      case "modifyRelation":
        try {
          opResult = await executeModifyRelation(db, schema, mutation, namespace, actorId);
        } catch (e: any) {
          // EXE-010: Log original error for observability
          logger?.error("Mutation modifyRelation failed", { error: String(e), operation: "modifyRelation", resource: mutation.resource });
          opResult = { ok: false, code: "INTERNAL", message: e?.message || "Internal error", path: "$" };
        }
        break;

      case "unrelate":
        try {
          const unrelateTargets = await collectRelationInheritanceTargetsForUnrelate({
            db,
            schema,
            namespace,
            mutation,
          });
          opResult = await executeUnrelate(db, schema, mutation, namespace);
          if (opResult.ok) {
            const inheritanceUnrelateResult = await applyRelationInheritanceForUnrelate({
              db,
              schema,
              namespace,
              mutation,
              targets: unrelateTargets,
            });
            if (!inheritanceUnrelateResult.ok) {
              opResult = inheritanceUnrelateResult;
            }
          }
        } catch (e: any) {
          // EXE-010: Log original error for observability
          logger?.error("Mutation unrelate failed", { error: String(e), operation: "unrelate", resource: mutation.resource });
          opResult = { ok: false, code: "INTERNAL", message: e?.message || "Internal error", path: "$" };
        }
        break;

      default:
        opResult = {
          ok: false,
          code: "DFQL_UNSUPPORTED",
          message: `Unsupported DFQL feature: mutation.operation.${(mutation as any).operation}`,
          path: "operation",
        };
    }
  } catch (error: any) {
    logger?.error("Unexpected mutation error", {
      error: String(error),
      operation: (mutation as any).operation,
      resource: mutation.resource,
    });
    opResult = { ok: false, code: "INTERNAL", message: error?.message || "Internal error", path: "$" };
  }

  const result: MutationResult = opResult.ok
    ? { ok: true, mutationId: effectiveMutationId, affectedIds: [mutation.id], errors: [], deduped: false }
    : {
        ok: false,
        mutationId: effectiveMutationId,
        affectedIds: [],
        errors: [{ code: opResult.code, message: opResult.message, path: opResult.path, retryable: false }],
        deduped: false,
      };

  // REL-011: Record change tracking using the provided changeTracking instance
  // (which uses the same db adapter as the operation — ensures atomicity when in a transaction)
  if (opResult.ok && !skipChangeTracking) {
    try {
      const isRelationMutation =
        mutation.operation === "relate" ||
        mutation.operation === "modifyRelation" ||
        mutation.operation === "unrelate";

      if (isRelationMutation) {
        const fkDeltas = extractRelationFkDeltas(mutation, schema);
        const joinDeltas = extractJoinDeltas(mutation, schema);
        const allDeltas = [...fkDeltas, ...joinDeltas];
        if (allDeltas.length > 0) {
          const seqs = await changeTracking.getNextServerSeqBatch(allDeltas.length);
          const entries = allDeltas.map((delta, i) => ({
            serverSeq: seqs[i],
            resource: delta.resource,
            id: delta.id,
            op: delta.op,
            record: delta.record,
          }));
          await recordChangesWithRetry(changeTracking, entries, 2, logger);
        }
      } else {
        const serverSeq = await changeTracking.getNextServerSeq();
        const changeOp = changeOverride
          ? changeOverride.op
          : mutation.operation === "delete" ? "delete" :
            mutation.operation === "insert" ? "insert" :
            mutation.operation === "trash" ? "merge" :
            mutation.operation === "restore" ? "merge" :
            mutation.operation === "archive" ? "merge" :
            mutation.operation === "unarchive" ? "merge" :
            mutation.operation === "merge" ? "merge" :
            "replace";
        const changeRecord = changeOverride
          ? changeOverride.record
          : mutation.operation === "delete"
            ? null
            : mutation.operation === "replace" && resolvedRecord !== undefined
              ? { id: mutation.id, ...resolvedRecord }
              : { id: mutation.id, ...(resolvedRecord || mutation.record || {}) };
        // FIX-REL-002: Use shared retry helper for change-tracking parity with push path
        await recordChangeWithRetry(changeTracking, {
          serverSeq,
          resource: changeOverride?.resource ?? mutation.resource,
          id: changeOverride?.id ?? mutation.id,
          op: changeOp,
          record: changeRecord,
        }, 2, logger);
      }
    } catch (error) {
      logger?.error("Change tracking failed", { error: String(error), operation: "changeTracking", resource: mutation.resource });
      throw error;
    }
  }

  return result;
}

/**
 * Execute a single mutation
 */
export async function executeMutation(
  mutation: DFQLMutation,
  schema: DatafnSchema,
  db: Adapter,
  idempotencyStore: IdempotencyStore,
  changeTracking: ChangeTrackingService,
  plugins: DatafnPlugin[] = [],
  namespace: string,
  actorId?: string,
  logger?: DatafnLogger,
  searchProvider?: SearchProvider,
): Promise<MutationResult> {
  // clientId and mutationId are optional. When absent, skip idempotency tracking.
  // EXE-009: Use crypto.randomUUID() for unpredictable anonymous mutation IDs
  const effectiveMutationId = mutation.mutationId || randomUUID();

  // Check idempotency only when both IDs are provided
  if (mutation.clientId && mutation.mutationId) {
    const cached = await idempotencyStore.get(
      mutation.clientId,
      mutation.mutationId,
    );
    if (cached) {
      return { ...cached, deduped: true };
    }
  }

  // Validate operation
  const validOps = [
    "insert",
    "merge",
    "replace",
    "delete",
    "trash",
    "restore",
    "archive",
    "unarchive",
    "share",
    "unshare",
    "relate",
    "modifyRelation",
    "unrelate",
  ];
  if (!validOps.includes(mutation.operation)) {
    const result: MutationResult = {
      ok: false,
      mutationId: effectiveMutationId,
      affectedIds: [],
      errors: [
        {
          code: "DFQL_UNSUPPORTED",
          message: `Unsupported DFQL feature: mutation.operation.${mutation.operation}`,
          path: "operation",
          retryable: false,
        },
      ],
      deduped: false,
    };
    if (mutation.clientId && mutation.mutationId) {
      await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);
    }
    return result;
  }

  // PHASE_11: Shareable mutation authorization by access level.
  const resolvedCapabilities = resolveCapabilitiesForResource(schema, mutation.resource);
  if (hasShareableCapability(resolvedCapabilities)) {
    const authzResult = await validateShareableOperationAccess({
      db,
      schema,
      resource: mutation.resource,
      operation: mutation.operation,
      id: mutation.id,
      actorId,
      namespace,
      requireActorForPrivate: false,
    });
    if (!authzResult.ok) {
      const result: MutationResult = {
        ok: false,
        mutationId: effectiveMutationId,
        affectedIds: [],
        errors: [
          {
            code: authzResult.code,
            message: authzResult.message,
            path: authzResult.path,
            retryable: false,
          },
        ],
        deduped: false,
      };
      if (mutation.clientId && mutation.mutationId) {
        await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);
      }
      return result;
    }
  }

  // DI-002: Guard evaluation + operation MUST run in same transaction to prevent TOCTOU.
  // When db.transaction is available and a guard is present, wrap the guard check +
  // the entire operation + change tracking in a single transaction.
  // When called from transact.ts (db is already a tx adapter), `db.transaction` on the
  // proxy still exists, but the proxy is the same instance — nested calls are safe because
  // each call to the test mock just creates a new scope; real adapters use savepoints.
  //
  // REL-011: changeTracking.withDb(db) ensures change recording uses the same db
  // that performed the operation (tx db from transact.ts, outer db from push.ts).
  const hasGuard = !!mutation.if;
  // DI-002: Use adapter capabilities to determine transaction support.
  // capabilities.transactions.supported === false means explicitly no support (e.g. memoryAdapter).
  // If capabilities are absent/incomplete (e.g. test mocks), fall back to duck-typing.
  const hasTransaction =
    (db.capabilities?.transactions?.supported !== false) &&
    typeof db.transaction === "function";

  if (hasGuard && hasTransaction) {
    // Wrap guard evaluation + full operation + change tracking in a single transaction
    let txMutationResult: MutationResult | null = null;
    let guardFailed = false;

    try {
      await (db as any).transaction(async (txDb: Adapter) => {
        // DI-002: Re-read record inside transaction to prevent TOCTOU
        const guardResult = await evaluateGuard(
          txDb,
          mutation.resource,
          mutation.id,
          mutation.if!,
          schema,
          namespace,
        );

        if (!guardResult.match) {
          guardFailed = true;
          // Signal transaction abort (will be caught below)
          throw { __datafnGuardFailed: true };
        }

        // Execute the operation within the transaction
        txMutationResult = await executeMutationCore(
          mutation,
          txDb,
          schema,
          namespace,
          effectiveMutationId,
          changeTracking.withDb(txDb),
          actorId,
          logger,
        );
      });
    } catch (err: any) {
      if (err?.__datafnGuardFailed) {
        guardFailed = true;
      } else if (!txMutationResult) {
        // Transaction aborted for another reason
        txMutationResult = {
          ok: false,
          mutationId: effectiveMutationId,
          affectedIds: [],
          errors: [{ code: "INTERNAL", message: err?.message || "Transaction failed", path: "$", retryable: false }],
          deduped: false,
        };
      }
    }

    if (guardFailed) {
      const result: MutationResult = {
        ok: false,
        mutationId: effectiveMutationId,
        affectedIds: [],
        errors: [{ code: "CONFLICT", message: "Guard condition not met", path: "if", retryable: false }],
        deduped: false,
      };
      if (mutation.clientId && mutation.mutationId) {
        await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);
      }
      return result;
    }

    if (txMutationResult) {
      if (searchProvider && (txMutationResult as MutationResult).ok) {
        await tryUpdateSearchIndex(searchProvider, mutation, logger);
      }
      if (mutation.clientId && mutation.mutationId) {
        await idempotencyStore.set(mutation.clientId, mutation.mutationId, txMutationResult as MutationResult);
      }
      return txMutationResult as MutationResult;
    }
  } else if (hasGuard) {
    // No transaction available: evaluate guard outside transaction (TOCTOU possible but rare)
    const guardResult = await evaluateGuard(
      db,
      mutation.resource,
      mutation.id,
      mutation.if!,
      schema,
      namespace,
    );

    if (!guardResult.match) {
      const result: MutationResult = {
        ok: false,
        mutationId: effectiveMutationId,
        affectedIds: [],
        errors: [
          {
            code: "CONFLICT",
            message: "Guard condition not met",
            path: "if",
            retryable: false,
          },
        ],
        deduped: false,
      };
      if (mutation.clientId && mutation.mutationId) {
        await idempotencyStore.set(
          mutation.clientId,
          mutation.mutationId,
          result,
        );
      }
      return result;
    }
  }

  // REL-011: Execute operation + change tracking using executeMutationCore.
  // changeTracking.withDb(db) ensures the change tracking uses the same db as the
  // operation — when db is a tx adapter (from transact.ts), both are in the transaction.
  const result = await executeMutationCore(
    mutation,
    db,
    schema,
    namespace,
    effectiveMutationId,
    changeTracking.withDb(db),
    actorId,
    logger,
  );

  if (searchProvider && result.ok) {
    await tryUpdateSearchIndex(searchProvider, mutation, logger);
  }

  // Store for idempotency only when IDs were provided
  if (mutation.clientId && mutation.mutationId) {
    await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);
  }

  return result;
}
