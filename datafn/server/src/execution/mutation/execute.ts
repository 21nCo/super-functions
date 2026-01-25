/**
 * Mutation execution logic
 */

import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore, MutationResult } from "../idempotency.js";
import { type DFQLMutation, buildReplaceRecord } from "./dfql.js";
import { executeRelate, executeModifyRelation, executeUnrelate } from "./relations.js";
import { ChangeTrackingService } from "../sync/change-tracking.js";
import { evaluateGuard } from "./guards.js";
import { isSearchPlugin } from "../../plugins/searchfn.js";

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
): Promise<MutationResult> {
  // Validate required fields
  if (!mutation.clientId || !mutation.mutationId) {
    return {
      ok: false,
      mutationId: mutation.mutationId || "",
      affectedIds: [],
      errors: [
        {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: missing clientId or mutationId",
          path: "$",
          retryable: false,
        },
      ],
      deduped: false,
    };
  }

  // Check idempotency
  const cached = await idempotencyStore.get(
    mutation.clientId,
    mutation.mutationId,
  );
  if (cached) {
    return { ...cached, deduped: true };
  }

  // Validate operation
  const validOps = [
    "insert",
    "merge",
    "replace",
    "delete",
    "relate",
    "modifyRelation",
    "unrelate",
  ];
  if (!validOps.includes(mutation.operation)) {
    const result: MutationResult = {
      ok: false,
      mutationId: mutation.mutationId,
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
    await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);
    return result;
  }

  // Evaluate if guard
  if (mutation.if) {
    const guardResult = await evaluateGuard(
      db,
      mutation.resource,
      mutation.id,
      mutation.if,
      schema,
    );

    if (!guardResult.match) {
      const result: MutationResult = {
        ok: false,
        mutationId: mutation.mutationId,
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
      await idempotencyStore.set(
        mutation.clientId,
        mutation.mutationId,
        result,
      );
      return result;
    }
  }

  // Execute operation using Adapter
  let opResult:
    | { ok: true }
    | { ok: false; code: string; message: string; path: string };

  try {
    switch (mutation.operation) {
      case "insert":
        // Enforce uniqueness: check if record exists
        const exists = await db.findOne({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace: "datafn",
        });
        if (exists) {
          opResult = {
            ok: false,
            code: "CONFLICT",
            message: "Record already exists",
            path: "id",
          };
          break;
        }

        // Use adapter.create for insert
        await db.create({
          model: mutation.resource,
          data: {
            id: mutation.id,
            ...(mutation.record || {}),
          },
          namespace: "datafn",
        });
        opResult = { ok: true };
        break;

      case "merge":
        // Use upsert semantics: first check if record exists
        try {
          const existing = await db.findOne({
            model: mutation.resource,
            where: [{ field: "id", operator: "eq", value: mutation.id }],
            namespace: "datafn",
          });

          if (existing) {
            // Record exists, update it (merge)
            await db.update({
              model: mutation.resource,
              where: [{ field: "id", operator: "eq", value: mutation.id }],
              data: mutation.record || {},
              namespace: "datafn",
            });
          } else {
            // Record doesn't exist, create it
            await db.create({
              model: mutation.resource,
              data: {
                id: mutation.id,
                ...(mutation.record || {}),
              },
              namespace: "datafn",
            });
          }
          opResult = { ok: true };
        } catch (error) {
          opResult = {
            ok: false,
            code: "INTERNAL",
            message: "Internal error",
            path: "$",
          };
        }
        break;

      case "replace":
        // Replace semantics: MUST exist, clear unspecified fields
        try {
          const existing = await db.findOne({
            model: mutation.resource,
            where: [{ field: "id", operator: "eq", value: mutation.id }],
            namespace: "datafn",
          });

          if (!existing) {
            opResult = {
              ok: false,
              code: "NOT_FOUND",
              message: `Record not found: ${mutation.id}`,
              path: "id",
            };
            break;
          }

          const buildResult = buildReplaceRecord(
            schema,
            mutation.resource,
            existing,
            mutation.record || {},
          );

          if (!buildResult.ok) {
            opResult = {
              ok: false,
              code: buildResult.code,
              message: buildResult.message,
              path: buildResult.path,
            };
            break;
          }

          // Full update
          await db.update({
            model: mutation.resource,
            where: [{ field: "id", operator: "eq", value: mutation.id }],
            data: buildResult.record,
            namespace: "datafn",
          });
          opResult = { ok: true };
        } catch (error) {
          opResult = {
            ok: false,
            code: "INTERNAL",
            message: "Internal error",
            path: "$",
          };
        }
        break;

      case "delete":
        // Use adapter.delete
        await db.delete({
          model: mutation.resource,
          where: [{ field: "id", operator: "eq", value: mutation.id }],
          namespace: "datafn",
        });
        opResult = { ok: true };
        break;

      case "relate":
        try {
          opResult = await executeRelate(db, schema, mutation);
        } catch (error) {
          opResult = {
            ok: false,
            code: "INTERNAL",
            message: "Internal error",
            path: "$",
          };
        }
        break;

      case "modifyRelation":
        try {
          opResult = await executeModifyRelation(db, schema, mutation);
        } catch (error) {
          opResult = {
            ok: false,
            code: "INTERNAL",
            message: "Internal error",
            path: "$",
          };
        }
        break;

      case "unrelate":
        try {
          opResult = await executeUnrelate(db, schema, mutation);
        } catch (error) {
          opResult = {
            ok: false,
            code: "INTERNAL",
            message: "Internal error",
            path: "$",
          };
        }
        break;

      default:
        opResult = {
          ok: false,
          code: "DFQL_UNSUPPORTED",
          message: `Unsupported DFQL feature: mutation.operation.${mutation.operation}`,
          path: "operation",
        };
    }
  } catch (error) {
    // Adapter errors
    opResult = {
      ok: false,
      code: "INTERNAL",
      message: "Internal error",
      path: "$",
    };
  }

  // Build result
  const result: MutationResult = opResult.ok
    ? {
        ok: true,
        mutationId: mutation.mutationId,
        affectedIds: [mutation.id],
        errors: [],
        deduped: false,
      }
    : {
        ok: false,
        mutationId: mutation.mutationId,
        affectedIds: [],
        errors: [
          {
            code: opResult.code,
            message: opResult.message,
            path: opResult.path,
            retryable: false,
          },
        ],
        deduped: false,
      };

  // Record change tracking for successful mutations
  if (opResult.ok) {
    try {
      const serverSeq = await changeTracking.getNextServerSeq();
      await changeTracking.recordChange({
        serverSeq,
        resource: mutation.resource,
        id: mutation.id,
        op: mutation.operation === "delete" ? "delete" : "upsert",
        record:
          mutation.operation === "delete"
            ? null
            : { id: mutation.id, ...(mutation.record || {}) },
      });
    } catch (error) {
      // Log but don't fail the mutation if change tracking fails
      console.error("Change tracking failed:", error);
    }

    // Index Updates
    const searchPlugin = plugins.find(isSearchPlugin);
    if (searchPlugin) {
      try {
        const op = mutation.operation === "delete" ? "delete" : "upsert";
        const record =
          mutation.operation === "delete"
            ? { id: mutation.id }
            : { id: mutation.id, ...(mutation.record || {}) };

        await searchPlugin.updateIndices({
          resource: mutation.resource,
          records: [record as Record<string, unknown>],
          operation: op,
        });
      } catch (e) {
        console.error("Search index update failed:", e);
      }
    }
  }

  // Store for idempotency
  await idempotencyStore.set(mutation.clientId, mutation.mutationId, result);

  return result;
}
