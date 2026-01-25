/**
 * Push implementation - upload local mutations with change tracking
 */

import type { DatafnSchema } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore, MutationResult } from "../idempotency.js";
import { ChangeTrackingService } from "./change-tracking.js";
import { buildSchemaIndex, validatePushMutations } from "../../validation/index.js";

export interface PushRequest {
  clientId: string;
  mutations: Array<Record<string, unknown>>;
}

export interface PushResult {
  ok: boolean;
  applied: string[]; // mutationIds that were applied
  errors: Array<{
    mutationId: string;
    code: string;
    message: string;
    path: string;
  }>;
}

/**
 * Execute push operation - apply mutations with change tracking
 */
export async function executePush(
  request: PushRequest,
  schema: DatafnSchema,
  db: Adapter,
  idempotencyStore: IdempotencyStore,
): Promise<PushResult> {
  // Validate clientId at request level - this is a critical error
  if (!request.clientId || typeof request.clientId !== "string") {
    // Return error structure that handler will convert to error response
    return {
      ok: false,
      applied: [],
      errors: [
        {
          mutationId: "",
          code: "DFQL_INVALID",
          message: "Invalid DFQL: clientId must be string",
          path: "clientId",
        },
      ],
    };
  }

  // Validate all mutations have matching clientId (SERVER-SYNC-CLIENTID-001)
  for (let i = 0; i < request.mutations.length; i++) {
    const mutation = request.mutations[i] as any;
    if (mutation.clientId && mutation.clientId !== request.clientId) {
      return {
        ok: false,
        applied: [],
        errors: [
          {
            mutationId: mutation.mutationId || "",
            code: "DFQL_INVALID",
            message: `Invalid DFQL: push.mutations[${i}].clientId must equal request.clientId`,
            path: `mutations[${i}].clientId`,
          },
        ],
      };
    }
  }

  // Schema-bounded validation of all mutations before execution
  const schemaIndex = buildSchemaIndex(schema);
  const validationResult = validatePushMutations(request.mutations, schemaIndex);
  if (!validationResult.valid) {
    return {
      ok: false,
      applied: [],
      errors: validationResult.errors.map((err) => ({
        mutationId: "",
        code: err.code,
        message: err.message,
        path: err.path,
      })),
    };
  }

  const applied: string[] = [];
  const errors: Array<{
    mutationId: string;
    code: string;
    message: string;
    path: string;
  }> = [];

  // Create change tracking service
  const changeTracking = new ChangeTrackingService(db);

  // Process each mutation
  for (const mutation of request.mutations) {
    const mut = mutation as any;

    // Validate required fields
    if (!mut.clientId || !mut.mutationId) {
      errors.push({
        mutationId: mut.mutationId || "",
        code: "DFQL_INVALID",
        message: "Invalid DFQL: missing clientId or mutationId",
        path: "$",
      });
      continue;
    }

    // Check idempotency
    const cached = await idempotencyStore.get(mut.clientId, mut.mutationId);
    if (cached) {
      // Already applied
      if (cached.ok) {
        applied.push(mut.mutationId);
      } else {
        // Return cached error
        if (cached.errors && cached.errors.length > 0) {
          errors.push({
            mutationId: mut.mutationId,
            code: cached.errors[0].code,
            message: cached.errors[0].message,
            path: cached.errors[0].path || "$",
          });
        }
      }
      continue;
    }

    // Execute operation using Adapter
    let opResult:
      | { ok: true }
      | { ok: false; code: string; message: string; path: string };

    try {
      switch (mut.operation) {
        case "insert":
          await db.create({
            model: mut.resource,
            data: {
              id: mut.id,
              ...(mut.record || {}),
            },
            namespace: "datafn",
          });
          opResult = { ok: true };
          break;

        case "merge":
        case "replace":
          // Use upsert semantics: first check if record exists
          try {
            const existing = await db.findOne({
              model: mut.resource,
              where: [{ field: "id", operator: "eq", value: mut.id }],
              namespace: "datafn",
            });

            if (existing) {
              // Record exists, update it
              await db.update({
                model: mut.resource,
                where: [{ field: "id", operator: "eq", value: mut.id }],
                data: mut.record || {},
                namespace: "datafn",
              });
            } else {
              // Record doesn't exist, create it
              await db.create({
                model: mut.resource,
                data: {
                  id: mut.id,
                  ...(mut.record || {}),
                },
                namespace: "datafn",
              });
            }
            opResult = { ok: true };
          } catch (innerError) {
            opResult = {
              ok: false,
              code: "INTERNAL",
              message: "Internal error",
              path: "$",
            };
          }
          break;

        case "delete":
          await db.delete({
            model: mut.resource,
            where: [{ field: "id", operator: "eq", value: mut.id }],
            namespace: "datafn",
          });
          opResult = { ok: true };
          break;

        default:
          opResult = {
            ok: false,
            code: "DFQL_UNSUPPORTED",
            message: `Unsupported DFQL feature: mutation.operation.${mut.operation}`,
            path: "operation",
          };
      }
    } catch (error) {
      opResult = {
        ok: false,
        code: "INTERNAL",
        message: "Internal error",
        path: "$",
      };
    }

    // Store result and update lists
    if (opResult.ok) {
      applied.push(mut.mutationId);

      // Record change tracking
      try {
        const serverSeq = await changeTracking.getNextServerSeq();
        await changeTracking.recordChange({
          serverSeq,
          resource: mut.resource,
          id: mut.id,
          op: mut.operation === "delete" ? "delete" : "upsert",
          record:
            mut.operation === "delete"
              ? null
              : { id: mut.id, ...(mut.record || {}) },
        });
      } catch (error) {
        console.error("Change tracking failed in push:", error);
      }

      const result: MutationResult = {
        ok: true,
        mutationId: mut.mutationId,
        affectedIds: [mut.id],
        errors: [],
        deduped: false,
      };
      await idempotencyStore.set(mut.clientId, mut.mutationId, result);
    } else {
      errors.push({
        mutationId: mut.mutationId,
        code: opResult.code,
        message: opResult.message,
        path: opResult.path,
      });
      const result: MutationResult = {
        ok: false,
        mutationId: mut.mutationId,
        affectedIds: [],
        errors: [{ ...opResult, retryable: false }],
        deduped: false,
      };
      await idempotencyStore.set(mut.clientId, mut.mutationId, result);
    }
  }

  return {
    ok: true,
    applied,
    errors,
  };
}
