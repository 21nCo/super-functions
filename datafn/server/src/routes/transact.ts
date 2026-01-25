import type { DatafnSchema } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore } from "../execution/idempotency.js";
import { getBodyFromContext } from "../http/json.js";
import { okResponse, errorResponse } from "../http/errors.js";
import { executeTransaction } from "../execution/transact.js";
import { buildSchemaIndex, validateMutation, validateQuery } from "../validation/index.js";
import { logRequest } from "../logging.js";

/**
 * Create transaction route handler
 */
export function createTransactHandler(
  validatedSchema: DatafnSchema,
  db?: Adapter, // Use Adapter instead of MemoryStore
  idempotencyStore?: IdempotencyStore,
  limits?: { maxTransactSteps?: number },
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
        body = parseResult.data as any;

        // PHASE_01: Validate body structure and schema compliance BEFORE checking execution requirements
        if (!body || !Array.isArray(body.steps)) {
        return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid DFQL: expected 'steps' array",
            details: { path: "steps" },
        });
        }

        // Validate step limits
        const maxSteps = limits?.maxTransactSteps ?? 100;
        if (body.steps.length > maxSteps) {
        return errorResponse({
            code: "LIMIT_EXCEEDED",
            message: "Transaction exceeds maximum steps",
            details: { path: "steps", max: maxSteps },
        });
        }

        // Validate each step against schema
        for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        
        if (typeof step !== "object" || step === null) {
            return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid DFQL: step must be object",
            details: { path: `steps[${i}]` },
            });
        }

        // Determine step type (query or mutation)
        if (step.mutation) {
            // It's a mutation
            const mutationResult = validateMutation(step.mutation, schemaIndex, `steps[${i}].mutation`);
            if (!mutationResult.ok) {
            return errorResponse({
                code: mutationResult.error.code,
                message: mutationResult.error.message,
                details: { path: mutationResult.error.path },
            });
            }
        } else if (step.query) {
            // It's a query
            const queryResult = validateQuery(step.query, schemaIndex, `steps[${i}].query`);
            if (!queryResult.ok) {
            return errorResponse({
                code: queryResult.error.code,
                message: queryResult.error.message,
                details: { path: queryResult.error.path },
            });
            }
        } else {
            return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid DFQL: step must have 'query' or 'mutation' key",
            details: { path: `steps[${i}]` },
            });
        }
        }

        // After validation, check execution requirements
        if (!db || !idempotencyStore) {
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
        });
        }

        const result = await executeTransaction(
        body,
        validatedSchema,
        db,
        idempotencyStore,
        limits,
        );

        if (!result.ok && result.error) {
            // Top-level error (e.g. limit exceeded if checked inside executor too)
            return errorResponse({
                code: result.error.code as any,
                message: result.error.message,
                details: result.error.details,
            });
        }

        // Success (200 OK), result contains { ok: true/false, results: [...] }
        return okResponse(result.result);
    } catch (error) {
        console.error("Transaction execution failed:", error);
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/transact",
            operation: "transact",
            steps: body?.steps?.length,
            duration_ms: Date.now() - startTime,
        });
    }
  };
}
