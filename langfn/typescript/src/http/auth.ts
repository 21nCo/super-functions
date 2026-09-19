import {
  AuthenticationError,
  createAuthMiddleware,
  createBearerAuthMiddleware,
  type AuthProvider,
  type AuthSession
} from "@superfunctions/auth";
import type { Middleware } from "@superfunctions/http";

import { createErrorEnvelope } from "./validation.js";

export interface LangFnAuthOptions<TSession extends AuthSession = AuthSession> {
  provider?: AuthProvider<TSession>;
  validateBearerToken?: (token: string, request: Request) => Promise<TSession | null> | TSession | null;
  contextKey?: string;
  headerName?: string;
}

export function createLangFnAuthMiddleware<TSession extends AuthSession = AuthSession>(
  options?: LangFnAuthOptions<TSession>
): Middleware<Record<string, unknown>> {
  if (!options?.provider && !options?.validateBearerToken) {
    return async (_request, _context, next) => next();
  }

  const contextKey = options.contextKey ?? "auth";
  const middleware = options.provider
    ? createAuthMiddleware(options.provider, { contextKey })
    : createBearerAuthMiddleware({
        validateToken: (token, request) =>
          /^[A-Za-z0-9._~+\/-]+={0,}$/.test(token)
            ? options.validateBearerToken!(token, request)
            : null,
        contextKey,
        headerName: options.headerName
      });

  return async (request, context, next) => {
    try {
      return await middleware(request, context, next);
    } catch (error) {
      if (
        error instanceof AuthenticationError
        || (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 401)
      ) {
        return Response.json(createErrorEnvelope("AUTH_REQUIRED", "Authentication required"), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      throw error;
    }
  };
}
