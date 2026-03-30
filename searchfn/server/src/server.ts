import { createRouter, type Router, type Route } from "@superfunctions/http";
import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { errorResponse, parseJsonBody } from "./http/errors.js";
import { DEFAULT_LIMITS, type ServerLimits } from "./http/validation.js";
import { statusHandler, type ServerHealthSnapshot } from "./routes/status.js";
import { indexHandler } from "./routes/index.js";
import { searchHandler } from "./routes/search.js";
import { searchAllHandler } from "./routes/search-all.js";
import { removeHandler } from "./routes/remove.js";
import { clearHandler } from "./routes/clear.js";

export type ServerContext = Record<string, unknown>;

export interface SearchFnLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface SearchFnServerConfig<TContext = unknown> {
  adapter: SearchAdapter;
  basePath?: string;
  limits?: Partial<ServerLimits>;
  authorize?: (
    ctx: TContext,
    action: "status" | "index" | "search" | "searchAll" | "remove" | "clear",
    payload: unknown,
  ) => Promise<boolean> | boolean;
  logger?: SearchFnLogger;
}

export interface SearchFnServer<TContext = unknown> {
  router: Router<TContext>;
  close(): Promise<void>;
}

/** Redact sensitive keys from objects before logging. */
const SENSITIVE_KEYS = /apikey|password|secret|token|authorization|connectionstring/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function redactContext(value: Record<string, unknown>): Record<string, unknown> {
  return redact(value) as Record<string, unknown>;
}

function toErrorLogContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return {
    errorValue: String(error),
  };
}

export async function createSearchFnServer<TContext extends ServerContext = ServerContext>(
  config: SearchFnServerConfig<TContext>,
): Promise<SearchFnServer<TContext>> {
  const {
    adapter,
    basePath = "/searchfn",
    limits: limitsOverrides,
    authorize,
    logger,
  } = config;

  const limits: ServerLimits = { ...DEFAULT_LIMITS, ...limitsOverrides };
  const startTime = Date.now();
  const health: ServerHealthSnapshot = {
    state: "ok",
    failureCount: 0,
  };
  const markDegraded = (): void => {
    health.state = "degraded";
    health.failureCount += 1;
    if (health.degradedSince === undefined) {
      health.degradedSince = Date.now();
    }
  };

  type Action = "status" | "index" | "search" | "searchAll" | "remove" | "clear";

  // Wrap handler to inject auth + logging
  function wrap(
    action: Action,
    handler: (req: Request, ctx: TContext) => Promise<Response>,
  ): (req: Request, ctx: TContext) => Promise<Response> {
    return async (req: Request, ctx: TContext): Promise<Response> => {
      const start = Date.now();
      const logCtx: Record<string, unknown> = {
        operation: action,
        adapter: adapter.name,
      };

      logger?.debug("request.start", redactContext(logCtx));

      // Auth check
      if (authorize) {
        try {
          const payload = await getAuthorizationPayload(req, limits.maxPayloadBytes);
          const allowed = await authorize(ctx, action, payload);
          if (!allowed) {
            logger?.warn("authorization.denied", redactContext({ ...logCtx }));
            return errorResponse("FORBIDDEN", "Authorization denied");
          }
        } catch (error) {
          logger?.error("authorization.error", redactContext({
            ...logCtx,
            ...toErrorLogContext(error),
          }));
          return errorResponse("FORBIDDEN", "Authorization denied");
        }
      }

      try {
        const response = await handler(req, ctx);
        if (response.status >= 500) {
          markDegraded();
        }
        const durationMs = Date.now() - start;
        logger?.info("request.end", redactContext({
          ...logCtx,
          durationMs,
          success: response.status < 400,
          status: response.status,
        }));
        return response;
      } catch (error) {
        markDegraded();
        const durationMs = Date.now() - start;
        logger?.error("request.error", redactContext({
          ...logCtx,
          durationMs,
          success: false,
          errorCode: "INTERNAL",
          ...toErrorLogContext(error),
        }));
        return errorResponse("INTERNAL", "Unexpected server error");
      }
    };
  }

  const routes: Route<TContext>[] = [
    {
      method: "GET",
      path: `${basePath}/status`,
      handler: wrap("status", statusHandler(adapter, startTime, () => ({ ...health }))),
    },
    {
      method: "POST",
      path: `${basePath}/index`,
      handler: wrap("index", indexHandler(adapter, limits)),
    },
    {
      method: "POST",
      path: `${basePath}/search`,
      handler: wrap("search", searchHandler(adapter, limits)),
    },
    {
      method: "POST",
      path: `${basePath}/search-all`,
      handler: wrap("searchAll", searchAllHandler(adapter, limits)),
    },
    {
      method: "POST",
      path: `${basePath}/remove`,
      handler: wrap("remove", removeHandler(adapter, limits)),
    },
    {
      method: "POST",
      path: `${basePath}/clear`,
      handler: wrap("clear", clearHandler(adapter, limits)),
    },
  ];

  const router = createRouter<TContext>({
    routes,
    basePath: "/",
  });

  async function close(): Promise<void> {
    if (adapter.dispose) {
      await adapter.dispose();
    }
    logger?.info("server.close", { adapter: adapter.name });
  }

  return { router, close };
}

async function getAuthorizationPayload(
  req: Request,
  maxPayloadBytes: number,
): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") {
    return null;
  }

  const contentType = req.headers.get("content-type");
  if (contentType && !contentType.includes("application/json")) {
    return null;
  }

  const parsed = await parseJsonBody(req.clone(), maxPayloadBytes);
  if (!parsed.ok) {
    return null;
  }
  return parsed.data;
}
