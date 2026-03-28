/**
 * Sync endpoints: /datafn/clone, /datafn/pull, /datafn/push
 */

import type { DatafnSchema, DatafnPlugin } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore } from "../execution/idempotency.js";
import type { SequenceStore } from "../execution/sync/sequence-store.js";
import { getBodyFromContext } from "../http/json.js";
import { errorResponse } from "../http/errors.js";
import { executeClone } from "../execution/sync/clone.js";
import { executePull } from "../execution/sync/pull.js";
import { executePush } from "../execution/sync/push.js";
import { executeReconcile } from "../execution/sync/reconcile.js";
import { runBeforeSync, runAfterSync } from "../plugins/run-hooks.js";
import { logRequest } from "../logging.js";
import type { DatafnLogger } from "../logger.js";
import { ExecutionTimer, type TimingEmitter } from "../middleware/timing.js";
import { buildSchemaIndex, validatePushMutations } from "../validation/index.js";
import { validateMutationAuthz } from "../validation/authz.js";
import type { MutationValidationOpts } from "../validation/mutation.js";
import { resolveCapabilities } from "@datafn/core";
import { stripReadonlyCapabilityFields } from "../execution/mutation/execute.js";

/**
 * Options for push handler (VAL-001, VAL-006–009)
 */
export interface PushHandlerOpts extends MutationValidationOpts {
  allowUnknownResources?: boolean;
  /** FIX-SEC-006: Max batch size for push mutations (default 500) */
  maxBatchSize?: number;
}

/**
 * Create clone route handler
 */
export function createCloneHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
  sequenceStore?: SequenceStore,
  logger?: DatafnLogger,
) {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;
    
    try {
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
        return errorResponse(parseResult.error, 400);
        }
        body = parseResult.data;

        if (!db) {
        return errorResponse(
            {
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
            },
            500,
        );
        }

        // Run beforeSync hooks
        const hookCtx = { plugins, schema: validatedSchema };
        const beforeHookResult = await runBeforeSync(
        "clone",
        body,
        hookCtx,
        plugins,
        );
        if (!beforeHookResult.ok) {
        return errorResponse(beforeHookResult.error as any, 400);
        }

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        const result = await executeClone(
        {
          ...(beforeHookResult.payload as any),
          ...(actorId !== undefined ? { actorId } : {}),
        },
        validatedSchema,
        db,
        namespace,
        sequenceStore,
        undefined,
        logger,
        );

        if (!result.ok) {
        return errorResponse(
            {
            code: result.error!.code,
            message: result.error!.message,
            details: result.error!.details || { path: "$" },
            },
            400,
        );
        }

        // Run afterSync hooks
        await runAfterSync(
        "clone",
        beforeHookResult.payload,
        result.data,
        hookCtx,
        plugins,
        );

        return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        logger?.error("Clone failed", { error: String(error), operation: "clone" });
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        }, 500);
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/clone",
            operation: "clone",
            clientId: body?.clientId,
            duration_ms: Date.now() - startTime,
        }, logger);
    }
  };
}

/**
 * Create pull route handler
 */
export function createPullHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
  sequenceStore?: SequenceStore,
  maxPullLimit?: number,
  timingEmitter?: TimingEmitter | null,
  logger?: DatafnLogger,
) {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;
    const timer = timingEmitter ? new ExecutionTimer() : null;

    try {
        timer?.startPhase("validate");
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
        return errorResponse(parseResult.error, 400);
        }
        body = parseResult.data;

        if (!db) {
        return errorResponse(
            {
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
            },
            500,
        );
        }

        // Run beforeSync hooks
        const hookCtx = { plugins, schema: validatedSchema };
        const beforeHookResult = await runBeforeSync(
        "pull",
        body,
        hookCtx,
        plugins,
        );
        if (!beforeHookResult.ok) {
        return errorResponse(beforeHookResult.error as any, 400);
        }

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        timer?.startPhase("fetchChanges");
        const result = await executePull(
        {
          ...(beforeHookResult.payload as any),
          ...(actorId !== undefined ? { actorId } : {}),
        },
        validatedSchema,
        db,
        namespace,
        sequenceStore,
        maxPullLimit,
        );

        timer?.startPhase("buildResult");
        // Always return result (even if result.ok is false)
        // Pull errors are returned wrapped in a successful HTTP response

        // Run afterSync hooks
        await runAfterSync(
        "pull",
        beforeHookResult.payload,
        result,
        hookCtx,
        plugins,
        );

        if (timingEmitter && timer) {
          timingEmitter(timer.build("/datafn/pull", undefined, "pull"));
        }

        return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        logger?.error("Pull failed", { error: String(error), operation: "pull" });
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        }, 500);
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/pull",
            operation: "pull",
            clientId: body?.clientId,
            duration_ms: Date.now() - startTime,
        }, logger);
    }
  };
}

/**
 * Create push route handler
 */
export function createPushHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  idempotencyStore?: IdempotencyStore,
  plugins: DatafnPlugin[] = [],
  sequenceStore?: SequenceStore,
  onChange?: (seq: number, namespace: string) => void,
  timingEmitter?: TimingEmitter | null,
  handlerOpts?: PushHandlerOpts,
  logger?: DatafnLogger,
) {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;
    const timer = timingEmitter ? new ExecutionTimer() : null;

    try {
        timer?.startPhase("validate");
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
        return errorResponse(parseResult.error, 400);
        }
        body = parseResult.data;

        // Run beforeSync hooks
        const hookCtx = { plugins, schema: validatedSchema };
        const beforeHookResult = await runBeforeSync(
        "push",
        body,
        hookCtx,
        plugins,
        );
        if (!beforeHookResult.ok) {
        return errorResponse(beforeHookResult.error as any, 400);
        }

        // PHASE_01: Validate push request BEFORE checking execution requirements
        // Validate clientId at request level
        const payload = beforeHookResult.payload as any;
        if (!payload.clientId || typeof payload.clientId !== "string") {
        return errorResponse(
            {
            code: "DFQL_INVALID",
            message: "Invalid DFQL: clientId must be string",
            details: { path: "clientId" },
            },
            400,
        );
        }

        // Validate mutations array exists
        if (!Array.isArray(payload.mutations)) {
        return errorResponse(
            {
            code: "DFQL_INVALID",
            message: "Invalid DFQL: mutations must be array",
            details: { path: "mutations" },
            },
            400,
        );
        }

        // FIX-SEC-006: Enforce configurable batch size limit
        const maxBatchSize = handlerOpts?.maxBatchSize ?? 500;
        if (payload.mutations.length > maxBatchSize) {
          return errorResponse(
            {
              code: "DFQL_INVALID",
              message: `Batch size ${payload.mutations.length} exceeds limit ${maxBatchSize}`,
              details: { path: "mutations" },
            },
            400,
          );
        }

        const transformedMutationsForValidation = payload.mutations.map(
          (mutation: unknown) => {
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
          },
        );

        // Validate all mutations against schema
        const schemaIndex = buildSchemaIndex(validatedSchema);
        const validationResult = validatePushMutations(transformedMutationsForValidation, schemaIndex, {
          maxIdLength: handlerOpts?.maxIdLength,
          debug: handlerOpts?.debug,
        });
        if (!validationResult.valid) {
          const firstError = validationResult.errors[0];
          // VAL-009: In production (debug: false), strip field/schema details from messages
          const debug = handlerOpts?.debug ?? true;
          const message = debug ? firstError.message : "Validation error";
          return errorResponse(
            {
              code: firstError.code as any,
              message,
              details: { path: firstError.path },
            },
            400,
          );
        }

        // After validation, check execution requirements
        if (!db || !idempotencyStore) {
        return errorResponse(
            {
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
            },
            500,
        );
        }

        // PHASE_11: Enforce write permissions for each mutation in push (VAL-001: deny-by-default)
        const pushPayload = beforeHookResult.payload as any;
        if (pushPayload.mutations && Array.isArray(pushPayload.mutations)) {
          for (let i = 0; i < pushPayload.mutations.length; i++) {
            const mut = pushPayload.mutations[i];
            const authzResult = validateMutationAuthz(mut, validatedSchema, {
              allowUnknownResources: handlerOpts?.allowUnknownResources,
              debug: handlerOpts?.debug,
            });
            if (!authzResult.ok) {
              return errorResponse({
                code: authzResult.code,
                message: authzResult.message,
                details: { path: `mutations[${i}].${authzResult.path}` },
              }, 403);
            }
          }
        }

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        timer?.startPhase("execute");
        const result = await executePush(
        beforeHookResult.payload as any,
        validatedSchema,
        db,
        idempotencyStore,
        namespace,
        sequenceStore,
        onChange,
        actorId,
        logger,
        );

        timer?.startPhase("changeLog");
        // If validation failed at the request level, return error response
        if (!result.ok && result.errors.length > 0) {
        return errorResponse(
            {
            code: result.errors[0].code as any,
            message: result.errors[0].message,
            details: { path: result.errors[0].path },
            },
            400,
        );
        }

        // Run afterSync hooks
        await runAfterSync(
        "push",
        beforeHookResult.payload,
        result,
        hookCtx,
        plugins,
        );

        if (timingEmitter && timer) {
          timingEmitter(timer.build("/datafn/push", undefined, "push"));
        }

        return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        logger?.error("Push failed", { error: String(error), operation: "push" });
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        }, 500);
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/push",
            operation: "push",
            clientId: body?.clientId,
            count: body?.mutations?.length,
            duration_ms: Date.now() - startTime,
        }, logger);
    }
  };
}

/**
 * Create reconcile route handler
 */
export function createReconcileHandler(
  validatedSchema: DatafnSchema,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
  sequenceStore?: SequenceStore,
  logger?: DatafnLogger,
) {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    const startTime = Date.now();
    let body: any;

    try {
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
        return errorResponse(parseResult.error, 400);
        }
        body = parseResult.data;

        if (!db) {
        return errorResponse(
            {
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
            },
            500,
        );
        }

        // Run beforeSync hooks
        const hookCtx = { plugins, schema: validatedSchema };
        const beforeHookResult = await runBeforeSync(
        "reconcile",
        body,
        hookCtx,
        plugins,
        );
        if (!beforeHookResult.ok) {
        return errorResponse(beforeHookResult.error as any, 400);
        }

        // Extract namespace from context
        const namespace = await extractNamespace(ctx);
        const actorId = extractActorId ? await extractActorId(ctx) : undefined;

        const result = await executeReconcile(
        {
          ...(beforeHookResult.payload as any),
          ...(actorId !== undefined ? { actorId } : {}),
        },
        validatedSchema,
        db,
        namespace,
        sequenceStore,
        logger,
        );

        if (!result.ok) {
        return errorResponse(
            {
            code: result.error!.code,
            message: result.error!.message,
            details: result.error!.details || { path: "$" },
            },
            400,
        );
        }

        // Run afterSync hooks
        await runAfterSync(
        "reconcile",
        beforeHookResult.payload,
        result,
        hookCtx,
        plugins,
        );

        return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        logger?.error("Reconcile failed", { error: String(error), operation: "reconcile" });
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        }, 500);
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/reconcile",
            operation: "reconcile",
            clientId: body?.clientId,
            duration_ms: Date.now() - startTime,
        }, logger);
    }
  };
}
