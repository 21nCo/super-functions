/**
 * Sync endpoints: /datafn/clone, /datafn/pull, /datafn/push
 */

import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore } from "../execution/idempotency.js";
import { getBodyFromContext } from "../http/json.js";
import { errorResponse } from "../http/errors.js";
import { executeClone } from "../execution/sync/clone.js";
import { executePull } from "../execution/sync/pull.js";
import { executePush } from "../execution/sync/push.js";
import { runBeforeSync, runAfterSync } from "../plugins/run-hooks.js";
import { logRequest } from "../logging.js";

/**
 * Create clone route handler
 */
export function createCloneHandler(
  validatedSchema: DatafnSchema,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
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

        const result = await executeClone(
        beforeHookResult.payload as any,
        validatedSchema,
        db,
        );

        if (!result.ok) {
        return errorResponse(
            {
            code: result.error!.code as any,
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
        console.error("Clone failed:", error);
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/clone",
            operation: "clone",
            clientId: body?.clientId,
            duration_ms: Date.now() - startTime,
        });
    }
  };
}

/**
 * Create pull route handler
 */
export function createPullHandler(
  validatedSchema: DatafnSchema,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
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
        "pull",
        body,
        hookCtx,
        plugins,
        );
        if (!beforeHookResult.ok) {
        return errorResponse(beforeHookResult.error as any, 400);
        }

        const result = await executePull(
        beforeHookResult.payload as any,
        validatedSchema,
        db,
        );

        if (!result.ok) {
        return errorResponse(
            {
            code: result.error!.code as any,
            message: result.error!.message,
            details: result.error!.details || { path: "$" },
            },
            400,
        );
        }

        // Run afterSync hooks
        await runAfterSync(
        "pull",
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
        console.error("Pull failed:", error);
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/pull",
            operation: "pull",
            clientId: body?.clientId,
            duration_ms: Date.now() - startTime,
        });
    }
  };
}

/**
 * Create push route handler
 */
export function createPushHandler(
  validatedSchema: DatafnSchema,
  db?: Adapter,
  idempotencyStore?: IdempotencyStore,
  plugins: DatafnPlugin[] = [],
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

        // Validate all mutations against schema
        const { buildSchemaIndex, validatePushMutations } = await import("../validation/index.js");
        const schemaIndex = buildSchemaIndex(validatedSchema);
        const validationResult = validatePushMutations(payload.mutations, schemaIndex);
        if (!validationResult.valid) {
        const firstError = validationResult.errors[0];
        return errorResponse(
            {
            code: firstError.code as any,
            message: firstError.message,
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

        const result = await executePush(
        beforeHookResult.payload as any,
        validatedSchema,
        db,
        idempotencyStore,
        );

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

        return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Push failed:", error);
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
    } finally {
        logRequest({
            timestamp: new Date().toISOString(),
            endpoint: "/datafn/push",
            operation: "push",
            clientId: body?.clientId,
            count: body?.mutations?.length,
            duration_ms: Date.now() - startTime,
        });
    }
  };
}
