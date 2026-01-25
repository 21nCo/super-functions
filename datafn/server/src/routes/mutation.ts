/**
 * POST /datafn/mutation endpoint
 * Executes DFQL mutations with idempotency and guards
 */

import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type {
  IdempotencyStore,
  MutationResult,
} from "../execution/idempotency.js";
import type { DFQLMutation } from "../execution/mutation/dfql.js";
import { getBodyFromContext } from "../http/json.js";
import { okResponse, errorResponse } from "../http/errors.js";
import { ChangeTrackingService } from "../execution/sync/change-tracking.js";
import { runBeforeMutation, runAfterMutation } from "../plugins/run-hooks.js";
import { executeMutation } from "../execution/mutation/execute.js";
import { buildSchemaIndex, validateMutationBody } from "../validation/index.js";
import { logRequest, redactSensitiveFields } from "../logging.js";

/**
 * Create mutation route handler
 */
export function createMutationHandler(
  validatedSchema: DatafnSchema,
  db?: Adapter, // Use Adapter instead of MemoryStore
  idempotencyStore?: IdempotencyStore,
  plugins: DatafnPlugin[] = [],
) {
  // Build schema index once for efficient validation
  const schemaIndex = buildSchemaIndex(validatedSchema);

  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;

    try {
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
        return errorResponse(parseResult.error);
        }
        body = parseResult.data;

        // Run beforeMutation hooks
        const hookCtx = { plugins, schema: validatedSchema };
        const beforeHookResult = await runBeforeMutation(body, hookCtx, plugins);
        if (!beforeHookResult.ok) {
        // Return as error envelope (fail-closed)
        return errorResponse({
            code: beforeHookResult.error.code as any,
            message: beforeHookResult.error.message,
            details: beforeHookResult.error.details || { path: "$" },
        });
        }
        // Use potentially transformed mutation from hooks
        const transformedBody = beforeHookResult.mutation;

        // PHASE_01: Validate mutations against schema BEFORE checking execution requirements
        const validationResult = validateMutationBody(transformedBody, schemaIndex);
        if (!validationResult.ok) {
        return errorResponse({
            code: validationResult.error.code,
            message: validationResult.error.message,
            details: { path: validationResult.error.path },
        });
        }

        const { isBatch, mutations: transformedMutations } = validationResult.value;

        // After validation, check execution requirements
        if (!db || !idempotencyStore) {
        // Phase 07: mutations require DB adapter and idempotency
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
        });
        }

        // Create change tracking service
        const changeTracking = new ChangeTrackingService(db);

        // Process each mutation
        const results: MutationResult[] = [];

        for (const mut of transformedMutations) {
        const result = await executeMutation(
            mut as DFQLMutation,
            validatedSchema,
            db,
            idempotencyStore,
            changeTracking,
            plugins,
        );
        results.push(result);
        }

        const finalResult = isBatch ? results : results[0];

        // Run afterMutation hooks
        await runAfterMutation(transformedBody, finalResult, hookCtx, plugins);

        // If single mutation failed with specific error, return top-level error (EXEC-002)
        if (
        !isBatch &&
        !Array.isArray(finalResult) &&
        !finalResult.ok &&
        finalResult.errors.length > 0
        ) {
        const error = finalResult.errors[0];
        if (
            error.code === "CONFLICT" ||
            error.code === "NOT_FOUND" ||
            error.code === "DFQL_INVALID"
        ) {
            let status = 400;
            if (error.code === "CONFLICT") status = 409;
            if (error.code === "NOT_FOUND") status = 404;

            return errorResponse(
            {
                code: error.code as any,
                message: error.message,
                details: { path: error.path },
            },
            status,
            );
        }
        }

        return okResponse(finalResult);
    } catch (error) {
        console.error("Mutation execution failed:", error);
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
    } finally {
        // Log request metadata
        if (body && typeof body === "object" && !Array.isArray(body)) {
            // Single mutation
            const m = body as any;
            let record = m.record;
            if (record && m.resource) {
                record = redactSensitiveFields(record, m.resource, validatedSchema);
            }
            
            logRequest({
                timestamp: new Date().toISOString(),
                endpoint: "/datafn/mutation",
                clientId: m.clientId,
                mutationId: m.mutationId,
                resource: m.resource,
                operation: m.operation,
                duration_ms: Date.now() - startTime,
                record,
            });
        } else if (Array.isArray(body)) {
            // Batch
            logRequest({
                timestamp: new Date().toISOString(),
                endpoint: "/datafn/mutation",
                operation: "batch",
                count: body.length,
                duration_ms: Date.now() - startTime,
            });
        }
    }
  };
}

/**
 * Execute a single mutation
 */
