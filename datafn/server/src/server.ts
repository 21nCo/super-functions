/**
 * DataFn Server Factory
 * Creates a Router with datafn endpoints
 */

import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import { validateSchema } from "@datafn/core";
import { createRouter, type Router, type Route } from "@superfunctions/http";
import type { Adapter } from "@superfunctions/db";
import { createStatusHandler } from "./routes/status.js";
import { createQueryHandler } from "./routes/query.js";
import { createMutationHandler } from "./routes/mutation.js";
import { createTransactHandler } from "./routes/transact.js";
import {
  createCloneHandler,
  createPullHandler,
  createPushHandler,
} from "./routes/sync.js";
import { createSeedHandler } from "./routes/seed.js";
import { DbIdempotencyStore } from "./execution/idempotency-db.js";
import { errorResponse, errorToEnvelope } from "./http/errors.js";
import { createRestRoutes } from "./routes/rest.js";
import { enforcePayloadLimit } from "./http/middleware.js";

/**
 * Server configuration
 */
export interface DatafnServerConfig<TContext = any> {
  /** DataFn schema (will be validated at startup) */
  schema: DatafnSchema;

  /** Database adapter (required for persistence) */
  db?: Adapter;

  /** Optional plugins */
  plugins?: DatafnPlugin[];

  /** Optional authorization callback */
  authorize?: (
    ctx: TContext,
    action:
      | "status"
      | "query"
      | "mutation"
      | "transact"
      | "seed"
      | "clone"
      | "pull"
      | "push",
    payload: unknown,
  ) => Promise<boolean> | boolean;

  /** Optional limits configuration */
  limits?: {
    maxLimit?: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
  };

  /** Optional server time provider (for testing) */
  getServerTime?: () => number;
}

/**
 * Server instance
 */
export interface DatafnServer<TContext = any> {
  router: Router<TContext>;
}

/**
 * Create a DataFn server
 */
export async function createDatafnServer<TContext = any>(
  config: DatafnServerConfig<TContext>,
): Promise<DatafnServer<TContext>> {
  // Validate schema at startup
  const schemaValidation = validateSchema(config.schema);
  if (!schemaValidation.ok) {
    throw new Error(
      `Schema validation failed: ${schemaValidation.error.message}`,
    );
  }

  const validatedSchema = schemaValidation.result;

  // Initialize database adapter if provided and implements Adapter interface
  if (
    config.db &&
    typeof config.db === "object" &&
    "initialize" in config.db &&
    typeof config.db.initialize === "function"
  ) {
    await config.db.initialize();
  }

  // Compute limits with defaults
  const limits = {
    maxLimit: config.limits?.maxLimit ?? 100,
    maxTransactSteps: config.limits?.maxTransactSteps,
    maxPayloadBytes: config.limits?.maxPayloadBytes,
  };

  // Create route handlers
  const statusHandler = createStatusHandler(
    validatedSchema,
    limits,
    config.getServerTime,
    config.db,
  );

  const queryHandler = createQueryHandler(
    validatedSchema,
    limits.maxLimit,
    config.db, // Pass adapter (not MemoryStore)
    config.plugins || [],
  );

  // Create mutation handler and idempotency store
  const idempotencyStore = config.db
    ? new DbIdempotencyStore(config.db)
    : undefined;

  const mutationHandler = createMutationHandler(
    validatedSchema,
    config.db, // Pass adapter
    idempotencyStore,
    config.plugins || [], // Pass plugins
  );

  const transactHandler = createTransactHandler(
    validatedSchema,
    config.db, // Pass adapter
    idempotencyStore,
    limits,
  );

  const cloneHandler = createCloneHandler(
    validatedSchema,
    config.db,
    config.plugins || [],
  );
  const pullHandler = createPullHandler(
    validatedSchema,
    config.db,
    config.plugins || [],
  );
  const pushHandler = createPushHandler(
    validatedSchema,
    config.db,
    idempotencyStore,
    config.plugins || [],
  );
  const seedHandler = createSeedHandler(config.db);

  // Authorization wrapper
  // AUTH-001: Parse JSON BEFORE authorization. Invalid JSON returns DFQL_INVALID, not FORBIDDEN.
  const withAuth = (
    action:
      | "status"
      | "query"
      | "mutation"
      | "transact"
      | "seed"
      | "clone"
      | "pull"
      | "push",
    handler: (
      req: Request,
      ctx: TContext & { parsedBody?: unknown },
    ) => Promise<Response> | Response,
  ) => {
    return async (req: Request, ctx: TContext & { parsedBody?: unknown }): Promise<Response> => {
      // Enforce payload limits (LIMIT-001)
      if (limits.maxPayloadBytes) {
        const limiter = enforcePayloadLimit(limits.maxPayloadBytes);
        const limitRes = await limiter(req, async () => new Response("OK")); // Dummy next
        // Middleware logic in enforcePayloadLimit calls next() if ok.
        // If it returns a Response (error), we stop.
        // But my middleware implementation: `return next()`.
        // If I pass dummy next that returns generic Response, I can check if it matches.
        // Or better: refactor middleware to return validation result or check directly here.
        // enforcePayloadLimit returns a handler `(req, next) => Res`.
        // We can invoke it. If it returns the result of next(), we proceed.
        // Since `next` returns Promise<Response>, we can use a sentinel.
        
        // Simpler: Just verify inline or use the helper properly.
        // Helper:
        /*
        return async (req, next) => {
            // check
            if (bad) return error;
            return next();
        }
        */
        const nextSentinel = new Response("__NEXT__");
        const res = await limiter(req, async () => nextSentinel);
        if (res !== nextSentinel) {
            return res; // Error response
        }
      }

      // For POST/PUT/PATCH endpoints, parse JSON body FIRST before authorization
      // AUTH-001: Invalid JSON must return DFQL_INVALID, never FORBIDDEN
      let payload: unknown = null;

      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        const { parseJsonBody } = await import("./http/json.js");
        const parseResult = await parseJsonBody(req);

        if (!parseResult.ok) {
          // JSON parsing failed - return DFQL_INVALID immediately WITHOUT calling authorize
          return errorResponse(parseResult.error, 400);
        }

        // Parsing succeeded - use parsed data
        payload = parseResult.data;
        // Store parsed body in context so handler doesn't need to re-parse
        ctx.parsedBody = payload;
      }

      // For GET endpoints (like /datafn/status), payload remains null
      // This is correct per AUTH-001: GET /datafn/status calls authorize with null

      // Check authorization if configured - only called AFTER successful JSON parse
      if (config.authorize) {
        const authorized = await config.authorize(ctx, action, payload);
        if (!authorized) {
          return errorResponse(
            { code: "FORBIDDEN", message: "Authorization denied", details: { path: "$" } },
            403,
          );
        }
      }

      return handler(req, ctx);
    };
  };

  // Define routes
  const routes: Route<TContext>[] = [
    {
      method: "GET",
      path: "/datafn/status",
      handler: withAuth("status" as any, statusHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/query",
      handler: withAuth("query", queryHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/mutation",
      handler: withAuth("mutation", mutationHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/transact",
      handler: withAuth("transact", transactHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/clone",
      handler: withAuth("clone", cloneHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/pull",
      handler: withAuth("pull", pullHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/push",
      handler: withAuth("push", pushHandler) as any,
    },
    {
      method: "POST",
      path: "/datafn/seed",
      handler: withAuth("seed", seedHandler) as any,
    },
  ];

  // Register REST routes if config.rest is true (assuming config prop exists or we infer)
  // The interface DatafnServerConfig needs update to include `rest?: boolean`.
  if ((config as any).rest) {
    const restRoutes = createRestRoutes(
      validatedSchema,
      // Bind mutation handler's execution
      (m) =>
        mutationHandler(
          // Mock request for handler reusing logic?
          // Or we should extract the execute function.
          // `mutationHandler` is a (req) -> Res.
          // We need direct access to `executeMutation`.
          // The `createMutationHandler` creates an executor internally?
          // Let's refactor or expose it.
          // Looking at lines 117+, we create handler, not executor.
          // But usually we can reuse the handler logic by constructing a fake Request?
          // Creating fake requests is expensive/hacky.
          // Ideally `createMutationHandler` should expose the logic.
          // However, for Phase 26 we can try to reuse the handlers by creating synthetic requests
          // OR (better) we should expose `executor` from `createDatafnServer` context if possible.
          // But `createDatafnServer` creates handlers via factory functions.
          // Let's look at `createMutationHandler`. It likely instantiates a `MutationExecutor`.
          // We should probably instantiate `QueryExecutor` and `MutationExecutor` centrally in `createDatafnServer`
          // and pass them to ANY handler (including REST).
          // But that's a refactor.
          // Alternative: The REST handler constructs a DFQL request and passes it to... where?
          // It calls `executeMutation` which returns `Promise<unknown>`.
          // If we don't refactor, we can simulate:
          new Request("http://localhost/datafn/mutation", {
            method: "POST",
            body: JSON.stringify(m),
          }),
        ).then(async (res) => {
          if (!res.ok) {
            // Parse error envelope
            const env = await res.json();
            if (!env.ok) throw env.error;
            return env.result;
          }
          const env = await res.json();
          return env.result; // Unwrap
        }),
      (q) =>
        queryHandler(
          new Request("http://localhost/datafn/query", {
            method: "POST",
            body: JSON.stringify(q),
          }),
        ).then(async (res) => {
          const env = await res.json();
          if (!env.ok) throw env.error;
          return env.result;
        }),
    );

    // Map REST routes to router format and apply auth if needed
    // REST wrappers are just alternative interfaces to mutation/query, so we check "mutation"/"query" action?
    // Or introduce "rest" action.
    // For granularity, let's map: GET -> "query", POST/PATCH/DELETE -> "mutation".
    for (const route of restRoutes) {
      const action = route.method === "GET" ? "query" : "mutation";
      routes.push({
        ...route,
        handler: withAuth(action as any, route.handler as any) as any,
      });
    }
  }

  // Create router
  const router = createRouter<TContext>({
    routes,
    basePath: "/",
  });

  return { router };
}
