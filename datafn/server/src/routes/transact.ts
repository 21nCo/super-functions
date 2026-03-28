import type { DatafnSchema, DatafnPlugin } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore } from "../execution/idempotency.js";
import type { SequenceStore } from "../execution/sync/sequence-store.js";
import { getBodyFromContext } from "../http/json.js";
import { okResponse, errorResponse } from "../http/errors.js";
import { executeTransaction } from "../execution/transact.js";
import { buildSchemaIndex, validateMutation, validateQuery } from "../validation/index.js";
import { validateQueryAuthz, validateMutationAuthz, type AuthzOptions } from "../validation/authz.js";
import { logRequest } from "../logging.js";
import type { DatafnLogger } from "../logger.js";

/**
 * Options for transact handler
 */
export interface TransactHandlerOpts {
  allowUnknownResources?: boolean;
  debug?: boolean;
}

/**
 * Create transaction route handler
 */
export function createTransactHandler(
  validatedSchema: DatafnSchema,
  db: Adapter | undefined,
  idempotencyStore: IdempotencyStore | undefined,
  limits: { maxTransactSteps?: number } | undefined,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  sequenceStore: SequenceStore | undefined,
  plugins: DatafnPlugin[] = [],
  handlerOpts?: TransactHandlerOpts,
  logger?: DatafnLogger,
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
        // Support both wrapped format ({ mutation: {...} }) and bare format ({ resource, operation, ... })
        // For transact, only perform structural validation (not operation-name check) so that
        // invalid operations surface as per-step errors rather than route-level rejections.
        let validationResult;
        if (step.mutation) {
            // Wrapped mutation
            validationResult = validateMutation(step.mutation, schemaIndex, `steps[${i}].mutation`);
        } else if (step.query) {
            // Wrapped query
            validationResult = validateQuery(step.query, schemaIndex, `steps[${i}].query`);
        } else if (typeof step.resource === "string" && typeof step.id === "string") {
            // Bare mutation (has id) — validate fully so unknown fields/resources are caught
            // at the route level. Invalid operation *names* are allowed through so they
            // surface as per-step DFQL_UNSUPPORTED rather than a whole-transact rejection.
            if (typeof step.operation === "string") {
              validationResult = validateMutation(step, schemaIndex, `steps[${i}]`);
              // If the only problem is an unsupported operation name, let it through to
              // execution where it returns a per-step error (TV-TRX-002).
              if (
                !validationResult.ok &&
                validationResult.error.code === "DFQL_UNSUPPORTED" &&
                validationResult.error.path.endsWith(".operation")
              ) {
                validationResult = { ok: true, result: undefined as any };
              }
            } else {
              validationResult = validateQuery(step, schemaIndex, `steps[${i}]`);
            }
        } else if (step.resource) {
            // Bare query (has resource but no id)
            validationResult = validateQuery(step, schemaIndex, `steps[${i}]`);
        } else {
            return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid DFQL: step must be a query or mutation",
            details: { path: `steps[${i}]` },
            });
        }

        if (!validationResult.ok) {
            const { code, message, path } = validationResult.error as { code: string; message: string; path: string };
            return errorResponse({
            code: code as any,
            message,
            details: { path },
            });
        }
        }

        // SEC-004: Per-step authz validation (VAL-001: deny-by-default)
        const authzOpts: AuthzOptions = {
          allowUnknownResources: handlerOpts?.allowUnknownResources,
          debug: handlerOpts?.debug,
        };
        for (let i = 0; i < body.steps.length; i++) {
          const step = body.steps[i];

          let authzResult;
          if (step.mutation) {
            authzResult = validateMutationAuthz(
              step.mutation as Record<string, unknown>,
              validatedSchema,
              authzOpts,
            );
          } else if (step.query) {
            authzResult = validateQueryAuthz(
              step.query as Record<string, unknown>,
              validatedSchema,
              authzOpts,
            );
          } else if (typeof step.operation === "string") {
            authzResult = validateMutationAuthz(
              step as Record<string, unknown>,
              validatedSchema,
              authzOpts,
            );
          } else {
            authzResult = validateQueryAuthz(
              step as Record<string, unknown>,
              validatedSchema,
              authzOpts,
            );
          }

          if (!authzResult.ok) {
            return errorResponse({
              code: authzResult.code,
              message: authzResult.message,
              details: { path: `steps[${i}].${authzResult.path}` },
            }, 403);
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

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        // Normalize bare steps to wrapped format before passing to executeTransaction.
        // Bare mutations have `operation` field; bare queries have `resource` but no `operation`.
        const normalizedSteps = body.steps.map((step: any) => {
          if (step.mutation || step.query) return step; // already wrapped
          if (typeof step.operation === "string") return { mutation: step };
          return { query: step };
        });

        const result = await executeTransaction(
        { ...body, steps: normalizedSteps },
        validatedSchema,
        db,
        idempotencyStore,
        limits,
        namespace,
        actorId,
        sequenceStore,
        plugins,
        logger,
        );

        if (!result.ok && result.error) {
            // Top-level error (e.g. limit exceeded if checked inside executor too)
            return errorResponse({
                code: result.error.code,
                message: result.error.message,
                details: result.error.details,
            });
        }

        // Success (200 OK), result contains { ok: true/false, results: [...] }
        return okResponse(result.result);
    } catch (error) {
        logger?.error("Transaction execution failed", { error: String(error), operation: "transact" });
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
        }, logger);
    }
  };
}
