import type { AuthSession } from "@superfunctions/auth";
import type { Middleware } from "@superfunctions/http";

import { createErrorEnvelope } from "./validation.js";

export interface CanonicalTenantContext {
  tenantId?: string;
  userId?: string;
  runId?: string;
  conversationId?: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  key: string;
  remaining?: number;
  retryAfterMs?: number;
}

export interface RateLimitProvider {
  consume(input: {
    key: string;
    routeId: string;
    tenantContext: CanonicalTenantContext;
    request: Request;
    session?: AuthSession;
  }): Promise<RateLimitDecision> | RateLimitDecision;
}

export function createLangFnRateLimitMiddleware(options: {
  provider?: RateLimitProvider;
  routeId: string;
  getTenantContext: (request: Request, context: Record<string, unknown>) => CanonicalTenantContext;
  contextKey?: string;
}): Middleware<Record<string, unknown>> {
  const contextKey = options.contextKey ?? "auth";
  return async (request, context, next) => {
    const tenantContext = options.getTenantContext(request, context);
    if (!options.provider) return next();
    const session = context[contextKey] as AuthSession | undefined;
    const key = [
      tenantContext.tenantId ?? "anonymous",
      tenantContext.userId ?? session?.subject.actorId ?? "anonymous",
      options.routeId
    ].join(":");

    const decision = await options.provider!.consume({
      key,
      routeId: options.routeId,
      tenantContext,
      request,
      session
    });
    context.rateLimit = decision;

    if (!decision.allowed) {
      return Response.json(
        createErrorEnvelope("RATE_LIMITED", "Rate limit exceeded", {
          key: decision.key,
          remaining: decision.remaining,
          retryAfterMs: decision.retryAfterMs
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            ...(decision.retryAfterMs !== undefined
              ? { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) }
              : {})
          }
        }
      );
    }

    return next();
  };
}
