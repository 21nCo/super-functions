/**
 * POST /datafn/mutation endpoint
 * Executes DFQL mutations with idempotency and guards
 */

import type { DatafnSchema, DatafnPlugin } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import { resolveCapabilities } from "@datafn/core";
import type {
  IdempotencyStore,
  MutationResult,
} from "../execution/idempotency.js";
import type { DFQLMutation } from "../execution/mutation/dfql.js";
import type { SequenceStore } from "../execution/sync/sequence-store.js";
import { getBodyFromContext } from "../http/json.js";
import { okResponse, errorResponse } from "../http/errors.js";
import { ChangeTrackingService } from "../execution/sync/change-tracking.js";
import { runBeforeMutation, runAfterMutation } from "../plugins/run-hooks.js";
import {
  executeMutation,
  stripReadonlyCapabilityFields,
} from "../execution/mutation/execute.js";
import { buildSchemaIndex, validateMutationBody } from "../validation/index.js";
import { logRequest, redactSensitiveFields } from "../logging.js";
import type { DatafnLogger } from "../logger.js";
import type { SearchProvider } from "../search-provider.js";
import { ExecutionTimer, type TimingEmitter } from "../middleware/timing.js";
import type { MutationValidationOpts } from "../validation/mutation.js";
import { validateMutationAuthz, type AuthzOptions } from "../validation/authz.js";

/**
 * Options for mutation handler (VAL-001, VAL-006–009)
 */
export interface MutationHandlerOpts extends MutationValidationOpts {
  allowUnknownResources?: boolean;
  /** FIX-SEC-006: Max batch size for mutation array bodies (default 500) */
  maxBatchSize?: number;
}

/**
 * Create mutation route handler
 */
export function createMutationHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId?: (ctx: any) => Promise<string | undefined>,
  db?: Adapter, // Use Adapter instead of MemoryStore
  idempotencyStore?: IdempotencyStore,
  plugins: DatafnPlugin[] = [],
  sequenceStore?: SequenceStore,
  timingEmitter?: TimingEmitter | null,
  handlerOpts?: MutationHandlerOpts,
  logger?: DatafnLogger,
  searchProvider?: SearchProvider,
) {
  // Build schema index once for efficient validation
  const schemaIndex = buildSchemaIndex(validatedSchema);

  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;
    const timer = timingEmitter ? new ExecutionTimer() : null;

    try {
        timer?.startPhase("validate");
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
        const transformedMutationsForValidation = (
          Array.isArray(transformedBody) ? transformedBody : [transformedBody]
        ).map((mutation) => {
          if (
            typeof mutation !== "object" ||
            mutation === null ||
            Array.isArray(mutation)
          ) {
            return mutation;
          }

          const candidate = mutation as Record<string, unknown>;
          const operation = candidate.operation;
          if (
            operation !== "insert" &&
            operation !== "merge" &&
            operation !== "replace"
          ) {
            return mutation;
          }

          const record = candidate.record;
          if (
            typeof record !== "object" ||
            record === null ||
            Array.isArray(record)
          ) {
            return mutation;
          }

          const resourceName = String(candidate.resource ?? "");
          const resource = validatedSchema.resources.find(
            (r) => r.name === resourceName,
          );
          if (!resource) return mutation;

          const resolvedCapabilities = resolveCapabilities(
            validatedSchema.capabilities as any,
            resource.capabilities as any,
          );
          return {
            ...candidate,
            record: stripReadonlyCapabilityFields(
              record as Record<string, unknown>,
              resolvedCapabilities,
            ),
          };
        });
        const normalizedTransformedBody = Array.isArray(transformedBody)
          ? transformedMutationsForValidation
          : transformedMutationsForValidation[0];

        // PHASE_01: Validate mutations against schema BEFORE checking execution requirements
        const validationResult = validateMutationBody(normalizedTransformedBody, schemaIndex, {
          maxIdLength: handlerOpts?.maxIdLength,
          debug: handlerOpts?.debug,
        });
        if (!validationResult.ok) {
          // VAL-009: In production (debug: false), strip field/schema details from messages
          const debug = handlerOpts?.debug ?? true;
          const message = debug ? validationResult.error.message : "Validation error";
          return errorResponse({
            code: validationResult.error.code,
            message,
            details: { path: validationResult.error.path },
          });
        }

        const { isBatch, mutations: transformedMutations } = validationResult.result;

        // FIX-SEC-006: Enforce configurable batch size limit on array bodies
        if (isBatch) {
          const maxBatchSize = handlerOpts?.maxBatchSize ?? 500;
          if (transformedMutations.length > maxBatchSize) {
            return errorResponse({
              code: "DFQL_INVALID",
              message: `Batch size ${transformedMutations.length} exceeds limit ${maxBatchSize}`,
              details: { path: "$" },
            }, 400);
          }
        }

        // PHASE_11: Enforce write permissions for each mutation (VAL-001: deny-by-default)
        for (let i = 0; i < transformedMutations.length; i++) {
          const mut = transformedMutations[i] as Record<string, unknown>;
          const authzResult = validateMutationAuthz(mut, validatedSchema, {
            allowUnknownResources: handlerOpts?.allowUnknownResources,
            debug: handlerOpts?.debug,
          });
          if (!authzResult.ok) {
            return errorResponse({
              code: authzResult.code,
              message: authzResult.message,
              details: { path: isBatch ? `[${i}].${authzResult.path}` : authzResult.path },
            }, 403);
          }
        }

        // After validation, check execution requirements
        if (!db || !idempotencyStore) {
        // Phase 07: mutations require DB adapter and idempotency
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
        });
        }

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        // Create change tracking service with user/tenant namespace and optional sequence store
        const changeTracking = new ChangeTrackingService(db, namespace, sequenceStore);

        // Process each mutation
        timer?.startPhase("guard");
        const results: MutationResult[] = [];

        timer?.startPhase("execute");
        for (const mut of transformedMutations) {
        const result = await executeMutation(
            mut as unknown as DFQLMutation,
            validatedSchema,
            db,
            idempotencyStore,
            changeTracking,
            plugins,
            namespace,
            actorId,
            logger,
            searchProvider,
        );
        results.push(result);
        }

        timer?.startPhase("changeLog");
        timer?.startPhase("idempotency");
        const finalResult = isBatch ? results : results[0];

        // Run afterMutation hooks
        await runAfterMutation(transformedBody, finalResult, hookCtx, plugins);

        if (timingEmitter && timer) {
          const m = body as any;
          timingEmitter(timer.build("/datafn/mutation", m?.resource, m?.operation));
        }

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
        logger?.error("Mutation execution failed", { error: String(error), operation: "mutation" });
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
            // SRV-004: Do not include mutation record data in logs (privacy/security)
            logRequest({
                timestamp: new Date().toISOString(),
                endpoint: "/datafn/mutation",
                clientId: m.clientId,
                mutationId: m.mutationId,
                resource: m.resource,
                operation: m.operation,
                duration_ms: Date.now() - startTime,
            }, logger);
        } else if (Array.isArray(body)) {
            // Batch
            logRequest({
                timestamp: new Date().toISOString(),
                endpoint: "/datafn/mutation",
                operation: "batch",
                count: body.length,
                duration_ms: Date.now() - startTime,
            }, logger);
        }
    }
  };
}

/**
 * Execute a single mutation
 */
